import { Check, Globe, Lock, Megaphone, Pencil, Pin, PinOff, Send, Trash2, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Avatar, Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, ErrorState, Input, Modal, PageHeader, Skeleton, Textarea, Toggle, clsx,
} from '../../components/ui';
import { Pager } from '../../components/Pager';
import { useAuth } from '../../context/AuthContext';
import { useApi, usePagedApi } from '../../hooks/useApi';
import { api, errMsg } from '../../lib/api';
import { fmtDateTime, timeAgo } from '../../lib/format';
import type { Announcement } from '../../lib/types';

interface BatchOption { _id: string; name: string; color?: string }
/** Announcement with the newer server fields. */
type Item = Announcement & { staffOnly?: boolean; editedAt?: string };

export default function Announcements() {
  const { session } = useAuth();
  const isOwner = session?.user.role === 'owner';
  const list = usePagedApi<Item>('/announcements');
  const { data, loading, error, reload, page, setPage } = list;
  const { data: batches } = useApi<BatchOption[]>('/batches/options', { active: 'true' });
  const [toDelete, setToDelete] = useState<Item | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [edit, setEdit] = useState({ title: '', body: '' });
  const [savingEdit, setSavingEdit] = useState(false);

  const openEdit = (a: Item) => {
    setEditing(a);
    setEdit({ title: a.title, body: a.body });
  };
  const saveEdit = async () => {
    if (!editing) return;
    if (!edit.title.trim() || !edit.body.trim()) return toast.error('Please add a title and message');
    setSavingEdit(true);
    try {
      await api.put(`/announcements/${editing._id}`, { title: edit.title.trim(), body: edit.body.trim() });
      toast.success('Announcement updated');
      setEditing(null);
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSavingEdit(false);
    }
  };

  const togglePin = async (a: Item) => {
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

  // Server orders pinned first, then newest; one page of 20 at a time.
  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  // (usePagedApi steps back automatically when a delete empties the last page.)

  // A new announcement lands at the top of page 1.
  const onSent = () => (page === 1 ? reload() : setPage(1));

  return (
    <div>
      <PageHeader title="Announcements" subtitle={isOwner ? 'Share updates with parents across the institute or specific batches' : 'Share updates with parents of your batches'} />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Composer isOwner={isOwner} batches={batches ?? []} onSent={onSent} />
        </div>
        <div className="lg:col-span-3">
          <Card pad={false}>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h3 className="flex items-center gap-2 font-bold text-slate-900"><Megaphone className="h-4 w-4 text-brand-600" /> Feed</h3>
              <span className="text-xs text-slate-400">{total} announcement{total === 1 ? '' : 's'}</span>
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
                  const canEdit = canDelete;
                  return (
                    <li key={a._id} className={clsx('group px-5 py-4 transition', a.pinned && 'bg-amber-50/50')}>
                      <div className="flex items-start gap-3">
                        <Avatar name={a.createdByName || 'Staff'} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {a.pinned && <span title="Pinned">📌</span>}
                            <h4 className="font-bold text-slate-900">{a.title}</h4>
                            {a.staffOnly && <Badge tone="amber"><Lock className="h-3 w-3" /> Staff only</Badge>}
                          </div>
                          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-600">{a.body}</p>
                          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                            {a.batchIds?.length ? (
                              a.batchIds.map((b) => <Badge key={b._id} tone="brand">{b.name}</Badge>)
                            ) : (
                              <Badge tone="green"><Globe className="h-3 w-3" /> Everyone</Badge>
                            )}
                            <span className="text-xs text-slate-400" title={fmtDateTime(a.createdAt)}>· {a.createdByName ?? 'Staff'} · {timeAgo(a.createdAt)}{a.editedAt && <span title={fmtDateTime(a.editedAt)}> · edited</span>}</span>
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          {isOwner && (
                            <button onClick={() => togglePin(a)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-amber-600" title={a.pinned ? 'Unpin' : 'Pin'}>
                              {a.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                            </button>
                          )}
                          {canEdit && (
                            <button onClick={() => openEdit(a)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-brand-600" title="Edit">
                              <Pencil className="h-4 w-4" />
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
            {list.pager && <Pager {...list.pager} noun="announcements" />}
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
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit announcement" subtitle="Fixes appear in the feed. The announcement is not sent to parents again."
        footer={<><Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button loading={savingEdit} onClick={saveEdit}>Save changes</Button></>}>
        <div className="space-y-4">
          <Input label="Title" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} maxLength={150} />
          <Textarea label="Message" value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} rows={6} maxLength={3000} />
        </div>
      </Modal>
    </div>
  );
}

function Composer({ isOwner, batches, onSent }: { isOwner: boolean; batches: BatchOption[]; onSent: () => void }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [everyone, setEveryone] = useState(isOwner);
  const [selected, setSelected] = useState<string[]>([]);
  const [pinned, setPinned] = useState(false);
  const [staffOnly, setStaffOnly] = useState(false);
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
      const isStaff = isOwner && staffOnly;
      const { data } = await api.post<{ recipients: number }>('/announcements', { title: title.trim(), body: body.trim(), batchIds, pinned: isOwner && pinned, staffOnly: isStaff });
      const n = data.recipients ?? 0;
      toast.success(isStaff ? 'Posted for staff only — not sent to parents' : n > 0 ? `Posted — sending to ${n} famil${n === 1 ? 'y' : 'ies'} in the background` : 'Posted — no families to notify in this audience');
      setTitle('');
      setBody('');
      setSelected([]);
      setPinned(false);
      setStaffOnly(false);
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
        <Input label="Title" placeholder="e.g. Holiday on Monday" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} />
        <Textarea label="Message" placeholder="Write your announcement…" value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={3000} />
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
        {isOwner && <Toggle checked={staffOnly} onChange={setStaffOnly} label="Staff only (don't send to parents)" description="Only you and your teachers will see it" />}
        <Button type="submit" className="w-full" loading={sending} icon={<Send className="h-4 w-4" />}>{isOwner && staffOnly ? 'Post for staff' : 'Send announcement'}</Button>
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
