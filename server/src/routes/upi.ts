import { Router, type Request } from 'express';
import { upiHandler } from 'pure-upi';
import { allow, auth } from '../middleware/auth.js';
import { Institute } from '../models/index.js';
import { upi, upiEnabled } from '../services/upi.js';
import { HttpError, ah } from '../utils/http.js';

/**
 * /api/upi — plan payments by UPI QR (pure-upi). Institute owners create orders and submit the UTR;
 * the Super Admin lists, approves and rejects them.
 *
 *   POST /orders { plan: "growth_monthly" } · GET /orders · GET /orders/:id · POST /orders/:id/utr { utr }
 *   GET /admin/orders?status=submitted · POST /admin/orders/:id/approve · POST /admin/orders/:id/reject { reason }
 */
const r = Router();
r.use(auth, (_req, _res, next) => next(upiEnabled() ? undefined : new HttpError(503, 'UPI payments are not set up yet. Please contact CoachFlow support.')));

/** Admin list with the institute's name next to each order. */
r.get(
  '/admin/orders',
  allow('superadmin'),
  ah(async (req, res) => {
    const status = typeof req.query.status === 'string' && ['pending', 'submitted', 'approved', 'rejected'].includes(req.query.status)
      ? (req.query.status as 'pending' | 'submitted' | 'approved' | 'rejected')
      : undefined;
    const amount = typeof req.query.amount === 'string' && req.query.amount ? req.query.amount : undefined;
    const orders = await upi.list({ status, amount, limit: 200 });
    const ids = [...new Set(orders.map((o) => o.userId))].filter((id) => /^[0-9a-f]{24}$/i.test(id));
    const insts = await Institute.find({ _id: { $in: ids } }).select('name city').lean();
    const byId = new Map(insts.map((i) => [String(i._id), { name: i.name, city: i.city }]));
    res.json({ orders: orders.map((o) => ({ ...o, institute: byId.get(o.userId) ?? null })) });
  }),
);

r.use(
  upiHandler<Request>(upi, {
    // Owners pay for their institute (the order belongs to the institute); the Super Admin verifies.
    getUser: (req) => {
      if (req.user.role === 'owner' && req.institute) return String(req.institute._id);
      if (req.user.role === 'superadmin') return String(req.user.id);
      throw new HttpError(403, 'Only the institute owner can pay for the plan');
    },
    isAdmin: (req) => req.user.role === 'superadmin',
    onError: (e) => console.error('[upi]', e),
  }),
);

export default r;
