import { Router } from 'express';

import { allow, auth, requireFeature, tid } from '../middleware/auth.js';
import { Invoice, Payment, Student } from '../models/index.js';
import { notify } from '../services/notify.js';
import { inr, recordPayment } from '../services/payments.js';
import { runReminders } from '../services/reminders.js';
import { feesByStudent } from '../services/stats.js';
import { startOfMonth } from '../utils/dates.js';
import { HttpError, ah, oid, required } from '../utils/http.js';
import { createInstallments } from './students.js';

const r = Router();
r.use(auth, allow('owner'));

r.get(
  '/summary',
  ah(async (req, res) => {
    const instituteId = tid(req);
    const now = new Date();
    const monthStart = startOfMonth();
    const yearAgo = new Date(monthStart.getFullYear(), monthStart.getMonth() - 11, 1);
    const [totals, overdue, thisMonth, monthly, methods] = await Promise.all([
      Invoice.aggregate([{ $match: { instituteId } }, { $group: { _id: null, total: { $sum: '$amount' }, paid: { $sum: '$paidAmount' } } }]),
      Invoice.aggregate([
        { $match: { instituteId, status: { $ne: 'paid' }, dueDate: { $lt: now } } },
        { $group: { _id: null, s: { $sum: { $subtract: ['$amount', '$paidAmount'] } }, students: { $addToSet: '$studentId' } } },
      ]),
      Payment.aggregate([{ $match: { instituteId, paidAt: { $gte: monthStart } } }, { $group: { _id: null, s: { $sum: '$amount' }, n: { $sum: 1 } } }]),
      Payment.aggregate<{ _id: { y: number; m: number }; s: number }>([
        { $match: { instituteId, paidAt: { $gte: yearAgo } } },
        { $group: { _id: { y: { $year: '$paidAt' }, m: { $month: '$paidAt' } }, s: { $sum: '$amount' } } },
      ]),
      Payment.aggregate([{ $match: { instituteId, paidAt: { $gte: yearAgo } } }, { $group: { _id: '$method', s: { $sum: '$amount' } } }]),
    ]);
    res.json({
      total: totals[0]?.total ?? 0,
      collected: totals[0]?.paid ?? 0,
      pending: (totals[0]?.total ?? 0) - (totals[0]?.paid ?? 0),
      overdue: overdue[0]?.s ?? 0,
      overdueStudents: overdue[0]?.students.length ?? 0,
      collectedThisMonth: thisMonth[0]?.s ?? 0,
      paymentsThisMonth: thisMonth[0]?.n ?? 0,
      monthly: Array.from({ length: 12 }, (_, i) => {
        const d = new Date(yearAgo.getFullYear(), yearAgo.getMonth() + i, 1);
        const row = monthly.find((m) => m._id.y === d.getFullYear() && m._id.m === d.getMonth() + 1);
        return { month: d.toLocaleString('en-IN', { month: 'short' }), year: d.getFullYear(), amount: row?.s ?? 0 };
      }),
      methods: methods.map((m) => ({ method: m._id, amount: m.s })),
    });
  }),
);

/** Per-student fee roll-up — the main fees table. */
r.get(
  '/students',
  ah(async (req, res) => {
    const instituteId = tid(req);
    const { search, filter } = req.query as Record<string, string>;
    const q: Record<string, unknown> = { instituteId };
    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      q.$or = [{ name: rx }, { studentCode: rx }, { parentPhone: rx }];
    }
    const students = await Student.find(q).select('name studentCode parentName parentPhone status batchIds').populate('batchIds', 'name').sort({ name: 1 }).lean();
    const fees = await feesByStudent(instituteId, students.map((s) => s._id));
    let rows = students.map((s) => ({ ...s, fees: fees.get(String(s._id)) ?? { total: 0, paid: 0, pending: 0, overdue: 0, nextDue: null } }));
    if (filter === 'pending') rows = rows.filter((x) => x.fees.pending > 0);
    if (filter === 'overdue') rows = rows.filter((x) => x.fees.overdue > 0);
    if (filter === 'paid') rows = rows.filter((x) => x.fees.total > 0 && x.fees.pending === 0);
    if (filter === 'nostructure') rows = rows.filter((x) => x.fees.total === 0);
    res.json(rows);
  }),
);

r.get(
  '/invoices',
  ah(async (req, res) => {
    const instituteId = tid(req);
    const { status, studentId } = req.query as Record<string, string>;
    const q: Record<string, unknown> = { instituteId };
    if (studentId) q.studentId = oid(studentId);
    if (status === 'overdue') Object.assign(q, { status: { $ne: 'paid' }, dueDate: { $lt: new Date() } });
    else if (status === 'unpaid') q.status = { $ne: 'paid' };
    else if (status && status !== 'all') q.status = status;
    const invoices = await Invoice.find(q).populate('studentId', 'name studentCode parentPhone').sort({ dueDate: 1 }).limit(500).lean();
    res.json(invoices);
  }),
);

r.post(
  '/structure',
  ah(async (req, res) => {
    const instituteId = tid(req);
    required(req.body ?? {}, ['studentId', 'totalAmount']);
    const student = await Student.findOne({ _id: oid(req.body.studentId), instituteId });
    if (!student) throw new HttpError(404, 'Student not found');
    const total = Number(req.body.totalAmount);
    if (!(total > 0)) throw new HttpError(400, 'Enter a valid total amount');
    if (req.body.replace) {
      const paid = await Invoice.exists({ instituteId, studentId: student._id, paidAmount: { $gt: 0 } });
      if (paid) throw new HttpError(400, 'This student already has payments — add new installments instead of replacing.');
      await Invoice.deleteMany({ instituteId, studentId: student._id });
    }
    const docs = await createInstallments(
      instituteId,
      student._id,
      total,
      Number(req.body.installments) || 1,
      req.body.firstDueDate ? new Date(req.body.firstDueDate) : new Date(),
      Number(req.body.intervalMonths) || 3,
    );
    res.status(201).json(docs);
  }),
);

r.post(
  '/invoices',
  ah(async (req, res) => {
    const instituteId = tid(req);
    required(req.body ?? {}, ['studentId', 'title', 'amount', 'dueDate']);
    const student = await Student.findOne({ _id: oid(req.body.studentId), instituteId });
    if (!student) throw new HttpError(404, 'Student not found');
    const inv = await Invoice.create({ instituteId, studentId: student._id, title: req.body.title, amount: Number(req.body.amount), dueDate: new Date(req.body.dueDate) });
    res.status(201).json(inv);
  }),
);

r.put(
  '/invoices/:id',
  ah(async (req, res) => {
    const inv = await Invoice.findOne({ _id: oid(req.params.id), instituteId: tid(req) });
    if (!inv) throw new HttpError(404, 'Invoice not found');
    if (req.body.title) inv.title = req.body.title;
    if (req.body.dueDate) inv.dueDate = new Date(req.body.dueDate);
    if (req.body.amount !== undefined) {
      const amount = Number(req.body.amount);
      if (amount < inv.paidAmount) throw new HttpError(400, 'Amount cannot be less than what is already paid');
      inv.amount = amount;
      inv.status = inv.paidAmount >= amount ? 'paid' : inv.paidAmount > 0 ? 'partial' : 'pending';
    }
    await inv.save();
    res.json(inv);
  }),
);

r.delete(
  '/invoices/:id',
  ah(async (req, res) => {
    const inv = await Invoice.findOne({ _id: oid(req.params.id), instituteId: tid(req) });
    if (!inv) throw new HttpError(404, 'Invoice not found');
    if (inv.paidAmount > 0) throw new HttpError(400, 'Cannot delete an invoice that has payments');
    await inv.deleteOne();
    res.json({ ok: true });
  }),
);

r.post(
  '/invoices/:id/remind',
  ah(async (req, res) => {
    const inv = await Invoice.findOne({ _id: oid(req.params.id), instituteId: tid(req) });
    if (!inv || inv.status === 'paid') throw new HttpError(400, 'Nothing pending on this invoice');
    const s = await Student.findById(inv.studentId).lean();
    if (!s) throw new HttpError(404, 'Student not found');
    await notify({
      institute: req.institute!,
      type: 'fee',
      audience: 'parent',
      studentId: s._id,
      title: 'Fee reminder',
      message: `Reminder: ${s.name}'s ${inv.title} of ${inr(inv.amount - inv.paidAmount)} is due on ${inv.dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}.`,
      contact: { phone: s.parentPhone ?? undefined, email: s.parentEmail ?? undefined },
    });
    inv.lastReminderAt = new Date();
    inv.reminderCount = (inv.reminderCount ?? 0) + 1;
    await inv.save();
    res.json({ ok: true });
  }),
);

r.post('/reminders/run', requireFeature('feeReminders'), ah(async (req, res) => res.json({ sent: await runReminders(req.institute!) })));

r.post(
  '/payments',
  ah(async (req, res) => {
    required(req.body ?? {}, ['invoiceId', 'amount']);
    const payment = await recordPayment({
      institute: req.institute!,
      invoiceId: oid(req.body.invoiceId),
      amount: Number(req.body.amount),
      method: ['cash', 'upi', 'bank', 'card', 'online'].includes(req.body.method) ? req.body.method : 'cash',
      reference: req.body.reference,
      note: req.body.note,
      collectedBy: req.user.id,
    });
    res.status(201).json(payment);
  }),
);

r.get(
  '/payments',
  ah(async (req, res) => {
    const instituteId = tid(req);
    const q: Record<string, unknown> = { instituteId };
    const { from, to, method } = req.query as Record<string, string>;
    if (from || to) q.paidAt = { ...(from && { $gte: new Date(from) }), ...(to && { $lte: new Date(to + 'T23:59:59') }) };
    if (method) q.method = method;
    res.json(await Payment.find(q).populate('studentId', 'name studentCode').populate('invoiceId', 'title').sort({ paidAt: -1 }).limit(500).lean());
  }),
);

r.get(
  '/payments/:id',
  ah(async (req, res) => {
    const p = await Payment.findOne({ _id: oid(req.params.id), instituteId: tid(req) })
      .populate('studentId', 'name studentCode parentName course')
      .populate('invoiceId', 'title amount paidAmount dueDate')
      .lean();
    if (!p) throw new HttpError(404, 'Payment not found');
    res.json({ payment: p, institute: { name: req.institute!.name, phone: req.institute!.phone, address: req.institute!.address, city: req.institute!.city } });
  }),
);

export default r;
