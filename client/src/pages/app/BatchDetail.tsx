import { ArrowLeft, BookOpen, CalendarCheck, CalendarClock, ClipboardCheck, Clock, DoorOpen, FilePlus2, Mail, Phone, TrendingUp, Trophy, User, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Avatar, Button, Card, CardHeader, ChartTooltip, EmptyState, ErrorState, PageLoader, Progress, SearchInput, StatCard, StatusBadge, clsx } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import { DAYS, fmtDate, fmtDateShort, fmtDateTime, fmtTime, pctTone } from '../../lib/format';

interface BatchDetailData {
  batch: {
    _id: string; name: string; course?: string; subject?: string; days: string[]; startTime: string; endTime: string; room?: string; capacity?: number;
    color: string; active: boolean; teacher?: { _id: string; name: string; email?: string; phone?: string; subjects?: string[] } | null;
  };
  students: { _id: string; name: string; studentCode: string; phone?: string; parentName?: string; parentPhone?: string; attendancePct: number | null; avgScore: number | null }[];
  tests: { _id: string; subject: string; topic?: string; date: string; status: string; maxMarks: number; avg: number | null }[];
  attendanceTrend: { date: string; pct: number }[];
  nextClassAt: string | null;
}

const avgOf = (xs: (number | null | undefined)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
};

export default function BatchDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data, loading, error, reload } = useApi<BatchDetailData>(`/batches/${id}`);
  const [q, setQ] = useState('');

  if (loading && !data) return <PageLoader />;
  if (error || !data) return <ErrorState message={error ?? 'Batch not found'} onRetry={reload} />;

  const { batch: b, students, tests, attendanceTrend } = data;
  const color = b.color || '#6366f1';
  const orderedDays = DAYS.filter((d) => b.days.includes(d));
  const schedule = `${orderedDays.join('/') || '—'} · ${fmtTime(b.startTime)} – ${fmtTime(b.endTime)}`;
  const avgAtt = attendanceTrend.length ? Math.round(attendanceTrend.reduce((a, x) => a + x.pct, 0) / attendanceTrend.length) : avgOf(students.map((s) => s.attendancePct));
  const avgScore = avgOf(tests.map((t) => t.avg));
  const graded = tests.filter((t) => t.status !== 'scheduled').length;
  const upcoming = tests.filter((t) => t.status === 'scheduled').length;
  const trend = attendanceTrend.map((x) => ({ ...x, label: fmtDateShort(x.date) }));
  const filtered = students.filter((s) => !q || s.name.toLowerCase().includes(q.toLowerCase()) || s.studentCode.toLowerCase().includes(q.toLowerCase()));
  const gradId = `att-${b._id}`;

  return (
    <div>
      <Link to="/app/batches" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-brand-700">
        <ArrowLeft className="h-4 w-4" /> All batches
      </Link>

      {/* Header */}
      <div className="card relative mb-6 overflow-hidden">
        <div className="absolute inset-y-0 left-0 w-1.5" style={{ background: color }} />
        <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full opacity-10 blur-2xl" style={{ background: color }} />
        <div className="card-pad relative flex flex-col gap-5 pl-7 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="grid h-10 w-10 place-items-center rounded-xl text-white shadow-sm" style={{ background: color }}><BookOpen className="h-5 w-5" /></span>
              <h1 className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">{b.name}</h1>
              {!b.active && <StatusBadge status="inactive" />}
            </div>
            {(b.course || b.subject) && <p className="mt-1 text-sm text-slate-500">{[b.course, b.subject].filter(Boolean).join(' · ')}</p>}
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
              <span className="flex items-center gap-1.5"><User className="h-4 w-4 text-slate-400" />{b.teacher?.name ?? <span className="text-amber-600">No teacher</span>}</span>
              <span className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-slate-400" />{schedule}</span>
              {b.room && <span className="flex items-center gap-1.5"><DoorOpen className="h-4 w-4 text-slate-400" />{b.room}</span>}
              {data.nextClassAt && (
                <span className="flex items-center gap-1.5 font-semibold" style={{ color }}><CalendarClock className="h-4 w-4" />Next: {fmtDateTime(data.nextClassAt)}</span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button icon={<ClipboardCheck className="h-4 w-4" />} onClick={() => nav(`/app/attendance?batchId=${b._id}`)}>Mark attendance</Button>
            <Button variant="secondary" icon={<FilePlus2 className="h-4 w-4" />} onClick={() => nav(`/app/tests?batchId=${b._id}&new=1`)}>Create test</Button>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Students" value={<>{students.length}{b.capacity ? <span className="text-base font-semibold text-slate-400"> / {b.capacity}</span> : null}</>}
          icon={<Users className="h-5 w-5" />} tone="brand" hint={b.capacity ? <Progress value={(students.length / b.capacity) * 100} tone="brand" /> : 'Active students'} />
        <StatCard label="Avg attendance" value={<span className={pctTone(avgAtt)}>{avgAtt != null ? `${avgAtt}%` : '—'}</span>}
          icon={<CalendarCheck className="h-5 w-5" />} tone="green" hint={`Last ${attendanceTrend.length} sessions`} />
        <StatCard label="Avg score" value={<span className={pctTone(avgScore)}>{avgScore != null ? `${avgScore}%` : '—'}</span>}
          icon={<Trophy className="h-5 w-5" />} tone="amber" hint="Across graded tests" />
        <StatCard label="Tests" value={tests.length} icon={<BookOpen className="h-5 w-5" />} tone="violet" hint={`${graded} graded · ${upcoming} upcoming`} />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Attendance trend" subtitle="Present % per session" icon={<TrendingUp className="h-5 w-5" />} />
          {trend.length < 2 ? <EmptyState title="Not enough data yet" text="Mark attendance for a few sessions to see the trend." /> : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} minTickGap={16} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip format={(v) => `${v}%`} />} />
                  <ReferenceLine y={75} stroke="#f59e0b" strokeDasharray="4 4" />
                  <Area type="monotone" dataKey="pct" name="Present" stroke={color} strokeWidth={2.5} fill={`url(#${gradId})`} dot={false} activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Tests" subtitle={`${tests.length} total`} icon={<BookOpen className="h-5 w-5" />}
            action={<Link to={`/app/tests?batchId=${b._id}&new=1`} className="text-sm font-semibold text-brand-700 hover:underline">+ New</Link>} />
          {tests.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">No tests yet</p> : (
            <div className="-mx-2 max-h-72 space-y-1 overflow-y-auto px-2 scrollbar-thin">
              {tests.map((t) => (
                <Link key={t._id} to={`/app/tests/${t._id}`} className="flex items-center gap-3 rounded-xl p-2.5 transition hover:bg-slate-50">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-50 text-center leading-none">
                    <div>
                      <p className="text-sm font-extrabold text-slate-800">{new Date(t.date).getDate()}</p>
                      <p className="text-[9px] font-bold uppercase text-slate-400">{fmtDate(t.date, { month: 'short' })}</p>
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">{t.topic || t.subject}</p>
                    <p className="text-xs text-slate-400">{t.subject} · {t.maxMarks} marks</p>
                  </div>
                  {t.avg != null ? <span className={clsx('text-sm font-bold', pctTone(t.avg))}>{t.avg}%</span> : <StatusBadge status={t.status} />}
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card pad={false}>
        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-bold text-slate-900">Students</h3>
            <p className="text-sm text-slate-500">{students.length} active in this batch</p>
          </div>
          {students.length > 6 && <SearchInput value={q} onChange={setQ} placeholder="Search students…" className="sm:w-64" />}
        </div>
        {students.length === 0 ? <EmptyState icon={<Users className="h-7 w-7" />} title="No students in this batch" text="Add students by editing the batch or a student's profile." /> : (
          <>
            <div className="table-wrap hidden md:block">
              <table className="table">
                <thead><tr><th>Student</th><th>Parent</th><th>Attendance</th><th>Avg score</th></tr></thead>
                <tbody>
                  {filtered.map((s) => (
                    <tr key={s._id} className="cursor-pointer" onClick={() => nav(`/app/students/${s._id}`)}>
                      <td>
                        <div className="flex items-center gap-3">
                          <Avatar name={s.name} size="sm" />
                          <div><p className="font-semibold text-slate-900">{s.name}</p><p className="text-xs text-slate-400">{s.studentCode}</p></div>
                        </div>
                      </td>
                      <td><p className="text-slate-700">{s.parentName || '—'}</p><p className="text-xs text-slate-400">{s.parentPhone}</p></td>
                      <td>
                        {s.attendancePct == null ? <span className="text-slate-400">—</span> : (
                          <div className="flex items-center gap-3"><Progress value={s.attendancePct} className="w-20" /><span className={clsx('font-bold', pctTone(s.attendancePct))}>{s.attendancePct}%</span></div>
                        )}
                      </td>
                      <td>{s.avgScore == null ? <span className="text-slate-400">—</span> : <span className={clsx('font-bold', pctTone(s.avgScore))}>{s.avgScore}%</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divide-y divide-slate-100 border-t border-slate-100 md:hidden">
              {filtered.map((s) => (
                <Link key={s._id} to={`/app/students/${s._id}`} className="flex items-center gap-3 px-5 py-3">
                  <Avatar name={s.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">{s.name}</p>
                    <p className="text-xs text-slate-400">{s.studentCode}</p>
                  </div>
                  <div className="text-right text-xs">
                    <p className={clsx('font-bold', pctTone(s.attendancePct))}>{s.attendancePct != null ? `${s.attendancePct}%` : '—'} <span className="font-normal text-slate-400">att.</span></p>
                    <p className={clsx('font-bold', pctTone(s.avgScore))}>{s.avgScore != null ? `${s.avgScore}%` : '—'} <span className="font-normal text-slate-400">score</span></p>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </Card>

      {b.teacher && (b.teacher.email || b.teacher.phone) && (
        <Card className="mt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Avatar name={b.teacher.name} />
            <div className="flex-1">
              <p className="font-bold text-slate-900">{b.teacher.name}</p>
              <p className="text-sm text-slate-500">{b.teacher.subjects?.join(', ') || 'Teacher'}</p>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-slate-600">
              {b.teacher.phone && <a href={`tel:${b.teacher.phone}`} className="flex items-center gap-1.5 hover:text-brand-700"><Phone className="h-4 w-4 text-slate-400" />{b.teacher.phone}</a>}
              {b.teacher.email && <a href={`mailto:${b.teacher.email}`} className="flex items-center gap-1.5 hover:text-brand-700"><Mail className="h-4 w-4 text-slate-400" />{b.teacher.email}</a>}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
