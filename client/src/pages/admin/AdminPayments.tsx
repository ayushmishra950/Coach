import { CheckCircle2, CreditCard, Download, Percent, RotateCcw, Wallet, XCircle } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Badge, Button, Card, EmptyState, ErrorState, Modal, PageHeader, Skeleton, StatCard, StatusBadge, Tabs, Textarea, clsx } from '../../components/ui';
import { Pager } from '../../components/Pager';
import { usePagedApi } from '../../hooks/useApi';
import { api, errMsg } from '../../lib/api';
import { downloadCSV, fmtDate, fmtDateTime, inr, inrShort } from '../../lib/format';

type PayStatus = 'success' | 'failed' | 'refunded';
interface SubPayment {
  _id: string;
  instituteId: { _id: string; name: string; city?: string } | null;
  plan: string; cycle: 'monthly' | 'yearly'; amount: number; status: PayStatus;
  reference?: string; failureReason?: string; createdAt: string;
}

const TABS: { value: 'all' | PayStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'success', label: 'Successful' },
  { value: 'failed', label: 'Failed' },
  { value: 'refunded', label: 'Refunded' },
];

interface PaySummary { collected: number; successCount: number; failed: number; failedAmount: number; refunded: number; refundedCount: number; rate: number }
const EMPTY_SUMMARY: PaySummary = { collected: 0, successCount: 0, failed: 0, failedAmount: 0, refunded: 0, refundedCount: 0, rate: 0 };

export default function AdminPayments() {
  const [status, setStatus] = useState<'all' | PayStatus>('all');
  const list = usePagedApi<SubPayment, { summary: PaySummary }>('/admin/payments', { status });
  const { data, loading, error, reload } = list;
  // Summary is computed by the server across ALL payments, so the tiles don't change with the tab.
  const summary = data?.summary ?? EMPTY_SUMMARY;
  const allCount = summary.successCount + summary.failed + summary.refundedCount;
  const tabCount = (v: 'all' | PayStatus) =>
    !data ? undefined : v === 'all' ? allCount : v === 'success' ? summary.successCount : v === 'failed' ? summary.failed : summary.refundedCount;
  const tabCollected = status === 'all' || status === 'success' ? summary.collected : 0;

  const rows = data?.items ?? [];

  const [refunding, setRefunding] = useState<SubPayment | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [refundBusy, setRefundBusy] = useState(false);
  const openRefund = (p: SubPayment) => { setRefunding(p); setRefundReason(''); };
  const refund = async () => {
    if (!refunding) return;
    if (refundReason.trim().length < 3) return void toast.error('Enter a reason for the refund');
    setRefundBusy(true);
    try {
      await api.post(`/admin/payments/${refunding._id}/refund`, { reason: refundReason.trim() });
      toast.success(`${inr(refunding.amount)} marked as refunded`);
      setRefunding(null);
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setRefundBusy(false);
    }
  };

  // CSV covers every payment for the selected tab (fetched only when downloading).
  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    setExporting(true);
    try {
      const { data: all } = await api.get<SubPayment[]>('/admin/payments/export', { params: { status } });
      if (!all.length) return void toast.error('Nothing to export');
      downloadCSV(`coachflow-subscription-payments-${status}`, all.map((p) => ({
        Date: fmtDateTime(p.createdAt),
        Institute: p.instituteId?.name ?? '',
        City: p.instituteId?.city ?? '',
        Plan: p.plan,
        Cycle: p.cycle,
        Amount: p.amount,
        Status: p.status,
        Reference: p.reference ?? '',
        'Failure reason': p.failureReason ?? '',
      })));
      toast.success(`Exported ${all.length} payments`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Subscription payments"
        subtitle="Billing transactions from institutes to CoachFlow, newest first."
        actions={<Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={exportCsv} loading={exporting} disabled={!rows.length}>Export CSV</Button>}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Collected" value={inrShort(summary.collected)} icon={<Wallet className="h-5 w-5" />} tone="green" hint={`${summary.successCount} successful payments`} />
        <StatCard label="Failed" value={summary.failed} icon={<XCircle className="h-5 w-5" />} tone="rose" hint={`${inr(summary.failedAmount)} at risk`} />
        <StatCard label="Success rate" value={`${summary.rate}%`} icon={<Percent className="h-5 w-5" />} tone="brand"
          hint={<div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-violet-500" style={{ width: `${summary.rate}%` }} /></div>} />
        <StatCard label="Refunded" value={inrShort(summary.refunded)} icon={<RotateCcw className="h-5 w-5" />} tone="amber" hint={`${summary.refundedCount} refunds`} />
      </div>

      <Card pad={false} className="mt-6">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <Tabs tabs={TABS.map((t) => ({ ...t, count: tabCount(t.value) }))} value={status} onChange={setStatus} />
          <p className="text-sm text-slate-500">{data?.total ?? 0} transactions · <b className="text-slate-800">{inr(tabCollected)}</b> collected</p>
        </div>

        {error ? (
          <div className="p-4"><ErrorState message={error} onRetry={reload} /></div>
        ) : loading && !data ? (
          <div className="space-y-3 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<CreditCard className="h-7 w-7" />} title="No payments" text="No subscription payments match this filter." />
        ) : (
          <div className={clsx('table-wrap scrollbar-thin', loading && 'opacity-60')}>
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th><th>Institute</th><th>Plan</th><th>Cycle</th><th className="text-right">Amount</th>
                  <th>Status</th><th>Reference</th><th>Failure reason</th><th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p._id}>
                    <td>
                      <p className="font-medium text-slate-800">{fmtDate(p.createdAt)}</p>
                      <p className="text-xs text-slate-400">{new Date(p.createdAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</p>
                    </td>
                    <td>
                      <p className="font-semibold text-slate-900">{p.instituteId?.name ?? 'Deleted institute'}</p>
                      <p className="text-xs text-slate-500">{p.instituteId?.city}</p>
                    </td>
                    <td><Badge tone={p.plan === 'premium' ? 'violet' : p.plan === 'growth' ? 'blue' : 'gray'} className="capitalize">{p.plan}</Badge></td>
                    <td className="capitalize text-slate-600">{p.cycle}</td>
                    <td className={clsx('text-right font-bold', p.status === 'success' ? 'text-slate-900' : 'text-slate-400', p.status === 'refunded' && 'line-through')}>{inr(p.amount)}</td>
                    <td>
                      <span className="inline-flex items-center gap-1.5">
                        {p.status === 'success' && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                        {p.status === 'refunded' ? <Badge tone="violet">Refunded</Badge> : <StatusBadge status={p.status} />}
                      </span>
                    </td>
                    <td><code className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{p.reference || '—'}</code></td>
                    <td className="max-w-[240px] truncate text-sm text-rose-600" title={p.failureReason}>{p.failureReason || <span className="text-slate-300">—</span>}</td>
                    <td className="text-right">
                      {p.status === 'success' && (
                        <Button size="sm" variant="ghost" className="text-rose-600 hover:bg-rose-50" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => openRefund(p)}>Refund</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.pager && <Pager {...list.pager} noun="payments" />}
      </Card>

      <Modal open={!!refunding} onClose={() => !refundBusy && setRefunding(null)} size="sm" title="Refund this payment?"
        footer={<><Button variant="secondary" disabled={refundBusy} onClick={() => setRefunding(null)}>Cancel</Button>
          <Button variant="danger" loading={refundBusy} disabled={refundBusy || refundReason.trim().length < 3} icon={<RotateCcw className="h-4 w-4" />} onClick={refund}>Mark as refunded</Button></>}>
        {refunding && (
          <div className="space-y-4 text-sm text-slate-600">
            <p>
              <b className="text-slate-900">{inr(refunding.amount)}</b> from <b className="text-slate-900">{refunding.instituteId?.name ?? 'Deleted institute'}</b> on {fmtDate(refunding.createdAt)}
              {refunding.reference ? <> (<code className="text-xs">{refunding.reference}</code>)</> : null}.
            </p>
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-amber-800">This only marks the payment as refunded in CoachFlow. Return the money in the payment gateway or bank.</p>
            <Textarea label="Reason" maxLength={150} value={refundReason} onChange={(e) => setRefundReason(e.target.value)} placeholder="e.g. Charged twice for the same month" />
          </div>
        )}
      </Modal>
    </div>
  );
}
