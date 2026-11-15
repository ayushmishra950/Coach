import crypto from 'node:crypto';
import { Router, type Request } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { allow, auth, requireFeature } from '../middleware/auth.js';
import { Institute, Invoice, Payment, Student, User } from '../models/index.js';
import { recordPayment } from '../services/payments.js';
import { createOrder, fetchOrder, loadInstituteCreds, verifySignature } from '../services/razorpay.js';
import { HttpError, ah, oid, str } from '../utils/http.js';

/**
 * Helpers for the mobile app (Expo):
 *   POST /api/parent/pay/link        → a 20-minute link to a hosted Razorpay page (the app opens it in the browser)
 *   GET  /api/public/pay/:token      → that page (Razorpay Checkout)
 *   POST /api/public/pay/:token/verify
 * A native app can't run Razorpay's web checkout itself, so payment happens on this small page and
 * the browser returns to the app via the coachflow:// link.
 */
const PAY_TTL = 20 * 60;
const APP_RETURN = 'coachflow://payment';

export const appParent = Router();
appParent.use(auth, allow('parent'), requireFeature('parentPortal'), requireFeature('onlinePayments'));

appParent.post(
  '/pay/link',
  ah(async (req, res) => {
    const inv = await Invoice.findOne({ _id: oid(req.body?.invoiceId), instituteId: req.user.instituteId });
    if (!inv || !req.user.studentIds.some((s) => String(s) === String(inv.studentId))) throw new HttpError(404, 'Invoice not found');
    if (inv.amount - inv.paidAmount <= 0) throw new HttpError(400, 'This installment is already paid');
    if (!(await loadInstituteCreds(req.user.instituteId))) throw new HttpError(503, 'Online payment is not set up yet. Please pay at the institute office.');
    const token = jwt.sign({ p: 'pay', inv: String(inv._id), uid: String(req.user.id), inst: String(inv.instituteId) }, config.jwtSecret, { expiresIn: PAY_TTL, algorithm: 'HS256' });
    res.json({ url: `${origin(req)}/api/public/pay/${token}`, returnUrl: APP_RETURN });
  }),
);

/** The address the app itself used to reach this server — so the phone can open the page too. */
function origin(req: Request) {
  return `${req.protocol}://${req.get('host')}`;
}

function readToken(token: string) {
  try {
    const t = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }) as { p?: string; inv: string; uid: string; inst: string };
    if (t.p !== 'pay') throw new Error('wrong token');
    return t;
  } catch {
    throw new HttpError(401, 'This payment link has expired. Please go back to the app and tap Pay again.');
  }
}

async function context(token: string) {
  const t = readToken(token);
  const [inv, user, inst] = await Promise.all([
    Invoice.findOne({ _id: oid(t.inv), instituteId: oid(t.inst) }),
    User.findOne({ _id: oid(t.uid), role: 'parent', active: true }).select('name email phone studentIds').lean(),
    Institute.findById(oid(t.inst)),
  ]);
  if (!inv || !user || !inst || !user.studentIds.some((s) => String(s) === String(inv.studentId))) throw new HttpError(404, 'Invoice not found');
  const creds = await loadInstituteCreds(inst._id);
  if (!creds) throw new HttpError(503, 'Online payment is not set up yet.');
  return { inv, user, inst, creds };
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const publicPay = Router();

publicPay.get(
  '/:token',
  ah(async (req, res) => {
    let page: string;
    const nonce = crypto.randomBytes(16).toString('base64');
    try {
      const { inv, user, inst, creds } = await context(req.params.token);
      const due = inv.amount - inv.paidAmount;
      const student = await Student.findById(inv.studentId).select('name').lean();
      if (due <= 0) {
        page = shell(inst.name, `<h2>Already paid ✓</h2><p>This installment has no amount due.</p><a class="btn" href="${APP_RETURN}">Back to the app</a>`, nonce);
      } else {
        const order = await createOrder(creds, due, `app_${String(inv._id).slice(-10)}_${Date.now().toString(36)}`, {
          invoiceId: String(inv._id), instituteId: String(inst._id), studentId: String(inv.studentId),
        });
        const opts = {
          key: creds.keyId, order_id: order.id, amount: order.amount, currency: order.currency, name: inst.name,
          description: `${inv.title} — ${student?.name ?? ''}`, prefill: { name: user.name, email: user.email, contact: user.phone }, theme: { color: inst.brandColor || '#6366f1' },
        };
        page = shell(inst.name, `
          <p class="muted">${esc(inv.title)} · ${esc(student?.name)}</p>
          <p class="amount">₹${due.toLocaleString('en-IN')}</p>
          <button class="btn" id="pay">Pay now</button>
          <p class="muted small">UPI · Debit / Credit card · Net banking — secured by Razorpay</p>
          <p id="msg" class="muted"></p>
          <script nonce="${nonce}" src="https://checkout.razorpay.com/v1/checkout.js"></script>
          <script nonce="${nonce}">
            var opts = ${JSON.stringify(opts).replace(/</g, '\\u003c')};
            var msg = document.getElementById('msg');
            opts.handler = function (r) {
              msg.textContent = 'Confirming payment…';
              fetch(location.pathname + '/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(r) })
                .then(function (x) { return x.json().then(function (j) { return { ok: x.ok, j: j }; }); })
                .then(function (o) {
                  if (!o.ok) { msg.textContent = o.j.message || 'Could not confirm the payment.'; return; }
                  document.body.innerHTML = '<div class="card"><h2>Payment successful ✓</h2><p>Receipt ' + o.j.receiptNo + '</p><a class="btn" href="${APP_RETURN}?receipt=' + o.j.paymentId + '">Back to the app</a></div>';
                  location.href = '${APP_RETURN}?receipt=' + o.j.paymentId;
                })
                .catch(function () { msg.textContent = 'Network problem — your payment is safe. Reopen the app to check.'; });
            };
            opts.modal = { ondismiss: function () { msg.textContent = 'Payment cancelled.'; } };
            var rzp = new Razorpay(opts);
            rzp.on('payment.failed', function (r) { msg.textContent = (r.error && r.error.description) || 'Payment failed. No money was taken.'; });
            document.getElementById('pay').onclick = function () { rzp.open(); };
            rzp.open();
          </script>`, nonce);
      }
    } catch (e) {
      page = shell('Payment', `<h2>Can't open this payment</h2><p>${esc((e as Error).message)}</p><a class="btn" href="${APP_RETURN}">Back to the app</a>`, nonce);
    }
    // This page needs its own inline script (nonce) and Razorpay's frames.
    res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'nonce-${nonce}' https://checkout.razorpay.com https://*.razorpay.com; style-src 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://*.razorpay.com; frame-src https://*.razorpay.com; base-uri 'none'; form-action 'self'`);
    res.setHeader('Cache-Control', 'no-store');
    res.type('html').send(page);
  }),
);

publicPay.post(
  '/:token/verify',
  ah(async (req, res) => {
    const { inv, inst, creds } = await context(req.params.token);
    const orderId = str(req.body?.razorpay_order_id);
    const paymentId = str(req.body?.razorpay_payment_id);
    const signature = str(req.body?.razorpay_signature);
    if (!orderId || !paymentId || !signature || !verifySignature(creds, orderId, paymentId, signature)) throw new HttpError(400, 'Payment could not be verified');
    const existing = await Payment.findOne({ instituteId: inst._id, reference: paymentId }).lean();
    if (existing) return res.json({ ok: true, paymentId: existing._id, receiptNo: existing.receiptNo });
    const order = await fetchOrder(creds, orderId);
    if (order.notes?.invoiceId !== String(inv._id)) throw new HttpError(400, 'Payment does not match this invoice');
    const due = inv.amount - inv.paidAmount;
    if (due <= 0) throw new HttpError(409, `This installment was already paid. Payment ${paymentId} will be refunded by the institute.`);
    const paid = Math.round(order.amount / 100);
    const payment = await recordPayment({
      institute: inst, invoiceId: inv._id, amount: Math.min(paid, due), method: 'online', reference: paymentId, note: `Razorpay ${orderId} (mobile app)`,
    });
    res.json({ ok: true, paymentId: payment._id, receiptNo: payment.receiptNo });
  }),
);

function shell(title: string, body: string, _nonce: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f1f5f9;margin:0;display:grid;place-items:center;min-height:100vh;color:#0f172a}
.card{background:#fff;border-radius:24px;padding:32px 24px;max-width:380px;width:90%;text-align:center;box-shadow:0 10px 40px -10px rgba(15,23,42,.2)}
.amount{font-size:40px;font-weight:800;margin:8px 0 20px}.muted{color:#64748b}.small{font-size:12px}
.btn{display:inline-block;background:#4f46e5;color:#fff;border:0;border-radius:14px;padding:14px 28px;font-weight:700;font-size:16px;text-decoration:none;cursor:pointer;width:100%;box-sizing:border-box}</style>
</head><body><div class="card"><p style="font-weight:800;font-size:18px">${esc(title)}</p>${body}</div></body></html>`;
}
