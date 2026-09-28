import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errMsg } from '../lib/api';
import { PAGE_SIZE, type Paged } from '../lib/types';

/**
 * GET helper: `const { data, loading, error, reload } = useApi<T>('/students', { search })`.
 * Pass `null` as the url to skip fetching.
 */
export function useApi<T>(url: string | null, params?: Record<string, unknown>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!url);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const key = JSON.stringify(params ?? {});
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!url) return;
    const id = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<T>(url, { params: JSON.parse(key) });
      if (id === seq.current) {
        setData(res.data);
        setStatus(res.status);
      }
    } catch (e) {
      if (id === seq.current) {
        setError(errMsg(e));
        setStatus((e as { response?: { status?: number } })?.response?.status ?? null);
      }
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [url, key]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, status, reload: load, setData };
}

export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Paged GET: `const list = usePagedApi<Student>('/students', { search, status })`.
 * Keeps its own `page` (sent as ?page=), jumps back to page 1 whenever the other params
 * change, and returns the server's `{ items, page, pages, total, limit }` as `data`.
 */
export function usePagedApi<T, Extra extends object = object>(url: string | null, params?: Record<string, unknown>) {
  const key = JSON.stringify(params ?? {});
  // The page belongs to one set of filters: whenever the filters change we go back to page 1
  // (also when switching back to an earlier filter).
  const [state, setState] = useState({ key, page: 1 });
  if (state.key !== key) setState({ key, page: 1 });
  const page = state.key === key ? state.page : 1;
  const setPage = useCallback((p: number) => setState({ key, page: p }), [key]);
  const res = useApi<Paged<T> & Extra>(url, { ...(params ?? {}), page });

  // If a page becomes empty (e.g. its last row was deleted), step back to the last real page.
  const d = res.data;
  useEffect(() => {
    if (!res.loading && d && d.page === page && d.items.length === 0 && page > 1) setPage(Math.max(1, Math.min(page - 1, d.pages)));
  }, [d, page, res.loading, setPage]);

  const pager = d ? { page: d.page, pages: d.pages, total: d.total, limit: d.limit, onChange: setPage, loading: res.loading } : null;
  return { ...res, page, setPage, pager };
}

/**
 * Client-side paging for lists that are already fully loaded and naturally small
 * (one batch's students, one student's invoices…): shows 20 at a time with the same Pager.
 */
export function useClientPage<T>(items: T[] | null | undefined, resetKey?: unknown, size = PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const list = items ?? [];
  const pages = Math.max(1, Math.ceil(list.length / size));
  useEffect(() => setPage(1), [resetKey]);
  const current = Math.min(page, pages);
  return {
    items: list.slice((current - 1) * size, current * size),
    pager: { page: current, pages, total: list.length, limit: size, onChange: setPage },
    /** Index of the first item on this page within the full list. */
    offset: (current - 1) * size,
  };
}
