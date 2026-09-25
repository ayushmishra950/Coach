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

export type NotificationT = InferSchemaType<typeof notificationSchema>;
export const Notification = model('Notification', notificationSchema);

const announcementSchema = new Schema(
  {
    instituteId: { type: Schema.Types.ObjectId, ref: 'Institute', required: true, index: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    batchIds: [{ type: Schema.Types.ObjectId, ref: 'Batch' }], // empty = everyone
    pinned: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdByName: String,
  },
  { timestamps: true },
);
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
export const SupportTicket = model('SupportTicket', ticketSchema);

const auditSchema = new Schema(
  {
    instituteId: { type: Schema.Types.ObjectId, ref: 'Institute', index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    userName: String,
    action: String,
    entity: String,
    entityId: String,
  },
  { timestamps: true },
);
export const AuditLog = model('AuditLog', auditSchema);
