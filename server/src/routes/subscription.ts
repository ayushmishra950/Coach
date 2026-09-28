import { Router } from 'express';
import crypto from 'node:crypto';
import { allow, auth, tid } from '../middleware/auth.js';
import { Plan, Student, SubscriptionPayment, SupportTicket, User } from '../models/index.js';
import { config } from '../config.js';
import { effectivePlanKey, nextPeriodEnd, trialDaysLeft } from '../services/plan.js';
import { audit } from '../services/audit.js';
import { HttpError, ah, oid, required, str } from '../utils/http.js';
import { pageParams, paged } from '../utils/paginate.js';

const r = Router();
r.use(auth, allow('owner'));

r.get(
  '/',
  ah(async (req, res) => {
    const inst = req.institute!;
    const [plans, students, teachers, history] = await Promise.all([
      Plan.find().sort({ order: 1 }).lean(),
      Student.countDocuments({ instituteId: inst._id, status: 'active' }),
      User.countDocuments({ instituteId: inst._id, role: 'teacher', active: true }),
      SubscriptionPayment.find({ instituteId: inst._id }).sort({ createdAt: -1 }).limit(20).lean(),
    ]);
    res.json({
      plan: inst.plan,
      effectivePlan: effectivePlanKey(inst),
      status: inst.status,
      billingCycle: inst.billingCycle,
      trialEndsAt: inst.trialEndsAt,
      trialDaysLeft: trialDaysLeft(inst),
      currentPeriodEnd: inst.currentPeriodEnd,
      cancelAtPeriodEnd: !!inst.cancelAtPeriodEnd,
      usage: { students, teachers },
      paymentsEnabled: config.demoPayments,
      plans,
      history,
    });
  }),
);

/**
 * Checkout. Demo mode charges instantly; replace the block marked PAYMENT GATEWAY
 * with a Razorpay subscription/order + webhook verification for production.
 */
r.post(
  '/checkout',
  ah(async (req, res) => {
    const inst = req.institute!;
    if (!config.demoPayments) {
      throw new HttpError(503, 'Online payment is not set up yet. Please contact CoachFlow support to upgrade your plan.');
    }
    required(req.body ?? {}, ['plan', 'cycle']);
    const plan = await Plan.findOne({ key: str(req.body.plan) ?? '' }).lean();
    if (!plan) throw new HttpError(400, 'Unknown plan');
    const cycle = req.body.cycle === 'yearly' ? 'yearly' : 'monthly';
    const [students, teachers] = await Promise.all([
      Student.countDocuments({ instituteId: inst._id, status: 'active' }),
      User.countDocuments({ instituteId: inst._id, role: 'teacher', active: true }),
    ]);
    if (students > plan.studentLimit) throw new HttpError(400, `You have ${students} active students — the ${plan.name} plan allows ${plan.studentLimit}.`);
    if (teachers > plan.teacherLimit) throw new HttpError(400, `You have ${teachers} teachers — the ${plan.name} plan allows ${plan.teacherLimit}.`);

    // ── PAYMENT GATEWAY (demo) ──
    const amount = cycle === 'yearly' ? plan.priceYearly : plan.priceMonthly;
    const reference = 'pay_' + crypto.randomBytes(7).toString('hex');
    await SubscriptionPayment.create({ instituteId: inst._id, plan: plan.key, cycle, amount, status: 'success', reference });

    // Renewing early keeps the days already paid for.
    const end = nextPeriodEnd(inst.status === 'active' || inst.status === 'past_due' ? inst.currentPeriodEnd : null, cycle);
    inst.plan = plan.key;
    inst.billingCycle = cycle;
    inst.status = 'active';
    inst.currentPeriodEnd = end;
    inst.cancelAtPeriodEnd = false;
    await inst.save();
    audit(req, 'subscription.checkout', 'Institute', inst._id, `${plan.name} ${cycle} ₹${amount}`);
    res.json({ ok: true, reference, amount, plan: plan.key, cycle, currentPeriodEnd: end });
  }),
);

r.post(
  '/cancel',
  ah(async (req, res) => {
    const inst = req.institute!;
    // A paid period keeps running to its end; a trial (nothing paid) stops now.
    if ((inst.status === 'active' || inst.status === 'past_due') && inst.currentPeriodEnd && inst.currentPeriodEnd > new Date()) {
      inst.cancelAtPeriodEnd = true;
    } else {
      inst.status = 'cancelled';
      inst.cancelledAt = new Date();
    }
    await inst.save();
    audit(req, 'subscription.cancel', 'Institute', inst._id, inst.cancelAtPeriodEnd ? `ends ${inst.currentPeriodEnd?.toLocaleDateString('en-IN')}` : 'immediately');
    res.json({ ok: true, cancelAtPeriodEnd: !!inst.cancelAtPeriodEnd, currentPeriodEnd: inst.currentPeriodEnd });
  }),
);

/** Changed their mind before the period ended. */
r.post(
  '/resume',
  ah(async (req, res) => {
    const inst = req.institute!;
    if (!inst.cancelAtPeriodEnd) throw new HttpError(400, 'Your subscription is not scheduled to cancel');
    if (inst.status === 'cancelled' || !inst.currentPeriodEnd || inst.currentPeriodEnd < new Date()) {
      throw new HttpError(400, 'Your paid period has already ended — choose a plan to subscribe again.');
    }
    inst.cancelAtPeriodEnd = false;
    await inst.save();
    audit(req, 'subscription.resume', 'Institute', inst._id);
    res.json({ ok: true });
  }),
);

r.get(
  '/tickets',
  ah(async (req, res) => {
    const q = { instituteId: tid(req) };
    const p = pageParams(req.query);
    const [items, total] = await Promise.all([
      SupportTicket.find(q).sort({ createdAt: -1, _id: -1 }).skip(p.skip).limit(p.limit).lean(),
      SupportTicket.countDocuments(q),
    ]);
    res.json(paged(items, total, p));
  }),
);

r.post(
  '/tickets',
  ah(async (req, res) => {
    required(req.body ?? {}, ['subject', 'message']);
    const t = await SupportTicket.create({
      instituteId: tid(req),
      subject: String(req.body.subject).trim().slice(0, 150),
      message: String(req.body.message).trim().slice(0, 3000),
      priority: ['low', 'normal', 'high'].includes(req.body.priority) ? req.body.priority : 'normal',
      createdBy: req.user.id,
    });
    res.status(201).json(t);
  }),
);

/** The owner answers support's question on their ticket (reopens it if it was resolved). */
r.post(
  '/tickets/:id/reply',
  ah(async (req, res) => {
    const text = String(req.body?.text ?? '').trim().slice(0, 3000);
    if (!text) throw new HttpError(400, 'Reply cannot be empty');
    const t = await SupportTicket.findOneAndUpdate(
      { _id: oid(req.params.id), instituteId: tid(req) },
      { $push: { replies: { by: `${req.user.name} (institute)`, text, at: new Date() } }, $set: { status: 'open' } },
      { new: true },
    );
    if (!t) throw new HttpError(404, 'Ticket not found');
    res.json(t);
  }),
);

export default r;
