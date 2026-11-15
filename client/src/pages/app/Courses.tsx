import { BookOpenCheck, Clock, Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Input, Modal, PageHeader, Skeleton, Textarea, Toggle, clsx } from '../../components/ui';
import { useApi, useClientPage } from '../../hooks/useApi';
import { Pager } from '../../components/Pager';
import { api, errMsg } from '../../lib/api';
import { fmtTime, inr } from '../../lib/format';

export interface Course {
  _id: string; name: string; category?: string; description?: string; duration?: string; fee?: number; feeNote?: string;
  syllabus: string[]; highlights: string[]; public: boolean; active: boolean; order: number;
  batchIds: { _id: string; name: string; days?: string[]; startTime?: string; endTime?: string }[];
}
interface BatchOpt { _id: string; name: string }

/** Owner: courses with fees, duration and syllabus — shown on the public website and used for enquiries. */
export default function Courses() {
  const { data, error, reload } = useApi<Course[]>('/academics/courses');
  const page = useClientPage(data);
  const [edit, setEdit] = useState<Course | 'new' | null>(null);
  const [del, setDel] = useState<Course | null>(null);

  const remove = async () => {
    if (!del) return;
    try {
      await api.delete(`/academics/courses/${del._id}`);
      toast.success('Course deleted');
      setDel(null);
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  return (
    <div>
      <PageHeader title="Courses" subtitle="Fees, duration and syllabus for each course — shown on your admissions website"
        actions={<><Link to="/app/website" className="btn-secondary">Website</Link><Button icon={<Plus className="h-4 w-4" />} onClick={() => setEdit('new')}>Add course</Button></>} />
      {error ? <ErrorState message={error} onRetry={reload} /> : !data ? <Skeleton className="h-64" /> : data.length === 0 ? (
        <Card><EmptyState icon={<BookOpenCheck className="h-7 w-7" />} title="No courses yet" text="Add courses like “Class 10 Board”, “JEE 2-year” or “NEET Crash” with their fees and syllabus." action={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setEdit('new')}>Add course</Button>} /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {page.items.map((c) => (
            <div key={c._id} className={clsx('card card-pad flex flex-col', !c.active && 'opacity-60')}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  {c.category && <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">{c.category}</p>}
                  <h3 className="text-lg font-bold text-slate-900">{c.name}</h3>
                </div>
                {c.public ? <Badge tone="green"><Eye className="h-3 w-3" />On website</Badge> : <Badge><EyeOff className="h-3 w-3" />Hidden</Badge>}
              </div>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                {c.fee != null && <span className="text-2xl font-extrabold text-slate-900">{inr(c.fee)}</span>}
                {c.feeNote && <span className="text-xs text-slate-500">{c.feeNote}</span>}
                {c.duration && <span className="inline-flex items-center gap-1 text-sm text-slate-600"><Clock className="h-3.5 w-3.5" />{c.duration}</span>}
              </div>
              {c.description && <p className="mt-2 line-clamp-3 text-sm text-slate-600">{c.description}</p>}
              {c.syllabus.length > 0 && <p className="mt-3 text-xs text-slate-500"><b>{c.syllabus.length}</b> syllabus topics · {c.syllabus.slice(0, 3).join(', ')}{c.syllabus.length > 3 ? '…' : ''}</p>}
              {c.batchIds.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {c.batchIds.map((b) => <Badge key={b._id} tone="brand">{b.name}{b.startTime ? ` · ${fmtTime(b.startTime)}` : ''}</Badge>)}
                </div>
              )}
              <div className="mt-auto flex justify-end gap-1 pt-4">
                <Button size="sm" variant="ghost" icon={<Trash2 className="h-3.5 w-3.5" />} className="text-rose-600" onClick={() => setDel(c)}>Delete</Button>
                <Button size="sm" variant="secondary" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEdit(c)}>Edit</Button>
              </div>
            </div>
          ))}
        </div>
      )}
      {data && data.length > 0 && <Card pad={false} className="mt-4 overflow-hidden"><Pager {...page.pager} noun="courses" /></Card>}
      <CourseModal course={edit} onClose={() => setEdit(null)} onSaved={reload} />
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={remove} danger title={`Delete ${del?.name ?? ''}?`} confirmLabel="Delete" text="Enquiries that mention this course keep its name." />
    </div>
  );
}

function CourseModal({ course, onClose, onSaved }: { course: Course | 'new' | null; onClose: () => void; onSaved: () => void }) {
  const batches = useApi<BatchOpt[]>(course ? '/batches/options' : null, { active: 'true' });
  const [f, setF] = useState({ name: '', category: '', description: '', duration: '', fee: '', feeNote: '', syllabus: '', highlights: '', public: true, active: true, order: '0', batchIds: [] as string[] });
  const [saving, setSaving] = useState(false);
  const c = course && course !== 'new' ? course : null;
  useEffect(() => {
    if (!course) return;
    setF({
      name: c?.name ?? '', category: c?.category ?? '', description: c?.description ?? '', duration: c?.duration ?? '', fee: c?.fee != null ? String(c.fee) : '',
      feeNote: c?.feeNote ?? '', syllabus: c?.syllabus.join('\n') ?? '', highlights: c?.highlights.join('\n') ?? '', public: c?.public ?? true, active: c?.active ?? true,
      order: String(c?.order ?? 0), batchIds: c?.batchIds.map((b) => b._id) ?? [],
    });
  }, [course]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { ...f, syllabus: f.syllabus.split('\n'), highlights: f.highlights.split('\n') };
      if (c) await api.put(`/academics/courses/${c._id}`, body);
      else await api.post('/academics/courses', body);
      toast.success('Course saved');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={!!course} onClose={onClose} size="lg" title={c ? `Edit ${c.name}` : 'Add course'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="course-form" loading={saving}>Save course</Button></>}>
      <form id="course-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Input label="Course name *" value={f.name} onChange={set('name')} placeholder="e.g. Class 10 Board Prep" autoFocus />
        <Input label="Category" value={f.category} onChange={set('category')} placeholder="e.g. School, JEE, NEET" />
        <Input label="Fee (₹)" type="number" min={0} value={f.fee} onChange={set('fee')} />
        <Input label="Fee note" value={f.feeNote} onChange={set('feeNote')} placeholder="per year · 3 installments" />
        <Input label="Duration" value={f.duration} onChange={set('duration')} placeholder="e.g. 10 months" />
        <Input label="Display order" type="number" value={f.order} onChange={set('order')} hint="Lower shows first" />
        <Textarea label="About the course" value={f.description} onChange={set('description')} rows={3} className="sm:col-span-2" />
        <Textarea label="Syllabus (one topic per line)" value={f.syllabus} onChange={set('syllabus')} rows={6} placeholder={'Real Numbers\nPolynomials\nQuadratic Equations'} />
        <Textarea label="Highlights (one per line)" value={f.highlights} onChange={set('highlights')} rows={6} placeholder={'Weekly tests\nDoubt sessions\nPrinted notes'} />
        <div className="sm:col-span-2">
          <p className="label">Batches for this course (timings are shown on the website)</p>
          <div className="flex flex-wrap gap-2">
            {batches.data?.map((b) => {
              const on = f.batchIds.includes(b._id);
              return <button type="button" key={b._id} onClick={() => setF((p) => ({ ...p, batchIds: on ? p.batchIds.filter((x) => x !== b._id) : [...p.batchIds, b._id] }))}
                className={clsx('rounded-full px-3 py-1 text-xs font-semibold ring-1', on ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-600 ring-slate-200')}>{b.name}</button>;
            })}
            {batches.data?.length === 0 && <span className="text-xs text-slate-400">No batches yet</span>}
          </div>
        </div>
        <Toggle checked={f.public} onChange={(v) => setF({ ...f, public: v })} label="Show on website" />
        <Toggle checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="Active (taking admissions)" />
      </form>
    </Modal>
  );
}
