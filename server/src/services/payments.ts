import { Types } from 'mongoose';
import { Institute, Invoice, Payment, Student, type InstituteDoc } from '../models/index.js';
import { HttpError } from '../utils/http.js';
import { notify } from './notify.js';

export const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

export async function nextReceiptNo(instituteId: Types.ObjectId) {
  const inst = await Institute.findByIdAndUpdate(instituteId, { $inc: { 'counters.receipt': 1 } }, { new: true });
  return `CF-${new Date().getFullYear()}-${String(inst!.counters!.receipt).padStart(5, '0')}`;
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
}) {
  const invoice = await Invoice.findOne({ _id: opts.invoiceId, instituteId: opts.institute._id });
  if (!invoice) throw new HttpError(404, 'Invoice not found');
  const due = invoice.amount - invoice.paidAmount;
  const amount = Math.round(Number(opts.amount));
  if (!amount || amount <= 0) throw new HttpError(400, 'Enter a valid amount');
  if (amount > due) throw new HttpError(400, `Amount exceeds the outstanding ${inr(due)}`);

  const receiptNo = await nextReceiptNo(opts.institute._id);
  const payment = await Payment.create({
    instituteId: opts.institute._id,
    studentId: invoice.studentId,
    invoiceId: invoice._id,
    amount,
    method: opts.method,
    reference: opts.reference,
    note: opts.note,
    receiptNo,
    collectedBy: opts.collectedBy,
  });
  invoice.paidAmount += amount;
  invoice.status = invoice.paidAmount >= invoice.amount ? 'paid' : 'partial';
  await invoice.save();

  const student = await Student.findById(invoice.studentId).lean();
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
