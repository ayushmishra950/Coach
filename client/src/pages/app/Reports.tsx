import {
  ArrowDown, ArrowUp, ArrowUpDown, BarChart3, CalendarCheck, Download, GraduationCap, IndianRupee, Layers, Printer, TrendingUp, Users, Wallet, AlertCircle, CalendarDays,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Pager } from '../../components/Pager';
import { FeatureGate, UpgradeCard } from '../../components/Upgrade';
import {
  Badge, Card, CardHeader, ChartTooltip, EmptyState, ErrorState, PageHeader, PageLoader, Progress, SearchInput, Skeleton, StatCard, Tabs, Button, clsx,
} from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useApi, useClientPage, useDebounced, usePagedApi } from '../../hooks/useApi';
import { api, errMsg } from '../../lib/api';
import { downloadCSV, fmtDate, fmtDateShort, inr, inrShort, parseYmd, pctTone } from '../../lib/format';

const PALETTE = ['#6366f1', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#0ea5e9'];

interface StudentRow {
  _id: string; name: string; studentCode: string; batches: string;
  attendancePct: number | null; classes: number; avgScore: number | null; tests: number;
  feePaid: number; feePending: number; feeOverdue: number;
}
interface BasicReport {
  summary: { students: number; attendanceAvg: number | null; scoreAvg: number | null; lowAttendance: number; overdueStudents: number };
  topScorers: StudentRow[];
  defaulters: StudentRow[];
  attendanceDaily: { date: string; present: number; total: number; pct: number | null }[];
  fees: { total: number; collected: number; pending: number; overdue: number; thisMonth: number };
}
interface AdvancedReport {
  revenue: { month: string; amount: number; payments: number }[];
  attendanceWeekly: { week: string; pct: number | null }[];
  attendanceMonthly: { month: string; pct: number | null }[];
  batches: { _id: string; name: string; subject?: string; teacher: string; students: number; attendancePct: number | null; avgScore: number | null; tests: number }[];
  subjects: { subject: string; avg: number }[];
}

type TabKey = 'overview' | 'students' | 'attendance' | 'fees' | 'advanced';
type SortKey = 'name' | 'attendancePct' | 'classes' | 'avgScore' | 'tests' | 'feePaid' | 'feePending' | 'feeOverdue';

const axisProps = { tick: { fontSize: 11, fill: '#94a3b8' }, axisLine: false, tickLine: false } as const;
const pctFmt = (v: number) => `${v}%`;

export default function Reports() {
  const { hasFeature } = useAuth();
  const premium = hasFeature('advancedReports');
  const [tab, setTab] = useState<TabKey>('overview');
  const { data, loading, error, reload } = useApi<BasicReport>('/reports/basic');

  if (loading && !data) return <PageLoader />;
  if (error || !data) return <ErrorState message={error ?? 'Could not load reports'} onRetry={reload} />;

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle={`Institute performance at a glance · generated ${fmtDate(new Date())}`}
        actions={
          // The Students tab has its own print button that prints every matching row.
          tab === 'students' ? undefined : (
            <div className="no-print flex gap-2">
              <Button variant="secondary" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>Print / PDF</Button>
            </div>
          )
        }
      />
      <Tabs
        className="no-print mb-6"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'overview', label: 'Overview' },
          { value: 'students', label: 'Students', count: data.summary.students },
          { value: 'attendance', label: 'Attendance' },
          { value: 'fees', label: 'Fees' },
          { value: 'advanced', label: <span className="flex items-center gap-1">Advanced {!premium && <span className="text-[10px]">🔒</span>}</span> },
        ]}
      />
      {tab === 'overview' && <Overview data={data} premium={premium} onTab={setTab} />}
      {tab === 'students' && <StudentsReport />}
      {tab === 'attendance' && <AttendanceReport daily={data.attendanceDaily} />}
      {tab === 'fees' && <FeeReport fees={data.fees} defaulters={data.defaulters} overdueStudents={data.summary.overdueStudents} />}
      {tab === 'advanced' && (
        <FeatureGate feature="advancedReports" title="Unlock Advanced Reports" text="12-month revenue trends, weekly & monthly attendance, batch comparison and subject-wise analysis are available on Premium.">
          <AdvancedReports />
        </FeatureGate>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Overview({ data, premium, onTab }: { data: BasicReport; premium: boolean; onTab: (t: TabKey) => void }) {
  const attAvg = data.summary.attendanceAvg;
  const scoreAvg = data.summary.scoreAvg;
  const lowAtt = data.summary.lowAttendance;
  const collectedPct = data.fees.total ? Math.round((data.fees.collected / data.fees.total) * 100) : 0;
  const chart = data.attendanceDaily.filter((d) => d.pct != null).map((d) => ({ ...d, label: fmtDateShort(parseYmd(d.date)) }));
  const top = data.topScorers;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active students" value={data.summary.students} icon={<Users className="h-5 w-5" />} tone="brand" hint={`${lowAtt} below 75% attendance`} />
        <StatCard label="Avg attendance" value={attAvg != null ? `${attAvg}%` : '—'} icon={<CalendarCheck className="h-5 w-5" />} tone="green" hint="Across all active students" />
        <StatCard label="Avg test score" value={scoreAvg != null ? `${scoreAvg}%` : '—'} icon={<GraduationCap className="h-5 w-5" />} tone="violet" hint="Graded & published tests" />
        <StatCard label="Fees collected" value={inrShort(data.fees.collected)} icon={<IndianRupee className="h-5 w-5" />} tone="amber" hint={`${collectedPct}% of ${inrShort(data.fees.total)} billed`} />
      </div>

      {!premium && (
        <UpgradeCard className="no-print" emoji="📊" title="Go deeper with advanced reports" text="See 12-month revenue trends, batch-vs-batch comparison and subject-wise performance with CoachFlow Premium." cta="Unlock Premium" />
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Attendance — last 30 days" subtitle="Daily attendance %" icon={<TrendingUp className="h-4 w-4" />}
            action={<button className="no-print text-sm font-semibold text-brand-600 hover:text-brand-700" onClick={() => onTab('attendance')}>Details →</button>} />
          {chart.length ? (
            <div className="h-64">
              <ResponsiveContainer>
                <AreaChart data={chart} margin={{ left: -20, right: 8, top: 8 }}>
                  <defs>
                    <linearGradient id="ov-att" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="#6366f1" stopOpacity={0.35} />
                      <stop offset="1" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={20} />
                  <YAxis {...axisProps} domain={[0, 100]} />
                  <Tooltip content={<ChartTooltip format={pctFmt} />} />
                  <Area type="monotone" dataKey="pct" name="Attendance" stroke="#6366f1" strokeWidth={2.5} fill="url(#ov-att)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState title="No attendance yet" text="Mark attendance to see trends here." />}
        </Card>

        <Card>
          <CardHeader title="Top performers" subtitle="By average test score" icon={<GraduationCap className="h-4 w-4" />} />
          {top.length ? (
            <ul className="space-y-3">
              {top.map((s, i) => (
                <li key={s._id} className="flex items-center gap-3">
                  <span className={clsx('grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold', i === 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600')}>{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <Link to={`/app/students/${s._id}`} className="block truncate text-sm font-semibold text-slate-800 hover:text-brand-600">{s.name}</Link>
                    <Progress value={s.avgScore ?? 0} tone="brand" className="mt-1 h-1.5" />
                  </div>
                  <span className={clsx('text-sm font-bold', pctTone(s.avgScore))}>{s.avgScore}%</span>
                </li>
              ))}
            </ul>
          ) : <EmptyState title="No results yet" />}
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const COLS: { key: SortKey; label: string; align?: 'right' }[] = [
  { key: 'name', label: 'Student' },
  { key: 'attendancePct', label: 'Attendance', align: 'right' },
  { key: 'classes', label: 'Classes', align: 'right' },
  { key: 'avgScore', label: 'Avg score', align: 'right' },
  { key: 'tests', label: 'Tests', align: 'right' },
  { key: 'feePaid', label: 'Fee paid', align: 'right' },
  { key: 'feePending', label: 'Pending', align: 'right' },
  { key: 'feeOverdue', label: 'Overdue', align: 'right' },
];

function StudentsReport() {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 });
  const [exporting, setExporting] = useState(false);
  const [printing, setPrinting] = useState(false);
  // Every matching row, loaded only for printing (the screen table stays paged).
  const [printRows, setPrintRows] = useState<StudentRow[] | null>(null);
  const q = useDebounced(search.trim());
  // Search + sort run on the server; the table shows one page of 20 at a time.
  const query = { search: q || undefined, sort: sort.key, dir: sort.dir === 1 ? 'asc' : 'desc' };
  const res = usePagedApi<StudentRow>('/reports/students', query);
  const list = res.data?.items ?? [];

  const toggle = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === 'name' ? 1 : -1 }));

  // CSV = every matching row (same search/sort), fetched from the export endpoint.
  const exportCsv = async () => {
    setExporting(true);
    try {
      const { data: all } = await api.get<StudentRow[]>('/reports/students/export', { params: query });
      if (!all.length) return toast.error('Nothing to export');
      downloadCSV(`student-report-${new Date().toISOString().slice(0, 10)}`, all.map((r) => ({
        'Student Code': r.studentCode, Name: r.name, Batches: r.batches,
        'Attendance %': r.attendancePct ?? '', Classes: r.classes, 'Avg Score %': r.avgScore ?? '', Tests: r.tests,
        'Fee Paid': r.feePaid, 'Fee Pending': r.feePending, 'Fee Overdue': r.feeOverdue,
      })));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setExporting(false);
    }
  };

  const printAll = async () => {
    setPrinting(true);
    try {
      const { data: all } = await api.get<StudentRow[]>('/reports/students/export', { params: query });
      if (!all.length) {
        setPrinting(false);
        return toast.error('Nothing to print');
      }
      setPrintRows(all);
    } catch (e) {
      toast.error(errMsg(e));
      setPrinting(false);
    }
  };

  // Once the full print table has rendered, open the print dialog; drop it again afterwards.
  useEffect(() => {
    if (!printRows) return;
    const done = () => {
      setPrintRows(null);
      setPrinting(false);
    };
    window.addEventListener('afterprint', done);
    let fallback: ReturnType<typeof setTimeout> | undefined;
    const t = setTimeout(() => {
      window.print();
      // Desktop print() blocks until the dialog closes; some (mobile) browsers return at once and never
      // fire afterprint. Either way the button must not stay spinning — and the full table is dropped a
      // little later if afterprint never came, so the print snapshot still has it.
      setPrinting(false);
      fallback = setTimeout(done, 1500);
    }, 50);
    return () => {
      clearTimeout(t);
      if (fallback) clearTimeout(fallback);
      window.removeEventListener('afterprint', done);
    };
  }, [printRows]);

  return (
    <Card pad={false}>
      <div className="no-print flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <SearchInput value={search} onChange={setSearch} placeholder="Search name, code or batch…" className="sm:w-80" />
        <div className="flex gap-2">
          <Button variant="secondary" icon={<Download className="h-4 w-4" />} loading={exporting} onClick={exportCsv} disabled={!res.data?.total}>Export CSV</Button>
          <Button variant="secondary" icon={<Printer className="h-4 w-4" />} loading={printing} onClick={printAll} disabled={!res.data?.total}>Print / PDF</Button>
        </div>
      </div>
      <div className="hidden px-5 pt-4 print:block">
        <h2 className="text-lg font-bold">Student report</h2>
        {printRows && <p className="text-xs text-slate-500">{printRows.length} student{printRows.length === 1 ? '' : 's'}{q ? ` matching “${q}”` : ''} · {fmtDate(new Date())}</p>}
      </div>
      {printRows && (
        <div className="hidden print:block">
          <table className="table">
            <thead>
              <tr>{COLS.map((c) => <th key={c.key} className={clsx(c.align === 'right' && '!text-right')}>{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {printRows.map((r) => (
                <tr key={r._id} className="break-inside-avoid">
                  <td>
                    <p className="font-semibold text-slate-800">{r.name}</p>
                    <p className="text-xs text-slate-500">{r.studentCode} · {r.batches || 'No batch'}</p>
                  </td>
                  <td className="text-right">{r.attendancePct != null ? `${r.attendancePct}%` : '—'}</td>
                  <td className="text-right">{r.classes}</td>
                  <td className="text-right">{r.avgScore != null ? `${r.avgScore}%` : '—'}</td>
                  <td className="text-right">{r.tests}</td>
                  <td className="text-right">{inr(r.feePaid)}</td>
                  <td className="text-right">{inr(r.feePending)}</td>
                  <td className="text-right">{r.feeOverdue ? inr(r.feeOverdue) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className={clsx(printRows && 'print:hidden')}>
      {res.loading && !res.data ? (
        <div className="space-y-2 p-5">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : res.error ? (
        <div className="p-5"><ErrorState message={res.error} onRetry={res.reload} /></div>
      ) : list.length === 0 ? <EmptyState title="No students match" text="Try a different search." /> : (
        <div className="table-wrap scrollbar-thin">
          <table className="table">
            <thead>
              <tr>
                {COLS.map((c) => (
                  <th key={c.key} className={clsx(c.align === 'right' && '!text-right')}>
                    <button onClick={() => toggle(c.key)} className={clsx('inline-flex items-center gap-1 uppercase hover:text-slate-800', sort.key === c.key && 'text-brand-600')}>
                      {c.label}
                      {sort.key === c.key ? (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="no-print h-3 w-3 opacity-40" />}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r._id}>
                  <td>
                    <Link to={`/app/students/${r._id}`} className="font-semibold text-slate-800 hover:text-brand-600">{r.name}</Link>
                    <p className="max-w-[240px] truncate text-xs text-slate-400">{r.studentCode} · {r.batches || 'No batch'}</p>
                  </td>
                  <td className="text-right">
                    <div className="ml-auto flex w-28 items-center justify-end gap-2">
                      <Progress value={r.attendancePct ?? 0} className="no-print h-1.5 w-14" />
                      <span className={clsx('font-bold', pctTone(r.attendancePct))}>{r.attendancePct != null ? `${r.attendancePct}%` : '—'}</span>
                    </div>
                  </td>
                  <td className="text-right text-slate-600">{r.classes}</td>
                  <td className={clsx('text-right font-bold', pctTone(r.avgScore))}>{r.avgScore != null ? `${r.avgScore}%` : '—'}</td>
                  <td className="text-right text-slate-600">{r.tests}</td>
                  <td className="text-right font-medium text-emerald-600">{inr(r.feePaid)}</td>
                  <td className={clsx('text-right font-medium', r.feePending ? 'text-amber-600' : 'text-slate-400')}>{inr(r.feePending)}</td>
                  <td className="text-right">{r.feeOverdue ? <Badge tone="red">{inr(r.feeOverdue)}</Badge> : <span className="text-slate-400">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {res.pager && <Pager {...res.pager} noun="students" className="no-print" />}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function AttendanceReport({ daily }: { daily: BasicReport['attendanceDaily'] }) {
  const [mode, setMode] = useState<'area' | 'bar'>('area');
  const data = daily.map((d) => ({ ...d, absent: d.total - d.present, label: fmtDateShort(parseYmd(d.date)) }));
  const withData = daily.filter((d) => d.pct != null);
  const overall = withData.reduce((a, d) => a + d.total, 0) ? Math.round((withData.reduce((a, d) => a + d.present, 0) / withData.reduce((a, d) => a + d.total, 0)) * 100) : null;
  const best = [...withData].sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))[0];
  const worst = [...withData].sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0))[0];
  const days = useClientPage([...daily].reverse(), daily.length);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="30-day attendance" value={overall != null ? `${overall}%` : '—'} icon={<CalendarCheck className="h-5 w-5" />} tone="green" hint={`${withData.length} class days recorded`} />
        <StatCard label="Best day" value={best ? `${best.pct}%` : '—'} icon={<ArrowUp className="h-5 w-5" />} tone="sky" hint={best ? fmtDate(parseYmd(best.date)) : undefined} />
        <StatCard label="Lowest day" value={worst ? `${worst.pct}%` : '—'} icon={<ArrowDown className="h-5 w-5" />} tone="rose" hint={worst ? fmtDate(parseYmd(worst.date)) : undefined} />
      </div>
      <Card>
        <CardHeader title="Daily attendance" subtitle="Last 30 days" icon={<BarChart3 className="h-4 w-4" />}
          action={<Tabs className="no-print" value={mode} onChange={setMode} tabs={[{ value: 'area', label: 'Area' }, { value: 'bar', label: 'Bars' }]} />} />
        <div className="h-72">
          <ResponsiveContainer>
            {mode === 'area' ? (
              <AreaChart data={data} margin={{ left: -20, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="att-a" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="1" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" {...axisProps} minTickGap={20} />
                <YAxis {...axisProps} domain={[0, 100]} />
                <Tooltip content={<ChartTooltip format={pctFmt} />} />
                <Area type="monotone" dataKey="pct" name="Attendance" connectNulls stroke="#10b981" strokeWidth={2.5} fill="url(#att-a)" />
              </AreaChart>
            ) : (
              <BarChart data={data} margin={{ left: -20, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" {...axisProps} minTickGap={20} />
                <YAxis {...axisProps} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f8fafc' }} />
                <Bar dataKey="present" name="Present" stackId="a" fill="#6366f1" radius={[0, 0, 0, 0]} />
                <Bar dataKey="absent" name="Absent" stackId="a" fill="#fda4af" radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </Card>
      <Card pad={false}>
        <div className="p-5 pb-0"><CardHeader title="Day-wise breakdown" icon={<CalendarDays className="h-4 w-4" />} /></div>
        <div className="table-wrap scrollbar-thin">
          <table className="table">
            <thead><tr><th>Date</th><th className="!text-right">Present</th><th className="!text-right">Absent</th><th className="!text-right">Marked</th><th>Attendance</th></tr></thead>
            <tbody>
              {days.items.map((d) => (
                <tr key={d.date}>
                  <td className="font-medium text-slate-700">{fmtDate(parseYmd(d.date), { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                  <td className="text-right text-emerald-600">{d.total ? d.present : '—'}</td>
                  <td className="text-right text-rose-600">{d.total ? d.total - d.present : '—'}</td>
                  <td className="text-right text-slate-600">{d.total || '—'}</td>
                  <td>
                    {d.pct != null ? (
                      <div className="flex items-center gap-2"><Progress value={d.pct} className="h-1.5 w-24" /><span className={clsx('text-sm font-bold', pctTone(d.pct))}>{d.pct}%</span></div>
                    ) : <span className="text-xs text-slate-400">No class</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager {...days.pager} noun="days" />
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function FeeReport({ fees, defaulters, overdueStudents }: { fees: BasicReport['fees']; defaulters: StudentRow[]; overdueStudents: number }) {
  const notOverdue = Math.max(0, fees.pending - fees.overdue);
  const pie = [
    { name: 'Collected', value: fees.collected, color: '#10b981' },
    { name: 'Pending (not due)', value: notOverdue, color: '#f59e0b' },
    { name: 'Overdue', value: fees.overdue, color: '#ec4899' },
  ].filter((x) => x.value > 0);
  const collectedPct = fees.total ? Math.round((fees.collected / fees.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Collected" value={inrShort(fees.collected)} icon={<Wallet className="h-5 w-5" />} tone="green" hint={`${collectedPct}% of ${inr(fees.total)}`} />
        <StatCard label="Pending" value={inrShort(fees.pending)} icon={<IndianRupee className="h-5 w-5" />} tone="amber" hint={inr(fees.pending)} />
        <StatCard label="Overdue" value={inrShort(fees.overdue)} icon={<AlertCircle className="h-5 w-5" />} tone="rose" hint={`${overdueStudents} students`} />
        <StatCard label="This month" value={inrShort(fees.thisMonth)} icon={<CalendarDays className="h-5 w-5" />} tone="sky" hint={inr(fees.thisMonth)} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Fee distribution" subtitle={`Total billed ${inr(fees.total)}`} icon={<IndianRupee className="h-4 w-4" />} />
          {pie.length ? (
            <div className="flex flex-col items-center gap-4 sm:flex-row">
              <div className="relative h-56 w-full sm:w-1/2">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={pie} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={3} stroke="none">
                      {pie.map((p) => <Cell key={p.name} fill={p.color} />)}
                    </Pie>
                    <Tooltip content={<ChartTooltip format={inr} />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                  <div><p className="text-2xl font-extrabold text-slate-900">{collectedPct}%</p><p className="text-xs text-slate-500">collected</p></div>
                </div>
              </div>
              <ul className="w-full space-y-3 sm:w-1/2">
                {pie.map((p) => (
                  <li key={p.name} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2 text-slate-600"><span className="h-3 w-3 rounded-full" style={{ background: p.color }} />{p.name}</span>
                    <b className="text-slate-900">{inr(p.value)}</b>
                  </li>
                ))}
              </ul>
            </div>
          ) : <EmptyState title="No invoices yet" />}
        </Card>
        <Card>
          <CardHeader title="Overdue students" subtitle="Highest outstanding first" icon={<AlertCircle className="h-4 w-4" />} />
          {defaulters.length ? (
            <ul className="divide-y divide-slate-100">
              {defaulters.map((d) => (
                <li key={d._id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <Link to={`/app/students/${d._id}`} className="block truncate text-sm font-semibold text-slate-800 hover:text-brand-600">{d.name}</Link>
                    <p className="truncate text-xs text-slate-400">{d.studentCode} · {d.batches}</p>
                  </div>
                  <Badge tone="red">{inr(d.feeOverdue)}</Badge>
                </li>
              ))}
            </ul>
          ) : <EmptyState icon={<span className="text-2xl">🎉</span>} title="No overdue fees" text="Every installment due so far has been collected." />}
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function AdvancedReports() {
  const { data, loading, error, reload } = useApi<AdvancedReport>('/reports/advanced');
  const batches = useClientPage(data?.batches);
  if (loading && !data) return <PageLoader />;
  if (error || !data) return <ErrorState message={error ?? 'Could not load advanced reports'} onRetry={reload} />;

  const yearTotal = data.revenue.reduce((a, r) => a + r.amount, 0);
  const weekly = data.attendanceWeekly;
  const monthly = data.attendanceMonthly;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Revenue — last 12 months" subtitle={`Total ${inr(yearTotal)} · ${data.revenue.reduce((a, r) => a + r.payments, 0)} payments`} icon={<IndianRupee className="h-4 w-4" />} />
        <div className="h-72">
          <ResponsiveContainer>
            <BarChart data={data.revenue} margin={{ left: 0, right: 8, top: 8 }}>
              <defs>
                <linearGradient id="rev-g" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#8b5cf6" />
                  <stop offset="1" stopColor="#6366f1" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="month" {...axisProps} />
              <YAxis {...axisProps} tickFormatter={(v: number) => inrShort(v)} width={60} />
              <Tooltip content={<ChartTooltip format={inr} />} cursor={{ fill: '#f8fafc' }} />
              <Bar dataKey="amount" name="Revenue" fill="url(#rev-g)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Weekly attendance" subtitle="Last 12 weeks" icon={<CalendarCheck className="h-4 w-4" />} />
          <div className="h-60">
            <ResponsiveContainer>
              <LineChart data={weekly} margin={{ left: -20, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="week" {...axisProps} minTickGap={16} />
                <YAxis {...axisProps} domain={[0, 100]} />
                <Tooltip content={<ChartTooltip format={pctFmt} />} />
                <Line type="monotone" dataKey="pct" name="Attendance" connectNulls stroke="#0ea5e9" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardHeader title="Monthly attendance" subtitle="Last 6 months" icon={<CalendarDays className="h-4 w-4" />} />
          <div className="h-60">
            <ResponsiveContainer>
              <BarChart data={monthly} margin={{ left: -20, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month" {...axisProps} />
                <YAxis {...axisProps} domain={[0, 100]} />
                <Tooltip content={<ChartTooltip format={pctFmt} />} cursor={{ fill: '#f8fafc' }} />
                <Bar dataKey="pct" name="Attendance" fill="#10b981" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card pad={false} className="lg:col-span-2">
          <div className="p-5 pb-0"><CardHeader title="Batch comparison" icon={<Layers className="h-4 w-4" />} /></div>
          <div className="table-wrap scrollbar-thin">
            <table className="table">
              <thead><tr><th>Batch</th><th className="!text-right">Students</th><th>Attendance</th><th className="!text-right">Avg score</th><th className="!text-right">Tests</th><th>Teacher</th></tr></thead>
              <tbody>
                {batches.items.map((b, j) => { const i = batches.offset + j; return (
                  <tr key={b._id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
                        <Link to={`/app/batches/${b._id}`} className="font-semibold text-slate-800 hover:text-brand-600">{b.name}</Link>
                      </div>
                      {b.subject && <p className="pl-4 text-xs text-slate-400">{b.subject}</p>}
                    </td>
                    <td className="text-right">{b.students}</td>
                    <td>
                      {b.attendancePct != null ? (
                        <div className="flex items-center gap-2"><Progress value={b.attendancePct} className="h-1.5 w-16" /><span className={clsx('font-bold', pctTone(b.attendancePct))}>{b.attendancePct}%</span></div>
                      ) : '—'}
                    </td>
                    <td className={clsx('text-right font-bold', pctTone(b.avgScore))}>{b.avgScore != null ? `${b.avgScore}%` : '—'}</td>
                    <td className="text-right">{b.tests}</td>
                    <td className="text-slate-600">{b.teacher}</td>
                  </tr>
                ); })}
              </tbody>
            </table>
          </div>
          <Pager {...batches.pager} noun="batches" />
        </Card>
        <Card>
          <CardHeader title="Subject-wise average" icon={<GraduationCap className="h-4 w-4" />} />
          {data.subjects.length ? (
            <div style={{ height: Math.max(200, data.subjects.length * 44) }}>
              <ResponsiveContainer>
                <BarChart data={data.subjects} layout="vertical" margin={{ left: 10, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} {...axisProps} />
                  <YAxis type="category" dataKey="subject" {...axisProps} width={80} />
                  <Tooltip content={<ChartTooltip format={pctFmt} />} cursor={{ fill: '#f8fafc' }} />
                  <Bar dataKey="avg" name="Average" radius={[0, 6, 6, 0]} barSize={18}>
                    {data.subjects.map((s, i) => <Cell key={s.subject} fill={PALETTE[i % PALETTE.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState title="No graded tests yet" />}
        </Card>
      </div>
    </div>
  );
}
