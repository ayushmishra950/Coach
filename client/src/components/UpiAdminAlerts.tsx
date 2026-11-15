import { ArrowRight, QrCode } from 'lucide-react';
import { useEffect } from 'react';
import toast from 'react-hot-toast';
import { Link, useNavigate } from 'react-router-dom';
import { useSocketEvent } from '../context/RealtimeContext';
import { useApi } from '../hooks/useApi';
import type { UpiOrder } from './UpiPayModal';

/** Sent by the server to every signed-in Super Admin when an owner submits a UPI payment (see services/upi.ts). */
export interface UpiSubmittedEvent {
  id: string; amount: string; plan: string; utr?: string; institute: { name: string; city?: string } | null; submittedAt?: number;
}

/** Window event that tells every UPI list on screen to reload (after a socket event or an approve / reject). */
export const UPI_REFRESH = 'coachflow:upi-refresh';
export const refreshUpiLists = () => window.dispatchEvent(new Event(UPI_REFRESH));

/** Calls `reload` when a UPI payment is submitted, approved or rejected anywhere. */
export function useUpiRefresh(reload: () => void) {
  useEffect(() => {
    window.addEventListener(UPI_REFRESH, reload);
    return () => window.removeEventListener(UPI_REFRESH, reload);
  }, [reload]);
}

/** Number of UPI payments waiting for the Super Admin (0 when UPI is off or for other roles). */
export function useUpiPendingCount(enabled: boolean) {
  const { data, error, reload } = useApi<{ orders: UpiOrder[] }>(enabled ? '/upi/admin/orders' : null, { status: 'submitted' });
  useUpiRefresh(reload);
  return enabled && !error ? (data?.orders.length ?? 0) : 0;
}

/**
 * Super Admin shell: live alert when an owner submits a UPI payment (socket `upi:submitted`): a toast with a link
 * to Payments, a system notification if the browser allows it, and every list / badge on screen refreshes.
 */
export function UpiAdminListener() {
  const nav = useNavigate();
  useAskNotificationPermission();
  useSocketEvent<UpiSubmittedEvent>('upi:submitted', (e) => {
    refreshUpiLists();
    const who = e.institute?.name ?? 'An institute';
    const text = `${who} paid ₹${e.amount} for ${e.plan} by UPI${e.utr ? ` (UTR ${e.utr})` : ''}. Verify it in your bank app.`;
    toast(
      (t) => (
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700"><QrCode className="h-5 w-5" /></div>
          <div className="min-w-0 text-sm">
            <p className="font-bold text-slate-900">UPI payment to verify</p>
            <p className="text-slate-600">{text}</p>
            <button className="mt-1.5 inline-flex items-center gap-1 font-semibold text-brand-600" onClick={() => { toast.dismiss(t.id); nav('/admin/payments'); }}>
              Review now <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ),
      { id: `upi-${e.id}`, duration: 20_000 },
    );
    try {
      if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        const n = new Notification('UPI payment to verify', { body: text, tag: `upi-${e.id}` });
        n.onclick = () => { window.focus(); nav('/admin/payments'); n.close(); };
      }
    } catch { /* system notifications not available */ }
  });
  useSocketEvent('upi:changed', () => refreshUpiLists());
  return null;
}

/** Overview banner: UPI payments still waiting for a decision. */
export function UpiPendingBanner() {
  const count = useUpiPendingCount(true);
  if (!count) return null;
  return (
    <Link to="/admin/payments" className="mb-6 flex items-center gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 ring-1 ring-amber-200 transition hover:bg-amber-100">
      <QrCode className="h-5 w-5 shrink-0" />
      <span className="flex-1">{count} UPI payment{count === 1 ? '' : 's'} waiting for verification. Check the amount and UTR in your bank app, then approve or reject.</span>
      <span className="inline-flex items-center gap-1 text-amber-700">Review <ArrowRight className="h-4 w-4" /></span>
    </Link>
  );
}

/** Asks once for browser notifications so UPI alerts also show when the tab is in the background. */
export function useAskNotificationPermission() {
  useEffect(() => {
    try {
      if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission();
    } catch { /* not supported */ }
  }, []);
}
