import { Router } from 'express';
import { allow, auth, tid } from '../middleware/auth.js';
import { Notification } from '../models/index.js';
import { ah, oid } from '../utils/http.js';

const r = Router();
r.use(auth, allow('owner', 'teacher', 'parent'));

function scopeQuery(req: Parameters<typeof tid>[0]) {
  const instituteId = tid(req);
  if (req.user.role === 'parent') return { instituteId, audience: 'parent', studentId: { $in: req.user.studentIds } };
  if (req.user.role === 'teacher') return { instituteId, audience: 'staff' };
  return { instituteId, audience: { $in: ['owner', 'staff'] } };
}

r.get(
  '/',
  ah(async (req, res) => {
    const q = scopeQuery(req);
    const [items, unread] = await Promise.all([
      Notification.find(q).sort({ createdAt: -1 }).limit(Number(req.query.limit) || 50).populate('studentId', 'name').lean(),
      Notification.countDocuments({ ...q, readBy: { $ne: req.user.id } }),
    ]);
    res.json({ items: items.map((n) => ({ ...n, read: n.readBy.some((u) => String(u) === String(req.user.id)), readBy: undefined })), unread });
  }),
);

r.put('/read-all', ah(async (req, res) => {
  await Notification.updateMany({ ...scopeQuery(req), readBy: { $ne: req.user.id } }, { $addToSet: { readBy: req.user.id } });
  res.json({ ok: true });
}));

r.put('/:id/read', ah(async (req, res) => {
  await Notification.updateOne({ _id: oid(req.params.id), ...scopeQuery(req) }, { $addToSet: { readBy: req.user.id } });
  res.json({ ok: true });
}));

/** Owner: full outbound message log across all channels. */
r.get(
  '/log',
  allow('owner'),
  ah(async (req, res) => {
    const q: Record<string, unknown> = { instituteId: tid(req) };
    if (req.query.type && req.query.type !== 'all') q.type = req.query.type;
    if (req.query.audience && req.query.audience !== 'all') q.audience = req.query.audience;
    const items = await Notification.find(q).sort({ createdAt: -1 }).limit(200).populate('studentId', 'name').lean();
    const byChannel = await Notification.aggregate([
      { $match: { instituteId: tid(req) } },
      { $unwind: '$deliveries' },
      { $group: { _id: { channel: '$deliveries.channel', status: '$deliveries.status' }, n: { $sum: 1 } } },
    ]);
    res.json({ items, byChannel: byChannel.map((x) => ({ ...x._id, count: x.n })) });
  }),
);

export default r;
