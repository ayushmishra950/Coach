import { Bell, CheckCheck, Info, Mail, MessageCircle, Send, Smartphone, type LucideIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { NOTIF_ICON } from '../../components/NotificationBell';
import { Pager } from '../../components/Pager';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Skeleton, Tabs, clsx, type BadgeTone } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { usePagedApi } from '../../hooks/useApi';
import { api, errMsg } from '../../lib/api';
import { fmtDateTime, timeAgo } from '../../lib/format';
import type { Notification } from '../../lib/types';

type NType = Notification['type'];
type Channel = Notification['deliveries'][number]['channel'];
type DStatus = Notification['deliveries'][number]['status'];
type Filter = 'all' | 'unread' | NType;

const TYPE_LABEL: Record<NType, string> = { attendance: 'Attendance', fee: 'Fees', payment: 'Payments', test: 'Tests', announcement: 'Announcements', system: 'System' };
const CHANNELS: { key: Channel; label: string; icon: LucideIcon; cls: string }[] = [
  { key: 'inApp', label: 'In-app', icon: Bell, cls: 'bg-brand-50 text-brand-600' },
  { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, cls: 'bg-green-50 text-green-600' },
  { key: 'email', label: 'Email', icon: Mail, cls: 'bg-sky-50 text-sky-600' },
  { key: 'sms', label: 'SMS', icon: Smartphone, cls: 'bg-amber-50 text-amber-600' },
];
const STATUS_TONE: Record<DStatus, BadgeTone> = { sent: 'green', queued: 'blue', failed: 'red', skipped: 'gray' };
const AUD_TONE: Record<Notification['audience'], BadgeTone> = { parent: 'violet', staff: 'blue', owner: 'brand' };

interface LogExtra { byChannel: { channel: Channel; status: DStatus; count: number }[] }

function Inbox() {
  const [filter, setFilter] = useState<Filter>('all');
  // Type / unread filters run on the server, so every page of a filter is complete.
  const list = usePagedApi<Notification, { unread: number; counts: Record<string, number> }>('/notifications', {
    type: filter !== 'all' && filter !== 'unread' ? filter : undefined,
    unread: filter === 'unread' ? '1' : undefined,
  });
  const { data, loading, error, reload, setData } = list;
  const [marking, setMarking] = useState(false);

  const items = useMemo(() => data?.items ?? [], [data]);
  const counts = data?.counts ?? {};
  const shown = items;

  const markAll = async () => {
    setMarking(true);
    try {
      await api.put('/notifications/read-all');
      if (data) setData({ ...data, items: data.items.map((n) => ({ ...n, read: true })), unread: 0 });
      if (filter === 'unread') reload();
      toast.success('All caught up');
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setMarking(false);
    }
  };

  const markOne = async (n: Notification) => {
    if (n.read || !data) return;
    setData({ ...data, items: data.items.map((x) => (x._id === n._id ? { ...x, read: true } : x)), unread: Math.max(0, data.unread - 1) });
    api.put(`/notifications/${n._id}/read`).catch(() => {});
  };

  if (error) return <ErrorState message={error} onRetry={reload} />;

  const tabs: { value: Filter; label: string; count?: number }[] = [
    { value: 'all', label: 'All', count: counts.all ?? 0 },
    { value: 'unread', label: 'Unread', count: data?.unread ?? 0 },
    ...(Object.keys(TYPE_LABEL) as NType[]).filter((t) => (counts[t] ?? 0) > 0 || filter === t).map((t) => ({ value: t as Filter, label: TYPE_LABEL[t], count: counts[t] ?? 0 })),
  ];

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs tabs={tabs} value={filter} onChange={setFilter} />
        <Button variant="secondary" size="sm" loading={marking} disabled={!data?.unread} icon={<CheckCheck className="h-4 w-4" />} onClick={markAll}>Mark all read</Button>
      </div>
      <Card pad={false} className="overflow-hidden">
        {loading && !data ? (
          <div className="space-y-3 p-5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
        ) : shown.length === 0 ? (
          <EmptyState title={filter === 'unread' ? "You're all caught up 🎉" : filter === 'all' ? 'No notifications yet' : 'Nothing here yet'} text="Alerts about attendance, fees, tests and announcements will show up here." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {shown.map((n) => {
              const I = NOTIF_ICON[n.type] ?? NOTIF_ICON.system;
              return (
                <li key={n._id} onClick={() => markOne(n)}
                  className={clsx('flex cursor-pointer gap-4 px-5 py-4 transition hover:bg-slate-50', !n.read && 'bg-brand-50/40')}>
                  <div className={clsx('grid h-11 w-11 shrink-0 place-items-center rounded-2xl', I.cls)}><I.icon className="h-5 w-5" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={clsx('text-sm text-slate-900', n.read ? 'font-semibold' : 'font-bold')}>{n.title}</p>
                      <Badge tone="gray">{TYPE_LABEL[n.type] ?? n.type}</Badge>
                    </div>
                    <p className="mt-0.5 text-sm text-slate-600">{n.message}</p>
                    <p className="mt-1.5 text-xs text-slate-400">{timeAgo(n.createdAt)}{n.studentId?.name && <> · {n.studentId.name}</>}</p>
                  </div>
                  {!n.read && <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-brand-500" />}
                </li>
              );
            })}
          </ul>
        )}
        {list.pager && <Pager {...list.pager} noun="notifications" />}
      </Card>
    </div>
  );
}

function MessageLog() {
  const [type, setType] = useState<'all' | NType>('all');
  const [audience, setAudience] = useState<'all' | Notification['audience']>('all');
  const list = usePagedApi<Notification, LogExtra>('/notifications/log', { type, audience });
  const { data, loading, error, reload } = list;

  const summary = useMemo(() => {
    const m: Record<string, { total: number; byStatus: Partial<Record<DStatus, number>> }> = {};
    (data?.byChannel ?? []).forEach((x) => {
      m[x.channel] ??= { total: 0, byStatus: {} };
      m[x.channel].total += x.count;
      m[x.channel].byStatus[x.status] = (m[x.channel].byStatus[x.status] ?? 0) + x.count;
    });
    return m;
  }, [data]);

  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div className="space-y-5">
      <div className="flex gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" />
        <p>
          In-app notifications work now and are delivered instantly. <b>WhatsApp, SMS and email need a provider connected by your CoachFlow administrator</b> —
          until then, those messages are shown here as “queued” or “skipped”.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {CHANNELS.map((c) => {
          const s = summary[c.key];
          return (
            <div key={c.key} className="card p-4">
              <div className="flex items-center gap-3">
                <div className={clsx('grid h-10 w-10 place-items-center rounded-xl', c.cls)}><c.icon className="h-5 w-5" /></div>
                <div>
                  <p className="text-xs font-semibold text-slate-500">{c.label}</p>
                  <p className="text-xl font-extrabold text-slate-900">{loading && !data ? '…' : s?.total ?? 0}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {s ? (Object.entries(s.byStatus) as [DStatus, number][]).map(([st, n]) => (
                  <Badge key={st} tone={STATUS_TONE[st]} className="capitalize">{n} {st}</Badge>
                )) : <span className="text-xs text-slate-400">No messages</span>}
              </div>
            </div>
          );
        })}
      </div>

      <Card pad={false} className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 font-bold text-slate-900"><Send className="h-4 w-4 text-brand-600" /> Outbound messages</p>
          <div className="flex gap-2">
            <select className="input py-2" value={type} onChange={(e) => setType(e.target.value as 'all' | NType)}>
              <option value="all">All types</option>
              {(Object.keys(TYPE_LABEL) as NType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </select>
            <select className="input py-2" value={audience} onChange={(e) => setAudience(e.target.value as 'all' | Notification['audience'])}>
              <option value="all">All audiences</option>
              <option value="parent">Parents</option>
              <option value="staff">Staff</option>
              <option value="owner">Owner</option>
            </select>
          </div>
        </div>
        {loading && !data ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : !data?.items.length ? (
          <EmptyState title="No messages found" text="Messages sent to parents and staff will be logged here." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Sent</th><th>Message</th><th>Audience</th><th>Student</th><th>Delivery</th></tr></thead>
              <tbody>
                {data.items.map((n) => {
                  const I = NOTIF_ICON[n.type] ?? NOTIF_ICON.system;
                  return (
                    <tr key={n._id}>
                      <td className="text-xs text-slate-500">{fmtDateTime(n.createdAt)}</td>
                      <td className="!whitespace-normal">
                        <div className="flex min-w-[240px] max-w-md items-start gap-3">
                          <div className={clsx('grid h-8 w-8 shrink-0 place-items-center rounded-lg', I.cls)}><I.icon className="h-4 w-4" /></div>
                          <div>
                            <p className="font-semibold text-slate-800">{n.title}</p>
                            <p className="line-clamp-2 text-xs text-slate-500">{n.message}</p>
                          </div>
                        </div>
                      </td>
                      <td><Badge tone={AUD_TONE[n.audience]} className="capitalize">{n.audience}</Badge></td>
                      <td className="text-slate-700">{n.studentId?.name ?? '—'}</td>
                      <td>
                        <div className="flex flex-wrap gap-1.5">
                          {n.deliveries.map((d, i) => {
                            const ch = CHANNELS.find((c) => c.key === d.channel);
                            const Icon = ch?.icon ?? Bell;
                            return (
                              <span key={i} title={[d.to, d.info].filter(Boolean).join(' · ') || undefined}>
                                <Badge tone={STATUS_TONE[d.status]}><Icon className="h-3 w-3" />{ch?.label ?? d.channel} · {d.status}</Badge>
                              </span>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {list.pager && <Pager {...list.pager} noun="messages" />}
      </Card>
    </div>
  );
}

export default function Notifications() {
  const { session } = useAuth();
  const isOwner = session?.user.role === 'owner';
  const [view, setView] = useState<'inbox' | 'log'>('inbox');
  return (
    <div className="animate-fade-up">
      <PageHeader title="Notifications" subtitle={isOwner ? 'Your alerts and every message sent to parents & staff' : 'Alerts about your batches and students'}
        actions={isOwner ? (
          <Tabs value={view} onChange={setView} tabs={[
            { value: 'inbox', label: <><Bell className="h-4 w-4" /> Inbox</> },
            { value: 'log', label: <><Send className="h-4 w-4" /> Message log</> },
          ]} />
        ) : undefined} />
      {isOwner && view === 'log' ? <MessageLog /> : <Inbox />}
    </div>
  );
}
