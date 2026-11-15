/** Formatting helpers (same rules as the web app: dates are local, money in ₹). */

export const inr = (n?: number | null) => '₹' + Math.round(n ?? 0).toLocaleString('en-IN');

export function inrShort(n: number) {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(1)}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
  if (n >= 1e3) return `₹${(n / 1e3).toFixed(1)}K`;
  return inr(n);
}

/** 'YYYY-MM-DD' is a LOCAL date (new Date('YYYY-MM-DD') would be UTC midnight). */
export function toDate(d: string | Date) {
  if (d instanceof Date) return d;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(d);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Hand-rolled (Hermes on Android has limited Intl support for en-IN month names).
export function fmtDate(d?: string | Date | null, withYear = true) {
  if (!d) return '—';
  const x = toDate(d);
  if (Number.isNaN(x.getTime())) return '—';
  return `${x.getDate()} ${MONTHS[x.getMonth()]}${withYear ? ` ${x.getFullYear()}` : ''}`;
}
export const fmtDay = (d?: string | Date | null) => (d ? `${WEEKDAYS[toDate(d).getDay()]}, ${fmtDate(d, false)}` : '—');

export function fmtClock(d?: string | Date | null) {
  if (!d) return '—';
  const x = new Date(d);
  let h = x.getHours();
  const m = String(x.getMinutes()).padStart(2, '0');
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ap}`;
}

/** "17:00" → "5:00 PM" */
export function fmtTime(t?: string | null) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ap}`;
}

export const fmtDateTime = (d?: string | Date | null) => (d ? `${fmtDate(d, false)}, ${fmtClock(d)}` : '—');

export function ymd(d: Date = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function timeAgo(d: string | Date) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return fmtDate(d, false);
}

export function fmtMins(m?: number | null) {
  if (!m || m <= 0) return '0m';
  const h = Math.floor(m / 60);
  return h ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m % 60}m`;
}

export const initials = (n = '') => n.replace(/^(mr|mrs|ms|dr)\.?\s+/i, '').split(/\s+/).map((x) => x[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

export const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

export const telUrl = (p: string) => `tel:${p.replace(/\s/g, '')}`;
export const waUrl = (p: string, text = '') => `https://wa.me/${p.replace(/\D/g, '').replace(/^(\d{10})$/, '91$1')}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
