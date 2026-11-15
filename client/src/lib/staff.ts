/** Shared types + formatting for teacher check-in and salaries. */

export interface StaffSettings { startTime: string; endTime: string; graceMins: number; notifyLate: boolean; captureLocation: boolean }

export interface Geo { lat: number; lng: number; accuracy?: number }

export interface StaffRow {
  _id: string;
  teacherId: string | { _id: string; name: string };
  date: string;
  checkIn?: string | null;
  checkOut?: string | null;
  minutes?: number;
  late?: boolean;
  lateBy?: number;
  earlyLeave?: boolean;
  status: 'present' | 'leave' | 'absent' | 'half_day';
  checkInNote?: string;
  checkOutNote?: string;
  checkInGeo?: Geo | null;
  checkOutGeo?: Geo | null;
  editedAt?: string;
  ownerNote?: string;
}

export interface StaffTotals {
  present: number; halfDays: number; leave: number; absent: number; late: number; earlyLeave: number;
  missedCheckout: number; minutes: number; avgMinutes: number;
}

export interface SalaryRow {
  _id: string;
  teacherId: { _id: string; name: string; email?: string; phone?: string; subjects?: string[]; active?: boolean; salary?: number } | string;
  month: string;
  label?: string;
  baseAmount: number;
  bonus?: number;
  deduction?: number;
  /** Leave / absent days this month and the automatic pay cut for them. */
  leaveDays?: number;
  leaveDeduction?: number;
  amount: number;
  paidAmount: number;
  dueDate: string;
  status: 'pending' | 'partial' | 'paid';
  adjusted?: boolean;
  note?: string;
  payments: { amount: number; method: 'cash' | 'upi' | 'bank' | 'cheque'; reference?: string; note?: string; paidAt: string }[];
  paidAt?: string;
  reminderCount?: number;
  lastReminderAt?: string;
}

export const SALARY_METHODS = [
  { value: 'bank', label: 'Bank transfer' },
  { value: 'upi', label: 'UPI' },
  { value: 'cash', label: 'Cash' },
  { value: 'cheque', label: 'Cheque' },
] as const;

/** 545 → "9h 05m" */
export function fmtMins(m?: number | null) {
  if (!m || m <= 0) return '0m';
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return h ? `${h}h ${String(mm).padStart(2, '0')}m` : `${mm}m`;
}

/** ISO → "9:05 AM" */
export const clock = (d?: string | Date | null) =>
  d ? new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }).toUpperCase() : '—';

/** Local "HH:mm" for a time input. */
export const hhmm = (d?: string | Date | null) => {
  if (!d) return '';
  const x = new Date(d);
  return `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`;
};

export const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export function shiftMonth(month: string, n: number) {
  const [y, m] = month.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + n, 1));
}

export function monthName(month: string) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

export const teacherName = (t: SalaryRow['teacherId'] | StaffRow['teacherId']) => (typeof t === 'string' ? '' : t?.name ?? '');
export const teacherIdOf = (t: SalaryRow['teacherId'] | StaffRow['teacherId']) => (typeof t === 'string' ? t : t?._id ?? '');

/** Browser location, or null if not allowed / unavailable within a few seconds. */
export function getGeo(timeout = 8000): Promise<Geo | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout, maximumAge: 60_000 },
    );
  });
}

export const mapsLink = (g?: Geo | null) => (g ? `https://www.google.com/maps?q=${g.lat},${g.lng}` : null);

/** Status of a day row for display. */
export function dayState(row: StaffRow | null | undefined, isPast: boolean) {
  if (!row) return { key: 'not_in', label: isPast ? 'No record' : 'Not checked in', tone: 'gray' as const };
  if (row.status === 'leave') return { key: 'leave', label: 'On leave', tone: 'blue' as const };
  if (row.status === 'absent') return { key: 'absent', label: 'Absent', tone: 'red' as const };
  if (row.checkIn && !row.checkOut) return isPast
    ? { key: 'missed', label: 'Missed check-out', tone: 'amber' as const }
    : { key: 'working', label: 'Working', tone: 'green' as const };
  if (row.status === 'half_day') return { key: 'half', label: 'Half day', tone: 'violet' as const };
  return { key: 'done', label: 'Checked out', tone: 'brand' as const };
}
