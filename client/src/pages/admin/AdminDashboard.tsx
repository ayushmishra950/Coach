import {
  Activity, AlertTriangle, ArrowRight, BadgeIndianRupee, Building2, Clock, Crown, CreditCard, GraduationCap, LifeBuoy,
  CalendarClock, Hourglass, Percent, RefreshCw, TrendingUp, UserMinus, Wallet, XCircle,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Button, Card, CardHeader, ChartTooltip, ErrorState, PageHeader, Skeleton, StatCard, clsx } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import { inr, inrShort } from '../../lib/format';

const PALETTE = ['#6366f1', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#0ea5e9'];

interface AdminStats {
  totals: {
    institutes: number; active: number; trial: number; trialExpired: number; endingSoon: number; cancelled: number; pastDue: number; suspended: number; premium: number;
    mrr: number; arr: number; arpa: number; churnRate: number; failedPayments30d: number; openTickets: number; totalStudents: number;
  };
  planDistribution: { plan: string; key: string; count: number; mrr: number }[];
  signups: { month: string; count: number }[];
  revenue: { month: string; amount: number }[];
  featureUsage: { feature: string; count: number }[];
}

function MiniStat({ label, value, icon, tone, hint }: { label: string; value: ReactNode; icon: ReactNode; tone: string; hint?: string }) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <div className={clsx('grid h-10 w-10 shrink-0 place-items-center rounded-xl', tone)}>{icon}</div>
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="text-lg font-extrabold tracking-tight text-slate-900">{value}</p>
        {hint && <p className="truncate text-[11px] text-slate-400">{hint}</p>}
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const { data, loading, error, reload } = useApi<AdminStats>('/admin/stats');

  if (error) return <ErrorState message={error} onRetry={reload} />;

  if (loading && !data) {
    return (
      <div>
        <PageHeader title="Platform overview" subtitle="Loading metrics…" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-80 lg:col-span-2" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }
  if (!data) return null;

  const t = data.totals;
  const totalRevenue = data.revenue.reduce((s, r) => s + r.amount, 0);
  const lastRev = data.revenue.at(-1)?.amount ?? 0;
  const prevRev = data.revenue.at(-2)?.amount ?? 0;
  const revGrowth = prevRev ? Math.round(((lastRev - prevRev) / prevRev) * 1000) / 10 : 0;
  const totalSignups = data.signups.reduce((s, r) => s + r.count, 0);
  const planTotal = data.planDistribution.reduce((s, p) => s + p.count, 0);
  const maxUsage = Math.max(1, ...data.featureUsage.map((f) => f.count));
  const conversion = t.active + t.trial ? Math.round((t.active / (t.active + t.trial + t.cancelled)) * 100) : 0;

  return (
    <div>
      <PageHeader
        title="Platform overview"
        subtitle="Live SaaS metrics across every CoachFlow institute."
        actions={<Button variant="secondary" icon={<RefreshCw className="h-4 w-4" />} loading={loading} onClick={reload}>Refresh</Button>}
      />

      {/* Hero banner */}
      <div className="relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-violet-600 to-fuchsia-600 p-6 text-white shadow-glow sm:p-8">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-20 left-1/3 h-56 w-56 rounded-full bg-fuchsia-400/20 blur-3xl" />
        <div className="relative grid gap-6 md:grid-cols-[1.4fr_1fr] md:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-white/70">Monthly recurring revenue</p>
            <p className="mt-2 text-4xl font-extrabold tracking-tight sm:text-5xl">{inr(t.mrr)}</p>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-white/80">
              <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold', revGrowth >= 0 ? 'bg-emerald-400/25 text-emerald-50' : 'bg-rose-400/25 text-rose-50')}>
                <TrendingUp className="h-3.5 w-3.5" /> {revGrowth >= 0 ? '+' : ''}{revGrowth}% collections MoM
              </span>
              <span>ARR run-rate {inrShort(t.arr)}</span>
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { l: '6-mo revenue', v: inrShort(totalRevenue) },
              { l: 'New signups', v: totalSignups },
              { l: 'Paid conversion', v: `${conversion}%` },
            ].map((x) => (
              <div key={x.l} className="rounded-2xl bg-white/10 p-3 backdrop-blur">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-white/70">{x.l}</p>
                <p className="mt-1 text-xl font-extrabold">{x.v}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Hero KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Total institutes" value={t.institutes} icon={<Building2 className="h-5 w-5" />} tone="brand" hint={`${t.pastDue} past due · ${t.suspended} suspended`} />
        <StatCard label="Active subs" value={t.active} icon={<Activity className="h-5 w-5" />} tone="green" hint="Paying customers" />
        <StatCard label="MRR" value={inrShort(t.mrr)} icon={<BadgeIndianRupee className="h-5 w-5" />} tone="violet" hint={`${inr(t.mrr)} · active + past due`} />
        <StatCard label="Live trials" value={t.trial} icon={<Clock className="h-5 w-5" />} tone="sky" hint="Trial still running" />
        <StatCard label="Cancelled" value={t.cancelled} icon={<UserMinus className="h-5 w-5" />} tone="rose" hint="Lifetime churned" />
        <StatCard label="Premium" value={t.premium} icon={<Crown className="h-5 w-5" />} tone="amber" hint="Top-tier customers" />
      </div>

      {/* Secondary KPIs */}
      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <MiniStat label="ARR" value={inrShort(t.arr)} icon={<TrendingUp className="h-5 w-5" />} tone="bg-brand-50 text-brand-600" hint="MRR × 12" />
        <MiniStat label="ARPA" value={inr(t.arpa)} icon={<Wallet className="h-5 w-5" />} tone="bg-violet-50 text-violet-600" hint="Avg revenue / account" />
        <MiniStat label="Churn (30 days)" value={`${t.churnRate}%`} icon={<Percent className="h-5 w-5" />} tone="bg-rose-50 text-rose-600" hint="Paid accounts cancelled" />
        <MiniStat label="Failed payments" value={t.failedPayments30d} icon={<XCircle className="h-5 w-5" />} tone="bg-amber-50 text-amber-600" hint="Last 30 days" />
        <MiniStat label="Open tickets" value={t.openTickets} icon={<LifeBuoy className="h-5 w-5" />} tone="bg-sky-50 text-sky-600" hint="Awaiting resolution" />
        <MiniStat label="Students" value={t.totalStudents.toLocaleString('en-IN')} icon={<GraduationCap className="h-5 w-5" />} tone="bg-emerald-50 text-emerald-600" hint="Active on platform" />
      </div>

      {/* Lifecycle */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MiniStat label="Live trials" value={t.trial} icon={<Clock className="h-5 w-5" />} tone="bg-sky-50 text-sky-600" hint="Trial period still running" />
        <MiniStat label="Expired trials" value={t.trialExpired} icon={<Hourglass className="h-5 w-5" />} tone="bg-slate-100 text-slate-600" hint="Trial ended, not converted" />
        <MiniStat label="Ending soon" value={t.endingSoon} icon={<CalendarClock className="h-5 w-5" />} tone="bg-amber-50 text-amber-600" hint="Cancellation scheduled" />
      </div>

      {/* Charts row 1 */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Subscription revenue" subtitle="Successful collections, last 6 months" icon={<BadgeIndianRupee className="h-5 w-5" />}
            action={<span className="text-right"><span className="block text-xs text-slate-500">Total</span><span className="font-extrabold text-slate-900">{inr(totalRevenue)}</span></span>} />
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.revenue} margin={{ left: -10, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(v: number) => inrShort(v)} />
                <Tooltip content={<ChartTooltip format={inr} />} />
                <Area type="monotone" dataKey="amount" name="Revenue" stroke="#6366f1" strokeWidth={3} fill="url(#revGrad)"
                  dot={{ r: 4, fill: '#fff', stroke: '#6366f1', strokeWidth: 2 }} activeDot={{ r: 6 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Plan distribution" subtitle="Active subscriptions by plan" icon={<Crown className="h-5 w-5" />} />
          <div className="relative h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.planDistribution} dataKey="count" nameKey="plan" innerRadius={56} outerRadius={82} paddingAngle={3} stroke="none">
                  {data.planDistribution.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="text-center">
                <p className="text-2xl font-extrabold text-slate-900">{planTotal}</p>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Active</p>
              </div>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {data.planDistribution.map((p, i) => (
              <div key={p.key} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
                <span className="flex items-center gap-2 font-semibold text-slate-700">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
                  {p.plan}
                  <span className="text-xs font-medium text-slate-400">{p.count} · {planTotal ? Math.round((p.count / planTotal) * 100) : 0}%</span>
                </span>
                <span className="font-bold text-slate-900">{inr(p.mrr)}<span className="text-xs font-medium text-slate-400">/mo</span></span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Charts row 2 */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="New signups" subtitle="Institutes created per month" icon={<Building2 className="h-5 w-5" />}
            action={<span className="badge bg-brand-50 text-brand-700">{totalSignups} in 6 mo</span>} />
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.signups} margin={{ left: -20, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="signGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" />
                    <stop offset="100%" stopColor="#6366f1" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip cursor={{ fill: '#f1f5f9' }} content={<ChartTooltip />} />
                <Bar dataKey="count" name="Signups" fill="url(#signGrad)" radius={[8, 8, 0, 0]} maxBarSize={44} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Feature usage" subtitle="Platform-wide activity volume" icon={<Activity className="h-5 w-5" />} />
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.featureUsage} layout="vertical" margin={{ left: 10, right: 24, top: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" domain={[0, Math.ceil(maxUsage * 1.1)]} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis type="category" dataKey="feature" width={130} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#475569' }} />
                <Tooltip cursor={{ fill: '#f1f5f9' }} content={<ChartTooltip />} />
                <Bar dataKey="count" name="Count" radius={[0, 8, 8, 0]} maxBarSize={26}>
                  {data.featureUsage.map((_, i) => <Cell key={i} fill={PALETTE[(i + 2) % PALETTE.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Quick links */}
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {[
          { to: '/admin/institutes', title: 'Manage institutes', text: `${t.institutes} institutes · ${t.pastDue} past due`, icon: <Building2 className="h-5 w-5" />, tone: 'from-brand-500 to-violet-500' },
          { to: '/admin/payments', title: 'Subscription payments', text: `${t.failedPayments30d} failed in last 30 days`, icon: <CreditCard className="h-5 w-5" />, tone: 'from-emerald-500 to-teal-500' },
          { to: '/admin/tickets', title: 'Support tickets', text: `${t.openTickets} awaiting response`, icon: t.openTickets ? <AlertTriangle className="h-5 w-5" /> : <LifeBuoy className="h-5 w-5" />, tone: 'from-amber-500 to-orange-500' },
        ].map((q) => (
          <Link key={q.to} to={q.to} className="card group flex items-center gap-4 p-5 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lg">
            <div className={clsx('grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-sm', q.tone)}>{q.icon}</div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-slate-900">{q.title}</p>
              <p className="truncate text-sm text-slate-500">{q.text}</p>
            </div>
            <ArrowRight className="h-5 w-5 text-slate-300 transition group-hover:translate-x-1 group-hover:text-brand-500" />
          </Link>
        ))}
      </div>
    </div>
  );
}
