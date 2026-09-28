import bcrypt from 'bcryptjs';
import { Router } from 'express';
import type { Request } from 'express';
import { allow, auth } from '../middleware/auth.js';
import type { InstituteDoc } from '../models/index.js';
import { Attendance, AuditLog, Batch, FEATURE_KEYS, Institute, Notification, Payment, Plan, Student, SubscriptionPayment, SupportTicket, Test, User } from '../models/index.js';
import { audit as auditLog } from '../services/audit.js';
import { notify } from '../services/notify.js';
import { effectivePlanKey, invalidatePlanCache, monthlyValue, nextPeriodEnd } from '../services/plan.js';
import { disconnectInstitute, disconnectUser } from '../services/realtime.js';
import { monthKey } from '../utils/dates.js';
import { escapeRegex, generatePassword } from '../utils/security.js';
import { HttpError, ah, oid, str } from '../utils/http.js';
import { pageParams, paged } from '../utils/paginate.js';

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
      // Rough totals from collection metadata — no full scans across every tenant.
      Promise.all([Attendance.estimatedDocumentCount(), Test.estimatedDocumentCount(), Payment.estimatedDocumentCount(), Notification.estimatedDocumentCount()]),
    ]);
    const priceOf = (key: string) => plans.find((p) => p.key === key)!;
    const now = new Date();
    const active = institutes.filter((i) => i.status === 'active');
    // Recurring revenue = every account still being billed (active or past-due, not ending).
    const billing = institutes.filter((i) => (i.status === 'active' || i.status === 'past_due') && !i.cancelAtPeriodEnd);
    const mrr = billing.reduce((s, i) => s + monthlyValue(priceOf(i.plan), i.billingCycle ?? 'monthly'), 0);
    const byStatus = (s: string) => institutes.filter((i) => i.status === s).length;
    const trialLive = institutes.filter((i) => i.status === 'trial' && (!i.trialEndsAt || i.trialEndsAt > now)).length;
    const trialExpired = byStatus('trial') - trialLive;
    // Churn = paid accounts that cancelled in the last 30 days ÷ paid accounts at the start of it.
    const since30 = new Date(now.getTime() - 30 * 86400000);
    const churned30 = institutes.filter((i) => i.status === 'cancelled' && i.cancelledAt && i.cancelledAt >= since30).length;
    const paidBase = billing.length + churned30;

    const months = Array.from({ length: 6 }, (_, k) => new Date(now.getFullYear(), now.getMonth() - 5 + k, 1));
    const revenueAgg = await SubscriptionPayment.aggregate<{ _id: { y: number; m: number }; s: number }>([
      { $match: { status: 'success', createdAt: { $gte: months[0] } } },
      { $group: { _id: monthKey('$createdAt'), s: { $sum: '$amount' } } },
    ]);

    res.json({
      totals: {
        institutes: institutes.length,
        active: active.length,
        trial: trialLive,
        trialExpired,
        cancelled: byStatus('cancelled'),
        pastDue: byStatus('past_due'),
        suspended: byStatus('suspended'),
        premium: active.filter((i) => i.plan === 'premium').length,
        mrr,
        arr: mrr * 12,
        arpa: billing.length ? Math.round(mrr / billing.length) : 0,
        churnRate: paidBase ? Math.round((churned30 / paidBase) * 1000) / 10 : 0,
        endingSoon: institutes.filter((i) => i.cancelAtPeriodEnd && i.status === 'active').length,
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
    const search = str(req.query.search);
    const status = str(req.query.status);
    const plan = str(req.query.plan);
    const q: Record<string, unknown> = {};
    if (status && status !== 'all') q.status = status;
    if (plan && plan !== 'all') q.plan = plan;
    if (search) {
      const rx = new RegExp(escapeRegex(search), 'i');
      q.$or = [{ name: rx }, { city: rx }, { email: rx }];
    }
    const p = pageParams(req.query);
    const [institutes, total, plans, activeForMrr] = await Promise.all([
      Institute.find(q).sort({ createdAt: -1, _id: -1 }).skip(p.skip).limit(p.limit).lean(),
      Institute.countDocuments(q),
      Plan.find().lean(),
      // MRR only comes from active institutes; on other status tabs it is 0.
      q.status && q.status !== 'active' ? Promise.resolve([]) : Institute.find({ ...q, status: 'active' }).select('plan billingCycle').lean(),
    ]);
    const ids = institutes.map((i) => i._id);
    const [studentCounts, teacherCounts] = await Promise.all([
      Student.aggregate([{ $match: { status: 'active', instituteId: { $in: ids } } }, { $group: { _id: '$instituteId', n: { $sum: 1 } } }]),
      User.aggregate([{ $match: { role: 'teacher', active: true, instituteId: { $in: ids } } }, { $group: { _id: '$instituteId', n: { $sum: 1 } } }]),
    ]);
    const mrrOf = (i: { plan: string; billingCycle?: string | null }) => {
      const plan = plans.find((x) => x.key === i.plan);
      return plan ? monthlyValue(plan, i.billingCycle ?? 'monthly') : 0;
    };
    res.json({
      ...paged(
        institutes.map((i) => ({
          ...i,
          effectivePlan: effectivePlanKey(i as never),
          students: studentCounts.find((c) => String(c._id) === String(i._id))?.n ?? 0,
          teachers: teacherCounts.find((c) => String(c._id) === String(i._id))?.n ?? 0,
          mrr: i.status === 'active' ? mrrOf(i) : 0,
        })),
        total,
        p,
      ),
      // across every institute matching the filters, not just this page
      mrr: activeForMrr.reduce((sum, i) => sum + mrrOf(i), 0),
    });
  }),
);

r.put(
  '/institutes/:id',
  ah(async (req, res) => {
    const inst = await Institute.findById(oid(req.params.id));
    if (!inst) throw new HttpError(404, 'Institute not found');
    const { plan, status, extendTrialDays, offlinePayment } = req.body ?? {};
    if (plan && !['starter', 'growth', 'premium'].includes(plan)) throw new HttpError(400, 'Unknown plan');
    if (status && !['trial', 'active', 'past_due', 'cancelled', 'suspended'].includes(status)) throw new HttpError(400, 'Unknown status');
    const trialDays = extendTrialDays ? Number(extendTrialDays) : 0;
    if (extendTrialDays && (!Number.isInteger(trialDays) || trialDays < 1 || trialDays > 365)) throw new HttpError(400, 'Trial extension must be 1–365 days');
    const before = `${inst.plan}/${inst.status}`;
    if (plan) inst.plan = plan;
    if (status === 'cancelled' && inst.status !== 'cancelled') inst.cancelledAt = new Date();
    if (status && status !== 'cancelled') inst.cancelAtPeriodEnd = false;
    if (status === 'suspended' && inst.status !== 'suspended') markSuspended(inst, req.body?.reason);
    else if (status && status !== 'suspended') {
      clearSuspension(inst);
      inst.status = status;
    }
    // Activating by hand (e.g. after an offline payment) starts a fresh billing period,
    // otherwise the account would drop straight back to past-due.
    if (status === 'active' && (!inst.currentPeriodEnd || inst.currentPeriodEnd < new Date())) {
      inst.currentPeriodEnd = nextPeriodEnd(null, inst.billingCycle === 'yearly' ? 'yearly' : 'monthly');
    }
    if (trialDays) {
      const base = inst.trialEndsAt && inst.trialEndsAt > new Date() ? inst.trialEndsAt : new Date();
      inst.trialEndsAt = new Date(base.getTime() + trialDays * 86400000);
      inst.status = 'trial';
      clearSuspension(inst);
    }
    await inst.save();
    // A bank transfer / cash payment taken outside the app still shows up in revenue.
    if (offlinePayment && Number(offlinePayment.amount) > 0) {
      await SubscriptionPayment.create({
        instituteId: inst._id,
        plan: inst.plan,
        cycle: inst.billingCycle === 'yearly' ? 'yearly' : 'monthly',
        amount: Math.round(Number(offlinePayment.amount)),
        status: 'success',
        reference: `offline:${String(offlinePayment.reference ?? '').slice(0, 60) || 'manual'}`,
      });
    }
    if (inst.status === 'suspended') disconnectInstitute(inst._id);
    auditLog(req, 'institute.update', 'Institute', inst._id, `${before} → ${inst.plan}/${inst.status}${trialDays ? ` · trial +${trialDays}d` : ''}${offlinePayment?.amount ? ` · offline ₹${offlinePayment.amount}` : ''}`, inst._id);
    res.json(inst);
  }),
);

/* ── Suspend / reactivate ────────────────────────────────────────────
 * Suspending blocks everyone of that institute — owner, teachers and parents — from logging
 * in, from every API call and from live chat, immediately. No data is deleted, so the
 * institute can be reactivated later exactly as it was. */

function markSuspended(inst: InstituteDoc, reason: unknown) {
  if (inst.status !== 'suspended') inst.statusBeforeSuspend = inst.status as 'trial' | 'active' | 'past_due' | 'cancelled';
  inst.status = 'suspended';
  inst.suspendedAt = new Date();
  inst.suspendedReason = typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, 200) : undefined;
}

function clearSuspension(inst: InstituteDoc) {
  inst.set('suspendedAt', undefined);
  inst.set('suspendedReason', undefined);
  inst.set('statusBeforeSuspend', undefined);
}

const audit = async (req: Request, inst: InstituteDoc, action: string) =>
  auditLog(req, action, 'Institute', inst._id, inst.suspendedReason ?? undefined, inst._id);

r.post(
  '/institutes/:id/suspend',
  ah(async (req, res) => {
    const inst = await Institute.findById(oid(req.params.id));
    if (!inst) throw new HttpError(404, 'Institute not found');
    if (inst.status === 'suspended') throw new HttpError(400, 'This institute is already suspended');
    markSuspended(inst, req.body?.reason);
    await inst.save();
    disconnectInstitute(inst._id);
    await audit(req, inst, 'institute.suspend');
    const [teachers, parents] = await Promise.all([
      User.countDocuments({ instituteId: inst._id, role: 'teacher', active: true }),
      User.countDocuments({ instituteId: inst._id, role: 'parent', active: true }),
    ]);
    res.json({ institute: inst, blocked: { owners: 1, teachers, parents } });
  }),
);

r.post(
  '/institutes/:id/reactivate',
  ah(async (req, res) => {
    const inst = await Institute.findById(oid(req.params.id));
    if (!inst) throw new HttpError(404, 'Institute not found');
    if (inst.status !== 'suspended') throw new HttpError(400, 'This institute is not suspended');
    // Go back to where they were. A paid plan whose period ended meanwhile becomes past-due
    // automatically on the next request, so reactivating never hands out a free plan.
    inst.status = inst.statusBeforeSuspend ?? (inst.trialEndsAt && inst.trialEndsAt > new Date() ? 'trial' : 'cancelled');
    clearSuspension(inst);
    await inst.save();
    await audit(req, inst, 'institute.reactivate');
    res.json({ institute: inst });
  }),
);

/** Owner forgot their password: support generates a one-time password to share with them. */
r.post(
  '/institutes/:id/reset-owner-password',
  ah(async (req, res) => {
    const owner = await User.findOne({ instituteId: oid(req.params.id), role: 'owner' }).sort({ createdAt: 1 });
    if (!owner) throw new HttpError(404, 'No owner account found for this institute');
    const reason = String(req.body?.reason ?? '').trim().slice(0, 200);
    if (reason.length < 3) throw new HttpError(400, 'Note how the owner was verified (e.g. "called from registered phone")');
    const password = generatePassword();
    owner.password = await bcrypt.hash(password, 10);
    owner.tokenVersion = (owner.tokenVersion ?? 0) + 1; // sign out every device
    await owner.save();
    disconnectUser(owner._id);
    auditLog(req, 'owner.password_reset', 'User', owner._id, `${owner.email} · ${reason}`, owner.instituteId);
    res.json({ email: owner.email, name: owner.name, password });
  }),
);

r.get('/plans', ah(async (_req, res) => res.json({ plans: await Plan.find().sort({ order: 1 }).lean(), featureKeys: FEATURE_KEYS })));

r.put(
  '/plans/:key',
  ah(async (req, res) => {
    const b = req.body ?? {};
    const update: Record<string, unknown> = {};
    for (const k of ['name', 'tagline'] as const) if (b[k] !== undefined) update[k] = String(b[k]).trim().slice(0, 80);
    for (const k of ['priceMonthly', 'priceYearly', 'studentLimit', 'teacherLimit', 'whatsappLimit'] as const) {
      if (b[k] === undefined) continue;
      const n = Number(b[k]);
      const min = k === 'whatsappLimit' ? -1 : 0;
      if (!Number.isInteger(n) || n < min || n > 10_000_000) throw new HttpError(400, `${k} must be a whole number${k === 'whatsappLimit' ? ' (-1 = unlimited)' : ''}`);
      update[k] = n;
    }
    if (b.popular !== undefined) update.popular = !!b.popular;
    if (Array.isArray(b.features)) update.features = b.features.filter((f: string) => (FEATURE_KEYS as readonly string[]).includes(f));
    const plan = await Plan.findOneAndUpdate({ key: req.params.key }, update, { new: true, runValidators: true });
    if (!plan) throw new HttpError(404, 'Plan not found');
    if (b.popular) await Plan.updateMany({ key: { $ne: plan.key } }, { popular: false });
    invalidatePlanCache();
    auditLog(req, 'plan.update', 'Plan', plan.key, Object.entries(update).map(([k, v]) => `${k}=${Array.isArray(v) ? v.length + ' features' : v}`).join(', '), null);
    res.json(plan);
  }),
);

r.get(
  '/payments',
  ah(async (req, res) => {
    const q: Record<string, unknown> = {};
    if (req.query.status === 'success' || req.query.status === 'failed' || req.query.status === 'refunded') q.status = req.query.status;
    const p = pageParams(req.query);
    const [items, total, byStatus] = await Promise.all([
      SubscriptionPayment.find(q).populate('instituteId', 'name city').sort({ createdAt: -1, _id: -1 }).skip(p.skip).limit(p.limit).lean(),
      SubscriptionPayment.countDocuments(q),
      // summary tiles: all payments regardless of the tab
      SubscriptionPayment.aggregate<{ _id: string; n: number; amount: number }>([{ $group: { _id: '$status', n: { $sum: 1 }, amount: { $sum: '$amount' } } }]),
    ]);
    const get = (st: string) => byStatus.find((x) => x._id === st) ?? { n: 0, amount: 0 };
    const ok = get('success'), failed = get('failed'), refunded = get('refunded');
    res.json({
      ...paged(items, total, p),
      summary: {
        collected: ok.amount, successCount: ok.n, failed: failed.n, failedAmount: failed.amount, refunded: refunded.amount, refundedCount: refunded.n,
        rate: ok.n + failed.n ? Math.round((ok.n / (ok.n + failed.n)) * 1000) / 10 : 0,
      },
    });
  }),
);

/** Every matching subscription payment — only for the CSV download. */
r.get(
  '/payments/export',
  ah(async (req, res) => {
    const q: Record<string, unknown> = {};
    if (typeof req.query.status === 'string' && req.query.status !== 'all') q.status = req.query.status;
    res.json(await SubscriptionPayment.find(q).populate('instituteId', 'name city').sort({ createdAt: -1, _id: -1 }).lean());
  }),
);

r.get(
  '/tickets',
  ah(async (req, res) => {
    const q: Record<string, unknown> = {};
    if (typeof req.query.status === 'string' && req.query.status !== 'all') q.status = req.query.status;
    const p = pageParams(req.query);
    const [items, total, counts] = await Promise.all([
      SupportTicket.find(q).populate('instituteId', 'name city plan').sort({ status: 1, createdAt: -1, _id: -1 }).skip(p.skip).limit(p.limit).lean(),
      SupportTicket.countDocuments(q),
      SupportTicket.aggregate<{ _id: string; n: number }>([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    ]);
    res.json({ ...paged(items, total, p), counts: Object.fromEntries(counts.map((c) => [c._id, c.n])) });
  }),
);

r.put(
  '/tickets/:id',
  ah(async (req, res) => {
    const t = await SupportTicket.findById(oid(req.params.id));
    if (!t) throw new HttpError(404, 'Ticket not found');
    if (req.body?.status && !['open', 'in_progress', 'resolved'].includes(req.body.status)) throw new HttpError(400, 'Unknown status');
    if (req.body?.status) t.status = req.body.status;
    const reply = typeof req.body?.reply === 'string' ? req.body.reply.trim().slice(0, 3000) : '';
    if (reply) t.replies.push({ by: 'CoachFlow Support', text: reply, at: new Date() });
    await t.save();
    // Let the institute owner know support answered (or closed) their ticket.
    if (reply || req.body?.status === 'resolved') {
      const inst = await Institute.findById(t.instituteId);
      if (inst) {
        notify({
          institute: inst,
          type: 'system',
          audience: 'owner',
          title: reply ? `Support replied: ${t.subject}` : `Ticket resolved: ${t.subject}`,
          message: reply ? reply.slice(0, 300) : 'Your support ticket was marked resolved. Reply on it if you still need help.',
        }).catch(() => {});
      }
    }
    res.json(t);
  }),
);

/** One institute in full: people, usage, billing, tickets and its audit trail. */
r.get(
  '/institutes/:id',
  ah(async (req, res) => {
    const id = oid(req.params.id);
    const inst = await Institute.findById(id).lean();
    if (!inst) throw new HttpError(404, 'Institute not found');
    const [owners, teachers, parents, students, batches, payments, tickets, logs, lastLogin] = await Promise.all([
      User.find({ instituteId: id, role: 'owner' }).select('name email phone lastLoginAt active').lean(),
      User.countDocuments({ instituteId: id, role: 'teacher', active: true }),
      User.countDocuments({ instituteId: id, role: 'parent', active: true }),
      Student.countDocuments({ instituteId: id, status: 'active' }),
      Batch.countDocuments({ instituteId: id, active: true }),
      SubscriptionPayment.find({ instituteId: id }).sort({ createdAt: -1 }).limit(10).lean(),
      SupportTicket.find({ instituteId: id }).sort({ createdAt: -1 }).limit(10).select('subject status priority createdAt').lean(),
      AuditLog.find({ instituteId: id }).sort({ createdAt: -1 }).limit(30).lean(),
      User.findOne({ instituteId: id }).sort({ lastLoginAt: -1 }).select('lastLoginAt').lean(),
    ]);
    res.json({
      institute: { ...inst, effectivePlan: effectivePlanKey(inst as never) },
      owners,
      counts: { students, teachers, parents, batches },
      lastActiveAt: lastLogin?.lastLoginAt ?? null,
      payments,
      tickets,
      audit: logs,
    });
  }),
);

/** Refund a SaaS payment (marks it refunded; the money itself is returned in the gateway / bank). */
r.post(
  '/payments/:id/refund',
  ah(async (req, res) => {
    const p = await SubscriptionPayment.findOneAndUpdate({ _id: oid(req.params.id), status: 'success' }, { $set: { status: 'refunded' } }, { new: true });
    if (!p) throw new HttpError(404, 'Payment not found or not refundable');
    auditLog(req, 'saas.refund', 'SubscriptionPayment', p._id, `₹${p.amount} ${p.reference ?? ''} · ${String(req.body?.reason ?? '').slice(0, 150)}`, p.instituteId);
    res.json(p);
  }),
);

/** Audit trail across the platform (or one institute), 20 per page. */
r.get(
  '/audit',
  ah(async (req, res) => {
    const q: Record<string, unknown> = {};
    const inst = str(req.query.instituteId);
    if (inst) q.instituteId = oid(inst);
    const action = str(req.query.action);
    if (action) q.action = new RegExp('^' + escapeRegex(action));
    const p = pageParams(req.query);
    const [items, total] = await Promise.all([
      AuditLog.find(q).populate('instituteId', 'name').sort({ createdAt: -1, _id: -1 }).skip(p.skip).limit(p.limit).lean(),
      AuditLog.countDocuments(q),
    ]);
    res.json(paged(items, total, p));
  }),
);

export default r;
