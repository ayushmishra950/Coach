import { FolderOpen, Paperclip, Plus, Upload } from 'lucide-react';
import { KIND_META, MaterialRow, type MaterialItem } from '../../components/MaterialRow';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Pager } from '../../components/Pager';
import { Button, Card, ConfirmDialog, EmptyState, ErrorState, Input, Modal, PageHeader, Select, Skeleton, Tabs, Textarea, clsx } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useApi, usePagedApi } from '../../hooks/useApi';
import { api, errMsg } from '../../lib/api';
import { MAX_UPLOAD_MB, fmtSize, uploadFile } from '../../lib/files';

interface BatchOpt { _id: string; name: string; subject?: string }
type Kind = 'all' | MaterialItem['kind'];

/** Owner / teacher: upload PDF notes, recorded lectures (file or YouTube link), assignments. Parents see them in the portal. */
export default function Materials() {
  const { session } = useAuth();
  const [batchId, setBatchId] = useState('');
  const [kind, setKind] = useState<Kind>('all');
  const batches = useApi<BatchOpt[]>('/batches/options', { active: 'true' });
  const { data, error, reload, pager } = usePagedApi<MaterialItem>('/academics/materials', { batchId: batchId || undefined, kind: kind === 'all' ? undefined : kind });
  const [addOpen, setAddOpen] = useState(false);
  const [del, setDel] = useState<MaterialItem | null>(null);

  const remove = async () => {
    if (!del) return;
    try {
      await api.delete(`/academics/materials/${del._id}`);
      toast.success('Removed');
      setDel(null);
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  return (
    <div>
      <PageHeader title="Study material" subtitle="Notes, recorded lectures and assignments — parents and students see them in the portal"
        actions={<Button icon={<Upload className="h-4 w-4" />} onClick={() => setAddOpen(true)}>Upload</Button>} />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Select value={batchId} onChange={(e) => setBatchId(e.target.value)} className="sm:w-64" aria-label="Batch">
          <option value="">All my batches</option>
          {batches.data?.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
        </Select>
        <Tabs<Kind> value={kind} onChange={setKind} tabs={[{ value: 'all', label: 'All' }, ...(['notes', 'video', 'assignment', 'link'] as const).map((k) => ({ value: k as Kind, label: KIND_META[k].label }))]} />
      </div>
      <Card pad={false} className="overflow-hidden">
        {error ? <ErrorState message={error} onRetry={reload} /> : !data ? <Skeleton className="h-64" /> : data.items.length === 0 ? (
          <EmptyState icon={<FolderOpen className="h-7 w-7" />} title="Nothing uploaded yet" text="Upload PDF notes, a recorded lecture, or paste a YouTube / Google Drive link." action={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setAddOpen(true)}>Upload</Button>} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.items.map((m) => <MaterialRow key={m._id} m={m} onDelete={session?.user.role === 'owner' || m.uploadedBy === session?.user.id ? () => setDel(m) : undefined} />)}
          </ul>
        )}
        {pager && <Pager {...pager} noun="items" />}
      </Card>
      <UploadModal open={addOpen} onClose={() => setAddOpen(false)} batches={batches.data ?? []} defaultBatch={batchId} onSaved={reload} />
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={remove} danger title={`Remove "${del?.title ?? ''}"?`} confirmLabel="Remove" text="Parents and students will no longer see it." />
    </div>
  );
}

function UploadModal({ open, onClose, batches, defaultBatch, onSaved }: { open: boolean; onClose: () => void; batches: BatchOpt[]; defaultBatch: string; onSaved: () => void }) {
  const [f, setF] = useState({ title: '', description: '', subject: '', kind: 'notes' as MaterialItem['kind'], url: '', dueDate: '' });
  const { session } = useAuth();
  const [sel, setSel] = useState<string[]>([]);
  const [mode, setMode] = useState<'all' | 'pick'>('pick');
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    setF({ title: '', description: '', subject: '', kind: 'notes', url: '', dueDate: '' });
    setSel(defaultBatch ? [defaultBatch] : batches.length === 1 ? [batches[0]._id] : []);
    setMode(defaultBatch || batches.length !== 1 ? 'pick' : 'all');
    setFile(null);
    setProgress(null);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!f.title.trim()) return toast.error('Add a title');
    const batchIds = mode === 'all' ? batches.map((b) => b._id) : sel;
    if (!batchIds.length) return toast.error(batches.length ? 'Pick at least one batch' : 'No batch to share with yet');
    if (!file && !f.url.trim() && f.kind !== 'assignment') return toast.error('Choose a file or paste a link');
    setSaving(true);
    try {
      let fileId: string | undefined;
      if (file) {
        setProgress(0);
        fileId = (await uploadFile(file, { onProgress: setProgress }))._id;
      }
      await api.post('/academics/materials', { ...f, batchIds, fileId, url: f.url.trim() || undefined, dueDate: f.kind === 'assignment' ? f.dueDate || undefined : undefined });
      toast.success('Shared with parents & students');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(errMsg(err, (err as Error).message));
    } finally {
      setSaving(false);
      setProgress(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="lg" title="Share study material"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="mat-form" loading={saving} icon={<Upload className="h-4 w-4" />}>{progress != null ? `Uploading ${progress}%` : 'Share'}</Button></>}>
      <form id="mat-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(['notes', 'video', 'assignment', 'link'] as const).map((k) => {
            const M = KIND_META[k];
            return (
              <button type="button" key={k} onClick={() => setF({ ...f, kind: k })}
                className={clsx('flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold', f.kind === k ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600')}>
                <M.icon className="h-4 w-4" />{M.label}
              </button>
            );
          })}
        </div>
        <Input label="Title *" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={f.kind === 'assignment' ? 'e.g. Chapter 3 exercise' : 'e.g. Electrostatics – full notes'} autoFocus />
        <Input label="Subject" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} />
        <Textarea label={f.kind === 'assignment' ? 'Instructions' : 'Description'} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={3} className="sm:col-span-2" />
        {f.kind === 'assignment' && <Input label="Due date" type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />}
        <div className="sm:col-span-2">
          <p className="label">{f.kind === 'link' ? 'Link' : f.kind === 'video' ? 'Video file or YouTube / Drive link' : 'File (PDF, Word, PowerPoint, image)'}</p>
          {f.kind !== 'link' && (
            <div className="mb-2 flex items-center gap-2">
              <Button type="button" variant="secondary" size="sm" icon={<Paperclip className="h-3.5 w-3.5" />} onClick={() => ref.current?.click()}>{file ? 'Change file' : 'Choose file'}</Button>
              <span className="truncate text-sm text-slate-600">{file ? `${file.name} · ${fmtSize(file.size)}` : `Up to ${MAX_UPLOAD_MB} MB`}</span>
              <input ref={ref} type="file" className="hidden" accept={f.kind === 'video' ? 'video/*' : '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,image/*,.txt,.zip'} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
          )}
          {(f.kind === 'link' || f.kind === 'video' || f.kind === 'assignment') && (
            <input className="input" placeholder="https://youtube.com/… or https://drive.google.com/…" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} />
          )}
          {progress != null && <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-brand-500 transition-all" style={{ width: `${progress}%` }} /></div>}
        </div>
        <div className="sm:col-span-2 rounded-xl border border-slate-200 p-3">
          <p className="label">Share with *</p>
          {batches.length === 0 ? (
            <p className="text-sm text-amber-600">No batches available{session?.user.role === 'teacher' ? ' — ask the owner to assign your batches (Teachers → Edit → Batches).' : ' — create a batch first from the Batches page.'}</p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => setMode('all')}
                  className={clsx('rounded-xl border px-3 py-1.5 text-sm font-semibold', mode === 'all' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600')}>
                  All {session?.user.role === 'teacher' ? 'my ' : ''}batches ({batches.length})
                </button>
                <button type="button" onClick={() => setMode('pick')}
                  className={clsx('rounded-xl border px-3 py-1.5 text-sm font-semibold', mode === 'pick' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600')}>
                  Specific batches{mode === 'pick' && sel.length ? ` (${sel.length})` : ''}
                </button>
              </div>
              {mode === 'pick' && (
                <div className="grid max-h-56 gap-1 overflow-y-auto sm:grid-cols-2">
                  {batches.map((b) => {
                    const on = sel.includes(b._id);
                    return (
                      <label key={b._id} className={clsx('flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm', on ? 'bg-brand-50 text-brand-800' : 'hover:bg-slate-50')}>
                        <input type="checkbox" checked={on} onChange={() => setSel((x) => (on ? x.filter((y) => y !== b._id) : [...x, b._id]))} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
                        <span className="truncate">{b.name}{b.subject ? <span className="text-slate-400"> · {b.subject}</span> : null}</span>
                      </label>
                    );
                  })}
                </div>
              )}
              <p className="mt-2 text-xs text-slate-400">Only parents & students of the chosen batches see this.</p>
            </>
          )}
        </div>
      </form>
    </Modal>
  );
}
