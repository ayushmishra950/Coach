import { Check, Globe, Megaphone, Pin, PinOff, Send, Trash2, Users } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import {
  Avatar, Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, ErrorState, Input, PageHeader, Skeleton, Textarea, Toggle, clsx,
} from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../hooks/useApi';
import { api, errMsg } from '../../lib/api';
import { fmtDateTime, timeAgo } from '../../lib/format';
import type { Announcement, Batch } from '../../lib/types';

export default function Announcements() {
  const { session } = useAuth();
  const isOwner = session?.user.role === 'owner';
  const { data, loading, error, reload } = useApi<Announcement[]>('/announcements');
  const { data: batches } = useApi<Batch[]>('/batches');
  const [toDelete, setToDelete] = useState<Announcement | null>(null);
  const [deleting, setDeleting] = useState(false);

  const togglePin = async (a: Announcement) => {
    try {
      await api.put(`/announcements/${a._id}/pin`);
      toast.success(a.pinned ? 'Unpinned' : 'Pinned to top');
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/announcements/${toDelete._id}`);
      toast.success('Announcement deleted');
      setToDelete(null);
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setDeleting(false);
    }
  };

  const items = [...(data ?? [])].sort((a, b) => Number(b.pinned) - Number(a.pinned) || +new Date(b.createdAt) - +new Date(a.createdAt));

  return (
    <div>
      <PageHeader title="Announcements" subtitle={isOwner ? 'Share updates with parents across the institute or specific batches' : 'Share updates with parents of your batches'} />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Composer isOwner={isOwner} batches={(batches ?? []).filter((b) => b.active !== false)} onSent={reload} />
        </div>
        <div className="lg:col-span-3">
          <Card pad={false}>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h3 className="flex items-center gap-2 font-bold text-slate-900"><Megaphone className="h-4 w-4 text-brand-600" /> Feed</h3>
              <span className="text-xs text-slate-400">{items.length} announcement{items.length === 1 ? '' : 's'}</span>
            </div>
            {loading && !data ? (
              <div className="space-y-4 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}</div>
            ) : error ? (
              <div className="p-5"><ErrorState message={error} onRetry={reload} /></div>
            ) : items.length === 0 ? (
              <EmptyState icon={<Megaphone className="h-7 w-7" />} title="No announcements yet" text="Your first announcement will show up here and be sent to parents." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {items.map((a) => {
                  const canDelete = isOwner || a.createdBy === session?.user.id;
                  return (
                    <li key={a._id} className={clsx('group px-5 py-4 transition', a.pinned && 'bg-amber-50/50')}>
                      <div className="flex items-start gap-3">
                        <Avatar name={a.createdByName || 'Staff'} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {a.pinned && <span title="Pinned">📌</span>}
                            <h4 className="font-bold text-slate-900">{a.title}</h4>
                          </div>
                          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-600">{a.body}</p>
                          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                            {a.batchIds?.length ? (
                              a.batchIds.map((b) => <Badge key={b._id} tone="brand">{b.name}</Badge>)
                            ) : (
                              <Badge tone="green"><Globe className="h-3 w-3" /> Everyone</Badge>
                            )}
                            <span className="text-xs text-slate-400" title={fmtDateTime(a.createdAt)}>· {a.createdByName ?? 'Staff'} · {timeAgo(a.createdAt)}</span>
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          {isOwner && (
                            <button onClick={() => togglePin(a)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-amber-600" title={a.pinned ? 'Unpin' : 'Pin'}>
                              {a.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                            </button>
                          )}
                          {canDelete && (
                            <button onClick={() => setToDelete(a)} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Delete">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        loading={deleting}
        danger
        title="Delete announcement?"
        text={<>“{toDelete?.title}” will be removed from the feed. Notifications already sent to parents will not be recalled.</>}
        confirmLabel="Delete"
      />
    </div>
  );
}

function Composer({ isOwner, batches, onSent }: { isOwner: boolean; batches: Batch[]; onSent: () => void }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [everyone, setEveryone] = useState(isOwner);
  const [selected, setSelected] = useState<string[]>([]);
  const [pinned, setPinned] = useState(false);
  const [sending, setSending] = useState(false);

  const toggleBatch = (id: string) => {
    setEveryone(false);
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return toast.error('Please add a title and message');
    const batchIds = everyone ? [] : selected;
    if (!isOwner && !batchIds.length) return toast.error('Select at least one of your batches');
    if (isOwner && !everyone && !batchIds.length) return toast.error('Choose "Everyone" or at least one batch');
    setSending(true);
    try {
      const { data } = await api.post<{ recipients: number }>('/announcements', { title: title.trim(), body: body.trim(), batchIds, pinned: isOwner && pinned });
      toast.success(`Sent to ${data.recipients} parent${data.recipients === 1 ? '' : 's'}`);
      setTitle('');
      setBody('');
      setSelected([]);
      setPinned(false);
      setEveryone(isOwner);
      onSent();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="lg:sticky lg:top-24">
      <CardHeader title="New announcement" subtitle="Parents are notified in-app and on WhatsApp (if enabled)" icon={<Send className="h-4 w-4" />} />
      <form onSubmit={submit} className="space-y-4">
        <Input label="Title" placeholder="e.g. Holiday on Monday" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
        <Textarea label="Message" placeholder="Write your announcement…" value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={1000} />
        <div>
          <span className="label">Audience</span>
          <div className="flex flex-wrap gap-2">
            {isOwner && (
              <Chip active={everyone} onClick={() => { setEveryone(true); setSelected([]); }}>
                <Globe className="h-3.5 w-3.5" /> Everyone
              </Chip>
            )}
            {batches.map((b) => (
              <Chip key={b._id} active={!everyone && selected.includes(b._id)} onClick={() => toggleBatch(b._id)} color={b.color}>
                {b.name}
              </Chip>
            ))}
            {!batches.length && !isOwner && <p className="text-sm text-slate-400">You have no batches assigned yet.</p>}
          </div>
          {!everyone && selected.length > 0 && (
            <p className="mt-2 flex items-center gap-1 text-xs text-slate-500"><Users className="h-3.5 w-3.5" /> {selected.length} batch{selected.length > 1 ? 'es' : ''} selected</p>
          )}
        </div>
        {isOwner && <Toggle checked={pinned} onChange={setPinned} label="📌 Pin to top" description="Pinned announcements stay above others" />}
        <Button type="submit" className="w-full" loading={sending} icon={<Send className="h-4 w-4" />}>Send announcement</Button>
      </form>
    </Card>
  );
}

function Chip({ active, onClick, children, color }: { active: boolean; onClick: () => void; children: React.ReactNode; color?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition',
        active ? 'border-brand-500 bg-brand-600 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:text-brand-700',
      )}
    >
      {active ? <Check className="h-3.5 w-3.5" /> : color && <span className="h-2 w-2 rounded-full" style={{ background: color }} />}
      {children}
    </button>
  );
}
