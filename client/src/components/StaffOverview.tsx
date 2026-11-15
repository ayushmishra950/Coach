import { AlertTriangle, ArrowRight, Banknote, Fingerprint } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSocketEvent } from '../context/RealtimeContext';
import { useApi } from '../hooks/useApi';
import { fmtDate, inr } from '../lib/format';
import { clock, type StaffRow } from '../lib/staff';
import { Avatar, Badge, Card, CardHeader, Skeleton, clsx } from './ui';

interface DayResp {
  items: { teacher: { _id: string; name: string }; row: StaffRow | null }[];
  summary: { total: number; checkedIn: number; working: number; checkedOut: number; late: number; leave: number; notIn: number };
}
interface SalarySummary {
  overdue: { count: number; amount: number };
  next: { dueDate: string; count: number; amount: number } | null;
}

/** Owner dashboard: who is in today + salary dues, side by side. */
export function StaffOverview() {
  const day = useApi<DayResp>('/staff-attendance/day');
  const sal = useApi<SalarySummary>('/salaries/summary');
  useSocketEvent('staff:attendance', () => day.reload());

  const d = day.data;
  const s = sal.data;
  const daysTo = s?.next ? Math.round((new Date(new Date(s.next.dueDate).toDateString()).getTime() - new Date(new Date().toDateString()).getTime()) / 86400000) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title="Staff today" icon={<Fingerprint className="h-5 w-5" />}
          subtitle={d ? `${d.summary.checkedIn} of ${d.summary.total} teachers checked in${d.summary.late ? ` · ${d.summary.late} late` : ''}` : 'Teacher check-in'}
          action={<Link to="/app/staff" className="text-sm font-semibold text-brand-600 hover:underline">Open</Link>} />
        {!d ? <Skeleton className="h-24" /> : d.items.length === 0 ? <p className="py-4 text-center text-sm text-slate-500">No active teachers</p> : (
          <div className="flex flex-wrap gap-2">
            {d.items.map(({ teacher, row }) => {
              const working = row?.checkIn && !row.checkOut;
              return (
                <div key={teacher._id} className={clsx('flex items-center gap-2 rounded-xl border px-2.5 py-1.5',
                  working ? 'border-emerald-200 bg-emerald-50' : row?.checkOut ? 'border-slate-200 bg-slate-50' : row?.status === 'leave' ? 'border-sky-200 bg-sky-50' : 'border-dashed border-slate-200')}>
                  <Avatar name={teacher.name} size="sm" />
                  <div className="leading-tight">
                    <p className="text-xs font-semibold text-slate-800">{teacher.name}</p>
                    <p className={clsx('text-[11px]', working ? 'text-emerald-700' : 'text-slate-400')}>
                      {row?.status === 'leave' ? 'On leave' : !row?.checkIn ? 'Not in yet' : working ? `In since ${clock(row.checkIn)}` : `${clock(row.checkIn)}–${clock(row.checkOut)}`}
                    </p>
                  </div>
                  {row?.late && <Badge tone="amber" className="ml-1">Late</Badge>}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Teacher salaries" icon={<Banknote className="h-5 w-5" />} action={<Link to="/app/salaries" className="text-sm font-semibold text-brand-600 hover:underline">Open</Link>} />
        {!s ? <Skeleton className="h-24" /> : (
          <div className="space-y-3">
            {s.overdue.count > 0 && (
              <Link to="/app/salaries?status=unpaid" className="flex items-center gap-3 rounded-xl bg-rose-50 p-3 text-rose-800 hover:bg-rose-100">
                <AlertTriangle className="h-5 w-5 shrink-0" />
                <div className="flex-1 text-sm"><p className="font-bold">{inr(s.overdue.amount)} overdue</p><p className="text-xs">{s.overdue.count} unpaid salar{s.overdue.count === 1 ? 'y' : 'ies'}</p></div>
                <ArrowRight className="h-4 w-4" />
              </Link>
            )}
            {s.next ? (
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Next pay day</p>
                <p className="mt-1 text-xl font-extrabold text-slate-900">{inr(s.next.amount)}</p>
                <p className="text-sm text-slate-500">
                  {s.next.count} teacher{s.next.count === 1 ? '' : 's'} · {fmtDate(s.next.dueDate, { day: 'numeric', month: 'short' })}
                  {daysTo != null && <span className={clsx('ml-1 font-semibold', daysTo <= 1 ? 'text-amber-600' : 'text-slate-500')}>({daysTo === 0 ? 'today' : daysTo === 1 ? 'tomorrow' : `in ${daysTo} days`})</span>}
                </p>
              </div>
            ) : !s.overdue.count && <p className="py-4 text-center text-sm text-slate-500">All salaries paid ✓</p>}
          </div>
        )}
      </Card>
    </div>
  );
}
