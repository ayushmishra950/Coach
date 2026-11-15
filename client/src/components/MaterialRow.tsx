import { ExternalLink, FileText, Link2, ListChecks, Paperclip, Trash2, Video } from 'lucide-react';
import { fmtSize, openFile } from '../lib/files';
import { fmtDate, timeAgo } from '../lib/format';
import { Badge, Button, clsx } from './ui';

export interface MaterialItem {
  _id: string; title: string; description?: string; subject?: string; kind: 'notes' | 'video' | 'assignment' | 'link';
  fileId?: string; fileName?: string; fileSize?: number; mime?: string; url?: string; dueDate?: string;
  uploadedBy?: string; uploadedByName?: string; createdAt: string; batchIds: { _id: string; name: string; color?: string }[];
}
export const KIND_META: Record<MaterialItem['kind'], { label: string; icon: typeof FileText; cls: string }> = {
  notes: { label: 'Notes', icon: FileText, cls: 'bg-sky-50 text-sky-600' },
  video: { label: 'Recorded lecture', icon: Video, cls: 'bg-rose-50 text-rose-600' },
  assignment: { label: 'Assignment', icon: ListChecks, cls: 'bg-amber-50 text-amber-600' },
  link: { label: 'Link', icon: Link2, cls: 'bg-violet-50 text-violet-600' },
};

export function MaterialRow({ m, onDelete, showBatches = true }: { m: MaterialItem; onDelete?: () => void; showBatches?: boolean }) {
  const meta = KIND_META[m.kind] ?? KIND_META.notes;
  const overdue = m.kind === 'assignment' && m.dueDate && new Date(m.dueDate) < new Date(new Date().toDateString());
  return (
    <li className="flex flex-wrap items-start gap-3 px-5 py-4">
      <div className={clsx('grid h-10 w-10 shrink-0 place-items-center rounded-xl', meta.cls)}><meta.icon className="h-5 w-5" /></div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-slate-900">{m.title}</p>
        <p className="text-xs text-slate-500">
          {meta.label}{m.subject && ` · ${m.subject}`} · {m.uploadedByName ?? 'Staff'} · {timeAgo(m.createdAt)}
          {m.dueDate && <span className={clsx('font-semibold', overdue ? 'text-rose-600' : 'text-amber-600')}> · Due {fmtDate(m.dueDate, { day: 'numeric', month: 'short' })}</span>}
        </p>
        {m.description && <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{m.description}</p>}
        {showBatches && <div className="mt-1.5 flex flex-wrap gap-1">{m.batchIds.map((b) => <Badge key={b._id} tone="brand">{b.name}</Badge>)}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {m.fileId && <Button size="sm" variant="secondary" icon={<Paperclip className="h-3.5 w-3.5" />} onClick={() => openFile(m.fileId!, m.fileName, m.mime)}>{m.mime?.startsWith('video/') ? 'Watch' : 'Open'}{m.fileSize ? ` · ${fmtSize(m.fileSize)}` : ''}</Button>}
        {m.url && <a href={m.url} target="_blank" rel="noreferrer noopener" className="btn-secondary btn-sm"><ExternalLink className="h-3.5 w-3.5" />{m.kind === 'video' ? 'Watch' : 'Open link'}</a>}
        {onDelete && <button onClick={onDelete} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Remove"><Trash2 className="h-4 w-4" /></button>}
      </div>
    </li>
  );
}

