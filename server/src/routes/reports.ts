import { Router } from 'express';
import { allow, auth, requireFeature, tid } from '../middleware/auth.js';
import { Attendance, Batch, Invoice, Payment, Student, Test } from '../models/index.js';
import { attendanceByStudent, feesByStudent, pct, scoresByStudent } from '../services/stats.js';
import { instituteMemo } from '../utils/cache.js';
import { addDays, monthKey, startOfDay, startOfMonth, ymd } from '../utils/dates.js';
import { ah } from '../utils/http.js';
import { pageArray, pageParams } from '../utils/paginate.js';
import type { Types } from 'mongoose';

const r = Router();
r.use(auth, allow('owner'));

type StudentRow = {
  _id: unknown; name: string; studentCode: string; batches: string;
  attendancePct: number | null; classes: number; avgScore: number | null; tests: number;
  feePaid: number; feePending: number; feeOverdue: number;
};

// Report figures are recomputed when attendance / marks / fees / students change, or after
// 2 minutes — not on every page, sort click or search keystroke.
const memo = instituteMemo<unknown>(2 * 60_000);
const studentRows = (instituteId: Types.ObjectId) => memo(instituteId, 'rows', () => computeStudentRows(instituteId)) as Promise<StudentRow[]>;

/** One row per active student with attendance, score and fee figures (3 grouped queries). */
async function computeStudentRows(instituteId: Types.ObjectId): Promise<StudentRow[]> {
  const students = await Student.find({ instituteId, status: 'active' }).select('name studentCode batchIds').populate('batchIds', 'name').sort({ name: 1, _id: 1 }).lean();
  const ids = students.map((s) => s._id);
  const [att, scores, fees] = await Promise.all([attendanceByStudent(instituteId, ids), scoresByStudent(instituteId, ids), feesByStudent(instituteId, ids)]);
  return students.map((s) => ({
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
  }));
}

const avg = (nums: (number | null)[]) => {
  const v = nums.filter((x): x is number => x != null);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
};

/**
 * Basic reports — available on every plan. Returns summaries only (no full student list);
 * the student table is paged separately by /reports/students.
 */
r.get(
  '/basic',
  ah(async (req, res) => {
    const instituteId = tid(req);
    res.json(await memo(instituteId, 'basic', () => basicReport(instituteId)));
  }),
);

async function basicReport(instituteId: Types.ObjectId) {
  {
    const rows = await studentRows(instituteId);

    const since = ymd(addDays(new Date(), -29));
    const docs = await Attendance.find({ instituteId, date: { $gte: since } }).select('date records.status').lean();
    const daily = Array.from({ length: 30 }, (_, i) => {
      const d = ymd(addDays(new Date(), i - 29));
      const recs = docs.filter((x) => x.date === d).flatMap((x) => x.records);
      return { date: d, present: recs.filter((x) => x.status !== 'absent').length, total: recs.length, pct: recs.length ? pct(recs.filter((x) => x.status !== 'absent').length, recs.length) : null };
    });

    const today = startOfDay();
    const [tot, overdue, month] = await Promise.all([
      Invoice.aggregate([{ $match: { instituteId } }, { $group: { _id: null, total: { $sum: '$amount' }, paid: { $sum: '$paidAmount' } } }]),
      Invoice.aggregate([{ $match: { instituteId, status: { $ne: 'paid' }, dueDate: { $lt: today } } }, { $group: { _id: null, s: { $sum: { $subtract: ['$amount', '$paidAmount'] } } } }]),
      Payment.aggregate([{ $match: { instituteId, status: { $ne: 'void' }, paidAt: { $gte: startOfMonth() } } }, { $group: { _id: null, s: { $sum: '$amount' } } }]),
    ]);

    return {
      summary: {
        students: rows.length,
        attendanceAvg: avg(rows.map((x) => x.attendancePct)),
        scoreAvg: avg(rows.map((x) => x.avgScore)),
        lowAttendance: rows.filter((x) => x.attendancePct != null && x.attendancePct < 75).length,
        overdueStudents: rows.filter((x) => x.feeOverdue > 0).length,
      },
      topScorers: rows.filter((x) => x.avgScore != null).sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0)).slice(0, 5),
      defaulters: rows.filter((x) => x.feeOverdue > 0).sort((a, b) => b.feeOverdue - a.feeOverdue).slice(0, 8),
      attendanceDaily: daily,
      fees: {
        total: tot[0]?.total ?? 0,
        collected: tot[0]?.paid ?? 0,
        pending: (tot[0]?.total ?? 0) - (tot[0]?.paid ?? 0),
        overdue: overdue[0]?.s ?? 0,
        thisMonth: month[0]?.s ?? 0,
      },
    };
  }
}

const SORT_KEYS = ['name', 'attendancePct', 'classes', 'avgScore', 'tests', 'feePaid', 'feePending', 'feeOverdue'] as const;

function filterAndSort(rows: StudentRow[], query: Record<string, unknown>) {
  const q = typeof query.search === 'string' ? query.search.trim().toLowerCase() : '';
  const key = (SORT_KEYS as readonly string[]).includes(String(query.sort)) ? (String(query.sort) as (typeof SORT_KEYS)[number]) : 'name';
  const dir = query.dir === 'desc' ? -1 : 1;
  const list = q ? rows.filter((x) => x.name.toLowerCase().includes(q) || x.studentCode.toLowerCase().includes(q) || x.batches.toLowerCase().includes(q)) : rows;
  return [...list].sort((a, b) => {
    const x = a[key], y = b[key];
    if (x == null && y == null) return 0;
    if (x == null) return 1; // blanks always last
    if (y == null) return -1;
    return (typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number)) * dir;
  });
}

/** Student report table — searchable, sortable, 20 per page. */
r.get(
  '/students',
  ah(async (req, res) => {
    res.json(pageArray(filterAndSort(await studentRows(tid(req)), req.query), pageParams(req.query)));
  }),
);

/** Every row (same search/sort) — only for the CSV download, never rendered on screen. */
r.get(
  '/students/export',
  ah(async (req, res) => {
    res.json(filterAndSort(await studentRows(tid(req)), req.query));
  }),
);

/** Advanced analytics — Premium. */
r.get(
  '/advanced',
  requireFeature('advancedReports'),
  ah(async (req, res) => {
    const instituteId = tid(req);
    res.json(await memo(instituteId, 'advanced', () => advancedReport(instituteId)));
  }),
);

/** All grouping happens in MongoDB — Node only receives a few hundred small rows. */
async function advancedReport(instituteId: Types.ObjectId) {
  const ms = startOfMonth();
  const yearAgo = new Date(ms.getFullYear(), ms.getMonth() - 11, 1);
  const since = ymd(addDays(new Date(), -180));
  const perDay = {
    n: { $size: '$records' },
    p: { $size: { $filter: { input: '$records', cond: { $ne: ['$$this.status', 'absent'] } } } },
  };
  const validResults = { $filter: { input: '$results', cond: { $and: [{ $ne: ['$$this.absent', true] }, { $isNumber: '$$this.marks' }] } } };
  const [monthlyPay, batches, byDate, byBatchAtt, byBatchTests, bySubject, counts] = await Promise.all([
    Payment.aggregate<{ _id: { y: number; m: number }; s: number; n: number }>([
      { $match: { instituteId, status: { $ne: 'void' }, paidAt: { $gte: yearAgo } } },
      { $group: { _id: monthKey('$paidAt'), s: { $sum: '$amount' }, n: { $sum: 1 } } },
    ]),
    Batch.find({ instituteId }).select('name subject teacherId').populate('teacherId', 'name').lean(),
    Attendance.aggregate<{ _id: string; n: number; p: number }>([
      { $match: { instituteId, date: { $gte: since } } },
      { $project: { date: 1, ...perDay } },
      { $group: { _id: '$date', n: { $sum: '$n' }, p: { $sum: '$p' } } },
    ]),
    Attendance.aggregate<{ _id: unknown; n: number; p: number }>([
      { $match: { instituteId, date: { $gte: since } } },
      { $project: { batchId: 1, ...perDay } },
      { $group: { _id: '$batchId', n: { $sum: '$n' }, p: { $sum: '$p' } } },
    ]),
    Test.aggregate<{ _id: unknown; tests: number; sum: number; cnt: number }>([
      { $match: { instituteId, status: { $ne: 'scheduled' } } },
      { $project: { batchId: 1, maxMarks: 1, v: validResults } },
      {
        $group: {
          _id: '$batchId',
          tests: { $sum: 1 },
          sum: { $sum: { $sum: { $map: { input: '$v', in: { $multiply: [{ $divide: ['$$this.marks', '$maxMarks'] }, 100] } } } } },
          cnt: { $sum: { $size: '$v' } },
        },
      },
    ]),
    Test.aggregate<{ _id: string; sum: number; cnt: number }>([
      { $match: { instituteId, status: { $ne: 'scheduled' } } },
      { $project: { subject: 1, maxMarks: 1, v: validResults } },
      {
        $group: {
          _id: '$subject',
          sum: { $sum: { $sum: { $map: { input: '$v', in: { $multiply: [{ $divide: ['$$this.marks', '$maxMarks'] }, 100] } } } } },
          cnt: { $sum: { $size: '$v' } },
        },
      },
    ]),
    Student.aggregate<{ _id: unknown; n: number }>([{ $match: { instituteId, status: 'active' } }, { $unwind: '$batchIds' }, { $group: { _id: '$batchIds', n: { $sum: 1 } } }]),
  ]);

  const revenue = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(yearAgo.getFullYear(), yearAgo.getMonth() + i, 1);
    const row = monthlyPay.find((m) => m._id.y === d.getFullYear() && m._id.m === d.getMonth() + 1);
    return { month: d.toLocaleString('en-IN', { month: 'short', year: '2-digit' }), amount: row?.s ?? 0, payments: row?.n ?? 0 };
  });

  const sumRange = (from: string, to: string) => {
    let n = 0, p = 0;
    for (const d of byDate) if (d._id >= from && d._id <= to) { n += d.n; p += d.p; }
    return n ? pct(p, n) : null;
  };
  const weekly = Array.from({ length: 12 }, (_, i) => {
    const end = addDays(new Date(), -7 * (11 - i));
    const start = addDays(end, -6);
    return { week: start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), pct: sumRange(ymd(start), ymd(end)) };
  });
  const monthlyAtt = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(ms.getFullYear(), ms.getMonth() - 5 + i, 1);
    const prefix = ymd(d).slice(0, 7);
    return { month: d.toLocaleString('en-IN', { month: 'short' }), pct: sumRange(`${prefix}-01`, `${prefix}-31`) };
  });

  const attBy = new Map(byBatchAtt.map((x) => [String(x._id), x]));
  const testBy = new Map(byBatchTests.map((x) => [String(x._id), x]));
  const countBy = new Map(counts.map((x) => [String(x._id), x.n]));
  const batchReport = batches.map((b) => {
    const a = attBy.get(String(b._id));
    const t = testBy.get(String(b._id));
    return {
      _id: b._id,
      name: b.name,
      subject: b.subject,
      teacher: (b.teacherId as unknown as { name?: string })?.name ?? '—',
      students: countBy.get(String(b._id)) ?? 0,
      attendancePct: a && a.n ? pct(a.p, a.n) : null,
      avgScore: t && t.cnt ? Math.round(t.sum / t.cnt) : null,
      tests: t?.tests ?? 0,
    };
  });
  const subjects = bySubject.filter((x) => x.cnt > 0).map((x) => ({ subject: x._id, avg: Math.round(x.sum / x.cnt) }));

  return { revenue, attendanceWeekly: weekly, attendanceMonthly: monthlyAtt, batches: batchReport, subjects };
}

export default r;
