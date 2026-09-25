import { Types } from 'mongoose';
import { Notification, type Channel, type InstituteDoc } from '../models/index.js';
import { hasFeature } from './plan.js';

/**
 * Channel adapters. Each one is a pluggable provider — swap the stub bodies for a real
 * WhatsApp Business Platform provider, an email service (SES/SendGrid/Resend) or an SMS
 * gateway without touching any of the business logic that calls notify().
 */
interface Outgoing {
  to?: string;
  title: string;
  message: string;
}
interface ChannelAdapter {
  send(msg: Outgoing): Promise<{ status: 'sent' | 'queued' | 'failed' | 'skipped'; info?: string }>;
}

const adapters: Record<Channel, ChannelAdapter> = {
  inApp: { send: async () => ({ status: 'sent' }) },
  whatsapp: {
    send: async ({ to, message }) => {
      if (!to) return { status: 'skipped', info: 'No phone number' };
      console.log(`[whatsapp → ${to}] ${message}`);
      return { status: 'queued', info: 'Demo mode — connect a WhatsApp Business provider' };
    },
  },
  email: {
    send: async ({ to, title }) => {
      if (!to) return { status: 'skipped', info: 'No email address' };
      console.log(`[email → ${to}] ${title}`);
      return { status: 'queued', info: 'Demo mode — connect an email provider' };
    },
  },
  sms: {
    send: async ({ to, message }) => {
      if (!to) return { status: 'skipped', info: 'No phone number' };
      console.log(`[sms → ${to}] ${message}`);
      return { status: 'queued', info: 'Demo mode — connect an SMS gateway' };
    },
  },
};

export interface NotifyInput {
  institute: InstituteDoc;
  type: 'attendance' | 'fee' | 'test' | 'announcement' | 'system' | 'payment';
  title: string;
  message: string;
  audience: 'owner' | 'staff' | 'parent';
  studentId?: Types.ObjectId;
  userId?: Types.ObjectId;
  contact?: { phone?: string; email?: string };
}

export async function notify(input: NotifyInput) {
  const { institute, contact } = input;
  const ch = institute.settings?.channels;
  const deliveries: { channel: Channel; to?: string; status: string; info?: string }[] = [];

  const plan: Channel[] = ['inApp'];
  if (input.audience === 'parent') {
    if (ch?.whatsapp && (await hasFeature(institute, 'whatsapp'))) plan.push('whatsapp');
    if (ch?.email) plan.push('email');
    if (ch?.sms) plan.push('sms');
  }

  for (const channel of plan) {
    const to = channel === 'email' ? contact?.email : channel === 'inApp' ? undefined : contact?.phone;
    try {
      const r = await adapters[channel].send({ to, title: input.title, message: input.message });
      deliveries.push({ channel, to, ...r });
    } catch (e) {
      deliveries.push({ channel, to, status: 'failed', info: (e as Error).message });
    }
  }

  return Notification.create({
    instituteId: institute._id,
    type: input.type,
    title: input.title,
    message: input.message,
    audience: input.audience,
    studentId: input.studentId,
    userId: input.userId,
    deliveries,
  });
}
