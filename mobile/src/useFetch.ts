import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { errMsg, get, type Paged } from './api';
import { useLiveEvent, useRealtime, type LiveEvent } from './realtime';

type Query = Record<string, string | number | boolean | undefined | null>;

/**
 * GET with loading / error / pull-to-refresh. Reloads quietly when the screen comes back into focus.
 *   const { data, error, loading, refreshing, onRefresh, reload } = useFetch<T>('/dashboard')
 */
export function useFetch<T>(path: string | null, query?: Query) {
  const key = JSON.stringify(query ?? {});
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const [refreshing, setRefreshing] = useState(false);
  const seq = useRef(0);
  const first = useRef(true);

  const load = useCallback(async (mode: 'initial' | 'refresh' | 'quiet' = 'initial') => {
    if (!path) return;
    const id = ++seq.current;
    if (mode === 'initial') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    try {
      const r = await get<T>(path, JSON.parse(key));
      if (id === seq.current) {
        setData(r);
        setError(null);
      }
    } catch (e) {
      if (id === seq.current && mode !== 'quiet') setError(errMsg(e));
    } finally {
      if (id === seq.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [path, key]);

  useEffect(() => {
    first.current = true;
    void load('initial');
  }, [load]);

  // Coming back to the screen (e.g. after saving something) refreshes it without a spinner.
  useFocusEffect(useCallback(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    void load('quiet');
  }, [load]));

  return { data, setData, error, loading, refreshing, onRefresh: () => load('refresh'), reload: () => load('quiet') };
}

/**
 * Paged list: 20 rows per page from the server, with Previous / Next (see <Pager>).
 * Going to another page replaces the rows; changing the filters goes back to page 1.
 */
export function usePaged<T, Extra extends object = object>(path: string | null, query?: Query) {
  const key = JSON.stringify(query ?? {});
  const [items, setItems] = useState<T[]>([]);
  const [extra, setExtra] = useState<Extra | null>(null);
  const [page, setPageState] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(20);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const [refreshing, setRefreshing] = useState(false);
  const seq = useRef(0);
  const pageRef = useRef(1);

  const load = useCallback(async (p: number, mode: 'initial' | 'refresh' | 'quiet') => {
    if (!path) return;
    const id = ++seq.current;
    if (mode === 'initial') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    try {
      const r = await get<Paged<T> & Extra>(path, { ...JSON.parse(key), page: p });
      if (id !== seq.current) return;
      // The page we were on became empty (rows deleted) → step back to the last real page.
      if (!r.items.length && p > 1 && r.total > 0) {
        pageRef.current = r.pages;
        setPageState(r.pages);
        void load(r.pages, 'quiet');
        return;
      }
      const { items: rows, page: pg, pages: pgs, total: tot, limit: lim, ...rest } = r;
      setItems(rows);
      setExtra(rest as unknown as Extra);
      pageRef.current = pg;
      setPageState(pg);
      setPages(pgs);
      setTotal(tot);
      setLimit(lim || 20);
      setError(null);
    } catch (e) {
      if (id === seq.current) setError(errMsg(e));
    } finally {
      if (id === seq.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [path, key]);

  // New filters → page 1.
  useEffect(() => {
    pageRef.current = 1;
    setPageState(1);
    void load(1, 'initial');
  }, [load]);

  const first = useRef(true);
  useFocusEffect(useCallback(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    void load(pageRef.current, 'quiet');
  }, [load]));

  const setPage = useCallback((p: number) => {
    pageRef.current = p;
    setPageState(p);
    void load(p, 'initial');
  }, [load]);

  return {
    items, extra, total, page, pages, error, loading, refreshing,
    setPage,
    pager: { page, pages, total, limit, onChange: setPage, loading },
    onRefresh: () => load(pageRef.current, 'refresh'),
    reload: () => load(pageRef.current, 'quiet'),
  };
}

/**
 * Keeps a screen live: reloads when one of `events` arrives over the socket and when the app
 * comes back to the foreground. While the live connection is down it falls back to checking
 * every `ms` (default 30 s) as long as the screen is open.
 */
export function usePoll(fn: () => void, events: LiveEvent[] = ['notification:new'], ms = 30_000) {
  const ref = useRef(fn);
  ref.current = fn;
  const { connected } = useRealtime();
  useLiveEvent([...events, 'app:resume'], () => ref.current());
  useFocusEffect(useCallback(() => {
    if (connected) return;
    const t = setInterval(() => ref.current(), ms);
    return () => clearInterval(t);
  }, [ms, connected]));
}
