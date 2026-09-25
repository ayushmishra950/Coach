import { Link } from 'react-router-dom';
import { clsx } from './ui';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={clsx('h-9 w-9', className)} aria-hidden>
      <defs>
        <linearGradient id="cf-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="1" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#cf-g)" />
      <path d="M40 20.5a14 14 0 1 0 0 23" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" />
      <circle cx="44" cy="32" r="4" fill="#fde68a" />
    </svg>
  );
}

export function Logo({ to = '/', light, className }: { to?: string; light?: boolean; className?: string }) {
  return (
    <Link to={to} className={clsx('flex items-center gap-2.5', className)}>
      <LogoMark />
      <span className={clsx('text-xl font-extrabold tracking-tight', light ? 'text-white' : 'text-slate-900')}>
        Coach<span className={light ? 'text-violet-300' : 'text-brand-600'}>Flow</span>
      </span>
    </Link>
  );
}
