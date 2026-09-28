import axios, { AxiosError } from 'axios';

export const TOKEN_KEY = 'coachflow.token';
/** One-time message shown on the login page (e.g. after an institute is suspended). */
export const NOTICE_KEY = 'coachflow.notice';

export const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

api.interceptors.response.use(
  (r) => r,
  (err: AxiosError<{ message?: string; code?: string; feature?: string }>) => {
    if (err.response?.status === 401 && localStorage.getItem(TOKEN_KEY)) {
      localStorage.removeItem(TOKEN_KEY);
      if (!location.pathname.startsWith('/login')) location.href = '/login';
    }
    // The institute was suspended by CoachFlow: sign out everywhere and explain why on the login page.
    if (err.response?.data?.code === 'INSTITUTE_SUSPENDED' && localStorage.getItem(TOKEN_KEY)) {
      localStorage.removeItem(TOKEN_KEY);
      try {
        sessionStorage.setItem(NOTICE_KEY, err.response.data.message ?? 'This institute account has been suspended.');
      } catch {
        /* storage unavailable — the login page still shows the error on the next attempt */
      }
      if (!location.pathname.startsWith('/login')) location.href = '/login';
    }
    if (err.response?.data?.code === 'UPGRADE_REQUIRED') {
      window.dispatchEvent(new CustomEvent('coachflow:upgrade', { detail: err.response.data }));
    }
    return Promise.reject(err);
  },
);

/** Human-readable message from any API error. */
export function errMsg(e: unknown, fallback = 'Something went wrong') {
  const ax = e as AxiosError<{ message?: string }>;
  return ax?.response?.data?.message || (ax?.message === 'Network Error' ? 'Cannot reach the server' : fallback);
}

export const isUpgradeError = (e: unknown) => (e as AxiosError<{ code?: string }>)?.response?.data?.code === 'UPGRADE_REQUIRED';
