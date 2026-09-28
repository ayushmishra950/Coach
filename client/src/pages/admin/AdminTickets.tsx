import { ArrowLeft, Building2, Flag, LifeBuoy, MessageSquare, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, PageHeader, Skeleton, StatusBadge, Tabs, clsx, type BadgeTone } from '../../components/ui';
import { Pager } from '../../components/Pager';
import { usePagedApi } from '../../hooks/useApi';
import { api, errMsg } from '../../lib/api';
import { fmtDateTime, timeAgo } from '../../lib/format';

type TicketStatus = 'open' | 'in_progress' | 'resolved';
interface Ticket {
  _id: string;
  instituteId: { _id: string; name: string; city?: string; plan?: string } | null;
  subject: string; message: string; priority: 'low' | 'normal' | 'high'; status: TicketStatus;
  replies: { by: string; text: string; at: string }[];
  createdAt: string; updatedAt: string;
}

const PRIORITY_TONE: Record<Ticket['priority'], BadgeTone> = { high: 'red', normal: 'blue', low: 'gray' };

/** Replies the owner posts from their side are stored as "Name (institute)". */
const isInstituteReply = (by?: string) => !!by && by.includes('(institute)');

function PriorityBadge({ p }: { p: Ticket['priority'] }) {
  return <Badge tone={PRIORITY_TONE[p]} className="capitalize"><Flag className="h-3 w-3" />{p}</Badge>;
}

export default function AdminTickets() {
  const [filter, setFilter] = useState<'all' | TicketStatus>('all');
  // Status filter is applied server-side; changing it jumps back to page 1.
  const list = usePagedApi<Ticket, { counts: Partial<Record<TicketStatus, number>> }>('/admin/tickets', { status: filter });
  const { data, loading, error, reload, setData } = list;
  // The open ticket stays visible even when it is not on the current page / filter.
  const [pinned, setPinned] = useState<Ticket | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [status, setStatus] = useState<TicketStatus>('open');
  const [saving, setSaving] = useState(false);

  const tickets = data?.items ?? [];
  const selected = tickets.find((t) => t._id === selectedId) ?? (pinned && pinned._id === selectedId ? pinned : null);
  const count = (s: TicketStatus) => data?.counts?.[s] ?? 0;
  const countAll = count('open') + count('in_progress') + count('resolved');

  const select = (t: Ticket | null) => {
    setSelectedId(t?._id ?? null);
    setPinned(t);
  };

  // Auto-select first ticket on desktop.
  useEffect(() => {
    if (!selectedId && tickets.length && window.matchMedia('(min-width: 1024px)').matches) select(tickets[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets, selectedId]);

  useEffect(() => {
    if (selected) setStatus(selected.status);
    setReply('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const submit = async () => {
    if (!selected) return;
    const body: { status?: TicketStatus; reply?: string } = {};
    if (status !== selected.status) body.status = status;
    if (reply.trim()) body.reply = reply.trim();
    if (!body.status && !body.reply) return toast.error('Write a reply or change the status');
    setSaving(true);
    try {
      const res = await api.put<Ticket>(`/admin/tickets/${selected._id}`, body);
      const prevStatus = selected.status;
      const patch = { status: res.data.status, replies: res.data.replies };
      setData((prev) => {
        if (!prev) return prev;
        const counts = { ...prev.counts };
        if (patch.status !== prevStatus) {
          counts[prevStatus] = Math.max(0, (counts[prevStatus] ?? 0) - 1);
          counts[patch.status] = (counts[patch.status] ?? 0) + 1;
        }
        return { ...prev, counts, items: prev.items.map((t) => (t._id === selected._id ? { ...t, ...patch } : t)) };
      });
      setPinned((p) => (p && p._id === selected._id ? { ...p, ...patch } : p));
      // On a filtered tab the ticket may no longer belong here — refresh the list and totals.
      if (filter !== 'all' && patch.status !== prevStatus) reload();
      setReply('');
      toast.success(body.reply ? 'Reply sent' : 'Ticket updated');
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader title="Support tickets" subtitle="Help institutes get unblocked — reply and track resolution."
        actions={<div className="flex gap-2"><Badge tone="amber">{count('open')} open</Badge><Badge tone="blue">{count('in_progress')} in progress</Badge></div>} />

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          {/* List */}
          <Card pad={false} className={clsx('overflow-hidden', selected && 'hidden lg:block')}>
            <div className="border-b border-slate-100 p-3">
              <Tabs className="w-full" value={filter} onChange={setFilter} tabs={[
                { value: 'all', label: 'All', count: countAll },
                { value: 'open', label: 'Open', count: count('open') },
                { value: 'in_progress', label: 'In progress', count: count('in_progress') },
                { value: 'resolved', label: 'Resolved', count: count('resolved') },
              ]} />
            </div>
            {loading && !data ? (
              <div className="space-y-2 p-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
            ) : tickets.length === 0 ? (
              <EmptyState icon={<LifeBuoy className="h-7 w-7" />} title="No tickets" text="Nothing here — nice work!" />
            ) : (
              <ul className={clsx('max-h-[70vh] divide-y divide-slate-100 overflow-y-auto scrollbar-thin', loading && 'opacity-60')}>
                {tickets.map((t) => (
                  <li key={t._id}>
                    <button onClick={() => select(t)}
                      className={clsx('w-full border-l-4 px-4 py-3 text-left transition hover:bg-slate-50',
                        t._id === selectedId ? 'border-brand-500 bg-brand-50/50' : 'border-transparent')}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="line-clamp-1 font-semibold text-slate-900">{t.subject}</p>
                        <span className="shrink-0 text-[11px] text-slate-400">{timeAgo(t.createdAt)}</span>
                      </div>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500"><Building2 className="h-3 w-3" />{t.instituteId?.name ?? 'Unknown institute'}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={t.status} />
                        <PriorityBadge p={t.priority} />
                        {t.replies.length > 0 && <span className="flex items-center gap-1 text-[11px] text-slate-400"><MessageSquare className="h-3 w-3" />{t.replies.length}</span>}
                        {t.status !== 'resolved' && isInstituteReply(t.replies.at(-1)?.by) && <Badge tone="amber">Awaiting support</Badge>}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {list.pager && <Pager {...list.pager} noun="tickets" />}
          </Card>

          {/* Detail */}
          <Card pad={false} className={clsx('flex min-h-[420px] flex-col', !selected && 'hidden lg:flex')}>
            {!selected ? (
              <div className="grid flex-1 place-items-center">
                <EmptyState icon={<MessageSquare className="h-7 w-7" />} title="Select a ticket" text="Choose a ticket from the list to view the conversation." />
              </div>
            ) : (
              <>
                <div className="border-b border-slate-100 p-5">
                  <button className="mb-3 flex items-center gap-1 text-sm font-semibold text-brand-600 lg:hidden" onClick={() => select(null)}>
                    <ArrowLeft className="h-4 w-4" /> All tickets
                  </button>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">{selected.subject}</h2>
                      <p className="mt-0.5 text-sm text-slate-500">
                        {selected.instituteId?.name}{selected.instituteId?.city ? ` · ${selected.instituteId.city}` : ''}
                        {selected.instituteId?.plan && <span className="capitalize"> · {selected.instituteId.plan} plan</span>}
                      </p>
                    </div>
                    <div className="flex gap-1.5"><StatusBadge status={selected.status} /><PriorityBadge p={selected.priority} /></div>
                  </div>
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto p-5 scrollbar-thin">
                  <div className="flex gap-3">
                    <Avatar name={selected.instituteId?.name ?? 'Institute'} size="sm" />
                    <div className="max-w-[85%]">
                      <div className="whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-slate-100 px-4 py-3 text-sm text-slate-800">{selected.message}</div>
                      <p className="mt-1 text-[11px] text-slate-400">{selected.instituteId?.name} · {fmtDateTime(selected.createdAt)}</p>
                    </div>
                  </div>
                  {selected.replies.map((r, i) =>
                    isInstituteReply(r.by) ? (
                      <div key={i} className="flex gap-3">
                        <Avatar name={selected.instituteId?.name ?? 'Institute'} size="sm" />
                        <div className="max-w-[85%]">
                          <div className="whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-slate-100 px-4 py-3 text-sm text-slate-800">{r.text}</div>
                          <p className="mt-1 text-[11px] text-slate-400">{r.by.replace(/\s*\(institute\)\s*$/, '')} · {selected.instituteId?.name ?? 'Institute'} · {fmtDateTime(r.at)}</p>
                        </div>
                      </div>
                    ) : (
                      <div key={i} className="flex flex-row-reverse gap-3">
                        <Avatar name={r.by || 'Support'} size="sm" color="#6366f1" />
                        <div className="flex max-w-[85%] flex-col items-end">
                          <div className="whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-gradient-to-br from-brand-600 to-violet-600 px-4 py-3 text-sm text-white">{r.text}</div>
                          <p className="mt-1 text-[11px] text-slate-400">{r.by} · {fmtDateTime(r.at)}</p>
                        </div>
                      </div>
                    ),
                  )}
                  {selected.replies.length === 0 && <p className="text-center text-xs text-slate-400">No replies yet.</p>}
                </div>

                <div className="border-t border-slate-100 p-4">
                  <textarea className="input min-h-[90px]" placeholder="Write a reply to the institute…" value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); if (!saving) submit(); } }} />
                  <p className="mt-1.5 text-xs text-slate-500">The institute owner is notified when you reply or mark the ticket resolved.</p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</span>
                      <select className="input w-44 py-2" value={status} onChange={(e) => setStatus(e.target.value as TicketStatus)}>
                        <option value="open">Open</option>
                        <option value="in_progress">In progress</option>
                        <option value="resolved">Resolved</option>
                      </select>
                    </div>
                    <Button loading={saving} icon={<Send className="h-4 w-4" />} onClick={submit}>{reply.trim() ? 'Send reply' : 'Update status'}</Button>
                  </div>
                </div>
              </>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
