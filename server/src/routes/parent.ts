import crypto from 'node:crypto';
import { Router } from 'express';
import { Types } from 'mongoose';
import { config } from '../config.js';
import { allow, auth, requireFeature } from '../middleware/auth.js';
import { Announcement, Attendance, Batch, Invoice, Payment, Student, Test } from '../models/index.js';
import { recordPayment } from '../services/payments.js';
import { hasFeature } from '../services/plan.js';
import { attendanceByStudent } from '../services/stats.js';
import { nextClass } from '../utils/dates.js';
import { HttpError, ah, oid } from '../utils/http.js';
import { receiptInstitute } from './fees.js';

const r = Router();
r.use(auth, allow('parent'), requireFeature('parentPortal'));

const own = (req: { user: { studentIds: Types.ObjectId[] } }, id: Types.ObjectId) => req.user.studentIds.some((s) => String(s) === String(id));

r.get(
  '/overview',
  ah(async (req, res) => {
    const instituteId = req.user.instituteId!;
    const students = await Student.find({ _id: { $in: req.user.studentIds }, instituteId }).select('-notes').lean();
    const att = await attendanceByStudent(instituteId, students.map((s) => s._id));
    // Children are loaded in parallel (a family with 3 kids = 1 round of queries, not 3).
    const children = await Promise.all(students.map(async (s) => {
      const [batches, attDocs, tests, invoices, payments] = await Promise.all([
        Batch.find({ _id: { $in: s.batchIds }, instituteId }).select('name subject days startTime endTime teacherId coTeacherIds').populate('teacherId', 'name').populate('coTeacherIds', 'name').lean(),
        Attendance.find({ instituteId, 'records.studentId': s._id }).select('date batchId records').sort({ date: -1 }).limit(60).populate('batchId', 'name').lean(),
        Test.find({ instituteId, status: 'published', 'results.studentId': s._id }).select('subject topic date maxMarks passPercent results').sort({ date: -1 }).limit(20).lean(),
        Invoice.find({ instituteId, studentId: s._id }).sort({ dueDate: 1 }).lean(),
        Payment.find({ instituteId, studentId: s._id }).select('amount method receiptNo paidAt status invoiceId balanceAfter').sort({ paidAt: -1 }).limit(50).lean(),
      ]);
      const results = tests.map((t) => {
        const x = t.results.find((y) => String(y.studentId) === String(s._id))!;
        return {
          _id: t._id, subject: t.subject, topic: t.topic, date: t.date, maxMarks: t.maxMarks, marks: x.marks, absent: x.absent, remark: x.remark,
          pct: x.absent || x.marks == null ? null : Math.round((x.marks / t.maxMarks) * 100),
          passPercent: t.passPercent ?? 40,
        };
      });
      const nc = nextClass(batches);
      const total = invoices.reduce((a, i) => a + i.amount, 0);
      const paid = invoices.reduce((a, i) => a + i.paidAmount, 0);
      return {
        student: { _id: s._id, name: s.name, studentCode: s.studentCode, course: s.course },
        batches: batches.map((b) => ({
          _id: b._id, name: b.name, subject: b.subject, days: b.days, startTime: b.startTime, endTime: b.endTime,
          teacher: [(b.teacherId as unknown as { name?: string })?.name, ...((b.coTeacherIds ?? []) as unknown as { name?: string }[]).map((t) => t?.name)].filter(Boolean).join(', '),
        })),
        attendance: {
          ...(att.get(String(s._id)) ?? { pct: 0, total: 0, present: 0 }),
          recent: attDocs.map((a) => ({ date: a.date, batch: (a.batchId as unknown as { name?: string })?.name, status: a.records.find((x) => String(x.studentId) === String(s._id))?.status })),
        },
        results,
        latestResult: results[0] ?? null,
        fees: { total, paid, pending: total - paid, invoices, payments },
        nextClass: nc ? { at: nc.at, batch: nc.batch.name, subject: nc.batch.subject } : null,
      };
    }));
    const batchIds = students.flatMap((s) => s.batchIds);
    const announcements = await Announcement.find({ instituteId, staffOnly: { $ne: true }, $or: [{ batchIds: { $size: 0 } }, { batchIds: { $in: batchIds } }] })
      .sort({ pinned: -1, createdAt: -1 })
      .limit(10)
      .lean();
    const onlinePay = config.demoPayments && (await hasFeature(req.institute!, 'onlinePayments'));
    res.json({ institute: { name: req.institute!.name, phone: req.institute!.phone, brandColor: req.institute!.brandColor, onlinePay }, children, announcements });
  }),
);

/** Online fee payment. Demo gateway — swap for Razorpay order + signature verification. */
r.post(
  '/pay',
  requireFeature('onlinePayments'),
  ah(async (req, res) => {
    if (!config.demoPayments) {
      throw new HttpError(503, 'Online payment is not available yet. Please pay at the institute office.');
    }
    const inv = await Invoice.findOne({ _id: oid(req.body?.invoiceId), instituteId: req.user.instituteId });
    if (!inv || !own(req, inv.studentId)) throw new HttpError(404, 'Invoice not found');
    const due = inv.amount - inv.paidAmount;
    if (due <= 0) throw new HttpError(400, 'This installment is already paid');
    const payment = await recordPayment({
      institute: req.institute!,
      invoiceId: inv._id,
      amount: due,
      method: 'online',
      reference: 'demo_' + crypto.randomBytes(8).toString('hex'),
      note: 'Paid via parent portal',
    });
    res.json({ ok: true, payment });
  }),
);

r.get(
  '/receipt/:id',
  ah(async (req, res) => {
    const p = await Payment.findOne({ _id: oid(req.params.id), instituteId: req.user.instituteId })
      .populate('studentId', 'name studentCode course parentName')
      .populate('invoiceId', 'title amount paidAmount dueDate')
      .lean();
    if (!p || !p.studentId || !own(req, (p.studentId as unknown as { _id: Types.ObjectId })._id)) throw new HttpError(404, 'Receipt not found');
    res.json({ payment: p, institute: receiptInstitute(req) });
  }),
);

export default r;
