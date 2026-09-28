import { Router, type Request } from 'express';

import { allow, auth, requireFeature, tid } from '../middleware/auth.js';
import { Invoice, Payment, Student } from '../models/index.js';
import { audit } from '../services/audit.js';
import { notify } from '../services/notify.js';
import { inr, recordPayment, voidPayment } from '../services/payments.js';
import { runRemindersLocked } from '../services/reminders.js';
import { feesByStudent } from '../services/stats.js';
import { bumpData } from '../utils/cache.js';
import { localDayStart, monthKey, parseDate, startOfDay, startOfMonth } from '../utils/dates.js';
import { HttpError, ah, oid, required, str } from '../utils/http.js';
import { pageArray, pageParams, paged } from '../utils/paginate.js';
import { createInstallments } from './students.js';

const r = Router();
r.use(auth, allow('owner'));

r.get(
  '/summary',
  ah(async (req, res) => {
    const instituteId = tid(req);
    const now = startOfDay(); // overdue = due date has fully passed
    const monthStart = startOfMonth();
    const valid = { status: { $ne: 'void' } };
    const yearAgo = new Date(monthStart.getFullYear(), monthStart.getMonth() - 11, 1);
    const [totals, overdue, thisMonth, monthly, methods] = await Promise.all([
      Invoice.aggregate([{ $match: { instituteId } }, { $group: { _id: null, total: { $sum: '$amount' }, paid: { $sum: '$paidAmount' } } }]),
      Invoice.aggregate([
        { $match: { instituteId, status: { $ne: 'paid' }, dueDate: { $lt: now } } },
        { $group: { _id: null, s: { $sum: { $subtract: ['$amount', '$paidAmount'] } }, students: { $addToSet: '$studentId' } } },
      ]),
      Payment.aggregate([{ $match: { instituteId, ...valid, paidAt: { $gte: monthStart } } }, { $group: { _id: null, s: { $sum: '$amount' }, n: { $sum: 1 } } }]),
      Payment.aggregate<{ _id: { y: number; m: number }; s: number }>([
        { $match: { instituteId, ...valid, paidAt: { $gte: yearAgo } } },
        { $group: { _id: monthKey('$paidAt'), s: { $sum: '$amount' } } },
      ]),
      Payment.aggregate([{ $match: { instituteId, ...valid, paidAt: { $gte: yearAgo } } }, { $group: { _id: '$method', s: { $sum: '$amount' } } }]),
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

/**
 * Per-student fee roll-up — the main fees table, 20 per page.
 * The fee filters (pending / overdue / paid / no structure) depend on invoice totals, so one
 * grouped aggregation works out the matching student ids; only the 20 on the page are loaded.
 */
r.get(
  '/students',
  ah(async (req, res) => {
    const instituteId = tid(req);
    const search = str(req.query.search);
    const filter = str(req.query.filter);
    const p = pageParams(req.query);
    const q: Record<string, unknown> = { instituteId };
    if (search) {
      const rx = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      q.$or = [{ name: rx }, { studentCode: rx }, { parentPhone: rx }];
    }
    const empty = { total: 0, paid: 0, pending: 0, overdue: 0, nextDue: null };
    let rows: { _id: unknown; name: string }[];
    let fees: Awaited<ReturnType<typeof feesByStudent>>;
    let total: number;

    if (filter && filter !== 'all') {
      // Fee-state filter: roll up every student's invoices once, keep matching ids, then page.
      const all = await Student.find(q).select('_id name').sort({ name: 1, _id: 1 }).lean();
      const allFees = await feesByStudent(instituteId);
      const match = all.filter((st) => {
        const f = allFees.get(String(st._id)) ?? empty;
        if (filter === 'pending') return f.pending > 0;
        if (filter === 'overdue') return f.overdue > 0;
        if (filter === 'paid') return f.total > 0 && f.pending === 0;
        if (filter === 'nostructure') return f.total === 0;
        return true;
      });
      const pg = pageArray(match, p);
      total = pg.total;
      const byId = new Map((await Student.find({ _id: { $in: pg.items.map((x) => x._id) } }).select('name studentCode parentName parentPhone status batchIds').populate('batchIds', 'name').lean()).map((x) => [String(x._id), x]));
      rows = pg.items.map((x) => byId.get(String(x._id))!).filter(Boolean);
      fees = allFees;
    } else {
      const [list, count] = await Promise.all([
        Student.find(q).select('name studentCode parentName parentPhone status batchIds').populate('batchIds', 'name').sort({ name: 1, _id: 1 }).skip(p.skip).limit(p.limit).lean(),
        Student.countDocuments(q),
      ]);
      rows = list;
      total = count;
      fees = await feesByStudent(instituteId, list.map((x) => x._id));
    }
    res.json(paged(rows.map((x) => ({ ...x, fees: fees.get(String(x._id)) ?? empty })), total, p));
  }),
);

r.get(
  '/invoices',
  ah(async (req, res) => {
    const instituteId = tid(req);
    const status = str(req.query.status);
    const studentId = str(req.query.studentId);
    const q: Record<string, unknown> = { instituteId };
    if (studentId) q.studentId = oid(studentId);
    if (status === 'overdue') Object.assign(q, { status: { $ne: 'paid' }, dueDate: { $lt: startOfDay() } });
    else if (status === 'unpaid') q.status = { $ne: 'paid' };
    else if (status === 'pending' || status === 'partial' || status === 'paid') q.status = status;
    const p = pageParams(req.query);
    const [invoices, total] = await Promise.all([
      Invoice.find(q).populate('studentId', 'name studentCode parentPhone').sort({ dueDate: 1, _id: 1 }).skip(p.skip).limit(p.limit).lean(),
      Invoice.countDocuments(q),
    ]);
    res.json(paged(invoices, total, p));
  }),
);

r.post(
  '/structure',
  ah(async (req, res) => {
    const instituteId = tid(req);
    required(req.body ?? {}, ['studentId', 'totalAmount']);
    const student = await Student.findOne({ _id: oid(req.body.studentId), instituteId });
    if (!student) throw new HttpError(404, 'Student not found');
    const total = Math.round(Number(req.body.totalAmount));
    if (!(total > 0) || total > 10_000_000) throw new HttpError(400, 'Enter a valid total amount');
    const count = Math.max(1, Math.min(12, Math.round(Number(req.body.installments) || 1)));
    if (total < count) throw new HttpError(400, 'The total is too small for that many installments');
    const firstDue = req.body.firstDueDate ? parseDate(req.body.firstDueDate, 'First due date') : new Date();
    if (req.body.replace) {
      const paid = await Invoice.exists({ instituteId, studentId: student._id, paidAmount: { $gt: 0 } });
      const receipts = await Payment.exists({ instituteId, studentId: student._id });
      if (paid || receipts) throw new HttpError(400, 'This student already has payments or receipts on record — edit the installments or add new ones instead of replacing.');
      await Invoice.deleteMany({ instituteId, studentId: student._id });
    }
    const docs = await createInstallments(instituteId, student._id, total, count, firstDue, Number(req.body.intervalMonths) || 3);
    bumpData(instituteId);
    audit(req, 'fees.structure', 'Student', student._id, `${student.name}: ${inr(total)} in ${count} installment(s)${req.body.replace ? ' (replaced)' : ''}`);
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
    const title = String(req.body.title).trim().slice(0, 80);
    const amount = Math.round(Number(req.body.amount));
    if (!title) throw new HttpError(400, 'Enter a title, e.g. "Books fee"');
    if (!(amount > 0) || amount > 10_000_000) throw new HttpError(400, 'Enter a valid amount');
    const inv = await Invoice.create({ instituteId, studentId: student._id, title, amount, dueDate: parseDate(req.body.dueDate, 'Due date') });
    bumpData(instituteId);
    audit(req, 'invoice.create', 'Invoice', inv._id, `${student.name}: ${title} ${inr(amount)}`);
    res.status(201).json(inv);
  }),
);

r.put(
  '/invoices/:id',
  ah(async (req, res) => {
    const inv = await Invoice.findOne({ _id: oid(req.params.id), instituteId: tid(req) });
    if (!inv) throw new HttpError(404, 'Invoice not found');
    const changes: string[] = [];
    if (req.body?.title !== undefined) {
      const t = String(req.body.title).trim().slice(0, 80);
      if (!t) throw new HttpError(400, 'Title cannot be empty');
      if (t !== inv.title) changes.push(`title "${inv.title}" → "${t}"`);
      inv.title = t;
    }
    if (req.body?.dueDate) {
      const d = parseDate(req.body.dueDate, 'Due date');
      if (d.getTime() !== inv.dueDate.getTime()) changes.push(`due ${inv.dueDate.toLocaleDateString('en-IN')} → ${d.toLocaleDateString('en-IN')}`);
      inv.dueDate = d;
    }
    if (req.body?.amount !== undefined) {
      const amount = Math.round(Number(req.body.amount));
      if (!Number.isFinite(amount) || amount < 0 || amount > 10_000_000) throw new HttpError(400, 'Enter a valid amount');
      if (amount < inv.paidAmount) throw new HttpError(400, `Amount cannot be less than what is already paid (${inr(inv.paidAmount)})`);
      if (amount !== inv.amount) changes.push(`amount ${inr(inv.amount)} → ${inr(amount)}${req.body.reason ? ` (${String(req.body.reason).slice(0, 120)})` : ''}`);
      inv.amount = amount;
      inv.status = inv.paidAmount >= amount ? 'paid' : inv.paidAmount > 0 ? 'partial' : 'pending';
    }
    await inv.save();
    bumpData(inv.instituteId);
    if (changes.length) audit(req, 'invoice.edit', 'Invoice', inv._id, changes.join('; '));
    res.json(inv);
  }),
);

r.delete(
  '/invoices/:id',
  ah(async (req, res) => {
    const inv = await Invoice.findOne({ _id: oid(req.params.id), instituteId: tid(req) });
    if (!inv) throw new HttpError(404, 'Invoice not found');
    if (inv.paidAmount > 0) throw new HttpError(400, 'Cannot delete an invoice that has payments');
    if (await Payment.exists({ instituteId: inv.instituteId, invoiceId: inv._id })) throw new HttpError(400, 'This invoice has receipts on record (even cancelled ones), so it can’t be deleted. Set its amount to what was paid instead.');
    await inv.deleteOne();
    bumpData(inv.instituteId);
    audit(req, 'invoice.delete', 'Invoice', inv._id, `${inv.title} ${inr(inv.amount)}`);
    res.json({ ok: true });
  }),
);

r.post(
  '/invoices/:id/remind',
  ah(async (req, res) => {
    const inv = await Invoice.findOne({ _id: oid(req.params.id), instituteId: tid(req) });
    if (!inv || inv.status === 'paid') throw new HttpError(400, 'Nothing pending on this invoice');
    const s = await Student.findOne({ _id: inv.studentId, instituteId: inv.instituteId }).lean();
    if (!s) throw new HttpError(404, 'Student not found');
    if (s.status !== 'active') throw new HttpError(400, `${s.name} is inactive — reminders are not sent for inactive students.`);
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

r.post(
  '/reminders/run',
  requireFeature('feeReminders'),
  ah(async (req, res) => {
    // Same lock as the scheduler, so a manual run and the automatic one can't double-send.
    const sent = await runRemindersLocked(req.institute!);
    if (sent === null) throw new HttpError(409, 'Reminders are already being sent right now. Please try again in a minute.');
    res.json({ sent });
  }),
);

r.post(
  '/payments',
  ah(async (req, res) => {
    required(req.body ?? {}, ['invoiceId', 'amount']);
    const paidAt = req.body.paidAt ? parseDate(req.body.paidAt, 'Payment date') : undefined;
    const payment = await recordPayment({
      institute: req.institute!,
      invoiceId: oid(req.body.invoiceId),
      amount: Number(req.body.amount),
      method: ['cash', 'upi', 'bank', 'card'].includes(req.body.method) ? req.body.method : 'cash',
      reference: str(req.body.reference),
      note: str(req.body.note),
      collectedBy: req.user.id,
      paidAt,
    });
    if (paidAt && payment.paidAt && payment.paidAt.toDateString() !== new Date().toDateString()) {
      audit(req, 'payment.backdated', 'Payment', payment._id, `${payment.receiptNo} dated ${payment.paidAt.toLocaleDateString('en-IN')}`);
    }
    res.status(201).json(payment);
  }),
);

/** Cancel a wrong receipt (typo in amount, duplicate entry). Kept on record as "cancelled". */
r.post(
  '/payments/:id/void',
  ah(async (req, res) => {
    const payment = await voidPayment({ institute: req.institute!, paymentId: oid(req.params.id), reason: String(req.body?.reason ?? ''), by: req.user.id });
    audit(req, 'payment.void', 'Payment', payment._id, `${payment.receiptNo} · ${inr(payment.amount)} · ${payment.voidReason}`);
    res.json(payment);
  }),
);

function paymentFilter(req: Request) {
  const q: Record<string, unknown> = { instituteId: tid(req) };
  const from = str(req.query.from);
  const to = str(req.query.to);
  const method = str(req.query.method);
  // Whole local days: "from" starts at 00:00 and "to" ends at 23:59:59.999 in the app time zone.
  const toEnd = to ? new Date(localDayStart(to).getTime() + 86400000 - 1) : undefined;
  if (from || to) q.paidAt = { ...(from && { $gte: localDayStart(from) }), ...(toEnd && { $lte: toEnd }) };
  if (method && ['cash', 'upi', 'bank', 'card', 'online'].includes(method)) q.method = method;
  if (req.query.status === 'void') q.status = 'void';
  return q;
}

r.get(
  '/payments',
  ah(async (req, res) => {
    const q = paymentFilter(req);
    const p = pageParams(req.query);
    const [items, total, sum] = await Promise.all([
      Payment.find(q).populate('studentId', 'name studentCode').populate('invoiceId', 'title').sort({ paidAt: -1, _id: -1 }).skip(p.skip).limit(p.limit).lean(),
      Payment.countDocuments(q),
      // Cancelled receipts are listed but never counted as money received.
      Payment.aggregate([{ $match: { ...q, status: q.status ?? { $ne: 'void' } } }, { $group: { _id: null, s: { $sum: '$amount' } } }]),
    ]);
    // `sum` = total collected across ALL matching payments (not just this page).
    res.json({ ...paged(items, total, p), sum: sum[0]?.s ?? 0 });
  }),
);

/** Every matching payment — only for the CSV download (never rendered as a list). */
r.get(
  '/payments/export',
  ah(async (req, res) => {
    res.json(await Payment.find(paymentFilter(req)).populate('studentId', 'name studentCode').populate('invoiceId', 'title').sort({ paidAt: -1, _id: -1 }).lean());
  }),
);

r.get(
  '/payments/:id',
  ah(async (req, res) => {
    const p = await Payment.findOne({ _id: oid(req.params.id), instituteId: tid(req) })
      .populate('studentId', 'name studentCode parentName course')
      .populate('invoiceId', 'title amount paidAmount dueDate')
      .populate('collectedBy', 'name')
      .lean();
    if (!p) throw new HttpError(404, 'Payment not found');
    res.json({ payment: p, institute: receiptInstitute(req) });
  }),
);

/** Institute details printed on a receipt. */
export function receiptInstitute(req: Request) {
  const i = req.institute!;
  return { name: i.name, phone: i.phone, email: i.email, address: i.address, city: i.city, gstin: i.gstin, logoText: i.logoText, brandColor: i.brandColor };
}

export default r;
