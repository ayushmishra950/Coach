export type Role = 'superadmin' | 'owner' | 'teacher' | 'parent';
export type FeatureKey =
  | 'feeReminders' | 'parentPortal' | 'whatsapp' | 'advancedReports' | 'onlinePayments'
  | 'aiInsights' | 'customBranding' | 'prioritySupport' | 'advancedTests';
export type PlanKey = 'starter' | 'growth' | 'premium';

export interface SessionUser {
  id: string; name: string; email: string; role: Role; phone?: string; subjects?: string[]; studentIds: string[];
}
export interface SessionInstitute {
  id: string; name: string; city?: string; phone?: string; email?: string; type?: string; brandColor?: string; logoText?: string;
  plan: PlanKey; status: 'trial' | 'active' | 'past_due' | 'cancelled' | 'suspended'; billingCycle: 'monthly' | 'yearly';
  trialEndsAt?: string; currentPeriodEnd?: string; trialDaysLeft: number | null;
}
export interface SessionPlan { key: PlanKey; name: string; features: FeatureKey[]; studentLimit: number; teacherLimit: number }
export interface Session { user: SessionUser; institute: SessionInstitute | null; plan: SessionPlan | null }

export interface Plan {
  _id: string; key: PlanKey; name: string; tagline?: string; priceMonthly: number; priceYearly: number;
  studentLimit: number; teacherLimit: number; features: FeatureKey[]; whatsappLimit: number; popular: boolean; order: number;
}

export interface BatchRef { _id: string; name: string; color?: string }
export interface Batch {
  _id: string; name: string; course?: string; subject?: string; days: string[]; startTime: string; endTime: string;
  room?: string; capacity?: number; color: string; active: boolean;
  teacher?: { _id: string; name: string } | null; teacherId?: { _id: string; name: string } | string | null;
  studentCount?: number; attendancePct?: number | null; avgScore?: number | null; nextClassAt?: string | null;
}

export interface FeeRollup { total: number; paid: number; pending: number; overdue: number; nextDue: string | null }
export interface Student {
  _id: string; studentCode: string; name: string; phone?: string; dob?: string; gender?: 'male' | 'female' | 'other';
  address?: string; parentName?: string; parentPhone?: string; parentEmail?: string; course?: string;
  batchIds: string[] | BatchRef[]; batches?: BatchRef[]; joiningDate?: string; status: 'active' | 'inactive';
  attendancePct?: number | null; avgScore?: number | null; fees?: FeeRollup | null; hasPortal?: boolean;
  notes?: { text: string; by: string; at: string }[];
}

export interface Teacher {
  _id: string; name: string; email: string; phone?: string; subjects?: string[]; qualification?: string; salary?: number;
  joiningDate?: string; active: boolean; batches: BatchRef[]; studentCount: number;
}

export interface Invoice {
  _id: string; studentId: string | { _id: string; name: string; studentCode: string; parentPhone?: string };
  title: string; installmentNo?: number; amount: number; paidAmount: number; dueDate: string;
  status: 'pending' | 'partial' | 'paid'; reminderCount?: number; lastReminderAt?: string;
}
export interface Payment {
  _id: string; studentId: string | { _id: string; name: string; studentCode: string }; invoiceId?: string | { _id: string; title: string };
  amount: number; method: 'cash' | 'upi' | 'bank' | 'card' | 'online'; receiptNo: string; reference?: string; note?: string; paidAt: string;
}

export interface TestItem {
  _id: string; batchId: string | BatchRef; batch?: BatchRef; subject: string; topic?: string; maxMarks: number; date: string;
  status: 'scheduled' | 'graded' | 'published'; students?: number;
  avg: number | null; highest: number | null; lowest: number | null; passRate: number | null; entered: number;
}

export interface Notification {
  _id: string; type: 'attendance' | 'fee' | 'test' | 'announcement' | 'system' | 'payment'; title: string; message: string;
  audience: 'owner' | 'staff' | 'parent'; studentId?: { _id: string; name: string } | null; read?: boolean; createdAt: string;
  deliveries: { channel: 'inApp' | 'whatsapp' | 'email' | 'sms'; to?: string; status: 'sent' | 'queued' | 'failed' | 'skipped'; info?: string }[];
}

export interface Announcement {
  _id: string; title: string; body: string; batchIds: BatchRef[]; pinned: boolean; createdByName?: string; createdBy?: string; createdAt: string;
}
