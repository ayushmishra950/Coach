import {
  AlertTriangle, CalendarCheck, CalendarDays, Check, CheckCheck, ChevronLeft, Clock, Download, Lock, Palmtree, Phone, Send, User, UserX, Users,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useSearchParams } from 'react-router-dom';
import {
  Avatar, Badge, Button, Card, EmptyState, ErrorState, Input, PageHeader, Progress, Select, Skeleton, Tabs, clsx,
} from '../../components/ui';
import { Pager } from '../../components/Pager';
import { UpgradeCard } from '../../components/Upgrade';
import { useAuth } from '../../context/AuthContext';
import { useApi, usePagedApi } from '../../hooks/useApi';
import { api, errMsg } from '../../lib/api';
import { downloadCSV, fmtDate, fmtTime, parseYmd, pctTone, ymd } from '../../lib/format';
import type { Paged } from '../../lib/types';

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
  holiday?: string | null;
  locked?: boolean;
  editDays?: number;
}
interface RegisterDay { date: string; weekday: string; scheduled: boolean; marked: boolean; future: boolean; holiday?: string | null }
interface RegisterResp {
  batch: { _id: string; name: string; days: string[] };
  from: string; to: string; firstRecord: string | null;
  days: RegisterDay[];
  dates: string[];
  summary: { classDays: number; marked: number; notMarked: number };
  /** Current page of student rows only (all rows when requested with ?all=1). */
  students: { _id: string; name: string; studentCode: string; row: (Status | null)[]; marked: number; pct: number }[];
  studentPage: { page: number; pages: number; total: number; limit: number };
}
interface OverviewSummary { total: number; scheduled: number; marked: number }
interface BatchOption { _id: string; name: string }
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

  const overview = usePagedApi<OverviewRow, { summary: OverviewSummary; holiday?: string | null }>('/attendance/overview', { date });
  const alerts = usePagedApi<AlertRow>('/attendance/alerts');
  const batchOptions = useApi<BatchOption[]>('/batches/options', { active: 'true' });

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
          text="Want parents to get automatic attendance alerts on WhatsApp?"
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
          { value: 'alerts', label: <><AlertTriangle className="h-4 w-4" /> Alerts</>, count: alerts.data?.total },
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
          <BatchGrid data={overview.data} loading={overview.loading} error={overview.error} reload={overview.reload} date={date} onPick={selectBatch}
            pager={overview.pager && <Pager {...overview.pager} noun="batches" className="mt-4 rounded-2xl border bg-white" />} />
        ))}

      {tab === 'register' && <Register batches={batchOptions.data ?? []} initial={selected} />}

      {tab === 'alerts' && <Alerts data={alerts.data?.items ?? null} loading={alerts.loading} error={alerts.error} reload={alerts.reload}
        pager={alerts.pager && <Pager {...alerts.pager} noun="alerts" className="mt-4 rounded-2xl border bg-white" />} />}
    </div>
  );
}

/* ───────────────────────── Batch grid ───────────────────────── */

function BatchGrid({ data, loading, error, reload, date, onPick, pager }: {
  data: (Paged<OverviewRow> & { summary: OverviewSummary; holiday?: string | null }) | null; loading: boolean; error: string | null; reload: () => void; date: string;
  onPick: (id: string) => void; pager: React.ReactNode;
}) {
  if (loading && !data) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40" />)}
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data?.total) return <Card><EmptyState icon={<Users className="h-7 w-7" />} title="No active batches" text="Create a batch to start marking attendance." /></Card>;

  // The server already orders scheduled-today batches first; counts cover ALL batches (not just this page).
  const sorted = data.items;
  const { summary } = data;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-slate-500">
        <span className="font-semibold text-slate-700">{fmtDate(parseYmd(date), { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        <span>·</span>
        <span>{summary.scheduled} scheduled</span>
        <span>·</span>
        <span className="font-semibold text-emerald-600">{summary.marked}/{summary.total} marked</span>
        {data.holiday && (
          <Badge tone="gray" className="inline-flex items-center gap-1"><Palmtree className="h-3.5 w-3.5" /> Holiday: {data.holiday}</Badge>
        )}
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
      {pager}
    </>
  );
}

/* ───────────────────────── Marking sheet ───────────────────────── */

function MarkSheet({ batchId, date, onBack, onSaved }: { batchId: string; date: string; onBack: () => void; onSaved: () => void }) {
  const { data, loading, error, reload } = useApi<SheetResp>('/attendance/sheet', { batchId, date });
  const [marks, setMarks] = useState<Record<string, Status>>({});
  const [saving, setSaving] = useState(false);
  // The marking sheet shows the whole roster on one screen (batch size is bounded by capacity).
  const students = data?.students ?? [];
  const locked = !!data?.locked;

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

  const setAll = (s: Status) => !locked && setMarks((m) => Object.fromEntries(Object.keys(m).map((k) => [k, s])));

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
      toast.success(n > 0 ? `Attendance saved — absence alerts sent to ${n} parent${n === 1 ? '' : 's'}` : 'Attendance saved');
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
              {data.batch.name} <span className="font-semibold text-slate-400">· {fmtDate(parseYmd(date), { day: 'numeric', month: 'long' })}</span>
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
        {data.holiday && (
          <div className="mt-4 flex items-start gap-2 rounded-xl bg-slate-100 px-3 py-2.5 text-sm text-slate-700">
            <Palmtree className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
            <span><b>Holiday: {data.holiday}.</b> You can still mark attendance if a class was held.</span>
          </div>
        )}
        {locked && (
          <div className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-800 ring-1 ring-amber-100">
            <Lock className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Only the owner can change attendance older than {data.editDays ?? 7} day{data.editDays === 1 ? '' : 's'}.</span>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" disabled={locked} icon={<CheckCheck className="h-4 w-4 text-emerald-600" />} onClick={() => setAll('present')}>Mark all present</Button>
          <Button size="sm" variant="secondary" disabled={locked} icon={<UserX className="h-4 w-4 text-rose-600" />} onClick={() => setAll('absent')}>Mark all absent</Button>
          {counts.late > 0 && <Badge tone="amber" className="self-center">{counts.late} late</Badge>}
        </div>
      </Card>

      {data.students.length === 0 ? (
        <Card><EmptyState icon={<Users className="h-7 w-7" />} title="No students in this batch" text="Add students to this batch to mark attendance." /></Card>
      ) : (
        <div className="space-y-2">
          {students.map((s, i) => {
            const st = marks[s._id] ?? 'present';
            return (
              <div
                key={s._id}
                onClick={() => !locked && setMarks((m) => ({ ...m, [s._id]: NEXT[st] }))}
                className={clsx(
                  'card flex select-none items-center gap-3 px-3 py-3 transition sm:px-4',
                  locked ? 'cursor-not-allowed opacity-75' : 'cursor-pointer active:scale-[0.99]',
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
                      disabled={locked}
                      onClick={() => setMarks((m) => ({ ...m, [s._id]: k }))}
                      className={clsx(
                        'h-10 min-w-[2.5rem] rounded-lg px-2 text-sm font-bold transition disabled:cursor-not-allowed sm:min-w-[4.5rem]',
                        st === k ? STATUS_META[k].on : clsx('text-slate-500', !locked && 'hover:bg-white'),
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
            <Button className="min-w-[10rem] py-3" loading={saving} disabled={locked} title={locked ? 'Only the owner can change this date' : undefined} icon={<Send className="h-4 w-4" />} onClick={submit}>
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

const monthOf = (v: string) => v.slice(0, 7);
/** First and last day of a 'YYYY-MM' month, never later than today. */
function monthRange(month: string) {
  const [y, m] = month.split('-').map(Number);
  const first = ymd(new Date(y, m - 1, 1));
  const last = ymd(new Date(y, m, 0));
  const today = ymd();
  return { from: first, to: last > today ? today : last };
}

function Register({ batches, initial }: { batches: BatchOption[]; initial: string | null }) {
  const [batchId, setBatchId] = useState<string>(initial ?? '');
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(ymd());
  const thisMonth = monthOf(ymd());
  const month = monthOf(from) === monthOf(to) && monthRange(monthOf(from)).from === from && monthRange(monthOf(from)).to === to ? monthOf(from) : '';

  useEffect(() => {
    if (!batchId && batches.length) setBatchId(batches[0]._id);
  }, [batches, batchId]);

  // Student rows come 20 per page; the page resets whenever the batch or date range changes.
  const rangeKey = `${batchId}|${from}|${to}`;
  const [pageState, setPageState] = useState({ key: rangeKey, page: 1 });
  const page = pageState.key === rangeKey ? pageState.page : 1;
  const { data, loading, error, reload } = useApi<RegisterResp>(batchId ? '/attendance/register' : null, { batchId, from, to, page });
  const [exporting, setExporting] = useState(false);

  const pickMonth = (m: string) => {
    if (!m || m > thisMonth) return;
    const r = monthRange(m);
    setFrom(r.from);
    setTo(r.to);
  };
  const shiftMonth = (delta: number) => {
    const base = parseYmd(`${month || monthOf(to)}-01`);
    base.setMonth(base.getMonth() + delta);
    pickMonth(monthOf(ymd(base)));
  };

  // CSV = every student row for the range (?all=1), not just the visible page.
  const exportCSV = async () => {
    if (!batchId) return;
    setExporting(true);
    try {
      const { data: full } = await api.get<RegisterResp>('/attendance/register', { params: { batchId, from, to, all: 1 } });
      downloadCSV(
        `attendance-${full.batch.name}-${full.from}-to-${full.to}`,
        full.students.map((s) => ({
          Code: s.studentCode,
          Name: s.name,
          ...Object.fromEntries(
            full.days.map((d, i) => [d.date, s.row[i] ? STATUS_META[s.row[i] as Status].short : d.marked ? '' : d.holiday ? `Holiday (${d.holiday})` : d.scheduled ? (d.future ? '' : 'Not marked') : 'No class']),
          ),
          'Attendance %': s.marked ? s.pct : '',
        })),
      );
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setExporting(false);
    }
  };

  const startsLater = data?.firstRecord && data.firstRecord > data.from;
  const noRecordsYet = data && !data.firstRecord;
  const beforeFirst = (d: RegisterDay) => !data?.firstRecord || d.date < data.firstRecord;

  return (
    <Card pad={false}>
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:flex-wrap sm:items-end sm:p-5">
        <Select label="Batch" value={batchId} onChange={(e) => setBatchId(e.target.value)} className="sm:min-w-[15rem] sm:flex-1 xl:max-w-xs">
          {batches.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
        </Select>
        <div>
          <span className="label">Month</span>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => shiftMonth(-1)} className="btn-secondary px-2.5 py-2.5" aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button>
            <input type="month" className="input w-40" value={month} max={thisMonth} onChange={(e) => pickMonth(e.target.value)} />
            <button type="button" onClick={() => shiftMonth(1)} disabled={(month || monthOf(to)) >= thisMonth} className="btn-secondary px-2.5 py-2.5 disabled:opacity-40" aria-label="Next month">
              <ChevronLeft className="h-4 w-4 rotate-180" />
            </button>
          </div>
        </div>
        <Input label="From" type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className="sm:w-40" />
        <Input label="To" type="date" value={to} min={from} max={ymd()} onChange={(e) => e.target.value && setTo(e.target.value > ymd() ? ymd() : e.target.value)} className="sm:w-40" />
        <div className="hidden flex-1 xl:block" />
        <Button variant="secondary" icon={<Download className="h-4 w-4" />} loading={exporting} onClick={exportCSV} disabled={!data?.studentPage.total}>Export CSV</Button>
      </div>

      {loading && !data ? (
        <div className="space-y-2 p-5">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9" />)}</div>
      ) : error ? (
        <div className="p-5"><ErrorState message={error} onRetry={reload} /></div>
      ) : !data ? null : !data.studentPage.total ? (
        <EmptyState icon={<Users className="h-7 w-7" />} title="No students in this batch" text="Add students to this batch to start taking attendance." />
      ) : (
        <div className={clsx('transition-opacity', loading && 'opacity-60')}>
          {(startsLater || noRecordsYet || (data.from !== from)) && (
            <div className="mx-5 mt-4 flex items-start gap-2 rounded-xl bg-sky-50 px-3 py-2.5 text-sm text-sky-800 ring-1 ring-sky-100">
              <CalendarDays className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {noRecordsYet
                  ? 'No attendance has been saved for this batch yet.'
                  : startsLater
                    ? <>Attendance for this batch has been recorded since <b>{fmtDate(parseYmd(data.firstRecord!))}</b>, so days before that are shown as “no record”.</>
                    : null}
                {data.from !== from && <> The register shows at most 3 months at a time — showing <b>{fmtDate(parseYmd(data.from))}</b> to <b>{fmtDate(parseYmd(data.to))}</b>.</>}
              </span>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 pt-4 text-xs text-slate-500">
            {(['present', 'absent', 'late'] as Status[]).map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5">
                <span className={clsx('grid h-5 w-5 place-items-center rounded font-bold', STATUS_META[k].cell)}>{STATUS_META[k].short}</span> {STATUS_META[k].label}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5"><span className="grid h-5 w-5 place-items-center rounded bg-amber-50 font-bold text-amber-500 ring-1 ring-inset ring-amber-200">!</span> Class day, not marked</span>
            <span className="inline-flex items-center gap-1.5"><span className="grid h-5 w-5 place-items-center rounded bg-slate-100 text-slate-400">–</span> No class</span>
            <span className="inline-flex items-center gap-1.5"><span className="grid h-5 w-5 place-items-center rounded bg-slate-300 font-bold text-white">H</span> Holiday</span>
            <span className="ml-auto font-medium text-slate-600">
              {data.summary.marked} of {data.summary.classDays} class days marked
              {data.summary.notMarked > 0 && <span className="text-amber-600"> · {data.summary.notMarked} not marked</span>}
              {' '}· {data.studentPage.total} students
            </span>
          </div>
          <div className="overflow-x-auto p-4 scrollbar-thin sm:p-5">
            <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-white px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Student</th>
                  {data.days.map((d) => {
                    const date = parseYmd(d.date);
                    const off = !d.scheduled && !d.marked;
                    return (
                      <th key={d.date} className={clsx('px-0.5 py-2 text-center text-[10px] font-semibold leading-tight', d.holiday ? 'bg-slate-100 text-slate-500' : off || d.future ? 'text-slate-300' : 'text-slate-500')}
                        title={`${fmtDate(date, { weekday: 'long', day: 'numeric', month: 'short' })}${d.holiday ? ` · Holiday: ${d.holiday}` : off ? ' · no class' : ''}`}>
                        <div className={clsx(date.getDate() === 1 && 'text-brand-600')}>{date.getDate()}</div>
                        <div className="font-medium">{d.weekday.slice(0, 2)}</div>
                      </th>
                    );
                  })}
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
                    {data.days.map((d, i) => {
                      const st = s.row[i];
                      let cls = 'bg-slate-50 text-slate-300';
                      let label = '·';
                      let title = 'Not marked';
                      if (st) {
                        cls = STATUS_META[st].cell;
                        label = STATUS_META[st].short;
                        title = STATUS_META[st].label;
                      } else if (d.future) {
                        label = '';
                        title = 'Upcoming';
                      } else if (d.marked) {
                        title = 'Not in this class';
                      } else if (d.holiday) {
                        cls = 'bg-slate-300 text-white';
                        label = 'H';
                        title = `Holiday: ${d.holiday}`;
                      } else if (!d.scheduled) {
                        cls = 'bg-slate-100/70 text-slate-300';
                        label = '–';
                        title = 'No class';
                      } else if (beforeFirst(d)) {
                        title = 'No record';
                      } else {
                        cls = 'bg-amber-50 text-amber-500 ring-1 ring-inset ring-amber-200';
                        label = '!';
                        title = 'Class day — attendance not marked';
                      }
                      return (
                        <td key={d.date} className="border-t border-slate-100 px-0.5 py-1.5 text-center group-hover:bg-slate-50">
                          <span title={`${fmtDate(parseYmd(d.date))}: ${title}`} className={clsx('mx-auto grid h-7 w-7 place-items-center rounded-md text-xs font-bold', cls)}>
                            {label}
                          </span>
                        </td>
                      );
                    })}
                    <td className={clsx('sticky right-0 z-10 border-t border-slate-100 bg-white px-3 py-1.5 text-right font-extrabold group-hover:bg-slate-50', s.marked ? pctTone(s.pct) : 'text-slate-300')}>
                      {s.marked ? `${s.pct}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager {...data.studentPage} onChange={(p) => setPageState({ key: rangeKey, page: p })} loading={loading} noun="students" />
        </div>
      )}
    </Card>
  );
}

/* ───────────────────────── Alerts ───────────────────────── */

function Alerts({ data, loading, error, reload, pager }: { data: AlertRow[] | null; loading: boolean; error: string | null; reload: () => void; pager: React.ReactNode }) {
  if (loading && !data) return <div className="grid gap-4 md:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36" />)}</div>;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data?.length) {
    return <Card><EmptyState icon={<CheckCheck className="h-7 w-7" />} title="No attendance alerts" text="No student has missed several classes in a row. Great job!" /></Card>;
  }
  return (
    <>
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
                <b>{fmtDate(parseYmd(a.since), { day: 'numeric', month: 'short' })}</b>
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
    {pager}
    </>
  );
}
