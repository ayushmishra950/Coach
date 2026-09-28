import { config } from '../config.js';
import { HttpError } from './http.js';

export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/**
 * Mongo `$group` key for year + month in the app's time zone. Without the timezone Mongo
 * groups in UTC, so a payment at 1 AM IST on the 1st lands in the previous month.
 */
export const monthKey = (field: string) => ({
  y: { $year: { date: field, timezone: config.timezone } },
  m: { $month: { date: field, timezone: config.timezone } },
});
export type Day = (typeof DAYS)[number];

/** Local date as YYYY-MM-DD. */
export function ymd(d: Date = new Date()) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function startOfDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Next scheduled class for a set of batches (days like 'Mon', time 'HH:mm'). */
export function nextClass<T extends { days: string[]; startTime: string }>(batches: T[], from = new Date()) {
  let best: { batch: T; at: Date } | null = null;
  for (const b of batches) {
    const [h, m] = (b.startTime || '00:00').split(':').map(Number);
    for (let i = 0; i < 8; i++) {
      const d = addDays(startOfDay(from), i);
      if (!b.days.includes(DAYS[d.getDay()])) continue;
      d.setHours(h, m, 0, 0);
      if (d <= from) continue;
      if (!best || d < best.at) best = { batch: b, at: d };
      break;
    }
  }
  return best;
}

/**
 * Adds months without spilling into the next month: Jan 31 + 1 month = Feb 28/29
 * (plain setMonth would give Mar 3).
 */
export function addMonthsClamped(d: Date, n: number) {
  const x = new Date(d);
  const day = x.getDate();
  x.setDate(1);
  x.setMonth(x.getMonth() + n);
  const last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
  x.setDate(Math.min(day, last));
  return x;
}

/** Parses a user-supplied date; throws a clear 400 instead of storing "Invalid Date". */
export function parseDate(v: unknown, label = 'Date'): Date {
  // A plain calendar date (YYYY-MM-DD) means that day in the app's time zone, not UTC.
  const d = v instanceof Date ? v : typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? localDayStart(v) : new Date(String(v));
  if (v === undefined || v === null || v === '' || Number.isNaN(d.getTime())) {
    throw new HttpError(400, `${label} is not a valid date`);
  }
  return d;
}

/** Start of a YYYY-MM-DD day in the app time zone (for "from" filters). */
export function localDayStart(v: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(v);
}
