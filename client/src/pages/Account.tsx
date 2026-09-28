import { ArrowLeft, KeyRound, LogOut, UserRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { Button, Card, CardHeader, ConfirmDialog, Input, PageHeader } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { TOKEN_KEY, api, errMsg } from '../lib/api';

/**
 * "My account" for every role: update name / phone, change password, sign out everywhere.
 * Teachers and admins see it inside the app shell; parents get it as a standalone page.
 */
export default function Account() {
  const { session, refresh, logout } = useAuth();
  const [profile, setProfile] = useState({ name: session?.user.name ?? '', phone: session?.user.phone ?? '' });
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [busy, setBusy] = useState<'profile' | 'pw' | 'all' | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setBusy('profile');
    try {
      await api.put('/auth/me', { name: profile.name, phone: profile.phone });
      await refresh();
      toast.success('Profile updated');
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(null);
    }
  };

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (pw.next.length < 8) return toast.error('New password must be at least 8 characters');
    if (pw.next !== pw.confirm) return toast.error('New passwords do not match');
    setBusy('pw');
    try {
      const { data } = await api.put<{ token: string }>('/auth/password', { current: pw.current, next: pw.next });
      // This device stays signed in with a fresh token; every other device is signed out.
      if (data.token) localStorage.setItem(TOKEN_KEY, data.token);
      setPw({ current: '', next: '', confirm: '' });
      toast.success('Password changed. Other devices have been signed out.');
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(null);
    }
  };

  const signOutEverywhere = async () => {
    setBusy('all');
    try {
      await api.post('/auth/logout-all');
      logout();
    } catch (err) {
      toast.error(errMsg(err));
      setBusy(null);
    }
  };

  return (
    <div className="max-w-2xl space-y-5">
      <PageHeader title="My account" subtitle={session?.user.email} />
      <Card>
        <CardHeader title="Profile" icon={<UserRound className="h-5 w-5" />} />
        <form onSubmit={saveProfile} className="grid gap-4 sm:grid-cols-2">
          <Input label="Full name" required maxLength={80} value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
          <Input label="Phone" type="tel" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
          <Input className="sm:col-span-2" label="Email (login)" value={session?.user.email ?? ''} disabled hint="To change your login email, ask your institute." />
          <div className="sm:col-span-2">
            <Button type="submit" loading={busy === 'profile'}>Save profile</Button>
          </div>
        </form>
      </Card>
      <Card>
        <CardHeader title="Change password" subtitle="At least 8 characters. Other devices will be signed out." icon={<KeyRound className="h-5 w-5" />} />
        <form onSubmit={changePassword} className="grid gap-4 sm:grid-cols-2">
          <Input className="sm:col-span-2" label="Current password" type="password" required autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          <Input label="New password" type="password" required minLength={8} autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          <Input label="Confirm new password" type="password" required autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
          <div className="sm:col-span-2">
            <Button type="submit" loading={busy === 'pw'}>Change password</Button>
          </div>
        </form>
      </Card>
      <Card>
        <CardHeader title="Sign out of all devices" subtitle="Use this if you lost a phone or logged in on a shared computer." icon={<LogOut className="h-5 w-5" />} />
        <Button variant="danger" onClick={() => setConfirmAll(true)}>Sign out everywhere</Button>
      </Card>
      <ConfirmDialog open={confirmAll} onClose={() => setConfirmAll(false)} onConfirm={signOutEverywhere} loading={busy === 'all'} danger
        title="Sign out everywhere?" text="You will be logged out on every device, including this one." confirmLabel="Sign out everywhere" />
    </div>
  );
}

/** Parents have no sidebar shell — a simple page frame around the same account screen. */
export function PortalAccount() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Logo to="/portal" />
          <Link to="/portal" className="flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700">
            <ArrowLeft className="h-4 w-4" /> Back to portal
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">
        <Account />
      </main>
    </div>
  );
}
