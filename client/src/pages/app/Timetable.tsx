import { BookOpenCheck, CalendarDays, CheckCircle2, Circle, Clock, MapPin, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Modal, PageHeader, Progress, Skeleton, clsx } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useApi, useClientPage } from '../../hooks/useApi';
import { Pager } from '../../components/Pager';
import { api, errMsg } from '../../lib/api';
import { fmtDate, fmtTime } from '../../lib/format';

interface Row {
  _id: string; name: string; color?: string; subject?: string; days: string[]; startTime: string; endTime: string; room?: string; teacher?: string; mine?: boolean;
  syllabus: { total: number; done: number; pct: number | null; next: string | null };
}
interface Topic { _id: string; title: string; subject?: string; plannedDate?: string; done: boolean; doneAt?: string; doneByName?: string }

const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const todayKey = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date().getDay()];

/** Weekly timetable of the user's batches + syllabus completion per batch. */
export default function Timetable() {
  const { session } = useAuth();
  const { data, error, reload } = useApi<Row[]>('/academics/syllabus');
  const sylPage = useClientPage(data);
  const [open, setOpen] = useState<Row | null>(null);

  return (
    <div>
      <PageHeader title={session?.user.role === 'teacher' ? 'My timetable & syllabus' : 'Timetable & syllabus'} subtitle="Weekly class schedule and how much of each batch's syllabus is finished" />
      {error ? <ErrorState message={error} onRetry={reload} /> : !data ? <Skeleton className="h-96" /> : data.length === 0 ? (
        <Card><EmptyState icon={<CalendarDays className="h-7 w-7" />} title="No active batches" /></Card>
      ) : (
        <>
          <Card pad={false} className="mb-6 overflow-x-auto">
            <div className="grid min-w-[840px] grid-cols-7 divide-x divide-slate-100">
              {WEEK.map((d) => {
                const classes = data.filter((b) => b.days.includes(d)).sort((a, b) => a.startTime.localeCompare(b.startTime));
                return (
                  <div key={d} className={clsx('min-h-48', d === todayKey && 'bg-brand-50/40')}>
                    <p className={clsx('border-b border-slate-100 px-3 py-2 text-center text-xs font-bold uppercase tracking-wide', d === todayKey ? 'text-brand-700' : 'text-slate-500')}>{d}{d === todayKey && ' · Today'}</p>
                    <div className="space-y-2 p-2">
                      {classes.map((b) => (
                        <button key={b._id} onClick={() => setOpen(b)} className="w-full rounded-xl p-2 text-left text-xs transition hover:brightness-95"
                          style={{ background: `${b.color ?? '#6366f1'}18`, borderLeft: `3px solid ${b.color ?? '#6366f1'}` }}>
                          <p className="font-bold text-slate-800">{fmtTime(b.startTime)}</p>
                          <p className="truncate font-semibold text-slate-700">{b.name}</p>
                          {b.room && <p className="truncate text-slate-500">{b.room}</p>}
                        </button>
                      ))}
                      {!classes.length && <p className="py-4 text-center text-[11px] text-slate-300">—</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card>
            <CardHeader title="Syllabus completion" subtitle="Tick topics as you finish them — parents see the progress" icon={<BookOpenCheck className="h-5 w-5" />} />
            <div className="grid gap-3 md:grid-cols-2">
              {sylPage.items.map((b) => (
                <button key={b._id} onClick={() => setOpen(b)} className="rounded-2xl border border-slate-200 p-4 text-left transition hover:border-brand-300 hover:shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: b.color ?? '#6366f1' }} />
                    <p className="flex-1 truncate font-semibold text-slate-900">{b.name}</p>
                    <span className="text-sm font-bold text-slate-700">{b.syllabus.total ? `${b.syllabus.pct}%` : '—'}</span>
                  </div>
                  <Progress value={b.syllabus.pct ?? 0} tone="brand" className="mt-2" />
                  <p className="mt-2 text-xs text-slate-500">
                    {b.syllabus.total ? `${b.syllabus.done} of ${b.syllabus.total} topics done${b.syllabus.next ? ` · Next: ${b.syllabus.next}` : ' · Completed 🎉'}` : 'No syllabus added yet — click to add topics'}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 text-[11px] text-slate-400">
                    <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{b.days.join(', ')} · {fmtTime(b.startTime)}–{fmtTime(b.endTime)}</span>
                    {b.room && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{b.room}</span>}
                    {b.teacher && <span>{b.teacher}</span>}
                  </p>
                </button>
              ))}
            </div>
            <Pager {...sylPage.pager} noun="batches" className="-mx-5 -mb-5 mt-4 sm:-mx-6 sm:-mb-6" />
          </Card>
        </>
      )}
      <SyllabusModal batch={open} onClose={() => { setOpen(null); reload(); }} />
    </div>
  );
}

function SyllabusModal({ batch, onClose }: { batch: Row | null; onClose: () => void }) {
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [text, setText] = useState('');
  const [subject, setSubject] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setTopics(null);
    setText('');
    if (!batch) return;
    setSubject(batch.subject ?? '');
    api.get<{ syllabus: Topic[] }>(`/academics/syllabus/${batch._id}`).then(({ data }) => setTopics(data.syllabus)).catch((e) => toast.error(errMsg(e)));
  }, [batch]);

  const run = async (fn: () => Promise<{ data: Topic[] }>) => {
    setBusy(true);
    try {
      setTopics((await fn()).data);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  const add = () => text.trim() && run(async () => {
    const r = await api.post<Topic[]>(`/academics/syllabus/${batch!._id}`, { titles: text.split('\n'), subject });
    setText('');
    return r;
  });
  const done = topics?.filter((t) => t.done).length ?? 0;

  return (
    <Modal open={!!batch} onClose={onClose} size="lg" title={`Syllabus · ${batch?.name ?? ''}`} subtitle={topics ? `${done} of ${topics.length} topics done` : ''}
      footer={<Button onClick={onClose}>Done</Button>}>
      {!topics ? <Skeleton className="h-48" /> : (
        <div className="space-y-4">
          {topics.length > 0 && <Progress value={topics.length ? (done / topics.length) * 100 : 0} tone="brand" />}
          <ul className="max-h-[45vh] space-y-1 overflow-y-auto">
            {topics.map((t) => (
              <li key={t._id} className="group flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-slate-50">
                <button disabled={busy} onClick={() => run(() => api.put(`/academics/syllabus/${batch!._id}/${t._id}`, { done: !t.done }))} className={t.done ? 'text-emerald-600' : 'text-slate-300 hover:text-slate-500'} aria-label="Toggle done">
                  {t.done ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
                </button>
                <span className={clsx('flex-1 text-sm', t.done ? 'text-slate-400 line-through' : 'text-slate-800')}>{t.title}</span>
                {t.subject && <Badge>{t.subject}</Badge>}
                {t.done && t.doneAt && <span className="text-[11px] text-slate-400">{fmtDate(t.doneAt, { day: 'numeric', month: 'short' })}{t.doneByName ? ` · ${t.doneByName}` : ''}</span>}
                <button className="rounded p-1 text-slate-300 opacity-0 hover:text-rose-600 group-hover:opacity-100" title="Remove" onClick={() => run(() => api.delete(`/academics/syllabus/${batch!._id}/${t._id}`))}><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
            {!topics.length && <li className="py-4 text-center text-sm text-slate-400">No topics yet. Add the chapters below.</li>}
          </ul>
          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="label">Add topics (one per line)</p>
            <textarea className="input text-sm" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Chapter 1 – Real Numbers\nChapter 2 – Polynomials'} />
            <div className="mt-2 flex gap-2">
              <input className="input w-40 py-1.5 text-sm" placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
              <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={add} loading={busy} disabled={!text.trim()}>Add</Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
