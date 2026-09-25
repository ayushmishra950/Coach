import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { TOKEN_KEY, api } from '../lib/api';
import type { FeatureKey, Session } from '../lib/types';

interface AuthCtx {
  session: Session | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<Session>;
  register: (data: Record<string, string>) => Promise<Session>;
  logout: () => void;
  refresh: () => Promise<void>;
  hasFeature: (f: FeatureKey) => boolean;
}

const Ctx = createContext<AuthCtx>(null as never);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!localStorage.getItem(TOKEN_KEY)) {
      setSession(null);
      return;
    }
    try {
      const { data } = await api.get<Session>('/auth/me');
      setSession(data);
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      setSession(null);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const accept = (data: Session & { token: string }) => {
    localStorage.setItem(TOKEN_KEY, data.token);
    const { token: _t, ...s } = data;
    setSession(s);
    return s;
  };

  const login = async (email: string, password: string) => accept((await api.post('/auth/login', { email, password })).data);
  const register = async (body: Record<string, string>) => accept((await api.post('/auth/register', body)).data);
  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setSession(null);
    location.href = '/login';
  };
  const hasFeature = (f: FeatureKey) => !!session?.plan?.features.includes(f);

  return <Ctx.Provider value={{ session, loading, login, register, logout, refresh, hasFeature }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

export const homeFor = (role?: string) =>
  role === 'superadmin' ? '/admin' : role === 'parent' ? '/portal' : role ? '/app' : '/login';
