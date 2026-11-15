import mongoose from 'mongoose';
import { createUpiPay, isValidVpa, mongoStore, type UpiOrder } from 'pure-upi';
import { config } from '../config.js';
import { Institute, Plan, Student, SubscriptionPayment, User } from '../models/index.js';
import { HttpError } from '../utils/http.js';
import { notify } from './notify.js';
import { nextPeriodEnd } from './plan.js';
import { emitToInstitute, emitToSuperadmins } from './realtime.js';

/**
 * Plan payments straight to CoachFlow's UPI ID (pure-upi): the owner scans a QR for a unique amount (₹999.37),
 * enters the 12-digit UTR, and the Super Admin approves it after seeing the money in the bank app.
 * Switched on by UPI_ID + UPI_NAME in .env; works next to Razorpay.
 */
export const upiEnabled = () => isValidVpa(config.upi.id) && config.upi.name.length > 0;

type Cycle = 'monthly' | 'yearly';
const CYCLES: readonly Cycle[] = ['monthly', 'yearly'];

/** A pure-upi plan id is "<plan key>_<cycle>", e.g. "growth_yearly". */
export const upiPlanId = (plan: string, cycle: Cycle) => `${plan}_${cycle}`;
export function parseUpiPlanId(id: string): { plan: string; cycle: Cycle } {
  const i = id.lastIndexOf('_');
  const cycle = id.slice(i + 1);
  if (i <= 0 || !(CYCLES as readonly string[]).includes(cycle)) throw new HttpError(400, `Unknown plan ${id}`);
  return { plan: id.slice(0, i), cycle: cycle as Cycle };
}

const store = mongoStore(mongoose.connection.collection('upi_orders'));
/** Creates the indexes (unique UTR). Call once after connecting to MongoDB. */
export const initUpiStore = () => store.init();

const reference = (order: UpiOrder) => `UPI ${order.utr ?? ''} · ${order.id}`;

export const upi = createUpiPay({
  upiId: () => config.upi.id,
  name: () => config.upi.name,
  notePrefix: 'CoachFlow',
  store,
  // Plans live in MongoDB (Super Admin → Plans), so prices are read on every order.
  plans: async () => {
    const out: Record<string, { price: number; name: string }> = {};
    for (const p of await Plan.find().sort({ order: 1 }).lean()) {
      for (const cycle of CYCLES) {
        const price = cycle === 'yearly' ? p.priceYearly : p.priceMonthly;
        if (price > 0) out[upiPlanId(p.key, cycle)] = { price: Math.round(price * 100) / 100, name: `${p.name} · ${cycle === 'yearly' ? 'Yearly' : 'Monthly'}` };
      }
    }
    return out;
  },
  // Same rules as card payments: only an institute can buy, and the plan must fit its current size.
  beforeOrder: async ({ userId, plan }) => {
    const inst = mongoose.isValidObjectId(userId) ? await Institute.findById(userId).select('_id').lean() : null;
    if (!inst) throw new HttpError(403, 'Only an institute owner can buy a plan');
    // One payment at a time: the earlier one must be approved or rejected first (no double payments).
    if ((await store.list({ userId, status: 'submitted', limit: 1 })).length) {
      throw new HttpError(409, 'Your previous UPI payment is still being verified. Please wait for it.');
    }
    const { plan: key } = parseUpiPlanId(plan.id);
    const p = await Plan.findOne({ key }).lean();
    if (!p) throw new HttpError(400, 'Unknown plan');
    const [students, teachers] = await Promise.all([
      Student.countDocuments({ instituteId: inst._id, status: 'active' }),
      User.countDocuments({ instituteId: inst._id, role: 'teacher', active: true }),
    ]);
    if (students > p.studentLimit) throw new HttpError(400, `You have ${students} active students — the ${p.name} plan allows ${p.studentLimit}.`);
    if (teachers > p.teacherLimit) throw new HttpError(400, `You have ${teachers} teachers — the ${p.name} plan allows ${p.teacherLimit}.`);
  },
  onError: (err) => console.error('[upi] notification failed:', err),
  // A payment to verify: live alert to every signed-in Super Admin (toast + badge on Payments).
  onSubmitted: async (order) => {
    console.log(`[upi] ₹${order.amount} submitted for ${order.plan} (institute ${order.userId}, UTR ${order.utr}) — verify it in Super Admin → Payments`);
    const inst = mongoose.isValidObjectId(order.userId) ? await Institute.findById(order.userId).select('name city').lean() : null;
    emitToSuperadmins('upi:submitted', {
      id: order.id,
      amount: order.amount,
      plan: order.planName ?? order.plan,
      utr: order.utr,
      institute: inst ? { name: inst.name, city: inst.city } : null,
      submittedAt: order.submittedAt,
    });
  },
  // Approved by the Super Admin: switch the plan on (renewing early keeps the days already paid for).
  onApproved: async (order) => {
    if (await SubscriptionPayment.exists({ reference: reference(order) })) return; // already applied
    const inst = await Institute.findById(order.userId);
    if (!inst) throw new HttpError(409, 'This institute no longer exists. Reject the payment and refund it.');
    const { plan, cycle } = parseUpiPlanId(order.plan);
    const end = nextPeriodEnd(inst.status === 'active' || inst.status === 'past_due' ? inst.currentPeriodEnd : null, cycle);
    inst.set({ plan, billingCycle: cycle, status: 'active', currentPeriodEnd: end, cancelAtPeriodEnd: false });
    await inst.save();
    await SubscriptionPayment.create({ instituteId: inst._id, plan, cycle, amount: order.amountPaise / 100, status: 'success', reference: reference(order) });
    emitToSuperadmins('upi:changed', { id: order.id, status: 'approved' });
    // The owner's open screens (web + app) re-read the plan now: features unlock without logging out.
    emitToInstitute(inst._id, 'institute:updated', { plan, status: 'active', upi: { id: order.id, status: 'approved' } });
    // 'system' (not 'payment'): the bell shows a popup for it — owners get no popup for 'payment', which is
    // used for fees they collect themselves.
    await notify({
      institute: inst,
      type: 'system',
      audience: 'owner',
      href: '/app/subscription',
      title: `🎉 ${order.planName ?? plan} activated`,
      message: `We received your UPI payment of ₹${order.amount} (UTR ${order.utr}). ${order.planName ?? plan} is active until ${end.toLocaleDateString('en-IN')}.`,
    }).catch((e) => console.error('[upi] notify', e));
  },
  onRejected: async (order) => {
    emitToSuperadmins('upi:changed', { id: order.id, status: 'rejected' });
    const inst = await Institute.findById(order.userId);
    if (!inst) return;
    emitToInstitute(inst._id, 'institute:updated', { plan: inst.plan, status: inst.status, upi: { id: order.id, status: 'rejected' } });
    await notify({
      institute: inst,
      type: 'system',
      audience: 'owner',
      href: '/app/subscription',
      title: 'UPI payment not verified',
      message: `We could not verify your UPI payment of ₹${order.amount}${order.rejectedUtr ? ` (UTR ${order.rejectedUtr})` : ''}.${order.reason ? ` Reason: ${order.reason}.` : ''} If money left your account, raise a ticket with a screenshot.`,
    }).catch((e) => console.error('[upi] notify', e));
  },
});
