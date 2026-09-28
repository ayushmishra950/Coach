import { Router } from 'express';
import { Types } from 'mongoose';
import { allow, assertBatchAccess, auth, scopedBatchIds, tid } from '../middleware/auth.js';
import { Attendance, Batch, Student, Test, User } from '../models/index.js';
import { audit } from '../services/audit.js';
import { disconnectUser } from '../services/realtime.js';
import { attendanceByStudent, pct, scoresByStudent } from '../services/stats.js';
import { bumpData } from '../utils/cache.js';
import { DAYS, nextClass } from '../utils/dates.js';
import { HttpError, ah, oid, required } from '../utils/http.js';
import { pageParams, paged } from '../utils/paginate.js';
import { HEX_COLOR_RX, escapeRegex, optStr } from '../utils/security.js';

const r = Router();
r.use(auth, allow('owner', 'teacher'));

const TIME_RX = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Validated batch fields ({ set, unset }). */
function batchFields(body: Record<string, unknown>, current?: { startTime?: string | null; endTime?: string | null }) {
  const set: Record<string, unknown> = {};
  const unset: Record<string, 1> = {};
  if (body.name !== undefined) {
    const v = optStr(body.name, 80);
    if (!v) throw new HttpError(400, 'Batch name is required');
    set.name = v;
  }
  for (const k of ['course', 'subject', 'room'] as const) {
    if (body[k] === undefined) continue;
    const v = optStr(body[k], 80);
    if (v) set[k] = v;
    else unset[k] = 1;
  }
  if (body.days !== undefined) {
    if (!Array.isArray(body.days) || body.days.some((d) => !DAYS.includes(d as (typeof DAYS)[number]))) throw new HttpError(400, 'Invalid class days');
    set.days = [...new Set(body.days)];
  }
  for (const k of ['startTime', 'endTime'] as const) {
    if (body[k] === undefined) continue;
    if (typeof body[k] !== 'string' || !TIME_RX.test(body[k] as string)) throw new HttpError(400, 'Time must be in HH:mm format');
    set[k] = body[k];
  }
  if (body.capacity !== undefined) {
    if (body.capacity === '' || body.capacity === null) unset.capacity = 1;
    else {
      const n = Number(body.capacity);
      if (!Number.isInteger(n) || n < 1 || n > 1000) throw new HttpError(400, 'Capacity must be a whole number between 1 and 1000');
      set.capacity = n;
    }
  }
  if (body.color !== undefined) {
    if (typeof body.color !== 'string' || !HEX_COLOR_RX.test(body.color)) throw new HttpError(400, 'Invalid colour');
    set.color = body.color;
  }
  if (body.active !== undefined) set.active = !!body.active;
  // Compare against the saved times when only one of them is being changed.
  const start = (set.startTime ?? current?.startTime) as string | undefined;
  const end = (set.endTime ?? current?.endTime) as string | undefined;
  if (start && end && TIME_RX.test(start) && TIME_RX.test(end) && end <= start) throw new HttpError(400, 'End time must be after the start time');
  return { set, unset };
}

/** `keep`: teachers already on the batch are accepted even if deactivated (old data). */
async function resolveTeacher(instituteId: Types.ObjectId, teacherId: unknown, keep: unknown[] = []) {
  if (!teacherId) return undefined;
  const already = keep.some((k) => String(k) === String(teacherId));
  const t = await User.findOne({ _id: oid(teacherId), instituteId, role: 'teacher', ...(!already && { active: true }) }).lean();
  if (!t) throw new HttpError(400, 'Selected teacher not found');
  return t._id;
}

/** Other subject teachers of a batch (JEE/NEET batches have one per subject). */
async function resolveCoTeachers(instituteId: Types.ObjectId, ids: unknown, lead?: Types.ObjectId | null, keep: unknown[] = []) {
  if (!Array.isArray(ids)) return [];
  const wanted = [...new Set(ids.map((x) => String(x)))].filter((x) => x && x !== String(lead ?? '')).slice(0, 10).map(oid);
  const kept = new Set(keep.map(String));
  const found = await User.find({ _id: { $in: wanted }, instituteId, role: 'teacher', $or: [{ active: true }, { _id: { $in: wanted.filter((w) => kept.has(String(w))) } }] })
    .select('_id')
    .lean();
  if (found.length !== wanted.length) throw new HttpError(400, 'One of the selected teachers was not found');
  return found.map((t) => t._id);
}

/**
 * Non-blocking schedule checks: the same teacher or room booked in two active batches at
 * overlapping times on the same day. Returned as warnings so the owner can decide.
 */
async function scheduleWarnings(instituteId: Types.ObjectId, b: { _id?: unknown; name?: string; days?: string[]; startTime?: string; endTime?: string; room?: string | null; teacherId?: unknown; coTeacherIds?: unknown[] | null; active?: boolean | null }) {
  if (b.active === false || !b.days?.length || !b.startTime || !b.endTime) return [];
  const teachers = [b.teacherId, ...(b.coTeacherIds ?? [])].filter(Boolean).map((x) => String(x));
  const others = await Batch.find({ instituteId, active: true, _id: { $ne: b._id }, days: { $in: b.days } })
    .select('name days startTime endTime room teacherId coTeacherIds')
    .populate('teacherId', 'name')
    .lean();
  const warnings: string[] = [];
  for (const o of others) {
    if (!(o.startTime < b.endTime && b.startTime < o.endTime)) continue;
    const oTeachers = [(o.teacherId as unknown as { _id?: unknown })?._id, ...(o.coTeacherIds ?? [])].filter(Boolean).map((x) => String(x));
    const common = teachers.filter((t) => oTeachers.includes(t));
    if (common.length) warnings.push(`Teacher clash with "${o.name}" (${o.startTime}–${o.endTime})`);
    if (b.room && o.room && b.room.trim().toLowerCase() === o.room.trim().toLowerCase()) warnings.push(`Room ${o.room} is also used by "${o.name}" at ${o.startTime}–${o.endTime}`);
  }
  return warnings;
}

async function setBatchStudents(instituteId: Types.ObjectId, batchId: Types.ObjectId, studentIds: unknown, capacity?: number | null) {
  if (!Array.isArray(studentIds)) return;
  const ids = [...new Set(studentIds.map((x) => String(x)))].map(oid);
  if (capacity && ids.length > capacity) throw new HttpError(400, `This batch has room for ${capacity} students — you selected ${ids.length}. Increase the capacity or pick fewer students.`);
  await Student.updateMany({ instituteId, batchIds: batchId, _id: { $nin: ids } }, { $pull: { batchIds: batchId } });
  await Student.updateMany({ instituteId, _id: { $in: ids } }, { $addToSet: { batchIds: batchId } });
}

r.get(
  '/',
  ah(async (req, res) => {
    const instituteId = tid(req);
    const scoped = await scopedBatchIds(req);
    const p = pageParams(req.query);
    const filter: Record<string, unknown> = { instituteId, ...(scoped ? { _id: { $in: scoped } } : {}) };
    if (typeof req.query.search === 'string' && req.query.search.trim()) {
      const rx = new RegExp(escapeRegex(req.query.search.trim()), 'i');
      filter.$or = [{ name: rx }, { subject: rx }, { course: rx }, { room: rx }];
    }
    const [batches, total] = await Promise.all([
      Batch.find(filter).populate('teacherId', 'name').populate('coTeacherIds', 'name').sort({ active: -1, name: 1, _id: 1 }).skip(p.skip).limit(p.limit).lean(),
      Batch.countDocuments(filter),
    ]);
    const ids = batches.map((b) => b._id);
    const [counts, att, tests] = await Promise.all([
      Student.aggregate([{ $match: { instituteId, status: 'active', batchIds: { $in: ids } } }, { $unwind: '$batchIds' }, { $group: { _id: '$batchIds', n: { $sum: 1 } } }]),
      // Count per class day with $size/$filter — no $unwind of every record ever marked.
      Attendance.aggregate([
        { $match: { instituteId, batchId: { $in: ids } } },
        {
          $project: {
            batchId: 1,
            n: { $size: '$records' },
            p: { $size: { $filter: { input: '$records', cond: { $ne: ['$$this.status', 'absent'] } } } },
          },
        },
        { $group: { _id: '$batchId', total: { $sum: '$n' }, present: { $sum: '$p' } } },
      ]),
      Test.aggregate([
        { $match: { instituteId, batchId: { $in: ids }, status: { $ne: 'scheduled' } } },
        { $unwind: '$results' },
        { $match: { 'results.absent': { $ne: true }, 'results.marks': { $type: 'number' } } },
        { $group: { _id: '$batchId', avg: { $avg: { $multiply: [{ $divide: ['$results.marks', '$maxMarks'] }, 100] } } } },
      ]),
    ]);
    res.json(paged(
      batches.map((b) => {
        const a = att.find((x) => String(x._id) === String(b._id));
        const nc = nextClass([b]);
        return {
          ...b,
          teacher: b.teacherId,
          coTeachers: b.coTeacherIds,
          studentCount: counts.find((c) => String(c._id) === String(b._id))?.n ?? 0,
          attendancePct: a ? pct(a.present, a.total) : null,
          avgScore: Math.round(tests.find((x) => String(x._id) === String(b._id))?.avg ?? 0) || null,
          nextClassAt: nc?.at ?? null,
        };
      }),
      total,
      p,
    ));
  }),
);

/** Batches for dropdowns and filters: id, name and colour only (teachers see their own). */
r.get(
  '/options',
  ah(async (req, res) => {
    const scoped = await scopedBatchIds(req);
    const q: Record<string, unknown> = { instituteId: tid(req), ...(scoped ? { _id: { $in: scoped } } : {}) };
    if (req.query.active === 'true') q.active = true;
    res.json(await Batch.find(q).select('name color subject course active days startTime endTime').sort({ active: -1, name: 1 }).lean());
  }),
);

r.post(
  '/',
  allow('owner'),
  ah(async (req, res) => {
    const instituteId = tid(req);
    required(req.body ?? {}, ['name']);
    const { set } = batchFields(req.body);
    const teacherId = await resolveTeacher(instituteId, req.body.teacherId);
    const coTeacherIds = await resolveCoTeachers(instituteId, req.body.coTeacherIds, teacherId);
    if (Array.isArray(req.body.studentIds) && set.capacity && req.body.studentIds.length > (set.capacity as number)) {
      throw new HttpError(400, `This batch has room for ${set.capacity} students — you selected ${req.body.studentIds.length}.`);
    }
    const batch = await Batch.create({ ...set, instituteId, teacherId, coTeacherIds });
    await setBatchStudents(instituteId, batch._id, req.body.studentIds, batch.capacity);
    bumpData(instituteId);
    res.status(201).json({ ...batch.toObject(), warnings: await scheduleWarnings(instituteId, batch.toObject()) });
  }),
);

/** Every member of one batch (a batch is bounded by its capacity) — used by the edit form. */
r.get(
  '/:id/members',
  ah(async (req, res) => {
    const batch = await assertBatchAccess(req, oid(req.params.id));
    res.json(await Student.find({ instituteId: tid(req), batchIds: batch._id }).select('name studentCode status').sort({ name: 1 }).lean());
  }),
);

r.get(
  '/:id',
  ah(async (req, res) => {
    const instituteId = tid(req);
    const batch = await assertBatchAccess(req, oid(req.params.id));
    await batch.populate('teacherId', 'name email phone subjects');
    await batch.populate('coTeacherIds', 'name subjects');
    // Students and tests of the batch are each paged 20 at a time (?studentsPage= / ?testsPage=).
    const sp = pageParams({ page: req.query.studentsPage });
    const tp = pageParams({ page: req.query.testsPage });
    const sFilter: Record<string, unknown> = { instituteId, batchIds: batch._id, status: 'active' };
    if (typeof req.query.search === 'string' && req.query.search.trim()) {
      const rx = new RegExp(escapeRegex(req.query.search.trim()), 'i');
      sFilter.$or = [{ name: rx }, { studentCode: rx }, { parentName: rx }, { phone: rx }, { parentPhone: rx }];
    }
    const [students, studentTotal, batchSize, tests, testTotal, sessions] = await Promise.all([
      Student.find(sFilter).select('name studentCode phone parentName parentPhone').sort({ name: 1, _id: 1 }).skip(sp.skip).limit(sp.limit).lean(),
      Student.countDocuments(sFilter),
      Student.countDocuments({ instituteId, batchIds: batch._id, status: 'active' }),
      Test.find({ instituteId, batchId: batch._id }).select('subject topic date status maxMarks results.marks results.absent').sort({ date: -1, _id: -1 }).skip(tp.skip).limit(tp.limit).lean(),
      Test.countDocuments({ instituteId, batchId: batch._id }),
      Attendance.find({ instituteId, batchId: batch._id }).sort({ date: -1 }).limit(20).lean(),
    ]);
    const ids = students.map((s) => s._id);
    const [att, scores] = await Promise.all([attendanceByStudent(instituteId, ids), scoresByStudent(instituteId, ids)]);
    res.json({
      batch: { ...batch.toObject(), teacher: batch.teacherId, coTeachers: batch.coTeacherIds },
      /** Active students in the batch (unaffected by the search box). */
      studentsTotal: batchSize,
      students: paged(
        students.map((s) => ({ ...s, attendancePct: att.get(String(s._id))?.pct ?? null, avgScore: scores.get(String(s._id))?.avg ?? null })),
        studentTotal,
        sp,
      ),
      tests: paged(
        tests.map((t) => {
          const valid = t.results.filter((x) => !x.absent && x.marks != null);
          return { _id: t._id, subject: t.subject, topic: t.topic, date: t.date, status: t.status, maxMarks: t.maxMarks, avg: valid.length ? pct(valid.reduce((s, x) => s + (x.marks ?? 0), 0), t.maxMarks * valid.length) : null };
        }),
        testTotal,
        tp,
      ),
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
    const current = await Batch.findOne({ _id: oid(req.params.id), instituteId });
    if (!current) throw new HttpError(404, 'Batch not found');
    const { set, unset } = batchFields(req.body ?? {}, current);
    if (req.body?.teacherId !== undefined) {
      const t = await resolveTeacher(instituteId, req.body.teacherId, [current.teacherId, ...(current.coTeacherIds ?? [])]);
      if (t) set.teacherId = t;
      else unset.teacherId = 1;
    }
    const lead = (set.teacherId as Types.ObjectId | undefined) ?? (unset.teacherId ? null : current.teacherId);
    if (req.body?.coTeacherIds !== undefined) set.coTeacherIds = await resolveCoTeachers(instituteId, req.body.coTeacherIds, lead, [current.teacherId, ...(current.coTeacherIds ?? [])]);
    else if (lead) set.coTeacherIds = (current.coTeacherIds ?? []).filter((x) => String(x) !== String(lead));
    const capacity = unset.capacity ? null : ((set.capacity as number | undefined) ?? current.capacity);
    // Check capacity before saving anything.
    if (Array.isArray(req.body?.studentIds) && capacity && new Set(req.body.studentIds.map(String)).size > capacity) {
      throw new HttpError(400, `This batch has room for ${capacity} students — you selected ${new Set(req.body.studentIds.map(String)).size}.`);
    }
    const before = [current.teacherId, ...(current.coTeacherIds ?? [])].map(String);
    const batch = await Batch.findOneAndUpdate(
      { _id: current._id, instituteId },
      { ...(Object.keys(set).length && { $set: set }), ...(Object.keys(unset).length && { $unset: unset }) },
      { new: true, runValidators: true },
    );
    if (!batch) throw new HttpError(404, 'Batch not found');
    await setBatchStudents(instituteId, batch._id, req.body?.studentIds, capacity);
    // Teachers taken off the batch lose its live notifications straight away.
    const after = new Set([batch.teacherId, ...(batch.coTeacherIds ?? [])].map(String));
    for (const t of before) if (t !== 'undefined' && t !== 'null' && !after.has(t)) disconnectUser(t);
    bumpData(instituteId);
    res.json({ ...batch.toObject(), warnings: await scheduleWarnings(instituteId, batch.toObject()) });
  }),
);

r.delete(
  '/:id',
  allow('owner'),
  ah(async (req, res) => {
    const instituteId = tid(req);
    const id = oid(req.params.id);
    const [hasAttendance, hasTests] = await Promise.all([Attendance.exists({ instituteId, batchId: id }), Test.exists({ instituteId, batchId: id })]);
    // Deleting would orphan attendance and test history — keep it, just switch the batch off.
    if (hasAttendance || hasTests) {
      throw new HttpError(400, 'This batch has attendance or test history, so it can’t be deleted. Mark it inactive (Edit → Active off) instead — its history stays in reports.', 'HAS_HISTORY');
    }
    const batch = await Batch.findOneAndDelete({ _id: id, instituteId });
    if (!batch) throw new HttpError(404, 'Batch not found');
    await Student.updateMany({ instituteId, batchIds: batch._id }, { $pull: { batchIds: batch._id } });
    bumpData(instituteId);
    audit(req, 'batch.delete', 'Batch', batch._id, batch.name);
    res.json({ ok: true });
  }),
);

export default r;
