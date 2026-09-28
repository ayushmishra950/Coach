import { config } from '../config.js';
import { DEFAULT_PLANS, Institute, Plan, type FeatureKey, type InstituteDoc, type PlanT } from '../models/index.js';

export async function ensurePlans() {
  for (const p of DEFAULT_PLANS) {
    await Plan.updateOne({ key: p.key }, { $setOnInsert: p }, { upsert: true });
  }
}

// Plans change rarely (only from the Super Admin editor), so keep them in memory for a short
// time instead of querying Mongo on every request and every notification.
type CachedPlan = PlanT & { _id: unknown };
let cache: { at: number; plans: Map<string, CachedPlan> } | null = null;
const TTL = 30_000;

export async function getPlan(key: string) {
  if (!cache || Date.now() - cache.at > TTL) {
    const plans = (await Plan.find().lean()) as unknown as CachedPlan[];
    cache = { at: Date.now(), plans: new Map(plans.map((p) => [p.key, p])) };
  }
  return cache.plans.get(key) ?? null;
}

export function invalidatePlanCache() {
  cache = null;
}

type BillingFields = Pick<InstituteDoc, 'plan' | 'status' | 'trialEndsAt' | 'currentPeriodEnd'> & { cancelAtPeriodEnd?: boolean | null };

/** True when a paid period ended more than `graceDays` ago. */
export function periodLapsed(inst: Pick<InstituteDoc, 'currentPeriodEnd'>) {
  if (!inst.currentPeriodEnd) return false;
  return inst.currentPeriodEnd.getTime() + config.graceDays * 86400000 < Date.now();
}

/**
 * Plan key actually in force:
 *  - expired trials, cancelled and suspended accounts fall back to Starter
 *  - a paid (or past-due) plan whose period ended beyond the grace window falls back to Starter
 */
export function effectivePlanKey(inst: BillingFields) {
  if (inst.status === 'trial' && inst.trialEndsAt && inst.trialEndsAt < new Date()) return 'starter';
  if (inst.status === 'cancelled' || inst.status === 'suspended') return 'starter';
  if ((inst.status === 'active' || inst.status === 'past_due') && periodLapsed(inst)) return 'starter';
  // Cancelled by the owner: paid features last until the end of the period already paid for.
  if (inst.cancelAtPeriodEnd && inst.currentPeriodEnd && inst.currentPeriodEnd < new Date()) return 'starter';
  return inst.plan;
}

/**
 * Moves an active subscription whose period has ended to `past_due`. Called on every
 * authenticated request (cheap: it only writes when the status actually changes).
 */
export async function syncBillingStatus(inst: InstituteDoc) {
  const now = new Date();
  if (inst.status === 'active' && inst.cancelAtPeriodEnd && inst.currentPeriodEnd && inst.currentPeriodEnd < now) {
    await Institute.updateOne({ _id: inst._id, status: 'active', cancelAtPeriodEnd: true }, { $set: { status: 'cancelled', cancelledAt: now } });
    inst.set('status', 'cancelled');
    return inst;
  }
  if (inst.status === 'active' && inst.currentPeriodEnd && inst.currentPeriodEnd < now) {
    // Targeted update (no full-document validation) so an old record can never block logins.
    await Institute.updateOne({ _id: inst._id, status: 'active', currentPeriodEnd: { $lt: now } }, { $set: { status: 'past_due' } });
    inst.set('status', 'past_due');
  }
  return inst;
}

export async function getEffectivePlan(inst: BillingFields) {
  return getPlan(effectivePlanKey(inst));
}

export async function hasFeature(inst: BillingFields, f: FeatureKey) {
  const plan = await getEffectivePlan(inst);
  return !!plan?.features.includes(f);
}

export function trialDaysLeft(inst: Pick<InstituteDoc, 'status' | 'trialEndsAt'>) {
  if (inst.status !== 'trial' || !inst.trialEndsAt) return null;
  return Math.max(0, Math.ceil((inst.trialEndsAt.getTime() - Date.now()) / 86400000));
}

export function monthlyValue(plan: { priceMonthly: number; priceYearly: number }, cycle: string) {
  return cycle === 'yearly' ? Math.round(plan.priceYearly / 12) : plan.priceMonthly;
}

/** End of a new billing period, extending from the current end when renewing early. */
export function nextPeriodEnd(currentEnd: Date | null | undefined, cycle: 'monthly' | 'yearly') {
  const base = currentEnd && currentEnd > new Date() ? new Date(currentEnd) : new Date();
  base.setMonth(base.getMonth() + (cycle === 'yearly' ? 12 : 1));
  return base;
}
