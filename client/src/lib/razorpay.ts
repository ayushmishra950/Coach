import { api } from './api';
import type { Payment } from './types';

interface Order { keyId: string; orderId: string; amount: number; currency: string; name: string; description: string; prefill: Record<string, string | undefined>; color?: string }
interface RzpResponse { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }
type RzpCtor = new (opts: Record<string, unknown>) => { open: () => void; on: (ev: string, cb: (r: { error?: { description?: string } }) => void) => void };

let loading: Promise<void> | null = null;
function loadScript() {
  if ((window as unknown as { Razorpay?: RzpCtor }).Razorpay) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error('Could not load the payment window. Check your internet connection.'));
    };
    document.body.appendChild(s);
  });
  return loading;
}

/** Opens Razorpay Checkout for an order; resolves with the signed response, or null if closed. */
async function openCheckout(order: Order): Promise<RzpResponse | null> {
  await loadScript();
  const Rzp = (window as unknown as { Razorpay: RzpCtor }).Razorpay;
  return new Promise<RzpResponse | null>((resolve, reject) => {
    const rzp = new Rzp({
      key: order.keyId, order_id: order.orderId, amount: order.amount, currency: order.currency, name: order.name, description: order.description,
      prefill: order.prefill, theme: { color: order.color || '#6366f1' },
      handler: (r: RzpResponse) => resolve(r),
      modal: { ondismiss: () => resolve(null) },
    });
    rzp.on('payment.failed', (r) => reject(new Error(r?.error?.description || 'Payment failed. No money was taken — please try again.')));
    rzp.open();
  });
}

/**
 * Parent pays one fee installment (UPI, cards, net banking, wallets) into the institute's own
 * Razorpay account. Resolves with the recorded payment, or null if the parent closed the window.
 */
export async function payWithRazorpay(invoiceId: string): Promise<Payment | null> {
  const [{ data: order }] = await Promise.all([api.post<Order>('/parent/pay/order', { invoiceId }), loadScript()]);
  const resp = await openCheckout(order);
  if (!resp) return null;
  const { data } = await api.post<{ ok: boolean; payment: Payment }>('/parent/pay/verify', resp);
  return data.payment;
}

/** Owner pays for a CoachFlow plan. Resolves with the server result, or null if closed. */
export async function subscribeWithRazorpay(plan: string, cycle: string) {
  const [{ data: order }] = await Promise.all([api.post<Order>('/subscription/order', { plan, cycle }), loadScript()]);
  const resp = await openCheckout(order);
  if (!resp) return null;
  const { data } = await api.post<{ ok: boolean; reference: string; amount: number; currentPeriodEnd?: string }>('/subscription/verify', resp);
  return data;
}
