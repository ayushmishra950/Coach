import { Schema, model, InferSchemaType } from 'mongoose';

/** One installment / fee invoice for a student. */
const invoiceSchema = new Schema(
  {
    instituteId: { type: Schema.Types.ObjectId, ref: 'Institute', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    title: { type: String, required: true },
    installmentNo: Number,
    amount: { type: Number, required: true, min: 0 },
    paidAmount: { type: Number, default: 0 },
    dueDate: { type: Date, required: true },
    status: { type: String, enum: ['pending', 'partial', 'paid'], default: 'pending' },
    lastReminderAt: Date,
    reminderCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export type InvoiceT = InferSchemaType<typeof invoiceSchema>;
export const Invoice = model('Invoice', invoiceSchema);

const paymentSchema = new Schema(
  {
    instituteId: { type: Schema.Types.ObjectId, ref: 'Institute', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice' },
    amount: { type: Number, required: true, min: 1 },
    method: { type: String, enum: ['cash', 'upi', 'bank', 'card', 'online'], default: 'cash' },
    receiptNo: { type: String, required: true },
    reference: String,
    note: String,
    paidAt: { type: Date, default: Date.now },
    collectedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

export type PaymentT = InferSchemaType<typeof paymentSchema>;
export const Payment = model('Payment', paymentSchema);
