import {
  AlertCircle, ArrowDown, ArrowLeft, Check, CheckCheck, Clock, LogOut, MessageCircle, RotateCw, Search, Send, SquarePen, WifiOff,
} from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type UIEvent } from 'react';
import toast from 'react-hot-toast';
import { Link, useSearchParams } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { Avatar, Badge, EmptyState, Modal, Spinner, clsx, type BadgeTone } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useRealtime, useSocketEvent } from '../context/RealtimeContext';
import { useDebounced } from '../hooks/useApi';
import { api, errMsg } from '../lib/api';
import type { ChatMessage, ChatPerson, ChatRole, Conversation } from '../lib/types';

const MAX_LEN = 2000;
const ROLE_LABEL: Record<ChatRole, string> = { owner: 'Owner', teacher: 'Teacher', parent: 'Parent' };
const ROLE_TONE: Record<ChatRole, BadgeTone> = { owner: 'violet', teacher: 'blue', parent: 'green' };

/* ------------------------------------------------------------------ */
/* Date helpers                                                         */
/* ------------------------------------------------------------------ */

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const clock = (d: Date) => d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }).toUpperCase();

function listTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (sameDay(d, now)) return clock(d);
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return 'Yesterday';
  if (now.getTime() - d.getTime() < 6 * 86400000) return d.toLocaleDateString('en-IN', { weekday: 'short' });
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function dayLabel(d: Date) {
  const now = new Date();
  if (sameDay(d, now)) return 'Today';
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

const newClientId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

function PersonAvatar({ person, size = 'md' }: { person: Pick<ChatPerson, 'name' | 'online'>; size?: 'sm' | 'md' }) {
  return (
    <div className="relative shrink-0">
      <Avatar name={person.name} size={size} />
      {person.online && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white" title="Online" />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page wrappers                                                        */
/* ------------------------------------------------------------------ */

/** Owner / teacher: rendered inside the app shell. */
export default function MessagesPage() {
  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-[1.7rem]">Messages</h1>
        <p className="mt-1 text-sm text-slate-500">Chat live with parents and your team. Messages are saved in your CoachFlow account.</p>
      </div>
      <div className="card h-[calc(100dvh-13rem)] min-h-[440px] overflow-hidden p-0">
        <ChatView />
      </div>
    </div>
  );
}

/** Parent portal: full-screen page with a slim header. */
export function PortalMessagesPage() {
  const { session, logout } = useAuth();
  return (
    <div className="flex h-[100dvh] flex-col bg-gradient-to-b from-brand-50/70 via-slate-50 to-slate-50">
      <header className="shrink-0 border-b border-slate-200/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link to="/portal" className="flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">
              <ArrowLeft className="h-4 w-4" /> Portal
            </Link>
            <Logo to="/portal" className="shrink-0 [&>span]:hidden sm:[&>span]:inline" />
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm font-semibold text-slate-600 sm:inline">{session?.user.name}</span>
            <button onClick={logout} className="rounded-xl p-2.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600" title="Log out" aria-label="Log out">
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-0 pb-0 pt-0 sm:px-4 sm:pb-6 sm:pt-5">
        <div className="card flex-1 overflow-hidden rounded-none p-0 sm:rounded-3xl">
          <ChatView />
        </div>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Chat                                                                 */
/* ------------------------------------------------------------------ */

interface Thread { messages: ChatMessage[]; hasMore: boolean; loading: boolean; loaded: boolean }

export function ChatView() {
  const { session } = useAuth();
  const me = session!.user.id;
  const { socket, connected, refreshUnread } = useRealtime();
  const [params, setParams] = useSearchParams();
  const activeId = params.get('c');
  const toUser = params.get('to');

  const [convs, setConvs] = useState<Conversation[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [threads, setThreads] = useState<Record<string, Thread>>({});
  const [typing, setTyping] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [blocked, setBlocked] = useState<Record<string, string>>({});

  const open = useCallback((id: string | null) => setParams(id ? { c: id } : {}, { replace: false }), [setParams]);

  const activeRef = useRef(activeId);
  activeRef.current = activeId;

  type ConvPage = { items: Conversation[]; hasMore: boolean; next: string | null };
  // Cursor for the next 20 chats (null = everything loaded).
  const [next, setNext] = useState<string | null>(null);
  const moreLoading = useRef(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // Stops automatic "load more" after a failure (the user can still scroll to retry).
  const [moreFailed, setMoreFailed] = useState(false);

  /** Loads (or refreshes) the newest 20 chats, keeping any older pages already on screen. */
  const loadConvs = useCallback(async () => {
    try {
      const { data } = await api.get<ConvPage>('/chat/conversations');
      setConvs((prev) => {
        const fresh = new Set(data.items.map((d) => d._id));
        // Keep the open chat and chats from later pages the user already scrolled to.
        const rest = prev?.filter((c) => !fresh.has(c._id)) ?? [];
        const keepActive = rest.filter((c) => c._id === activeRef.current);
        const older = rest.filter((c) => c._id !== activeRef.current);
        if (!prev || prev.length <= data.items.length) setNext(data.next);
        return [...keepActive, ...data.items, ...older];
      });
      setLoadError(null);
    } catch (e) {
      setLoadError(errMsg(e, 'Could not load your conversations'));
    }
  }, []);

  /** Next 20 chats when the list is scrolled to the bottom. */
  const loadMoreConvs = useCallback(async () => {
    if (!next || moreLoading.current) return;
    moreLoading.current = true;
    setLoadingMore(true);
    try {
      const { data } = await api.get<ConvPage>('/chat/conversations', { params: { before: next } });
      setConvs((prev) => {
        const have = new Set((prev ?? []).map((c) => c._id));
        return [...(prev ?? []), ...data.items.filter((c) => !have.has(c._id))];
      });
      setNext(data.next);
      setMoreFailed(false);
    } catch (e) {
      setMoreFailed(true);
      toast.error(errMsg(e, 'Could not load more chats'));
    } finally {
      moreLoading.current = false;
      setLoadingMore(false);
    }
  }, [next]);

  /* Search runs on the server over ALL chats, 20 results at a time. */
  const dq = useDebounced(search.trim(), 300);
  const dqRef = useRef(dq);
  dqRef.current = dq;
  const [found, setFound] = useState<ConvPage | null>(null);
  useEffect(() => {
    setFound(null); // never show (or page on) the previous query's results
    if (!dq) return;
    let live = true;
    api.get<ConvPage>('/chat/conversations', { params: { search: dq } })
      .then(({ data }) => live && setFound(data))
      .catch((e) => live && toast.error(errMsg(e)));
    return () => {
      live = false;
    };
  }, [dq]);
  const loadMoreFound = useCallback(async () => {
    if (!found?.next || moreLoading.current) return;
    moreLoading.current = true;
    setLoadingMore(true);
    const query = dq;
    try {
      const { data } = await api.get<ConvPage>('/chat/conversations', { params: { search: query, before: found.next } });
      if (query !== dqRef.current) return; // the search changed while loading
      setFound((f) => (f ? { ...data, items: [...f.items, ...data.items.filter((c) => !f.items.some((x) => x._id === c._id))] } : data));
      setMoreFailed(false);
    } catch (e) {
      setMoreFailed(true);
      toast.error(errMsg(e, 'Could not load more chats'));
    } finally {
      moreLoading.current = false;
      setLoadingMore(false);
    }
  }, [found, dq]);

  const olderLoading = useRef<Set<string>>(new Set());
  const loadThread = useCallback(async (id: string, beforeId?: string) => {
    if (beforeId) {
      if (olderLoading.current.has(id)) return; // one "load older" at a time per chat
      olderLoading.current.add(id);
    }
    setThreads((t) => ({ ...t, [id]: { messages: t[id]?.messages ?? [], hasMore: t[id]?.hasMore ?? false, loaded: t[id]?.loaded ?? false, loading: true } }));
    try {
      const { data } = await api.get<{ messages: ChatMessage[]; hasMore: boolean }>(`/chat/conversations/${id}/messages`, { params: { before: beforeId, limit: 20 } });
      setThreads((t) => {
        const prev = t[id];
        const cur = prev?.messages ?? [];
        const key = (m: ChatMessage) => m.clientId ?? m._id;
        let messages: ChatMessage[];
        let hasMore = data.hasMore;
        const newestSaved = [...cur].reverse().find((m) => !m.pending && !m.failed);
        if (!beforeId && prev?.loaded && data.hasMore && newestSaved && data.messages.length && data.messages[0].createdAt > newestSaved.createdAt) {
          // Missed more than a page while offline: start again from the latest page (plus unsent local messages).
          messages = [...data.messages, ...cur.filter((m) => m.pending || m.failed)];
        } else {
          // Union by id / clientId — the server copy wins over a local pending copy.
          const byKey = new Map<string, ChatMessage>();
          for (const m of cur) byKey.set(key(m), m);
          for (const m of data.messages) byKey.set(key(m), m);
          messages = [...byKey.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          if (!beforeId && prev?.loaded) hasMore = prev.hasMore; // a refresh doesn't change how much older history exists
        }
        return { ...t, [id]: { messages, hasMore, loading: false, loaded: true } };
      });
    } catch (e) {
      toast.error(errMsg(e, 'Could not load messages'));
      setThreads((t) => ({ ...t, [id]: { ...(t[id] ?? { messages: [], hasMore: false, loaded: true }), loading: false } }));
    } finally {
      if (beforeId) olderLoading.current.delete(id);
    }
  }, []);

  const markRead = useCallback((id: string) => {
    setConvs((list) => list?.map((c) => (c._id === id ? { ...c, unread: 0 } : c)) ?? list);
    api.post(`/chat/conversations/${id}/read`).then(() => refreshUnread()).catch(() => {});
  }, [refreshUnread]);

  useEffect(() => {
    loadConvs();
  }, [loadConvs]);

  // After a reconnect we may have missed events — refresh what is on screen.
  const wasConnected = useRef(connected);
  useEffect(() => {
    if (connected && !wasConnected.current) {
      loadConvs();
      if (activeId) loadThread(activeId);
    }
    wasConnected.current = connected;
  }, [connected, activeId, loadConvs, loadThread]);

  // Deep link: /messages?to=<userId> opens (or starts) a chat with that person.
  useEffect(() => {
    if (!toUser) return;
    let cancelled = false;
    api
      .post<Conversation>('/chat/conversations', { userId: toUser })
      .then(({ data }) => {
        if (cancelled) return;
        setConvs((list) => (list ? [data, ...list.filter((c) => c._id !== data._id)] : [data]));
        setParams({ c: data._id }, { replace: true });
      })
      .catch((e) => {
        if (cancelled) return;
        toast.error(errMsg(e));
        setParams({}, { replace: true });
      });
    return () => {
      cancelled = true;
    };
  }, [toUser, setParams]);

  // Opening a conversation: load history once and mark it read.
  useEffect(() => {
    if (!activeId) return;
    if (!threads[activeId]?.loaded && !threads[activeId]?.loading) loadThread(activeId);
    markRead(activeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // Coming back to the tab marks the open conversation as read.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible' && activeId && convs?.find((c) => c._id === activeId)?.unread) markRead(activeId);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [activeId, convs, markRead]);

  // Expire typing indicators.
  useEffect(() => {
    if (!Object.keys(typing).length) return;
    const t = setInterval(() => {
      const now = Date.now();
      setTyping((cur) => {
        const next = Object.fromEntries(Object.entries(cur).filter(([, until]) => until > now));
        return Object.keys(next).length === Object.keys(cur).length ? cur : next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [typing]);

  /* ── live events ── */

  const upsertMessage = useCallback((cid: string, msg: ChatMessage) => {
    setThreads((t) => {
      const th = t[cid];
      if (!th) return t;
      const i = th.messages.findIndex((m) => m._id === msg._id || (msg.clientId && m.clientId === msg.clientId));
      const messages = i >= 0 ? th.messages.map((m, k) => (k === i ? { ...msg, pending: false, failed: false } : m)) : [...th.messages, msg];
      return { ...t, [cid]: { ...th, messages } };
    });
  }, []);

  const bumpConversation = useCallback((cid: string, msg: ChatMessage, unreadDelta: number) => {
    setConvs((list) => {
      if (!list) return list;
      const i = list.findIndex((c) => c._id === cid);
      if (i < 0) return list;
      const c = list[i];
      const updated: Conversation = {
        ...c,
        lastMessage: { text: msg.text, senderId: msg.senderId, at: msg.createdAt },
        updatedAt: msg.createdAt,
        unread: unreadDelta ? c.unread + unreadDelta : c.unread,
      };
      return [updated, ...list.slice(0, i), ...list.slice(i + 1)];
    });
  }, []);

  useSocketEvent<{ conversationId: string; message: ChatMessage }>('chat:message', ({ conversationId, message }) => {
    const fromMe = message.senderId === me;
    upsertMessage(conversationId, message);
    if (!convs?.some((c) => c._id === conversationId)) {
      loadConvs();
      return;
    }
    const viewing = conversationId === activeId && document.visibilityState === 'visible';
    bumpConversation(conversationId, message, !fromMe && !viewing ? 1 : 0);
    if (!fromMe) {
      setTyping((t) => {
        const { [conversationId]: _drop, ...rest } = t;
        return rest;
      });
      if (viewing) markRead(conversationId);
    }
  });

  useSocketEvent<{ conversationId: string; userId: string; lastReadAt: string }>('chat:read', (d) => {
    if (d.userId === me) return;
    setConvs((list) => list?.map((c) => (c._id === d.conversationId ? { ...c, otherLastReadAt: d.lastReadAt } : c)) ?? list);
  });

  useSocketEvent<{ conversationId: string; userId: string }>('chat:typing', (d) => {
    if (d.userId === me) return;
    setTyping((t) => ({ ...t, [d.conversationId]: Date.now() + 3500 }));
  });

  useSocketEvent<{ userId: string; online: boolean }>('presence', (d) => {
    setConvs((list) => list?.map((c) => (c.other.id === d.userId ? { ...c, other: { ...c.other, online: d.online } } : c)) ?? list);
  });

  /* ── sending ── */

  const deliver = useCallback(
    async (cid: string, msg: ChatMessage) => {
      const viaRest = async () => {
        const { data } = await api.post<ChatMessage>(`/chat/conversations/${cid}/messages`, { text: msg.text, clientId: msg.clientId });
        return data;
      };
      try {
        let saved: ChatMessage;
        if (socket?.connected) {
          const res = await new Promise<{ ok: boolean; message?: ChatMessage; error?: string } | null>((resolve) => {
            socket.timeout(8000).emit('chat:send', { conversationId: cid, text: msg.text, clientId: msg.clientId }, (err: Error | null, r: { ok: boolean; message?: ChatMessage; error?: string }) =>
              resolve(err ? null : r),
            );
          });
          if (res === null) saved = await viaRest(); // socket timed out — the server de-duplicates by clientId
          else if (!res.ok || !res.message) throw new Error(res.error || 'Message not sent');
          else saved = res.message;
        } else {
          saved = await viaRest();
        }
        upsertMessage(cid, saved);
      } catch (e) {
        const text = e instanceof Error && !(e as { response?: unknown }).response ? e.message : errMsg(e, 'Message not sent');
        toast.error(text);
        if (/no longer message|cannot message/i.test(text)) setBlocked((b) => ({ ...b, [cid]: text }));
        setThreads((t) => {
          const th = t[cid];
          if (!th) return t;
          return { ...t, [cid]: { ...th, messages: th.messages.map((m) => (m.clientId === msg.clientId ? { ...m, pending: false, failed: true } : m)) } };
        });
      }
    },
    [socket, upsertMessage],
  );

  const send = useCallback(
    (cid: string, text: string) => {
      const clientId = newClientId();
      const msg: ChatMessage = { _id: `tmp-${clientId}`, clientId, conversationId: cid, senderId: me, text, createdAt: new Date().toISOString(), pending: true };
      setThreads((t) => ({ ...t, [cid]: { ...(t[cid] ?? { hasMore: false, loading: false, loaded: true }), messages: [...(t[cid]?.messages ?? []), msg] } }));
      bumpConversation(cid, msg, 0);
      deliver(cid, msg);
    },
    [me, bumpConversation, deliver],
  );

  const retry = useCallback(
    (cid: string, msg: ChatMessage) => {
      setThreads((t) => {
        const th = t[cid];
        if (!th) return t;
        return { ...t, [cid]: { ...th, messages: th.messages.map((m) => (m.clientId === msg.clientId ? { ...m, pending: true, failed: false } : m)) } };
      });
      deliver(cid, msg);
    },
    [deliver],
  );

  const lastTypingSent = useRef(0);
  const sendTyping = useCallback(
    (cid: string) => {
      if (!socket?.connected || Date.now() - lastTypingSent.current < 2000) return;
      lastTypingSent.current = Date.now();
      socket.emit('chat:typing', { conversationId: cid });
    },
    [socket],
  );

  /* ── render ── */

  const active = convs?.find((c) => c._id === activeId) ?? found?.items.find((c) => c._id === activeId) ?? null;
  const searching = !!dq;
  // While searching show the server results, but with live data (unread, last message) from `convs`.
  const filtered = useMemo(() => {
    if (!searching) return convs ?? [];
    const live = new Map((convs ?? []).map((c) => [c._id, c]));
    return (found?.items ?? []).map((c) => live.get(c._id) ?? c);
  }, [convs, found, searching]);
  const canLoadMore = searching ? !!found?.next : !!next;

  // Opened with ?c=<id> for a chat that isn't in the loaded pages (e.g. from a notification).
  // There is no "get one conversation" endpoint, so: if its messages show who the other person is,
  // re-open it by user (POST /chat/conversations returns the same chat); otherwise page through a few
  // more chats. If neither finds it, the friendly "Chat not found" panel below is shown.
  const [resolving, setResolving] = useState<string | null>(null);
  const resolveTried = useRef<Set<string>>(new Set());
  const pagesWalked = useRef<Record<string, number>>({});
  const activeThread = activeId ? threads[activeId] : undefined;
  useEffect(() => {
    if (!activeId || convs === null || active || !activeThread?.loaded || activeThread.loading) return;
    if (resolveTried.current.has(activeId)) {
      // Fallback: look a few pages further down the list.
      const n = pagesWalked.current[activeId] ?? 0;
      if (next && !loadingMore && !moreFailed && n < 5) {
        pagesWalked.current[activeId] = n + 1;
        void loadMoreConvs();
      }
      return;
    }
    resolveTried.current.add(activeId);
    const other = activeThread.messages.find((m) => m.senderId !== me && !m.pending)?.senderId;
    if (!other) {
      // Nothing from the other person to go on: nudge the fallback above to run.
      setResolving(null);
      setConvs((list) => (list ? [...list] : list));
      return;
    }
    const id = activeId;
    setResolving(id);
    api.post<Conversation>('/chat/conversations', { userId: other })
      .then(({ data }) => {
        setConvs((list) => (data._id !== id ? (list ? [...list] : list) // not it: re-run the effect → page fallback
          : list?.some((c) => c._id === id) ? list : [data, ...(list ?? [])]));
      })
      .catch(() => setConvs((list) => (list ? [...list] : list)))
      .finally(() => setResolving((r) => (r === id ? null : r)));
  }, [activeId, convs, active, activeThread, me, next, loadingMore, moreFailed, loadMoreConvs]);
  const lookingUp = !!activeId && !active && (resolving === activeId || !!activeThread?.loading || (loadingMore && (pagesWalked.current[activeId] ?? 0) > 0));

  // Infinite scroll: fetch the next 20 chats silently near the bottom of the list.
  const listRef = useRef<HTMLDivElement>(null);
  const onListScroll = () => {
    const el = listRef.current;
    if (!el || !canLoadMore) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) void (searching ? loadMoreFound() : loadMoreConvs());
  };
  // If the first 20 don't fill a VISIBLE panel, keep loading until they do (or nothing is left).
  // (On mobile the list is hidden while a chat is open: clientHeight is 0, so nothing loads.)
  useEffect(() => {
    const el = listRef.current;
    if (el && el.clientHeight > 0 && canLoadMore && !loadingMore && !moreFailed && el.scrollHeight <= el.clientHeight + 40) {
      void (searching ? loadMoreFound() : loadMoreConvs());
    }
  }, [filtered.length, canLoadMore, loadingMore, moreFailed, searching, loadMoreConvs, loadMoreFound, activeId]);

  return (
    <div className="flex h-full min-h-0">
      {/* Conversation list */}
      <aside className={clsx('min-h-0 w-full flex-col border-slate-100 md:flex md:w-80 md:border-r lg:w-96', activeId ? 'hidden' : 'flex')}>
        <div className="flex items-center justify-between gap-2 px-4 pb-3 pt-4">
          <h2 className="text-lg font-extrabold text-slate-900">Chats</h2>
          <button onClick={() => setNewOpen(true)} className="btn-primary btn-sm" title="Start a new chat">
            <SquarePen className="h-4 w-4" /> New
          </button>
        </div>
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-10" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search chats…" />
          </div>
        </div>
        {!connected && (
          <div className="mx-4 mb-2 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
            <WifiOff className="h-3.5 w-3.5 shrink-0" /> Reconnecting… messages still send, live updates are paused.
          </div>
        )}
        <div ref={listRef} onScroll={onListScroll} className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          {convs === null && !loadError && (
            <div className="grid place-items-center py-16"><Spinner /></div>
          )}
          {loadError && (
            <div className="px-6 py-10 text-center text-sm text-slate-500">
              <AlertCircle className="mx-auto mb-2 h-6 w-6 text-rose-500" />
              {loadError}
              <button onClick={loadConvs} className="mt-3 block w-full text-sm font-semibold text-brand-600">Try again</button>
            </div>
          )}
          {!searching && convs && !convs.length && (
            <EmptyState
              icon={<MessageCircle className="h-7 w-7" />}
              title="No conversations yet"
              text="Start a chat — messages arrive instantly and are saved here."
              action={<button onClick={() => setNewOpen(true)} className="btn-primary"><SquarePen className="h-4 w-4" /> Start a chat</button>}
            />
          )}
          {searching && !found && <div className="grid place-items-center py-10"><Spinner /></div>}
          {searching && found && !filtered.length && <p className="px-6 py-10 text-center text-sm text-slate-500">No chats match “{search}”.</p>}
          {filtered.map((c) => {
            const isTyping = (typing[c._id] ?? 0) > Date.now();
            const mine = c.lastMessage?.senderId === me;
            return (
              <button
                key={c._id}
                onClick={() => open(c._id)}
                className={clsx('flex w-full items-center gap-3 px-4 py-3 text-left transition', c._id === activeId ? 'bg-brand-50' : 'hover:bg-slate-50')}
              >
                <PersonAvatar person={c.other} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className={clsx('truncate text-sm', c.unread ? 'font-extrabold text-slate-900' : 'font-semibold text-slate-800')}>{c.other.name}</p>
                    {c.lastMessage && <span className={clsx('shrink-0 text-[11px]', c.unread ? 'font-bold text-brand-600' : 'text-slate-400')}>{listTime(c.lastMessage.at)}</span>}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className={clsx('truncate text-xs', isTyping ? 'font-semibold text-brand-600' : c.unread ? 'font-semibold text-slate-700' : 'text-slate-500')}>
                      {isTyping ? 'typing…' : c.lastMessage ? `${mine ? 'You: ' : ''}${c.lastMessage.text}` : c.other.subtitle || ROLE_LABEL[c.other.role]}
                    </p>
                    {c.unread > 0 && (
                      <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">
                        {c.unread > 99 ? '99+' : c.unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
          {loadingMore && (
            <div className="flex items-center justify-center gap-2 py-4 text-xs font-medium text-slate-400"><Spinner className="h-4 w-4" /> Loading more chats…</div>
          )}
        </div>
      </aside>

      {/* Thread */}
      <section className={clsx('min-h-0 min-w-0 flex-1 flex-col', activeId ? 'flex' : 'hidden md:flex')}>
        {active ? (
          <ThreadView
            key={active._id}
            me={me}
            conv={active}
            thread={threads[active._id]}
            typing={(typing[active._id] ?? 0) > Date.now()}
            blockedReason={blocked[active._id]}
            onBack={() => open(null)}
            onSend={(text) => send(active._id, text)}
            onRetry={(m) => retry(active._id, m)}
            onLoadOlder={() => {
              const th = threads[active._id];
              const oldest = th?.messages.find((m) => !m.pending && !m.failed);
              if (th && th.hasMore && !th.loading && oldest) loadThread(active._id, oldest._id);
            }}
            onTyping={() => sendTyping(active._id)}
          />
        ) : activeId && (convs === null || lookingUp) ? (
          <div className="grid flex-1 place-items-center"><Spinner /></div>
        ) : activeId ? (
          <div className="grid flex-1 place-items-center bg-slate-50/60">
            <EmptyState
              icon={<MessageCircle className="h-7 w-7" />}
              title="Chat not found"
              text="We couldn’t open this conversation. It may no longer be available — pick a chat from the list or start a new one."
              action={<button onClick={() => open(null)} className="btn-secondary"><ArrowLeft className="h-4 w-4" /> Back to chats</button>}
            />
          </div>
        ) : (
          <div className="grid flex-1 place-items-center bg-slate-50/60">
            <EmptyState icon={<MessageCircle className="h-7 w-7" />} title="Select a chat" text="Pick a conversation on the left, or start a new one." />
          </div>
        )}
      </section>

      <NewChatModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onPick={async (person) => {
          try {
            const { data } = await api.post<Conversation>('/chat/conversations', { userId: person.id });
            setConvs((list) => (list ? [data, ...list.filter((c) => c._id !== data._id)] : [data]));
            setNewOpen(false);
            open(data._id);
          } catch (e) {
            toast.error(errMsg(e));
          }
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ThreadView({
  me, conv, thread, typing, blockedReason, onBack, onSend, onRetry, onLoadOlder, onTyping,
}: {
  me: string; conv: Conversation; thread?: Thread; typing: boolean; blockedReason?: string;
  onBack: () => void; onSend: (text: string) => void; onRetry: (m: ChatMessage) => void; onLoadOlder: () => void; onTyping: () => void;
}) {
  const [text, setText] = useState('');
  const [newBelow, setNewBelow] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true);
  const prev = useRef<{ first?: string; last?: string; height: number; top: number }>({ height: 0, top: 0 });
  const messages = thread?.messages ?? [];
  const readUpTo = conv.otherLastReadAt ? new Date(conv.otherLastReadAt).getTime() : 0;

  // Keep the view pinned to the newest message, and keep position when older history is prepended.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const first = messages[0]?.clientId ?? messages[0]?._id;
    const last = messages[messages.length - 1]?._id;
    const p = prev.current;
    if (p.first && first !== p.first && messages.length && last === p.last) {
      el.scrollTop = el.scrollHeight - p.height + p.top; // older messages added on top
    } else if (last !== p.last) {
      const lastMsg = messages[messages.length - 1];
      if (stick.current || lastMsg?.senderId === me) {
        el.scrollTop = el.scrollHeight;
        setNewBelow(false);
      } else setNewBelow(true);
    }
    prev.current = { first, last, height: el.scrollHeight, top: el.scrollTop };
  }, [messages, me]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (stick.current) setNewBelow(false);
    prev.current.height = el.scrollHeight;
    prev.current.top = el.scrollTop;
    if (el.scrollTop < 80) onLoadOlder();
  };

  const submit = () => {
    const t = text.trim();
    if (!t || t.length > MAX_LEN) return;
    onSend(t);
    setText('');
    stick.current = true;
    requestAnimationFrame(() => {
      if (inputRef.current) inputRef.current.style.height = '';
    });
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const canSend = conv.other.active !== false && !blockedReason;

  return (
    <>
      <header className="flex shrink-0 items-center gap-3 border-b border-slate-100 px-3 py-3 sm:px-5">
        <button onClick={onBack} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 md:hidden" aria-label="Back to chats">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <PersonAvatar person={conv.other} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-bold text-slate-900">{conv.other.name}</p>
            <Badge tone={ROLE_TONE[conv.other.role]}>{ROLE_LABEL[conv.other.role]}</Badge>
          </div>
          <p className={clsx('truncate text-xs', typing ? 'font-semibold text-brand-600' : 'text-slate-500')}>
            {typing ? 'typing…' : conv.other.online ? <span className="text-emerald-600">Online</span> : conv.other.subtitle}
          </p>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <div ref={listRef} onScroll={onScroll} className="h-full overflow-y-auto bg-slate-50/70 px-3 py-4 scrollbar-thin sm:px-6">
          {thread?.loading && (
            <div className="flex justify-center py-2"><Spinner className="h-4 w-4" /></div>
          )}
          {thread?.loaded && !thread.hasMore && messages.length > 0 && (
            <p className="mb-4 text-center text-[11px] font-medium text-slate-400">This is the beginning of your chat with {conv.other.name.split(' ')[0]}.</p>
          )}
          {thread?.loaded && !messages.length && (
            <div className="grid h-full place-items-center text-center">
              <div>
                <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-500"><MessageCircle className="h-7 w-7" /></div>
                <p className="font-semibold text-slate-800">Say hello to {conv.other.name.split(' ')[0]} 👋</p>
                <p className="mt-1 text-sm text-slate-500">Messages are delivered instantly and saved in CoachFlow.</p>
              </div>
            </div>
          )}
          {messages.map((m, i) => {
            const d = new Date(m.createdAt);
            const prevMsg = messages[i - 1];
            const newDay = !prevMsg || !sameDay(new Date(prevMsg.createdAt), d);
            const grouped = !newDay && prevMsg?.senderId === m.senderId && d.getTime() - new Date(prevMsg.createdAt).getTime() < 5 * 60_000;
            const mine = m.senderId === me;
            const read = mine && !m.pending && !m.failed && readUpTo >= d.getTime();
            return (
              <div key={m.clientId ?? m._id}>
                {newDay && (
                  <div className="my-4 flex justify-center">
                    <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-500 shadow-sm ring-1 ring-slate-200/70">{dayLabel(d)}</span>
                  </div>
                )}
                <div className={clsx('flex', mine ? 'justify-end' : 'justify-start', grouped ? 'mt-0.5' : 'mt-2.5')}>
                  <div
                    className={clsx(
                      'max-w-[82%] rounded-2xl px-3.5 py-2 text-sm shadow-sm sm:max-w-[70%]',
                      mine
                        ? m.failed
                          ? 'rounded-br-md bg-rose-500 text-white'
                          : 'rounded-br-md bg-gradient-to-br from-brand-600 to-violet-600 text-white'
                        : 'rounded-bl-md bg-white text-slate-800 ring-1 ring-slate-200/70',
                      m.pending && 'opacity-80',
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words leading-relaxed">{m.text}</p>
                    <div className={clsx('mt-0.5 flex items-center justify-end gap-1 text-[10px]', mine ? 'text-white/75' : 'text-slate-400')}>
                      {clock(d)}
                      {mine && (m.pending ? <Clock className="h-3 w-3" /> : m.failed ? <AlertCircle className="h-3 w-3" /> : read ? <CheckCheck className="h-3.5 w-3.5 text-sky-200" /> : <Check className="h-3.5 w-3.5" />)}
                    </div>
                  </div>
                </div>
                {m.failed && (
                  <div className="mt-1 flex justify-end">
                    <button onClick={() => onRetry(m)} className="flex items-center gap-1 text-[11px] font-semibold text-rose-600 hover:text-rose-700">
                      <RotateCw className="h-3 w-3" /> Not sent — tap to retry
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {typing && (
            <div className="mt-2.5 flex justify-start">
              <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200/70">
                {[0, 1, 2].map((k) => (
                  <span key={k} className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${k * 150}ms` }} />
                ))}
              </div>
            </div>
          )}
        </div>
        {newBelow && (
          <button
            onClick={() => {
              const el = listRef.current;
              if (el) el.scrollTop = el.scrollHeight;
              setNewBelow(false);
            }}
            className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-lg"
          >
            <ArrowDown className="h-3.5 w-3.5" /> New messages
          </button>
        )}
      </div>

      <div className="shrink-0 border-t border-slate-100 bg-white p-3 sm:px-5">
        {canSend ? (
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <textarea
                ref={inputRef}
                rows={1}
                value={text}
                maxLength={MAX_LEN}
                onChange={(e) => {
                  setText(e.target.value);
                  e.target.style.height = '';
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
                  if (e.target.value.trim()) onTyping();
                }}
                onKeyDown={onKey}
                placeholder={`Message ${conv.other.name.split(' ')[0]}…`}
                className="input block max-h-[140px] min-h-[44px] resize-none py-2.5 leading-relaxed"
              />
              {text.length > MAX_LEN - 200 && <p className="mt-1 text-right text-[11px] text-slate-400">{text.length}/{MAX_LEN}</p>}
            </div>
            <button
              onClick={submit}
              disabled={!text.trim()}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-600 to-violet-600 text-white shadow-sm transition hover:opacity-95 disabled:opacity-40"
              aria-label="Send message"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <p className="py-2 text-center text-sm text-slate-500">{blockedReason ? 'You can no longer message this person (for example, the student moved to another batch).' : 'This account is no longer active, so new messages can’t be sent.'}</p>
        )}
        {canSend && <p className="mt-1.5 hidden text-[11px] text-slate-400 sm:block">Enter to send · Shift + Enter for a new line</p>}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */

function NewChatModal({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (p: ChatPerson) => Promise<void> }) {
  type ContactPage = { items: ChatPerson[]; page: number; pages: number; total: number };
  const [people, setPeople] = useState<ChatPerson[] | null>(null);
  const [page, setPage] = useState<{ page: number; pages: number; total: number } | null>(null);
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 300);
  const queryRef = useRef(dq);
  queryRef.current = dq;
  const [busy, setBusy] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const moreRef = useRef(false);

  useEffect(() => {
    if (open) setQ('');
  }, [open]);

  // First 20 contacts (server-side search by name or child's name).
  useEffect(() => {
    if (!open) return;
    let live = true;
    setPeople(null);
    api.get<ContactPage>('/chat/contacts', { params: { search: dq || undefined, page: 1 } })
      .then(({ data }) => {
        if (!live) return;
        setPeople(data.items);
        setPage({ page: data.page, pages: data.pages, total: data.total });
      })
      .catch((e) => {
        if (!live) return;
        toast.error(errMsg(e));
        setPeople([]);
      });
    return () => {
      live = false;
    };
  }, [open, dq]);

  // Next 20 when the list is scrolled to the end.
  const loadMore = async () => {
    if (!page || page.page >= page.pages || moreRef.current) return;
    moreRef.current = true;
    setMore(true);
    const query = dq;
    try {
      const { data } = await api.get<ContactPage>('/chat/contacts', { params: { search: query || undefined, page: page.page + 1 } });
      if (query !== queryRef.current) return; // search changed while loading
      setPeople((cur) => [...(cur ?? []), ...data.items.filter((x) => !(cur ?? []).some((c) => c.id === x.id))]);
      setPage({ page: data.page, pages: data.pages, total: data.total });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      moreRef.current = false;
      setMore(false);
    }
  };
  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 100) void loadMore();
  };

  const shown = people ?? [];
  const groups: [ChatRole, string][] = [['owner', 'Institute'], ['teacher', 'Teachers'], ['parent', 'Parents']];

  return (
    <Modal open={open} onClose={onClose} title="New chat" subtitle="Choose who you want to message">
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input autoFocus className="input pl-10" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or child’s name…" />
      </div>
      {people === null ? (
        <div className="grid place-items-center py-10"><Spinner /></div>
      ) : !people.length && !dq ? (
        <p className="py-8 text-center text-sm text-slate-500">
          There’s nobody you can message yet. Parents appear here once the institute creates their parent-portal login.
        </p>
      ) : !shown.length ? (
        <p className="py-8 text-center text-sm text-slate-500">No one matches “{q}”.</p>
      ) : (
        <div onScroll={onScroll} className="-mx-1 max-h-[55vh] space-y-4 overflow-y-auto px-1 scrollbar-thin">
          {groups.map(([role, label]) => {
            const list = shown.filter((p) => p.role === role);
            if (!list.length) return null;
            return (
              <div key={role}>
                <p className="mb-1 px-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">{label} · {list.length}</p>
                <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl ring-1 ring-slate-200/70">
                  {list.map((p) => (
                    <button
                      key={p.id}
                      disabled={!!busy}
                      onClick={async () => {
                        setBusy(p.id);
                        await onPick(p);
                        setBusy(null);
                      }}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-slate-50 disabled:opacity-60"
                    >
                      <PersonAvatar person={p} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-800">{p.name}</p>
                        <p className="truncate text-xs text-slate-500">{p.subtitle}</p>
                      </div>
                      {busy === p.id ? <Spinner className="h-4 w-4" /> : <MessageCircle className="h-4 w-4 text-slate-300" />}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {more && <div className="flex items-center justify-center gap-2 py-3 text-xs text-slate-400"><Spinner className="h-4 w-4" /> Loading more…</div>}
          {page && page.page < page.pages && !more && (
            <button type="button" onClick={() => void loadMore()} className="w-full py-2 text-xs font-semibold text-brand-600 hover:text-brand-700">
              Showing {shown.length} of {page.total} · load more
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}
