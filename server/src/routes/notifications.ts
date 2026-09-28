import { Router } from 'express';
import { allow, auth, tid } from '../middleware/auth.js';
import { Notification } from '../models/index.js';
import { hasFeature } from '../services/plan.js';
import { HttpError, ah, oid, str } from '../utils/http.js';
import { NOT_ENABLED } from '../middleware/auth.js';
import { pageParams, paged } from '../utils/paginate.js';

const r = Router();
r.use(
  auth,
  allow('owner', 'teacher', 'parent'),
  ah(async (req, _res, next) => {
    // Parents only have an inbox while the institute's plan includes the parent portal.
    if (req.user.role === 'parent' && !(await hasFeature(req.institute!, 'parentPortal'))) {
      throw new HttpError(402, NOT_ENABLED, 'UPGRADE_REQUIRED', { feature: 'parentPortal' });
    }
    next();
  }),
);

const TYPES = ['attendance', 'fee', 'test', 'announcement', 'system', 'payment'];

function scopeQuery(req: Parameters<typeof tid>[0]) {
  const instituteId = tid(req);
  if (req.user.role === 'parent') return { instituteId, audience: 'parent', studentId: { $in: req.user.studentIds } };
  // Teachers see staff-wide notices plus the ones addressed to them personally.
  if (req.user.role === 'teacher') return { instituteId, audience: 'staff', $or: [{ userId: req.user.id }, { userId: null }] };
  // Owners: their own notices + staff-wide ones (not notes addressed to one teacher).
  return { instituteId, $or: [{ audience: 'owner' }, { audience: 'staff', userId: null }] };
}

r.get(
  '/',
  ah(async (req, res) => {
    const base = scopeQuery(req);
    const q: Record<string, unknown> = { ...base };
    const type = str(req.query.type);
    if (type && TYPES.includes(type)) q.type = type;
    if (req.query.unread === '1') q.readBy = { $ne: req.user.id };
    const p = pageParams(req.query);

    // The header bell: latest 10 + an unread count capped at 100 (it shows "99+"), nothing else.
    if (req.query.light === '1') {
      const [items, unread] = await Promise.all([
        Notification.find(base).select('-deliveries').sort({ createdAt: -1, _id: -1 }).limit(10).populate('studentId', 'name').lean(),
        Notification.countDocuments({ ...base, readBy: { $ne: req.user.id } }).limit(100),
      ]);
      return res.json({
        items: items.map((n) => ({ ...n, read: n.readBy.some((u) => String(u) === String(req.user.id)), readBy: undefined })),
        unread,
      });
    }
    const [items, total, unread, byType] = await Promise.all([
      Notification.find(q).select('-deliveries').sort({ createdAt: -1, _id: -1 }).skip(p.skip).limit(p.limit).populate('studentId', 'name').lean(),
      Notification.countDocuments(q),
      Notification.countDocuments({ ...base, readBy: { $ne: req.user.id } }).limit(1000),
      Notification.aggregate<{ _id: string; n: number }>([{ $match: base }, { $group: { _id: '$type', n: { $sum: 1 } } }]),
    ]);
    res.json({
      ...paged(items.map((n) => ({ ...n, read: n.readBy.some((u) => String(u) === String(req.user.id)), readBy: undefined })), total, p),
      unread,
      // across the whole inbox (not just this page), for the filter chips
      counts: { all: byType.reduce((a, x) => a + x.n, 0), ...Object.fromEntries(byType.map((x) => [x._id, x.n])) },
    });
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
    const type = str(req.query.type);
    const audience = str(req.query.audience);
    if (type && TYPES.includes(type)) q.type = type;
    if (audience && ['owner', 'staff', 'parent'].includes(audience)) q.audience = audience;
    const p = pageParams(req.query);
    const [items, total] = await Promise.all([
      Notification.find(q).sort({ createdAt: -1, _id: -1 }).skip(p.skip).limit(p.limit).populate('studentId', 'name').lean(),
      Notification.countDocuments(q),
    ]);
    // Channel totals for the last 30 days (not all-time, which grows forever).
    const byChannel = await Notification.aggregate([
      { $match: { instituteId: tid(req), createdAt: { $gte: new Date(Date.now() - 30 * 86400000) } } },
      { $project: { deliveries: 1 } },
      { $unwind: '$deliveries' },
      { $group: { _id: { channel: '$deliveries.channel', status: '$deliveries.status' }, n: { $sum: 1 } } },
    ]);
    res.json({ ...paged(items, total, p), byChannel: byChannel.map((x) => ({ ...x._id, count: x.n })) });
  }),
);

export default r;
