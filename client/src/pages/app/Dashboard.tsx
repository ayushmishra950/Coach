import {
  AlertTriangle, ArrowRight, BookOpen, CalendarCheck, CheckCircle2, ClipboardList, Clock, GraduationCap, IndianRupee,
  Megaphone, UserSquare2, Wallet,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PremiumCard, UpgradeCard } from '../../components/Upgrade';
import { Avatar, Badge, Card, CardHeader, ChartTooltip, EmptyState, ErrorState, Progress, Skeleton, StatCard, clsx } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../hooks/useApi';
import { fmtDate, fmtDateShort, fmtTime, greeting, inr, inrShort, pctTone, timeAgo } from '../../lib/format';
import type { Plan } from '../../lib/types';

interface ClassRow {
  _id: string; name: string; subject?: string; color: string; startTime: string; endTime: string; room?: string; teacher?: string;
  students: number; marked: boolean; present: number; total: number;
}
interface AbsentAlert { studentId: string; count: number; since: string; student: { _id: string; name: string; studentCode: string; parentPhone?: string } }
interface PendingTest { _id: string; subject: string; topic?: string; date: string; batchId: { name: string } }
interface Common {
  todayAttendance: { present: number; total: number };
  classes: ClassRow[];
  pendingTests: PendingTest[];
  absentAlerts: AbsentAlert[];
  trend: { date: string; pct: number | null }[];
}
interface OwnerDash extends Common {
  role: 'owner';
  counts: { students: number; teachers: number; batches: number };
  fees: { collectedThisMonth: number; pendingThisMonth: number; total: number; collected: number; pending: number };
  actions: { pendingFeeStudents: number; overdueInvoices: number; absentAlerts: number; testsNeedingMarks: number };
  collection: { month: string; amount: number }[];
  recentPayments: { _id: string; amount: number; method: string; receiptNo: string; paidAt: string; studentId: { name: string } | null }[];
  upcoming: { _id: string; title: string; amount: number; paidAmount: number; dueDate: string; studentId: { _id: string; name: string } | null }[];
  announcements: { _id: string; title: string; body: string; pinned: boolean; createdAt: string }[];
}
interface TeacherDash extends Common {
  role: 'teacher';
  counts: { batches: number; students: number; testsPending: number };
  recentTests: { _id: string; subject: string; topic?: string; date: string; status: string; avg: number; batchId: { name: string } }[];
}

const pctOf = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

export default function Dashboard() {
  const { session } = useAuth();
  const { data, loading, error, reload } = useApi<OwnerDash | TeacherDash>('/dashboard');
  const first = session?.user.name.split(' ')[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-brand-600">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
            {greeting()}, {first} <span className="inline-block animate-float">👋</span>
          </h1>
          <p className="mt-1 text-sm text-slate-500">{session?.institute?.name} — here's your institute at a glance.</p>
        </div>
      </div>

      {error && <ErrorState message={error} onRetry={reload} />}
      {loading && !data && <DashboardSkeleton />}
      {data?.role === 'owner' && <OwnerView d={data} />}
      {data?.role === 'teacher' && <TeacherView d={data} />}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}</div>
      <div className="grid gap-6 lg:grid-cols-3"><Skeleton className="h-72 lg:col-span-2" /><Skeleton className="h-72" /></div>
    </div>
  );
}

/* ───────────────────────────── Owner ───────────────────────────── */

function OwnerView({ d }: { d: OwnerDash }) {
  const { session } = useAuth();
  const { data: plans } = useApi<Plan[]>(session?.user.role === 'owner' && session?.plan?.key !== 'premium' ? '/public/plans' : null); // prices are for the owner only
  const premiumPrice = plans?.find((p) => p.key === 'premium')?.priceMonthly;
  const att = pctOf(d.todayAttendance.present, d.todayAttendance.total);
  const feeRate = pctOf(d.fees.collected, d.fees.total);
  const actions = [
    { n: d.actions.pendingFeeStudents, text: 'students have pending fees', to: '/app/fees', icon: IndianRupee, tone: 'amber' },
    { n: d.actions.absentAlerts, text: 'students absent 3+ classes in a row', to: '/app/attendance?tab=alerts', icon: CalendarCheck, tone: 'rose' },
    { n: d.actions.testsNeedingMarks, text: 'tests need marks entry', to: '/app/tests?status=scheduled', icon: ClipboardList, tone: 'violet' },
    { n: d.actions.overdueInvoices, text: 'installments are overdue', to: '/app/fees', icon: AlertTriangle, tone: 'rose' },
  ].filter((a) => a.n > 0);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Students" value={d.counts.students} icon={<GraduationCap className="h-5 w-5" />} tone="brand" hint={<Link to="/app/students" className="text-brand-600 hover:underline">Manage students →</Link>} />
        <StatCard label="Teachers" value={d.counts.teachers} icon={<UserSquare2 className="h-5 w-5" />} tone="violet" hint={<Link to="/app/teachers" className="text-brand-600 hover:underline">View teachers →</Link>} />
        <StatCard label="Batches" value={d.counts.batches} icon={<BookOpen className="h-5 w-5" />} tone="sky" hint={`${d.classes.length} classes scheduled today`} />
        <StatCard label="Collected this month" value={inrShort(d.fees.collectedThisMonth)} icon={<Wallet className="h-5 w-5" />} tone="green" hint={<span className="text-amber-600">{inr(d.fees.pendingThisMonth)} pending</span>} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Attendance today */}
        <Card>
          <CardHeader title="Today's attendance" subtitle={`${d.todayAttendance.present} of ${d.todayAttendance.total} students marked present`} icon={<CalendarCheck className="h-5 w-5" />} />
          <div className="flex items-end gap-2">
            <span className={clsx('text-5xl font-extrabold tracking-tight', d.todayAttendance.total ? pctTone(att) : 'text-slate-300')}>{d.todayAttendance.total ? `${att}%` : '—'}</span>
          </div>
          <Progress value={att} className="mt-4 h-3" />
          <div className="mt-5 h-28">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={d.trend.map((t) => ({ ...t, label: fmtDateShort(t.date) }))} margin={{ top: 4, left: 0, right: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="attG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6366f1" stopOpacity={0.35} /><stop offset="1" stopColor="#6366f1" stopOpacity={0} /></linearGradient>
                </defs>
                <XAxis dataKey="label" hide />
                <YAxis domain={[50, 100]} hide />
                <Tooltip content={<ChartTooltip format={(v) => `${v}%`} />} />
                <Area type="monotone" dataKey="pct" name="Attendance" stroke="#6366f1" strokeWidth={2.5} fill="url(#attG)" connectNulls />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="text-center text-xs text-slate-400">Last 14 days</p>
        </Card>

        {/* Fees */}
        <Card>
          <CardHeader title="Fees overview" subtitle="All installments to date" icon={<IndianRupee className="h-5 w-5" />}
            action={<Link to="/app/fees" className="text-sm font-semibold text-brand-600 hover:underline">Open</Link>} />
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-emerald-50 p-4">
                <p className="text-xs font-semibold text-emerald-700">Collected</p>
                <p className="mt-1 text-xl font-extrabold text-emerald-700">{inrShort(d.fees.collected)}</p>
              </div>
              <div className="rounded-2xl bg-amber-50 p-4">
                <p className="text-xs font-semibold text-amber-700">Pending</p>
                <p className="mt-1 text-xl font-extrabold text-amber-700">{inrShort(d.fees.pending)}</p>
              </div>
            </div>
            <div>
              <div className="mb-1.5 flex justify-between text-xs font-semibold text-slate-500"><span>Collection rate</span><span>{feeRate}%</span></div>
              <Progress value={feeRate} tone="brand" className="h-3" />
            </div>
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.collection} margin={{ top: 4, left: 0, right: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="barG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8b5cf6" /><stop offset="1" stopColor="#6366f1" /></linearGradient>
                  </defs>
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <Tooltip cursor={{ fill: '#f1f5f9' }} content={<ChartTooltip format={inr} />} />
                  <Bar dataKey="amount" name="Collected" fill="url(#barG)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Card>

        {/* Action required */}
        <Card className="border-amber-200/70 bg-gradient-to-b from-amber-50/60 to-white">
          <CardHeader title="Action required" subtitle="Things that need your attention" icon={<AlertTriangle className="h-5 w-5 text-amber-600" />} />
          {actions.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center text-sm text-slate-500">
              <CheckCircle2 className="mb-2 h-10 w-10 text-emerald-500" /> All clear — nothing pending! 🎉
            </div>
          ) : (
            <ul className="space-y-2.5">
              {actions.map((a) => (
                <li key={a.text}>
                  <Link to={a.to} className="group flex items-center gap-3 rounded-xl bg-white p-3 ring-1 ring-slate-200/70 transition hover:ring-brand-300">
                    <div className={clsx('grid h-9 w-9 place-items-center rounded-lg', a.tone === 'amber' ? 'bg-amber-100 text-amber-700' : a.tone === 'rose' ? 'bg-rose-100 text-rose-700' : 'bg-violet-100 text-violet-700')}>
                      <a.icon className="h-4 w-4" />
                    </div>
                    <p className="flex-1 text-sm text-slate-700"><b className="text-slate-900">{a.n}</b> {a.text}</p>
                    <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {d.absentAlerts.length > 0 && (
            <div className="mt-4 border-t border-amber-200/60 pt-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-rose-600">⚠ Attendance alerts</p>
              <div className="space-y-2">
                {d.absentAlerts.slice(0, 3).map((a) => (
                  <Link key={a.studentId} to={`/app/students/${a.studentId}`} className="flex items-center gap-2 text-sm hover:text-brand-600">
                    <Avatar name={a.student.name} size="sm" />
                    <span className="flex-1 truncate font-medium">{a.student.name}</span>
                    <Badge tone="red">{a.count} absent</Badge>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <TodayClasses classes={d.classes} />
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader title="Recent payments" icon={<Wallet className="h-5 w-5" />} action={<Link to="/app/fees" className="text-sm font-semibold text-brand-600 hover:underline">All</Link>} />
              {d.recentPayments.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">No payments yet</p> : (
                <ul className="divide-y divide-slate-100">
                  {d.recentPayments.map((p) => (
                    <li key={p._id} className="flex items-center gap-3 py-2.5">
                      <Avatar name={p.studentId?.name ?? '?'} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-800">{p.studentId?.name ?? 'Deleted student'}</p>
                        <p className="text-xs text-slate-400">{p.receiptNo} · {timeAgo(p.paidAt)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-emerald-600">+{inr(p.amount)}</p>
                        <p className="text-[11px] uppercase text-slate-400">{p.method}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <CardHeader title="Upcoming dues" subtitle="Next 14 days" icon={<Clock className="h-5 w-5" />} />
              {d.upcoming.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">No dues in the next two weeks</p> : (
                <ul className="divide-y divide-slate-100">
                  {d.upcoming.map((u) => (
                    <li key={u._id} className="flex items-center gap-3 py-2.5">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-50 text-center leading-none ring-1 ring-slate-200">
                        <div>
                          <p className="text-sm font-extrabold text-slate-800">{new Date(u.dueDate).getDate()}</p>
                          <p className="text-[9px] font-bold uppercase text-slate-400">{new Date(u.dueDate).toLocaleString('en-IN', { month: 'short' })}</p>
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-800">{u.studentId?.name}</p>
                        <p className="text-xs text-slate-400">{u.title}</p>
                      </div>
                      <p className="text-sm font-bold text-slate-800">{inr(u.amount - u.paidAmount)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>

        <div className="space-y-6">
          {session?.plan?.key !== 'premium' && <PremiumCard price={premiumPrice} />}
          <PendingTests tests={d.pendingTests} />
          <Card>
            <CardHeader title="Announcements" icon={<Megaphone className="h-5 w-5" />} action={<Link to="/app/announcements" className="text-sm font-semibold text-brand-600 hover:underline">Post</Link>} />
            {d.announcements.length === 0 ? <p className="py-4 text-center text-sm text-slate-500">No announcements yet</p> : (
              <ul className="space-y-3">
                {d.announcements.map((a) => (
                  <li key={a._id} className="rounded-xl bg-slate-50 p-3">
                    <p className="text-sm font-semibold text-slate-800">{a.pinned && '📌 '}{a.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{a.body}</p>
                    <p className="mt-1 text-[11px] text-slate-400">{timeAgo(a.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {session?.plan?.key === 'starter' && (
        <UpgradeCard emoji="💰" title="Stop chasing fees manually" text="Unlock automatic fee reminders and online payment collection." />
      )}
    </>
  );
}

/* ───────────────────────────── Teacher ───────────────────────────── */

function TeacherView({ d }: { d: TeacherDash }) {
  const att = pctOf(d.todayAttendance.present, d.todayAttendance.total);
  const unmarked = d.classes.filter((c) => !c.marked);
  return (
    <>
      {unmarked.length > 0 && (
        <Link to={`/app/attendance?batchId=${unmarked[0]._id}`}
          className="flex items-center gap-4 rounded-2xl bg-gradient-to-r from-brand-600 to-violet-600 p-5 text-white shadow-glow transition hover:brightness-110">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-white/15"><CalendarCheck className="h-6 w-6" /></div>
          <div className="flex-1">
            <p className="font-bold">Mark attendance for {unmarked[0].name}</p>
            <p className="text-sm text-white/80">{fmtTime(unmarked[0].startTime)} · {unmarked[0].students} students{unmarked.length > 1 ? ` · +${unmarked.length - 1} more class${unmarked.length > 2 ? 'es' : ''} today` : ''}</p>
          </div>
          <ArrowRight className="h-5 w-5" />
        </Link>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="My batches" value={d.counts.batches} icon={<BookOpen className="h-5 w-5" />} tone="brand" />
        <StatCard label="My students" value={d.counts.students} icon={<GraduationCap className="h-5 w-5" />} tone="violet" />
        <StatCard label="Today's attendance" value={d.todayAttendance.total ? `${att}%` : '—'} icon={<CalendarCheck className="h-5 w-5" />} tone="green" hint={`${d.todayAttendance.present}/${d.todayAttendance.total} present`} />
        <StatCard label="Tests to grade" value={d.counts.testsPending} icon={<ClipboardList className="h-5 w-5" />} tone="amber" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <TodayClasses classes={d.classes} />
          <Card>
            <CardHeader title="Recent test results" icon={<ClipboardList className="h-5 w-5" />} action={<Link to="/app/tests" className="text-sm font-semibold text-brand-600 hover:underline">All tests</Link>} />
            {d.recentTests.length === 0 ? <EmptyState title="No graded tests yet" /> : (
              <ul className="divide-y divide-slate-100">
                {d.recentTests.map((t) => (
                  <li key={t._id}>
                    <Link to={`/app/tests/${t._id}`} className="flex items-center gap-3 py-3 hover:text-brand-600">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{t.subject}{t.topic && ` — ${t.topic}`}</p>
                        <p className="text-xs text-slate-400">{t.batchId?.name} · {fmtDate(t.date)}</p>
                      </div>
                      <span className={clsx('text-sm font-bold', pctTone(t.avg))}>{t.avg}% avg</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <PendingTests tests={d.pendingTests} />
          <Card>
            <CardHeader title="Attendance alerts" icon={<AlertTriangle className="h-5 w-5 text-rose-500" />} />
            {d.absentAlerts.length === 0 ? <p className="py-4 text-center text-sm text-slate-500">No alerts 🎉</p> : (
              <ul className="space-y-2">
                {d.absentAlerts.map((a) => (
                  <li key={a.studentId} className="flex items-center gap-2 rounded-xl bg-rose-50 p-2.5">
                    <Avatar name={a.student.name} size="sm" />
                    <Link to={`/app/students/${a.studentId}`} className="flex-1 truncate text-sm font-semibold text-slate-800 hover:text-brand-600">{a.student.name}</Link>
                    <Badge tone="red">{a.count} in a row</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

/* ───────────────────────────── Shared widgets ───────────────────────────── */

function TodayClasses({ classes }: { classes: ClassRow[] }) {
  return (
    <Card>
      <CardHeader title="Today's classes" subtitle={`${classes.length} scheduled`} icon={<Clock className="h-5 w-5" />}
        action={<Link to="/app/attendance" className="text-sm font-semibold text-brand-600 hover:underline">Attendance</Link>} />
      {classes.length === 0 ? (
        <EmptyState icon={<BookOpen className="h-7 w-7" />} title="No classes today" text="Enjoy the break! ☕" />
      ) : (
        <div className="space-y-2.5">
          {classes.map((c) => (
            <div key={c._id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 p-3 sm:flex-nowrap">
              <div className="w-20 shrink-0">
                <p className="text-sm font-bold text-slate-800">{fmtTime(c.startTime)}</p>
                <p className="text-xs text-slate-400">{fmtTime(c.endTime)}</p>
              </div>
              <span className="h-10 w-1 shrink-0 rounded-full" style={{ background: c.color }} />
              <div className="min-w-0 flex-1">
                <Link to={`/app/batches/${c._id}`} className="block truncate text-sm font-semibold text-slate-800 hover:text-brand-600">{c.name}</Link>
                <p className="truncate text-xs text-slate-500">{[c.teacher, c.room, `${c.students} students`].filter(Boolean).join(' · ')}</p>
              </div>
              {c.marked ? (
                <Badge tone="green"><CheckCircle2 className="h-3 w-3" /> {c.present}/{c.total} present</Badge>
              ) : (
                <Link to={`/app/attendance?batchId=${c._id}`} className="btn-secondary btn-sm">Mark attendance</Link>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function PendingTests({ tests }: { tests: PendingTest[] }): ReactNode {
  return (
    <Card>
      <CardHeader title="Marks entry pending" icon={<ClipboardList className="h-5 w-5" />} />
      {tests.length === 0 ? <p className="py-4 text-center text-sm text-slate-500">All marks entered ✓</p> : (
        <ul className="space-y-2">
          {tests.map((t) => (
            <li key={t._id}>
              <Link to={`/app/tests/${t._id}`} className="flex items-center gap-3 rounded-xl bg-violet-50/70 p-3 transition hover:bg-violet-100/70">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">{t.subject}{t.topic && ` — ${t.topic}`}</p>
                  <p className="text-xs text-slate-500">{t.batchId?.name} · {fmtDateShort(t.date)}</p>
                </div>
                <span className="text-xs font-bold text-violet-700">Enter marks →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
