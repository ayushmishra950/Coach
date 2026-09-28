import { authDataChanged } from '../utils/cache.js';
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
    /** Owner cancelled: the paid plan keeps working until currentPeriodEnd, then drops to Starter. */
    cancelAtPeriodEnd: { type: Boolean, default: false },
    /** When the account became cancelled (for churn figures). */
    cancelledAt: Date,
    gstin: { type: String, trim: true },
    /** Set by the Super Admin. While suspended, nobody from this institute can log in. */
    suspendedAt: Date,
    suspendedReason: String,
    /** Status to go back to when the institute is reactivated. */
    statusBeforeSuspend: { type: String, enum: ['trial', 'active', 'past_due', 'cancelled'] },
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
      /** Days with no classes (festivals, exams). Shown in the register instead of "not marked". */
      holidays: [{ _id: false, date: { type: String, required: true }, name: { type: String, default: 'Holiday' } }],
      /** Teachers may change attendance up to this many days back (the owner always can). */
      attendanceEditDays: { type: Number, default: 7 },
      /** Printed before receipt numbers, e.g. ABC → ABC/2026-27/0001. */
      receiptPrefix: { type: String, trim: true, maxlength: 12 },
    },
    counters: {
      student: { type: Number, default: 0 },
      receipt: { type: Number, default: 0 },
      /** Financial year (e.g. "2026-27") the receipt counter belongs to; it restarts every April. */
      receiptFy: String,
    },
  },
  { timestamps: true },
);

// Drop cached logins / institutes so disables, suspensions and password resets apply at once.
for (const h of ['save', 'updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete'] as const) {
  instituteSchema.post(h, () => authDataChanged());
}

export type InstituteT = InferSchemaType<typeof instituteSchema>;
export type InstituteDoc = HydratedDocument<InstituteT>;
export const Institute = model('Institute', instituteSchema);
