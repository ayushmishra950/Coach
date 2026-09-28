import { Types } from 'mongoose';
import { Institute, Invoice, Payment, Student, type InstituteDoc } from '../models/index.js';
import { bumpData } from '../utils/cache.js';
import { startOfDay } from '../utils/dates.js';
import { HttpError } from '../utils/http.js';
import { notify } from './notify.js';

export const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

/** Indian financial year (April–March) of a date, e.g. "2026-27". */
export function financialYear(d = new Date()) {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}

/** Short receipt prefix: the institute's own (Settings), else its initials. */
function receiptPrefix(inst: { name?: string | null; logoText?: string | null; settings?: { receiptPrefix?: string | null } | null }) {
  const own = inst.settings?.receiptPrefix?.trim();
  if (own) return own.toUpperCase();
  const initials = (inst.logoText || (inst.name ?? '').split(/\s+/).map((w) => w[0]).join('') || 'RCPT').replace(/[^A-Za-z0-9]/g, '');
  return initials.slice(0, 6).toUpperCase() || 'RCPT';
}

/**
 * Next receipt number, e.g. ABC/2026-27/0001. The counter restarts every financial year
 * (atomically — two receipts at the same moment can never get the same number).
 */
export async function nextReceiptNo(instituteId: Types.ObjectId) {
  const fy = financialYear();
  const inst = await Institute.findOneAndUpdate(
    { _id: instituteId },
    [
      {
        $set: {
          'counters.receipt': { $cond: [{ $eq: ['$counters.receiptFy', fy] }, { $add: [{ $ifNull: ['$counters.receipt', 0] }, 1] }, 1] },
          'counters.receiptFy': fy,
        },
      },
    ],
    { new: true },
  ).lean();
  if (!inst) throw new HttpError(404, 'Institute not found');
  return `${receiptPrefix(inst)}/${fy}/${String(inst.counters?.receipt ?? 1).padStart(4, '0')}`;
}

export async function nextStudentCode(instituteId: Types.ObjectId) {
  const inst = await Institute.findByIdAndUpdate(instituteId, { $inc: { 'counters.student': 1 } }, { new: true });
  return `STU-${String(inst!.counters!.student).padStart(4, '0')}`;
}

export async function recordPayment(opts: {
  institute: InstituteDoc;
  invoiceId: Types.ObjectId;
  amount: number;
  method: 'cash' | 'upi' | 'bank' | 'card' | 'online';
  reference?: string;
  note?: string;
  collectedBy?: Types.ObjectId;
  /** When the money was actually received (defaults to now; may be back-dated, never future). */
  paidAt?: Date;
}) {
  let paidAt = opts.paidAt ?? new Date();
  if (opts.paidAt) {
    if (Number.isNaN(paidAt.getTime())) throw new HttpError(400, 'Invalid payment date');
    if (paidAt > new Date()) throw new HttpError(400, 'Payment date cannot be in the future');
    if (paidAt < new Date(Date.now() - 366 * 86400000)) throw new HttpError(400, 'Payment date cannot be more than a year ago');
    // A back-dated payment keeps today's time of day only when it is today.
    if (startOfDay(paidAt).getTime() === startOfDay().getTime()) paidAt = new Date();
  }
  const invoice = await Invoice.findOne({ _id: opts.invoiceId, instituteId: opts.institute._id }).lean();
  if (!invoice) throw new HttpError(404, 'Invoice not found');
  const amount = Math.round(Number(opts.amount));
  if (!amount || amount <= 0) throw new HttpError(400, 'Enter a valid amount');
  if (amount > invoice.amount - invoice.paidAmount) throw new HttpError(400, `Amount exceeds the outstanding ${inr(invoice.amount - invoice.paidAmount)}`);

  // Atomic "add to paidAmount only if it still fits" — two collections made at the same
  // moment (e.g. the office and the parent portal) can no longer overpay an invoice.
  const updated = await Invoice.findOneAndUpdate(
    { _id: invoice._id, instituteId: opts.institute._id, $expr: { $lte: [{ $add: ['$paidAmount', amount] }, '$amount'] } },
    [
      { $set: { paidAmount: { $add: ['$paidAmount', amount] } } },
      { $set: { status: { $cond: [{ $gte: ['$paidAmount', '$amount'] }, 'paid', 'partial'] } } },
    ],
    { new: true },
  );
  if (!updated) throw new HttpError(409, 'This invoice was just updated by someone else. Please refresh and try again.');

  const receiptNo = await nextReceiptNo(opts.institute._id);
  const payment = await Payment.create({
    instituteId: opts.institute._id,
    studentId: invoice.studentId,
    invoiceId: invoice._id,
    amount,
    method: opts.method,
    reference: opts.reference?.slice(0, 100),
    note: opts.note?.slice(0, 300),
    receiptNo,
    paidAt,
    balanceAfter: Math.max(0, updated.amount - updated.paidAmount),
    collectedBy: opts.collectedBy,
  }).catch(async (e: unknown) => {
    // Undo the invoice update so the books stay consistent.
    await Invoice.updateOne({ _id: invoice._id }, [
      { $set: { paidAmount: { $subtract: ['$paidAmount', amount] } } },
      { $set: { status: { $cond: [{ $gte: ['$paidAmount', '$amount'] }, 'paid', { $cond: [{ $gt: ['$paidAmount', 0] }, 'partial', 'pending'] }] } } },
    ]);
    throw e;
  });

  bumpData(opts.institute._id);
  const student = await Student.findOne({ _id: invoice.studentId, instituteId: opts.institute._id }).lean();
  if (student) {
    await notify({
      institute: opts.institute,
      type: 'payment',
      audience: 'parent',
      studentId: student._id,
      title: 'Payment received',
      message: `We received ${inr(amount)} for ${student.name} (${invoice.title}). Receipt #${receiptNo}. Thank you!`,
      contact: { phone: student.parentPhone ?? undefined, email: student.parentEmail ?? undefined },
    });
    await notify({
      institute: opts.institute,
      type: 'payment',
      audience: 'owner',
      studentId: student._id,
      title: 'Fee collected',
      message: `${inr(amount)} received from ${student.name} via ${opts.method.toUpperCase()} — ${receiptNo}`,
    });
  }
  return payment;
}

/**
 * Cancels a receipt entered by mistake. The payment stays on record (marked void, with the
 * reason and who did it) and its amount is taken back off the invoice.
 */
export async function voidPayment(opts: { institute: InstituteDoc; paymentId: Types.ObjectId; reason: string; by: Types.ObjectId }) {
  const reason = opts.reason.trim().slice(0, 300);
  if (reason.length < 3) throw new HttpError(400, 'Please give a reason for cancelling this receipt');
  const payment = await Payment.findOneAndUpdate(
    { _id: opts.paymentId, instituteId: opts.institute._id, status: { $ne: 'void' } },
    { $set: { status: 'void', voidedAt: new Date(), voidReason: reason, voidedBy: opts.by } },
    { new: true },
  );
  if (!payment) throw new HttpError(404, 'Receipt not found or already cancelled');
  if (payment.invoiceId) {
    await Invoice.updateOne({ _id: payment.invoiceId, instituteId: opts.institute._id }, [
      { $set: { paidAmount: { $max: [0, { $subtract: ['$paidAmount', payment.amount] }] } } },
      { $set: { status: { $cond: [{ $gte: ['$paidAmount', '$amount'] }, 'paid', { $cond: [{ $gt: ['$paidAmount', 0] }, 'partial', 'pending'] }] } } },
    ]);
  }
  bumpData(opts.institute._id);
  return payment;
}
