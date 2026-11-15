import type { Tone } from './ui';

export interface Lead {
  _id: string; name: string; studentName?: string; phone: string; email?: string; studentClass?: string; courseName?: string; message?: string;
  source: string; kind: 'enquiry' | 'demo'; demoAt?: string; demoBatchId?: { _id: string; name: string } | null;
  status: 'new' | 'contacted' | 'demo_scheduled' | 'demo_done' | 'converted' | 'lost'; followUpAt?: string | null; lostReason?: string;
  studentId?: string; notes: { text: string; by: string; at: string }[]; createdAt: string;
}

export const LEAD_STATUS: { value: Lead['status']; label: string; tone: Tone }[] = [
  { value: 'new', label: 'New', tone: 'blue' },
  { value: 'contacted', label: 'Contacted', tone: 'brand' },
  { value: 'demo_scheduled', label: 'Demo scheduled', tone: 'violet' },
  { value: 'demo_done', label: 'Demo done', tone: 'amber' },
  { value: 'converted', label: 'Admitted', tone: 'green' },
  { value: 'lost', label: 'Lost', tone: 'gray' },
];
export const leadStatus = (v: string) => LEAD_STATUS.find((x) => x.value === v) ?? LEAD_STATUS[0];

export const SOURCE_LABEL: Record<string, string> = {
  website: 'Website', demo_form: 'Demo form', walk_in: 'Walk-in', phone: 'Phone call', whatsapp: 'WhatsApp', referral: 'Referral', social: 'Social media', other: 'Other',
};
