import { Schema, model, InferSchemaType, HydratedDocument } from 'mongoose';

export const FEATURE_KEYS = [
  'feeReminders',
  'parentPortal',
  'whatsapp',
  'advancedReports',
  'onlinePayments',
  'aiInsights',
  'customBranding',
  'prioritySupport',
  'advancedTests',
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

const planSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, enum: ['starter', 'growth', 'premium'] },
    name: { type: String, required: true },
    tagline: String,
    priceMonthly: { type: Number, required: true },
    priceYearly: { type: Number, required: true },
    studentLimit: { type: Number, required: true },
    teacherLimit: { type: Number, required: true },
    features: [{ type: String, enum: FEATURE_KEYS }],
    whatsappLimit: { type: Number, default: 0 }, // messages / month, -1 = unlimited
    popular: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export type PlanT = InferSchemaType<typeof planSchema>;
export type PlanDoc = HydratedDocument<PlanT>;
export const Plan = model('Plan', planSchema);

export const DEFAULT_PLANS: Partial<PlanT>[] = [
  {
    key: 'starter', name: 'Starter', tagline: 'For new & small institutes', priceMonthly: 499, priceYearly: 4990,
    studentLimit: 50, teacherLimit: 3, features: [], whatsappLimit: 0, order: 1,
  },
  {
    key: 'growth', name: 'Growth', tagline: 'For growing institutes', priceMonthly: 999, priceYearly: 9990,
    studentLimit: 150, teacherLimit: 10, features: ['feeReminders', 'parentPortal', 'whatsapp', 'onlinePayments', 'advancedTests'],
    whatsappLimit: 500, order: 2,
  },
  {
    key: 'premium', name: 'Premium', tagline: 'Unlock the full power', priceMonthly: 1499, priceYearly: 14990,
    studentLimit: 500, teacherLimit: 25, features: [...FEATURE_KEYS], whatsappLimit: -1, popular: true, order: 3,
  },
];
