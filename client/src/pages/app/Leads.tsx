import {
  CalendarClock, CheckCircle2, ExternalLink, GraduationCap, MessageCircle, Phone, Plus, Send, Target, Trash2, TrendingUp, UserPlus, Users,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Link, useSearchParams } from 'react-router-dom';
import { Pager } from '../../components/Pager';
import {
  Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Input, Modal, PageHeader, SearchInput, Select, Skeleton, StatCard, Tabs, Textarea, clsx,
  type BadgeTone,
} from '../../components/ui';
import { useRealtime, useSocketEvent } from '../../context/RealtimeContext';
import { useApi, useDebounced, usePagedApi } from '../../hooks/useApi';
import { api, errMsg } from '../../lib/api';
import { fmtDate, fmtDateTime, timeAgo, ymd } from '../../lib/format';

export interface Lead {
  _id: string; name: string; studentName?: string; phone: string; email?: string; studentClass?: string; courseId?: string; courseName?: string;
  message?: string; source: string; kind: 'enquiry' | 'demo'; demoAt?: string; demoBatchId?: { _id: string; name: string } | null;
  status: 'new' | 'contacted' | 'demo_scheduled' | 'demo_done' | 'converted' | 'lost'; followUpAt?: string | null; lostReason?: string;
  studentId?: string; notes: { text: string; by: string; at: string }[]; createdAt: string; lastContactAt?: string;
}
type Extra = { counts: Record<string, number>; last30: { total: number; converted: number; rate: number } };
interface CourseOpt { _id: string; name: string; fee?: number }
interface BatchOpt { _id: string; name: string }

const STATUS: { value: Lead['status']; label: string; tone: BadgeTone }[] = [
  { value: 'new', label: 'New', tone: 'blue' },
  { value: 'contacted', label: 'Contacted', tone: 'brand' },
  { value: 'demo_scheduled', label: 'Demo scheduled', tone: 'violet' },
  { value: 'demo_done', label: 'Demo done', tone: 'amber' },
  { value: 'converted', label: 'Admitted', tone: 'green' },
  { value: 'lost', label: 'Lost', tone: 'gray' },
];
const SOURCES = [
  ['website', 'Website'], ['demo_form', 'Demo form'], ['walk_in', 'Walk-in'], ['phone', 'Phone call'], ['whatsapp', 'WhatsApp'], ['referral', 'Referral'], ['social', 'Social media'], ['other', 'Other'],
] as const;
/** ISO → value for <input type="datetime-local"> in local time. */
const toLocalInput = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const statusOf = (s: string) => STATUS.find((x) => x.value === s) ?? STATUS[0];
const sourceLabel = (s: string) => SOURCES.find((x) => x[0] === s)?.[1] ?? s;
const waLink = (phone: string, text = '') => `https://wa.me/${phone.replace(/\D/g, '').replace(/^(\d{10})$/, '91$1')}${text ? `?text=${encodeURIComponent(text)}` : ''}`;

type Filter = 'open' | 'followup' | Lead['status'] | 'all';

export default function Leads() {
  const [params, setParams] = useSearchParams();
  const initial = params.get('status') as Filter | null;
  const [filter, setFilter] = useState<Filter>(initial && ['open', 'followup', 'all', ...STATUS.map((x) => x.value)].includes(initial) ? initial : 'open');
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 300);
  const list = usePagedApi<Lead, Extra>('/leads', { status: filter === 'all' ? undefined : filter, search: q || undefined });
  const { data, error, reload, pager } = list;
  // Live: a website enquiry / demo booking arrives → refresh the list and counts without a page reload.
  const { connected } = useRealtime();
  useSocketEvent('lead:new', () => reload());
  // Fallback while the live connection is down: check every 30 s (only when the tab is visible).
  useEffect(() => {
    if (connected) return;
    const t = setInterval(() => document.visibilityState === 'visible' && reload(), 30_000);
    return () => clearInterval(t);
  }, [connected, reload]);
  const site = useApi<{ website: { enabled?: boolean; slug?: string } }>('/website');
  const [openId, setOpenId] = useState<string | null>(params.get('open'));
  const [addOpen, setAddOpen] = useState(false);
  const c = data?.counts ?? {};
  const siteUrl = site.data?.website?.enabled && site.data.website.slug ? `${location.origin}/site/${site.data.website.slug}` : null;

  const close = () => {
    setOpenId(null);
    if (params.get('open')) {
      params.delete('open');
      setParams(params, { replace: true });
    }
  };

  return (
    <div>
      <PageHeader title="Enquiries & admissions" subtitle="Track every enquiry and demo booking until it becomes an admission"
        actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setAddOpen(true)}>Add enquiry</Button>} />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active enquiries" value={c.open ?? 0} hint={(c.new ?? 0) > 0 ? `${c.new} not contacted yet` : undefined} icon={<Users className="h-5 w-5" />} tone="brand" />
        <StatCard label="Follow-up due today" value={c.followup ?? 0} icon={<CalendarClock className="h-5 w-5" />} tone={(c.followup ?? 0) > 0 ? 'rose' : 'sky'} hint={(c.followup ?? 0) > 0 ? <button className="font-semibold text-brand-600 hover:underline" onClick={() => setFilter('followup')}>Show them →</button> : 'All caught up'} />
        <StatCard label="Demo scheduled" value={c.demo_scheduled ?? 0} icon={<Target className="h-5 w-5" />} tone="violet" />
        <StatCard label="Conversion (30 days)" value={`${data?.last30.rate ?? 0}%`} icon={<TrendingUp className="h-5 w-5" />} tone="green" hint={`${data?.last30.converted ?? 0} admitted of ${data?.last30.total ?? 0} enquiries`} />
      </div>

      {siteUrl ? (
        <p className="mb-5 flex flex-wrap items-center gap-2 rounded-xl bg-brand-50 px-4 py-2.5 text-sm text-brand-800">
          Website enquiries and demo bookings arrive here automatically from
          <a href={siteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold underline">{siteUrl.replace(/^https?:\/\//, '')}<ExternalLink className="h-3 w-3" /></a>
        </p>
      ) : site.data && (
        <p className="mb-5 rounded-xl bg-slate-50 px-4 py-2.5 text-sm text-slate-600">Publish your <Link to="/app/website" className="font-semibold text-brand-600 hover:underline">admissions website</Link> to get enquiries and demo bookings here automatically.</p>
      )}

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Search name, phone, course…" className="lg:w-72" />
        {/* One "Active" tab = every enquiry still in progress (new, contacted, demo…). Follow-ups that
            are due are listed first and marked red, so "New" / "Follow-up due" / "Open" aren't separate tabs. */}
        <Tabs<Filter> value={filter === 'followup' || filter === 'new' ? 'open' : filter} onChange={setFilter} className="overflow-x-auto" tabs={[
          { value: 'open', label: 'Active', count: c.open },
          ...STATUS.filter((s) => s.value !== 'new').map((s) => ({ value: s.value as Filter, label: s.label, count: c[s.value] ?? 0 })),
          { value: 'all', label: 'All', count: c.all },
        ]} />
        {filter === 'followup' && (
          <button onClick={() => setFilter('open')} className="badge bg-rose-50 text-rose-700 ring-1 ring-rose-600/15">Only follow-ups due ✕</button>
        )}
      </div>

      <Card pad={false} className="overflow-hidden">
        {error ? <ErrorState message={error} onRetry={reload} /> : !data ? <Skeleton className="h-64" /> : data.items.length === 0 ? (
          <EmptyState icon={<UserPlus className="h-7 w-7" />} title="No enquiries here" text="Add walk-in or phone enquiries, or share your website so parents can enquire and book a demo." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr><th className="px-5 py-3">Enquiry</th><th className="px-3 py-3">Course / class</th><th className="px-3 py-3">Source</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Next follow-up</th><th className="px-5 py-3 text-right">Contact</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((l) => {
                  const st = statusOf(l.status);
                  const due = l.followUpAt && !['converted', 'lost'].includes(l.status) && new Date(l.followUpAt) < new Date(new Date().setHours(24, 0, 0, 0));
                  return (
                    <tr key={l._id} className="cursor-pointer hover:bg-slate-50/70" onClick={() => setOpenId(l._id)}>
                      <td className="px-5 py-3">
                        <p className="font-semibold text-slate-900">{l.name}{l.studentName && <span className="font-normal text-slate-500"> · for {l.studentName}</span>}</p>
                        <p className="text-xs text-slate-400">{l.phone} · {timeAgo(l.createdAt)}</p>
                      </td>
                      <td className="px-3 py-3 text-slate-700">{[l.courseName, l.studentClass].filter(Boolean).join(' · ') || '—'}</td>
                      <td className="px-3 py-3">{l.kind === 'demo' ? <Badge tone="violet">Demo · {sourceLabel(l.source)}</Badge> : <span className="text-slate-600">{sourceLabel(l.source)}</span>}</td>
                      <td className="px-3 py-3"><Badge tone={st.tone}>{st.label}</Badge></td>
                      <td className={clsx('px-3 py-3', due ? 'font-semibold text-rose-600' : 'text-slate-600')}>
                        {l.status === 'demo_scheduled' && l.demoAt ? `Demo ${fmtDateTime(l.demoAt)}` : l.followUpAt && !['converted', 'lost'].includes(l.status) ? fmtDate(l.followUpAt, { day: 'numeric', month: 'short' }) : '—'}
                      </td>
                      <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <a href={`tel:${l.phone}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-brand-600" title="Call"><Phone className="h-4 w-4" /></a>
                          <a href={waLink(l.phone, `Namaste ${l.name.split(' ')[0]}, `)} target="_blank" rel="noreferrer" className="rounded-lg p-2 text-slate-500 hover:bg-emerald-50 hover:text-emerald-600" title="WhatsApp"><MessageCircle className="h-4 w-4" /></a>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {pager && <Pager {...pager} noun="enquiries" />}
      </Card>

      <LeadDrawer id={openId} onClose={close} onChanged={reload} />
      <AddLeadModal open={addOpen} onClose={() => setAddOpen(false)} onSaved={(id) => { reload(); setOpenId(id); }} />
    </div>
  );
}

function AddLeadModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (id: string) => void }) {
  const courses = useApi<CourseOpt[]>(open ? '/academics/courses' : null);
  const [f, setF] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) setF({ name: '', phone: '', studentName: '', studentClass: '', courseId: '', email: '', source: 'walk_in', kind: 'enquiry', followUpAt: ymd(), note: '' }); }, [open]);
  const set = (k: string) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.post<Lead>('/leads', { ...f, courseId: f.courseId || undefined });
      toast.success('Enquiry added');
      onSaved(data._id);
      onClose();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Add enquiry" subtitle="Walk-in, phone call, WhatsApp or referral"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="lead-form" loading={saving}>Save</Button></>}>
      <form id="lead-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Input label="Parent / enquirer name *" value={f.name ?? ''} onChange={set('name')} autoFocus />
        <Input label="Phone *" value={f.phone ?? ''} onChange={set('phone')} inputMode="tel" />
        <Input label="Student name" value={f.studentName ?? ''} onChange={set('studentName')} />
        <Input label="Class" value={f.studentClass ?? ''} onChange={set('studentClass')} placeholder="e.g. Class 10" />
        <Select label="Interested in" value={f.courseId ?? ''} onChange={set('courseId')}>
          <option value="">— Course —</option>
          {courses.data?.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
        </Select>
        <Input label="Email" type="email" value={f.email ?? ''} onChange={set('email')} />
        <Select label="Source" value={f.source ?? 'walk_in'} onChange={set('source')}>{SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
        <Input label="Follow up on" type="date" value={f.followUpAt ?? ''} onChange={set('followUpAt')} />
        <Textarea label="Note" value={f.note ?? ''} onChange={set('note')} rows={2} className="sm:col-span-2" placeholder="What did they ask about?" />
      </form>
    </Modal>
  );
}

function LeadDrawer({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const [lead, setLead] = useState<Lead | null>(null);
  const [note, setNote] = useState('');
  const [nextFollow, setNextFollow] = useState('');
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState({ at: '', batch: '' });
  const [convertOpen, setConvertOpen] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [lostReason, setLostReason] = useState('');
  const [del, setDel] = useState(false);
  const batches = useApi<BatchOpt[]>(id ? '/batches/options' : null, { active: 'true' });

  useEffect(() => {
    setLead(null);
    if (!id) return;
    api.get<Lead>(`/leads/${id}`).then(({ data }) => {
      setLead(data);
      setDemo({ at: toLocalInput(data.demoAt), batch: data.demoBatchId?._id ?? '' });
      setNextFollow('');
    }).catch((e) => { toast.error(errMsg(e)); onClose(); });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = async (body: Record<string, unknown>, msg?: string) => {
    if (!lead) return;
    setBusy(true);
    try {
      const { data } = await api.put<Lead>(`/leads/${lead._id}`, body);
      setLead(data);
      if (msg) toast.success(msg);
      onChanged();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  const addNote = async () => {
    if (!lead || !note.trim()) return;
    setBusy(true);
    try {
      const { data } = await api.post<Lead>(`/leads/${lead._id}/notes`, { text: note, followUpAt: nextFollow || undefined });
      setLead(data);
      setNote('');
      setNextFollow('');
      if (data.status === 'new') await update({ status: 'contacted' });
      onChanged();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!lead) return;
    try {
      await api.delete(`/leads/${lead._id}`);
      toast.success('Enquiry deleted');
      setDel(false);
      onChanged();
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const st = lead ? statusOf(lead.status) : null;
  return (
    <Modal open={!!id} onClose={onClose} size="lg" title={lead ? lead.name : 'Enquiry'} subtitle={lead ? `${lead.phone}${lead.email ? ` · ${lead.email}` : ''} · ${sourceLabel(lead.source)} · ${fmtDateTime(lead.createdAt)}` : ''}
      footer={lead && <>
        <Button variant="ghost" className="mr-auto text-rose-600" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDel(true)}>Delete</Button>
        {lead.status !== 'converted' && lead.status !== 'lost' && <Button variant="secondary" onClick={() => setLostOpen(true)}>Mark lost</Button>}
        {lead.status !== 'converted' ? <Button variant="success" icon={<GraduationCap className="h-4 w-4" />} onClick={() => setConvertOpen(true)}>Give admission</Button>
          : lead.studentId && <Link to={`/app/students/${lead.studentId}`} className="btn-primary">Open student</Link>}
      </>}>
      {!lead ? <Skeleton className="h-64" /> : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={st!.tone}>{st!.label}</Badge>
            {lead.kind === 'demo' && <Badge tone="violet">Asked for demo class</Badge>}
            {lead.courseName && <Badge tone="brand">{lead.courseName}</Badge>}
            {lead.studentClass && <Badge>{lead.studentClass}</Badge>}
            {lead.studentName && <span className="text-sm text-slate-600">Student: <b>{lead.studentName}</b></span>}
            <div className="ml-auto flex gap-1">
              <a href={`tel:${lead.phone}`} className="btn-secondary btn-sm"><Phone className="h-3.5 w-3.5" />Call</a>
              <a href={waLink(lead.phone, `Namaste ${lead.name.split(' ')[0]}, `)} target="_blank" rel="noreferrer" className="btn-success btn-sm"><MessageCircle className="h-3.5 w-3.5" />WhatsApp</a>
            </div>
          </div>
          {lead.message && <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">“{lead.message}”</p>}

          {lead.status !== 'converted' && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Select label="Status" value={lead.status} disabled={busy} onChange={(e) => update({ status: e.target.value }, 'Status updated')}>
                {STATUS.filter((s) => s.value !== 'converted').map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </Select>
              <Input label="Next follow-up" type="date" value={lead.followUpAt ? ymd(new Date(lead.followUpAt)) : ''} onChange={(e) => update({ followUpAt: e.target.value || null }, 'Follow-up set')} />
              <div />
              <Input label="Demo class on" type="datetime-local" value={demo.at} onChange={(e) => setDemo({ ...demo, at: e.target.value })} />
              <Select label="Demo batch" value={demo.batch} onChange={(e) => setDemo({ ...demo, batch: e.target.value })}>
                <option value="">— Batch —</option>
                {batches.data?.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
              </Select>
              <div className="flex items-end">
                <Button className="w-full" variant="secondary" disabled={!demo.at || busy} icon={<Target className="h-4 w-4" />}
                  onClick={() => update({ demoAt: new Date(demo.at).toISOString(), demoBatchId: demo.batch || null, status: 'demo_scheduled', followUpAt: demo.at.slice(0, 10) }, 'Demo scheduled')}>Schedule demo</Button>
              </div>
            </div>
          )}

          <div>
            <p className="label">Notes & history</p>
            <div className="mb-3 flex flex-col gap-2 sm:flex-row">
              <input className="input flex-1" placeholder="e.g. Called, will visit on Saturday" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addNote()} />
              <input className="input sm:w-40" type="date" title="Next follow-up" value={nextFollow} onChange={(e) => setNextFollow(e.target.value)} />
              <Button icon={<Send className="h-4 w-4" />} onClick={addNote} disabled={!note.trim() || busy}>Add</Button>
            </div>
            <ul className="max-h-60 space-y-2 overflow-y-auto">
              {[...lead.notes].reverse().map((n, i) => (
                <li key={i} className="rounded-xl border border-slate-100 px-3 py-2 text-sm">
                  <p className="text-slate-700">{n.text}</p>
                  <p className="text-[11px] text-slate-400">{n.by} · {fmtDateTime(n.at)}</p>
                </li>
              ))}
              {!lead.notes.length && <li className="text-sm text-slate-400">No notes yet.</li>}
            </ul>
          </div>
        </div>
      )}
      {lead && <ConvertModal open={convertOpen} lead={lead} onClose={() => setConvertOpen(false)} onDone={(l) => { setLead(l); onChanged(); }} />}
      <Modal open={lostOpen} onClose={() => setLostOpen(false)} title="Mark as lost" size="sm"
        footer={<><Button variant="secondary" onClick={() => setLostOpen(false)}>Cancel</Button><Button variant="danger" onClick={async () => { await update({ status: 'lost', lostReason, followUpAt: null }, 'Marked as lost'); setLostOpen(false); }}>Mark lost</Button></>}>
        <Select label="Reason" value={lostReason} onChange={(e) => setLostReason(e.target.value)}>
          <option value="">— Choose —</option>
          {['Fees too high', 'Joined another coaching', 'Timing not suitable', 'Too far', 'Not interested', 'Not reachable', 'Other'].map((x) => <option key={x}>{x}</option>)}
        </Select>
      </Modal>
      <ConfirmDialog open={del} onClose={() => setDel(false)} onConfirm={remove} danger title="Delete this enquiry?" confirmLabel="Delete" text="The enquiry and its notes are removed permanently." />
    </Modal>
  );
}

function ConvertModal({ open, lead, onClose, onDone }: { open: boolean; lead: Lead; onClose: () => void; onDone: (l: Lead) => void }) {
  const batches = useApi<BatchOpt[]>(open ? '/batches/options' : null, { active: 'true' });
  const courses = useApi<CourseOpt[]>(open ? '/academics/courses' : null);
  const [f, setF] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setF({
      name: lead.studentName || '', parentName: lead.name, parentPhone: lead.phone, parentEmail: lead.email ?? '', course: lead.courseName ?? lead.studentClass ?? '',
      batchId: lead.demoBatchId?._id ?? '', feeTotal: '', installments: '3', firstDueDate: ymd(),
    });
  }, [open, lead]);
  useEffect(() => {
    // Pre-fill the fee from the course the lead asked about.
    const c = courses.data?.find((x) => x._id === lead.courseId);
    if (open && c?.fee && !f.feeTotal) setF((p) => ({ ...p, feeTotal: String(c.fee) }));
  }, [courses.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: string) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) return toast.error("Enter the student's name");
    setSaving(true);
    try {
      const { data: student } = await api.post<{ _id: string; name: string }>('/students', {
        name: f.name, parentName: f.parentName, parentPhone: f.parentPhone, parentEmail: f.parentEmail || undefined, course: f.course || undefined,
        batchIds: f.batchId ? [f.batchId] : [], feeTotal: f.feeTotal || undefined, installments: f.installments, firstDueDate: f.firstDueDate,
      });
      const { data } = await api.post<Lead>(`/leads/${lead._id}/convert`, { studentId: student._id });
      toast.success(`${student.name} admitted 🎉`);
      onDone(data);
      onClose();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Give admission" subtitle="Creates the student, their fee installments and marks this enquiry as admitted"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="convert-form" variant="success" loading={saving} icon={<CheckCircle2 className="h-4 w-4" />}>Admit student</Button></>}>
      <form id="convert-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Input label="Student name *" value={f.name ?? ''} onChange={set('name')} autoFocus />
        <Input label="Course / class" value={f.course ?? ''} onChange={set('course')} />
        <Input label="Parent name" value={f.parentName ?? ''} onChange={set('parentName')} />
        <Input label="Parent phone" value={f.parentPhone ?? ''} onChange={set('parentPhone')} />
        <Input label="Parent email" value={f.parentEmail ?? ''} onChange={set('parentEmail')} />
        <Select label="Batch" value={f.batchId ?? ''} onChange={set('batchId')}>
          <option value="">— Later —</option>
          {batches.data?.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
        </Select>
        <Input label="Total fee (₹)" type="number" min={0} value={f.feeTotal ?? ''} onChange={set('feeTotal')} />
        <Input label="Installments" type="number" min={1} max={12} value={f.installments ?? ''} onChange={set('installments')} />
        <Input label="First due date" type="date" value={f.firstDueDate ?? ''} onChange={set('firstDueDate')} />
      </form>
    </Modal>
  );
}
