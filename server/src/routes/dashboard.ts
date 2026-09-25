import { Router } from 'express';
import { Types } from 'mongoose';
import { allow, auth, scopedBatchIds, tid } from '../middleware/auth.js';
import { Announcement, Attendance, Batch, Invoice, Payment, Student, Test, User } from '../models/index.js';
import { absenceStreaks, pct } from '../services/stats.js';
import { DAYS, addDays, startOfMonth, ymd } from '../utils/dates.js';
import { ah } from '../utils/http.js';

const r = Router();
r.use(auth, allow('owner', 'teacher'));

async function todaysClasses(instituteId: Types.ObjectId, batchIds: Types.ObjectId[] | null) {
  const today = DAYS[new Date().getDay()];
  const batches = await Batch.find({ instituteId, active: true, days: today, ...(batchIds ? { _id: { $in: batchIds } } : {}) })
    .populate('teacherId', 'name')
    .sort({ startTime: 1 })
    .lean();
  const marked = await Attendance.find({ instituteId, date: ymd(), batchId: { $in: batches.map((b) => b._id) } }).lean();
  const counts = await Student.aggregate<{ _id: Types.ObjectId; n: number }>([
    { $match: { instituteId, status: 'active', batchIds: { $in: batches.map((b) => b._id) } } },
    { $unwind: '$batchIds' },
    { $group: { _id: '$batchIds', n: { $sum: 1 } } },
  ]);
  return batches.map((b) => {
    const a = marked.find((m) => String(m.batchId) === String(b._id));
    const present = a?.records.filter((x) => x.status !== 'absent').length ?? 0;
    return {
      _id: b._id,
      name: b.name,
      subject: b.subject,
      color: b.color,
      startTime: b.startTime,
      endTime: b.endTime,
      room: b.room,
      teacher: (b.teacherId as unknown as { name?: string })?.name,
      students: counts.find((c) => String(c._id) === String(b._id))?.n ?? 0,
      marked: !!a,
      present,
      total: a?.records.length ?? 0,
    };
  });
}

async function testsNeedingMarks(instituteId: Types.ObjectId, batchIds: Types.ObjectId[] | null) {
  return Test.find({
    instituteId,
    status: 'scheduled',
    date: { $lte: new Date() },
    ...(batchIds ? { batchId: { $in: batchIds } } : {}),
  })
    .populate('batchId', 'name')
    .sort({ date: -1 })
    .lean();
}

r.get(
  '/',
  ah(async (req, res) => {
    const instituteId = tid(req);
    const batchIds = await scopedBatchIds(req);
    const threshold = req.institute?.settings?.absentAlertAfter ?? 3;

    const [classes, pendingTests, streaks] = await Promise.all([
      todaysClasses(instituteId, batchIds),
      testsNeedingMarks(instituteId, batchIds),
      absenceStreaks(instituteId, threshold, batchIds),
    ]);
    const streakStudents = await Student.find({ _id: { $in: streaks.map((s) => new Types.ObjectId(s.studentId)) }, status: 'active' })
      .select('name studentCode parentPhone')
      .lean();
    const absentAlerts = streaks
      .map((s) => ({ ...s, student: streakStudents.find((x) => String(x._id) === s.studentId) }))
      .filter((s) => s.student);

    // Attendance trend (last 14 days)
    const since = ymd(addDays(new Date(), -13));
    const att = await Attendance.find({ instituteId, date: { $gte: since }, ...(batchIds ? { batchId: { $in: batchIds } } : {}) }).lean();
    const trend: { date: string; pct: number | null }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = ymd(addDays(new Date(), -i));
      const recs = att.filter((a) => a.date === d).flatMap((a) => a.records);
      trend.push({ date: d, pct: recs.length ? pct(recs.filter((x) => x.status !== 'absent').length, recs.length) : null });
    }
    const todayRecs = att.filter((a) => a.date === ymd()).flatMap((a) => a.records);
    const todayAttendance = { present: todayRecs.filter((x) => x.status !== 'absent').length, total: todayRecs.length };

    if (req.user.role === 'teacher') {
      const myStudents = await Student.countDocuments({ instituteId, status: 'active', batchIds: { $in: batchIds } });
      const recentTests = await Test.find({ instituteId, batchId: { $in: batchIds }, status: { $ne: 'scheduled' } })
        .populate('batchId', 'name')
        .sort({ date: -1 })
        .limit(5)
        .lean();
      return res.json({
        role: 'teacher',
        counts: { batches: batchIds!.length, students: myStudents, testsPending: pendingTests.length },
        todayAttendance,
        classes,
        pendingTests,
        absentAlerts,
        trend,
        recentTests: recentTests.map((t) => ({
          ...t,
          avg: pct(
            t.results.filter((x) => !x.absent && x.marks != null).reduce((s, x) => s + (x.marks ?? 0), 0),
            t.maxMarks * Math.max(1, t.results.filter((x) => !x.absent && x.marks != null).length),
          ),
        })),
      });
    }

    const monthStart = startOfMonth();
    const nextMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
    const [students, teachers, batches, collectedAgg, monthDueAgg, totalsAgg, pendingStudents, overdue, recentPayments, upcoming, announcements] =
      await Promise.all([
        Student.countDocuments({ instituteId, status: 'active' }),
        User.countDocuments({ instituteId, role: 'teacher', active: true }),
        Batch.countDocuments({ instituteId, active: true }),
        Payment.aggregate([{ $match: { instituteId, paidAt: { $gte: monthStart } } }, { $group: { _id: null, s: { $sum: '$amount' } } }]),
        Invoice.aggregate([
          { $match: { instituteId, status: { $ne: 'paid' }, dueDate: { $lt: nextMonth } } },
          { $group: { _id: null, s: { $sum: { $subtract: ['$amount', '$paidAmount'] } } } },
        ]),
        Invoice.aggregate([{ $match: { instituteId } }, { $group: { _id: null, total: { $sum: '$amount' }, paid: { $sum: '$paidAmount' } } }]),
        Invoice.distinct('studentId', { instituteId, status: { $ne: 'paid' }, dueDate: { $lt: nextMonth } }),
        Invoice.countDocuments({ instituteId, status: { $ne: 'paid' }, dueDate: { $lt: new Date() } }),
        Payment.find({ instituteId }).sort({ paidAt: -1 }).limit(6).populate('studentId', 'name studentCode').lean(),
        Invoice.find({ instituteId, status: { $ne: 'paid' }, dueDate: { $gte: new Date(), $lte: addDays(new Date(), 14) } })
          .sort({ dueDate: 1 })
          .limit(6)
          .populate('studentId', 'name studentCode')
          .lean(),
        Announcement.find({ instituteId }).sort({ pinned: -1, createdAt: -1 }).limit(3).lean(),
      ]);

    // Collection for last 6 months
    const sixAgo = new Date(monthStart.getFullYear(), monthStart.getMonth() - 5, 1);
    const monthly = await Payment.aggregate<{ _id: { y: number; m: number }; s: number }>([
      { $match: { instituteId, paidAt: { $gte: sixAgo } } },
      { $group: { _id: { y: { $year: '$paidAt' }, m: { $month: '$paidAt' } }, s: { $sum: '$amount' } } },
    ]);
    const collection = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(sixAgo.getFullYear(), sixAgo.getMonth() + i, 1);
      const row = monthly.find((m) => m._id.y === d.getFullYear() && m._id.m === d.getMonth() + 1);
      return { month: d.toLocaleString('en-IN', { month: 'short' }), amount: row?.s ?? 0 };
    });

    res.json({
      role: 'owner',
      counts: { students, teachers, batches },
      todayAttendance,
      fees: {
        collectedThisMonth: collectedAgg[0]?.s ?? 0,
        pendingThisMonth: monthDueAgg[0]?.s ?? 0,
        total: totalsAgg[0]?.total ?? 0,
        collected: totalsAgg[0]?.paid ?? 0,
        pending: (totalsAgg[0]?.total ?? 0) - (totalsAgg[0]?.paid ?? 0),
      },
      actions: {
        pendingFeeStudents: pendingStudents.length,
        overdueInvoices: overdue,
        absentAlerts: absentAlerts.length,
        testsNeedingMarks: pendingTests.length,
      },
      absentAlerts: absentAlerts.slice(0, 6),
      pendingTests: pendingTests.slice(0, 5),
      classes,
      trend,
      collection,
      recentPayments,
      upcoming,
      announcements,
    });
  }),
);

export default r;
