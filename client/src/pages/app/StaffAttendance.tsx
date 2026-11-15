import { CalendarDays, ChevronLeft, ChevronRight, Clock, Download, Fingerprint, LogIn, MapPin, Pencil, Settings2, Timer, Trash2, UserX, Users } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { useSearchParams } from 'react-router-dom';
import {
  Avatar, Badge, Button, Card, EmptyState, ErrorState, Input, Modal, PageHeader, Select, Skeleton, StatCard, Tabs, Toggle, clsx,
} from '../../components/ui';
import { useSocketEvent } from '../../context/RealtimeContext';
import { useApi, useClientPage } from '../../hooks/useApi';
import { Pager } from '../../components/Pager';
import { api, errMsg } from '../../lib/api';
import { downloadCSV, fmtDate, fmtTime, ymd } from '../../lib/format';
import {
  clock, dayState, fmtMins, hhmm, mapsLink, monthKey, monthName, shiftMonth, type StaffRow, type StaffSettings, type StaffTotals,
} from '../../lib/staff';

interface DayItem { teacher: { _id: string; name: string; phone?: string; subjects?: string[] }; row: StaffRow | null; liveMinutes: number | null }
interface DayResp {
  date: string; isToday: boolean; settings: StaffSettings; items: DayItem[];
  summary: { total: number; checkedIn: number; working: number; checkedOut: number; late: number; leave: number; notIn: number };
}
interface MonthCell { status: StaffRow['status']; late?: boolean; earlyLeave?: boolean; minutes?: number; in: string | null; out: string | null }
interface MonthResp {
  month: string; label: string; days: number; holidays: { date: string; name: string }[];
  teachers: { teacher: { _id: string; name: string }; totals: StaffTotals; days: Record<string, MonthCell> }[];
}

type Tab = 'day' | 'month';
interface EditTarget { teacherId: string; name: string; date: string; status?: StaffRow['status']; in?: string; out?: string; note?: string; id?: string }

const addDay = (date: string, n: number) => {
  const [y, m, d] = date.split('-').map(Number);
  return ymd(new Date(y, m - 1, d + n));
};

export default function StaffAttendance() {
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>(params.get('tab') === 'month' ? 'month' : 'day');
  const [edit, setEdit] = useState<EditTarget | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);

  const switchTab = (t: Tab) => {
    setTab(t);
    const p = new URLSearchParams(params);
    p.set('tab', t);
    setParams(p, { replace: true });
  };

  return (
    <div>
      <PageHeader title="Staff check-in" subtitle="Teacher check-in / check-out times, late arrivals and working hours"
        actions={<Button variant="secondary" icon={<Settings2 className="h-4 w-4" />} onClick={() => setSettingsOpen(true)}>Timings</Button>} />
      <Tabs<Tab> className="mb-5" value={tab} onChange={switchTab} tabs={[
        { value: 'day', label: <><Clock className="h-4 w-4" /> Daily</> },
        { value: 'month', label: <><CalendarDays className="h-4 w-4" /> Monthly report</> },
      ]} />
      {tab === 'day' ? <DayView key={tick} onEdit={setEdit} /> : <MonthView key={tick} onEdit={setEdit} />}
      <EditModal target={edit} onClose={() => setEdit(null)} onSaved={refresh} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} onSaved={refresh} />
    </div>
  );
}

/* ─────────────────────────── Daily ─────────────────────────── */

function DayView({ onEdit }: { onEdit: (t: EditTarget) => void }) {
  const [params, setParams] = useSearchParams();
  const today = ymd();
  const date = params.get('date') && /^\d{4}-\d{2}-\d{2}$/.test(params.get('date')!) && params.get('date')! <= today ? params.get('date')! : today;
  const setDate = (d: string) => {
    const p = new URLSearchParams(params);
    if (d === today) p.delete('date');
    else p.set('date', d);
    setParams(p, { replace: true });
  };
  const { data, loading, error, reload } = useApi<DayResp>('/staff-attendance/day', { date });
  const dayPage = useClientPage(data?.items, date);

  // Live: a teacher checks in / out → refresh this day.
  useSocketEvent<{ date?: string }>('staff:attendance', (row) => {
    if (!row?.date || row.date === date) reload();
  });
  // Keep "working for 3h 12m" ticking while the page is open.
  useEffect(() => {
    if (date !== today) return;
    const t = setInterval(reload, 60_000);
    return () => clearInterval(t);
  }, [date, today, reload]);

  const s = data?.summary;
  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => setDate(addDay(date, -1))} aria-label="Previous day"><ChevronLeft className="h-4 w-4" /></Button>
        <input type="date" className="input w-auto" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} />
        <Button variant="secondary" size="sm" disabled={date >= today} onClick={() => setDate(addDay(date, 1))} aria-label="Next day"><ChevronRight className="h-4 w-4" /></Button>
        {date !== today && <Button variant="ghost" size="sm" onClick={() => setDate(today)}>Today</Button>}
        <span className="ml-auto text-sm font-semibold text-slate-500">{fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
      </div>

      {error ? <ErrorState message={error} onRetry={reload} /> : !data ? (
        <div className="space-y-4"><div className="grid gap-4 sm:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28" />)}</div><Skeleton className="h-72" /></div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Checked in" value={`${s!.checkedIn}/${s!.total}`} icon={<LogIn className="h-5 w-5" />} tone="green"
              hint={data.isToday ? `${s!.working} working right now` : `${s!.checkedOut} checked out`} />
            <StatCard label="Late arrivals" value={s!.late} icon={<Timer className="h-5 w-5" />} tone="amber"
              hint={`After ${fmtTime(data.settings.startTime)} + ${data.settings.graceMins} min`} />
            <StatCard label="On leave" value={s!.leave} icon={<CalendarDays className="h-5 w-5" />} tone="sky" />
            <StatCard label={data.isToday ? 'Not in yet' : 'No record'} value={s!.notIn} icon={<UserX className="h-5 w-5" />} tone="rose" />
          </div>

          <Card pad={false} className="mt-6 overflow-hidden">
            {data.items.length === 0 ? (
              <EmptyState icon={<Users className="h-7 w-7" />} title="No active teachers" text="Add teachers first — they check in from their own login." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-3">Teacher</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3">Check-in</th>
                      <th className="px-3 py-3">Check-out</th>
                      <th className="px-3 py-3">Hours</th>
                      <th className="px-3 py-3">Location</th>
                      <th className="px-5 py-3 text-right" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading && !data ? null : dayPage.items.map(({ teacher, row, liveMinutes }) => {
                      const st = dayState(row, !data.isToday);
                      const inMap = mapsLink(row?.checkInGeo);
                      const outMap = mapsLink(row?.checkOutGeo);
                      return (
                        <tr key={teacher._id} className="hover:bg-slate-50/60">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              <Avatar name={teacher.name} size="sm" />
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-slate-900">{teacher.name}</p>
                                <p className="truncate text-xs text-slate-400">{teacher.subjects?.join(', ') || teacher.phone || ''}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <Badge tone={st.tone}>{st.key === 'working' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />}{st.label}</Badge>
                            {row?.editedAt && <span className="ml-1.5 text-[10px] font-semibold uppercase text-slate-400" title={row.ownerNote || 'Edited by owner'}>edited</span>}
                          </td>
                          <td className="px-3 py-3">
                            <span className="font-semibold text-slate-800">{clock(row?.checkIn)}</span>
                            {row?.late && <Badge tone="amber" className="ml-2">+{row.lateBy}m late</Badge>}
                          </td>
                          <td className="px-3 py-3">
                            <span className="font-semibold text-slate-800">{clock(row?.checkOut)}</span>
                            {row?.earlyLeave && <Badge tone="amber" className="ml-2">early</Badge>}
                          </td>
                          <td className="px-3 py-3 font-semibold text-slate-800">
                            {liveMinutes != null ? <span className="text-emerald-700">{fmtMins(liveMinutes)}…</span> : row?.checkOut ? fmtMins(row.minutes) : '—'}
                          </td>
                          <td className="px-3 py-3 text-xs">
                            {inMap || outMap ? (
                              <div className="flex gap-2">
                                {inMap && <a href={inMap} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand-600 hover:underline"><MapPin className="h-3 w-3" />In</a>}
                                {outMap && <a href={outMap} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand-600 hover:underline"><MapPin className="h-3 w-3" />Out</a>}
                              </div>
                            ) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <Button variant="ghost" size="sm" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => onEdit({
                              teacherId: teacher._id, name: teacher.name, date, id: row?._id, status: row?.status,
                              in: hhmm(row?.checkIn), out: hhmm(row?.checkOut), note: row?.ownerNote,
                            })}>{row ? 'Edit' : 'Add'}</Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <Pager {...dayPage.pager} noun="teachers" />
          </Card>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-400"><Fingerprint className="h-3.5 w-3.5" />Teachers check in from their own login (Dashboard → Check in). Times come from the server clock and update here live.</p>
        </>
      )}
    </>
  );
}

/* ─────────────────────────── Monthly ─────────────────────────── */

const CELL: Record<string, string> = {
  present: 'bg-emerald-500 text-white', late: 'bg-amber-400 text-white', leave: 'bg-sky-400 text-white', absent: 'bg-rose-500 text-white',
  half_day: 'bg-violet-400 text-white', missed: 'bg-white text-amber-600 ring-2 ring-inset ring-amber-400',
};

function MonthView({ onEdit }: { onEdit: (t: EditTarget) => void }) {
  const [month, setMonth] = useState(monthKey());
  const { data, error, reload } = useApi<MonthResp>('/staff-attendance/month', { month });
  useSocketEvent('staff:attendance', () => month === monthKey() && reload());
  const today = ymd();
  const holidays = new Map((data?.holidays ?? []).map((h) => [h.date, h.name]));

  const exportCsv = () => {
    if (!data) return;
    downloadCSV(`staff-attendance-${data.month}.csv`, data.teachers.flatMap(({ teacher, days }) =>
      Object.entries(days).sort(([a], [b]) => a.localeCompare(b)).map(([date, c]) => ({
        Teacher: teacher.name, Date: date, Status: c.status, 'Check-in': c.in ?? '', 'Check-out': c.out ?? '',
        Hours: c.minutes ? (c.minutes / 60).toFixed(2) : '', Late: c.late ? 'Yes' : '', 'Left early': c.earlyLeave ? 'Yes' : '',
      }))));
  };

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></Button>
        <span className="min-w-36 text-center font-bold text-slate-800">{monthName(month)}</span>
        <Button variant="secondary" size="sm" disabled={month >= monthKey()} onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month"><ChevronRight className="h-4 w-4" /></Button>
        <Button className="ml-auto" variant="secondary" size="sm" icon={<Download className="h-4 w-4" />} onClick={exportCsv} disabled={!data}>Export CSV</Button>
      </div>
      {error ? <ErrorState message={error} onRetry={reload} /> : !data ? <Skeleton className="h-96" /> : data.teachers.length === 0 ? (
        <Card><EmptyState icon={<Users className="h-7 w-7" />} title="No teachers yet" /></Card>
      ) : (
        <>
          <Card pad={false} className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Teacher</th>
                    <th className="px-3 py-3 text-center">Present</th>
                    <th className="px-3 py-3 text-center">Late</th>
                    <th className="px-3 py-3 text-center">Left early</th>
                    <th className="px-3 py-3 text-center">Leave</th>
                    <th className="px-3 py-3 text-center">Absent</th>
                    <th className="px-3 py-3 text-center">Missed check-out</th>
                    <th className="px-3 py-3 text-right">Total hours</th>
                    <th className="px-5 py-3 text-right">Avg / day</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.teachers.map(({ teacher, totals: t }) => (
                    <tr key={teacher._id}>
                      <td className="px-5 py-3"><div className="flex items-center gap-2.5"><Avatar name={teacher.name} size="sm" /><span className="font-semibold text-slate-900">{teacher.name}</span></div></td>
                      <td className="px-3 py-3 text-center font-bold text-emerald-700">{t.present}{t.halfDays ? <span className="text-xs font-medium text-slate-400"> ({t.halfDays}½)</span> : null}</td>
                      <td className={clsx('px-3 py-3 text-center font-bold', t.late ? 'text-amber-600' : 'text-slate-300')}>{t.late}</td>
                      <td className={clsx('px-3 py-3 text-center font-bold', t.earlyLeave ? 'text-amber-600' : 'text-slate-300')}>{t.earlyLeave}</td>
                      <td className={clsx('px-3 py-3 text-center font-bold', t.leave ? 'text-sky-600' : 'text-slate-300')}>{t.leave}</td>
                      <td className={clsx('px-3 py-3 text-center font-bold', t.absent ? 'text-rose-600' : 'text-slate-300')}>{t.absent}</td>
                      <td className={clsx('px-3 py-3 text-center font-bold', t.missedCheckout ? 'text-amber-600' : 'text-slate-300')}>{t.missedCheckout}</td>
                      <td className="px-3 py-3 text-right font-bold text-slate-900">{fmtMins(t.minutes)}</td>
                      <td className="px-5 py-3 text-right text-slate-600">{fmtMins(t.avgMinutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="mt-6" pad={false}>
            <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3 text-xs font-semibold text-slate-500">
              <span className="mr-auto text-sm font-bold text-slate-900">Day-by-day</span>
              {[['present', 'On time'], ['late', 'Late'], ['half_day', 'Half day'], ['leave', 'Leave'], ['absent', 'Absent'], ['missed', 'No check-out']].map(([k, l]) => (
                <span key={k} className="inline-flex items-center gap-1.5"><span className={clsx('h-3 w-3 rounded', CELL[k])} />{l}</span>
              ))}
            </div>
            <div className="overflow-x-auto p-4">
              <table className="border-separate border-spacing-1 text-[11px]">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-white pr-2 text-left font-semibold text-slate-500" />
                    {Array.from({ length: data.days }, (_, i) => {
                      const date = `${data.month}-${String(i + 1).padStart(2, '0')}`;
                      const [y, m] = data.month.split('-').map(Number);
                      const dow = new Date(y, m - 1, i + 1).getDay();
                      return <th key={i} className={clsx('w-7 text-center font-semibold', dow === 0 || holidays.has(date) ? 'text-rose-400' : 'text-slate-400')} title={holidays.get(date)}>{i + 1}</th>;
                    })}
                  </tr>
                </thead>
                <tbody>
                  {data.teachers.map(({ teacher, days }) => (
                    <tr key={teacher._id}>
                      <td className="sticky left-0 z-10 max-w-36 truncate bg-white pr-2 text-xs font-semibold text-slate-700">{teacher.name}</td>
                      {Array.from({ length: data.days }, (_, i) => {
                        const date = `${data.month}-${String(i + 1).padStart(2, '0')}`;
                        const c = days[date];
                        const future = date > today;
                        const kind = !c ? null : c.status === 'present' && c.in && !c.out && date < today ? 'missed' : c.status === 'present' && c.late ? 'late' : c.status;
                        const title = c ? `${fmtDate(date)} · ${c.status.replace('_', ' ')}${c.in ? ` · ${fmtTime(c.in)}` : ''}${c.out ? ` → ${fmtTime(c.out)}` : ''}${c.minutes ? ` (${fmtMins(c.minutes)})` : ''}` : fmtDate(date);
                        return (
                          <td key={i}>
                            <button disabled={future} title={title}
                              onClick={() => onEdit({ teacherId: teacher._id, name: teacher.name, date, status: c?.status, in: c?.in ?? '', out: c?.out ?? '' })}
                              className={clsx('grid h-7 w-7 place-items-center rounded-md font-bold transition', kind ? CELL[kind] : future ? 'bg-slate-50' : 'bg-slate-100 text-slate-300 hover:bg-slate-200')}>
                              {kind === 'leave' ? 'L' : kind === 'absent' ? 'A' : kind === 'half_day' ? '½' : kind ? (c?.minutes ? Math.round(c.minutes / 60) : '•') : ''}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-slate-400">Numbers are hours worked. Click any day to add or correct it.</p>
            </div>
          </Card>
        </>
      )}
    </>
  );
}

/* ─────────────────────────── Modals ─────────────────────────── */

function EditModal({ target, onClose, onSaved }: { target: EditTarget | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ status: 'present', in: '', out: '', note: '' });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (target) setF({ status: target.status ?? 'present', in: target.in || '', out: target.out || '', note: target.note ?? '' });
  }, [target]);
  const withTimes = f.status === 'present' || f.status === 'half_day';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!target) return;
    if (withTimes && !f.in) return toast.error('Enter the check-in time');
    setSaving(true);
    try {
      await api.put('/staff-attendance/entry', {
        teacherId: target.teacherId, date: target.date, status: f.status, ownerNote: f.note,
        ...(withTimes && { checkIn: f.in, checkOut: f.out || undefined }),
      });
      toast.success('Saved');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!target?.id) return;
    setSaving(true);
    try {
      await api.delete(`/staff-attendance/entry/${target.id}`);
      toast.success('Entry removed');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={!!target} onClose={onClose} title={target ? `${target.name}` : ''} subtitle={target ? fmtDate(target.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : ''}
      footer={<>
        {target?.id && <Button variant="ghost" className="mr-auto text-rose-600" icon={<Trash2 className="h-4 w-4" />} onClick={remove} disabled={saving}>Remove</Button>}
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" form="staff-edit" loading={saving}>Save</Button>
      </>}>
      <form id="staff-edit" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Select label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} className="sm:col-span-2">
          <option value="present">Present</option>
          <option value="half_day">Half day</option>
          <option value="leave">On leave</option>
          <option value="absent">Absent</option>
        </Select>
        {withTimes && (
          <>
            <Input label="Check-in time *" type="time" value={f.in} onChange={(e) => setF({ ...f, in: e.target.value })} />
            <Input label="Check-out time" type="time" value={f.out} onChange={(e) => setF({ ...f, out: e.target.value })} hint="Leave empty if still working" />
          </>
        )}
        <Input label="Note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="e.g. Forgot to check out" className="sm:col-span-2" maxLength={200} />
        <p className="text-xs text-slate-500 sm:col-span-2">Changes are saved in the audit log as edited by you.</p>
      </form>
    </Modal>
  );
}

function SettingsModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { data } = useApi<StaffSettings>(open ? '/staff-attendance/settings' : null);
  const [f, setF] = useState<StaffSettings | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open && data) setF(data); }, [open, data]);

  const save = async () => {
    if (!f) return;
    setSaving(true);
    try {
      await api.put('/staff-attendance/settings', f);
      toast.success('Timings saved');
      onSaved();
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Staff timings" subtitle="Used to flag late check-ins and early check-outs"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={saving} disabled={!f}>Save</Button></>}>
      {!f ? <Skeleton className="h-48" /> : (
        <div className="grid gap-4 sm:grid-cols-3">
          <Input label="Work starts" type="time" value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} />
          <Input label="Work ends" type="time" value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} />
          <Input label="Grace (minutes)" type="number" min={0} max={180} value={f.graceMins} onChange={(e) => setF({ ...f, graceMins: Number(e.target.value) })} />
          <div className="space-y-3 sm:col-span-3">
            <Toggle checked={f.notifyLate} onChange={(v) => setF({ ...f, notifyLate: v })} label="Notify me about late check-ins"
              description={`You get an alert when a teacher checks in after ${fmtTime(f.startTime)} + ${f.graceMins} min`} />
            <Toggle checked={f.captureLocation} onChange={(v) => setF({ ...f, captureLocation: v })} label="Record location on check-in / check-out"
              description="The teacher's phone asks for location permission; you can open it on Google Maps" />
          </div>
        </div>
      )}
    </Modal>
  );
}
