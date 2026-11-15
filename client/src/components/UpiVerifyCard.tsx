import { CheckCircle2, Copy, QrCode, XCircle } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { useApi } from '../hooks/useApi';
import { api, errMsg } from '../lib/api';
import { fmtDateTime, timeAgo } from '../lib/format';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Modal, Skeleton, Tabs, Textarea, clsx } from './ui';
import type { UpiOrder } from './UpiPayModal';
import { refreshUpiLists, useUpiRefresh } from './UpiAdminAlerts';

type AdminUpiOrder = UpiOrder & { userId: string; decidedBy?: string; institute: { name: string; city?: string } | null };
type Filter = 'submitted' | 'approved' | 'rejected';
const TABS: { value: Filter; label: string }[] = [
  { value: 'submitted', label: 'To verify' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

/**
 * Super Admin: UPI QR plan payments (pure-upi). Find the exact amount + UTR in the bank / UPI app statement,
 * then approve (the plan switches on) or reject with a reason (the owner is notified).
 */
export function UpiVerifyCard({ onChange }: { onChange?: () => void }) {
  const [status, setStatus] = useState<Filter>('submitted');
  const { data, loading, error, reload } = useApi<{ orders: AdminUpiOrder[] }>('/upi/admin/orders', { status });
  // New payments arrive live (socket), and the Payments badge updates after a decision.
  useUpiRefresh(reload);
  const [busy, setBusy] = useState('');
  const [rejecting, setRejecting] = useState<AdminUpiOrder | null>(null);
  const [approving, setApproving] = useState<AdminUpiOrder | null>(null);
  const [reason, setReason] = useState('');

  // UPI not set up on this server (503): nothing to show.
  if (error && /not set up/i.test(error)) return null;
  const orders = data?.orders ?? [];

  const approve = async () => {
    const o = approving;
    if (!o) return;
    setBusy(o.id);
    try {
      await api.post(`/upi/admin/orders/${o.id}/approve`, {});
      toast.success('Approved — plan activated');
      setApproving(null);
      refreshUpiLists();
      onChange?.();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy('');
    }
  };
  const reject = async () => {
    if (!rejecting) return;
    setBusy(rejecting.id);
    try {
      await api.post(`/upi/admin/orders/${rejecting.id}/reject`, { reason: reason.trim() });
      toast.success('Payment rejected');
      setRejecting(null);
      refreshUpiLists();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy('');
    }
  };
  const copy = (text: string) => { void navigator.clipboard?.writeText(text); toast.success('Copied'); };

  return (
    <Card pad={false} className="mb-6">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-600"><QrCode className="h-5 w-5" /></div>
          <div>
            <h3 className="font-bold text-slate-900">UPI QR payments</h3>
            <p className="text-sm text-slate-500">Match the exact amount and UTR in your bank app, then approve</p>
          </div>
        </div>
        <Tabs tabs={TABS.map((t) => ({ ...t, count: t.value === status ? orders.length : undefined }))} value={status} onChange={setStatus} />
      </div>
      {error ? (
        <div className="p-4"><ErrorState message={error} onRetry={reload} /></div>
      ) : loading && !data ? (
        <div className="space-y-3 p-4"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
      ) : orders.length === 0 ? (
        <EmptyState icon={<QrCode className="h-7 w-7" />} title={status === 'submitted' ? 'Nothing to verify' : 'No payments here'} text={status === 'submitted' ? 'New UPI payments appear here as soon as an owner submits the UTR.' : undefined} />
      ) : (
        <div className={clsx('table-wrap scrollbar-thin', loading && 'opacity-60')}>
          <table className="table">
            <thead><tr><th>Institute</th><th>Plan</th><th className="text-right">Amount</th><th>UTR</th><th>Submitted</th><th className="text-right">{status === 'submitted' ? 'Action' : 'Decision'}</th></tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <p className="font-semibold text-slate-900">{o.institute?.name ?? 'Deleted institute'}</p>
                    <p className="text-xs text-slate-500">{o.institute?.city}</p>
                  </td>
                  <td><Badge tone="blue">{o.planName ?? o.plan}</Badge></td>
                  <td className="text-right">
                    <button onClick={() => copy(o.amount)} className="inline-flex items-center gap-1 font-bold text-slate-900">₹{o.amount}<Copy className="h-3 w-3 text-slate-400" /></button>
                  </td>
                  <td>
                    {o.utr || o.rejectedUtr ? (
                      <button onClick={() => copy(o.utr ?? o.rejectedUtr ?? '')} className="inline-flex items-center gap-1"><code className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">{o.utr ?? o.rejectedUtr}</code><Copy className="h-3 w-3 text-slate-400" /></button>
                    ) : '—'}
                  </td>
                  <td title={o.submittedAt ? fmtDateTime(new Date(o.submittedAt)) : undefined}>{timeAgo(new Date(o.submittedAt ?? o.createdAt))}</td>
                  <td className="text-right">
                    {o.status === 'submitted' ? (
                      <span className="inline-flex gap-2">
                        <Button size="sm" variant="success" loading={busy === o.id} disabled={!!busy} icon={<CheckCircle2 className="h-3.5 w-3.5" />} onClick={() => setApproving(o)}>Approve</Button>
                        <Button size="sm" variant="ghost" className="text-rose-600 hover:bg-rose-50" disabled={!!busy} icon={<XCircle className="h-3.5 w-3.5" />} onClick={() => { setReason(''); setRejecting(o); }}>Reject</Button>
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500">{o.status === 'rejected' && o.reason ? o.reason : o.status}{o.decidedAt ? ` · ${timeAgo(new Date(o.decidedAt))}` : ''}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog open={!!approving} onClose={() => !busy && setApproving(null)} onConfirm={approve} loading={!!busy}
        title="Approve this UPI payment?" confirmLabel="Yes, approve"
        text={approving && <>Approve only if <b>₹{approving.amount}</b> with UTR <b className="font-mono">{approving.utr}</b> is in your bank / UPI statement. {approving.institute?.name ?? 'The institute'} gets {approving.planName ?? approving.plan} straight away.</>} />

      <Modal open={!!rejecting} onClose={() => !busy && setRejecting(null)} size="sm" title="Reject this UPI payment?"
        footer={<><Button variant="secondary" disabled={!!busy} onClick={() => setRejecting(null)}>Cancel</Button>
          <Button variant="danger" loading={!!busy} disabled={reason.trim().length < 5} icon={<XCircle className="h-4 w-4" />} onClick={reject}>Reject payment</Button></>}>
        {rejecting && (
          <div className="space-y-4 text-sm text-slate-600">
            <p><b className="text-slate-900">₹{rejecting.amount}</b> · UTR <code className="text-xs">{rejecting.utr}</code> · {rejecting.institute?.name ?? 'Deleted institute'}. The owner is notified with this reason.</p>
            <Textarea label="Reason (shown to the owner)" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. No payment with this UTR reached our account" />
          </div>
        )}
      </Modal>
    </Card>
  );
}
