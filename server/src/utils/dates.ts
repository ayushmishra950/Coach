export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
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
