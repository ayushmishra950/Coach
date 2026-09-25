import { Router } from 'express';
import { allow, auth, requireFeature, tid } from '../middleware/auth.js';
import { Attendance, Batch, Invoice, Payment, Student, Test } from '../models/index.js';
import { attendanceByStudent, feesByStudent, pct, scoresByStudent } from '../services/stats.js';
import { addDays, startOfMonth, ymd } from '../utils/dates.js';
import { ah } from '../utils/http.js';

const r = Router();
r.use(auth, allow('owner'));

/** Basic reports — available on every plan. */
r.get(
  '/basic',
  ah(async (req, res) => {
    const instituteId = tid(req);
    const students = await Student.find({ instituteId, status: 'active' }).select('name studentCode batchIds parentPhone').populate('batchIds', 'name').sort({ name: 1 }).lean();
    const ids = students.map((s) => s._id);
    const [att, scores, fees] = await Promise.all([attendanceByStudent(instituteId, ids), scoresByStudent(instituteId, ids), feesByStudent(instituteId, ids)]);

    const since = ymd(addDays(new Date(), -29));
    const docs = await Attendance.find({ instituteId, date: { $gte: since } }).lean();
    const daily = Array.from({ length: 30 }, (_, i) => {
      const d = ymd(addDays(new Date(), i - 29));
      const recs = docs.filter((x) => x.date === d).flatMap((x) => x.records);
      return { date: d, present: recs.filter((x) => x.status !== 'absent').length, total: recs.length, pct: recs.length ? pct(recs.filter((x) => x.status !== 'absent').length, recs.length) : null };
    });

    const now = new Date();
    const [tot, overdue, month] = await Promise.all([
      Invoice.aggregate([{ $match: { instituteId } }, { $group: { _id: null, total: { $sum: '$amount' }, paid: { $sum: '$paidAmount' } } }]),
      Invoice.aggregate([{ $match: { instituteId, status: { $ne: 'paid' }, dueDate: { $lt: now } } }, { $group: { _id: null, s: { $sum: { $subtract: ['$amount', '$paidAmount'] } } } }]),
      Payment.aggregate([{ $match: { instituteId, paidAt: { $gte: startOfMonth() } } }, { $group: { _id: null, s: { $sum: '$amount' } } }]),
    ]);

    res.json({
      students: students.map((s) => ({
        _id: s._id,
        name: s.name,
        studentCode: s.studentCode,
        batches: (s.batchIds as unknown as { name: string }[]).map((b) => b.name).join(', '),
        attendancePct: att.get(String(s._id))?.pct ?? null,
        classes: att.get(String(s._id))?.total ?? 0,
        avgScore: scores.get(String(s._id))?.avg ?? null,
        tests: scores.get(String(s._id))?.count ?? 0,
        feePaid: fees.get(String(s._id))?.paid ?? 0,
        feePending: fees.get(String(s._id))?.pending ?? 0,
        feeOverdue: fees.get(String(s._id))?.overdue ?? 0,
      })),
      attendanceDaily: daily,
      fees: {
        total: tot[0]?.total ?? 0,
        collected: tot[0]?.paid ?? 0,
        pending: (tot[0]?.total ?? 0) - (tot[0]?.paid ?? 0),
        overdue: overdue[0]?.s ?? 0,
        thisMonth: month[0]?.s ?? 0,
      },
    });
  }),
);

/** Advanced analytics — Premium. */
r.get(
  '/advanced',
  requireFeature('advancedReports'),
  ah(async (req, res) => {
    const instituteId = tid(req);
    const ms = startOfMonth();
    const yearAgo = new Date(ms.getFullYear(), ms.getMonth() - 11, 1);
    const [monthlyPay, batches, attAll, tests, counts] = await Promise.all([
      Payment.aggregate<{ _id: { y: number; m: number }; s: number; n: number }>([
        { $match: { instituteId, paidAt: { $gte: yearAgo } } },
        { $group: { _id: { y: { $year: '$paidAt' }, m: { $month: '$paidAt' } }, s: { $sum: '$amount' }, n: { $sum: 1 } } },
      ]),
      Batch.find({ instituteId }).populate('teacherId', 'name').lean(),
      Attendance.find({ instituteId, date: { $gte: ymd(addDays(new Date(), -180)) } }).lean(),
      Test.find({ instituteId, status: { $ne: 'scheduled' } }).lean(),
      Student.aggregate([{ $match: { instituteId, status: 'active' } }, { $unwind: '$batchIds' }, { $group: { _id: '$batchIds', n: { $sum: 1 } } }]),
    ]);

    const revenue = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(yearAgo.getFullYear(), yearAgo.getMonth() + i, 1);
      const row = monthlyPay.find((m) => m._id.y === d.getFullYear() && m._id.m === d.getMonth() + 1);
      return { month: d.toLocaleString('en-IN', { month: 'short', year: '2-digit' }), amount: row?.s ?? 0, payments: row?.n ?? 0 };
    });

    const weekly = Array.from({ length: 12 }, (_, i) => {
      const end = addDays(new Date(), -7 * (11 - i));
      const start = addDays(end, -6);
      const recs = attAll.filter((a) => a.date >= ymd(start) && a.date <= ymd(end)).flatMap((a) => a.records);
      return { week: start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), pct: recs.length ? pct(recs.filter((x) => x.status !== 'absent').length, recs.length) : null };
    });
    const monthlyAtt = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(ms.getFullYear(), ms.getMonth() - 5 + i, 1);
      const prefix = ymd(d).slice(0, 7);
      const recs = attAll.filter((a) => a.date.startsWith(prefix)).flatMap((a) => a.records);
      return { month: d.toLocaleString('en-IN', { month: 'short' }), pct: recs.length ? pct(recs.filter((x) => x.status !== 'absent').length, recs.length) : null };
    });

    const batchReport = batches.map((b) => {
      const recs = attAll.filter((a) => String(a.batchId) === String(b._id)).flatMap((a) => a.records);
      const bt = tests.filter((t) => String(t.batchId) === String(b._id));
      const valid = bt.flatMap((t) => t.results.filter((x) => !x.absent && x.marks != null).map((x) => ((x.marks as number) / t.maxMarks) * 100));
      return {
        _id: b._id,
        name: b.name,
        subject: b.subject,
        teacher: (b.teacherId as unknown as { name?: string })?.name ?? '—',
        students: counts.find((c) => String(c._id) === String(b._id))?.n ?? 0,
        attendancePct: recs.length ? pct(recs.filter((x) => x.status !== 'absent').length, recs.length) : null,
        avgScore: valid.length ? Math.round(valid.reduce((a, c) => a + c, 0) / valid.length) : null,
        tests: bt.length,
      };
    });

    const subjectMap: Record<string, number[]> = {};
    for (const t of tests) for (const x of t.results) if (!x.absent && x.marks != null) (subjectMap[t.subject] ??= []).push(((x.marks as number) / t.maxMarks) * 100);
    const subjects = Object.entries(subjectMap).map(([subject, v]) => ({ subject, avg: Math.round(v.reduce((a, c) => a + c, 0) / v.length) }));

    res.json({ revenue, attendanceWeekly: weekly, attendanceMonthly: monthlyAtt, batches: batchReport, subjects });
  }),
);

export default r;
