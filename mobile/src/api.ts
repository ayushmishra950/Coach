import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Tiny API client for the CoachFlow server (same REST API the web app uses).
 * The server address is editable on the login screen, so one build works with any
 * deployment (or with `npm run dev` on your PC over Wi-Fi).
 */
const KEY_TOKEN = 'cf.token';
const KEY_SERVER = 'cf.server';

const store = {
  get: (k: string) => (Platform.OS === 'web' ? Promise.resolve(globalThis.localStorage?.getItem(k) ?? null) : SecureStore.getItemAsync(k)),
  set: (k: string, v: string) => (Platform.OS === 'web' ? Promise.resolve(globalThis.localStorage?.setItem(k, v)) : SecureStore.setItemAsync(k, v)),
  del: (k: string) => (Platform.OS === 'web' ? Promise.resolve(globalThis.localStorage?.removeItem(k)) : SecureStore.deleteItemAsync(k)),
};

let token: string | null = null;
let server = normalizeServer(String((Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ?? 'http://192.168.1.10:4600'));
let onUnauthorized: (() => void) | null = null;

export function normalizeServer(url: string) {
  let u = url.trim().replace(/\/+$/, '').replace(/\/api$/, '');
  if (u && !/^https?:\/\//i.test(u)) u = `http://${u}`;
  return u;
}

export async function loadStored() {
  token = await store.get(KEY_TOKEN);
  const s = await store.get(KEY_SERVER);
  if (s) server = s;
  return { token, server };
}

export const getServer = () => server;
export const getToken = () => token;

export async function setServer(url: string) {
  server = normalizeServer(url);
  await store.set(KEY_SERVER, server);
}

export async function setToken(t: string | null) {
  token = t;
  if (t) await store.set(KEY_TOKEN, t);
  else await store.del(KEY_TOKEN);
}

export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

export async function api<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown, query?: Query): Promise<T> {
  const qs = query
    ? Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';
  const url = `${server}/api${path}${qs ? `?${qs}` : ''}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25_000);
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new ApiError((e as Error).name === 'AbortError' ? 'The server is taking too long. Check your internet.' : `Cannot reach the server (${server}). Check the address and your internet.`, 0);
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const d = (data ?? {}) as { message?: string; code?: string };
    if (res.status === 401 && token) onUnauthorized?.();
    throw new ApiError(d.message || `Request failed (${res.status})`, res.status, d.code);
  }
  return data as T;
}

export const get = <T>(path: string, query?: Query) => api<T>('GET', path, undefined, query);
export const post = <T>(path: string, body?: unknown) => api<T>('POST', path, body ?? {});
export const put = <T>(path: string, body?: unknown) => api<T>('PUT', path, body ?? {});
export const del = <T>(path: string) => api<T>('DELETE', path);

export const errMsg = (e: unknown, fallback = 'Something went wrong') => (e instanceof Error && e.message ? e.message : fallback);

/** Paged list responses from the server. */
export interface Paged<T> { items: T[]; page: number; pages: number; total: number; limit: number }
