import { Router } from 'express';
import crypto from 'node:crypto';
import { allow, auth, tid } from '../middleware/auth.js';
import { Plan, Student, SubscriptionPayment, SupportTicket, User } from '../models/index.js';
import { effectivePlanKey, trialDaysLeft } from '../services/plan.js';
import { HttpError, ah, required } from '../utils/http.js';

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
      SubscriptionPayment.find({ instituteId: inst._id }).sort({ createdAt: -1 }).limit(24).lean(),
    ]);
    res.json({
      plan: inst.plan,
      effectivePlan: effectivePlanKey(inst),
      status: inst.status,
      billingCycle: inst.billingCycle,
      trialEndsAt: inst.trialEndsAt,
      trialDaysLeft: trialDaysLeft(inst),
      currentPeriodEnd: inst.currentPeriodEnd,
      usage: { students, teachers },
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
    required(req.body ?? {}, ['plan', 'cycle']);
    const plan = await Plan.findOne({ key: req.body.plan }).lean();
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

    const end = new Date();
    end.setMonth(end.getMonth() + (cycle === 'yearly' ? 12 : 1));
    inst.plan = plan.key;
    inst.billingCycle = cycle;
    inst.status = 'active';
    inst.currentPeriodEnd = end;
    await inst.save();
    res.json({ ok: true, reference, amount, plan: plan.key, cycle, currentPeriodEnd: end });
  }),
);

r.post(
  '/cancel',
  ah(async (req, res) => {
    const inst = req.institute!;
    inst.status = 'cancelled';
    await inst.save();
    res.json({ ok: true });
  }),
);

r.get('/tickets', ah(async (req, res) => res.json(await SupportTicket.find({ instituteId: tid(req) }).sort({ createdAt: -1 }).lean())));

r.post(
  '/tickets',
  ah(async (req, res) => {
    required(req.body ?? {}, ['subject', 'message']);
    const t = await SupportTicket.create({
      instituteId: tid(req),
      subject: req.body.subject,
      message: req.body.message,
      priority: ['low', 'normal', 'high'].includes(req.body.priority) ? req.body.priority : 'normal',
      createdBy: req.user.id,
    });
    res.status(201).json(t);
  }),
);

export default r;
