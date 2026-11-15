import { CalendarOff, Check, Phone, X } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { Pager } from '../../components/Pager';
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, Modal, PageHeader, Skeleton, Tabs, type BadgeTone } from '../../components/ui';
import { usePagedApi } from '../../hooks/useApi';
import { api, errMsg } from '../../lib/api';
import { fmtDate, timeAgo } from '../../lib/format';

interface Leave {
  _id: string; from: string; to: string; reason: string; status: 'pending' | 'approved' | 'rejected' | 'cancelled'; createdAt: string;
  reviewedByName?: string; reviewNote?: string; reviewedAt?: string;
  studentId: { _id: string; name: string; studentCode: string; parentName?: string; parentPhone?: string } | null;
}
type Filter = 'pending' | 'approved' | 'rejected' | 'all';
const TONE: Record<Leave['status'], BadgeTone> = { pending: 'amber', approved: 'green', rejected: 'red', cancelled: 'gray' };

const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1;

/** Owner / teacher: leave applications sent by parents from the portal. */
export default function Leaves() {
  const [filter, setFilter] = useState<Filter>('pending');
  const { data, error, reload, pager } = usePagedApi<Leave, { pending: number }>('/academics/leaves', { status: filter === 'all' ? undefined : filter });
  const [review, setReview] = useState<{ l: Leave; status: 'approved' | 'rejected' } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!review) return;
    setBusy(true);
    try {
      await api.put(`/academics/leaves/${review.l._id}`, { status: review.status, note });
      toast.success(review.status === 'approved' ? 'Leave approved — parent notified' : 'Leave rejected — parent notified');
      setReview(null);
      setNote('');
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Leave requests" subtitle="Parents apply for their child's leave from the portal. Approved leave shows on the attendance sheet." />
      <Tabs<Filter> className="mb-5" value={filter} onChange={setFilter} tabs={[
        { value: 'pending', label: 'Pending', count: data?.pending }, { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' }, { value: 'all', label: 'All' },
      ]} />
      <Card pad={false} className="overflow-hidden">
        {error ? <ErrorState message={error} onRetry={reload} /> : !data ? <Skeleton className="h-48" /> : data.items.length === 0 ? (
          <EmptyState icon={<CalendarOff className="h-7 w-7" />} title={filter === 'pending' ? 'No pending requests' : 'Nothing here'} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.items.map((l) => (
              <li key={l._id} className="flex flex-wrap items-start gap-3 px-5 py-4">
                <Avatar name={l.studentId?.name ?? '?'} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">
                    {l.studentId ? <Link to={`/app/students/${l.studentId._id}`} className="hover:text-brand-600">{l.studentId.name}</Link> : 'Student'}
                    <span className="ml-2 font-normal text-slate-500">
                      {l.from === l.to ? fmtDate(l.from, { weekday: 'short', day: 'numeric', month: 'short' }) : `${fmtDate(l.from, { day: 'numeric', month: 'short' })} – ${fmtDate(l.to, { day: 'numeric', month: 'short' })}`}
                      {' '}({days(l.from, l.to)} day{days(l.from, l.to) > 1 ? 's' : ''})
                    </span>
                  </p>
                  <p className="mt-0.5 text-sm text-slate-700">{l.reason}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {l.studentId?.parentName ?? 'Parent'} · {timeAgo(l.createdAt)}
                    {l.reviewedByName && ` · ${l.status} by ${l.reviewedByName}${l.reviewNote ? ` — “${l.reviewNote}”` : ''}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {l.studentId?.parentPhone && <a href={`tel:${l.studentId.parentPhone}`} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-brand-600" title="Call parent"><Phone className="h-4 w-4" /></a>}
                  {l.status === 'pending' ? (
                    <>
                      <Button size="sm" variant="secondary" icon={<X className="h-3.5 w-3.5" />} onClick={() => setReview({ l, status: 'rejected' })}>Reject</Button>
                      <Button size="sm" variant="success" icon={<Check className="h-3.5 w-3.5" />} onClick={() => setReview({ l, status: 'approved' })}>Approve</Button>
                    </>
                  ) : <Badge tone={TONE[l.status]} className="capitalize">{l.status}</Badge>}
                </div>
              </li>
            ))}
          </ul>
        )}
        {pager && <Pager {...pager} noun="requests" />}
      </Card>
      <Modal open={!!review} onClose={() => setReview(null)} size="sm" title={review?.status === 'approved' ? 'Approve leave' : 'Reject leave'} subtitle={review?.l.studentId?.name}
        footer={<><Button variant="secondary" onClick={() => setReview(null)}>Cancel</Button><Button variant={review?.status === 'approved' ? 'success' : 'danger'} loading={busy} onClick={submit}>{review?.status === 'approved' ? 'Approve' : 'Reject'}</Button></>}>
        <textarea className="input" rows={3} placeholder="Note for the parent (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
      </Modal>
    </div>
  );
}
