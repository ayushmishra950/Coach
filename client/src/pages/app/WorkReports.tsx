import { AlertTriangle, CheckCheck, ClipboardList, Eye, MessageSquare } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Pager } from '../../components/Pager';
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, Input, Modal, PageHeader, Select, Skeleton, Tabs, Textarea, clsx } from '../../components/ui';
import { WorkActivityList } from '../../components/WorkActivity';
import { useSocketEvent } from '../../context/RealtimeContext';
import { useApi, usePagedApi } from '../../hooks/useApi';
import { api, errMsg } from '../../lib/api';
import { fmtDate, fmtDateTime, timeAgo, ymd } from '../../lib/format';
import { teacherOf, type WorkActivity, type WorkReport } from '../../lib/workReports';

type Status = 'all' | 'unseen' | 'seen';
type ListResp = { unseen: number; missing?: { _id: string; name: string }[] };

/** Owner: every teacher's daily work report — read, reply and mark as seen. Updates live. */
export default function WorkReports() {
  const [params, setParams] = useSearchParams();
  const [date, setDate] = useState(params.get('date') ?? '');
  const [status, setStatus] = useState<Status>('all');
  const [teacherId, setTeacherId] = useState('');
  const teachers = useApi<{ _id: string; name: string }[]>('/teachers/options');
  const list = usePagedApi<WorkReport, ListResp>('/work-reports', { date: date || undefined, status: status === 'all' ? undefined : status, teacherId: teacherId || undefined });
  const [open, setOpen] = useState<WorkReport | null>(null);

  // A teacher just sent a report → refresh quietly.
  useSocketEvent('report:new', () => list.reload());

  const seenAll = async () => {
    try {
      const { data } = await api.post<{ updated: number }>('/work-reports/seen-all', { date: date || undefined });
      toast.success(data.updated ? `${data.updated} report${data.updated > 1 ? 's' : ''} marked as seen` : 'Nothing new');
      list.reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const pickDate = (d: string) => {
    setDate(d);
    if (d) params.set('date', d);
    else params.delete('date');
    setParams(params, { replace: true });
  };

  const d = list.data;
  return (
    <div>
      <PageHeader title="Teacher work reports" subtitle="What each teacher did every day — classes, tests, homework and other work."
        actions={(d?.unseen ?? 0) > 0 && <Button variant="secondary" icon={<CheckCheck className="h-4 w-4" />} onClick={seenAll}>Mark {date ? "this day's" : 'all'} as seen</Button>} />
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <Tabs<Status> value={status} onChange={setStatus} tabs={[{ value: 'all', label: 'All' }, { value: 'unseen', label: 'Not seen', count: d?.unseen }, { value: 'seen', label: 'Seen' }]} />
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" value={date} max={ymd()} onChange={(e) => pickDate(e.target.value)} className="w-40" aria-label="Date" />
          <Button size="sm" variant={date === ymd() ? 'primary' : 'secondary'} onClick={() => pickDate(date === ymd() ? '' : ymd())}>Today</Button>
          <Select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className="w-52" aria-label="Teacher">
            <option value="">All teachers</option>
            {teachers.data?.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
          </Select>
        </div>
      </div>

      {d?.missing && d.missing.length > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span><b>No report yet for {fmtDate(date)}:</b> {d.missing.map((m) => m.name).join(', ')}</span>
        </div>
      )}

      <Card pad={false} className="overflow-hidden">
        {list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : !d ? <Skeleton className="h-64" /> : d.items.length === 0 ? (
          <EmptyState icon={<ClipboardList className="h-7 w-7" />} title="No reports" text={date ? 'No teacher has sent a report for this day yet.' : 'Teachers send their daily report from "Daily report" in their menu.'} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {d.items.map((r) => (
              <li key={r._id}>
                <button type="button" onClick={() => setOpen(r)} className={clsx('flex w-full items-start gap-3 px-5 py-4 text-left hover:bg-slate-50', !r.seenAt && 'bg-brand-50/30')}>
                  <Avatar name={teacherOf(r)} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900">{teacherOf(r)} <span className="text-xs font-normal text-slate-400">· {fmtDate(r.date)} · sent {timeAgo(r.submittedAt)}</span></p>
                    <p className="mt-0.5 line-clamp-2 text-sm text-slate-600">
                      {r.classes.map((c) => `${c.batchName ?? ''}${c.batchName && c.topic ? ': ' : ''}${c.topic}`).join(' · ') || r.otherWork || r.tests || r.homework}
                    </p>
                    {r.issues && <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-rose-600"><AlertTriangle className="h-3.5 w-3.5" />{r.issues}</p>}
                  </div>
                  {r.seenAt ? <Badge tone="green">Seen</Badge> : <Badge tone="amber">New</Badge>}
                </button>
              </li>
            ))}
          </ul>
        )}
        {list.pager && <Pager {...list.pager} noun="reports" />}
      </Card>
      <ReportModal report={open} onClose={() => setOpen(null)} onSaved={list.reload} />
    </div>
  );
}

function ReportModal({ report, onClose, onSaved }: { report: WorkReport | null; onClose: () => void; onSaved: () => void }) {
  const detail = useApi<{ report: WorkReport; activity: WorkActivity | null }>(report ? `/work-reports/${report._id}` : null);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const r = detail.data?.report ?? report;

  const markSeen = async () => {
    if (!r) return;
    setSaving(true);
    try {
      await api.post(`/work-reports/${r._id}/seen`, comment.trim() ? { comment: comment.trim() } : {});
      toast.success(comment.trim() ? 'Reply sent to the teacher' : 'Marked as seen');
      setComment('');
      onSaved();
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const block = (label: string, text?: string) => (text ? <div><p className="label">{label}</p><p className="whitespace-pre-wrap text-sm text-slate-700">{text}</p></div> : null);
  return (
    <Modal open={!!report} onClose={onClose} size="lg" title={r ? `${teacherOf(r)} — ${fmtDate(r.date)}` : ''}
      subtitle={r ? (r.seenAt ? `Seen ${fmtDateTime(r.seenAt)}${r.seenByName ? ` by ${r.seenByName}` : ''}` : `Sent ${fmtDateTime(r.submittedAt)}`) : ''}
      footer={<><Button variant="secondary" onClick={onClose}>Close</Button><Button loading={saving} onClick={markSeen} icon={comment.trim() ? <MessageSquare className="h-4 w-4" /> : <Eye className="h-4 w-4" />}>{comment.trim() ? 'Send reply' : r?.seenAt ? 'OK' : 'Mark as seen'}</Button></>}>
      {r && (
        <div className="space-y-4">
          {r.classes.length > 0 && (
            <div>
              <p className="label">Classes taken</p>
              <ul className="space-y-1">{r.classes.map((c, i) => <li key={i} className="text-sm text-slate-700"><b>{c.batchName ?? '—'}</b>{c.topic ? ` — ${c.topic}` : ''}</li>)}</ul>
            </div>
          )}
          {block('Tests / quizzes', r.tests)}
          {block('Homework given', r.homework)}
          {block('Other work', r.otherWork)}
          {r.issues && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800"><b>Needs attention:</b> {r.issues}</div>}
          <WorkActivityList a={detail.data?.activity} />
          {r.ownerComment && <div className="rounded-xl bg-violet-50 px-4 py-3 text-sm text-violet-800"><b>Your reply:</b> {r.ownerComment}</div>}
          <Textarea label={r.ownerComment ? 'Change reply (optional)' : 'Reply to the teacher (optional)'} rows={2} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="e.g. Good work — please finish chapter 5 by Friday" />
        </div>
      )}
    </Modal>
  );
}
