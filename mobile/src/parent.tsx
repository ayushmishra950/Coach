import { ScrollView } from 'react-native';
import { useAuth } from './auth';
import type { Invoice } from './CollectSheet';
import { useFetch, usePoll } from './useFetch';
import { Chips } from './ui';

export interface Result {
  _id: string; subject: string; topic?: string; date: string; maxMarks: number; marks?: number | null; absent?: boolean; remark?: string;
  pct: number | null; passPercent: number; rank: number | null; outOf: number; classAvgPct: number | null;
}
export interface PaymentRow { _id: string; amount: number; method: string; receiptNo: string; paidAt: string; status?: string; invoiceId?: string }
export interface Child {
  student: { _id: string; name: string; studentCode?: string; course?: string };
  batches: { _id: string; name: string; subject?: string; days: string[]; startTime: string; endTime: string; teacher: string;
    syllabus: { total: number; done: number; recent: string[]; next: string | null } | null }[];
  attendance: { pct: number; total: number; present: number; recent: { date: string; batch?: string; status?: 'present' | 'absent' | 'late' }[] };
  results: Result[];
  latestResult: Result | null;
  fees: { total: number; paid: number; pending: number; invoices: Invoice[]; payments: PaymentRow[] };
  nextClass: { at: string; batch: string; subject?: string } | null;
}
export interface Overview {
  institute: { name: string; phone?: string; brandColor?: string; onlinePay: boolean; gateway: 'razorpay' | 'demo' | null };
  children: Child[];
  announcements: { _id: string; title: string; body: string; category?: string; pinned?: boolean; createdAt: string; eventDate?: string }[];
  holidays: { date: string; name: string }[];
  events: { _id: string; title: string; body?: string; category?: string; eventDate: string; eventEndDate?: string }[];
}

/** The parent overview + the child being viewed (shared by every parent tab). */
export function useParent() {
  const { childId, setChildId } = useAuth();
  const f = useFetch<Overview>('/parent/overview');
  // Attendance marked, results published, fee paid, notice posted → the parent screens update live.
  usePoll(() => f.reload());
  const children = f.data?.children ?? [];
  const child = children.find((c) => c.student._id === childId) ?? children[0] ?? null;
  return { ...f, child, children, setChildId };
}

export function ChildPicker({ children, value, onChange }: { children: Child[]; value?: string; onChange: (id: string) => void }) {
  if (children.length < 2) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
      <Chips value={value ?? ''} onChange={onChange} options={children.map((c) => ({ value: c.student._id, label: c.student.name.split(' ')[0] }))} />
    </ScrollView>
  );
}
