import { CalendarClock, Check, Clock, DoorOpen, Layers, Pencil, Plus, Trash2, Trophy, User, Users, X } from 'lucide-react';
import { useEffect, useState, type FormEvent, type MouseEvent } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { Button, Card, ConfirmDialog, EmptyState, ErrorState, Input, Modal, PageHeader, Progress, SearchInput, Select, Skeleton, Toggle, clsx } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useApi, useDebounced, usePagedApi } from '../../hooks/useApi';
import { Pager } from '../../components/Pager';
import { api, errMsg } from '../../lib/api';
import { DAYS, fmtDateTime, fmtTime, pctTone } from '../../lib/format';
import type { Batch as BaseBatch } from '../../lib/types';

/** Batch as returned by /batches (co-teachers = other subject teachers). */
type Batch = BaseBatch & { coTeachers?: { _id: string; name: string }[]; coTeacherIds?: ({ _id: string; name: string } | string)[] };
type SaveResp = Batch & { warnings?: string[] };

/** Light student row from /students/options and /batches/:id/members. */
type StudentOpt = { _id: string; name: string; studentCode: string; status: 'active' | 'inactive' };
type TeacherOpt = { _id: string; name: string; subjects?: string[] };

const BATCH_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#10b981', '#14b8a6', '#0ea5e9', '#64748b'];

const teacherIdOf = (b?: Batch | null) => {
  const t = b?.teacher ?? b?.teacherId;
  return !t ? '' : typeof t === 'string' ? t : t._id;
};
const coTeachersOf = (b?: Batch | null): { _id: string; name: string }[] =>
  b?.coTeachers ?? (b?.coTeacherIds ?? []).filter((x): x is { _id: string; name: string } => typeof x === 'object' && !!x);
const errCode = (e: unknown) => (e as { response?: { data?: { code?: string } } })?.response?.data?.code;

/** "Also: A, B" line for a batch's other subject teachers. */
export function CoTeachers({ list, className }: { list: { _id: string; name: string }[]; className?: string }) {
  if (!list.length) return null;
  return <span className={clsx('text-xs text-slate-500', className)}>with {list.map((t) => t.name).join(', ')}</span>;
}

function DayChips({ days, size = 'sm' }: { days: string[]; size?: 'sm' | 'md' }) {
  return (
    <div className="flex gap-1">
      {DAYS.map((d) => {
        const on = days.includes(d);
        return (
          <span key={d} className={clsx('grid place-items-center rounded-md font-bold', size === 'sm' ? 'h-6 w-7 text-[10px]' : 'h-8 w-10 text-xs',
            on ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-400')}>
            {d.slice(0, size === 'sm' ? 2 : 3)}
          </span>
        );
      })}
    </div>
  );
}

function BatchModal({ open, onClose, batch, onSaved }: { open: boolean; onClose: () => void; batch: Batch | null; onSaved: () => void }) {
  const editing = !!batch;
  const { data: teachers } = useApi<TeacherOpt[]>(open ? '/teachers/options' : null);
  const [f, setF] = useState<Record<string, string>>({});
  const [days, setDays] = useState<string[]>([]);
  const [color, setColor] = useState(BATCH_COLORS[0]);
  const [coIds, setCoIds] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  // Full selected set (server replaces membership with exactly this list on save).
  const [picked, setPicked] = useState<StudentOpt[]>([]);
  // In edit mode, membership is only submitted once the current members have loaded.
  const [membersReady, setMembersReady] = useState(false);
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 250);
  const { data: results, loading: searching } = useApi<StudentOpt[]>(open ? '/students/options' : null, { search: dq || undefined, status: 'active' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setF({
      name: batch?.name ?? '', course: batch?.course ?? '', subject: batch?.subject ?? '', teacherId: teacherIdOf(batch),
      startTime: batch?.startTime ?? '17:00', endTime: batch?.endTime ?? '18:00', room: batch?.room ?? '', capacity: batch?.capacity ? String(batch.capacity) : '',
    });
    setDays(batch?.days ?? ['Mon', 'Wed', 'Fri']);
    setCoIds(coTeachersOf(batch).map((t) => t._id));
    setActive(batch?.active ?? true);
    setColor(batch?.color ?? BATCH_COLORS[Math.floor(Math.random() * BATCH_COLORS.length)]);
    setQ('');
    setPicked([]);
    setMembersReady(!batch);
  }, [open, batch]);

  // Pre-select current members (edit mode) — includes inactive ones so saving doesn't drop them.
  useEffect(() => {
    if (!open || !batch) return;
    let live = true;
    api.get<StudentOpt[]>(`/batches/${batch._id}/members`)
      .then(({ data }) => {
        if (!live) return;
        setPicked((p) => [...data, ...p.filter((x) => !data.some((m) => m._id === x._id))]);
        setMembersReady(true);
      })
      .catch((err) => live && toast.error(errMsg(err)));
    return () => { live = false; };
  }, [open, batch]);

  const set = (k: string) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
  const toggleDay = (d: string) => setDays((p) => (p.includes(d) ? p.filter((x) => x !== d) : DAYS.filter((x) => x === d || p.includes(x))));
  const isPicked = (id: string) => picked.some((x) => x._id === id);
  const toggleStudent = (s: StudentOpt) => setPicked((p) => (p.some((x) => x._id === s._id) ? p.filter((x) => x._id !== s._id) : [...p, s]));
  const shown = results ?? [];

  // Keep the teacher dropdown able to show the current teacher even if they're no longer in the active list.
  const currentTeacher = batch?.teacher ?? (batch && typeof batch.teacherId === 'object' ? batch.teacherId : null);
  const teacherOpts: TeacherOpt[] = teachers
    ? [...teachers, ...(currentTeacher && !teachers.some((t) => t._id === currentTeacher._id) ? [{ _id: currentTeacher._id, name: currentTeacher.name }] : [])]
    : currentTeacher ? [{ _id: currentTeacher._id, name: currentTeacher.name }] : [];
  // Co-teachers: every teacher option except the lead (keep current co-teachers visible even if inactive now).
  const currentCo = coTeachersOf(batch);
  const coOpts: TeacherOpt[] = [
    ...teacherOpts,
    ...currentCo.filter((c) => !teacherOpts.some((t) => t._id === c._id)),
  ].filter((t) => t._id !== f.teacherId);
  const toggleCo = (id: string) => setCoIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) return toast.error('Batch name is required');
    if (!days.length) return toast.error('Pick at least one day');
    if (!f.startTime || !f.endTime) return toast.error('Enter both start and end time');
    if (f.endTime <= f.startTime) return toast.error('End time must be after start time');
    const cap = f.capacity ? Number(f.capacity) : 0;
    if (f.capacity && (!Number.isInteger(cap) || cap < 1 || cap > 1000)) return toast.error('Capacity must be a whole number between 1 and 1000');
    if (cap && membersReady && picked.length > cap) return toast.error(`This batch has room for ${cap} students — you selected ${picked.length}.`);
    setSaving(true);
    const body: Record<string, unknown> = {
      name: f.name.trim(), course: f.course, subject: f.subject, teacherId: f.teacherId || (editing ? null : undefined),
      coTeacherIds: coIds.filter((x) => x !== f.teacherId),
      days, startTime: f.startTime, endTime: f.endTime, room: f.room, color,
      ...(f.capacity ? { capacity: cap } : editing ? { capacity: '' } : {}),
      ...(editing && { active }),
      ...(membersReady && { studentIds: picked.map((x) => x._id) }),
    };
    try {
      const { data } = editing ? await api.put<SaveResp>(`/batches/${batch!._id}`, body) : await api.post<SaveResp>('/batches', body);
      toast.success(editing ? 'Batch updated' : 'Batch created');
      // Time / room clashes don't block saving — show each one so the owner can decide.
      for (const w of data?.warnings ?? []) toast(w, { icon: '⚠️', duration: 6000 });
      onSaved();
      onClose();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="lg" title={editing ? 'Edit batch' : 'Create batch'} subtitle="Schedule, teacher and students"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="batch-form" loading={saving}>{editing ? 'Save changes' : 'Create batch'}</Button></>}>
      <form id="batch-form" onSubmit={submit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Batch name *" value={f.name ?? ''} onChange={set('name')} placeholder="e.g. Class 10 Maths — A" autoFocus className="sm:col-span-2" />
          <Input label="Course" value={f.course ?? ''} onChange={set('course')} placeholder="e.g. Class 10" />
          <Input label="Subject" value={f.subject ?? ''} onChange={set('subject')} placeholder="e.g. Mathematics" />
          <Select label="Teacher" value={f.teacherId ?? ''} onChange={set('teacherId')} className="sm:col-span-2">
            <option value="">Unassigned</option>
            {teacherOpts.map((t) => (
              <option key={t._id} value={t._id}>{t.name}{t.subjects?.length ? ` — ${t.subjects.join(', ')}` : ''}</option>
            ))}
          </Select>
          <div className="sm:col-span-2">
            <span className="label">Other teachers <span className="font-normal text-slate-400">(optional — e.g. one per subject)</span></span>
            {!teachers && !currentCo.length ? <Skeleton className="h-9 w-full" /> : coOpts.length === 0 ? (
              <p className="text-sm text-slate-400">No other teachers to add.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {coOpts.map((t) => {
                  const on = coIds.includes(t._id);
                  return (
                    <button type="button" key={t._id} onClick={() => toggleCo(t._id)} aria-pressed={on}
                      className={clsx('inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                        on ? 'border-brand-600 bg-brand-600 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300')}>
                      {on && <Check className="h-3 w-3" />}
                      {t.name}{t.subjects?.length ? <span className={on ? 'text-white/80' : 'text-slate-400'}> · {t.subjects.join(', ')}</span> : null}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div>
          <span className="label">Days</span>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((d) => (
              <button type="button" key={d} onClick={() => toggleDay(d)}
                className={clsx('h-10 w-12 rounded-xl border text-sm font-bold transition',
                  days.includes(d) ? 'border-brand-600 bg-brand-600 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300')}>
                {d}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Input label="Start time" type="time" value={f.startTime ?? ''} onChange={set('startTime')} />
          <Input label="End time" type="time" value={f.endTime ?? ''} onChange={set('endTime')} />
          <Input label="Room" value={f.room ?? ''} onChange={set('room')} placeholder="Room 1" />
          <Input label="Capacity" type="number" min={1} value={f.capacity ?? ''} onChange={set('capacity')} placeholder="40" />
        </div>

        {editing && (
          <Toggle checked={active} onChange={setActive} label="Active"
            description="Inactive batches are hidden from attendance and scheduling; their history stays in reports." />
        )}

        <div>
          <span className="label">Colour</span>
          <div className="flex flex-wrap gap-2">
            {BATCH_COLORS.map((c) => (
              <button type="button" key={c} onClick={() => setColor(c)} aria-label={c}
                className={clsx('grid h-9 w-9 place-items-center rounded-full transition', color === c ? 'ring-2 ring-offset-2' : 'hover:scale-110')}
                style={{ background: c, ['--tw-ring-color' as string]: c }}>
                {color === c && <Check className="h-4 w-4 text-white" />}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="label mb-0">Students</span>
            <span className="text-xs font-semibold text-brand-700">{picked.length} selected{f.capacity ? ` / ${f.capacity}` : ''}</span>
          </div>
          {!membersReady ? (
            <Skeleton className="mb-2 h-8 w-full" />
          ) : picked.length > 0 && (
            <div className="mb-2 flex max-h-32 flex-wrap gap-1.5 overflow-y-auto scrollbar-thin">
              {picked.map((s) => (
                <span key={s._id} className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 py-0.5 pl-2.5 pr-1 text-xs font-semibold text-brand-700">
                  <span className="max-w-[160px] truncate">{s.name}</span>
                  {s.status === 'inactive' && <span className="text-amber-600">· Inactive</span>}
                  <button type="button" onClick={() => toggleStudent(s)} className="rounded-full p-0.5 hover:bg-brand-100" aria-label={`Remove ${s.name}`}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <SearchInput value={q} onChange={setQ} placeholder="Search students by name or code…" />
          <div className={clsx('mt-2 max-h-60 overflow-y-auto rounded-xl border border-slate-200 scrollbar-thin', searching && results && 'opacity-60')}>
            {!results ? (
              <div className="space-y-2 p-3">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-8" />)}</div>
            ) : shown.length === 0 ? (
              <p className="p-4 text-center text-sm text-slate-400">No students found</p>
            ) : (
              <>
                <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white/95 px-3 py-2 text-xs backdrop-blur">
                  <button type="button" className="font-semibold text-brand-700" onClick={() => setPicked((p) => [...p, ...shown.filter((s) => !p.some((x) => x._id === s._id))])}>Select all shown</button>
                  <button type="button" className="font-semibold text-slate-500" onClick={() => setPicked((p) => p.filter((x) => !shown.some((s) => s._id === x._id)))}>Clear shown</button>
                </div>
                {shown.map((s) => (
                  <label key={s._id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50">
                    <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={isPicked(s._id)} onChange={() => toggleStudent(s)} />
                    <span className="flex-1 truncate font-medium text-slate-800">{s.name}</span>
                    <span className="text-xs text-slate-400">{s.status === 'inactive' && <span className="mr-1 text-amber-600">Inactive ·</span>}{s.studentCode}</span>
                  </label>
                ))}
                {shown.length >= 20 && <p className="px-3 py-2 text-center text-xs text-slate-400">Showing the first 20 matches — type to narrow down.</p>}
              </>
            )}
          </div>
        </div>
      </form>
    </Modal>
  );
}

export default function Batches() {
  const { session } = useAuth();
  const isOwner = session?.user.role === 'owner';
  const nav = useNavigate();
  const [search, setSearch] = useState('');
  const dq = useDebounced(search.trim(), 300);
  // Search runs on the server (name, subject, course, room), 20 batches per page.
  const { data, loading, error, reload, pager, page, setPage } = usePagedApi<Batch>('/batches', { search: dq || undefined });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Batch | null>(null);
  const [del, setDel] = useState<Batch | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Server refused the delete because the batch has history (HAS_HISTORY) — offer "mark inactive" instead.
  const [delBlocked, setDelBlocked] = useState<string | null>(null);

  const items = data?.items ?? [];
  const list = items;
  // Enrolments can only be summed exactly when every batch is on this one page.
  const totalStudents = data && data.pages <= 1 && !dq ? items.reduce((s, b) => s + (b.studentCount ?? 0), 0) : null;

  const open = (b: Batch | null) => { setEditing(b); setFormOpen(true); };
  const stop = (fn: () => void) => (e: MouseEvent) => { e.stopPropagation(); fn(); };

  const remove = async () => {
    if (!del) return;
    setDeleting(true);
    try {
      await api.delete(`/batches/${del._id}`);
      toast.success('Batch deleted');
      setDel(null);
      if (items.length === 1 && page > 1) setPage(page - 1);
      else reload();
    } catch (e) {
      if (errCode(e) === 'HAS_HISTORY') setDelBlocked(errMsg(e));
      else toast.error(errMsg(e));
    } finally {
      setDeleting(false);
    }
  };

  const deactivate = async () => {
    if (!del) return;
    setDeleting(true);
    try {
      await api.put(`/batches/${del._id}`, { active: false });
      toast.success(`${del.name} marked inactive`);
      setDel(null);
      setDelBlocked(null);
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setDeleting(false);
    }
  };
  const closeDel = () => { setDel(null); setDelBlocked(null); };

  return (
    <div>
      <PageHeader title="Batches"
        subtitle={data ? `${data.total} batch${data.total === 1 ? '' : 'es'}${totalStudents != null ? ` · ${totalStudents} enrolments` : ''}` : isOwner ? 'Organise classes, timings and teachers.' : 'Your batches'}
        actions={isOwner && <Button icon={<Plus className="h-4 w-4" />} onClick={() => open(null)}>Create batch</Button>} />

      {((data?.total ?? 0) > 3 || !!search) && <SearchInput value={search} onChange={setSearch} placeholder="Search batches, subjects, rooms…" className="mb-5 max-w-md" />}

      {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-72" />)}</div>
      ) : list.length === 0 ? (
        <Card>
          <EmptyState icon={<Layers className="h-7 w-7" />} title={data?.total ? 'No batches match' : 'No batches yet'}
            text={data?.total ? 'Try a different search.' : isOwner ? 'Create your first batch to start marking attendance and scheduling tests.' : 'You have not been assigned any batches yet.'}
            action={isOwner && !data?.total && <Button icon={<Plus className="h-4 w-4" />} onClick={() => open(null)}>Create batch</Button>} />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((b) => {
            const cap = b.capacity ?? 0;
            const count = b.studentCount ?? 0;
            return (
              <div key={b._id} role="button" tabIndex={0} onClick={() => nav(`/app/batches/${b._id}`)} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); nav(`/app/batches/${b._id}`); } }}
                className={clsx('card group relative cursor-pointer overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md', !b.active && 'opacity-70')}>
                <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${b.color}, ${b.color}99)` }} />
                <div className="card-pad">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-lg font-bold text-slate-900">{b.name}</h3>
                      <p className="truncate text-sm text-slate-500">{[b.course, b.subject].filter(Boolean).join(' · ') || '—'}</p>
                    </div>
                    {isOwner && (
                      <div className="flex shrink-0 gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
                        <button onClick={stop(() => open(b))} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Edit"><Pencil className="h-4 w-4" /></button>
                        <button onClick={stop(() => setDel(b))} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                    <User className="h-4 w-4 text-slate-400" />
                    <span className="min-w-0 truncate">
                      {b.teacher?.name ?? <span className="text-amber-600">No teacher assigned</span>}
                      {coTeachersOf(b).length > 0 && <CoTeachers list={coTeachersOf(b)} className="ml-1" />}
                    </span>
                  </div>

                  <div className="mt-4"><DayChips days={b.days} /></div>

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
                    <span className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-slate-400" />{fmtTime(b.startTime)} – {fmtTime(b.endTime)}</span>
                    {b.room && <span className="flex items-center gap-1.5"><DoorOpen className="h-4 w-4 text-slate-400" />{b.room}</span>}
                  </div>

                  <div className="mt-4">
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 font-semibold text-slate-600"><Users className="h-3.5 w-3.5" />{count}{cap ? ` / ${cap}` : ''} students</span>
                      {cap > 0 && <span className="text-slate-400">{Math.round((count / cap) * 100)}% full</span>}
                    </div>
                    <Progress value={cap ? (count / cap) * 100 : count ? 100 : 0} tone="brand" />
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase text-slate-400">Attendance</p>
                      <p className={clsx('text-base font-extrabold', pctTone(b.attendancePct))}>{b.attendancePct != null ? `${b.attendancePct}%` : '—'}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className="flex items-center gap-1 text-[11px] font-semibold uppercase text-slate-400"><Trophy className="h-3 w-3" />Avg score</p>
                      <p className={clsx('text-base font-extrabold', pctTone(b.avgScore))}>{b.avgScore != null ? `${b.avgScore}%` : '—'}</p>
                    </div>
                  </div>

                  {b.nextClassAt && (
                    <div className="mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold" style={{ background: `${b.color}12`, color: b.color }}>
                      <CalendarClock className="h-4 w-4" /> Next class · {fmtDateTime(b.nextClassAt)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {pager && <Card pad={false} className="mt-4 overflow-hidden"><Pager {...pager} noun="batches" /></Card>}

      {isOwner && <>
        <BatchModal open={formOpen} onClose={() => setFormOpen(false)} batch={editing} onSaved={reload} />
        {delBlocked ? (
          <ConfirmDialog open={!!del} onClose={closeDel} onConfirm={del?.active === false ? closeDel : deactivate} loading={deleting} confirmLabel={del?.active === false ? 'OK' : 'Mark inactive'}
            title={`Can't delete ${del?.name ?? 'batch'}`} text={delBlocked} />
        ) : (
          <ConfirmDialog open={!!del} onClose={closeDel} onConfirm={remove} loading={deleting} danger confirmLabel="Delete batch"
            title={`Delete ${del?.name ?? 'batch'}?`}
            text="Students will be removed from this batch (they won't be deleted). Batches with attendance or test history can't be deleted — mark them inactive instead." />
        )}
      </>}
    </div>
  );
}
