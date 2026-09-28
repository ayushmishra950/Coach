import clsx from 'clsx';
import { AlertTriangle, Inbox, Loader2, Search, X } from 'lucide-react';
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { initials } from '../lib/format';

export { clsx };

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'premium';
// Full class names (not built dynamically) so Tailwind keeps them in the bundle.
const BTN: Record<BtnVariant, string> = {
  primary: 'btn-primary', secondary: 'btn-secondary', ghost: 'btn-ghost', danger: 'btn-danger', success: 'btn-success', premium: 'btn-premium',
};
export function Button({
  variant = 'primary', size, loading, icon, children, className, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm'; loading?: boolean; icon?: ReactNode }) {
  return (
    <button {...rest} className={clsx(BTN[variant], size === 'sm' && 'btn-sm', className)} disabled={loading || rest.disabled}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function Card({ children, className, pad = true }: { children: ReactNode; className?: string; pad?: boolean }) {
  return <div className={clsx('card', pad && 'card-pad', className)}>{children}</div>;
}

export function CardHeader({ title, subtitle, action, icon }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        {icon && <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-600">{icon}</div>}
        <div>
          <h3 className="font-bold text-slate-900">{title}</h3>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-[1.7rem]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const TONES = {
  brand: 'from-brand-500 to-violet-500',
  green: 'from-emerald-500 to-teal-500',
  amber: 'from-amber-500 to-orange-500',
  rose: 'from-rose-500 to-pink-500',
  sky: 'from-sky-500 to-cyan-500',
  violet: 'from-violet-500 to-fuchsia-500',
} as const;
export type Tone = keyof typeof TONES;

export function StatCard({ label, value, icon, tone = 'brand', hint, className }: { label: string; value: ReactNode; icon: ReactNode; tone?: Tone; hint?: ReactNode; className?: string }) {
  return (
    <div className={clsx('card card-pad relative overflow-hidden', className)}>
      <div className={clsx('absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br opacity-10', TONES[tone])} />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{value}</p>
        </div>
        <div className={clsx('grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br text-white shadow-sm', TONES[tone])}>{icon}</div>
      </div>
      {hint && <div className="mt-3 text-xs font-medium text-slate-500">{hint}</div>}
    </div>
  );
}

const BADGE = {
  gray: 'bg-slate-100 text-slate-600',
  green: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/15',
  red: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/15',
  amber: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20',
  blue: 'bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-600/15',
  brand: 'bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-600/15',
  violet: 'bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-600/15',
} as const;
export type BadgeTone = keyof typeof BADGE;
export function Badge({ tone = 'gray', children, className }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return <span className={clsx('badge', BADGE[tone], className)}>{children}</span>;
}

/** Status → badge colour helper for common statuses. */
export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, BadgeTone> = {
    paid: 'green', active: 'green', present: 'green', published: 'green', success: 'green', resolved: 'green', sent: 'green',
    pending: 'amber', partial: 'amber', trial: 'blue', graded: 'blue', scheduled: 'gray', late: 'amber', queued: 'blue', in_progress: 'blue', open: 'amber',
    overdue: 'red', absent: 'red', failed: 'red', cancelled: 'red', past_due: 'red', suspended: 'red', inactive: 'gray', skipped: 'gray',
  };
  return <Badge tone={map[status] ?? 'gray'} className="capitalize">{status.replace('_', ' ')}</Badge>;
}

export function Avatar({ name, color, size = 'md' }: { name: string; color?: string; size?: 'sm' | 'md' | 'lg' }) {
  const s = size === 'sm' ? 'h-8 w-8 text-xs' : size === 'lg' ? 'h-16 w-16 text-xl' : 'h-10 w-10 text-sm';
  const palette = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#0ea5e9', '#14b8a6', '#f43f5e'];
  const bg = color ?? palette[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % palette.length];
  return (
    <div className={clsx('grid shrink-0 place-items-center rounded-full font-bold text-white', s)} style={{ background: `linear-gradient(135deg, ${bg}, ${bg}cc)` }}>
      {initials(name)}
    </div>
  );
}

export function Progress({ value, className, tone }: { value: number; className?: string; tone?: 'auto' | 'brand' }) {
  const v = Math.max(0, Math.min(100, value || 0));
  const color = tone === 'brand' ? 'bg-gradient-to-r from-brand-500 to-violet-500' : v >= 85 ? 'bg-emerald-500' : v >= 70 ? 'bg-amber-500' : 'bg-rose-500';
  return (
    <div className={clsx('h-2 w-full overflow-hidden rounded-full bg-slate-100', className)}>
      <div className={clsx('h-full rounded-full transition-all duration-700', color)} style={{ width: `${v}%` }} />
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('h-5 w-5 animate-spin text-brand-600', className)} />;
}

export function PageLoader() {
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <div className="flex flex-col items-center gap-3 text-sm text-slate-500">
        <Spinner className="h-8 w-8" />
        Loading…
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-xl bg-slate-200/70', className)} />;
}

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-500">{icon ?? <Inbox className="h-7 w-7" />}</div>
      <h3 className="font-bold text-slate-900">{title}</h3>
      {text && <p className="mt-1 max-w-sm text-sm text-slate-500">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card card-pad flex flex-col items-center py-12 text-center">
      <AlertTriangle className="mb-3 h-8 w-8 text-rose-500" />
      <p className="font-semibold text-slate-800">{message}</p>
      {onRetry && <Button variant="secondary" className="mt-4" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

/** Open dialogs, top-most last — so Escape / Tab only affect the dialog on top. */
const modalStack: string[] = [];

export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md' }: {
  open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    modalStack.push(titleId);
    const focusables = () =>
      Array.from(panel.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])') ?? []);
    // Focus the first field (or the dialog itself) so keyboard users start inside it.
    requestAnimationFrame(() => {
      if (panel.current && !panel.current.contains(document.activeElement)) (focusables().find((el) => el.tagName !== 'BUTTON') ?? panel.current).focus();
    });
    const onKey = (e: KeyboardEvent) => {
      if (modalStack[modalStack.length - 1] !== titleId) return; // only the top-most dialog reacts
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
      } else if (e.key === 'Tab') {
        const list = focusables();
        if (!list.length) return;
        const first = list[0], last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      modalStack.splice(modalStack.lastIndexOf(titleId), 1);
      if (!modalStack.length) document.body.style.overflow = '';
      opener?.focus?.(); // give focus back to what opened the dialog
    };
  }, [open, titleId]);
  if (!open) return null;
  const w = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size];
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className={clsx('relative flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-white shadow-2xl outline-none animate-fade-up sm:rounded-3xl', w)}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
          <div>
            <h2 id={titleId} className="text-lg font-bold text-slate-900">{title}</h2>
            {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5 scrollbar-thin">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, text, confirmLabel = 'Confirm', danger, loading }: {
  open: boolean; onClose: () => void; onConfirm: () => void; title: string; text?: ReactNode; confirmLabel?: string; danger?: boolean; loading?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>{confirmLabel}</Button></>}>
      <p className="text-sm text-slate-600">{text}</p>
    </Modal>
  );
}

export function Field({ label, children, hint, className }: { label?: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <label className={clsx('block', className)}>
      {label && <span className="label">{label}</span>}
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

export function Input({ label, hint, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string }) {
  return (
    <Field label={label} hint={hint} className={className}>
      <input className="input" {...rest} />
    </Field>
  );
}

export function Select({ label, hint, className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label?: string; hint?: string }) {
  return (
    <Field label={label} hint={hint} className={className}>
      <select className="input pr-8" {...rest}>{children}</select>
    </Field>
  );
}

export function Textarea({ label, hint, className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; hint?: string }) {
  return (
    <Field label={label} hint={hint} className={className}>
      <textarea className="input min-h-[96px]" {...rest} />
    </Field>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…', className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={clsx('relative', className)}>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input className="input pl-10" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { value: T; label: ReactNode; count?: number }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={clsx('inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 scrollbar-thin', className)}>
      {tabs.map((t) => (
        <button key={t.value} onClick={() => onChange(t.value)}
          className={clsx('flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-semibold transition',
            value === t.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800')}>
          {t.label}
          {t.count != null && <span className={clsx('rounded-full px-1.5 text-xs', value === t.value ? 'bg-brand-100 text-brand-700' : 'bg-slate-200 text-slate-600')}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; description?: ReactNode; disabled?: boolean }) {
  return (
    <label className={clsx('flex items-start justify-between gap-4', disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer')}>
      {(label || description) && (
        <span>
          {label && <span className="block text-sm font-semibold text-slate-800">{label}</span>}
          {description && <span className="block text-xs text-slate-500">{description}</span>}
        </span>
      )}
      <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
        className={clsx('relative mt-0.5 inline-flex h-6 w-11 shrink-0 rounded-full transition', checked ? 'bg-brand-600' : 'bg-slate-300')}>
        <span className={clsx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition', checked ? 'left-[22px]' : 'left-0.5')} />
      </button>
    </label>
  );
}

/** Small chart tooltip styled to match the app. */
export function ChartTooltip({ active, payload, label, format }: { active?: boolean; payload?: { value: number; name?: string; color?: string }[]; label?: string; format?: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-slate-700">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-2 text-slate-600">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name && <span>{p.name}:</span>}
          <b className="text-slate-900">{format ? format(p.value) : p.value}</b>
        </p>
      ))}
    </div>
  );
}
