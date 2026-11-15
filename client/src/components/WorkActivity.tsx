import { BookCheck, CalendarCheck, ClipboardList, FolderOpen } from 'lucide-react';
import type { WorkActivity } from '../lib/workReports';

/** "Recorded in the app today" — facts the owner can check the report against. */
export function WorkActivityList({ a }: { a: WorkActivity | null | undefined }) {
  if (!a) return null;
  const rows = [
    ...a.attendance.map((x) => ({ icon: CalendarCheck, text: `Attendance marked: ${x.batch} (${x.present}/${x.total} present)` })),
    ...a.topics.map((x) => ({ icon: BookCheck, text: `Syllabus done: ${x.title} — ${x.batch}` })),
    ...a.tests.map((x) => ({ icon: ClipboardList, text: `Test created: ${x.subject}${x.topic ? ` · ${x.topic}` : ''}${x.batch ? ` — ${x.batch}` : ''}${x.mode === 'online' ? ' (online)' : ''}` })),
    ...a.materials.map((x) => ({ icon: FolderOpen, text: `Study material shared: ${x.title}` })),
  ];
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Recorded in the app that day</p>
      {rows.length === 0 ? <p className="text-xs text-slate-400">Nothing recorded in the app for this day.</p> : (
        <ul className="space-y-1">
          {rows.map((r, i) => <li key={i} className="flex items-start gap-2 text-xs text-slate-600"><r.icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />{r.text}</li>)}
        </ul>
      )}
    </div>
  );
}
