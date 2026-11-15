import { router, type Href } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, AppState, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { io, type Socket } from 'socket.io-client';
import { getServer, getToken } from './api';
import { useAuth, type Role } from './auth';
import { C, Icon, type IconName } from './ui';

/**
 * Live connection to the CoachFlow server (the same Socket.IO server the website uses).
 * It brings new notifications (shown as a banner on top of any screen), new enquiries,
 * check-ins, work reports and plan changes the moment they happen — no pull-to-refresh.
 * When the connection is down, screens fall back to checking every 30 s (usePoll).
 */

export interface LiveNotification { _id: string; type: string; title: string; message: string; href?: string; studentId?: string; audience: string }

/** Socket events screens can listen to, plus "app:resume" when the app comes back to the foreground. */
export type LiveEvent = 'notification:new' | 'lead:new' | 'report:new' | 'staff:attendance' | 'institute:updated' | 'app:resume';
const FORWARD: LiveEvent[] = ['notification:new', 'lead:new', 'report:new', 'staff:attendance', 'institute:updated'];

type Listener = (data: unknown) => void;
const listeners = new Map<LiveEvent, Set<Listener>>();
function emitLocal(e: LiveEvent, data?: unknown) {
  for (const fn of listeners.get(e) ?? []) {
    try {
      fn(data);
    } catch (err) {
      console.warn('[live]', err);
    }
  }
}

const Ctx = createContext<{ connected: boolean }>({ connected: false });
export const useRealtime = () => useContext(Ctx);

/** Run `fn` whenever one of the events arrives (latest `fn` is always used). */
export function useLiveEvent<T = unknown>(events: LiveEvent | LiveEvent[], fn: (data: T) => void) {
  const ref = useRef(fn);
  ref.current = fn;
  const key = Array.isArray(events) ? events.join(',') : events;
  useEffect(() => {
    const list = key.split(',') as LiveEvent[];
    const h: Listener = (d) => ref.current(d as T);
    for (const e of list) {
      if (!listeners.has(e)) listeners.set(e, new Set());
      listeners.get(e)!.add(h);
    }
    return () => { for (const e of list) listeners.get(e)?.delete(h); };
  }, [key]);
}

/** Where a notification opens in the app (the server's links point at website pages). */
export function routeFor(n: Pick<LiveNotification, 'type'>, role: Role): Href {
  const r = role;
  switch (n.type) {
    case 'lead': return '/owner/leads';
    case 'fee': case 'payment': return r === 'parent' ? '/parent/fees' : r === 'owner' ? '/owner/fees' : '/notifications';
    case 'report': return r === 'owner' ? '/work-reports' : '/daily-report';
    case 'leave': return r === 'parent' ? '/parent-leaves' : '/leaves';
    case 'salary': return r === 'owner' ? '/salaries' : '/my-salary';
    case 'staff': return r === 'owner' ? '/staff' : '/my-salary';
    case 'test': return r === 'parent' ? '/parent/results' : '/tests';
    case 'material': return r === 'parent' ? '/parent/learn' : '/notifications';
    case 'attendance': return r === 'parent' ? '/parent' : '/attendance';
    case 'announcement': return r === 'parent' ? '/parent' : '/announcements';
    default: return '/notifications';
  }
}

const ICON: Record<string, IconName> = {
  lead: 'person-add', fee: 'wallet', payment: 'cash', report: 'clipboard', leave: 'calendar', salary: 'cash', staff: 'finger-print',
  test: 'trophy', material: 'book', attendance: 'checkbox', announcement: 'megaphone', system: 'sparkles',
};

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { session, refresh } = useAuth();
  const [connected, setConnected] = useState(false);
  const [toast, setToast] = useState<LiveNotification | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const userId = session?.user.id;
  const role = session?.user.role;

  useEffect(() => {
    if (!userId || role === 'superadmin' || !getToken()) return;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const s = io(getServer(), {
      path: '/socket.io',
      transports: ['websocket'], // React Native: plain WebSocket, no long-polling
      auth: (cb: (d: { token: string }) => void) => cb({ token: getToken() ?? '' }), // read on every (re)connect
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 15000,
    });
    socketRef.current = s;
    s.on('connect', () => setConnected(true));
    s.on('disconnect', (reason: string) => {
      setConnected(false);
      // The server dropped us on purpose (password change, batch change…) → reconnect with the current token.
      if (reason === 'io server disconnect') {
        clearTimeout(retry);
        retry = setTimeout(() => s.connect(), 1500);
      }
    });
    s.on('connect_error', (err: Error) => {
      setConnected(false);
      // A refused handshake isn't retried by socket.io itself; a closed account stays closed.
      if (s.active || /disabled|suspended|log in|expired/i.test(err.message)) return;
      clearTimeout(retry);
      retry = setTimeout(() => s.connect(), 8000);
    });
    for (const e of FORWARD) s.on(e, (d: unknown) => emitLocal(e, d));
    s.on('notification:new', (n: LiveNotification) => setToast(n));
    // Plan / trial / status changed by CoachFlow → re-read the session (features unlock live).
    s.on('institute:updated', () => { void refresh().catch(() => undefined); });
    return () => {
      clearTimeout(retry);
      s.removeAllListeners();
      s.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [userId, role, refresh]);

  // Back from the background: make sure we're connected and let screens catch up.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') return;
      const s = socketRef.current;
      if (s && !s.connected) s.connect();
      emitLocal('app:resume');
    });
    return () => sub.remove();
  }, []);

  return (
    <Ctx.Provider value={{ connected }}>
      {children}
      {toast && role && <Toast n={toast} role={role} onClose={() => setToast(null)} />}
    </Ctx.Provider>
  );
}

/** Banner that slides in on top of any screen for ~5 s; tap opens the related screen. */
function Toast({ n, role, onClose }: { n: LiveNotification; role: Role; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const y = useRef(new Animated.Value(-120)).current;
  const close = useCallback(() => {
    Animated.timing(y, { toValue: -160, duration: 200, useNativeDriver: true }).start(() => onClose());
  }, [y, onClose]);
  useEffect(() => {
    y.setValue(-120);
    Animated.spring(y, { toValue: 0, useNativeDriver: true }).start();
    const t = setTimeout(close, 5000);
    return () => clearTimeout(t);
  }, [n._id, y, close]);
  return (
    <Animated.View style={{ position: 'absolute', left: 12, right: 12, top: insets.top + 8, transform: [{ translateY: y }], zIndex: 1000, elevation: 12 }}>
      <Pressable onPress={() => { close(); router.push(routeFor(n, role)); }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 16, padding: 12, borderWidth: 1, borderColor: C.border,
          shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}>
        <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={ICON[n.type] ?? 'notifications'} size={20} color={C.brand} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '800', color: C.text }} numberOfLines={1}>{n.title}</Text>
          <Text style={{ color: C.sub, fontSize: 12.5 }} numberOfLines={2}>{n.message}</Text>
        </View>
        <Pressable onPress={close} hitSlop={10}><Icon name="close" size={18} color={C.muted} /></Pressable>
      </Pressable>
    </Animated.View>
  );
}
