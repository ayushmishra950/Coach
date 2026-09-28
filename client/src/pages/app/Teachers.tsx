import { BookOpen, Check, Copy, GraduationCap, KeyRound, Mail, MoreVertical, Pencil, Phone, Plus, Power, UserCheck, Users } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Avatar, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Input, Modal, PageHeader, SearchInput, Skeleton, Tabs, clsx } from '../../components/ui';
import { useDebounced, usePagedApi } from '../../hooks/useApi';
import { Pager } from '../../components/Pager';
import { api, errMsg, isUpgradeError } from '../../lib/api';
import { fmtDate, inr, ymd } from '../../lib/format';
import type { Teacher as BaseTeacher } from '../../lib/types';

/** Teacher list item: each batch says whether they lead it or co-teach it. */
type Teacher = Omit<BaseTeacher, 'batches'> & { batches: { _id: string; name: string; color?: string; role?: 'lead' | 'co' }[] };
type UpdateResp = BaseTeacher & { unassignedBatches?: string[] };

const toastUnassigned = (names?: string[]) => {
  if (names?.length) toast(`Removed from: ${names.join(', ')} – assign a new teacher`, { icon: '⚠️', duration: 7000 });
};

type Creds = { email: string; password: string; title: string; reset?: boolean };

function CopyRow({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      toast.error('Copy failed');
    }
  };
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <p className="truncate font-mono text-sm font-semibold text-slate-900">{value}</p>
      </div>
      <Button variant="secondary" size="sm" onClick={copy} icon={done ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}>
        {done ? 'Copied' : 'Copy'}
      </Button>
    </div>
  );
}

function TeacherModal({ open, onClose, teacher, onSaved }: { open: boolean; onClose: () => void; teacher: Teacher | null; onSaved: (creds?: Creds) => void }) {
  const editing = !!teacher;
  const [f, setF] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setF({
      name: teacher?.name ?? '', email: teacher?.email ?? '', phone: teacher?.phone ?? '', subjects: teacher?.subjects?.join(', ') ?? '',
      qualification: teacher?.qualification ?? '', salary: teacher?.salary != null ? String(teacher.salary) : '',
      joiningDate: teacher ? (teacher.joiningDate ? ymd(new Date(teacher.joiningDate)) : '') : ymd(), password: '',
    });
  }, [open, teacher]);
  const set = (k: string) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) return toast.error('Name is required');
    if (!f.email.trim()) return toast.error('Email is required');
    if (!editing && f.password && f.password.length < 8) return toast.error('Password must be at least 8 characters');
    setSaving(true);
    const body: Record<string, unknown> = {
      name: f.name.trim(), phone: f.phone, qualification: f.qualification, joiningDate: f.joiningDate,
      subjects: f.subjects.split(',').map((x) => x.trim()).filter(Boolean),
      // When editing, an emptied salary is sent as '' so the server clears it.
      ...(f.salary !== '' ? { salary: Number(f.salary) } : editing ? { salary: '' } : {}),
    };
    try {
      if (editing) {
        const email = f.email.trim().toLowerCase();
        const { data } = await api.put<UpdateResp>(`/teachers/${teacher!._id}`, { ...body, ...(email !== teacher!.email && { email }) });
        toast.success(email !== teacher!.email ? 'Teacher updated — they now sign in with the new email' : 'Teacher updated');
        toastUnassigned(data?.unassignedBatches);
        onSaved();
      } else {
        const { data } = await api.post<{ teacher: Teacher; credentials: { email: string; password: string }; reactivated?: boolean }>('/teachers', {
          ...body, email: f.email.trim(), ...(f.password && { password: f.password }),
        });
        toast.success(data.reactivated ? `${data.teacher.name} was on your staff before — their account is active again` : `${data.teacher.name} added`);
        onSaved({ ...data.credentials, title: `Login for ${data.teacher.name}` });
      }
      onClose();
    } catch (err) {
      toast.error(errMsg(err));
      if (isUpgradeError(err)) onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit teacher' : 'Add teacher'} subtitle={editing ? teacher!.email : 'They will get their own login to mark attendance and enter marks.'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="teacher-form" loading={saving}>{editing ? 'Save changes' : 'Add teacher'}</Button></>}>
      <form id="teacher-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Input label="Full name *" value={f.name ?? ''} onChange={set('name')} placeholder="e.g. Neha Kapoor" autoFocus className="sm:col-span-2" />
        <Input label="Email (login) *" type="email" value={f.email ?? ''} onChange={set('email')} placeholder="teacher@example.com"
          hint={editing ? 'Changing this changes the email they sign in with.' : undefined} />
        <Input label="Phone" value={f.phone ?? ''} onChange={set('phone')} inputMode="tel" />
        <Input label="Subjects" value={f.subjects ?? ''} onChange={set('subjects')} placeholder="Physics, Chemistry" hint="Comma separated" className="sm:col-span-2" />
        <Input label="Qualification" value={f.qualification ?? ''} onChange={set('qualification')} placeholder="e.g. M.Sc Physics" />
        <Input label="Monthly salary (₹)" type="number" min={0} value={f.salary ?? ''} onChange={set('salary')} />
        <Input label="Joining date" type="date" value={f.joiningDate ?? ''} onChange={set('joiningDate')} />
        {!editing && <Input label="Password (optional)" value={f.password ?? ''} onChange={set('password')} placeholder="Auto-generated if blank" minLength={8} hint="At least 8 characters" />}
      </form>
    </Modal>
  );
}

function ActionsMenu({ t, onEdit, onReset, onToggle }: { t: Teacher; onEdit: () => void; onReset: () => void; onToggle: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  const item = (label: string, icon: JSX.Element, fn: () => void, danger?: boolean) => (
    <button onClick={() => { setOpen(false); fn(); }}
      className={clsx('flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium', danger ? 'text-rose-600 hover:bg-rose-50' : 'text-slate-700 hover:bg-slate-50')}>
      {icon}{label}
    </button>
  );
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Actions">
        <MoreVertical className="h-5 w-5" />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-48 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
          {item('Edit details', <Pencil className="h-4 w-4" />, onEdit)}
          {item('Reset password', <KeyRound className="h-4 w-4" />, onReset)}
          {t.active ? item('Deactivate', <Power className="h-4 w-4" />, onToggle, true) : item('Reactivate', <UserCheck className="h-4 w-4" />, onToggle)}
        </div>
      )}
    </div>
  );
}

type Filter = 'active' | 'inactive' | 'all';

export default function Teachers() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('active');
  const q = useDebounced(search.trim(), 300);
  // Search and the Active / Inactive / All tabs both run on the server — 20 teachers per page.
  const { data, loading, error, reload, pager } = usePagedApi<Teacher, { counts: { all: number; active: number; inactive: number } }>('/teachers', {
    search: q || undefined,
    status: filter,
  });
  const [editing, setEditing] = useState<Teacher | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [creds, setCreds] = useState<Creds | null>(null);
  const [confirm, setConfirm] = useState<{ t: Teacher; kind: 'deactivate' | 'reset' } | null>(null);
  const [busy, setBusy] = useState(false);

  const all = data?.items ?? [];
  const list = all;
  const counts = data?.counts;
  const activeCount = counts?.active ?? 0;
  const refresh = () => reload();

  const openForm = (t: Teacher | null) => { setEditing(t); setFormOpen(true); };

  const reactivate = async (t: Teacher) => {
    try {
      await api.put(`/teachers/${t._id}`, { active: true });
      toast.success(`${t.name} reactivated`);
      refresh();
    } catch (e) {
      // 402 = no free teacher seats on the current plan; the server message explains it.
      const status = (e as { response?: { status?: number } })?.response?.status;
      toast.error(errMsg(e, status === 402 ? 'Your plan has no free teacher seats. Upgrade or deactivate another teacher first.' : undefined), { duration: status === 402 ? 7000 : 4000 });
    }
  };

  const runConfirm = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.kind === 'deactivate') {
        const { data: r } = await api.delete<{ ok: boolean; unassignedBatches?: string[] }>(`/teachers/${confirm.t._id}`);
        toast.success(`${confirm.t.name} deactivated`);
        toastUnassigned(r?.unassignedBatches);
        refresh();
      } else {
        const { data: c } = await api.post<{ email: string; password: string }>(`/teachers/${confirm.t._id}/reset-password`);
        setCreds({ ...c, title: `New password for ${confirm.t.name}`, reset: true });
        toast.success('Password reset');
      }
      setConfirm(null);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Teachers" subtitle={counts ? `${activeCount} active teacher${activeCount === 1 ? '' : 's'} on your team` : 'Your teaching team'}
        actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => openForm(null)}>Add teacher</Button>} />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by name, subject, email…" className="flex-1" />
        <Tabs<Filter> value={filter} onChange={setFilter} tabs={[
          { value: 'active', label: 'Active', count: counts?.active },
          { value: 'inactive', label: 'Inactive', count: counts?.inactive },
          { value: 'all', label: 'All', count: counts?.all },
        ]} />
      </div>

      {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-60" />)}</div>
      ) : list.length === 0 ? (
        <Card>
          <EmptyState icon={<GraduationCap className="h-7 w-7" />} title={counts?.all ? 'No teachers match' : 'No teachers yet'}
            text={counts?.all ? 'Try a different search or filter.' : 'Add your teachers so they can mark attendance and enter test marks.'}
            action={!counts?.all && <Button icon={<Plus className="h-4 w-4" />} onClick={() => openForm(null)}>Add teacher</Button>} />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((t) => (
            <div key={t._id} className={clsx('card card-pad flex flex-col transition hover:shadow-md', !t.active && 'opacity-70')}>
              <div className="flex items-start gap-3">
                <Avatar name={t.name} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-bold text-slate-900">{t.name}</p>
                    {t.active ? <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" title="Active" /> : <Badge>Inactive</Badge>}
                  </div>
                  <p className="truncate text-xs text-slate-500">{t.qualification || 'Teacher'}{t.joiningDate && ` · since ${fmtDate(t.joiningDate, { month: 'short', year: 'numeric' })}`}</p>
                </div>
                <ActionsMenu t={t} onEdit={() => openForm(t)} onReset={() => setConfirm({ t, kind: 'reset' })}
                  onToggle={() => (t.active ? setConfirm({ t, kind: 'deactivate' }) : reactivate(t))} />
              </div>

              {!!t.subjects?.length && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {t.subjects.map((s) => <Badge key={s} tone="brand"><BookOpen className="h-3 w-3" />{s}</Badge>)}
                </div>
              )}

              <div className="mt-4 space-y-1.5 text-sm text-slate-600">
                <p className="flex items-center gap-2"><Mail className="h-4 w-4 text-slate-400" /><span className="truncate">{t.email}</span></p>
                <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-slate-400" />{t.phone ? <a href={`tel:${t.phone}`} className="hover:text-brand-700">{t.phone}</a> : '—'}</p>
              </div>

              <div className="mt-4 flex-1">
                <p className="label">Batches</p>
                {t.batches.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {t.batches.map((b) => (
                      <span key={b._id} className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        title={b.role === 'co' ? 'Co-teacher' : 'Lead teacher'}
                        style={{ background: `${b.color ?? '#6366f1'}15`, color: b.color ?? '#6366f1' }}>
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: b.color ?? '#6366f1' }} />{b.name}
                        <span className="rounded bg-white/70 px-1 text-[9px] font-bold uppercase tracking-wide">{b.role === 'co' ? 'Co' : 'Lead'}</span>
                      </span>
                    ))}
                  </div>
                ) : <p className="text-xs text-slate-400">No batches assigned</p>}
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4 text-center">
                <div><p className="text-lg font-extrabold text-slate-900">{t.batches.length}</p><p className="text-[11px] font-semibold uppercase text-slate-400">Batches</p></div>
                <div><p className="flex items-center justify-center gap-1 text-lg font-extrabold text-slate-900"><Users className="h-4 w-4 text-slate-400" />{t.studentCount}</p><p className="text-[11px] font-semibold uppercase text-slate-400">Students</p></div>
                <div><p className="text-lg font-extrabold text-slate-900">{t.salary ? inr(t.salary) : '—'}</p><p className="text-[11px] font-semibold uppercase text-slate-400">Salary</p></div>
              </div>
            </div>
          ))}
        </div>
      )}
      {pager && <Card pad={false} className="mt-4 overflow-hidden"><Pager {...pager} noun="teachers" /></Card>}

      <TeacherModal open={formOpen} onClose={() => setFormOpen(false)} teacher={editing} onSaved={(c) => { refresh(); if (c) setCreds(c); }} />

      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={runConfirm} loading={busy} danger={confirm?.kind === 'deactivate'}
        title={confirm?.kind === 'deactivate' ? `Deactivate ${confirm.t.name}?` : `Reset password for ${confirm?.t.name ?? ''}?`}
        confirmLabel={confirm?.kind === 'deactivate' ? 'Deactivate' : 'Reset password'}
        text={confirm?.kind === 'deactivate'
          ? 'They will be signed out and can no longer log in. They are also removed from all their batches (as lead or co-teacher), so you will need to assign new teachers there. Their past attendance and marks stay. You can reactivate them later.'
          : 'A new 12-character password will be generated. Their current password stops working immediately and they are signed out on every device.'} />

      <Modal open={!!creds} onClose={() => setCreds(null)} title={creds?.title ?? ''} subtitle="Share these with the teacher so they can log in."
        footer={<Button onClick={() => setCreds(null)}>Done</Button>}>
        {creds && (
          <div className="space-y-3">
            <CopyRow label="Email" value={creds.email} />
            <CopyRow label="Password" value={creds.password} />
            <CopyRow label="Share message" value={`Your CoachFlow login — ${location.origin}/login · Email: ${creds.email} · Password: ${creds.password}`} />
            {creds.reset && <p className="text-xs text-slate-500">The old password no longer works, and the teacher has been signed out on all devices.</p>}
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">This password is shown only once. Ask the teacher to keep it safe.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
