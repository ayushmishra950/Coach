import {
  BarChart3, Bell, BookOpen, Building2, CalendarCheck, ClipboardList, CreditCard, Crown, GraduationCap, IndianRupee,
  LayoutDashboard, LifeBuoy, LogOut, Megaphone, Menu, MessageCircle, ScrollText, Settings, Sparkles, UserRound, UserSquare2, X, type LucideIcon,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../context/RealtimeContext';
import type { FeatureKey } from '../lib/types';
import { Logo } from './Logo';
import { NotificationBell } from './NotificationBell';
import { Avatar, Button, Modal, clsx } from './ui';
import { FEATURE_INFO } from '../lib/features';

interface NavItem { to: string; label: string; icon: LucideIcon; end?: boolean; feature?: FeatureKey; section?: string; chatBadge?: boolean }

const OWNER_NAV: NavItem[] = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/students', label: 'Students', icon: GraduationCap, section: 'Manage' },
  { to: '/app/teachers', label: 'Teachers', icon: UserSquare2 },
  { to: '/app/batches', label: 'Batches', icon: BookOpen },
  { to: '/app/attendance', label: 'Attendance', icon: CalendarCheck, section: 'Daily work' },
  { to: '/app/fees', label: 'Fees', icon: IndianRupee },
  { to: '/app/tests', label: 'Tests & Marks', icon: ClipboardList },
  { to: '/app/messages', label: 'Messages', icon: MessageCircle, chatBadge: true },
  { to: '/app/announcements', label: 'Announcements', icon: Megaphone },
  { to: '/app/reports', label: 'Reports', icon: BarChart3, section: 'Insights' },
  { to: '/app/insights', label: 'AI Insights', icon: Sparkles, feature: 'aiInsights' },
  { to: '/app/notifications', label: 'Notifications', icon: Bell },
  { to: '/app/subscription', label: 'Subscription', icon: Crown, section: 'Account' },
  { to: '/app/settings', label: 'Settings', icon: Settings },
  { to: '/app/account', label: 'My account', icon: UserRound },
];

const TEACHER_NAV: NavItem[] = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/attendance', label: 'Attendance', icon: CalendarCheck, section: 'Daily work' },
  { to: '/app/tests', label: 'Tests & Marks', icon: ClipboardList },
  { to: '/app/batches', label: 'My Batches', icon: BookOpen },
  { to: '/app/students', label: 'My Students', icon: GraduationCap },
  { to: '/app/messages', label: 'Messages', icon: MessageCircle, chatBadge: true },
  { to: '/app/announcements', label: 'Announcements', icon: Megaphone },
  { to: '/app/notifications', label: 'Notifications', icon: Bell, section: 'Account' },
  { to: '/app/account', label: 'My account', icon: UserRound },
];

const ADMIN_NAV: NavItem[] = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/admin/institutes', label: 'Institutes', icon: Building2, section: 'Customers' },
  { to: '/admin/payments', label: 'Payments', icon: CreditCard },
  { to: '/admin/tickets', label: 'Support', icon: LifeBuoy },
  { to: '/admin/plans', label: 'Plans & Pricing', icon: Crown, section: 'Configuration' },
  { to: '/admin/audit', label: 'Audit log', icon: ScrollText },
  { to: '/admin/account', label: 'My account', icon: UserRound },
];

function Sidebar({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const { session, hasFeature, logout } = useAuth();
  const { chatUnread } = useRealtime();
  const inst = session?.institute;
  const isAdmin = session?.user.role === 'superadmin';
  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-4 pt-5">
        <Logo to={isAdmin ? '/admin' : '/app'} light />
      </div>
      {inst && (
        <div className="mx-3 mb-3 flex items-center gap-3 rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-extrabold text-white" style={{ background: inst.brandColor || '#6366f1' }}>
            {inst.logoText || inst.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white">{inst.name}</p>
            {/* Only the owner sees the CoachFlow plan; teachers just see their role. */}
            <p className="text-xs capitalize text-slate-400">
              {session?.user.role === 'owner' ? `${session?.plan?.name ?? inst.plan} plan${inst.status === 'trial' ? ' · Trial' : ''}` : session?.user.role}
            </p>
          </div>
        </div>
      )}
      {isAdmin && <p className="mx-5 mb-2 rounded-lg bg-amber-400/10 px-2 py-1 text-center text-xs font-bold uppercase tracking-wider text-amber-300">Super Admin</p>}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4 scrollbar-thin">
        {items.map((it) => (
          <div key={it.to}>
            {it.section && <p className="px-3 pb-1.5 pt-4 text-[11px] font-bold uppercase tracking-wider text-slate-500">{it.section}</p>}
            <NavLink to={it.to} end={it.end} onClick={onNavigate}
              className={({ isActive }) => clsx('group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition',
                isActive ? 'bg-gradient-to-r from-brand-600 to-violet-600 text-white shadow-lg shadow-brand-900/30' : 'text-slate-300 hover:bg-white/5 hover:text-white')}>
              <it.icon className="h-[18px] w-[18px]" />
              <span className="flex-1">{it.label}</span>
              {it.feature && !hasFeature(it.feature) && <Crown className="h-3.5 w-3.5 text-amber-300" />}
              {it.chatBadge && chatUnread > 0 && (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">{chatUnread > 99 ? '99+' : chatUnread}</span>
              )}
            </NavLink>
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 p-3">
        <button onClick={logout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-400 hover:bg-white/5 hover:text-white">
          <LogOut className="h-[18px] w-[18px]" /> Log out
        </button>
      </div>
    </div>
  );
}

/** Global listener: when the API says UPGRADE_REQUIRED, show a friendly modal. */
function UpgradeListener() {
  const { session } = useAuth();
  const isOwner = session?.user.role === 'owner';
  const [feature, setFeature] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const nav = useNavigate();
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent<{ feature?: string; message?: string }>).detail;
      setFeature(d.feature ?? 'plan');
      setMessage(d.message ?? '');
    };
    window.addEventListener('coachflow:upgrade', h);
    return () => window.removeEventListener('coachflow:upgrade', h);
  }, []);
  const info = feature && FEATURE_INFO[feature as FeatureKey];

  // Plans, prices and upgrades are for the institute owner only. Anyone else just learns the
  // feature isn't switched on for their institute — no upgrade button, no plan names.
  if (!isOwner) {
    return (
      <Modal open={!!feature} onClose={() => setFeature(null)} size="sm" title="Not available yet"
        footer={<Button onClick={() => setFeature(null)}>OK</Button>}>
        <p className="text-sm text-slate-600">
          {info ? `${info.label} isn’t switched on for your institute yet.` : 'This feature isn’t switched on for your institute yet.'} Please speak to your institute owner if you need it.
        </p>
      </Modal>
    );
  }
  return (
    <Modal open={!!feature} onClose={() => setFeature(null)} size="sm" title="✨ Time to upgrade"
      footer={<><Button variant="secondary" onClick={() => setFeature(null)}>Not now</Button><Button variant="premium" onClick={() => { setFeature(null); nav('/app/subscription'); }}><Crown className="h-4 w-4" /> View plans</Button></>}>
      <p className="text-sm text-slate-600">{info ? `${info.label} is available on the ${info.minPlan === 'premium' ? 'Premium' : 'Growth'} plan and above.` : message}</p>
    </Modal>
  );
}

function TrialBanner() {
  const { session } = useAuth();
  const inst = session?.institute;
  if (!inst || session.user.role !== 'owner') return null;
  if (inst.status === 'trial' && inst.trialDaysLeft != null) {
    return (
      <div className="no-print flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-gradient-to-r from-brand-600 via-violet-600 to-fuchsia-600 px-4 py-2 text-center text-sm font-medium text-white">
        <Sparkles className="h-4 w-4" />
        {inst.trialDaysLeft > 0 ? `You're on a free Premium trial — ${inst.trialDaysLeft} days left.` : 'Your free trial has ended. You are now on Starter features.'}
        <Link to="/app/subscription" className="rounded-full bg-white/20 px-3 py-0.5 font-semibold hover:bg-white/30">Choose a plan →</Link>
      </div>
    );
  }
  if (inst.status === 'past_due' || inst.status === 'cancelled') {
    return (
      <div className="no-print bg-rose-600 px-4 py-2 text-center text-sm font-medium text-white">
        {inst.status === 'past_due' ? 'Your subscription period has ended. Renew now to keep your plan’s features.' : 'Your subscription is cancelled — premium features are locked.'}{' '}
        <Link to="/app/subscription" className="underline">Manage subscription</Link>
      </div>
    );
  }
  return null;
}

export function Shell({ variant }: { variant: 'app' | 'admin' }) {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  const items = variant === 'admin' ? ADMIN_NAV : session?.user.role === 'teacher' ? TEACHER_NAV : OWNER_NAV;

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 bg-slate-950 lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(99,102,241,.25),transparent_60%)]" />
        <div className="relative h-full"><Sidebar items={items} /></div>
      </aside>
      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-slate-950 shadow-2xl animate-fade-up">
            <button onClick={() => setOpen(false)} className="absolute right-3 top-5 rounded-lg p-1.5 text-slate-400 hover:bg-white/10"><X className="h-5 w-5" /></button>
            <Sidebar items={items} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <TrialBanner />
        <header className="no-print sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200/70 bg-white/80 px-4 backdrop-blur-xl sm:px-6">
          <button onClick={() => setOpen(true)} className="rounded-xl p-2 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Open menu"><Menu className="h-5 w-5" /></button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-800 lg:hidden">{session?.institute?.name ?? 'CoachFlow Admin'}</p>
          </div>
          {variant === 'app' && <HeaderChatLink />}
          {variant === 'app' && <NotificationBell allHref="/app/notifications" />}
          <div className="flex items-center gap-3 pl-1">
            <Avatar name={session?.user.name ?? '?'} size="sm" />
            <div className="hidden leading-tight sm:block">
              <p className="text-sm font-bold text-slate-800">{session?.user.name}</p>
              <p className="text-xs capitalize text-slate-500">{session?.user.role === 'superadmin' ? 'Super Admin' : session?.user.role}</p>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="animate-fade-up"><Outlet /></div>
        </main>
      </div>
      {variant === 'app' && <UpgradeListener />}
    </div>
  );
}

function HeaderChatLink() {
  const { chatUnread } = useRealtime();
  return (
    <Link to="/app/messages" className="relative rounded-xl p-2.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800" aria-label="Messages" title="Messages">
      <MessageCircle className="h-5 w-5" />
      {chatUnread > 0 && (
        <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
          {chatUnread > 9 ? '9+' : chatUnread}
        </span>
      )}
    </Link>
  );
}

export function Protected({ roles, children }: { roles: string[]; children: ReactNode }) {
  const { session, loading } = useAuth();
  const loc = useLocation();
  if (loading) return null;
  if (!session) return <NavigateTo to={`/login?next=${encodeURIComponent(loc.pathname)}`} />;
  if (!roles.includes(session.user.role)) return <NavigateTo to={session.user.role === 'superadmin' ? '/admin' : session.user.role === 'parent' ? '/portal' : '/app'} />;
  return <>{children}</>;
}

function NavigateTo({ to }: { to: string }) {
  const nav = useNavigate();
  useEffect(() => nav(to, { replace: true }), [nav, to]);
  return null;
}

