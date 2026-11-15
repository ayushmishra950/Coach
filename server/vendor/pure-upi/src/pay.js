import { UpiPayError } from './errors.js';
import { formatPaise, isValidUtr, isValidVpa, normalizeUtr, toPaise, upiLink } from './link.js';
import { qrSvg } from './qr.js';
import { memoryStore } from './stores.js';

const ID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32: no I, L, O, U

function newId(length = 10) {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(length));
  let id = '';
  for (const b of bytes) id += ID_ALPHABET[b & 31];
  return id;
}

function normalizePlans(plans) {
  if (!plans || typeof plans !== 'object' || !Object.keys(plans).length) {
    throw new TypeError('pure-upi: `plans` is required, e.g. { monthly: { price: 99 } }');
  }
  const out = Object.create(null); // plan ids like "__proto__" stay plain keys
  for (const [id, plan] of Object.entries(plans)) {
    const p = typeof plan === 'object' && plan !== null ? plan : { price: plan };
    out[id] = { ...p, id, name: p.name ?? id, pricePaise: toPaise(p.price), price: formatPaise(toPaise(p.price)) };
  }
  return out;
}

// A setting given as a value or as a function returning it (read on every use, e.g. from your admin settings).
const read = (value) => (typeof value === 'function' ? value() : value);

function checkPayee(upiId, name) {
  if (!isValidVpa(upiId)) throw new TypeError(`pure-upi: invalid upiId ${JSON.stringify(upiId)}`);
  if (!name || typeof name !== 'string') throw new TypeError('pure-upi: `name` (payee name) is required');
  return { upiId, name };
}

/**
 * Create a UPI payment manager: orders with (optionally) unique amounts, UTR submission, admin approve/reject.
 */
export function createUpiPay({
  upiId,
  name,
  plans,
  store = memoryStore(),
  uniqueAmount = true,
  holdMs = 30 * 60 * 1000,
  notePrefix = 'Order',
  beforeOrder,
  onSubmitted,
  onApproved,
  onRejected,
  onError = (err) => console.error('pure-upi:', err),
  now = Date.now,
} = {}) {
  // Static settings are checked right away; settings given as functions are checked each time they are read.
  if (typeof upiId !== 'function' && !isValidVpa(upiId)) throw new TypeError(`pure-upi: invalid upiId ${JSON.stringify(upiId)}`);
  if (typeof name !== 'function' && !name) throw new TypeError('pure-upi: `name` (payee name) is required');
  if (typeof holdMs !== 'number' || !Number.isFinite(holdMs) || holdMs < 0) {
    throw new RangeError(`pure-upi: holdMs must be a non-negative number of ms (got ${holdMs})`);
  }
  if (!store || ['insert', 'get', 'update', 'list', 'reservedAmounts'].some((m) => typeof store[m] !== 'function')) {
    throw new TypeError('pure-upi: `store` must implement insert, get, update, list and reservedAmounts (see UpiStore)');
  }
  const staticPlans = typeof plans === 'function' ? null : normalizePlans(plans);
  const getPlans = async () => staticPlans ?? normalizePlans(await plans());
  const payee = () => checkPayee(read(upiId), read(name));
  // onSubmitted / onRejected run after the change is saved: their failure (e.g. an email that could not be sent)
  // must not turn a saved change into an error for the caller, who would retry and get "already submitted".
  const notify = async (hook, order) => {
    try {
      await hook?.(order);
    } catch (err) {
      onError(err);
    }
  };

  const linkFor = (order) => {
    const p = payee();
    // UPI notes are cut at 50 characters: shorten the prefix, never the order id.
    const prefix = String(read(notePrefix) ?? '').replace(/\s+/g, ' ').trim().slice(0, Math.max(0, 49 - order.id.length)).trim();
    return upiLink({ upiId: p.upiId, name: p.name, amount: order.amount, note: prefix ? `${prefix} ${order.id}` : order.id });
  };

  async function pickAmount(base) {
    if (!uniqueAmount) return base;
    const taken = new Set(await store.reservedAmounts(base + 1, base + 99, now()));
    const free = [];
    for (let p = 1; p <= 99; p++) if (!taken.has(base + p)) free.push(base + p);
    // All 99 slots busy: reuse one. The UTR still identifies the payment.
    const pool = free.length ? free : Array.from({ length: 99 }, (_, i) => base + i + 1);
    return pool[globalThis.crypto.getRandomValues(new Uint32Array(1))[0] % pool.length];
  }

  // An open order may be reused only while it still matches the plan's current price.
  const fitsPrice = (order, pricePaise) => (uniqueAmount
    ? order.amountPaise > pricePaise && order.amountPaise <= pricePaise + 99
    : order.amountPaise === pricePaise);

  async function mustGet(orderId) {
    const order = typeof orderId === 'string' ? await store.get(orderId) : null;
    if (!order) throw new UpiPayError('NOT_FOUND', 'Order not found');
    return order;
  }

  const pay = {
    get upiId() {
      return payee().upiId;
    },
    get name() {
      return payee().name;
    },
    store,

    /** The plans buyers can choose (async: plans may come from a function, e.g. your database). */
    async plans() {
      return Object.values(await getPlans()).map(({ pricePaise, ...p }) => p);
    },

    linkFor,

    /** QR (SVG string) for an order's payment link. */
    qrFor(order, options) {
      return qrSvg(linkFor(order), { title: `Pay ₹${order.amount} to ${payee().name}`, ...options });
    },

    async createOrder({ userId, plan, meta } = {}) {
      if (userId === undefined || userId === null || userId === '') throw new UpiPayError('UNAUTHORIZED', 'userId is required');
      const planMap = await getPlans();
      const p = (typeof plan === 'string' || typeof plan === 'number') && Object.hasOwn(planMap, String(plan)) ? planMap[String(plan)] : null;
      if (!p) throw new UpiPayError('INVALID_PLAN', `Unknown plan ${JSON.stringify(plan)}`);
      payee(); // fail before reserving an amount if the UPI ID is not set up
      const uid = String(userId);
      const { pricePaise, ...planInfo } = p;
      // Your own checks (plan limits, an existing subscription...). Throw to refuse.
      await beforeOrder?.({ userId: uid, plan: planInfo, meta });
      const t = now();
      // Same user, same plan, still inside its hold window: return that order instead of reserving another
      // amount (reloads and double clicks don't pile up orders or use up the 99 amount slots).
      const open = (await store.list({ userId: uid, status: 'pending', limit: 20 }))
        .find((o) => o.plan === p.id && o.holdUntil > t && fitsPrice(o, pricePaise));
      if (open) return { order: open, link: linkFor(open) };
      const amountPaise = await pickAmount(pricePaise);
      const order = {
        id: newId(),
        userId: uid,
        plan: p.id,
        planName: String(p.name),
        amountPaise,
        amount: formatPaise(amountPaise),
        status: 'pending',
        createdAt: t,
        holdUntil: t + holdMs,
      };
      if (meta !== undefined) order.meta = meta;
      await store.insert(order);
      return { order, link: linkFor(order) };
    },

    async getOrder(orderId) {
      return mustGet(orderId);
    },

    /** The payer reports the 12-digit UTR shown in their UPI app after paying. */
    async submitUtr({ orderId, userId, utr } = {}) {
      if (!isValidUtr(utr)) throw new UpiPayError('INVALID_UTR', 'UTR must be the 12-digit UPI transaction ID');
      const order = await mustGet(orderId);
      if (userId !== undefined && order.userId !== String(userId)) throw new UpiPayError('NOT_FOUND', 'Order not found');
      const updated = await store.update(order.id, ['pending'], {
        status: 'submitted',
        utr: normalizeUtr(utr),
        submittedAt: now(),
      });
      if (!updated) throw new UpiPayError('BAD_STATE', `Order is already ${order.status}`);
      await notify(onSubmitted, updated);
      return updated;
    },

    /**
     * Mark an order paid after you have seen the money in your bank / UPI app. Runs `onApproved(order)`;
     * if that throws, the order goes back to its previous state so you can retry.
     */
    async approve(orderId, { utr, by } = {}) {
      const order = await mustGet(orderId);
      if (utr !== undefined && !isValidUtr(utr)) throw new UpiPayError('INVALID_UTR', 'UTR must be the 12-digit UPI transaction ID');
      const patch = { status: 'approved', decidedAt: now() };
      if (utr !== undefined) patch.utr = normalizeUtr(utr);
      if (by !== undefined) patch.decidedBy = String(by);
      const updated = await store.update(order.id, ['pending', 'submitted'], patch);
      if (!updated) throw new UpiPayError('BAD_STATE', `Order is already ${order.status}`);
      try {
        await onApproved?.(updated);
      } catch (err) {
        await store.update(order.id, ['approved'], {
          status: order.status, decidedAt: undefined, decidedBy: undefined, utr: order.utr,
        });
        throw err;
      }
      return updated;
    },

    /** Reject (payment not found, wrong amount...). The UTR is freed so the real owner can still use it. */
    async reject(orderId, { reason, by } = {}) {
      const order = await mustGet(orderId);
      const patch = { status: 'rejected', decidedAt: now(), utr: undefined };
      if (order.utr !== undefined) patch.rejectedUtr = order.utr;
      if (reason !== undefined) patch.reason = String(reason).slice(0, 500);
      if (by !== undefined) patch.decidedBy = String(by);
      const updated = await store.update(order.id, ['pending', 'submitted'], patch);
      if (!updated) throw new UpiPayError('BAD_STATE', `Order is already ${order.status}`);
      await notify(onRejected, updated);
      return updated;
    },

    /** List orders. `amount` (rupees, e.g. "99.07") finds the order behind a credit in your bank app. */
    async list({ status, userId, amount, limit = 100 } = {}) {
      const filter = { limit: Math.min(Math.max(Number(limit) || 100, 1), 500) };
      if (status !== undefined) filter.status = status;
      if (userId !== undefined) filter.userId = String(userId);
      if (amount !== undefined) filter.amountPaise = toPaise(amount);
      return store.list(filter);
    },
  };
  return pay;
}
