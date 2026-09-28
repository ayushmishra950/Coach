import {
  AlertCircle, Ban, BellRing, CalendarClock, CheckCircle2, Download, IndianRupee, Layers, Receipt as ReceiptIcon, Settings2, Users, Wallet,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  Avatar, Badge, Button, Card, CardHeader, ChartTooltip, EmptyState, ErrorState, Input, Modal, PageHeader, Progress, SearchInput, Select,
  Skeleton, StatCard, StatusBadge, Tabs, Textarea, Toggle, clsx, type BadgeTone,
} from '../../components/ui';
import { Pager } from '../../components/Pager';
import { UpgradeCard } from '../../components/Upgrade';
import { useAuth } from '../../context/AuthContext';
import { useApi, useDebounced, usePagedApi } from '../../hooks/useApi';
import { api, errMsg } from '../../lib/api';
import { downloadCSV, fmtDate, fmtDateTime, inr, inrShort, ymd } from '../../lib/format';
import type { FeeRollup, Invoice, Paged, Payment } from '../../lib/types';

interface Summary {
  total: number; collected: number; pending: number; overdue: number; overdueStudents: number;
  collectedThisMonth: number; paymentsThisMonth: number;
  monthly: { month: string; year: number; amount: number }[];
  methods: { method: string; amount: number }[];
}
interface FeeStudent {
  _id: string; studentCode: string; name: string; parentName?: string; parentPhone?: string; status: string;
  batchIds: { _id: string; name: string }[]; fees: FeeRollup;
}
type StudentRef = { _id: string; name: string; studentCode: string; parentPhone?: string };
type TabKey = 'students' | 'installments' | 'payments';
type Filter = 'all' | 'pending' | 'overdue' | 'paid' | 'nostructure';
type InvFilter = 'unpaid' | 'overdue' | 'paid' | 'all';
type PayFilter = 'all' | 'void';
/** Payment as listed on the fees page (void = cancelled receipt). */
type FeePayment = Payment & { status?: 'valid' | 'void'; voidReason?: string; voidedAt?: string };

const METHOD_COLORS: Record<string, string> = { upi: '#6366f1', cash: '#10b981', bank: '#0ea5e9', card: '#f59e0b', online: '#ec4899' };
const METHOD_TONE: Record<string, BadgeTone> = { upi: 'brand', cash: 'green', bank: 'blue', card: 'amber', online: 'violet' };
const METHOD_LABEL: Record<string, string> = { upi: 'UPI', cash: 'Cash', bank: 'Bank transfer', card: 'Card', online: 'Online' };
/** Methods an owner can record by hand ("online" only comes from the payment gateway). */
const MANUAL_METHODS = ['cash', 'upi', 'bank', 'card'] as const;

/** Overdue = due date is before today (local). On the due date itself it is "Due today". */
const dueDay = (inv: Invoice) => ymd(new Date(inv.dueDate));
const isOverdue = (inv: Invoice) => inv.status !== 'paid' && dueDay(inv) < ymd();
const isDueToday = (inv: Invoice) => inv.status !== 'paid' && dueDay(inv) === ymd();
function yearAgo() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return ymd(d);
}
const due = (inv: Invoice) => inv.amount - inv.paidAmount;
const studentOf = (inv: Invoice | Payment) => (typeof inv.studentId === 'object' ? inv.studentId : null) as StudentRef | null;

/**
 * Lists refresh after a payment / structure change without leaving the current page
 * (`bump` triggers a reload, it is not a filter). Emptied pages step back automatically.
 */
function useReloadOn(bump: number, reload: () => void) {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bump]);
}

export default function Fees() {
  const { hasFeature } = useAuth();
  const summary = useApi<Summary>('/fees/summary');
  const [tab, setTab] = useState<TabKey>('students');
  const [collectFor, setCollectFor] = useState<{ student: StudentRef; invoiceId?: string } | null>(null);
  const [structureFor, setStructureFor] = useState<FeeStudent | null>(null);
  const [running, setRunning] = useState(false);
  const [bump, setBump] = useState(0);

  const refreshAll = () => {
    summary.reload();
    setBump((b) => b + 1);
  };

  const runReminders = async () => {
    setRunning(true);
    try {
      const { data } = await api.post<{ sent: number }>('/fees/reminders/run');
      toast.success(`${data.sent} reminder${data.sent === 1 ? '' : 's'} sent`);
      setBump((b) => b + 1);
    } catch (e) {
      // 409 = a run is already in progress; the server message says to try again shortly.
      const status = (e as { response?: { status?: number } })?.response?.status;
      toast.error(status === 409 ? errMsg(e, 'Reminders are already being sent. Please try again in a minute.') : errMsg(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Fees"
        subtitle="Track collections, installments and receipts in one place."
        actions={hasFeature('feeReminders') && (
          <Button variant="premium" icon={<BellRing className="h-4 w-4" />} loading={running} onClick={runReminders}>Run reminders now</Button>
        )}
      />

      <SummarySection s={summary.data} loading={summary.loading} error={summary.error} reload={summary.reload} />

      {!hasFeature('feeReminders') && (
        <UpgradeCard className="mt-6" emoji="💰" title="Stop chasing fees manually" text="Upgrade to unlock automatic fee reminders and online fee collection." cta="Upgrade" />
      )}

      <div className="mt-8">
        <Tabs<TabKey>
          className="mb-4"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'students', label: <><Users className="h-4 w-4" /> Students</> },
            { value: 'installments', label: <><CalendarClock className="h-4 w-4" /> Installments</> },
            { value: 'payments', label: <><ReceiptIcon className="h-4 w-4" /> Payments</> },
          ]}
        />
        {tab === 'students' && <StudentsTab bump={bump} onCollect={(s) => setCollectFor({ student: s })} onStructure={setStructureFor} />}
        {tab === 'installments' && <InstallmentsTab bump={bump} summary={summary.data} onCollect={(inv) => { const s = studentOf(inv); if (s) setCollectFor({ student: s, invoiceId: inv._id }); }} />}
        {tab === 'payments' && <PaymentsTab bump={bump} onChanged={() => summary.reload()} />}
      </div>

      {collectFor && <CollectModal target={collectFor} onClose={() => setCollectFor(null)} onDone={refreshAll} />}
      {structureFor && <StructureModal student={structureFor} onClose={() => setStructureFor(null)} onDone={refreshAll} />}
    </div>
  );
}

/* ───────────────────────── Summary ───────────────────────── */

function SummarySection({ s, loading, error, reload }: { s: Summary | null; loading: boolean; error: string | null; reload: () => void }) {
  if (loading && !s) {
    return (
      <>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>
        <div className="mt-6 grid gap-6 lg:grid-cols-3"><Skeleton className="h-80 lg:col-span-2" /><Skeleton className="h-80" /></div>
      </>
    );
  }
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!s) return null;
  const collectedPct = s.total ? Math.round((s.collected / s.total) * 100) : 0;
  const methodTotal = s.methods.reduce((a, m) => a + m.amount, 0);
  const chartData = s.monthly.map((m) => ({ ...m, label: `${m.month} ${String(m.year).slice(2)}` }));

  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total fees" value={inrShort(s.total)} icon={<IndianRupee className="h-5 w-5" />} tone="brand" hint={`${inr(s.total)} billed`} />
        <StatCard label="Collected" value={inrShort(s.collected)} icon={<CheckCircle2 className="h-5 w-5" />} tone="green"
          hint={<div className="flex items-center gap-2"><Progress value={collectedPct} className="h-1.5" /><span>{collectedPct}%</span></div>} />
        <StatCard label="Pending" value={inrShort(s.pending)} icon={<Wallet className="h-5 w-5" />} tone="amber"
          hint={<span className="text-rose-600">{inrShort(s.overdue)} overdue · {s.overdueStudents} student{s.overdueStudents === 1 ? '' : 's'}</span>} />
        <StatCard label="This month" value={inrShort(s.collectedThisMonth)} icon={<CalendarClock className="h-5 w-5" />} tone="sky" hint={`${s.paymentsThisMonth} payments received`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Monthly collection" subtitle="Last 12 months" icon={<IndianRupee className="h-5 w-5" />} />
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ left: -10, right: 4, top: 8 }}>
                <defs>
                  <linearGradient id="feeBar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0.75} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} tickFormatter={(v: number) => (v ? inrShort(v) : '0')} width={60} />
                <Tooltip cursor={{ fill: '#f5f3ff' }} content={<ChartTooltip format={inr} />} />
                <Bar dataKey="amount" name="Collected" fill="url(#feeBar)" radius={[8, 8, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Payment methods" subtitle="Last 12 months" icon={<Wallet className="h-5 w-5" />} />
          {s.methods.length === 0 ? (
            <EmptyState title="No payments yet" />
          ) : (
            <>
              <div className="relative h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={s.methods} dataKey="amount" nameKey="method" innerRadius={52} outerRadius={78} paddingAngle={3} strokeWidth={0}>
                      {s.methods.map((m) => <Cell key={m.method} fill={METHOD_COLORS[m.method] ?? '#94a3b8'} />)}
                    </Pie>
                    <Tooltip content={<ChartTooltip format={inr} />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                  <div>
                    <p className="text-lg font-extrabold text-slate-900">{inrShort(methodTotal)}</p>
                    <p className="text-[11px] text-slate-400">total</p>
                  </div>
                </div>
              </div>
              <ul className="mt-3 space-y-2">
                {[...s.methods].sort((a, b) => b.amount - a.amount).map((m) => (
                  <li key={m.method} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-slate-600">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: METHOD_COLORS[m.method] ?? '#94a3b8' }} />
                      {METHOD_LABEL[m.method] ?? m.method}
                    </span>
                    <span className="font-semibold text-slate-900">
                      {inrShort(m.amount)} <span className="font-normal text-slate-400">· {methodTotal ? Math.round((m.amount / methodTotal) * 100) : 0}%</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>
    </>
  );
}

/* ───────────────────────── Students tab ───────────────────────── */

function StudentsTab({ bump, onCollect, onStructure }: { bump: number; onCollect: (s: StudentRef) => void; onStructure: (s: FeeStudent) => void }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const q = useDebounced(search);
  const list = usePagedApi<FeeStudent>('/fees/students', { search: q || undefined, filter });
  const { loading, error, reload } = list;
  const data = list.data?.items ?? null;
  useReloadOn(bump, list.reload);

  return (
    <Card pad={false}>
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:p-5">
        <SearchInput value={search} onChange={setSearch} placeholder="Search name, code or parent phone…" className="sm:w-80" />
        <div className="flex-1" />
        <Tabs<Filter>
          value={filter}
          onChange={setFilter}
          tabs={[
            { value: 'all', label: 'All' },
            { value: 'pending', label: 'Pending' },
            { value: 'overdue', label: 'Overdue' },
            { value: 'paid', label: 'Paid' },
            { value: 'nostructure', label: 'No structure' },
          ]}
        />
      </div>
      {loading && !data ? (
        <div className="space-y-2 p-5">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : error ? (
        <div className="p-5"><ErrorState message={error} onRetry={reload} /></div>
      ) : !data?.length ? (
        <EmptyState icon={<Users className="h-7 w-7" />} title="No students found" text="Try a different search or filter." />
      ) : (
        <div className="table-wrap scrollbar-thin">
          <table className="table">
            <thead>
              <tr>
                <th>Student</th><th className="text-right">Total</th><th className="text-right">Paid</th><th className="text-right">Pending</th>
                <th className="text-right">Overdue</th><th>Next due</th><th className="min-w-[8rem]">Progress</th><th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.map((s) => {
                const p = s.fees.total ? Math.round((s.fees.paid / s.fees.total) * 100) : 0;
                return (
                  <tr key={s._id}>
                    <td>
                      <Link to={`/app/students/${s._id}`} className="flex items-center gap-3">
                        <Avatar name={s.name} size="sm" />
                        <div>
                          <p className="font-semibold text-slate-900 hover:text-brand-600">{s.name}</p>
                          <p className="text-xs text-slate-400">{s.studentCode}{s.parentPhone ? ` · ${s.parentPhone}` : ''}</p>
                        </div>
                      </Link>
                    </td>
                    <td className="text-right font-medium">{s.fees.total ? inr(s.fees.total) : <span className="text-slate-400">—</span>}</td>
                    <td className="text-right text-emerald-600">{inr(s.fees.paid)}</td>
                    <td className="text-right font-semibold text-amber-600">{s.fees.pending ? inr(s.fees.pending) : '—'}</td>
                    <td className="text-right">{s.fees.overdue ? <Badge tone="red">{inr(s.fees.overdue)}</Badge> : <span className="text-slate-300">—</span>}</td>
                    <td className="text-slate-600">{s.fees.nextDue ? fmtDate(s.fees.nextDue) : '—'}</td>
                    <td>
                      {s.fees.total ? (
                        <div className="flex items-center gap-2"><Progress value={p} /><span className="w-9 text-xs font-semibold text-slate-500">{p}%</span></div>
                      ) : <Badge tone="gray">No structure</Badge>}
                    </td>
                    <td>
                      <div className="flex justify-end gap-2">
                        {s.fees.pending > 0 && (
                          <Button size="sm" variant="success" icon={<IndianRupee className="h-3.5 w-3.5" />} onClick={() => onCollect(s)}>Collect</Button>
                        )}
                        <Button size="sm" variant="secondary" icon={<Settings2 className="h-3.5 w-3.5" />} onClick={() => onStructure(s)}>
                          {s.fees.total ? 'Structure' : 'Set structure'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {list.pager && <Pager {...list.pager} noun="students" />}
    </Card>
  );
}

/* ───────────────────────── Installments tab ───────────────────────── */

function InstallmentsTab({ bump, summary, onCollect }: { bump: number; summary: Summary | null; onCollect: (inv: Invoice) => void }) {
  const [status, setStatus] = useState<InvFilter>('unpaid');
  const list = usePagedApi<Invoice>('/fees/invoices', { status });
  const { loading, error, reload } = list;
  const data = list.data?.items ?? null;
  const total = list.data?.total ?? 0;
  // Amount due across ALL matching installments (not just this page) comes from the fee summary.
  const dueAll = summary ? (status === 'overdue' ? summary.overdue : summary.pending) : null;
  useReloadOn(bump, list.reload);
  const [reminding, setReminding] = useState<string | null>(null);

  const remind = async (inv: Invoice) => {
    setReminding(inv._id);
    try {
      await api.post(`/fees/invoices/${inv._id}/remind`);
      toast.success(`Reminder sent to ${studentOf(inv)?.name ?? 'parent'}'s parent`);
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setReminding(null);
    }
  };

  return (
    <Card pad={false}>
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <Tabs<InvFilter>
          value={status}
          onChange={setStatus}
          tabs={[
            { value: 'unpaid', label: 'Unpaid' },
            { value: 'overdue', label: 'Overdue' },
            { value: 'paid', label: 'Paid' },
            { value: 'all', label: 'All' },
          ]}
        />
        {data && (
          <p className="text-sm text-slate-500">
            {total} installment{total === 1 ? '' : 's'}
            {status !== 'paid' && dueAll !== null && <> · <b className="text-slate-800">{inr(dueAll)}</b> due</>}
          </p>
        )}
      </div>
      {loading && !data ? (
        <div className="space-y-2 p-5">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : error ? (
        <div className="p-5"><ErrorState message={error} onRetry={reload} /></div>
      ) : !data?.length ? (
        <EmptyState icon={<CheckCircle2 className="h-7 w-7" />} title="Nothing here" text={status === 'overdue' ? 'No overdue installments. 🎉' : 'No installments match this filter.'} />
      ) : (
        <div className="table-wrap scrollbar-thin">
          <table className="table">
            <thead>
              <tr><th>Student</th><th>Installment</th><th>Due date</th><th className="text-right">Amount</th><th className="text-right">Balance</th><th>Status</th><th>Reminders</th><th className="text-right">Actions</th></tr>
            </thead>
            <tbody>
              {data.map((inv) => {
                const s = studentOf(inv);
                const od = isOverdue(inv);
                return (
                  <tr key={inv._id} className={clsx(od && 'bg-rose-50/40')}>
                    <td>
                      <div className="flex items-center gap-3">
                        <Avatar name={s?.name ?? '?'} size="sm" />
                        <div>
                          <p className="font-semibold text-slate-900">{s?.name ?? '—'}</p>
                          <p className="text-xs text-slate-400">{s?.studentCode}</p>
                        </div>
                      </div>
                    </td>
                    <td className="font-medium text-slate-700">{inv.title}</td>
                    <td className={clsx(od ? 'font-semibold text-rose-600' : isDueToday(inv) ? 'font-semibold text-amber-600' : 'text-slate-600')}>
                      {fmtDate(inv.dueDate)}
                      {isDueToday(inv) && <p className="text-[11px] font-semibold text-amber-600">Due today</p>}
                    </td>
                    <td className="text-right">{inr(inv.amount)}</td>
                    <td className="text-right font-semibold">{due(inv) ? inr(due(inv)) : '—'}</td>
                    <td><StatusBadge status={od ? 'overdue' : inv.status} /></td>
                    <td className="text-xs text-slate-500">
                      {inv.reminderCount ? <>{inv.reminderCount}× · {fmtDateTime(inv.lastReminderAt)}</> : <span className="text-slate-300">None</span>}
                    </td>
                    <td>
                      {inv.status !== 'paid' && (
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="secondary" icon={<BellRing className="h-3.5 w-3.5" />} loading={reminding === inv._id} onClick={() => remind(inv)}>Remind</Button>
                          <Button size="sm" variant="success" icon={<IndianRupee className="h-3.5 w-3.5" />} onClick={() => onCollect(inv)}>Collect</Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {list.pager && <Pager {...list.pager} noun="installments" />}
    </Card>
  );
}

/* ───────────────────────── Payments tab ───────────────────────── */

function PaymentsTab({ bump, onChanged }: { bump: number; onChanged: () => void }) {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  const [from, setFrom] = useState(ymd(d));
  const [to, setTo] = useState(ymd());
  const [status, setStatus] = useState<PayFilter>('all');
  const [voidFor, setVoidFor] = useState<FeePayment | null>(null);
  const list = usePagedApi<FeePayment, { sum: number }>('/fees/payments', { from, to, status: status === 'void' ? 'void' : undefined });
  const { loading, error, reload } = list;
  const data = list.data?.items ?? null;
  // Totals across ALL payments in the range come from the server (`total` rows, `sum` amount).
  const count = list.data?.total ?? 0;
  const total = list.data?.sum ?? 0;
  useReloadOn(bump, list.reload);

  // CSV covers every payment in the date range (fetched only when downloading).
  const [exporting, setExporting] = useState(false);
  const exportCSV = async () => {
    setExporting(true);
    try {
      const { data: all } = await api.get<FeePayment[]>('/fees/payments/export', { params: { from, to, status: status === 'void' ? 'void' : undefined } });
      downloadCSV(
        `payments-${from}-to-${to}`,
        all.map((p) => ({
          'Receipt #': p.receiptNo,
          Date: fmtDate(p.paidAt),
          Student: studentOf(p)?.name ?? '',
          Code: studentOf(p)?.studentCode ?? '',
          Installment: typeof p.invoiceId === 'object' ? p.invoiceId?.title : '',
          Amount: p.amount,
          Method: METHOD_LABEL[p.method] ?? p.method,
          Reference: p.reference ?? '',
          Status: p.status === 'void' ? 'Cancelled' : 'Valid',
          'Cancel reason': p.voidReason ?? '',
        })),
      );
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card pad={false}>
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-end sm:p-5">
        <Input label="From" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="sm:w-44" />
        <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="sm:w-44" />
        <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value as PayFilter)} className="sm:w-40">
          <option value="all">All receipts</option>
          <option value="void">Cancelled</option>
        </Select>
        <div className="flex-1 text-sm text-slate-500 sm:text-right">
          {data && (status === 'void'
            ? <>{count} cancelled receipt{count === 1 ? '' : 's'} · <b className="text-rose-600">{inr(total)}</b></>
            : <>{count} receipt{count === 1 ? '' : 's'} · <b className="text-emerald-600">{inr(total)}</b> collected</>)}
        </div>
        <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={exportCSV} loading={exporting} disabled={!data?.length}>Export CSV</Button>
      </div>
      {loading && !data ? (
        <div className="space-y-2 p-5">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : error ? (
        <div className="p-5"><ErrorState message={error} onRetry={reload} /></div>
      ) : !data?.length ? (
        <EmptyState icon={<ReceiptIcon className="h-7 w-7" />} title={status === 'void' ? 'No cancelled receipts in this range' : 'No payments in this range'} />
      ) : (
        <div className="table-wrap scrollbar-thin">
          <table className="table">
            <thead><tr><th>Receipt #</th><th>Date</th><th>Student</th><th>Installment</th><th>Method</th><th className="text-right">Amount</th><th /></tr></thead>
            <tbody>
              {data.map((p) => {
                const s = studentOf(p);
                const isVoid = p.status === 'void';
                return (
                  <tr key={p._id} className={clsx(isVoid && 'bg-slate-50/70')} title={isVoid && p.voidReason ? `Cancelled: ${p.voidReason}` : undefined}>
                    <td className="font-mono text-xs font-semibold text-slate-700">
                      <span className={clsx(isVoid && 'text-slate-400 line-through')}>{p.receiptNo}</span>
                      {isVoid && <div className="mt-1"><Badge tone="red">Cancelled</Badge></div>}
                    </td>
                    <td className="text-slate-600">{fmtDateTime(p.paidAt)}</td>
                    <td>
                      <p className="font-semibold text-slate-900">{s?.name ?? '—'}</p>
                      <p className="text-xs text-slate-400">{s?.studentCode}</p>
                    </td>
                    <td className="text-slate-600">{typeof p.invoiceId === 'object' ? p.invoiceId?.title : '—'}</td>
                    <td>
                      <Badge tone={METHOD_TONE[p.method] ?? 'gray'}>{METHOD_LABEL[p.method] ?? p.method}</Badge>
                      {p.reference && <p className="mt-0.5 max-w-[10rem] truncate text-[11px] text-slate-400">{p.reference}</p>}
                    </td>
                    <td className="text-right font-bold">
                      <span className={isVoid ? 'text-slate-400 line-through' : 'text-emerald-600'}>{inr(p.amount)}</span>
                      {isVoid && p.voidReason && <p className="ml-auto max-w-[12rem] truncate text-[11px] font-normal text-rose-500">{p.voidReason}</p>}
                    </td>
                    <td className="text-right">
                      <div className="flex justify-end gap-1">
                        <Link to={`/app/fees/receipt/${p._id}`} className="btn-ghost btn-sm"><ReceiptIcon className="h-3.5 w-3.5" /> Receipt</Link>
                        {!isVoid && (
                          <Button size="sm" variant="ghost" className="text-rose-600 hover:bg-rose-50" icon={<Ban className="h-3.5 w-3.5" />} onClick={() => setVoidFor(p)}>Cancel receipt</Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {list.pager && <Pager {...list.pager} noun="receipts" />}
      <VoidModal payment={voidFor} onClose={() => setVoidFor(null)} onDone={() => { reload(); onChanged(); }} />
    </Card>
  );
}

/* ───────────────────────── Cancel receipt modal ───────────────────────── */

function VoidModal({ payment, onClose, onDone }: { payment: FeePayment | null; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (payment) setReason(''); }, [payment]);

  const submit = async () => {
    if (!payment) return;
    if (reason.trim().length < 3) return toast.error('Enter a reason (at least 3 characters)');
    setSaving(true);
    try {
      await api.post(`/fees/payments/${payment._id}/void`, { reason: reason.trim() });
      toast.success(`Receipt ${payment.receiptNo} cancelled`);
      onDone();
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={!!payment} onClose={onClose} size="sm" title="Cancel receipt"
      subtitle={payment ? `${payment.receiptNo} · ${inr(payment.amount)}${studentOf(payment) ? ` · ${studentOf(payment)!.name}` : ''}` : ''}
      footer={<><Button variant="secondary" onClick={onClose}>Keep receipt</Button><Button variant="danger" loading={saving} disabled={reason.trim().length < 3} onClick={submit}>Cancel receipt</Button></>}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">Use this for a wrong amount or a duplicate entry. The amount is taken back off the installment, and the receipt stays on record marked as cancelled.</p>
        <Textarea label="Reason *" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Duplicate entry" autoFocus />
      </div>
    </Modal>
  );
}

/* ───────────────────────── Collect modal ───────────────────────── */

function CollectModal({ target, onClose, onDone }: { target: { student: StudentRef; invoiceId?: string }; onClose: () => void; onDone: () => void }) {
  const navigate = useNavigate();
  const unpaid = useApi<Paged<Invoice>>('/fees/invoices', { studentId: target.student._id, status: 'unpaid' });
  const { loading, error } = unpaid;
  const invoices = unpaid.data?.items ?? null;
  const [invoiceId, setInvoiceId] = useState(target.invoiceId ?? '');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<(typeof MANUAL_METHODS)[number]>('upi');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [paidAt, setPaidAt] = useState(ymd());
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<Payment | null>(null);

  const inv = invoices?.find((i) => i._id === invoiceId);

  useEffect(() => {
    if (!invoices?.length) return;
    const pick = invoices.find((i) => i._id === invoiceId) ?? invoices[0];
    setInvoiceId(pick._id);
    setAmount(String(due(pick)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices]);

  const submit = async () => {
    if (!inv) return;
    const amt = Number(amount);
    if (!(amt > 0)) return toast.error('Enter a valid amount');
    if (amt > due(inv)) return toast.error(`Amount exceeds the outstanding ${inr(due(inv))}`);
    if (!paidAt) return toast.error('Choose the payment date');
    if (paidAt > ymd()) return toast.error('Payment date cannot be in the future');
    setSaving(true);
    try {
      const { data } = await api.post<Payment>('/fees/payments', { invoiceId, amount: amt, method, reference: reference || undefined, note: note || undefined, paidAt });
      toast.success(`${inr(amt)} collected`);
      setDone(data);
      onDone();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <Modal open onClose={onClose} title="Payment recorded" size="sm"
        footer={<><Button variant="secondary" onClick={onClose}>Close</Button><Button icon={<ReceiptIcon className="h-4 w-4" />} onClick={() => navigate(`/app/fees/receipt/${done._id}`)}>View receipt</Button></>}>
        <div className="py-4 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-emerald-600"><CheckCircle2 className="h-9 w-9" /></div>
          <p className="mt-4 text-2xl font-extrabold text-slate-900">{inr(done.amount)}</p>
          <p className="mt-1 text-sm text-slate-500">received from {target.student.name}</p>
          <p className="mt-3 inline-block rounded-lg bg-slate-100 px-3 py-1 font-mono text-xs font-semibold text-slate-600">Receipt #{done.receiptNo}</p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title="Collect payment" subtitle={`${target.student.name} · ${target.student.studentCode}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="success" loading={saving} disabled={!inv} onClick={submit} icon={<IndianRupee className="h-4 w-4" />}>Record payment</Button></>}>
      {loading ? (
        <div className="space-y-3"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
      ) : error ? (
        <p className="flex items-center gap-2 text-sm text-rose-600"><AlertCircle className="h-4 w-4" /> {error}</p>
      ) : !invoices?.length ? (
        <EmptyState icon={<CheckCircle2 className="h-7 w-7" />} title="All fees paid" text="This student has no unpaid installments." />
      ) : (
        <div className="space-y-4">
          <div>
            <span className="label">Installment</span>
            <div className="space-y-2">
              {invoices.map((i) => (
                <button key={i._id} type="button" onClick={() => { setInvoiceId(i._id); setAmount(String(due(i))); }}
                  className={clsx('flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition',
                    invoiceId === i._id ? 'border-brand-400 bg-brand-50 ring-4 ring-brand-100' : 'border-slate-200 hover:border-slate-300')}>
                  <div>
                    <p className="font-semibold text-slate-900">{i.title}</p>
                    <p className={clsx('text-xs', isOverdue(i) ? 'font-semibold text-rose-600' : isDueToday(i) ? 'font-semibold text-amber-600' : 'text-slate-500')}>
                      Due {fmtDate(i.dueDate)}{isOverdue(i) && ' · overdue'}{isDueToday(i) && ' · due today'}{i.paidAmount > 0 && ` · ${inr(i.paidAmount)} paid`}
                    </p>
                  </div>
                  <span className="font-bold text-slate-900">{inr(due(i))}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Amount (₹)" type="number" min={1} max={inv ? due(inv) : undefined} value={amount} onChange={(e) => setAmount(e.target.value)} />
            <Select label="Method" value={method} onChange={(e) => setMethod(e.target.value as (typeof MANUAL_METHODS)[number])}>
              {MANUAL_METHODS.map((k) => <option key={k} value={k}>{METHOD_LABEL[k]}</option>)}
            </Select>
            <Input label="Payment date" type="date" value={paidAt} max={ymd()} min={yearAgo()} onChange={(e) => setPaidAt(e.target.value)} className="sm:col-span-2" />
          </div>
          <Input label="Reference (optional)" placeholder="UPI ref / cheque no." value={reference} onChange={(e) => setReference(e.target.value)} />
          <Textarea label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} className="[&_textarea]:min-h-[64px]" />
        </div>
      )}
    </Modal>
  );
}

/* ───────────────────────── Structure modal ───────────────────────── */

/** Mirrors the server's createInstallments: day-clamped due dates (Jan 31 + 1 month = Feb 28/29) and floor split, last installment absorbs the remainder. */
function previewInstallments(totalRaw: number, countRaw: number, firstDue: string, intervalRaw: number) {
  const total = Math.round(totalRaw);
  const n = Math.max(1, Math.min(12, Math.round(countRaw) || 1));
  if (!(total > 0)) return [];
  const step = Math.max(1, Math.min(12, Math.round(intervalRaw) || 3));
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(firstDue);
  const start = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date();
  const base = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(start);
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + i * step);
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
    return { i: i + 1, due: d, amount: i === n - 1 ? total - base * (n - 1) : base };
  });
}


function StructureModal({ student, onClose, onDone }: { student: FeeStudent; onClose: () => void; onDone: () => void }) {
  const [total, setTotal] = useState(student.fees.total ? String(student.fees.total) : '');
  const [installments, setInstallments] = useState('3');
  const [firstDue, setFirstDue] = useState(ymd());
  const [intervalM, setIntervalM] = useState('3');
  const [replace, setReplace] = useState(student.fees.total > 0 && student.fees.paid === 0);
  const [saving, setSaving] = useState(false);

  const n = Math.max(1, Number(installments) || 1);
  const schedule = previewInstallments(Number(total), n, firstDue, Number(intervalM) || 3);

  const submit = async () => {
    if (!(Number(total) > 0)) return toast.error('Enter a valid total amount');
    setSaving(true);
    try {
      await api.post('/fees/structure', {
        studentId: student._id, totalAmount: Number(total), installments: n, firstDueDate: firstDue, intervalMonths: Number(intervalM) || 3, replace,
      });
      toast.success('Fee structure saved');
      onDone();
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Fee structure" subtitle={`${student.name} · ${student.studentCode}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={submit} icon={<Layers className="h-4 w-4" />}>Save structure</Button></>}>
      <div className="space-y-4">
        {student.fees.total > 0 && (
          <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
            Current: <b>{inr(student.fees.total)}</b> total · {inr(student.fees.paid)} paid · {inr(student.fees.pending)} pending
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Total amount (₹)" type="number" min={1} value={total} onChange={(e) => setTotal(e.target.value)} placeholder="e.g. 24000" />
          <Select label="Installments" value={installments} onChange={(e) => setInstallments(e.target.value)}>
            {[1, 2, 3, 4, 6, 12].map((x) => <option key={x} value={x}>{x === 1 ? 'One-time' : `${x} installments`}</option>)}
          </Select>
          <Input label="First due date" type="date" value={firstDue} onChange={(e) => setFirstDue(e.target.value)} />
          <Select label="Interval" value={intervalM} onChange={(e) => setIntervalM(e.target.value)} disabled={n === 1}>
            {[1, 2, 3, 4, 6].map((x) => <option key={x} value={x}>Every {x} month{x > 1 ? 's' : ''}</option>)}
          </Select>
        </div>
        {student.fees.total > 0 && (
          <Toggle checked={replace} onChange={setReplace} disabled={student.fees.paid > 0}
            label="Replace existing installments"
            description={student.fees.paid > 0 ? 'Not possible — this student already has payments. New installments will be added.' : 'Off = add these as additional installments.'} />
        )}
        {schedule.length > 0 && (
          <div className="rounded-xl border border-slate-200">
            <p className="border-b border-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Preview</p>
            <ul className="divide-y divide-slate-100 text-sm">
              {schedule.map((p) => (
                <li key={p.i} className="flex justify-between px-4 py-2">
                  <span className="text-slate-600">Installment {p.i} · {fmtDate(p.due)}</span>
                  <span className="font-semibold text-slate-900">{inr(p.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
