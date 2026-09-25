import { Router } from 'express';
import { allow, auth } from '../middleware/auth.js';
import { Attendance, FEATURE_KEYS, Institute, Notification, Payment, Plan, Student, SubscriptionPayment, SupportTicket, Test, User } from '../models/index.js';
import { effectivePlanKey, monthlyValue } from '../services/plan.js';
import { HttpError, ah, oid } from '../utils/http.js';

const r = Router();
r.use(auth, allow('superadmin'));

r.get(
  '/stats',
  ah(async (_req, res) => {
    const [institutes, plans, failed30, openTickets, totalStudents, usage] = await Promise.all([
      Institute.find().lean(),
      Plan.find().lean(),
      SubscriptionPayment.countDocuments({ status: 'failed', createdAt: { $gte: new Date(Date.now() - 30 * 86400000) } }),
      SupportTicket.countDocuments({ status: { $ne: 'resolved' } }),
      Student.countDocuments({ status: 'active' }),
      Promise.all([Attendance.countDocuments(), Test.countDocuments(), Payment.countDocuments(), Notification.countDocuments()]),
    ]);
    const priceOf = (key: string) => plans.find((p) => p.key === key)!;
    const active = institutes.filter((i) => i.status === 'active');
    const mrr = active.reduce((s, i) => s + monthlyValue(priceOf(i.plan), i.billingCycle ?? 'monthly'), 0);
    const byStatus = (s: string) => institutes.filter((i) => i.status === s).length;

    const now = new Date();
    const months = Array.from({ length: 6 }, (_, k) => new Date(now.getFullYear(), now.getMonth() - 5 + k, 1));
    const revenueAgg = await SubscriptionPayment.aggregate<{ _id: { y: number; m: number }; s: number }>([
      { $match: { status: 'success', createdAt: { $gte: months[0] } } },
      { $group: { _id: { y: { $year: '$createdAt' }, m: { $month: '$createdAt' } }, s: { $sum: '$amount' } } },
    ]);

    res.json({
      totals: {
        institutes: institutes.length,
        active: active.length,
        trial: byStatus('trial'),
        cancelled: byStatus('cancelled'),
        pastDue: byStatus('past_due'),
        suspended: byStatus('suspended'),
        premium: active.filter((i) => i.plan === 'premium').length,
        mrr,
        arr: mrr * 12,
        arpa: active.length ? Math.round(mrr / active.length) : 0,
        churnRate: institutes.length ? Math.round((byStatus('cancelled') / institutes.length) * 1000) / 10 : 0,
        failedPayments30d: failed30,
        openTickets,
        totalStudents,
      },
      planDistribution: plans
        .sort((a, b) => a.order - b.order)
        .map((p) => ({ plan: p.name, key: p.key, count: active.filter((i) => i.plan === p.key).length, mrr: active.filter((i) => i.plan === p.key).reduce((s, i) => s + monthlyValue(p, i.billingCycle ?? 'monthly'), 0) })),
      signups: months.map((m) => ({
        month: m.toLocaleString('en-IN', { month: 'short' }),
        count: institutes.filter((i) => i.createdAt >= m && i.createdAt < new Date(m.getFullYear(), m.getMonth() + 1, 1)).length,
      })),
      revenue: months.map((m) => ({
        month: m.toLocaleString('en-IN', { month: 'short' }),
        amount: revenueAgg.find((x) => x._id.y === m.getFullYear() && x._id.m === m.getMonth() + 1)?.s ?? 0,
      })),
      featureUsage: [
        { feature: 'Attendance sessions', count: usage[0] },
        { feature: 'Tests created', count: usage[1] },
        { feature: 'Fee payments', count: usage[2] },
        { feature: 'Notifications sent', count: usage[3] },
      ],
    });
  }),
);

r.get(
  '/institutes',
  ah(async (req, res) => {
    const { search, status, plan } = req.query as Record<string, string>;
    const q: Record<string, unknown> = {};
    if (status && status !== 'all') q.status = status;
    if (plan && plan !== 'all') q.plan = plan;
    if (search) q.$or = [{ name: new RegExp(search, 'i') }, { city: new RegExp(search, 'i') }, { email: new RegExp(search, 'i') }];
    const [institutes, plans, studentCounts, teacherCounts] = await Promise.all([
      Institute.find(q).sort({ createdAt: -1 }).lean(),
      Plan.find().lean(),
      Student.aggregate([{ $match: { status: 'active' } }, { $group: { _id: '$instituteId', n: { $sum: 1 } } }]),
      User.aggregate([{ $match: { role: 'teacher', active: true } }, { $group: { _id: '$instituteId', n: { $sum: 1 } } }]),
    ]);
    res.json(
      institutes.map((i) => ({
        ...i,
        effectivePlan: effectivePlanKey(i as never),
        students: studentCounts.find((c) => String(c._id) === String(i._id))?.n ?? 0,
        teachers: teacherCounts.find((c) => String(c._id) === String(i._id))?.n ?? 0,
        mrr: i.status === 'active' ? monthlyValue(plans.find((p) => p.key === i.plan)!, i.billingCycle ?? 'monthly') : 0,
      })),
    );
  }),
);

r.put(
  '/institutes/:id',
  ah(async (req, res) => {
    const inst = await Institute.findById(oid(req.params.id));
    if (!inst) throw new HttpError(404, 'Institute not found');
    const { plan, status, extendTrialDays } = req.body ?? {};
    if (plan) inst.plan = plan;
    if (status) inst.status = status;
    if (extendTrialDays) {
      const base = inst.trialEndsAt && inst.trialEndsAt > new Date() ? inst.trialEndsAt : new Date();
      inst.trialEndsAt = new Date(base.getTime() + Number(extendTrialDays) * 86400000);
      inst.status = 'trial';
    }
    await inst.save();
    res.json(inst);
  }),
);

r.get('/plans', ah(async (_req, res) => res.json({ plans: await Plan.find().sort({ order: 1 }).lean(), featureKeys: FEATURE_KEYS })));

r.put(
  '/plans/:key',
  ah(async (req, res) => {
    const b = req.body ?? {};
    const update: Record<string, unknown> = {};
    for (const k of ['name', 'tagline', 'priceMonthly', 'priceYearly', 'studentLimit', 'teacherLimit', 'whatsappLimit', 'popular'] as const) if (b[k] !== undefined) update[k] = b[k];
    if (Array.isArray(b.features)) update.features = b.features.filter((f: string) => (FEATURE_KEYS as readonly string[]).includes(f));
    const plan = await Plan.findOneAndUpdate({ key: req.params.key }, update, { new: true, runValidators: true });
    if (!plan) throw new HttpError(404, 'Plan not found');
    if (b.popular) await Plan.updateMany({ key: { $ne: plan.key } }, { popular: false });
    res.json(plan);
  }),
);

r.get(
  '/payments',
  ah(async (req, res) => {
    const q: Record<string, unknown> = {};
    if (req.query.status && req.query.status !== 'all') q.status = req.query.status;
    res.json(await SubscriptionPayment.find(q).populate('instituteId', 'name city').sort({ createdAt: -1 }).limit(300).lean());
  }),
);

r.get('/tickets', ah(async (_req, res) => res.json(await SupportTicket.find().populate('instituteId', 'name city plan').sort({ status: 1, createdAt: -1 }).lean())));

r.put(
  '/tickets/:id',
  ah(async (req, res) => {
    const t = await SupportTicket.findById(oid(req.params.id));
    if (!t) throw new HttpError(404, 'Ticket not found');
    if (req.body?.status) t.status = req.body.status;
    if (req.body?.reply) t.replies.push({ by: 'CoachFlow Support', text: req.body.reply, at: new Date() });
    await t.save();
    res.json(t);
  }),
);

export default r;
