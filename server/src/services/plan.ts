import { DEFAULT_PLANS, Plan, type FeatureKey, type InstituteDoc } from '../models/index.js';

export async function ensurePlans() {
  for (const p of DEFAULT_PLANS) {
    await Plan.updateOne({ key: p.key }, { $setOnInsert: p }, { upsert: true });
  }
}

/** Plan key actually in force: expired trials and cancelled accounts fall back to Starter. */
export function effectivePlanKey(inst: Pick<InstituteDoc, 'plan' | 'status' | 'trialEndsAt'>) {
  if (inst.status === 'trial' && inst.trialEndsAt && inst.trialEndsAt < new Date()) return 'starter';
  if (inst.status === 'cancelled' || inst.status === 'suspended') return 'starter';
  return inst.plan;
}

export async function getEffectivePlan(inst: InstituteDoc) {
  return Plan.findOne({ key: effectivePlanKey(inst) }).lean();
}

export async function hasFeature(inst: InstituteDoc, f: FeatureKey) {
  const plan = await getEffectivePlan(inst);
  return !!plan?.features.includes(f);
}

export function trialDaysLeft(inst: InstituteDoc) {
  if (inst.status !== 'trial' || !inst.trialEndsAt) return null;
  return Math.max(0, Math.ceil((inst.trialEndsAt.getTime() - Date.now()) / 86400000));
}

export function monthlyValue(plan: { priceMonthly: number; priceYearly: number }, cycle: string) {
  return cycle === 'yearly' ? Math.round(plan.priceYearly / 12) : plan.priceMonthly;
}
