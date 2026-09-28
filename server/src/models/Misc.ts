import { Schema, model, InferSchemaType } from 'mongoose';

export const CHANNELS = ['inApp', 'whatsapp', 'email', 'sms'] as const;
export type Channel = (typeof CHANNELS)[number];

const notificationSchema = new Schema(
  {
    instituteId: { type: Schema.Types.ObjectId, ref: 'Institute', index: true },
    type: { type: String, enum: ['attendance', 'fee', 'test', 'announcement', 'system', 'payment'], required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    audience: { type: String, enum: ['owner', 'staff', 'parent'], required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student' },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    deliveries: [
      {
        _id: false,
        channel: { type: String, enum: CHANNELS },
        to: String,
        status: { type: String, enum: ['sent', 'queued', 'failed', 'skipped'] },
        info: String,
      },
    ],
    readBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true },
);
notificationSchema.index({ instituteId: 1, createdAt: -1 });
notificationSchema.index({ instituteId: 1, audience: 1, studentId: 1, createdAt: -1 });
notificationSchema.index({ instituteId: 1, audience: 1, userId: 1, createdAt: -1 });

export type NotificationT = InferSchemaType<typeof notificationSchema>;
export const Notification = model('Notification', notificationSchema);

const announcementSchema = new Schema(
  {
    instituteId: { type: Schema.Types.ObjectId, ref: 'Institute', required: true, index: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    batchIds: [{ type: Schema.Types.ObjectId, ref: 'Batch' }], // empty = everyone
    pinned: { type: Boolean, default: false },
    /** Visible to the owner and teachers only — never sent to parents. */
    staffOnly: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdByName: String,
    editedAt: Date,
  },
  { timestamps: true },
);
announcementSchema.index({ instituteId: 1, pinned: -1, createdAt: -1 });
export const Announcement = model('Announcement', announcementSchema);

/** SaaS billing transactions (institute → CoachFlow). */
const subscriptionPaymentSchema = new Schema(
  {
    instituteId: { type: Schema.Types.ObjectId, ref: 'Institute', required: true, index: true },
    plan: { type: String, required: true },
    cycle: { type: String, enum: ['monthly', 'yearly'], required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['success', 'failed', 'refunded'], required: true },
    reference: String,
    failureReason: String,
  },
  { timestamps: true },
);
subscriptionPaymentSchema.index({ status: 1, createdAt: -1 });
subscriptionPaymentSchema.index({ instituteId: 1, createdAt: -1 });
export const SubscriptionPayment = model('SubscriptionPayment', subscriptionPaymentSchema);

const ticketSchema = new Schema(
  {
    instituteId: { type: Schema.Types.ObjectId, ref: 'Institute', required: true, index: true },
    subject: { type: String, required: true },
    message: { type: String, required: true },
    priority: { type: String, enum: ['low', 'normal', 'high'], default: 'normal' },
    status: { type: String, enum: ['open', 'in_progress', 'resolved'], default: 'open' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    replies: [{ _id: false, by: String, text: String, at: { type: Date, default: Date.now } }],
  },
  { timestamps: true },
);
ticketSchema.index({ status: 1, createdAt: -1 });
export const SupportTicket = model('SupportTicket', ticketSchema);

const auditSchema = new Schema(
  {
    instituteId: { type: Schema.Types.ObjectId, ref: 'Institute', index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    userName: String,
    action: String,
    entity: String,
    entityId: String,
    /** Short human-readable detail, e.g. "₹5,000 → ₹4,500" or a reason. */
    detail: String,
  },
  { timestamps: true },
);
auditSchema.index({ instituteId: 1, createdAt: -1 });
auditSchema.index({ createdAt: -1 });
export const AuditLog = model('AuditLog', auditSchema);

/**
 * Short-lived named locks so a background job runs on only one server at a time
 * (e.g. fee reminders when the API is scaled to several instances).
 */
const lockSchema = new Schema({
  key: { type: String, required: true, unique: true },
  until: { type: Date, required: true },
  owner: String,
});
export const Lock = model('Lock', lockSchema);
