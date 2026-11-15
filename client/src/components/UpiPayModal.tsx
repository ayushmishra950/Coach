import { CheckCircle2, Clock, Copy, ExternalLink, ShieldCheck, XCircle } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { useSocketEvent } from '../context/RealtimeContext';
import { api, errMsg } from '../lib/api';
import { fmtDate } from '../lib/format';
import { Button, Input, Modal, Spinner } from './ui';

/** An order from /api/upi (pure-upi). `amount` is exact rupees with paise, e.g. "999.37". */
export interface UpiOrder {
  id: string; plan: string; planName?: string; amount: string; status: 'pending' | 'submitted' | 'approved' | 'rejected';
  utr?: string; rejectedUtr?: string; reason?: string; createdAt: number; holdUntil: number; submittedAt?: number; decidedAt?: number;
}
interface OrderResponse { order: UpiOrder; link?: string; qrSvg?: string }

/** Phones and tablets can open the UPI app straight from the link; on a computer the QR is scanned. */
const onPhone = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

/**
 * Pay for a plan by UPI QR: an exact amount (with paise, so we can find it in the bank statement),
 * then the 12-digit UTR from the UPI app. The Super Admin verifies it and the plan switches on.
 */
export function UpiPayModal({ open, plan, cycle, upi, onClose, onPaid }: {
  open: boolean;
  plan: { key: string; name: string } | null;
  cycle: 'monthly' | 'yearly';
  upi: { upiId: string; payeeName: string };
  onClose: () => void;
  /** The order was approved while the dialog was open. */
  onPaid: (order: UpiOrder) => void;
}) {
  const [data, setData] = useState<OrderResponse | null>(null);
  const [error, setError] = useState('');
  const [utr, setUtr] = useState('');
  const [busy, setBusy] = useState(false);
  const order = data?.order;
  const paidRef = useRef(onPaid);
  paidRef.current = onPaid;
  // onPaid runs once per order even if the socket and the 8 s check both see the approval.
  const paidOnce = useRef<string | null>(null);
  const paid = (o: UpiOrder) => {
    if (paidOnce.current === o.id) return;
    paidOnce.current = o.id;
    paidRef.current(o);
  };

  // A new order (or the open one for the same plan) each time the dialog opens.
  useEffect(() => {
    if (!open || !plan) return;
    let live = true;
    setData(null);
    setError('');
    setUtr('');
    api.post<OrderResponse>('/upi/orders', { plan: `${plan.key}_${cycle}` })
      .then((r) => live && setData(r.data))
      .catch((e) => live && setError(errMsg(e)));
    return () => { live = false; };
  }, [open, plan, cycle]);

  // Super Admin approved / rejected this payment → show the result at once (the 8 s check below is the fallback).
  useSocketEvent<{ upi?: { id: string; status: string } }>('institute:updated', async (e) => {
    if (!open || !order || e?.upi?.id !== order.id) return;
    try {
      const { data: res } = await api.get<OrderResponse>(`/upi/orders/${order.id}`);
      setData((d) => (d ? { ...d, order: res.order } : d));
      if (res.order.status === 'approved') paid(res.order);
    } catch { /* the interval below tries again */ }
  });

  // While we verify the payment, check every 8 s so the owner sees the result without reloading.
  useEffect(() => {
    if (!open || order?.status !== 'submitted') return;
    const t = setInterval(async () => {
      try {
        const { data: res } = await api.get<OrderResponse>(`/upi/orders/${order.id}`);
        setData((d) => (d ? { ...d, order: res.order } : d));
        if (res.order.status === 'approved') paid(res.order);
      } catch { /* try again on the next tick */ }
    }, 8000);
    return () => clearInterval(t);
  }, [open, order?.id, order?.status]);

  const clean = utr.replace(/\s+/g, '');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!order) return;
    setBusy(true);
    try {
      const { data: res } = await api.post<{ order: UpiOrder }>(`/upi/orders/${order.id}/utr`, { utr: clean });
      setData((d) => (d ? { ...d, order: res.order } : d));
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const copy = (text: string, what: string) => {
    void navigator.clipboard?.writeText(text);
    toast.success(`${what} copied`);
  };

  const title = order?.status === 'approved' ? 'Payment verified' : order?.status === 'submitted' ? 'Verifying your payment' : 'Pay by UPI';
  return (
    <Modal open={open} onClose={() => !busy && onClose()} title={title} subtitle={plan ? `${plan.name} · ${cycle}` : undefined} size="sm"
      footer={order && order.status !== 'pending' ? <Button onClick={onClose}>Done</Button> : undefined}>
      {error ? (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      ) : !order ? (
        <div className="grid place-items-center py-14"><Spinner /></div>
      ) : order.status === 'approved' ? (
        <div className="py-4 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 className="h-9 w-9" /></div>
          <p className="mt-4 text-sm text-slate-600">We received <b>₹{order.amount}</b> (UTR <span className="font-mono">{order.utr}</span>). Your plan is active.</p>
        </div>
      ) : order.status === 'rejected' ? (
        <div className="py-4 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-rose-50 text-rose-600"><XCircle className="h-9 w-9" /></div>
          <p className="mt-4 text-sm text-slate-600">We could not verify this payment{order.reason ? `: ${order.reason}` : ''}. If money left your account, raise a ticket with a screenshot.</p>
        </div>
      ) : order.status === 'submitted' ? (
        <div className="py-4 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-amber-50 text-amber-600"><Clock className="h-9 w-9" /></div>
          <p className="mt-4 text-sm text-slate-600">
            Thanks! We are checking <b>₹{order.amount}</b> with UTR <span className="font-mono">{order.utr}</span> in our bank statement.
            Your plan switches on as soon as it is verified, usually within a few hours. You can close this window.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
            {/* qrSvg is generated by our own server (pure-upi) from the order; it contains no user input. */}
            <div className="w-44 shrink-0 rounded-2xl bg-white p-2 ring-1 ring-slate-200" aria-label={`UPI QR code: pay ₹${order.amount}`} dangerouslySetInnerHTML={{ __html: data?.qrSvg ?? '' }} />
            <div className="w-full space-y-2 text-sm">
              <div>
                <p className="text-xs text-slate-500">Pay exactly</p>
                <button type="button" onClick={() => copy(order.amount, 'Amount')} className="flex items-center gap-1.5 text-2xl font-extrabold text-slate-900">
                  ₹{order.amount} <Copy className="h-4 w-4 text-slate-400" />
                </button>
              </div>
              <div>
                <p className="text-xs text-slate-500">To</p>
                <p className="font-semibold text-slate-800">{upi.payeeName}</p>
                <button type="button" onClick={() => copy(upi.upiId, 'UPI ID')} className="flex items-center gap-1.5 font-mono text-xs text-slate-600">
                  {upi.upiId} <Copy className="h-3.5 w-3.5 text-slate-400" />
                </button>
              </div>
              {data?.link && onPhone() && (
                <a href={data.link} className="btn-secondary btn-sm inline-flex"><ExternalLink className="h-3.5 w-3.5" /> Open UPI app</a>
              )}
            </div>
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-xs text-slate-500">
            <li>Scan with any UPI app (GPay, PhonePe, Paytm, BHIM) and pay the <b>exact</b> amount, paise included.</li>
            <li>Copy the 12-digit <b>UPI reference / UTR</b> from the payment receipt and enter it below.</li>
          </ol>
          <Input label="UPI reference number (UTR)" inputMode="numeric" autoComplete="off" placeholder="12 digits, e.g. 412345678901"
            value={utr} onChange={(e) => setUtr(e.target.value.replace(/[^\d\s]/g, '').slice(0, 15))}
            hint={`This amount is held for you until ${fmtDate(new Date(order.holdUntil))} ${new Date(order.holdUntil).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}.`} />
          <Button type="submit" className="w-full" loading={busy} disabled={!/^\d{12}$/.test(clean)} icon={<ShieldCheck className="h-4 w-4" />}>
            I have paid — submit UTR
          </Button>
        </form>
      )}
    </Modal>
  );
}
