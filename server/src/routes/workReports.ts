import { Router, type Request } from 'express';
import { Types } from 'mongoose';
import { allow, auth, scopedBatchIds, tid } from '../middleware/auth.js';
import { Attendance, Batch, Material, Test, User, WorkReport } from '../models/index.js';
import { notify } from '../services/notify.js';
import { emitToInstituteRole } from '../services/realtime.js';
import { ymd } from '../utils/dates.js';
import { HttpError, ah, oid } from '../utils/http.js';
import { pageParams, paged } from '../utils/paginate.js';
import { optStr } from '../utils/security.js';

/**
 * Daily work reports.
 *   Teacher: GET /me/today · PUT /me/today · GET /me?page=
 *   Owner:   GET /?date=&teacherId=&status=unseen|seen&page= · POST /:id/seen {comment} · POST /seen-all {date}
 */
const r = Router();
r.use(auth, allow('owner', 'teacher'));

const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;
const dayRange = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return { $gte: new Date(y, m - 1, d), $lt: new Date(y, m - 1, d + 1) };
};

/** What the app already knows the teacher did that day — shown next to the report. */
async function activityOf(req: Request, teacherId: Types.ObjectId, name: string, date: string) {
  const instituteId = tid(req);
  const range = dayRange(date);
  const [attendance, tests, materials, batches] = await Promise.all([
    Attendance.find({ instituteId, date, markedBy: teacherId }).select('batchId records.status').populate('batchId', 'name').lean(),
    Test.find({ instituteId, createdBy: teacherId, createdAt: range }).select('subject topic batchId mode').populate('batchId', 'name').lean(),
    Material.find({ instituteId, uploadedBy: teacherId, createdAt: range }).select('title kind').lean(),
    Batch.find({ instituteId, 'syllabus.doneAt': range, 'syllabus.doneByName': name }).select('name syllabus.title syllabus.doneAt syllabus.doneByName').lean(),
  ]);
  return {
    attendance: attendance.map((a) => ({
      batch: (a.batchId as unknown as { name?: string })?.name ?? 'Batch',
      present: a.records.filter((x) => x.status !== 'absent').length,
      total: a.records.length,
    })),
    tests: tests.map((t) => ({ subject: t.subject, topic: t.topic, batch: (t.batchId as unknown as { name?: string })?.name, mode: t.mode })),
    materials: materials.map((m) => ({ title: m.title, kind: m.kind })),
    topics: batches.flatMap((b) => (b.syllabus ?? [])
      .filter((t) => t.doneByName === name && t.doneAt && t.doneAt >= range.$gte && t.doneAt < range.$lt)
      .map((t) => ({ batch: b.name, title: t.title }))),
  };
}

/* ─────────────── Teacher ─────────────── */

r.get(
  '/me/today',
  allow('teacher'),
  ah(async (req, res) => {
    const date = DATE_RX.test(String(req.query.date ?? '')) && String(req.query.date) <= ymd() ? String(req.query.date) : ymd();
    const [report, activity, scoped] = await Promise.all([
      WorkReport.findOne({ instituteId: tid(req), teacherId: req.user.id, date }).lean(),
      activityOf(req, req.user.id, req.user.name, date),
      scopedBatchIds(req),
    ]);
    const batches = await Batch.find({ instituteId: tid(req), _id: { $in: scoped ?? [] }, active: true }).select('name subject days').sort({ name: 1 }).lean();
    res.json({ date, report, activity, batches });
  }),
);

r.put(
  '/me/today',
  allow('teacher'),
  ah(async (req, res) => {
    const instituteId = tid(req);
    const b = req.body ?? {};
    const date = DATE_RX.test(String(b.date ?? '')) ? String(b.date) : ymd();
    if (date > ymd()) throw new HttpError(400, 'You can’t submit a report for a future day');
    if (date < ymd(new Date(Date.now() - 3 * 86400000))) throw new HttpError(400, 'Reports can be sent for today or the last 3 days only');
    const existing = await WorkReport.findOne({ instituteId, teacherId: req.user.id, date }).select('seenAt').lean();
    if (existing?.seenAt) throw new HttpError(409, 'The owner has already seen this report — it can’t be changed now');

    const scoped = (await scopedBatchIds(req)) ?? [];
    const names = new Map((await Batch.find({ instituteId, _id: { $in: scoped } }).select('name').lean()).map((x) => [String(x._id), x.name]));
    const classes = (Array.isArray(b.classes) ? b.classes : []).slice(0, 20).map((c: { batchId?: unknown; topic?: unknown }) => {
      const id = c?.batchId ? String(c.batchId) : '';
      if (id && !names.has(id)) throw new HttpError(400, 'One of the batches is not assigned to you');
      return { ...(id && { batchId: oid(id), batchName: names.get(id) }), topic: optStr(c?.topic, 300) ?? '' };
    }).filter((c: { batchId?: unknown; topic: string }) => c.batchId || c.topic);
    const fields = {
      classes,
      tests: optStr(b.tests, 1000) ?? '',
      homework: optStr(b.homework, 1000) ?? '',
      otherWork: optStr(b.otherWork, 2000) ?? '',
      issues: optStr(b.issues, 1000) ?? '',
    };
    if (!classes.length && !fields.tests && !fields.homework && !fields.otherWork) throw new HttpError(400, 'Write what you did today — classes, tests, homework or other work');

    const report = await WorkReport.findOneAndUpdate(
      { instituteId, teacherId: req.user.id, date, seenAt: null },
      { $set: { ...fields, submittedAt: new Date() }, $setOnInsert: { instituteId, teacherId: req.user.id, date } },
      { upsert: true, new: true },
    ).catch((e) => {
      if ((e as { code?: number }).code === 11000) throw new HttpError(409, 'The owner has already seen this report — it can’t be changed now');
      throw e;
    });
    const first = !existing;
    if (first) {
      notify({
        institute: req.institute!, type: 'report', audience: 'owner',
        title: `Daily report: ${req.user.name}`,
        message: [classes.length && `${classes.length} class${classes.length > 1 ? 'es' : ''}`, fields.tests && 'tests', fields.homework && 'homework', fields.otherWork && 'other work']
          .filter(Boolean).join(' · ') + (fields.issues ? ' · ⚠ has an issue' : ''),
        href: `/app/work-reports?date=${date}`,
      }).catch(() => undefined);
    }
    emitToInstituteRole(instituteId, 'owner', 'report:new', { _id: report._id, teacherId: req.user.id, date });
    res.status(first ? 201 : 200).json(report);
  }),
);

r.get(
  '/me',
  allow('teacher'),
  ah(async (req, res) => {
    const p = pageParams(req.query);
    const q = { instituteId: tid(req), teacherId: req.user.id };
    const [items, total] = await Promise.all([
      WorkReport.find(q).sort({ date: -1, _id: -1 }).skip(p.skip).limit(p.limit).lean(),
      WorkReport.countDocuments(q),
    ]);
    res.json(paged(items, total, p));
  }),
);

/* ─────────────── Owner ─────────────── */

r.get(
  '/',
  allow('owner'),
  ah(async (req, res) => {
    const instituteId = tid(req);
    const p = pageParams(req.query);
    const q: Record<string, unknown> = { instituteId };
    const date = String(req.query.date ?? '');
    if (DATE_RX.test(date)) q.date = date;
    if (req.query.teacherId) q.teacherId = oid(String(req.query.teacherId));
    if (req.query.status === 'unseen') q.seenAt = null;
    if (req.query.status === 'seen') q.seenAt = { $ne: null };
    const [items, total, unseen] = await Promise.all([
      WorkReport.find(q).populate('teacherId', 'name subjects').sort({ date: -1, submittedAt: -1, _id: -1 }).skip(p.skip).limit(p.limit).lean(),
      WorkReport.countDocuments(q),
      WorkReport.countDocuments({ instituteId, seenAt: null }),
    ]);
    // For one day: which active teachers haven't sent a report yet.
    let missing: { _id: unknown; name: string }[] | undefined;
    if (q.date && !q.teacherId) {
      const sent = await WorkReport.find({ instituteId, date: q.date }).distinct('teacherId');
      missing = await User.find({ instituteId, role: 'teacher', active: true, _id: { $nin: sent } }).select('name').sort({ name: 1 }).lean();
    }
    res.json({ ...paged(items, total, p), unseen, missing });
  }),
);

r.get(
  '/:id',
  allow('owner'),
  ah(async (req, res) => {
    const rep = await WorkReport.findOne({ _id: oid(req.params.id), instituteId: tid(req) }).populate('teacherId', 'name subjects').lean();
    if (!rep) throw new HttpError(404, 'Report not found');
    const t = rep.teacherId as unknown as { _id: Types.ObjectId; name: string } | null;
    res.json({ report: rep, activity: t ? await activityOf(req, t._id, t.name, rep.date) : null });
  }),
);

r.post(
  '/seen-all',
  allow('owner'),
  ah(async (req, res) => {
    const date = String(req.body?.date ?? '');
    const q: Record<string, unknown> = { instituteId: tid(req), seenAt: null };
    if (DATE_RX.test(date)) q.date = date;
    const r2 = await WorkReport.updateMany(q, { $set: { seenAt: new Date(), seenBy: req.user.id, seenByName: req.user.name } });
    res.json({ updated: r2.modifiedCount });
  }),
);

r.post(
  '/:id/seen',
  allow('owner'),
  ah(async (req, res) => {
    const comment = optStr(req.body?.comment, 1000);
    const rep = await WorkReport.findOne({ _id: oid(req.params.id), instituteId: tid(req) });
    if (!rep) throw new HttpError(404, 'Report not found');
    const firstSeen = !rep.seenAt;
    if (firstSeen) rep.set({ seenAt: new Date(), seenBy: req.user.id, seenByName: req.user.name });
    if (comment !== undefined) rep.ownerComment = comment ?? undefined;
    await rep.save();
    if (comment) {
      notify({
        institute: req.institute!, type: 'report', audience: 'staff', userId: rep.teacherId,
        title: 'Reply on your daily report', message: `${req.user.name}: ${comment}`, href: '/app/daily-report',
      }).catch(() => undefined);
    }
    res.json(await rep.populate('teacherId', 'name subjects'));
  }),
);

export default r;
