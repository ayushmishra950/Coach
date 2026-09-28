import { Download, FileUp, GraduationCap, IndianRupee, Plus, ShieldCheck, Upload, UserPlus, Users } from 'lucide-react';
import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, Input, Modal, PageHeader, SearchInput, Select, Skeleton, Tabs, Textarea, clsx } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useApi, useDebounced, usePagedApi } from '../../hooks/useApi';
import { Pager } from '../../components/Pager';
import { api, errMsg } from '../../lib/api';
import { downloadCSV, inr, pctTone, ymd } from '../../lib/format';
import type { Batch, BatchRef, Student } from '../../lib/types';

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

export function BatchChips({ batches, max = 3, size = 'sm' }: { batches?: (BatchRef | string)[]; max?: number; size?: 'sm' | 'md' }) {
  const list = (batches ?? []).filter((b): b is BatchRef => typeof b === 'object' && !!b);
  if (!list.length) return <span className="text-xs text-slate-400">No batch</span>;
  const shown = list.slice(0, max);
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((b) => (
        <span key={b._id}
          className={clsx('inline-flex items-center gap-1.5 rounded-full border font-semibold', size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs')}
          style={{ borderColor: `${b.color ?? '#6366f1'}40`, background: `${b.color ?? '#6366f1'}12`, color: b.color ?? '#6366f1' }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: b.color ?? '#6366f1' }} />
          <span className="max-w-[160px] truncate">{b.name}</span>
        </span>
      ))}
      {list.length > max && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">+{list.length - max}</span>}
    </div>
  );
}

const toDateInput = (d?: string) => (d ? ymd(new Date(d)) : '');
const batchIdsOf = (s?: Student | null) => (s?.batchIds ?? []).map((b) => (typeof b === 'string' ? b : b._id));

function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-50 text-brand-600">{icon}</span>
        {title}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Add / Edit student modal                                            */
/* ------------------------------------------------------------------ */

type FormState = Record<string, string>;

export function StudentFormModal({ open, onClose, student, onSaved }: {
  open: boolean; onClose: () => void; student?: Student | null; onSaved: (s: Student) => void;
}) {
  const editing = !!student;
  const { data: batches } = useApi<Batch[]>(open ? '/batches/options' : null);
  const [f, setF] = useState<FormState>({} as FormState);
  const [batchIds, setBatchIds] = useState<string[]>([]);
  const [withFee, setWithFee] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setF({
      name: student?.name ?? '', phone: student?.phone ?? '', dob: toDateInput(student?.dob), gender: student?.gender ?? '',
      address: student?.address ?? '', parentName: student?.parentName ?? '', parentPhone: student?.parentPhone ?? '',
      parentEmail: student?.parentEmail ?? '', course: student?.course ?? '', joiningDate: student ? toDateInput(student.joiningDate) : ymd(),
      studentCode: student?.studentCode ?? '', feeTotal: '', installments: '3', firstDueDate: ymd(), intervalMonths: '3',
    } as FormState);
    setBatchIds(batchIdsOf(student));
    setWithFee(false);
  }, [open, student]);

  const set = (k: string) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }) as FormState);
  const toggleBatch = (id: string) => setBatchIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!f.name?.trim()) return toast.error('Student name is required');
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: f.name.trim(), phone: f.phone, dob: f.dob, gender: f.gender, address: f.address,
        parentName: f.parentName, parentPhone: f.parentPhone, parentEmail: f.parentEmail,
        course: f.course, joiningDate: f.joiningDate, batchIds,
      };
      if (!editing) {
        if (f.studentCode.trim()) body.studentCode = f.studentCode.trim();
        if (withFee && Number(f.feeTotal) > 0) {
          Object.assign(body, { feeTotal: Number(f.feeTotal), installments: Number(f.installments) || 1, firstDueDate: f.firstDueDate, intervalMonths: Number(f.intervalMonths) || 3 });
        }
      }
      const { data } = editing ? await api.put<Student>(`/students/${student!._id}`, body) : await api.post<Student>('/students', body);
      toast.success(editing ? 'Student updated' : `${data.name} added (${data.studentCode})`);
      onSaved(data);
      onClose();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  const perInst = Number(f.feeTotal) > 0 ? Math.floor(Number(f.feeTotal) / Math.max(1, Number(f.installments) || 1)) : 0;

  return (
    <Modal open={open} onClose={onClose} size="lg" title={editing ? 'Edit student' : 'Add new student'}
      subtitle={editing ? `${student!.name} · ${student!.studentCode}` : 'Fill in the details below — only the name is required.'}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" form="student-form" loading={saving}>{editing ? 'Save changes' : 'Add student'}</Button>
      </>}>
      <form id="student-form" onSubmit={submit} className="space-y-4">
        <Section title="Student info" icon={<GraduationCap className="h-4 w-4" />}>
          <Input label="Full name *" value={f.name ?? ''} onChange={set('name')} placeholder="e.g. Aarav Sharma" autoFocus className="sm:col-span-2" />
          <Input label="Phone" value={f.phone ?? ''} onChange={set('phone')} placeholder="10-digit mobile" inputMode="tel" />
          <Input label="Date of birth" type="date" value={f.dob ?? ''} onChange={set('dob')} />
          <Select label="Gender" value={f.gender ?? ''} onChange={set('gender')}>
            <option value="">Select…</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </Select>
          <Input label="Address" value={f.address ?? ''} onChange={set('address')} placeholder="House no, area, city" />
        </Section>

        <Section title="Parent info" icon={<Users className="h-4 w-4" />}>
          <Input label="Parent name" value={f.parentName ?? ''} onChange={set('parentName')} placeholder="e.g. Rajesh Sharma" />
          <Input label="Parent phone" value={f.parentPhone ?? ''} onChange={set('parentPhone')} placeholder="Used for WhatsApp alerts" inputMode="tel" />
          <Input label="Parent email" type="email" value={f.parentEmail ?? ''} onChange={set('parentEmail')} placeholder="Needed for parent portal" className="sm:col-span-2" />
        </Section>

        <Section title="Academic" icon={<ShieldCheck className="h-4 w-4" />}>
          <Input label="Course / class" value={f.course ?? ''} onChange={set('course')} placeholder="e.g. Class 10, JEE 2027" />
          <Input label="Joining date" type="date" value={f.joiningDate ?? ''} onChange={set('joiningDate')} />
          {!editing && <Input label="Student code" value={f.studentCode ?? ''} onChange={set('studentCode')} placeholder="Auto-generated if left blank" className="sm:col-span-2" />}
          <div className="sm:col-span-2">
            <span className="label">Batches</span>
            {!batches ? <Skeleton className="h-9 w-full" /> : batches.length === 0 ? (
              <p className="text-sm text-slate-400">No batches yet — create one from the Batches page.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {batches.map((b) => {
                  const on = batchIds.includes(b._id);
                  return (
                    <button type="button" key={b._id} onClick={() => toggleBatch(b._id)}
                      className={clsx('inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                        on ? 'text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300')}
                      style={on ? { background: b.color, borderColor: b.color } : undefined}>
                      <span className="h-2 w-2 rounded-full" style={{ background: on ? '#fff' : b.color }} />
                      {b.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </Section>

        {!editing && (
          <div className="rounded-2xl border border-dashed border-slate-200 p-4">
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-50 text-emerald-600"><IndianRupee className="h-4 w-4" /></span>
                Set up fees now <span className="font-normal text-slate-400">(optional)</span>
              </span>
              <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={withFee} onChange={(e) => setWithFee(e.target.checked)} />
            </label>
            {withFee && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Input label="Total fee (₹)" type="number" min={0} value={f.feeTotal ?? ''} onChange={set('feeTotal')} placeholder="e.g. 24000" />
                <Input label="Installments" type="number" min={1} max={12} value={f.installments ?? ''} onChange={set('installments')} />
                <Input label="First due date" type="date" value={f.firstDueDate ?? ''} onChange={set('firstDueDate')} />
                <Select label="Interval" value={f.intervalMonths ?? '3'} onChange={set('intervalMonths')}>
                  <option value="1">Every month</option>
                  <option value="2">Every 2 months</option>
                  <option value="3">Every 3 months</option>
                  <option value="6">Every 6 months</option>
                </Select>
                {perInst > 0 && (
                  <p className="text-xs text-slate-500 sm:col-span-2">
                    ≈ <b className="text-slate-800">{inr(perInst)}</b> per installment × {Math.max(1, Number(f.installments) || 1)}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* CSV import                                                          */
/* ------------------------------------------------------------------ */

const CSV_HEADERS = ['name', 'phone', 'gender', 'parentName', 'parentPhone', 'parentEmail', 'course', 'batch'] as const;

interface ImportResult { imported: number; duplicates: number; skipped: number; errors: { row: number; name: string; error: string }[] }

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

function toStudents(text: string) {
  const rows = parseCSV(text);
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const idx = Object.fromEntries(CSV_HEADERS.map((h) => [h, head.indexOf(h.toLowerCase())]));
  const hasHeader = head.includes('name');
  const body = hasHeader ? rows.slice(1) : rows;
  return body.map((r) => {
    const o: Record<string, string> = {};
    CSV_HEADERS.forEach((h, i) => {
      const at = hasHeader ? idx[h] : i;
      const v = at >= 0 ? (r[at] ?? '').trim() : '';
      if (v) o[h] = h === 'gender' ? v.toLowerCase() : v;
    });
    return o;
  });
}

function ImportModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  useEffect(() => { if (open) { setText(''); setResult(null); } }, [open]);
  const parsed = useMemo(() => toStudents(text), [text]);
  const valid = parsed.filter((r) => r.name);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setText(await file.text());
    e.target.value = '';
  };

  const template = () =>
    downloadCSV('coachflow-students-template', [
      { name: 'Aarav Sharma', phone: '9876543210', gender: 'male', parentName: 'Rajesh Sharma', parentPhone: '9876500000', parentEmail: 'rajesh@example.com', course: 'Class 10', batch: 'Class 10 Maths' },
      { name: 'Diya Patel', phone: '9812345678', gender: 'female', parentName: 'Meena Patel', parentPhone: '9812300000', parentEmail: '', course: 'Class 12', batch: '' },
    ]);

  const submit = async () => {
    if (!valid.length) return toast.error('No valid rows — each row needs a name');
    setSaving(true);
    try {
      const { data } = await api.post<ImportResult>('/students/import', { students: parsed });
      const errors = data.errors ?? [];
      if (data.imported > 0) toast.success(`Imported ${data.imported} student${data.imported === 1 ? '' : 's'}`);
      else toast.error('No new students were imported');
      onDone();
      if (!data.duplicates && !data.skipped && !errors.length) onClose();
      else setResult({ ...data, errors });
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="lg" title="Import students from CSV" subtitle="Bulk-add students in seconds. Student codes are generated automatically."
      footer={result ? (
        <>
          <Button variant="secondary" onClick={() => { setResult(null); setText(''); }}>Import another file</Button>
          <Button onClick={onClose}>Done</Button>
        </>
      ) : <>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} loading={saving} disabled={!valid.length} icon={<Upload className="h-4 w-4" />}>Import {valid.length || ''} students</Button>
      </>}>
      {result ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-emerald-50 p-4 text-center">
              <p className="text-2xl font-extrabold text-emerald-700">{result.imported}</p>
              <p className="text-xs font-semibold text-emerald-700/80">Imported</p>
            </div>
            <div className="rounded-2xl bg-amber-50 p-4 text-center">
              <p className="text-2xl font-extrabold text-amber-700">{result.duplicates}</p>
              <p className="text-xs font-semibold text-amber-700/80">Duplicates skipped</p>
            </div>
            <div className="rounded-2xl bg-rose-50 p-4 text-center">
              <p className="text-2xl font-extrabold text-rose-700">{result.errors.length + result.skipped}</p>
              <p className="text-xs font-semibold text-rose-700/80">Rows with errors</p>
            </div>
          </div>
          {result.duplicates > 0 && (
            <p className="text-sm text-slate-500">Duplicates are students already in your institute with the same name and parent phone.</p>
          )}
          {result.skipped > 0 && (
            <p className="text-sm text-slate-500">{result.skipped} row{result.skipped === 1 ? ' was' : 's were'} skipped because the name was missing.</p>
          )}
          {result.errors.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-semibold text-slate-700">Rows that could not be imported</p>
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
                {result.errors.slice(0, 8).map((e, i) => (
                  <li key={i} className="flex items-start justify-between gap-3 px-3 py-2">
                    <span className="font-semibold text-slate-800">Row {e.row}{e.name && ` · ${e.name}`}</span>
                    <span className="text-right text-rose-600">{e.error}</span>
                  </li>
                ))}
              </ul>
              {result.errors.length > 8 && <p className="mt-2 text-xs text-slate-400">…and {result.errors.length - 8} more</p>}
              <p className="mt-2 text-xs text-slate-400">Row numbers count data rows only (the header row is not counted).</p>
            </div>
          )}
        </div>
      ) : (
      <div className="space-y-4">
        <div className="flex flex-col gap-3 rounded-2xl bg-brand-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-slate-600">
            Columns: <code className="rounded bg-white px-1.5 py-0.5 text-xs text-brand-700">{CSV_HEADERS.join(',')}</code>
            <p className="mt-1 text-xs text-slate-500">Only <b>name</b> is required. Put a batch name in the <b>batch</b> column to add the student to that batch. Students already added (same name and parent phone) are skipped.</p>
          </div>
          <button type="button" onClick={template} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline">
            <Download className="h-4 w-4" /> Download template
          </button>
        </div>

        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 px-4 py-6 text-center transition hover:border-brand-300 hover:bg-brand-50/30">
          <FileUp className="h-7 w-7 text-brand-500" />
          <span className="text-sm font-semibold text-slate-700">Choose a .csv file</span>
          <span className="text-xs text-slate-400">or paste the contents below</span>
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
        </label>

        <Textarea label="CSV content" value={text} onChange={(e) => setText(e.target.value)} placeholder={`${CSV_HEADERS.join(',')}\nAarav Sharma,9876543210,male,Rajesh Sharma,9876500000,rajesh@example.com,Class 10`} className="[&_textarea]:font-mono [&_textarea]:text-xs" />

        {parsed.length > 0 && (
          <div>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-semibold text-slate-700">Preview</span>
              <span className="text-slate-500">
                <b className="text-emerald-600">{valid.length}</b> valid{parsed.length - valid.length > 0 && <> · <b className="text-rose-600">{parsed.length - valid.length}</b> missing name</>}
              </span>
            </div>
            <div className="table-wrap rounded-xl border border-slate-200">
              <table className="table">
                <thead><tr><th>Name</th><th>Phone</th><th>Parent</th><th>Parent phone</th><th>Course</th><th>Batch</th></tr></thead>
                <tbody>
                  {parsed.slice(0, 6).map((r, i) => (
                    <tr key={i} className={!r.name ? 'bg-rose-50/60' : ''}>
                      <td className="font-semibold">{r.name || <span className="text-rose-500">— missing —</span>}</td>
                      <td>{r.phone || '—'}</td><td>{r.parentName || '—'}</td><td>{r.parentPhone || '—'}</td><td>{r.course || '—'}</td><td>{r.batch || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parsed.length > 6 && <p className="mt-2 text-xs text-slate-400">…and {parsed.length - 6} more rows</p>}
          </div>
        )}
      </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

type StatusTab = 'active' | 'inactive' | 'all';

function FeeCell({ s }: { s: Student }) {
  if (!s.fees || !s.fees.total) return <span className="text-xs text-slate-400">Not set</span>;
  if (s.fees.pending <= 0) return <Badge tone="green">Paid</Badge>;
  return (
    <div>
      <p className={clsx('font-semibold', s.fees.overdue > 0 ? 'text-rose-600' : 'text-slate-800')}>{inr(s.fees.pending)}</p>
      {s.fees.overdue > 0 && <p className="text-[11px] font-semibold text-rose-500">{inr(s.fees.overdue)} overdue</p>}
    </div>
  );
}

export default function Students() {
  const { session } = useAuth();
  const isOwner = session?.user.role === 'owner';
  const nav = useNavigate();
  const [search, setSearch] = useState('');
  const [batchId, setBatchId] = useState('');
  const [status, setStatus] = useState<StatusTab>('active');
  const q = useDebounced(search, 300);
  const { data, loading, error, reload, pager } = usePagedApi<Student>('/students', { search: q || undefined, batchId: batchId || undefined, status });
  const { data: batches } = useApi<Batch[]>('/batches/options');
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const list = data?.items ?? [];
  const overdueCount = list.filter((s) => (s.fees?.overdue ?? 0) > 0).length;

  return (
    <div>
      <PageHeader
        title={<span className="flex items-center gap-3">Students {data && <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-sm font-bold text-brand-700">{data.total}</span>}</span>}
        subtitle={isOwner ? 'Manage admissions, batches, parents and fees in one place.' : 'Students in your batches.'}
        actions={isOwner && <>
          <Button variant="secondary" icon={<Upload className="h-4 w-4" />} onClick={() => setImportOpen(true)}>Import CSV</Button>
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setFormOpen(true)}>Add student</Button>
        </>}
      />

      <Card className="mb-4" pad={false}>
        <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
          <SearchInput value={search} onChange={setSearch} placeholder="Search name, code, phone or parent…" className="flex-1" />
          <select className="input lg:w-60" value={batchId} onChange={(e) => setBatchId(e.target.value)}>
            <option value="">All batches</option>
            {batches?.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
          </select>
          <Tabs<StatusTab> value={status} onChange={setStatus}
            tabs={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }, { value: 'all', label: 'All' }]} />
        </div>
        {isOwner && overdueCount > 0 && status !== 'inactive' && (
          <div className="border-t border-slate-100 px-4 py-2.5 text-xs font-medium text-rose-600">
            {overdueCount} student{overdueCount === 1 ? ' has' : 's have'} overdue fees on this page.
          </div>
        )}
      </Card>

      {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? (
        <Card pad={false} className="space-y-3 p-4">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-14 w-full" />)}</Card>
      ) : list.length === 0 ? (
        <Card>
          <EmptyState icon={<UserPlus className="h-7 w-7" />}
            title={q || batchId ? 'No students match your filters' : status === 'inactive' ? 'No inactive students' : 'No students yet'}
            text={q || batchId ? 'Try a different search or batch.' : status === 'inactive' ? 'Students you mark inactive will appear here.' : isOwner ? 'Add your first student or import a whole list from a CSV file.' : 'Students assigned to your batches will appear here.'}
            action={isOwner && !q && !batchId && status !== 'inactive' && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setFormOpen(true)}>Add student</Button>} />
        </Card>
      ) : (
        <>
          {/* Desktop table */}
          <Card pad={false} className={clsx('hidden overflow-hidden md:block', loading && 'opacity-60')}>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Student</th><th>Batches</th><th>Parent</th><th>Attendance</th><th>Avg score</th>
                    {isOwner && <th>Fee pending</th>}
                    <th>Portal</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((s) => (
                    <tr key={s._id} className="cursor-pointer focus:bg-brand-50/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400"
                      tabIndex={0} role="link" aria-label={`Open ${s.name}`}
                      onClick={() => nav(`/app/students/${s._id}`)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); nav(`/app/students/${s._id}`); } }}>
                      <td>
                        <div className="flex items-center gap-3">
                          <Avatar name={s.name} size="sm" />
                          <div>
                            <p className="font-semibold text-slate-900">{s.name}</p>
                            <p className="text-xs text-slate-400">{s.studentCode}{s.course && ` · ${s.course}`}{s.status === 'inactive' && ' · Inactive'}</p>
                          </div>
                        </div>
                      </td>
                      <td><BatchChips batches={s.batches ?? (s.batchIds as BatchRef[])} max={2} /></td>
                      <td>
                        <p className="text-slate-700">{s.parentName || '—'}</p>
                        <p className="text-xs text-slate-400">{s.parentPhone}</p>
                      </td>
                      <td>
                        {s.attendancePct == null ? <span className="text-slate-400">—</span> : (
                          <span className={clsx('font-bold', pctTone(s.attendancePct))}>{s.attendancePct}%</span>
                        )}
                      </td>
                      <td>{s.avgScore == null ? <span className="text-slate-400">—</span> : <span className={clsx('font-bold', pctTone(s.avgScore))}>{s.avgScore}%</span>}</td>
                      {isOwner && <td><FeeCell s={s} /></td>}
                      <td>{s.hasPortal ? <Badge tone="violet">Active</Badge> : <Badge>—</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pager && <Pager {...pager} noun="students" />}
          </Card>

          {/* Mobile cards */}
          <div className="grid gap-3 md:hidden">
            {list.map((s) => (
              <button key={s._id} onClick={() => nav(`/app/students/${s._id}`)} className="card card-pad text-left transition active:scale-[.99]">
                <div className="flex items-start gap-3">
                  <Avatar name={s.name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-bold text-slate-900">{s.name}</p>
                        <p className="text-xs text-slate-400">{s.studentCode}{s.course && ` · ${s.course}`}</p>
                      </div>
                      {s.hasPortal && <Badge tone="violet">Portal</Badge>}
                    </div>
                    <div className="mt-2"><BatchChips batches={s.batches ?? (s.batchIds as BatchRef[])} max={2} /></div>
                    <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-2.5 text-center">
                      <div>
                        <p className="text-[10px] font-semibold uppercase text-slate-400">Attend.</p>
                        <p className={clsx('text-sm font-bold', pctTone(s.attendancePct))}>{s.attendancePct != null ? `${s.attendancePct}%` : '—'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase text-slate-400">Score</p>
                        <p className={clsx('text-sm font-bold', pctTone(s.avgScore))}>{s.avgScore != null ? `${s.avgScore}%` : '—'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase text-slate-400">{isOwner ? 'Pending' : 'Parent'}</p>
                        {isOwner ? (
                          <p className={clsx('text-sm font-bold', (s.fees?.overdue ?? 0) > 0 ? 'text-rose-600' : 'text-slate-800')}>{s.fees?.total ? inr(s.fees.pending) : '—'}</p>
                        ) : <p className="truncate text-sm font-semibold text-slate-700">{s.parentPhone || '—'}</p>}
                      </div>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
          {pager && <Card pad={false} className="mt-3 overflow-hidden md:hidden"><Pager {...pager} noun="students" /></Card>}
        </>
      )}

      {isOwner && <>
        <StudentFormModal open={formOpen} onClose={() => setFormOpen(false)} onSaved={() => reload()} />
        <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onDone={reload} />
      </>}
    </div>
  );
}
