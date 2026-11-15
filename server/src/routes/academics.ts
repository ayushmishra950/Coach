import { Router, type Request } from 'express';
import { Types } from 'mongoose';
import { allow, assertBatchAccess, auth, scopedBatchIds, teachesBatch, tid } from '../middleware/auth.js';
import { Batch, Course, LeaveRequest, Material, Student, User } from '../models/index.js';
import { audit } from '../services/audit.js';
import { deleteFile, fileInfo } from '../services/files.js';
import { notify, notifyMany, type NotifyInput } from '../services/notify.js';
import { parseDate } from '../utils/dates.js';
import { HttpError, ah, oid, str } from '../utils/http.js';
import { pageParams, paged } from '../utils/paginate.js';
import { cleanName, optStr } from '../utils/security.js';

/**
 * Staff side of: courses, study material, syllabus tracking and parents' leave requests.
 *   /api/academics/courses …   /api/academics/materials …   /api/academics/syllabus/:batchId …   /api/academics/leaves …
 */
const r = Router();
r.use(auth, allow('owner', 'teacher'));

const list = (v: unknown, max = 60, each = 300) =>
  (Array.isArray(v) ? v : String(v ?? '').split('\n')).map((x) => String(x).trim()).filter(Boolean).slice(0, max).map((x) => x.slice(0, each));

/* ─────────────────────────── Courses ─────────────────────────── */

function courseFields(b: Record<string, unknown>) {
  const set: Record<string, unknown> = { name: cleanName(b.name, 'Course name') };
  for (const k of ['category', 'duration', 'feeNote'] as const) set[k] = optStr(b[k], 80);
  set.description = optStr(b.description, 2000);
  if (b.fee !== undefined && b.fee !== '' && b.fee !== null) {
    const n = Number(b.fee);
    if (!Number.isFinite(n) || n < 0 || n > 10_000_000) throw new HttpError(400, 'Enter a valid fee');
    set.fee = Math.round(n);
  } else set.fee = undefined;
  set.syllabus = list(b.syllabus);
  set.highlights = list(b.highlights, 12, 120);
  if (typeof b.public === 'boolean') set.public = b.public;
  if (typeof b.active === 'boolean') set.active = b.active;
  if (b.order !== undefined) set.order = Math.round(Number(b.order) || 0);
  return set;
}

r.get(
  '/courses',
  ah(async (req, res) => {
    const courses = await Course.find({ instituteId: tid(req) }).populate('batchIds', 'name days startTime endTime').sort({ active: -1, order: 1, name: 1 }).lean();
    res.json(courses);
  }),
);

r.post(
  '/courses',
  allow('owner'),
  ah(async (req, res) => {
    const instituteId = tid(req);
    const set = courseFields(req.body ?? {});
    const batchIds = await validBatches(instituteId, req.body?.batchIds);
    const c = await Course.create({ ...set, batchIds, instituteId });
    audit(req, 'course.create', 'Course', c._id, c.name);
    res.status(201).json(c);
  }),
);

r.put(
  '/courses/:id',
  allow('owner'),
  ah(async (req, res) => {
    const instituteId = tid(req);
    const set = courseFields(req.body ?? {});
    if (req.body?.batchIds !== undefined) set.batchIds = await validBatches(instituteId, req.body.batchIds);
    const c = await Course.findOneAndUpdate({ _id: oid(req.params.id), instituteId }, { $set: set }, { new: true, runValidators: true });
    if (!c) throw new HttpError(404, 'Course not found');
    res.json(c);
  }),
);

r.delete(
  '/courses/:id',
  allow('owner'),
  ah(async (req, res) => {
    const c = await Course.findOneAndDelete({ _id: oid(req.params.id), instituteId: tid(req) });
    if (!c) throw new HttpError(404, 'Course not found');
    audit(req, 'course.delete', 'Course', c._id, c.name);
    res.json({ ok: true });
  }),
);

async function validBatches(instituteId: Types.ObjectId, v: unknown) {
  if (!Array.isArray(v)) return [];
  const ids = v.slice(0, 50).map((x) => oid(String(x)));
  return (await Batch.find({ instituteId, _id: { $in: ids } }).select('_id').lean()).map((b) => b._id);
}

/* ─────────────────────────── Study material ─────────────────────────── */

r.get(
  '/materials',
  ah(async (req, res) => {
    const instituteId = tid(req);
    const scoped = await scopedBatchIds(req);
    const p = pageParams(req.query);
    const q: Record<string, unknown> = { instituteId };
    const batchId = str(req.query.batchId);
    if (batchId) q.batchIds = oid(batchId);
    else if (scoped) q.batchIds = { $in: scoped };
    if (batchId && scoped && !scoped.some((s) => String(s) === batchId)) throw new HttpError(403, 'This batch is not assigned to you');
    const kind = str(req.query.kind);
    if (kind && ['notes', 'video', 'assignment', 'link'].includes(kind)) q.kind = kind;
    const [items, total] = await Promise.all([
      Material.find(q).populate('batchIds', 'name color').sort({ createdAt: -1, _id: -1 }).skip(p.skip).limit(p.limit).lean(),
      Material.countDocuments(q),
    ]);
    res.json(paged(items, total, p));
  }),
);

r.post(
  '/materials',
  ah(async (req, res) => {
    const instituteId = tid(req);
    const b = req.body ?? {};
    const title = optStr(b.title, 150);
    if (!title) throw new HttpError(400, 'Title is required');
    const batchIds: Types.ObjectId[] = [];
    for (const id of [...new Set((Array.isArray(b.batchIds) ? b.batchIds : []).map(String))].slice(0, 100)) batchIds.push((await assertBatchAccess(req, oid(String(id))))._id);
    if (!batchIds.length) throw new HttpError(400, 'Pick at least one batch');
    const kind = ['notes', 'video', 'assignment', 'link'].includes(b.kind) ? b.kind : 'notes';
    const doc: Record<string, unknown> = {
      instituteId, batchIds, title, kind, description: optStr(b.description, 2000), subject: optStr(b.subject, 60),
      uploadedBy: req.user.id, uploadedByName: req.user.name,
      dueDate: kind === 'assignment' && b.dueDate ? parseDate(b.dueDate, 'Due date') : undefined,
    };
    if (b.fileId) {
      const f = await fileInfo(oid(String(b.fileId)));
      if (!f || String(f.metadata?.instituteId) !== String(instituteId)) throw new HttpError(400, 'Upload the file again');
      Object.assign(doc, { fileId: f._id, fileName: f.filename, fileSize: f.length, mime: f.metadata?.mime });
    }
    if (b.url) {
      const url = optStr(b.url, 500)!;
      if (!/^https?:\/\//i.test(url)) throw new HttpError(400, 'Links must start with http:// or https://');
      doc.url = url;
    }
    if (!doc.fileId && !doc.url && kind !== 'assignment') throw new HttpError(400, 'Upload a file or paste a link');
    const m = await Material.create(doc);
    notifyParents(req, batchIds, {
      title: kind === 'assignment' ? `New assignment: ${title}` : kind === 'video' ? `New recorded lecture: ${title}` : `New study material: ${title}`,
      message: `${req.user.name} shared "${title}"${doc.subject ? ` (${doc.subject})` : ''}${doc.dueDate ? ` — due ${(doc.dueDate as Date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}.`,
      hash: 'materials',
    });
    res.status(201).json(await m.populate('batchIds', 'name color'));
  }),
);

r.delete(
  '/materials/:id',
  ah(async (req, res) => {
    const m = await Material.findOne({ _id: oid(req.params.id), instituteId: tid(req) });
    if (!m) throw new HttpError(404, 'Material not found');
    if (req.user.role === 'teacher' && String(m.uploadedBy) !== String(req.user.id)) throw new HttpError(403, 'You can only delete material you uploaded');
    await m.deleteOne();
    if (m.fileId && !(await Material.exists({ fileId: m.fileId }))) await deleteFile(m.fileId);
    audit(req, 'material.delete', 'Material', m._id, m.title);
    res.json({ ok: true });
  }),
);

/** In-app note (one per family) to parents of the given batches. */
function notifyParents(req: Request, batchIds: Types.ObjectId[], n: { title: string; message: string; hash: string }) {
  const institute = req.institute!;
  setImmediate(async () => {
    try {
      const students = await Student.find({ instituteId: institute._id, status: 'active', batchIds: { $in: batchIds } }).select('_id parentUserId parentPhone').lean();
      const seen = new Set<string>();
      const inputs: NotifyInput[] = [];
      for (const s of students) {
        const fam = String(s.parentUserId ?? s.parentPhone ?? s._id);
        if (seen.has(fam)) continue;
        seen.add(fam);
        inputs.push({ institute, type: 'material', audience: 'parent', studentId: s._id, title: n.title, message: n.message, href: `/portal?student=${s._id}#${n.hash}`, skipExternal: true });
      }
      await notifyMany(inputs);
    } catch (e) {
      console.error('[material notify]', (e as Error).message);
    }
  });
}

/* ─────────────────────────── Syllabus tracking ─────────────────────────── */

r.get(
  '/syllabus/:batchId',
  ah(async (req, res) => {
    const batch = await assertBatchAccess(req, oid(req.params.batchId));
    res.json({ batchId: batch._id, name: batch.name, syllabus: batch.syllabus ?? [] });
  }),
);

/** Add topics (one per line). */
r.post(
  '/syllabus/:batchId',
  ah(async (req, res) => {
    const batch = await assertBatchAccess(req, oid(req.params.batchId));
    const titles = list(req.body?.titles ?? req.body?.title, 100, 200);
    if (!titles.length) throw new HttpError(400, 'Write at least one topic');
    if ((batch.syllabus?.length ?? 0) + titles.length > 400) throw new HttpError(400, 'A batch can have up to 400 topics');
    const subject = optStr(req.body?.subject, 60);
    const plannedDate = req.body?.plannedDate ? parseDate(req.body.plannedDate, 'Planned date') : undefined;
    for (const title of titles) batch.syllabus.push({ title, subject, plannedDate, done: false });
    await batch.save();
    res.status(201).json(batch.syllabus);
  }),
);

r.put(
  '/syllabus/:batchId/:topicId',
  ah(async (req, res) => {
    const batch = await assertBatchAccess(req, oid(req.params.batchId));
    const t = batch.syllabus.id(oid(req.params.topicId));
    if (!t) throw new HttpError(404, 'Topic not found');
    const b = req.body ?? {};
    if (typeof b.done === 'boolean' && b.done !== t.done) {
      t.done = b.done;
      t.doneAt = b.done ? new Date() : undefined;
      t.doneByName = b.done ? req.user.name : undefined;
    }
    if (b.title !== undefined) t.title = optStr(b.title, 200) ?? t.title;
    if (b.subject !== undefined) t.subject = optStr(b.subject, 60);
    if (b.plannedDate !== undefined) t.plannedDate = b.plannedDate ? parseDate(b.plannedDate, 'Planned date') : undefined;
    await batch.save();
    res.json(batch.syllabus);
  }),
);

r.delete(
  '/syllabus/:batchId/:topicId',
  ah(async (req, res) => {
    const batch = await assertBatchAccess(req, oid(req.params.batchId));
    const t = batch.syllabus.id(oid(req.params.topicId));
    if (!t) throw new HttpError(404, 'Topic not found');
    t.deleteOne();
    await batch.save();
    res.json(batch.syllabus);
  }),
);

/** Progress of every batch the user can see (timetable page). */
r.get(
  '/syllabus',
  ah(async (req, res) => {
    const scoped = await scopedBatchIds(req);
    const batches = await Batch.find({ instituteId: tid(req), active: true, ...(scoped ? { _id: { $in: scoped } } : {}) })
      .select('name color subject days startTime endTime room syllabus teacherId coTeacherIds')
      .populate('teacherId', 'name')
      .sort({ startTime: 1, name: 1 })
      .lean();
    res.json(batches.map((b) => {
      const total = b.syllabus?.length ?? 0;
      const done = b.syllabus?.filter((t) => t.done).length ?? 0;
      return {
        _id: b._id, name: b.name, color: b.color, subject: b.subject, days: b.days, startTime: b.startTime, endTime: b.endTime, room: b.room,
        teacher: (b.teacherId as unknown as { name?: string } | null)?.name,
        mine: req.user.role === 'teacher' ? teachesBatch(b, req.user.id) : undefined,
        syllabus: { total, done, pct: total ? Math.round((done / total) * 100) : null, next: b.syllabus?.find((t) => !t.done)?.title ?? null },
      };
    }));
  }),
);

/* ─────────────────────────── Leave requests ─────────────────────────── */

r.get(
  '/leaves',
  ah(async (req, res) => {
    const instituteId = tid(req);
    const scoped = await scopedBatchIds(req);
    const p = pageParams(req.query);
    const q: Record<string, unknown> = { instituteId };
    if (scoped) {
      const ids = (await Student.find({ instituteId, batchIds: { $in: scoped } }).select('_id').lean()).map((s) => s._id);
      q.studentId = { $in: ids };
    }
    const status = str(req.query.status);
    if (status && ['pending', 'approved', 'rejected', 'cancelled'].includes(status)) q.status = status;
    const [items, total, pending] = await Promise.all([
      LeaveRequest.find(q).populate('studentId', 'name studentCode batchIds parentName parentPhone').sort({ status: -1, createdAt: -1, _id: -1 }).skip(p.skip).limit(p.limit).lean(),
      LeaveRequest.countDocuments(q),
      LeaveRequest.countDocuments({ ...q, status: 'pending' }),
    ]);
    res.json({ ...paged(items, total, p), pending });
  }),
);

r.put(
  '/leaves/:id',
  ah(async (req, res) => {
    const instituteId = tid(req);
    const leave = await LeaveRequest.findOne({ _id: oid(req.params.id), instituteId });
    if (!leave) throw new HttpError(404, 'Leave request not found');
    const student = await Student.findOne({ _id: leave.studentId, instituteId }).select('name batchIds parentPhone parentEmail');
    if (!student) throw new HttpError(404, 'Student not found');
    const scoped = await scopedBatchIds(req);
    if (scoped && !student.batchIds.some((b) => scoped.some((s) => String(s) === String(b)))) throw new HttpError(403, 'This student is not in your batches');
    const status = req.body?.status;
    if (!['approved', 'rejected'].includes(status)) throw new HttpError(400, 'Approve or reject the request');
    if (leave.status === 'cancelled') throw new HttpError(400, 'The parent cancelled this request');
    leave.set({ status, reviewNote: optStr(req.body?.note, 300), reviewedBy: req.user.id, reviewedByName: req.user.name, reviewedAt: new Date() });
    await leave.save();
    const range = leave.from === leave.to ? fmtDay(leave.from) : `${fmtDay(leave.from)} – ${fmtDay(leave.to)}`;
    notify({
      institute: req.institute!, type: 'leave', audience: 'parent', studentId: student._id,
      title: status === 'approved' ? 'Leave approved' : 'Leave not approved',
      message: `${student.name}'s leave for ${range} was ${status} by ${req.user.name}.${leave.reviewNote ? ` Note: ${leave.reviewNote}` : ''}`,
      href: `/portal?student=${student._id}#leave`, skipExternal: true,
    }).catch(() => undefined);
    res.json(leave);
  }),
);

export const fmtDay = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

/** Teachers of a student's batches (lead + co) — who gets told about a new leave request. */
export async function teachersOf(instituteId: Types.ObjectId, batchIds: Types.ObjectId[]) {
  const batches = await Batch.find({ instituteId, _id: { $in: batchIds } }).select('teacherId coTeacherIds').lean();
  const ids = [...new Set(batches.flatMap((b) => [b.teacherId, ...(b.coTeacherIds ?? [])]).filter(Boolean).map(String))];
  return User.find({ _id: { $in: ids }, active: true }).select('_id').lean();
}

export default r;
