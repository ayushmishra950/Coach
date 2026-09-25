import { Router } from 'express';
import { Types } from 'mongoose';
import { allow, assertBatchAccess, auth, scopedBatchIds, tid } from '../middleware/auth.js';
import { Attendance, Batch, Student, Test, User } from '../models/index.js';
import { attendanceByStudent, pct, scoresByStudent } from '../services/stats.js';
import { nextClass } from '../utils/dates.js';
import { HttpError, ah, oid, required } from '../utils/http.js';

const r = Router();
r.use(auth, allow('owner', 'teacher'));

const FIELDS = ['name', 'course', 'subject', 'days', 'startTime', 'endTime', 'room', 'capacity', 'color', 'active'] as const;

async function resolveTeacher(instituteId: Types.ObjectId, teacherId: unknown) {
  if (!teacherId) return undefined;
  const t = await User.findOne({ _id: oid(teacherId), instituteId, role: 'teacher' }).lean();
  if (!t) throw new HttpError(400, 'Selected teacher not found');
  return t._id;
}

async function setBatchStudents(instituteId: Types.ObjectId, batchId: Types.ObjectId, studentIds: unknown) {
  if (!Array.isArray(studentIds)) return;
  const ids = studentIds.map(oid);
  await Student.updateMany({ instituteId, batchIds: batchId, _id: { $nin: ids } }, { $pull: { batchIds: batchId } });
  await Student.updateMany({ instituteId, _id: { $in: ids } }, { $addToSet: { batchIds: batchId } });
}

r.get(
  '/',
  ah(async (req, res) => {
    const instituteId = tid(req);
    const scoped = await scopedBatchIds(req);
    const batches = await Batch.find({ instituteId, ...(scoped ? { _id: { $in: scoped } } : {}) })
      .populate('teacherId', 'name')
      .sort({ active: -1, name: 1 })
      .lean();
    const ids = batches.map((b) => b._id);
    const [counts, att, tests] = await Promise.all([
      Student.aggregate([{ $match: { instituteId, status: 'active', batchIds: { $in: ids } } }, { $unwind: '$batchIds' }, { $group: { _id: '$batchIds', n: { $sum: 1 } } }]),
      Attendance.aggregate([
        { $match: { instituteId, batchId: { $in: ids } } },
        { $unwind: '$records' },
        { $group: { _id: '$batchId', total: { $sum: 1 }, present: { $sum: { $cond: [{ $ne: ['$records.status', 'absent'] }, 1, 0] } } } },
      ]),
      Test.aggregate([
        { $match: { instituteId, batchId: { $in: ids }, status: { $ne: 'scheduled' } } },
        { $unwind: '$results' },
        { $match: { 'results.absent': { $ne: true }, 'results.marks': { $type: 'number' } } },
        { $group: { _id: '$batchId', avg: { $avg: { $multiply: [{ $divide: ['$results.marks', '$maxMarks'] }, 100] } } } },
      ]),
    ]);
    res.json(
      batches.map((b) => {
        const a = att.find((x) => String(x._id) === String(b._id));
        const nc = nextClass([b]);
        return {
          ...b,
          teacher: b.teacherId,
          studentCount: counts.find((c) => String(c._id) === String(b._id))?.n ?? 0,
          attendancePct: a ? pct(a.present, a.total) : null,
          avgScore: Math.round(tests.find((x) => String(x._id) === String(b._id))?.avg ?? 0) || null,
          nextClassAt: nc?.at ?? null,
        };
      }),
    );
  }),
);

r.post(
  '/',
  allow('owner'),
  ah(async (req, res) => {
    const instituteId = tid(req);
    required(req.body ?? {}, ['name']);
    const data: Record<string, unknown> = {};
    for (const k of FIELDS) if (req.body[k] !== undefined) data[k] = req.body[k];
    const batch = await Batch.create({ ...data, instituteId, teacherId: await resolveTeacher(instituteId, req.body.teacherId) });
    await setBatchStudents(instituteId, batch._id, req.body.studentIds);
    res.status(201).json(batch);
  }),
);

r.get(
  '/:id',
  ah(async (req, res) => {
    const instituteId = tid(req);
    const batch = await assertBatchAccess(req, oid(req.params.id));
    await batch.populate('teacherId', 'name email phone subjects');
    const students = await Student.find({ instituteId, batchIds: batch._id, status: 'active' }).select('name studentCode phone parentName parentPhone').sort({ name: 1 }).lean();
    const ids = students.map((s) => s._id);
    const [att, scores, tests, sessions] = await Promise.all([
      attendanceByStudent(instituteId, ids),
      scoresByStudent(instituteId, ids),
      Test.find({ instituteId, batchId: batch._id }).sort({ date: -1 }).lean(),
      Attendance.find({ instituteId, batchId: batch._id }).sort({ date: -1 }).limit(20).lean(),
    ]);
    res.json({
      batch: { ...batch.toObject(), teacher: batch.teacherId },
      students: students.map((s) => ({ ...s, attendancePct: att.get(String(s._id))?.pct ?? null, avgScore: scores.get(String(s._id))?.avg ?? null })),
      tests: tests.map((t) => {
        const valid = t.results.filter((x) => !x.absent && x.marks != null);
        return { _id: t._id, subject: t.subject, topic: t.topic, date: t.date, status: t.status, maxMarks: t.maxMarks, avg: valid.length ? pct(valid.reduce((s, x) => s + (x.marks ?? 0), 0), t.maxMarks * valid.length) : null };
      }),
      attendanceTrend: sessions
        .map((s) => ({ date: s.date, pct: pct(s.records.filter((x) => x.status !== 'absent').length, s.records.length) }))
        .reverse(),
      nextClassAt: nextClass([batch.toObject()])?.at ?? null,
    });
  }),
);

r.put(
  '/:id',
  allow('owner'),
  ah(async (req, res) => {
    const instituteId = tid(req);
    const data: Record<string, unknown> = {};
    for (const k of FIELDS) if (req.body?.[k] !== undefined) data[k] = req.body[k];
    if (req.body?.teacherId !== undefined) data.teacherId = (await resolveTeacher(instituteId, req.body.teacherId)) ?? null;
    const batch = await Batch.findOneAndUpdate({ _id: oid(req.params.id), instituteId }, data, { new: true, runValidators: true });
    if (!batch) throw new HttpError(404, 'Batch not found');
    await setBatchStudents(instituteId, batch._id, req.body?.studentIds);
    res.json(batch);
  }),
);

r.delete(
  '/:id',
  allow('owner'),
  ah(async (req, res) => {
    const instituteId = tid(req);
    const batch = await Batch.findOneAndDelete({ _id: oid(req.params.id), instituteId });
    if (!batch) throw new HttpError(404, 'Batch not found');
    await Student.updateMany({ instituteId, batchIds: batch._id }, { $pull: { batchIds: batch._id } });
    res.json({ ok: true });
  }),
);

export default r;
