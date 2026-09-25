import {
  AlertTriangle, CalendarCheck, CalendarDays, Check, CheckCheck, ChevronLeft, Clock, Download, Phone, Send, User, UserX, Users,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useSearchParams } from 'react-router-dom';
import {
  Avatar, Badge, Button, Card, EmptyState, ErrorState, Input, PageHeader, Progress, Select, Skeleton, Tabs, clsx,
} from '../../components/ui';
import { UpgradeCard } from '../../components/Upgrade';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../hooks/useApi';
import { api, errMsg } from '../../lib/api';
import { downloadCSV, fmtDate, fmtTime, pctTone, ymd } from '../../lib/format';

type Status = 'present' | 'absent' | 'late';
type TabKey = 'mark' | 'register' | 'alerts';

interface OverviewRow {
  _id: string; name: string; subject?: string; color?: string; startTime: string; endTime: string; teacher?: string;
  scheduledToday: boolean; students: number; marked: boolean; present: number; total: number; pct: number | null;
}
interface SheetResp {
  batch: { _id: string; name: string; color?: string; subject?: string; startTime?: string; endTime?: string };
  date: string;
  students: { _id: string; name: string; studentCode: string }[];
  records: { studentId: string; status: Status }[] | null;
  submittedAt: string | null;
}
interface RegisterResp {
  batch: { _id: string; name: string };
  dates: string[];
  students: { _id: string; name: string; studentCode: string; row: (Status | null)[]; pct: number }[];
}
interface AlertRow {
  studentId: string; count: number; since: string;
  student: { _id: string; name: string; studentCode: string; parentName?: string; parentPhone?: string; batchIds: { _id: string; name: string }[] };
}

const STATUS_META: Record<Status, { label: string; short: string; on: string; cell: string }> = {
  present: { label: 'Present', short: 'P', on: 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30', cell: 'bg-emerald-100 text-emerald-700' },
  absent: { label: 'Absent', short: 'A', on: 'bg-rose-500 text-white shadow-sm shadow-rose-500/30', cell: 'bg-rose-100 text-rose-700' },
  late: { label: 'Late', short: 'L', on: 'bg-amber-500 text-white shadow-sm shadow-amber-500/30', cell: 'bg-amber-100 text-amber-700' },
};
const NEXT: Record<Status, Status> = { present: 'absent', absent: 'late', late: 'present' };

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return ymd(d);
};

export default function Attendance() {
  const { session, hasFeature } = useAuth();
  const isOwner = session?.user.role === 'owner';
  const [params, setParams] = useSearchParams();
  const today = ymd();
  const [date, setDate] = useState(today);
  const [tab, setTab] = useState<TabKey>(params.get('tab') === 'alerts' ? 'alerts' : params.get('tab') === 'register' ? 'register' : 'mark');
  const selected = params.get('batchId');

  const overview = useApi<OverviewRow[]>('/attendance/overview', { date });
  const alerts = useApi<AlertRow[]>('/attendance/alerts');

  const selectBatch = (id: string | null) => {
    const p = new URLSearchParams(params);
    if (id) p.set('batchId', id);
    else p.delete('batchId');
    setParams(p, { replace: true });
  };

  return (
    <div className="pb-24">
      <PageHeader
        title="Attendance"
        subtitle="Mark attendance in seconds — parents of absent students are notified automatically."
        actions={
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="date"
              className="input pl-9"
              value={date}
              max={today}
              onChange={(e) => e.target.value && setDate(e.target.value > today ? today : e.target.value)}
            />
          </div>
        }
      />

      {isOwner && !hasFeature('whatsapp') && (
        <UpgradeCard
          className="mb-5"
          emoji="✨"
          title="AUTOMATE ATTENDANCE ALERTS"
          text="Parents ko automatic attendance notifications WhatsApp par bhejna chahte hain?"
          cta="Unlock Premium"
        />
      )}

      <Tabs<TabKey>
        className="mb-5"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'mark', label: <><CalendarCheck className="h-4 w-4" /> Mark</> },
          { value: 'register', label: <><CalendarDays className="h-4 w-4" /> Register</> },
          { value: 'alerts', label: <><AlertTriangle className="h-4 w-4" /> Alerts</>, count: alerts.data?.length },
        ]}
      />

      {tab === 'mark' &&
        (selected ? (
          <MarkSheet
            batchId={selected}
            date={date}
            onBack={() => selectBatch(null)}
            onSaved={() => {
              overview.reload();
              alerts.reload();
            }}
          />
        ) : (
          <BatchGrid data={overview.data} loading={overview.loading} error={overview.error} reload={overview.reload} date={date} onPick={selectBatch} />
        ))}

      {tab === 'register' && <Register batches={overview.data ?? []} initial={selected} />}

      {tab === 'alerts' && <Alerts data={alerts.data} loading={alerts.loading} error={alerts.error} reload={alerts.reload} />}
    </div>
  );
}

/* ───────────────────────── Batch grid ───────────────────────── */

function BatchGrid({ data, loading, error, reload, date, onPick }: {
  data: OverviewRow[] | null; loading: boolean; error: string | null; reload: () => void; date: string; onPick: (id: string) => void;
}) {
  if (loading && !data) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40" />)}
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data?.length) return <Card><EmptyState icon={<Users className="h-7 w-7" />} title="No active batches" text="Create a batch to start marking attendance." /></Card>;

  const sorted = [...data].sort((a, b) => Number(b.scheduledToday) - Number(a.scheduledToday));
  const markedCount = data.filter((b) => b.marked).length;
  const scheduled = data.filter((b) => b.scheduledToday);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-slate-500">
        <span className="font-semibold text-slate-700">{fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        <span>·</span>
        <span>{scheduled.length} scheduled</span>
        <span>·</span>
        <span className="font-semibold text-emerald-600">{markedCount}/{data.length} marked</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {sorted.map((b) => (
          <button
            key={b._id}
            onClick={() => onPick(b._id)}
            className={clsx(
              'card group relative overflow-hidden p-5 text-left transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
              !b.scheduledToday && 'opacity-80',
            )}
          >
            <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: b.color ?? '#6366f1' }} />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate font-bold text-slate-900">{b.name}</h3>
                <p className="mt-0.5 text-sm text-slate-500">{b.subject ?? '—'}</p>
              </div>
              {b.scheduledToday ? <Badge tone="brand">Scheduled</Badge> : <Badge tone="gray">Not scheduled</Badge>}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {fmtTime(b.startTime)} – {fmtTime(b.endTime)}</span>
              {b.teacher && <span className="inline-flex items-center gap-1"><User className="h-3.5 w-3.5" /> {b.teacher}</span>}
              <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {b.students}</span>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
              {b.marked ? (
                <>
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-600">
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-white"><Check className="h-3 w-3" /></span>
                    Marked · {b.present}/{b.total}
                  </span>
                  <span className={clsx('text-lg font-extrabold', pctTone(b.pct))}>{b.pct}%</span>
                </>
              ) : (
                <>
                  <span className="text-sm font-semibold text-amber-600">Not marked</span>
                  <span className="text-sm font-semibold text-brand-600 group-hover:underline">Mark now →</span>
                </>
              )}
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

/* ───────────────────────── Marking sheet ───────────────────────── */

function MarkSheet({ batchId, date, onBack, onSaved }: { batchId: string; date: string; onBack: () => void; onSaved: () => void }) {
  const { data, loading, error, reload } = useApi<SheetResp>('/attendance/sheet', { batchId, date });
  const [marks, setMarks] = useState<Record<string, Status>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    const m: Record<string, Status> = {};
    for (const s of data.students) {
      const rec = data.records?.find((r) => String(r.studentId) === String(s._id));
      m[s._id] = rec?.status ?? 'present';
    }
    setMarks(m);
  }, [data]);

  const counts = useMemo(() => {
    const vals = Object.values(marks);
    const present = vals.filter((v) => v === 'present').length;
    const late = vals.filter((v) => v === 'late').length;
    const absent = vals.filter((v) => v === 'absent').length;
    const total = vals.length;
    return { present, late, absent, total, pct: total ? Math.round(((present + late) / total) * 100) : 0 };
  }, [marks]);

  const setAll = (s: Status) => setMarks((m) => Object.fromEntries(Object.keys(m).map((k) => [k, s])));

  const submit = async () => {
    if (!data) return;
    setSaving(true);
    try {
      const res = await api.post<{ notified: number; present: number; total: number; pct: number }>('/attendance', {
        batchId,
        date,
        records: data.students.map((s) => ({ studentId: s._id, status: marks[s._id] ?? 'present' })),
      });
      const n = res.data.notified ?? 0;
      toast.success(`Attendance saved — ${n} parent${n === 1 ? '' : 's'} notified`);
      onSaved();
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-28" />
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  return (
    <div className="animate-fade-up">
      <Card className="relative mb-4 overflow-hidden">
        <span className="absolute inset-x-0 top-0 h-1" style={{ background: data.batch.color ?? '#6366f1' }} />
        <button onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-800">
          <ChevronLeft className="h-4 w-4" /> All batches
        </button>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900 sm:text-xl">
              {data.batch.name} <span className="font-semibold text-slate-400">· {fmtDate(date, { day: 'numeric', month: 'long' })}</span>
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {data.submittedAt ? <>Last saved {fmtDate(data.submittedAt, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} — editing</> : 'Fresh sheet — everyone is present by default. Tap to change.'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Counter label="Present" value={counts.present + counts.late} className="text-emerald-600" />
            <Counter label="Absent" value={counts.absent} className="text-rose-600" />
            <div className="h-10 w-px bg-slate-200" />
            <Counter label="Rate" value={`${counts.pct}%`} className={pctTone(counts.pct)} />
          </div>
        </div>
        <Progress value={counts.pct} className="mt-4" />
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" icon={<CheckCheck className="h-4 w-4 text-emerald-600" />} onClick={() => setAll('present')}>Mark all present</Button>
          <Button size="sm" variant="secondary" icon={<UserX className="h-4 w-4 text-rose-600" />} onClick={() => setAll('absent')}>Mark all absent</Button>
          {counts.late > 0 && <Badge tone="amber" className="self-center">{counts.late} late</Badge>}
        </div>
      </Card>

      {data.students.length === 0 ? (
        <Card><EmptyState icon={<Users className="h-7 w-7" />} title="No students in this batch" text="Add students to this batch to mark attendance." /></Card>
      ) : (
        <div className="space-y-2">
          {data.students.map((s, i) => {
            const st = marks[s._id] ?? 'present';
            return (
              <div
                key={s._id}
                onClick={() => setMarks((m) => ({ ...m, [s._id]: NEXT[st] }))}
                className={clsx(
                  'card flex cursor-pointer select-none items-center gap-3 px-3 py-3 transition active:scale-[0.99] sm:px-4',
                  st === 'absent' && 'border-rose-200 bg-rose-50/60',
                  st === 'late' && 'border-amber-200 bg-amber-50/60',
                )}
              >
                <span className="hidden w-6 text-right text-xs font-semibold text-slate-400 sm:block">{i + 1}</span>
                <Avatar name={s.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">{s.name}</p>
                  <p className="text-xs text-slate-500">{s.studentCode}</p>
                </div>
                <div className="flex shrink-0 gap-1 rounded-xl bg-slate-100 p-1" onClick={(e) => e.stopPropagation()}>
                  {(['present', 'absent', 'late'] as Status[]).map((k) => (
                    <button
                      key={k}
                      onClick={() => setMarks((m) => ({ ...m, [s._id]: k }))}
                      className={clsx(
                        'h-10 min-w-[2.5rem] rounded-lg px-2 text-sm font-bold transition sm:min-w-[4.5rem]',
                        st === k ? STATUS_META[k].on : 'text-slate-500 hover:bg-white',
                      )}
                      aria-pressed={st === k}
                    >
                      <span className="sm:hidden">{STATUS_META[k].short}</span>
                      <span className="hidden sm:inline">{STATUS_META[k].label}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {data.students.length > 0 && (
        <div className="no-print sticky bottom-0 z-20 -mx-4 mt-4 border-t border-slate-200 bg-white/90 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-slate-600">
              <b className="text-emerald-600">{counts.present + counts.late}</b> present · <b className="text-rose-600">{counts.absent}</b> absent
            </p>
            <Button className="min-w-[10rem] py-3" loading={saving} icon={<Send className="h-4 w-4" />} onClick={submit}>
              {data.submittedAt ? 'Update attendance' : 'Submit attendance'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Counter({ label, value, className }: { label: string; value: number | string; className?: string }) {
  return (
    <div className="text-center">
      <p className={clsx('text-2xl font-extrabold leading-none', className)}>{value}</p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
}

/* ───────────────────────── Register ───────────────────────── */

function Register({ batches, initial }: { batches: OverviewRow[]; initial: string | null }) {
  const [batchId, setBatchId] = useState<string>(initial ?? '');
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(ymd());

  useEffect(() => {
    if (!batchId && batches.length) setBatchId(batches[0]._id);
  }, [batches, batchId]);

  const { data, loading, error, reload } = useApi<RegisterResp>(batchId ? '/attendance/register' : null, { batchId, from, to });

  const exportCSV = () => {
    if (!data) return;
    downloadCSV(
      `attendance-${data.batch.name}-${from}-to-${to}`,
      data.students.map((s) => ({
        Code: s.studentCode,
        Name: s.name,
        ...Object.fromEntries(data.dates.map((d, i) => [d, s.row[i] ? STATUS_META[s.row[i] as Status].short : ''])),
        'Attendance %': s.pct,
      })),
    );
  };

  return (
    <Card pad={false}>
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-end sm:p-5">
        <Select label="Batch" value={batchId} onChange={(e) => setBatchId(e.target.value)} className="sm:w-72">
          {batches.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
        </Select>
        <Input label="From" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="sm:w-44" />
        <Input label="To" type="date" value={to} max={ymd()} onChange={(e) => setTo(e.target.value)} className="sm:w-44" />
        <div className="flex-1" />
        <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={exportCSV} disabled={!data?.students.length}>Export CSV</Button>
      </div>

      {loading && !data ? (
        <div className="space-y-2 p-5">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9" />)}</div>
      ) : error ? (
        <div className="p-5"><ErrorState message={error} onRetry={reload} /></div>
      ) : !data || !data.dates.length ? (
        <EmptyState icon={<CalendarDays className="h-7 w-7" />} title="No attendance in this range" text="Pick a different batch or date range." />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 px-5 pt-4 text-xs text-slate-500">
            {(['present', 'absent', 'late'] as Status[]).map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5">
                <span className={clsx('grid h-5 w-5 place-items-center rounded font-bold', STATUS_META[k].cell)}>{STATUS_META[k].short}</span> {STATUS_META[k].label}
              </span>
            ))}
            <span className="ml-auto">{data.dates.length} classes · {data.students.length} students</span>
          </div>
          <div className="overflow-x-auto p-4 scrollbar-thin sm:p-5">
            <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-white px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Student</th>
                  {data.dates.map((d) => (
                    <th key={d} className="px-0.5 py-2 text-center text-[10px] font-semibold leading-tight text-slate-500">
                      <div>{new Date(d + 'T12:00:00').getDate()}</div>
                      <div className="text-slate-400">{new Date(d + 'T12:00:00').toLocaleDateString('en-IN', { month: 'short' })}</div>
                    </th>
                  ))}
                  <th className="sticky right-0 z-10 bg-white px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">%</th>
                </tr>
              </thead>
              <tbody>
                {data.students.map((s) => (
                  <tr key={s._id} className="group">
                    <td className="sticky left-0 z-10 whitespace-nowrap border-t border-slate-100 bg-white px-3 py-1.5 group-hover:bg-slate-50">
                      <p className="max-w-[10rem] truncate font-semibold text-slate-800">{s.name}</p>
                      <p className="text-[11px] text-slate-400">{s.studentCode}</p>
                    </td>
                    {s.row.map((st, i) => (
                      <td key={i} className="border-t border-slate-100 px-0.5 py-1.5 text-center group-hover:bg-slate-50">
                        <span
                          title={`${data.dates[i]}: ${st ?? 'not marked'}`}
                          className={clsx('mx-auto grid h-7 w-7 place-items-center rounded-md text-xs font-bold', st ? STATUS_META[st].cell : 'bg-slate-50 text-slate-300')}
                        >
                          {st ? STATUS_META[st].short : '·'}
                        </span>
                      </td>
                    ))}
                    <td className={clsx('sticky right-0 z-10 border-t border-slate-100 bg-white px-3 py-1.5 text-right font-extrabold group-hover:bg-slate-50', pctTone(s.pct))}>
                      {s.pct}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}

/* ───────────────────────── Alerts ───────────────────────── */

function Alerts({ data, loading, error, reload }: { data: AlertRow[] | null; loading: boolean; error: string | null; reload: () => void }) {
  if (loading && !data) return <div className="grid gap-4 md:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36" />)}</div>;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data?.length) {
    return <Card><EmptyState icon={<CheckCheck className="h-7 w-7" />} title="No attendance alerts" text="No student has missed several classes in a row. Great job!" /></Card>;
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {data.map((a) => (
        <div key={a.studentId} className="card relative overflow-hidden border-rose-200 p-5">
          <span className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-rose-500 to-orange-500" />
          <div className="flex items-start gap-3">
            <Avatar name={a.student.name} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-extrabold uppercase tracking-wider text-rose-600">⚠ Attendance Alert</p>
              <p className="mt-1 text-sm text-slate-700">
                <b className="text-slate-900">{a.student.name}</b> absent <b className="text-rose-600">{a.count} consecutive classes</b> since{' '}
                <b>{fmtDate(a.since, { day: 'numeric', month: 'short' })}</b>
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {a.student.batchIds.map((b) => <Badge key={b._id} tone="gray">{b.name}</Badge>)}
              </div>
            </div>
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-rose-50 text-lg font-extrabold text-rose-600">{a.count}</span>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3 text-sm">
            <span className="text-slate-500">
              {a.student.parentName ?? 'Parent'} <span className="text-slate-400">· {a.student.studentCode}</span>
            </span>
            {a.student.parentPhone ? (
              <a href={`tel:${a.student.parentPhone}`} className="btn-secondary btn-sm">
                <Phone className="h-3.5 w-3.5 text-emerald-600" /> {a.student.parentPhone}
              </a>
            ) : (
              <span className="text-xs text-slate-400">No phone</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
