import crypto from 'node:crypto';
import { config } from '../config.js';
import { HttpError } from '../utils/http.js';

/**
 * Razorpay Orders API + checkout signature check (no SDK needed).
 *
 * Two different accounts:
 *  - Parent fee payments go to the INSTITUTE's own Razorpay account (keys saved by the owner in
 *    Settings → Payments; the secret is stored encrypted).
 *  - Plan subscriptions go to the CoachFlow platform account (RAZORPAY_KEY_ID / _SECRET in .env).
 */
export interface RzpCreds { keyId: string; keySecret: string }

export const platformCreds = (): RzpCreds | null =>
  config.razorpay.keyId && config.razorpay.keySecret ? { keyId: config.razorpay.keyId, keySecret: config.razorpay.keySecret } : null;

/* ── Encryption of the institute's key secret at rest (AES-256-GCM, key derived from the server secret) ── */
const encKey = () => crypto.createHash('sha256').update(`razorpay:${config.jwtSecret}`).digest();

export function encryptSecret(plain: string) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', encKey(), iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return `v1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${data.toString('base64')}`;
}

export function decryptSecret(enc?: string | null) {
  if (!enc) return null;
  try {
    const [v, iv, tag, data] = enc.split(':');
    if (v !== 'v1') return null;
    const d = crypto.createDecipheriv('aes-256-gcm', encKey(), Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
  } catch {
    return null; // server secret changed → the owner has to enter the key again
  }
}

/** Loads the institute's own Razorpay keys from the database (the secret is never in normal queries). */
export async function loadInstituteCreds(instituteId: unknown): Promise<RzpCreds | null> {
  const { Institute } = await import('../models/index.js');
  const inst = await Institute.findById(instituteId).select('+payments.razorpaySecretEnc payments').lean();
  return inst ? instituteCreds(inst) : null;
}

/** The institute's own Razorpay keys, or null when not connected. */
export function instituteCreds(inst: { payments?: { razorpayKeyId?: string | null; razorpaySecretEnc?: string | null; enabled?: boolean | null } | null }): RzpCreds | null {
  const p = inst.payments;
  if (!p?.enabled || !p.razorpayKeyId) return null;
  const secret = decryptSecret(p.razorpaySecretEnc);
  return secret ? { keyId: p.razorpayKeyId, keySecret: secret } : null;
}

async function call<T>(creds: RzpCreds, path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...init,
    headers: { Authorization: `Basic ${Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString('base64')}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
  }).catch(() => {
    throw new HttpError(502, 'Could not reach the payment gateway. Please try again.');
  });
  const data = (await r.json().catch(() => ({}))) as T & { error?: { description?: string } };
  if (r.status === 401) throw new HttpError(502, 'Payment gateway keys are not valid. Please check them in Settings → Payments.');
  if (!r.ok) throw new HttpError(502, data?.error?.description || 'Payment gateway error');
  return data;
}

export interface RzpOrder { id: string; amount: number; amount_paid: number; currency: string; status: string; receipt?: string; notes?: Record<string, string> }

export function createOrder(creds: RzpCreds, amountRupees: number, receipt: string, notes: Record<string, string>) {
  return call<RzpOrder>(creds, '/orders', { method: 'POST', body: JSON.stringify({ amount: Math.round(amountRupees * 100), currency: 'INR', receipt: receipt.slice(0, 40), notes }) });
}

export const fetchOrder = (creds: RzpCreds, id: string) => call<RzpOrder>(creds, `/orders/${encodeURIComponent(id)}`);

/** Cheap call used by "Test connection" in Settings. */
export const checkKeys = (creds: RzpCreds) => call<{ count: number }>(creds, '/orders?count=1');

/** HMAC-SHA256(order_id|payment_id, key_secret) must equal the signature Checkout returned. */
export function verifySignature(creds: RzpCreds, orderId: string, paymentId: string, signature: string) {
  const expected = crypto.createHmac('sha256', creds.keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
