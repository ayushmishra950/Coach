export const inr = (n: number | null | undefined) => '₹' + Math.round(n ?? 0).toLocaleString('en-IN');

/** ₹2.1L / ₹14.5K style for compact stat displays. */
export function inrShort(n: number) {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(1)}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
  if (n >= 1e3) return `₹${(n / 1e3).toFixed(1)}K`;
  return inr(n);
}

/** Parse a date-only 'YYYY-MM-DD' string as a LOCAL date (new Date('YYYY-MM-DD') is UTC midnight). */
export function parseYmd(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return new Date(s);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Date from a Date, ISO timestamp, or date-only string (date-only parsed as local). */
export const toDate = (d: string | Date) => (typeof d === 'string' ? parseYmd(d) : new Date(d));

export const fmtDate = (d?: string | Date | null, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  d ? toDate(d).toLocaleDateString('en-IN', opts) : '—';

export const fmtDateShort = (d?: string | Date | null) => fmtDate(d, { day: 'numeric', month: 'short' });

export const fmtDateTime = (d?: string | Date | null) =>
  d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—';

/** "17:00" → "5:00 PM" */
export function fmtTime(t?: string | null) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m);
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }).toUpperCase();
}

export function timeAgo(d: string | Date) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return fmtDateShort(d);
}

export const initials = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0]!.toUpperCase())
    .join('');

/** Local YYYY-MM-DD. */
export function ymd(d: Date = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening';
}

/** Tailwind text colour for a percentage (attendance / score). */
export const pctTone = (p?: number | null) =>
  p == null ? 'text-slate-400' : p >= 85 ? 'text-emerald-600' : p >= 70 ? 'text-amber-600' : 'text-rose-600';

export function downloadCSV(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) {
    import('react-hot-toast').then(({ default: toast }) => toast('Nothing to export'));
    return;
  }
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    let s = v == null ? '' : String(v);
    // A cell starting with = + - @ would run as a formula in Excel / Sheets — prefix a quote.
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) && !/^\+?[\d\s-]{6,}$/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
