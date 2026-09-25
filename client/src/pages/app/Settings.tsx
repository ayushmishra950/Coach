import { BellRing, Building2, Check, IndianRupee, KeyRound, Lock, Mail, MessageCircle, Palette, Save, Smartphone, UserCircle2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import { UpgradeCard } from '../../components/Upgrade';
import { Button, Card, CardHeader, ErrorState, Input, PageHeader, Select, Skeleton, Tabs, Toggle, clsx } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../hooks/useApi';
import { api, errMsg } from '../../lib/api';

interface InstSettings {
  channels: { inApp: boolean; whatsapp: boolean; email: boolean; sms: boolean };
  reminders: { enabled: boolean; daysBefore: number; onDueDate: boolean; daysAfter: number };
  absentAlertAfter: number;
  notifyParentOnAbsence: boolean;
}
interface InstituteDoc {
  _id: string; name: string; phone?: string; email?: string; address?: string; city?: string; type?: string; logoText?: string; brandColor?: string;
  settings: InstSettings;
}

type TabKey = 'profile' | 'branding' | 'notifications' | 'reminders' | 'account';

const TYPES = ['School Tuition', 'JEE/NEET', 'SSC/Banking', 'English Speaking', 'Computer Institute', 'Coding Academy', 'Other'];
const PRESETS = ['#6366f1', '#8b5cf6', '#d946ef', '#ec4899', '#f43f5e', '#f97316', '#f59e0b', '#10b981', '#14b8a6', '#0ea5e9', '#2563eb', '#0f172a'];

const DEFAULT_SETTINGS: InstSettings = {
  channels: { inApp: true, whatsapp: false, email: true, sms: false },
  reminders: { enabled: true, daysBefore: 3, onDueDate: true, daysAfter: 3 },
  absentAlertAfter: 3,
  notifyParentOnAbsence: true,
};

function Row({ icon, children, locked }: { icon: ReactNode; children: ReactNode; locked?: boolean }) {
  return (
    <div className={clsx('flex items-start gap-4 rounded-2xl border p-4', locked ? 'border-dashed border-slate-200 bg-slate-50/60' : 'border-slate-200')}>
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-50 text-slate-600 ring-1 ring-slate-200">{icon}</div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function SaveBar({ onSave, saving, dirty }: { onSave: () => void; saving: boolean; dirty?: boolean }) {
  return (
    <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-5">
      {dirty && <span className="text-xs font-medium text-amber-600">Unsaved changes</span>}
      <Button loading={saving} icon={<Save className="h-4 w-4" />} onClick={onSave}>Save changes</Button>
    </div>
  );
}

export default function Settings() {
  const { session, hasFeature, refresh } = useAuth();
  const { data, loading, error, reload, setData } = useApi<InstituteDoc>('/settings');
  const [tab, setTab] = useState<TabKey>('profile');
  const [saving, setSaving] = useState(false);

  const [profile, setProfile] = useState({ name: '', phone: '', email: '', address: '', city: '', type: 'School Tuition', logoText: '' });
  const [brandColor, setBrandColor] = useState('#6366f1');
  const [s, setS] = useState<InstSettings>(DEFAULT_SETTINGS);
  const [me, setMe] = useState({ name: '', phone: '' });
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });

  useEffect(() => {
    if (!data) return;
    setProfile({ name: data.name ?? '', phone: data.phone ?? '', email: data.email ?? '', address: data.address ?? '', city: data.city ?? '', type: data.type ?? 'School Tuition', logoText: data.logoText ?? '' });
    setBrandColor(data.brandColor || '#6366f1');
    const ds = data.settings ?? DEFAULT_SETTINGS;
    setS({
      channels: { ...DEFAULT_SETTINGS.channels, ...ds.channels },
      reminders: { ...DEFAULT_SETTINGS.reminders, ...ds.reminders },
      absentAlertAfter: ds.absentAlertAfter ?? 3,
      notifyParentOnAbsence: ds.notifyParentOnAbsence ?? true,
    });
  }, [data]);

  useEffect(() => {
    if (session) setMe({ name: session.user.name, phone: session.user.phone ?? '' });
  }, [session]);

  const canBrand = hasFeature('customBranding');
  const canWhatsapp = hasFeature('whatsapp');
  const canReminders = hasFeature('feeReminders');

  const saveInstitute = async (body: Record<string, unknown>, msg: string) => {
    setSaving(true);
    try {
      const { data: inst } = await api.put<InstituteDoc>('/settings', body);
      setData(inst);
      await refresh();
      toast.success(msg);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const saveMe = async () => {
    if (!me.name.trim()) return toast.error('Name is required');
    setSaving(true);
    try {
      await api.put('/auth/me', me);
      await refresh();
      toast.success('Profile updated');
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const savePw = async () => {
    if (pw.next.length < 6) return toast.error('New password must be at least 6 characters');
    if (pw.next !== pw.confirm) return toast.error('Passwords do not match');
    setSaving(true);
    try {
      await api.put('/auth/password', { current: pw.current, next: pw.next });
      setPw({ current: '', next: '', confirm: '' });
      toast.success('Password changed');
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  if (error) return <ErrorState message={error} onRetry={reload} />;

  const badge = (profile.logoText || profile.name.slice(0, 2)).toUpperCase().slice(0, 3) || 'CF';
  const setCh = (k: keyof InstSettings['channels'], v: boolean) => setS({ ...s, channels: { ...s.channels, [k]: v } });
  const setRem = (patch: Partial<InstSettings['reminders']>) => setS({ ...s, reminders: { ...s.reminders, ...patch } });
  const numIn = (v: string, min: number, max: number) => Math.max(min, Math.min(max, Number(v) || 0));

  const tabs: { value: TabKey; label: ReactNode }[] = [
    { value: 'profile', label: <><Building2 className="h-4 w-4" /> Institute</> },
    { value: 'branding', label: <><Palette className="h-4 w-4" /> Branding{!canBrand && <Lock className="h-3 w-3 text-amber-500" />}</> },
    { value: 'notifications', label: <><BellRing className="h-4 w-4" /> Notifications</> },
    { value: 'reminders', label: <><IndianRupee className="h-4 w-4" /> Fee reminders{!canReminders && <Lock className="h-3 w-3 text-amber-500" />}</> },
    { value: 'account', label: <><UserCircle2 className="h-4 w-4" /> My account</> },
  ];

  return (
    <div className="animate-fade-up">
      <PageHeader title="Settings" subtitle="Institute profile, branding, notifications and your account" />
      <Tabs tabs={tabs} value={tab} onChange={setTab} className="mb-6" />

      {loading || !data ? (
        <Card><div className="grid gap-4 sm:grid-cols-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div></Card>
      ) : (
        <div className="max-w-4xl">
          {tab === 'profile' && (
            <Card>
              <CardHeader title="Institute profile" subtitle="Shown on receipts, parent messages and the parent portal" icon={<Building2 className="h-5 w-5" />} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input className="sm:col-span-2" label="Institute name" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
                <Input label="Phone" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
                <Input label="Email" type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} />
                <Input className="sm:col-span-2" label="Address" value={profile.address} onChange={(e) => setProfile({ ...profile, address: e.target.value })} />
                <Input label="City" value={profile.city} onChange={(e) => setProfile({ ...profile, city: e.target.value })} />
                <Select label="Institute type" value={profile.type} onChange={(e) => setProfile({ ...profile, type: e.target.value })}>
                  {[...new Set([...TYPES, profile.type])].map((t) => <option key={t}>{t}</option>)}
                </Select>
                <Input label="Logo text" maxLength={3} placeholder="e.g. BF" hint="2–3 letters shown in your logo badge" value={profile.logoText} onChange={(e) => setProfile({ ...profile, logoText: e.target.value })} />
              </div>
              <SaveBar saving={saving} onSave={() => {
                if (!profile.name.trim()) return toast.error('Institute name is required');
                saveInstitute(profile, 'Institute profile saved');
              }} />
            </Card>
          )}

          {tab === 'branding' && (
            <div className="space-y-4">
              {!canBrand && <UpgradeCard emoji="🎨" title="Make CoachFlow look like your institute" text="Custom brand colours are available on the Premium plan." cta="Upgrade to Premium" />}
              <Card className={clsx(!canBrand && 'pointer-events-none select-none opacity-60')}>
                <CardHeader title="Brand colour" subtitle="Used for your institute badge across the app and parent portal" icon={<Palette className="h-5 w-5" />} />
                <div className="grid gap-8 md:grid-cols-2">
                  <div>
                    <p className="label">Presets</p>
                    <div className="flex flex-wrap gap-2.5">
                      {PRESETS.map((c) => (
                        <button key={c} type="button" disabled={!canBrand} onClick={() => setBrandColor(c)} aria-label={c}
                          className={clsx('grid h-10 w-10 place-items-center rounded-xl text-white shadow-sm ring-offset-2 transition hover:scale-110', brandColor.toLowerCase() === c && 'ring-2 ring-slate-900')}
                          style={{ background: c }}>
                          {brandColor.toLowerCase() === c && <Check className="h-4 w-4" />}
                        </button>
                      ))}
                    </div>
                    <p className="label mt-5">Custom</p>
                    <div className="flex items-center gap-3">
                      <input type="color" disabled={!canBrand} value={brandColor} onChange={(e) => setBrandColor(e.target.value)} className="h-11 w-14 cursor-pointer rounded-xl border border-slate-200 bg-white p-1" />
                      <input className="input font-mono" disabled={!canBrand} value={brandColor} onChange={(e) => setBrandColor(e.target.value)} maxLength={7} />
                    </div>
                  </div>
                  <div>
                    <p className="label">Live preview</p>
                    <div className="rounded-2xl bg-slate-900 p-4">
                      <div className="flex items-center gap-3 rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-extrabold text-white transition-colors" style={{ background: brandColor }}>{badge}</div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-white">{profile.name || 'Your institute'}</p>
                          <p className="text-xs capitalize text-slate-400">{session?.plan?.name ?? 'Premium'} plan</p>
                        </div>
                      </div>
                      <div className="mt-3 space-y-1">
                        {['Dashboard', 'Students', 'Attendance'].map((x, i) => (
                          <div key={x} className={clsx('rounded-xl px-3 py-2 text-sm font-semibold', i === 0 ? 'text-white' : 'text-slate-400')} style={i === 0 ? { background: brandColor } : undefined}>{x}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                {canBrand && <SaveBar saving={saving} dirty={brandColor !== (data.brandColor || '#6366f1')} onSave={() => {
                  if (!/^#[0-9a-f]{6}$/i.test(brandColor)) return toast.error('Enter a valid hex colour like #6366f1');
                  saveInstitute({ brandColor }, 'Brand colour updated');
                }} />}
              </Card>
            </div>
          )}

          {tab === 'notifications' && (
            <div className="space-y-4">
              <Card>
                <CardHeader title="Notification channels" subtitle="How parents and staff receive alerts" icon={<BellRing className="h-5 w-5" />} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Row icon={<BellRing className="h-5 w-5 text-brand-600" />}>
                    <Toggle checked disabled onChange={() => {}} label="In-app" description="Always on — dashboard & parent portal" />
                  </Row>
                  <Row icon={<MessageCircle className="h-5 w-5 text-[#128C7E]" />} locked={!canWhatsapp}>
                    <Toggle checked={canWhatsapp && s.channels.whatsapp} disabled={!canWhatsapp} onChange={(v) => setCh('whatsapp', v)}
                      label={<span className="flex items-center gap-1.5">WhatsApp {!canWhatsapp && <Lock className="h-3.5 w-3.5 text-amber-500" />}</span>}
                      description={canWhatsapp ? 'Highest open rates with parents' : 'Available on Growth & Premium'} />
                  </Row>
                  <Row icon={<Mail className="h-5 w-5 text-sky-600" />}>
                    <Toggle checked={s.channels.email} onChange={(v) => setCh('email', v)} label="Email" description="Receipts, results and reminders" />
                  </Row>
                  <Row icon={<Smartphone className="h-5 w-5 text-amber-600" />}>
                    <Toggle checked={s.channels.sms} onChange={(v) => setCh('sms', v)} label="SMS" description="Fallback for parents without WhatsApp" />
                  </Row>
                </div>
                {!canWhatsapp && <UpgradeCard className="mt-4" compact emoji="💬" title="Reach parents on WhatsApp" text="Send absence alerts, fee reminders and results straight to parents' WhatsApp." cta="Unlock WhatsApp" />}

                <h4 className="mb-3 mt-8 text-sm font-bold text-slate-900">Attendance alerts</h4>
                <div className="space-y-3">
                  <Row icon={<UserCircle2 className="h-5 w-5 text-rose-500" />}>
                    <Toggle checked={s.notifyParentOnAbsence} onChange={(v) => setS({ ...s, notifyParentOnAbsence: v })}
                      label="Notify parent when a student is absent" description="Sent right after the teacher marks attendance" />
                  </Row>
                  <Row icon={<BellRing className="h-5 w-5 text-amber-500" />}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">Repeated absence alert</p>
                        <p className="text-xs text-slate-500">Alert you when a student is absent this many days in a row (2–10)</p>
                      </div>
                      <input type="number" min={2} max={10} className="input w-24" value={s.absentAlertAfter} onChange={(e) => setS({ ...s, absentAlertAfter: numIn(e.target.value, 2, 10) })} />
                    </div>
                  </Row>
                </div>
                <SaveBar saving={saving} onSave={() => saveInstitute({
                  settings: {
                    channels: { whatsapp: canWhatsapp ? s.channels.whatsapp : false, email: s.channels.email, sms: s.channels.sms },
                    notifyParentOnAbsence: s.notifyParentOnAbsence, absentAlertAfter: s.absentAlertAfter,
                  },
                }, 'Notification settings saved')} />
              </Card>
            </div>
          )}

          {tab === 'reminders' && (
            <div className="space-y-4">
              {!canReminders && <UpgradeCard emoji="💰" title="STOP CHASING FEES MANUALLY" text="CoachFlow can remind parents automatically before and after every due date." cta="Unlock fee reminders" />}
              <Card className={clsx(!canReminders && 'pointer-events-none select-none opacity-60')}>
                <CardHeader title="Automatic fee reminders" subtitle="Sent to parents on every enabled channel" icon={<IndianRupee className="h-5 w-5" />} />
                <Row icon={<BellRing className="h-5 w-5 text-brand-600" />}>
                  <Toggle checked={canReminders && s.reminders.enabled} disabled={!canReminders} onChange={(v) => setRem({ enabled: v })}
                    label="Enable automatic reminders" description="Reminders run every morning for pending installments" />
                </Row>
                <div className={clsx('mt-4 grid gap-4 sm:grid-cols-3', !s.reminders.enabled && 'opacity-50')}>
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Before due date</p>
                    <div className="mt-3 flex items-center gap-2">
                      <input type="number" min={0} max={30} disabled={!canReminders || !s.reminders.enabled} className="input w-20" value={s.reminders.daysBefore} onChange={(e) => setRem({ daysBefore: numIn(e.target.value, 0, 30) })} />
                      <span className="text-sm text-slate-500">days before</span>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">On due date</p>
                    <div className="mt-4"><Toggle checked={s.reminders.onDueDate} disabled={!canReminders || !s.reminders.enabled} onChange={(v) => setRem({ onDueDate: v })} label="Send reminder" /></div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">After due date</p>
                    <div className="mt-3 flex items-center gap-2">
                      <input type="number" min={0} max={30} disabled={!canReminders || !s.reminders.enabled} className="input w-20" value={s.reminders.daysAfter} onChange={(e) => setRem({ daysAfter: numIn(e.target.value, 0, 30) })} />
                      <span className="text-sm text-slate-500">days after</span>
                    </div>
                  </div>
                </div>
                <div className="mt-5 rounded-2xl bg-brand-50/60 p-4 text-sm text-slate-600">
                  <p className="font-semibold text-brand-700">Timeline for a fee due on the 10th</p>
                  <p className="mt-1">
                    {s.reminders.enabled ? [
                      s.reminders.daysBefore > 0 && `${10 - Math.min(9, s.reminders.daysBefore)}th: friendly reminder`,
                      s.reminders.onDueDate && '10th: due today',
                      s.reminders.daysAfter > 0 && `${10 + s.reminders.daysAfter}th: overdue notice`,
                    ].filter(Boolean).join('  →  ') || 'No reminders will be sent.' : 'Reminders are turned off.'}
                  </p>
                </div>
                {canReminders && <SaveBar saving={saving} onSave={() => saveInstitute({ settings: { reminders: s.reminders } }, 'Fee reminder settings saved')} />}
              </Card>
            </div>
          )}

          {tab === 'account' && (
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader title="My profile" subtitle={session?.user.email} icon={<UserCircle2 className="h-5 w-5" />} />
                <div className="space-y-4">
                  <Input label="Full name" value={me.name} onChange={(e) => setMe({ ...me, name: e.target.value })} />
                  <Input label="Phone" value={me.phone} onChange={(e) => setMe({ ...me, phone: e.target.value })} />
                  <Input label="Email" value={session?.user.email ?? ''} disabled hint="Contact support to change your login email" />
                </div>
                <SaveBar saving={saving} onSave={saveMe} />
              </Card>
              <Card>
                <CardHeader title="Change password" subtitle="Use at least 6 characters" icon={<KeyRound className="h-5 w-5" />} />
                <div className="space-y-4">
                  <Input label="Current password" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
                  <Input label="New password" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
                  <Input label="Confirm new password" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
                </div>
                <div className="mt-6 flex justify-end border-t border-slate-100 pt-5">
                  <Button loading={saving} disabled={!pw.current || !pw.next} icon={<KeyRound className="h-4 w-4" />} onClick={savePw}>Update password</Button>
                </div>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
