import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errMsg } from '../lib/api';

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
