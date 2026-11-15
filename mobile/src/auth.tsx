import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { get, loadStored, post, setToken, setUnauthorizedHandler } from './api';

export type Role = 'owner' | 'teacher' | 'parent' | 'superadmin';

export interface Session {
  user: { id: string; name: string; email: string; role: Role; phone?: string; studentIds: string[] };
  institute: { id: string; name: string; phone?: string; brandColor?: string; logoText?: string; status: string; trialDaysLeft: number | null; plan: string } | null;
  plan: { key: string; name: string; features: string[] } | null;
}

interface AuthCtx {
  ready: boolean;
  session: Session | null;
  login: (email: string, password: string) => Promise<Session>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Parent with several children: the child being viewed. */
  childId: string | null;
  setChildId: (id: string) => void;
  hasFeature: (f: string) => boolean;
}

const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [childId, setChildId] = useState<string | null>(null);

  const logout = useCallback(async () => {
    await setToken(null);
    setSession(null);
    setChildId(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => void logout());
    (async () => {
      const { token } = await loadStored();
      if (token) {
        try {
          const s = await get<Session>('/auth/me');
          setSession(s);
        } catch {
          await setToken(null);
        }
      }
      setReady(true);
    })();
  }, [logout]);

  const login = useCallback(async (email: string, password: string) => {
    const r = await post<Session & { token: string }>('/auth/login', { email: email.trim(), password });
    if (r.user.role === 'superadmin') throw new Error('Super Admin works on the web dashboard. Please use the website.');
    await setToken(r.token);
    const { token: _t, ...s } = r;
    setSession(s);
    return s;
  }, []);

  const refresh = useCallback(async () => {
    setSession(await get<Session>('/auth/me'));
  }, []);

  const value = useMemo<AuthCtx>(() => ({
    ready, session, login, logout, refresh, childId, setChildId,
    hasFeature: (f: string) => !!session?.plan?.features.includes(f),
  }), [ready, session, login, logout, refresh, childId]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
