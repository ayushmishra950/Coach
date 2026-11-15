import { Banknote, CalendarDays, ChevronLeft, ChevronRight, Clock, Timer } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckInCard } from '../../components/CheckInCard';
import { Badge, Card, EmptyState, ErrorState, PageHeader, Skeleton, StatCard, Tabs } from '../../components/ui';
import { useApi, useClientPage } from '../../hooks/useApi';
import { Pager } from '../../components/Pager';
import { fmtDate, inr, ymd } from '../../lib/format';
import { clock, dayState, fmtMins, monthKey, monthName, shiftMonth, type SalaryRow, type StaffRow, type StaffTotals } from '../../lib/staff';

interface MeResp { month: string; label: string; rows: StaffRow[]; totals: StaffTotals }
type Tab = 'attendance' | 'salary';

/** Teacher: check in / out, own monthly attendance and own salary history. */
export default function MyAttendance() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'salary' ? 'salary' : 'attendance';
  const [month, setMonth] = useState(monthKey());
  const me = useApi<MeResp>(tab === 'attendance' ? '/staff-attendance/me' : null, { month });
  const dayPage = useClientPage(me.data?.rows, month);
  const sal = useApi<(SalaryRow & { label: string })[]>(tab === 'salary' ? '/staff-attendance/me/salaries' : null);
  const salPage = useClientPage(sal.data);
  const today = ymd();

  return (
    <div>
      <PageHeader title="Check-in & salary" subtitle="Your daily check-in, working hours and salary payments" />
      <CheckInCard className="mb-6" onChange={() => me.reload()} />
      <Tabs<Tab> className="mb-5" value={tab} onChange={(v) => setParams(v === 'salary' ? { tab: 'salary' } : {}, { replace: true })} tabs={[
        { value: 'attendance', label: <><CalendarDays className="h-4 w-4" /> My attendance</> },
        { value: 'salary', label: <><Banknote className="h-4 w-4" /> My salary</> },
      ]} />

      {tab === 'attendance' ? (
        <>
          <div className="mb-4 flex items-center gap-2">
            <button className="btn-secondary btn-sm" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button>
            <span className="min-w-36 text-center font-bold text-slate-800">{monthName(month)}</span>
            <button className="btn-secondary btn-sm" disabled={month >= monthKey()} onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month"><ChevronRight className="h-4 w-4" /></button>
          </div>
          {me.error ? <ErrorState message={me.error} onRetry={me.reload} /> : !me.data ? <Skeleton className="h-72" /> : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label="Days present" value={me.data.totals.present} icon={<CalendarDays className="h-5 w-5" />} tone="green" hint={me.data.totals.leave ? `${me.data.totals.leave} on leave` : undefined} />
                <StatCard label="Late days" value={me.data.totals.late} icon={<Timer className="h-5 w-5" />} tone="amber" />
                <StatCard label="Hours worked" value={fmtMins(me.data.totals.minutes)} icon={<Clock className="h-5 w-5" />} tone="brand" />
                <StatCard label="Average / day" value={fmtMins(me.data.totals.avgMinutes)} icon={<Clock className="h-5 w-5" />} tone="sky" />
              </div>
              <Card pad={false} className="mt-6 overflow-hidden">
                {me.data.rows.length === 0 ? <EmptyState icon={<CalendarDays className="h-7 w-7" />} title="No check-ins this month" /> : (
                  <ul className="divide-y divide-slate-100">
                    {dayPage.items.map((r) => {
                      const st = dayState(r, r.date < today);
                      return (
                        <li key={r._id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                          <div className="w-28">
                            <p className="font-semibold text-slate-900">{fmtDate(r.date, { day: 'numeric', month: 'short' })}</p>
                            <p className="text-xs text-slate-400">{fmtDate(r.date, { weekday: 'long' })}</p>
                          </div>
                          <Badge tone={st.tone}>{st.label}</Badge>
                          {r.late && <Badge tone="amber">Late {r.lateBy}m</Badge>}
                          {r.earlyLeave && <Badge tone="amber">Left early</Badge>}
                          <span className="ml-auto text-sm text-slate-600">{r.checkIn ? `${clock(r.checkIn)} → ${r.checkOut ? clock(r.checkOut) : '…'}` : ''}</span>
                          <span className="w-20 text-right text-sm font-bold text-slate-900">{r.checkOut ? fmtMins(r.minutes) : ''}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <Pager {...dayPage.pager} noun="days" />
              </Card>
            </>
          )}
        </>
      ) : sal.error ? <ErrorState message={sal.error} onRetry={sal.reload} /> : !sal.data ? <Skeleton className="h-72" /> : (
        <Card pad={false} className="overflow-hidden">
          {sal.data.length === 0 ? <EmptyState icon={<Banknote className="h-7 w-7" />} title="No salary records yet" text="Your salary appears here once the institute starts tracking it." /> : (
            <ul className="divide-y divide-slate-100">
              {salPage.items.map((s) => {
                const left = s.amount - s.paidAmount;
                const overdue = s.status !== 'paid' && new Date(s.dueDate) < new Date(new Date().toDateString());
                return (
                  <li key={s._id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900">Salary for {s.label}</p>
                      <p className="text-xs text-slate-500">
                        {s.status === 'paid' && s.paidAt ? `Paid on ${fmtDate(s.paidAt)}` : `Pay day ${fmtDate(s.dueDate)}`}
                        {(s.bonus ?? 0) > 0 && ` · Bonus ${inr(s.bonus)}`}{(s.deduction ?? 0) > 0 && ` · Deduction ${inr(s.deduction)}`}{(s.leaveDeduction ?? 0) > 0 && ` · Leave ${s.leaveDays} day${s.leaveDays === 1 ? '' : 's'} −${inr(s.leaveDeduction)}`}
                      </p>
                    </div>
                    <span className="text-lg font-extrabold text-slate-900">{inr(s.amount)}</span>
                    {s.status === 'paid' ? <Badge tone="green">Paid</Badge> : s.status === 'partial' ? <Badge tone="amber">{inr(left)} pending</Badge> : <Badge tone={overdue ? 'red' : 'gray'}>{overdue ? 'Pending' : 'Upcoming'}</Badge>}
                  </li>
                );
              })}
            </ul>
          )}
          <Pager {...salPage.pager} noun="salaries" />
        </Card>
      )}
    </div>
  );
}
