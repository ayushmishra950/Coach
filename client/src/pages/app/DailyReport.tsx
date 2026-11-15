import { CheckCheck, ClipboardEdit, Eye, Plus, Send, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Pager } from '../../components/Pager';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Input, PageHeader, Select, Skeleton, Textarea } from '../../components/ui';
import { WorkActivityList } from '../../components/WorkActivity';
import { useApi, usePagedApi } from '../../hooks/useApi';
import { api, errMsg } from '../../lib/api';
import { fmtDate, fmtDateTime, ymd } from '../../lib/format';
import type { WorkActivity, WorkReport } from '../../lib/workReports';

interface Today { date: string; report: WorkReport | null; activity: WorkActivity; batches: { _id: string; name: string; subject?: string }[] }
type ClassRow = { batchId: string; topic: string };

/** Teacher: write today's work report (classes taught, tests, homework, other work) and see past ones. */
export default function DailyReport() {
  const [date, setDate] = useState(ymd());
  const today = useApi<Today>('/work-reports/me/today', { date });
  const history = usePagedApi<WorkReport>('/work-reports/me');
  const [classes, setClasses] = useState<ClassRow[]>([{ batchId: '', topic: '' }]);
  const [f, setF] = useState({ tests: '', homework: '', otherWork: '', issues: '' });
  const [saving, setSaving] = useState(false);
  const rep = today.data?.report ?? null;
  const locked = !!rep?.seenAt;

  useEffect(() => {
    if (!today.data) return;
    const r = today.data.report;
    setClasses(r?.classes.length ? r.classes.map((c) => ({ batchId: c.batchId ?? '', topic: c.topic ?? '' })) : [{ batchId: '', topic: '' }]);
    setF({ tests: r?.tests ?? '', homework: r?.homework ?? '', otherWork: r?.otherWork ?? '', issues: r?.issues ?? '' });
  }, [today.data]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const list = classes.filter((c) => c.batchId || c.topic.trim());
    if (!list.length && !f.tests.trim() && !f.homework.trim() && !f.otherWork.trim()) return toast.error('Write what you did — classes, tests, homework or other work');
    setSaving(true);
    try {
      await api.put('/work-reports/me/today', { date, classes: list, ...f });
      toast.success(rep ? 'Report updated' : 'Report sent to the owner');
      today.reload();
      history.reload();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  const setRow = (i: number, patch: Partial<ClassRow>) => setClasses((p) => p.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const minDate = ymd(new Date(Date.now() - 3 * 86400000));

  return (
    <div>
      <PageHeader title="Daily work report" subtitle="Tell the owner what you did today — classes, tests, homework and anything else." />
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title={date === ymd() ? "Today's report" : `Report for ${fmtDate(date)}`} icon={<ClipboardEdit className="h-5 w-5" />}
            subtitle={rep ? (locked ? `Seen by ${rep.seenByName ?? 'owner'} · ${fmtDateTime(rep.seenAt)}` : `Sent ${fmtDateTime(rep.submittedAt)} — you can still edit it until the owner sees it`) : 'Not sent yet'}
            action={<Input type="date" value={date} min={minDate} max={ymd()} onChange={(e) => e.target.value && setDate(e.target.value)} className="w-40" aria-label="Report date" />} />
          {today.error ? <ErrorState message={today.error} onRetry={today.reload} /> : !today.data ? <Skeleton className="h-72" /> : (
            <form onSubmit={submit} className="space-y-4">
              {rep?.ownerComment && <div className="rounded-xl bg-violet-50 px-4 py-3 text-sm text-violet-800"><b>{rep.seenByName ?? 'Owner'}:</b> {rep.ownerComment}</div>}
              <div>
                <p className="label">Classes taken & topics covered</p>
                <div className="space-y-2">
                  {classes.map((c, i) => (
                    <div key={i} className="flex flex-col gap-2 sm:flex-row">
                      <Select value={c.batchId} onChange={(e) => setRow(i, { batchId: e.target.value })} disabled={locked} className="sm:w-56" aria-label="Batch">
                        <option value="">Batch…</option>
                        {today.data!.batches.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
                      </Select>
                      <input className="input flex-1" placeholder="Topic taught, e.g. Quadratic equations — factorisation" value={c.topic} disabled={locked} maxLength={300}
                        onChange={(e) => setRow(i, { topic: e.target.value })} />
                      {!locked && classes.length > 1 && (
                        <button type="button" onClick={() => setClasses((p) => p.filter((_, j) => j !== i))} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
                      )}
                    </div>
                  ))}
                </div>
                {!locked && classes.length < 20 && <Button type="button" variant="ghost" size="sm" className="mt-2" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setClasses((p) => [...p, { batchId: '', topic: '' }])}>Add class</Button>}
                {today.data.batches.length === 0 && <p className="mt-1 text-xs text-amber-600">No batches are assigned to you yet — you can still write the topic.</p>}
              </div>
              <Textarea label="Tests / quizzes taken" rows={2} value={f.tests} disabled={locked} maxLength={1000} onChange={(e) => setF({ ...f, tests: e.target.value })} placeholder="e.g. Chapter 4 class test in Class 10 — A, checked copies" />
              <Textarea label="Homework given" rows={2} value={f.homework} disabled={locked} maxLength={1000} onChange={(e) => setF({ ...f, homework: e.target.value })} placeholder="e.g. Exercise 4.2 Q1–10" />
              <Textarea label="Other work" rows={2} value={f.otherWork} disabled={locked} maxLength={2000} onChange={(e) => setF({ ...f, otherWork: e.target.value })} placeholder="Doubt sessions, notes prepared, parent calls, admin work…" />
              <Textarea label="Issues / needs attention" rows={2} value={f.issues} disabled={locked} maxLength={1000} onChange={(e) => setF({ ...f, issues: e.target.value })} placeholder="Optional — anything the owner should know" />
              <WorkActivityList a={today.data.activity} />
              {!locked && <div className="flex justify-end"><Button type="submit" loading={saving} icon={<Send className="h-4 w-4" />}>{rep ? 'Update report' : 'Send report'}</Button></div>}
            </form>
          )}
        </Card>

        <Card pad={false} className="overflow-hidden lg:col-span-2">
          <div className="card-pad pb-2"><CardHeader title="My past reports" icon={<CheckCheck className="h-5 w-5" />} /></div>
          {history.error ? <ErrorState message={history.error} onRetry={history.reload} /> : !history.data ? <Skeleton className="m-4 h-40" /> : history.data.items.length === 0 ? (
            <EmptyState title="No reports yet" text="Your sent reports show up here." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {history.data.items.map((r) => (
                <li key={r._id}>
                  <button type="button" onClick={() => setDate(r.date)} className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{fmtDate(r.date)}</p>
                      <p className="truncate text-xs text-slate-500">{[r.classes.length && `${r.classes.length} class${r.classes.length > 1 ? 'es' : ''}`, r.tests && 'tests', r.homework && 'homework', r.otherWork && 'other work'].filter(Boolean).join(' · ') || '—'}</p>
                    </div>
                    {r.seenAt ? <Badge tone="green"><Eye className="mr-1 inline h-3 w-3" />Seen</Badge> : <Badge tone="amber">Not seen</Badge>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {history.pager && <Pager {...history.pager} noun="reports" />}
        </Card>
      </div>
    </div>
  );
}
