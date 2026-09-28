import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Socket } from 'socket.io-client';
import { TOKEN_KEY, api } from '../lib/api';
import { useAuth } from './AuthContext';

/**
 * One Socket.IO connection per signed-in owner / teacher / parent. It carries live chat
 * messages, read receipts, typing indicators, online status and in-app notifications.
 */
interface RealtimeCtx {
  socket: Socket | null;
  connected: boolean;
  /** Total unread chat messages, for the sidebar / header badge. */
  chatUnread: number;
  setChatUnread: (n: number) => void;
  refreshUnread: () => void;
}

const Ctx = createContext<RealtimeCtx>({ socket: null, connected: false, chatUnread: 0, setChatUnread: () => {}, refreshUnread: () => {} });

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);

  const role = session?.user.role;
  const userId = session?.user.id;
  const enabled = !!userId && role !== 'superadmin';

  const refreshUnread = useCallback(() => {
    if (!enabled) return;
    api.get<{ total: number }>('/chat/unread').then(({ data }) => setChatUnread(data.total)).catch(() => {});
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setSocket(null);
      setConnected(false);
      setChatUnread(0);
      return;
    }
    let cancelled = false;
    let s: Socket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const wire = (s: Socket) => {
    const onConnect = () => {
      setConnected(true);
      refreshUnread();
    };
    const onDisconnect = (reason: string) => {
      setConnected(false);
      // The server dropped us on purpose (password change, children re-linked, batch change).
      // socket.io won't reconnect by itself here — reconnect with the current token. A login
      // that is really over (disabled / suspended) is refused at the handshake and stops there.
      if (reason === 'io server disconnect') {
        clearTimeout(retry);
        retry = setTimeout(() => s.connect(), 1500 + Math.random() * 1500);
      }
    };
    // A handshake rejected by the server (e.g. a brief DB error) is not retried by
    // socket.io automatically — try again after a short, jittered pause.
    const onConnectError = (err: Error) => {
      setConnected(false);
      if (s.active || /not available|switched on|log in|expired|disabled|suspended/i.test(err.message)) return;
      clearTimeout(retry);
      retry = setTimeout(() => s.connect(), 5000 + Math.random() * 5000);
    };
    const onUnread = (d: { total?: number; unreadTotal?: number }) => {
      const n = d.total ?? d.unreadTotal;
      if (typeof n === 'number') setChatUnread(n);
    };
    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.on('connect_error', onConnectError);
    s.on('chat:unread', onUnread);
    s.on('chat:message', onUnread);
    setSocket(s);
    };
    // socket.io-client is loaded on demand, so landing / login visitors never download it.
    import('socket.io-client').then(({ io }) => {
      if (cancelled) return;
      s = io({
        path: '/socket.io',
        // Read the token on every (re)connect so a fresh login is always used.
        auth: (cb) => cb({ token: localStorage.getItem(TOKEN_KEY) ?? '' }),
      });
      wire(s);
    }).catch(() => {});
    refreshUnread();
    return () => {
      cancelled = true;
      clearTimeout(retry);
      s?.removeAllListeners();
      s?.disconnect();
    };
  }, [enabled, userId, refreshUnread]);

  return <Ctx.Provider value={{ socket, connected, chatUnread, setChatUnread, refreshUnread }}>{children}</Ctx.Provider>;
}

export const useRealtime = () => useContext(Ctx);

/** Subscribe to a socket event for the lifetime of the component. The latest handler is always used. */
export function useSocketEvent<T>(event: string, handler: (data: T) => void) {
  const { socket } = useRealtime();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!socket) return;
    const fn = (d: T) => ref.current(d);
    socket.on(event, fn);
    return () => {
      socket.off(event, fn);
    };
  }, [socket, event]);
}
