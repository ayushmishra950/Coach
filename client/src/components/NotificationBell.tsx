import { Bell, CalendarCheck, CheckCheck, IndianRupee, Megaphone, ClipboardList, Info, Wallet } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useRealtime, useSocketEvent } from '../context/RealtimeContext';
import { api, errMsg } from '../lib/api';
import { timeAgo } from '../lib/format';
import type { Notification } from '../lib/types';
import { clsx } from './ui';

export const NOTIF_ICON = {
  attendance: { icon: CalendarCheck, cls: 'bg-sky-50 text-sky-600' },
  fee: { icon: IndianRupee, cls: 'bg-amber-50 text-amber-600' },
  payment: { icon: Wallet, cls: 'bg-emerald-50 text-emerald-600' },
  test: { icon: ClipboardList, cls: 'bg-violet-50 text-violet-600' },
  announcement: { icon: Megaphone, cls: 'bg-pink-50 text-pink-600' },
  system: { icon: Info, cls: 'bg-slate-100 text-slate-600' },
} as const;

export function NotificationBell({ allHref }: { allHref: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const { connected } = useRealtime();

  // Light request: latest 10 + a capped unread count (no totals, no per-type counts).
  const load = () =>
    api.get<{ items: Notification[]; unread: number }>('/notifications', { params: { light: 1 } })
      .then(({ data }) => { setItems(data.items); setUnread(data.unread); })
      .catch(() => {});

  // Live: the server pushes every new notification — add it here instead of re-fetching the
  // inbox (an announcement to 2,000 parents would otherwise cause 2,000 reloads at once).
  useSocketEvent<Notification & { audience: string }>('notification:new', (n) => {
    setItems((cur) => (cur.some((x) => x._id === n._id) ? cur : [{ ...n, read: false }, ...cur].slice(0, 10)));
    setUnread((u) => Math.min(u + 1, 100));
    // The owner already sees a success message when they collect a fee themselves.
    if (!(n.audience === 'owner' && n.type === 'payment')) toast(n.title, { icon: '🔔', duration: 3500 });
  });

  useEffect(() => {
    load();
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // Poll only as a fallback: while the live connection is down and the tab is visible.
  useEffect(() => {
    if (connected) return;
    const t = setInterval(() => document.visibilityState === 'visible' && load(), 120_000);
    return () => clearInterval(t);
  }, [connected]);

  // Catch up on anything missed while the live connection was down (skip the very first connect —
  // the mount effect already loaded the inbox).
  const wasConnected = useRef<boolean | null>(null);
  useEffect(() => {
    if (connected && wasConnected.current === false) load();
    wasConnected.current = connected;
  }, [connected]);

  const markAll = async () => {
    try {
      await api.put('/notifications/read-all');
      load();
    } catch (e) {
      toast.error(errMsg(e, 'Could not mark notifications as read'));
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => { setOpen(!open); if (!open) load(); }} className="relative rounded-xl p-2.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800" aria-label="Notifications">
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-fade-up">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="font-bold text-slate-900">Notifications</p>
            {unread > 0 && (
              <button onClick={markAll} className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700">
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto scrollbar-thin">
            {items.length === 0 && <p className="px-4 py-10 text-center text-sm text-slate-500">You're all caught up 🎉</p>}
            {items.map((n) => {
              const I = NOTIF_ICON[n.type] ?? NOTIF_ICON.system;
              return (
                <div key={n._id} className={clsx('flex gap-3 border-b border-slate-50 px-4 py-3', !n.read && 'bg-brand-50/40')}>
                  <div className={clsx('grid h-9 w-9 shrink-0 place-items-center rounded-xl', I.cls)}><I.icon className="h-4 w-4" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800">{n.title}</p>
                    <p className="line-clamp-2 text-xs text-slate-500">{n.message}</p>
                    <p className="mt-1 text-[11px] text-slate-400">{timeAgo(n.createdAt)}</p>
                  </div>
                  {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />}
                </div>
              );
            })}
          </div>
          <Link to={allHref} onClick={() => setOpen(false)} className="block border-t border-slate-100 py-3 text-center text-sm font-semibold text-brand-600 hover:bg-slate-50">
            View all
          </Link>
        </div>
      )}
    </div>
  );
}
