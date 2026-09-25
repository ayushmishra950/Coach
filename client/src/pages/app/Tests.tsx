import { AlertCircle, BookOpen, CalendarDays, ClipboardList, Plus, Target, Trophy, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Badge, Button, Card, EmptyState, ErrorState, Input, Modal, PageHeader, Progress, Select, Skeleton, StatusBadge, Tabs, clsx,
} from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import { api, errMsg } from '../../lib/api';
import { fmtDate, pctTone, ymd } from '../../lib/format';
import type { Batch, BatchRef, TestItem } from '../../lib/types';

type StatusKey = 'all' | 'scheduled' | 'graded' | 'published';

const batchOf = (t: TestItem): BatchRef | null => (t.batch ?? (typeof t.batchId === 'object' ? t.batchId : null)) as BatchRef | null;
export const needsMarks = (t: TestItem) => t.status === 'scheduled' && ymd(new Date(t.date)) <= ymd();

export default function Tests() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState<StatusKey>((['scheduled', 'graded', 'published'] as string[]).includes(params.get('status') ?? '') ? (params.get('status') as StatusKey) : 'all');
  const [batchId, setBatchId] = useState(params.get('batchId') ?? '');
  const [createOpen, setCreateOpen] = useState(params.get('new') === '1');
  const [presetBatch] = useState(params.get('batchId') ?? '');

  // Strip the one-shot ?new=1 flag once consumed
  useEffect(() => {
    if (params.get('new')) {
      const p = new URLSearchParams(params);
      p.delete('new');
      setParams(p, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const batches = useApi<Batch[]>('/batches');
  const { data, loading, error, reload } = useApi<TestItem[]>('/tests', { batchId: batchId || undefined });

  const counts = useMemo(() => {
    const c: Record<StatusKey, number> = { all: 0, scheduled: 0, graded: 0, published: 0 };
    for (const t of data ?? []) {
      c.all++;
      c[t.status]++;
    }
    return c;
  }, [data]);

  const list = useMemo(() => {
    const rows = (data ?? []).filter((t) => status === 'all' || t.status === status);
    // Tests needing marks float to the top
    return [...rows].sort((a, b) => Number(needsMarks(b)) - Number(needsMarks(a)));
  }, [data, status]);

  const pendingMarks = (data ?? []).filter(needsMarks).length;

  return (
    <div>
      <PageHeader
        title="Tests & Marks"
        subtitle="Schedule tests, enter marks quickly and publish results to parents."
        actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>Create test</Button>}
      />

      {pendingMarks > 0 && (
        <div className="mb-5 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertCircle className="h-5 w-5 shrink-0 text-amber-500" />
          <span><b>{pendingMarks} test{pendingMarks === 1 ? '' : 's'}</b> already conducted — marks still need to be entered.</span>
        </div>
      )}

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs<StatusKey>
          value={status}
          onChange={setStatus}
          tabs={[
            { value: 'all', label: 'All', count: counts.all },
            { value: 'scheduled', label: 'Scheduled', count: counts.scheduled },
            { value: 'graded', label: 'Graded', count: counts.graded },
            { value: 'published', label: 'Published', count: counts.published },
          ]}
        />
        <Select value={batchId} onChange={(e) => setBatchId(e.target.value)} className="sm:w-64" aria-label="Filter by batch">
          <option value="">All batches</option>
          {(batches.data ?? []).map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
        </Select>
      </div>

      {loading && !data ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-52" />)}</div>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !list.length ? (
        <Card>
          <EmptyState icon={<ClipboardList className="h-7 w-7" />} title="No tests here yet" text="Create a test to start recording marks."
            action={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>Create test</Button>} />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((t) => <TestCard key={t._id} t={t} onClick={() => navigate(`/app/tests/${t._id}`)} />)}
        </div>
      )}

      <TestFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        batches={batches.data ?? []}
        presetBatchId={presetBatch}
        onSaved={(id) => navigate(`/app/tests/${id}`)}
      />
    </div>
  );
}

function TestCard({ t, onClick }: { t: TestItem; onClick: () => void }) {
  const b = batchOf(t);
  const nm = needsMarks(t);
  const total = t.students ?? 0;
  const enteredPct = total ? Math.round((t.entered / total) * 100) : 0;
  return (
    <button
      onClick={onClick}
      className={clsx(
        'card group relative flex flex-col overflow-hidden p-5 text-left transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
        nm && 'border-amber-300 ring-2 ring-amber-100',
      )}
    >
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: b?.color ?? '#6366f1' }} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-brand-600">{t.subject}</p>
          <h3 className="mt-0.5 truncate text-base font-bold text-slate-900">{t.topic || 'General test'}</h3>
        </div>
        {nm ? <Badge tone="amber">Needs marks</Badge> : <StatusBadge status={t.status} />}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-500">
        {b && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
            <span className="h-2 w-2 rounded-full" style={{ background: b.color ?? '#6366f1' }} /> {b.name}
          </span>
        )}
        <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> {fmtDate(t.date)}</span>
        <span className="inline-flex items-center gap-1"><Target className="h-3.5 w-3.5" /> {t.maxMarks} marks</span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4 text-center">
        <Metric label="Avg" value={t.avg != null ? `${t.avg}%` : '—'} className={pctTone(t.avg)} />
        <Metric label="Pass rate" value={t.passRate != null ? `${t.passRate}%` : '—'} className={pctTone(t.passRate)} />
        <Metric label="Top" value={t.highest != null ? `${t.highest}/${t.maxMarks}` : '—'} className="text-slate-800" />
      </div>

      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="inline-flex items-center gap-1 text-slate-500"><Users className="h-3.5 w-3.5" /> Marks entered</span>
          <span className="font-semibold text-slate-700">{t.entered}/{total}</span>
        </div>
        <Progress value={enteredPct} tone="brand" />
      </div>
    </button>
  );
}

function Metric({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <p className={clsx('text-base font-extrabold', className)}>{value}</p>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
}

/** Create / edit test modal — shared with TestDetail. */
export function TestFormModal({ open, onClose, batches, presetBatchId, initial, onSaved }: {
  open: boolean; onClose: () => void; batches: Batch[]; presetBatchId?: string;
  initial?: { _id: string; subject: string; topic?: string; maxMarks: number; date: string; batchId: string };
  onSaved: (id: string) => void;
}) {
  const editing = !!initial;
  const [batchId, setBatchId] = useState('');
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [maxMarks, setMaxMarks] = useState('50');
  const [date, setDate] = useState(ymd());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setBatchId(initial.batchId);
      setSubject(initial.subject);
      setTopic(initial.topic ?? '');
      setMaxMarks(String(initial.maxMarks));
      setDate(ymd(new Date(initial.date)));
    } else {
      const b = batches.find((x) => x._id === presetBatchId) ?? null;
      setBatchId(b?._id ?? '');
      setSubject(b?.subject ?? '');
      setTopic('');
      setMaxMarks('50');
      setDate(ymd());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?._id, presetBatchId, batches.length]);

  const pickBatch = (id: string) => {
    const prev = batches.find((x) => x._id === batchId);
    const next = batches.find((x) => x._id === id);
    setBatchId(id);
    if (next?.subject && (!subject || subject === prev?.subject)) setSubject(next.subject);
  };

  const submit = async () => {
    if (!batchId) return toast.error('Select a batch');
    if (!subject.trim()) return toast.error('Enter the subject');
    if (!(Number(maxMarks) > 0)) return toast.error('Enter valid maximum marks');
    setSaving(true);
    const body = { batchId, subject: subject.trim(), topic: topic.trim(), maxMarks: Number(maxMarks), date };
    try {
      const { data } = editing ? await api.put<{ _id: string }>(`/tests/${initial!._id}`, body) : await api.post<{ _id: string }>('/tests', body);
      toast.success(editing ? 'Test updated' : 'Test created');
      onClose();
      onSaved(data._id);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit test' : 'Create test'} subtitle={editing ? undefined : 'Schedule a test for a batch'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={submit} icon={<BookOpen className="h-4 w-4" />}>{editing ? 'Save changes' : 'Create test'}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="Batch" value={batchId} onChange={(e) => pickBatch(e.target.value)} disabled={editing} className="sm:col-span-2">
          <option value="">Select batch…</option>
          {batches.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
        </Select>
        <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Mathematics" />
        <Input label="Topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Quadratic Equations" />
        <Input label="Max marks" type="number" min={1} value={maxMarks} onChange={(e) => setMaxMarks(e.target.value)} />
        <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      {!editing && (
        <p className="mt-4 flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-2 text-xs text-brand-700">
          <Trophy className="h-4 w-4" /> After the test, open it to enter marks and publish results to parents.
        </p>
      )}
    </Modal>
  );
}
