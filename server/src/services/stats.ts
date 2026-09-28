import { Types } from 'mongoose';
import { Attendance, Invoice, Test } from '../models/index.js';
import { addDays, startOfDay, ymd } from '../utils/dates.js';

type Id = Types.ObjectId;
const key = (id: unknown) => String(id);

export async function attendanceByStudent(instituteId: Id, studentIds?: Id[], since?: string) {
  const match: Record<string, unknown> = { instituteId };
  if (since) match.date = { $gte: since };
  // Filter on the student BEFORE unwinding (uses the records.studentId index), so a page of
  // 20 students reads only their class days instead of the institute's whole history.
  if (studentIds) match['records.studentId'] = { $in: studentIds };
  const rows = await Attendance.aggregate<{ _id: Id; total: number; present: number }>([
    { $match: match },
    { $project: { records: 1 } },
    { $unwind: '$records' },
    ...(studentIds ? [{ $match: { 'records.studentId': { $in: studentIds } } }] : []),
    {
      $group: {
        _id: '$records.studentId',
        total: { $sum: 1 },
        present: { $sum: { $cond: [{ $in: ['$records.status', ['present', 'late']] }, 1, 0] } },
      },
    },
  ]);
  const map = new Map<string, { total: number; present: number; pct: number }>();
  for (const r of rows) map.set(key(r._id), { total: r.total, present: r.present, pct: r.total ? Math.round((r.present / r.total) * 100) : 0 });
  return map;
}

export async function scoresByStudent(instituteId: Id, studentIds?: Id[]) {
  const rows = await Test.aggregate<{ _id: Id; avg: number; count: number }>([
    { $match: { instituteId, status: { $in: ['graded', 'published'] }, ...(studentIds ? { 'results.studentId': { $in: studentIds } } : {}) } },
    { $project: { maxMarks: 1, results: 1 } },
    { $unwind: '$results' },
    { $match: { 'results.absent': { $ne: true }, 'results.marks': { $type: 'number' }, ...(studentIds ? { 'results.studentId': { $in: studentIds } } : {}) } },
    { $group: { _id: '$results.studentId', avg: { $avg: { $multiply: [{ $divide: ['$results.marks', '$maxMarks'] }, 100] } }, count: { $sum: 1 } } },
  ]);
  const map = new Map<string, { avg: number; count: number }>();
  for (const r of rows) map.set(key(r._id), { avg: Math.round(r.avg), count: r.count });
  return map;
}

export async function feesByStudent(instituteId: Id, studentIds?: Id[]) {
  // A fee is overdue from the day AFTER its due date (not from 05:30 on the due date itself).
  const today = startOfDay();
  const rows = await Invoice.aggregate<{ _id: Id; total: number; paid: number; overdue: number; nextDue: Date | null }>([
    { $match: { instituteId, ...(studentIds ? { studentId: { $in: studentIds } } : {}) } },
    {
      $group: {
        _id: '$studentId',
        total: { $sum: '$amount' },
        paid: { $sum: '$paidAmount' },
        overdue: {
          $sum: { $cond: [{ $and: [{ $ne: ['$status', 'paid'] }, { $lt: ['$dueDate', today] }] }, { $subtract: ['$amount', '$paidAmount'] }, 0] },
        },
        nextDue: { $min: { $cond: [{ $ne: ['$status', 'paid'] }, '$dueDate', null] } },
      },
    },
  ]);
  const map = new Map<string, { total: number; paid: number; pending: number; overdue: number; nextDue: Date | null }>();
  for (const r of rows) map.set(key(r._id), { total: r.total, paid: r.paid, pending: r.total - r.paid, overdue: r.overdue, nextDue: r.nextDue });
  return map;
}

/** Students whose most recent N (or more) marked classes are all absences. */
export async function absenceStreaks(instituteId: Id, threshold = 3, batchIds?: Id[] | null) {
  const since = ymd(addDays(new Date(), -45));
  const docs = await Attendance.find({ instituteId, date: { $gte: since }, ...(batchIds ? { batchId: { $in: batchIds } } : {}) })
    .select('date records')
    .sort({ date: -1 })
    .lean();
  const streak = new Map<string, { count: number; broken: boolean; since: string }>();
  for (const d of docs) {
    for (const r of d.records) {
      const k = key(r.studentId);
      const s = streak.get(k) ?? { count: 0, broken: false, since: d.date };
      if (s.broken) continue;
      if (r.status === 'absent') {
        s.count++;
        s.since = d.date;
      } else s.broken = true;
      streak.set(k, s);
    }
  }
  return [...streak.entries()]
    .filter(([, s]) => s.count >= threshold)
    .map(([studentId, s]) => ({ studentId, count: s.count, since: s.since }))
    .sort((a, b) => b.count - a.count || a.studentId.localeCompare(b.studentId)); // stable order for paging
}

export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
