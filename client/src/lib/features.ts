import type { FeatureKey } from './types';

export const FEATURE_INFO: Record<FeatureKey, { label: string; minPlan: 'growth' | 'premium' }> = {
  feeReminders: { label: 'Automated fee reminders', minPlan: 'growth' },
  parentPortal: { label: 'Parent portal', minPlan: 'growth' },
  whatsapp: { label: 'WhatsApp communication', minPlan: 'growth' },
  onlinePayments: { label: 'Online fee collection', minPlan: 'growth' },
  advancedTests: { label: 'Test analytics', minPlan: 'growth' },
  advancedReports: { label: 'Advanced reports', minPlan: 'premium' },
  aiInsights: { label: 'AI student insights', minPlan: 'premium' },
  customBranding: { label: 'Custom institute branding', minPlan: 'premium' },
  prioritySupport: { label: 'Priority support', minPlan: 'premium' },
};

/** Rows of the public pricing comparison table. */
export const COMPARISON: { label: string; values: [string | boolean, string | boolean, string | boolean] }[] = [
  { label: 'Students', values: ['50', '150', '500'] },
  { label: 'Teachers', values: ['3', '10', '25'] },
  { label: 'Attendance', values: [true, true, true] },
  { label: 'Student management', values: [true, true, true] },
  { label: 'Batch management', values: [true, true, true] },
  { label: 'Basic fees', values: [true, true, true] },
  { label: 'Fee reminders', values: [false, true, true] },
  { label: 'Tests & marks', values: ['Basic', true, true] },
  { label: 'Parent portal', values: [false, true, true] },
  { label: 'WhatsApp notifications', values: [false, 'Limited', true] },
  { label: 'Online payments', values: [false, true, true] },
  { label: 'Advanced reports', values: [false, false, true] },
  { label: 'AI insights', values: [false, false, true] },
  { label: 'Custom branding', values: [false, false, true] },
  { label: 'Priority support', values: [false, false, true] },
];
