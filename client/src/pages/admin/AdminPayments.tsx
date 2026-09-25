import { CheckCircle2, CreditCard, Download, Percent, RotateCcw, Wallet, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Skeleton, StatCard, StatusBadge, Tabs, clsx } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
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

export default function AdminPayments() {
  const [status, setStatus] = useState<'all' | PayStatus>('all');
  const { data, loading, error, reload } = useApi<SubPayment[]>('/admin/payments', { status });
  // Unfiltered list for summary tiles so they don't change with the tab.
  const { data: all } = useApi<SubPayment[]>('/admin/payments', { status: 'all' });

  const summary = useMemo(() => {
    const list = all ?? [];
    const ok = list.filter((p) => p.status === 'success');
    const failed = list.filter((p) => p.status === 'failed');
    const refunded = list.filter((p) => p.status === 'refunded');
    const attempts = ok.length + failed.length;
    return {
      collected: ok.reduce((s, p) => s + p.amount, 0),
      successCount: ok.length,
      failed: failed.length,
      failedAmount: failed.reduce((s, p) => s + p.amount, 0),
      refunded: refunded.reduce((s, p) => s + p.amount, 0),
      refundedCount: refunded.length,
      rate: attempts ? Math.round((ok.length / attempts) * 1000) / 10 : 0,
    };
  }, [all]);

  const rows = data ?? [];

  const exportCsv = () => {
    if (!rows.length) return toast.error('Nothing to export');
    downloadCSV(`coachflow-subscription-payments-${status}`, rows.map((p) => ({
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
    toast.success(`Exported ${rows.length} payments`);
  };

  return (
    <div>
      <PageHeader
        title="Subscription payments"
        subtitle="Billing transactions from institutes to CoachFlow (latest 300)."
        actions={<Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={exportCsv} disabled={!rows.length}>Export CSV</Button>}
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
          <Tabs tabs={TABS.map((t) => ({ ...t, count: t.value === 'all' ? all?.length : all?.filter((p) => p.status === t.value).length }))} value={status} onChange={setStatus} />
          <p className="text-sm text-slate-500">{rows.length} transactions · <b className="text-slate-800">{inr(rows.reduce((s, p) => s + (p.status === 'success' ? p.amount : 0), 0))}</b> collected</p>
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
                  <th>Status</th><th>Reference</th><th>Failure reason</th>
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
                        <StatusBadge status={p.status} />
                      </span>
                    </td>
                    <td><code className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{p.reference || '—'}</code></td>
                    <td className="max-w-[240px] truncate text-sm text-rose-600" title={p.failureReason}>{p.failureReason || <span className="text-slate-300">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
