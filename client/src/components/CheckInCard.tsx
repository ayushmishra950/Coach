import { AlertTriangle, Clock, LogIn, LogOut, MapPin, Timer } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useApi } from '../hooks/useApi';
import { api, errMsg } from '../lib/api';
import { fmtDate, fmtTime } from '../lib/format';
import { clock, fmtMins, getGeo, type StaffRow, type StaffSettings } from '../lib/staff';
import { Badge, Button, Skeleton, clsx } from './ui';

interface Today { date: string; row: StaffRow | null; missedCheckout: { date: string; checkIn: string } | null; settings: StaffSettings; serverTime: string }

/** Teacher's one-tap check-in / check-out. Time is always taken from the server. */
export function CheckInCard({ onChange, className }: { onChange?: () => void; className?: string }) {
  const { data, loading, error, reload, setData } = useApi<Today>('/staff-attendance/me/today');
  const [busy, setBusy] = useState<'in' | 'out' | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Server clock offset so the timer matches what the owner sees.
  const offset = useMemo(() => (data ? new Date(data.serverTime).getTime() - Date.now() : 0), [data]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const act = async (kind: 'in' | 'out') => {
    setBusy(kind);
    try {
      const geo = data?.settings.captureLocation ? await getGeo() : null;
      if (data?.settings.captureLocation && !geo) toast('Location not available — saved without it', { icon: '📍' });
      const { data: row } = await api.post<StaffRow>(kind === 'in' ? '/staff-attendance/check-in' : '/staff-attendance/check-out', geo ? { geo } : {});
      if (data) setData({ ...data, row, serverTime: new Date().toISOString() });
      setNow(Date.now());
      if (kind === 'in') toast.success(row.late ? `Checked in at ${clock(row.checkIn)} — ${row.lateBy} min late` : `Checked in at ${clock(row.checkIn)}`);
      else toast.success(`Checked out · ${fmtMins(row.minutes)} today`);
      onChange?.();
    } catch (e) {
      toast.error(errMsg(e));
      reload();
    } finally {
      setBusy(null);
    }
  };

  if (error) return <div className={clsx('card card-pad text-sm text-rose-600', className)}>{error}</div>;
  if (loading && !data) return <Skeleton className={clsx('h-36', className)} />;
  if (!data) return null;

  const { row, settings } = data;
  const checkedIn = !!row?.checkIn;
  const checkedOut = !!row?.checkOut;
  const liveMins = checkedIn && !checkedOut ? Math.max(0, Math.round((now + offset - new Date(row!.checkIn!).getTime()) / 60000)) : row?.minutes ?? 0;

  return (
    <div className={clsx('card overflow-hidden', className)}>
      <div className={clsx('flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6',
        !checkedIn ? 'bg-gradient-to-r from-brand-600 to-violet-600 text-white' : checkedOut ? 'bg-slate-50' : 'bg-emerald-50')}>
        <div className={clsx('grid h-14 w-14 shrink-0 place-items-center rounded-2xl', !checkedIn ? 'bg-white/15' : checkedOut ? 'bg-white text-slate-500' : 'bg-white text-emerald-600')}>
          {!checkedIn ? <LogIn className="h-7 w-7" /> : checkedOut ? <Clock className="h-7 w-7" /> : <Timer className="h-7 w-7" />}
        </div>
        <div className="min-w-0 flex-1">
          {!checkedIn ? (
            <>
              <p className="text-lg font-bold">{row?.status === 'leave' ? 'Marked on leave today' : 'You haven’t checked in yet'}</p>
              <p className="text-sm text-white/80">
                {fmtDate(data.date, { weekday: 'long', day: 'numeric', month: 'long' })} · Work starts {fmtTime(settings.startTime)}
                {settings.graceMins ? ` (${settings.graceMins} min grace)` : ''}
              </p>
            </>
          ) : checkedOut ? (
            <>
              <p className="text-lg font-bold text-slate-900">Done for today · {fmtMins(row!.minutes)}</p>
              <p className="text-sm text-slate-500">{clock(row!.checkIn)} → {clock(row!.checkOut)}</p>
            </>
          ) : (
            <>
              <p className="text-lg font-bold text-slate-900">Working · {fmtMins(liveMins)}</p>
              <p className="text-sm text-slate-600">Checked in at {clock(row!.checkIn)} · day ends {fmtTime(settings.endTime)}</p>
            </>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {row?.late && <Badge tone="amber">Late by {row.lateBy} min</Badge>}
            {row?.earlyLeave && <Badge tone="amber">Left early</Badge>}
            {settings.captureLocation && !checkedOut && (
              <Badge tone={checkedIn ? 'gray' : 'brand'} className={!checkedIn ? 'bg-white/15 text-white ring-0' : ''}><MapPin className="h-3 w-3" />Location is recorded</Badge>
            )}
          </div>
        </div>
        {!checkedOut && (
          checkedIn ? (
            <Button variant="danger" className="sm:min-w-40" loading={busy === 'out'} icon={<LogOut className="h-4 w-4" />} onClick={() => act('out')}>Check out</Button>
          ) : (
            <button onClick={() => act('in')} disabled={!!busy}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-bold text-brand-700 shadow-lg transition hover:bg-brand-50 disabled:opacity-60 sm:min-w-40">
              {busy === 'in' ? <Clock className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />} Check in
            </button>
          )
        )}
      </div>
      {data.missedCheckout && (
        <div className="flex items-center gap-2 border-t border-amber-100 bg-amber-50 px-5 py-2.5 text-xs font-medium text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          You didn’t check out on {fmtDate(data.missedCheckout.date, { day: 'numeric', month: 'short' })}. Ask the owner to correct the time.
        </div>
      )}
    </div>
  );
}
