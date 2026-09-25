import { Schema, model, InferSchemaType, HydratedDocument } from 'mongoose';

const instituteSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    ownerName: String,
    email: { type: String, lowercase: true, trim: true },
    phone: String,
    address: String,
    city: String,
    type: { type: String, default: 'School Tuition' },
    brandColor: { type: String, default: '#6366f1' },
    logoText: String,
    plan: { type: String, enum: ['starter', 'growth', 'premium'], default: 'premium' },
    billingCycle: { type: String, enum: ['monthly', 'yearly'], default: 'monthly' },
    status: { type: String, enum: ['trial', 'active', 'past_due', 'cancelled', 'suspended'], default: 'trial' },
    trialEndsAt: Date,
    currentPeriodEnd: Date,
    settings: {
      channels: {
        inApp: { type: Boolean, default: true },
        whatsapp: { type: Boolean, default: false },
        email: { type: Boolean, default: true },
        sms: { type: Boolean, default: false },
      },
      reminders: {
        enabled: { type: Boolean, default: true },
        daysBefore: { type: Number, default: 3 },
        onDueDate: { type: Boolean, default: true },
        daysAfter: { type: Number, default: 3 },
      },
      absentAlertAfter: { type: Number, default: 3 },
      notifyParentOnAbsence: { type: Boolean, default: true },
    },
    counters: {
      student: { type: Number, default: 0 },
      receipt: { type: Number, default: 0 },
    },
  },
  { timestamps: true },
);

export type InstituteT = InferSchemaType<typeof instituteSchema>;
export type InstituteDoc = HydratedDocument<InstituteT>;
export const Institute = model('Institute', instituteSchema);
