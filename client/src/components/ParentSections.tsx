import { BookOpenCheck, CalendarDays, CalendarOff, FolderOpen, Laptop, Plus, Timer } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { useApi, useClientPage } from '../hooks/useApi';
import { api, errMsg } from '../lib/api';
import { fmtDate, fmtDateTime, timeAgo, ymd } from '../lib/format';
import { noticeCategory } from '../lib/notice';
import { MaterialRow, type MaterialItem } from './MaterialRow';
import { Pager } from './Pager';
import { Badge, Button, Input, Modal, Progress, Textarea, clsx, type BadgeTone } from './ui';

/* Shared card shell, same look as the other portal sections. */
export function PortalSection({ id, title, icon, children, action, className }: { id?: string; title: string; icon: ReactNode; children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <section id={id} className={clsx('card card-pad scroll-mt-24', className)}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-bold text-slate-900"><span className="grid h-8 w-8 place-items-center rounded-xl bg-brand-50 text-brand-600">{icon}</span>{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/* ─────────────── Notice board: holidays, PTM, extra classes ─────────────── */

export interface PortalEvent { _id: string; title: string; body: string; category?: string; eventDate: string; eventEndDate?: string }
export function NoticeBoardSection({ holidays, events }: { holidays: { date: string; name: string }[]; events: PortalEvent[] }) {
  const items: { key: string; date: string; end?: string; emoji: string; label: string; title: string; body: string }[] = [
    ...holidays.map((h) => ({ key: `h-${h.date}`, date: h.date, emoji: '🏖️', label: 'Holiday', title: h.name, body: '' })),
    ...events.map((e) => {
      const c = noticeCategory(e.category);
      return { key: e._id, date: ymd(new Date(e.eventDate)), end: e.eventEndDate ? ymd(new Date(e.eventEndDate)) : undefined, emoji: c?.emoji ?? '📢', label: c?.label ?? 'Notice', title: e.title, body: e.body };
    }),
  ].sort((a, b) => a.date.localeCompare(b.date));
  return (
    <PortalSection id="notice-board" title="Notice board — holidays & events" icon={<CalendarDays className="h-4 w-4" />}>
      {items.length === 0 ? <p className="py-6 text-center text-sm text-slate-400">No upcoming holidays, PTMs or extra classes.</p> : (
        <ul className="space-y-2.5">
          {items.map((x) => (
            <li key={x.key} className="flex gap-3 rounded-2xl bg-slate-50 p-3">
              <div className="w-14 shrink-0 rounded-xl bg-white py-1.5 text-center shadow-sm">
                <p className="text-[10px] font-bold uppercase text-rose-500">{fmtDate(x.date, { month: 'short' })}</p>
                <p className="text-lg font-extrabold leading-none text-slate-900">{fmtDate(x.date, { day: 'numeric' })}</p>
                <p className="text-[10px] text-slate-400">{fmtDate(x.date, { weekday: 'short' })}</p>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-brand-600">{x.emoji} {x.label}{x.end && x.end !== x.date ? ` · till ${fmtDate(x.end, { day: 'numeric', month: 'short' })}` : ''}</p>
                <p className="text-sm font-bold text-slate-800">{x.title}</p>
                {x.body && <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{x.body}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </PortalSection>
  );
}

/* ─────────────── Syllabus progress ─────────────── */

export function SyllabusSection({ batches }: { batches: { _id: string; name: string; syllabus?: { total: number; done: number; recent: string[]; next: string | null } | null }[] }) {
  const withSyl = batches.filter((b) => b.syllabus?.total);
  if (!withSyl.length) return null;
  return (
    <PortalSection id="syllabus" title="Syllabus progress" icon={<BookOpenCheck className="h-4 w-4" />}>
      <ul className="space-y-4">
        {withSyl.map((b) => {
          const s = b.syllabus!;
          const pct = Math.round((s.done / s.total) * 100);
          return (
            <li key={b._id}>
              <div className="flex items-baseline justify-between text-sm"><span className="font-bold text-slate-800">{b.name}</span><span className="font-extrabold text-brand-700">{pct}%</span></div>
              <Progress value={pct} tone="brand" className="mt-1.5" />
              <p className="mt-1.5 text-xs text-slate-500">{s.done} of {s.total} topics covered{s.recent.length ? ` · Recently: ${s.recent.join(', ')}` : ''}{s.next ? ` · Next: ${s.next}` : ''}</p>
            </li>
          );
        })}
      </ul>
    </PortalSection>
  );
}

/* ─────────────── Study material ─────────────── */

export function MaterialsSection({ studentId }: { studentId: string }) {
  const { data } = useApi<MaterialItem[]>('/parent/materials', { studentId });
  const page = useClientPage(data, studentId);
  return (
    <PortalSection id="materials" title="Study material & assignments" icon={<FolderOpen className="h-4 w-4" />}>
      {!data ? <p className="py-6 text-center text-sm text-slate-400">Loading…</p> : data.length === 0 ? <p className="py-6 text-center text-sm text-slate-400">No notes or assignments shared yet.</p> : (
        <ul className="-mx-5 divide-y divide-slate-100 sm:-mx-6">{page.items.map((m) => <MaterialRow key={m._id} m={m} showBatches={false} />)}</ul>
      )}
      <Pager {...page.pager} noun="items" className="-mx-5 -mb-5 mt-4 sm:-mx-6 sm:-mb-6" />
    </PortalSection>
  );
}

/* ─────────────── Online tests ─────────────── */

interface OnlineTest {
  _id: string; subject: string; topic?: string; maxMarks: number; durationMins: number; opensAt?: string; closesAt?: string; batch?: string;
  questionCount: number; wrongPenalty: number; window: 'open' | 'upcoming' | 'closed'; published: boolean;
  attempt: { startedAt: string; deadline?: string; submittedAt?: string | null; score?: number } | null;
}
export function OnlineTestsSection({ studentId }: { studentId: string }) {
  const { data } = useApi<OnlineTest[]>('/parent/online-tests', { studentId });
  const page = useClientPage(data, studentId);
  if (!data?.length) return null;
  return (
    <PortalSection id="online-tests" title="Online tests" icon={<Laptop className="h-4 w-4" />}>
      <ul className="space-y-2.5">
        {page.items.map((t) => {
          const done = !!t.attempt?.submittedAt;
          const inProgress = t.attempt && !done;
          return (
            <li key={t._id} className={clsx('flex flex-wrap items-center gap-3 rounded-2xl border p-3.5', t.window === 'open' && !done ? 'border-brand-200 bg-brand-50/40' : 'border-slate-100')}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-800">{t.subject}{t.topic ? <span className="font-normal text-slate-500"> · {t.topic}</span> : null}</p>
                <p className="text-xs text-slate-500">
                  {t.questionCount} questions · {t.maxMarks} marks · <Timer className="inline h-3 w-3" /> {t.durationMins} min{t.wrongPenalty ? ` · −${t.wrongPenalty} per wrong` : ''}
                  {t.window === 'upcoming' && t.opensAt && ` · opens ${fmtDateTime(t.opensAt)}`}
                  {t.window === 'open' && t.closesAt && !done && ` · closes ${fmtDateTime(t.closesAt)}`}
                </p>
              </div>
              {done ? (
                t.published ? <Link to={`/portal/test/${t._id}?student=${studentId}&review=1`} className="btn-secondary btn-sm">Score {t.attempt!.score}/{t.maxMarks} · Review</Link>
                  : <Badge tone="green">Submitted · result soon</Badge>
              ) : t.window === 'open' && !t.published ? (
                <Link to={`/portal/test/${t._id}?student=${studentId}`} className="btn-primary btn-sm">{inProgress ? 'Continue test' : 'Start test'}</Link>
              ) : <Badge tone={t.window === 'upcoming' ? 'blue' : 'gray'}>{t.window === 'upcoming' ? 'Upcoming' : 'Closed'}</Badge>}
            </li>
          );
        })}
      </ul>
      <Pager {...page.pager} noun="tests" className="-mx-5 -mb-5 mt-4 sm:-mx-6 sm:-mb-6" />
    </PortalSection>
  );
}

/* ─────────────── Leave requests ─────────────── */

interface Leave { _id: string; from: string; to: string; reason: string; status: 'pending' | 'approved' | 'rejected' | 'cancelled'; reviewedByName?: string; reviewNote?: string; createdAt: string }
const LTONE: Record<Leave['status'], BadgeTone> = { pending: 'amber', approved: 'green', rejected: 'red', cancelled: 'gray' };

export function LeaveSection({ studentId, name }: { studentId: string; name: string }) {
  const { data, reload } = useApi<Leave[]>('/parent/leaves', { studentId });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ from: ymd(), to: ymd(), reason: '' });
  const [busy, setBusy] = useState(false);
  const page = useClientPage(data, studentId);

  const submit = async () => {
    setBusy(true);
    try {
      await api.post('/parent/leaves', { studentId, ...f });
      toast.success('Leave request sent to the teacher');
      setOpen(false);
      setF({ from: ymd(), to: ymd(), reason: '' });
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  const cancel = async (l: Leave) => {
    try {
      await api.post(`/parent/leaves/${l._id}/cancel`);
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  return (
    <PortalSection id="leave" title="Leave applications" icon={<CalendarOff className="h-4 w-4" />}
      action={<Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setOpen(true)}>Apply leave</Button>}>
      {!data?.length ? <p className="py-4 text-center text-sm text-slate-400">No leave requests. Use “Apply leave” if {name.split(' ')[0]} will miss classes.</p> : (
        <ul className="space-y-2">
          {page.items.map((l) => (
            <li key={l._id} className="rounded-2xl border border-slate-100 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold text-slate-800">{l.from === l.to ? fmtDate(l.from, { weekday: 'short', day: 'numeric', month: 'short' }) : `${fmtDate(l.from, { day: 'numeric', month: 'short' })} – ${fmtDate(l.to, { day: 'numeric', month: 'short' })}`}</p>
                <Badge tone={LTONE[l.status]} className="capitalize">{l.status}</Badge>
              </div>
              <p className="mt-0.5 text-slate-600">{l.reason}</p>
              <p className="mt-1 text-xs text-slate-400">
                Sent {timeAgo(l.createdAt)}{l.reviewedByName && ` · ${l.status} by ${l.reviewedByName}`}{l.reviewNote && ` — “${l.reviewNote}”`}
                {l.status === 'pending' && <button className="ml-2 font-semibold text-rose-600 hover:underline" onClick={() => cancel(l)}>Cancel</button>}
              </p>
            </li>
          ))}
        </ul>
      )}
      <Pager {...page.pager} noun="requests" className="-mx-5 -mb-5 mt-4 sm:-mx-6 sm:-mb-6" />
      <Modal open={open} onClose={() => setOpen(false)} size="sm" title={`Leave for ${name}`} subtitle="The teacher and institute are notified"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={busy} onClick={submit}>Send request</Button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="From" type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value, to: f.to < e.target.value ? e.target.value : f.to })} />
          <Input label="To" type="date" value={f.to} min={f.from} onChange={(e) => setF({ ...f, to: e.target.value })} />
          <Textarea label="Reason" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} rows={3} className="sm:col-span-2" placeholder="e.g. Fever, family function…" maxLength={500} />
        </div>
      </Modal>
    </PortalSection>
  );
}
