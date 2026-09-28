import { Router } from 'express';
import { Types } from 'mongoose';
import { allow, auth, scopedBatchIds, tid } from '../middleware/auth.js';
import { Announcement, Batch, Student, type InstituteDoc } from '../models/index.js';
import { notify, notifyMany, type NotifyInput } from '../services/notify.js';
import { HttpError, ah, oid, required } from '../utils/http.js';
import { pageParams, paged } from '../utils/paginate.js';
import { rateLimit } from '../utils/security.js';

const r = Router();
r.use(auth, allow('owner', 'teacher'));

const postLimit = rateLimit({
  windowMs: 60 * 60_000,
  max: 30,
  message: 'Too many announcements in the last hour. Please try again later.',
  key: (req) => `ann:${String(req.user.id)}`,
});

/**
 * Sends an announcement to parents in the background, so posting returns at once even for
 * thousands of students. One message per family: siblings share a single notice.
 */
function fanOut(institute: InstituteDoc, a: { title: string; body: string }, batchIds: Types.ObjectId[]) {
  setImmediate(async () => {
    try {
      const students = await Student.find({ instituteId: institute._id, status: 'active', ...(batchIds.length ? { batchIds: { $in: batchIds } } : {}) })
        .select('_id parentUserId parentPhone parentEmail')
        .lean();
      const seen = new Set<string>();
      const inputs: NotifyInput[] = [];
      for (const s of students) {
        const family = String(s.parentUserId ?? s.parentPhone ?? s.parentEmail ?? s._id);
        if (seen.has(family)) continue;
        seen.add(family);
        inputs.push({
          institute,
          type: 'announcement',
          audience: 'parent',
          studentId: s._id,
          title: a.title,
          message: a.body,
          contact: { phone: s.parentPhone ?? undefined, email: s.parentEmail ?? undefined },
        });
      }
      await notifyMany(inputs);
    } catch (e) {
      console.error('[announcement fan-out]', (e as Error).message);
    }
  });
}

function clean(body: Record<string, unknown>) {
  const title = String(body.title ?? '').trim().slice(0, 150);
  const text = String(body.body ?? '').trim().slice(0, 3000);
  if (!title || !text) throw new HttpError(400, 'Title and message are required');
  return { title, body: text };
}

r.get(
  '/',
  ah(async (req, res) => {
    const scoped = await scopedBatchIds(req);
    const q: Record<string, unknown> = { instituteId: tid(req) };
    if (scoped) q.$or = [{ batchIds: { $size: 0 } }, { batchIds: { $in: scoped } }];
    const p = pageParams(req.query);
    const [items, total] = await Promise.all([
      Announcement.find(q).populate('batchIds', 'name').sort({ pinned: -1, createdAt: -1, _id: -1 }).skip(p.skip).limit(p.limit).lean(),
      Announcement.countDocuments(q),
    ]);
    res.json(paged(items, total, p));
  }),
);

r.post(
  '/',
  postLimit,
  ah(async (req, res) => {
    const instituteId = tid(req);
    required(req.body ?? {}, ['title', 'body']);
    const { title, body } = clean(req.body);
    const scoped = await scopedBatchIds(req);
    let batchIds: Types.ObjectId[] = Array.isArray(req.body.batchIds) ? req.body.batchIds.map(oid) : [];
    if (scoped) {
      if (!batchIds.length) throw new HttpError(400, 'Teachers must choose at least one of their batches');
      if (batchIds.some((b) => !scoped.some((s) => String(s) === String(b)))) throw new HttpError(403, 'You can only post to your own batches');
    }
    const requested = batchIds.length;
    batchIds = (await Batch.find({ instituteId, _id: { $in: batchIds } }).select('_id').lean()).map((b) => b._id);
    // Never widen a batch announcement to "everyone" because a chosen batch no longer exists.
    if (requested && batchIds.length !== requested) throw new HttpError(400, 'One of the selected batches no longer exists. Please refresh and choose again.');
    const staffOnly = req.user.role === 'owner' && !!req.body.staffOnly;
    const a = await Announcement.create({
      instituteId,
      title,
      body,
      batchIds,
      staffOnly,
      pinned: !!req.body.pinned && req.user.role === 'owner',
      createdBy: req.user.id,
      createdByName: req.user.name,
    });

    const recipients = staffOnly
      ? 0
      : await Student.countDocuments({ instituteId, status: 'active', ...(batchIds.length ? { batchIds: { $in: batchIds } } : {}) });
    if (!staffOnly) fanOut(req.institute!, a, batchIds);
    // Institute-wide notices from the owner also reach every teacher's bell.
    if (req.user.role === 'owner' && !batchIds.length) {
      notify({ institute: req.institute!, type: 'announcement', audience: 'staff', title: a.title, message: a.body }).catch(() => {});
    }
    res.status(201).json({ announcement: a, recipients });
  }),
);

/** Fix a typo: owner, or the teacher who posted it. Not re-sent to parents. */
r.put(
  '/:id',
  ah(async (req, res) => {
    const q: Record<string, unknown> = { _id: oid(req.params.id), instituteId: tid(req) };
    if (req.user.role === 'teacher') q.createdBy = req.user.id;
    const a = await Announcement.findOneAndUpdate(q, { $set: { ...clean(req.body ?? {}), editedAt: new Date() } }, { new: true });
    if (!a) throw new HttpError(404, 'Announcement not found');
    res.json(a);
  }),
);

r.put(
  '/:id/pin',
  allow('owner'),
  ah(async (req, res) => {
    const a = await Announcement.findOne({ _id: oid(req.params.id), instituteId: tid(req) });
    if (!a) throw new HttpError(404, 'Announcement not found');
    a.pinned = !a.pinned;
    await a.save();
    res.json(a);
  }),
);

r.delete(
  '/:id',
  ah(async (req, res) => {
    const q: Record<string, unknown> = { _id: oid(req.params.id), instituteId: tid(req) };
    if (req.user.role === 'teacher') q.createdBy = req.user.id;
    const a = await Announcement.findOneAndDelete(q);
    if (!a) throw new HttpError(404, 'Announcement not found');
    res.json({ ok: true });
  }),
);

export default r;
