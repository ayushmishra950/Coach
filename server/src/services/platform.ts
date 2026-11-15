import { Schema, model } from 'mongoose';

/** Platform-wide settings the Super Admin controls (one document). */
const platformSchema = new Schema(
  {
    _id: { type: String, default: 'platform' },
    /** Free trial (in days) every newly registered institute gets. 0 = no trial (starts on Starter). */
    trialDays: { type: Number, default: 30, min: 0, max: 365 },
  },
  { timestamps: true },
);
export const PlatformSetting = model('PlatformSetting', platformSchema);

let cached: { trialDays: number; at: number } | null = null;

export async function platformSettings() {
  if (cached && Date.now() - cached.at < 60_000) return cached;
  const doc = await PlatformSetting.findById('platform').lean();
  cached = { trialDays: doc?.trialDays ?? 30, at: Date.now() };
  return cached;
}

export async function setDefaultTrialDays(days: number) {
  await PlatformSetting.updateOne({ _id: 'platform' }, { $set: { trialDays: days } }, { upsert: true });
  cached = null;
}

/** Trial end for a brand-new institute: exactly N days from now (0 = already over → Starter). */
export async function newTrialEnd() {
  const { trialDays } = await platformSettings();
  return new Date(Date.now() + trialDays * 86400000);
}
