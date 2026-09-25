import { Router } from 'express';
import { allow, auth, scopedBatchIds, tid } from '../middleware/auth.js';
import { Announcement, Batch, Student } from '../models/index.js';
import { notify } from '../services/notify.js';
import { HttpError, ah, oid, required } from '../utils/http.js';

const r = Router();
r.use(auth, allow('owner', 'teacher'));

r.get(
  '/',
  ah(async (req, res) => {
    const scoped = await scopedBatchIds(req);
    const q: Record<string, unknown> = { instituteId: tid(req) };
    if (scoped) q.$or = [{ batchIds: { $size: 0 } }, { batchIds: { $in: scoped } }];
    res.json(await Announcement.find(q).populate('batchIds', 'name').sort({ pinned: -1, createdAt: -1 }).limit(100).lean());
  }),
);

r.post(
  '/',
  ah(async (req, res) => {
    const instituteId = tid(req);
    required(req.body ?? {}, ['title', 'body']);
    const scoped = await scopedBatchIds(req);
    let batchIds = Array.isArray(req.body.batchIds) ? req.body.batchIds.map(oid) : [];
    if (scoped) {
      if (!batchIds.length) throw new HttpError(400, 'Teachers must choose at least one of their batches');
      if (batchIds.some((b: unknown) => !scoped.some((s) => String(s) === String(b)))) throw new HttpError(403, 'You can only post to your own batches');
    }
    batchIds = (await Batch.find({ instituteId, _id: { $in: batchIds } }).select('_id').lean()).map((b) => b._id);
    const a = await Announcement.create({
      instituteId,
      title: req.body.title,
      body: req.body.body,
      batchIds,
      pinned: !!req.body.pinned && req.user.role === 'owner',
      createdBy: req.user.id,
      createdByName: req.user.name,
    });

    // Fan out to parents of affected students
    const students = await Student.find({ instituteId, status: 'active', ...(batchIds.length ? { batchIds: { $in: batchIds } } : {}) }).lean();
    for (const s of students) {
      await notify({
        institute: req.institute!,
        type: 'announcement',
        audience: 'parent',
        studentId: s._id,
        title: a.title,
        message: a.body,
        contact: { phone: s.parentPhone ?? undefined, email: s.parentEmail ?? undefined },
      });
    }
    res.status(201).json({ announcement: a, recipients: students.length });
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
