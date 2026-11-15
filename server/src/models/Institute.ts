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
    /** The institute's own Razorpay account for parent fee payments (secret stored encrypted). */
    payments: {
      enabled: { type: Boolean, default: false },
      razorpayKeyId: { type: String, trim: true },
      /** Never loaded unless asked for: .select('+payments.razorpaySecretEnc'). */
      razorpaySecretEnc: { type: String, select: false },
    },
    /** Public mini-website for new admissions: /site/<slug>. */
    website: {
      enabled: { type: Boolean, default: false },
      slug: { type: String, trim: true, lowercase: true },
      tagline: String,
      about: String,
      whatsapp: String, // counsellor number for the chat button
      mapUrl: String,
      heroImageId: { type: Schema.Types.ObjectId },
      stats: [{ _id: false, label: String, value: String }],
      toppers: [{ name: String, result: String, year: String, photoId: Schema.Types.ObjectId, quote: String }],
      testimonials: [{ name: String, role: String, text: String, rating: Number }],
      demoEnabled: { type: Boolean, default: true },
      /** Fill the page automatically from live data when the owner hasn't written it by hand. */
      showTeachers: { type: Boolean, default: true },
      showBatches: { type: Boolean, default: true },
      showCounts: { type: Boolean, default: true },
    },
    settings: {
      channels: {
        inApp: { type: Boolean, default: true },
        whatsapp: { type: Boolean, default: false },
        email: { type: Boolean, default: false },
        sms: { type: Boolean, default: false },
      },
      reminders: {
        enabled: { type: Boolean, default: true },
        /** "Due soon" reminder this many days before the due date (0 = off). */
        daysBefore: { type: Number, default: 1 },
        onDueDate: { type: Boolean, default: true },
        /** Overdue reminders start this many days after the due date (0 = off), then go every day… */
        daysAfter: { type: Number, default: 1 },
        /** …once or twice a day until paid. */
        overduePerDay: { type: Number, default: 1, min: 1, max: 2 },
      },
      absentAlertAfter: { type: Number, default: 3 },
      notifyParentOnAbsence: { type: Boolean, default: true },
      /** Days with no classes (festivals, exams). Shown in the register instead of "not marked". */
      holidays: [{ _id: false, date: { type: String, required: true }, name: { type: String, default: 'Holiday' } }],
      /** Teachers may change attendance up to this many days back (the owner always can). */
      attendanceEditDays: { type: Number, default: 7 },
      /** Teacher salaries: due on `payDay` of the month after the month worked. Owner gets reminders. */
      salary: {
        enabled: { type: Boolean, default: true },
        payDay: { type: Number, default: 1, min: 1, max: 28 },
        daysBefore: { type: Number, default: 1 },
        onDueDate: { type: Boolean, default: true },
        /** Overdue reminder every N days after the due date until paid. */
        daysAfter: { type: Number, default: 1 },
        /** Salary records are only created for due dates on/after this (set the first time tracking runs). */
        trackFrom: Date,
      },
      /** Teacher check-in rules. */
      staffAttendance: {
        startTime: { type: String, default: '09:00' }, // HH:mm
        endTime: { type: String, default: '18:00' },
        graceMins: { type: Number, default: 15 },
        notifyLate: { type: Boolean, default: true },
        /** Ask the browser for the teacher's location on check-in / check-out. */
        captureLocation: { type: Boolean, default: false },
      },
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

instituteSchema.index({ 'website.slug': 1 }, { unique: true, partialFilterExpression: { 'website.slug': { $type: 'string' } } });

// Drop cached logins / institutes so disables, suspensions and password resets apply at once.
for (const h of ['save', 'updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete'] as const) {
  instituteSchema.post(h, () => authDataChanged());
}

export type InstituteT = InferSchemaType<typeof instituteSchema>;
export type InstituteDoc = HydratedDocument<InstituteT>;
export const Institute = model('Institute', instituteSchema);
