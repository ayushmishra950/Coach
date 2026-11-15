import { ArrowRight, CalendarOff, ClipboardCheck, UserPlus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSocketEvent } from '../context/RealtimeContext';
import { useApi } from '../hooks/useApi';

/** Owner dashboard strip: enquiries to follow up today and leave requests waiting for a decision. */
export function AdmissionsOverview() {
  const leads = useApi<{ counts: Record<string, number> }>('/leads', { status: 'followup' });
  const leaves = useApi<{ pending: number }>('/academics/leaves', { status: 'pending' });
  // New website enquiry / demo booking or leave request → update the strip live.
  useSocketEvent('lead:new', () => leads.reload());
  useSocketEvent<{ type: string }>('notification:new', (n) => {
    if (n.type === 'leave') leaves.reload();
  });
  const c = leads.data?.counts ?? {};
  const items = [
    { n: c.followup ?? 0, text: 'enquiries to follow up today', to: '/app/leads', icon: UserPlus, cls: 'bg-violet-50 text-violet-700' },
    { n: c.new ?? 0, text: 'new enquiries not contacted yet', to: '/app/leads', icon: UserPlus, cls: 'bg-sky-50 text-sky-700' },
    { n: leaves.data?.pending ?? 0, text: 'leave requests waiting', to: '/app/leaves', icon: CalendarOff, cls: 'bg-amber-50 text-amber-700' },
  ].filter((x) => x.n > 0);
  if (!items.length) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {items.map((x) => (
        <Link key={x.text} to={x.to} className={`flex items-center gap-3 rounded-2xl p-4 transition hover:brightness-95 ${x.cls}`}>
          <x.icon className="h-5 w-5 shrink-0" />
          <p className="flex-1 text-sm"><b className="text-lg">{x.n}</b> {x.text}</p>
          <ArrowRight className="h-4 w-4" />
        </Link>
      ))}
    </div>
  );
}

/** Teacher dashboard: leave requests from parents of their students that need a decision. */
export function TeacherAlerts() {
  const leaves = useApi<{ pending: number }>('/academics/leaves', { status: 'pending' });
  const report = useApi<{ report: { ownerComment?: string } | null }>('/work-reports/me/today');
  const n = leaves.data?.pending ?? 0;
  // After noon, remind the teacher to send today's work report.
  const needReport = !!report.data && !report.data.report && new Date().getHours() >= 12;
  const reply = report.data?.report?.ownerComment;
  if (!n && !needReport && !reply) return null;
  return (
    <div className="grid gap-3">
      {needReport && (
        <Link to="/app/daily-report" className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-800 transition hover:brightness-95">
          <ClipboardCheck className="h-5 w-5 shrink-0" />
          <p className="flex-1 text-sm">Send today's <b>work report</b> to the owner — classes taken, tests, homework.</p>
          <ArrowRight className="h-4 w-4" />
        </Link>
      )}
      {reply && (
        <Link to="/app/daily-report" className="flex items-center gap-3 rounded-2xl bg-violet-50 p-4 text-violet-800 transition hover:brightness-95">
          <ClipboardCheck className="h-5 w-5 shrink-0" />
          <p className="flex-1 text-sm">Owner replied on today's report: {reply}</p>
          <ArrowRight className="h-4 w-4" />
        </Link>
      )}
      {n > 0 && (
        <Link to="/app/leaves" className="flex items-center gap-3 rounded-2xl bg-amber-50 p-4 text-amber-800 transition hover:brightness-95">
          <CalendarOff className="h-5 w-5 shrink-0" />
          <p className="flex-1 text-sm"><b className="text-lg">{n}</b> leave request{n === 1 ? '' : 's'} from parents waiting for your approval</p>
          <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}
