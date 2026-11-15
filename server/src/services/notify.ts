import { Types } from 'mongoose';
import { Notification, type Channel, type InstituteDoc } from '../models/index.js';
import { startOfMonth } from '../utils/dates.js';
import { createLimiter, maskContact } from '../utils/security.js';
import { config } from '../config.js';
import { getEffectivePlan } from './plan.js';
import { emitNotification } from './realtime.js';

/**
 * Channel adapters. Each one is a pluggable provider — swap the stub bodies for a real
 * WhatsApp Business Platform provider, an email service (SES/SendGrid/Resend) or an SMS
 * gateway without touching any of the business logic that calls notify().
 *
 * In-app delivery is real: the notification is saved in MongoDB and pushed live to the
 * parent / owner / teacher over Socket.IO, so it works with no paid provider at all.
 */
interface Outgoing {
  to?: string;
  title: string;
  message: string;
}
interface ChannelAdapter {
  send(msg: Outgoing): Promise<{ status: 'sent' | 'queued' | 'failed' | 'skipped'; info?: string }>;
}

// Logs never contain the message text and only a masked phone / email (privacy — DPDP).
const devLog = (channel: string, to: string, title: string) => {
  if (!config.isProd) console.log(`[${channel} → ${maskContact(to)}] ${title}`);
};

/** "98765 43210" → "919876543210" (E.164 without +). */
export function e164(phone: string) {
  let d = phone.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  if (d.length === 10) d = config.defaultCountryCode + d;
  return d;
}

type Result = { status: 'sent' | 'queued' | 'failed' | 'skipped'; info?: string };

/** POST with a 10 s timeout; any non-2xx becomes a "failed" delivery with the provider's message. */
async function post(url: string, init: RequestInit): Promise<Result> {
  try {
    const r = await fetch(url, { ...init, method: 'POST', signal: AbortSignal.timeout(10_000) });
    const text = await r.text();
    if (r.ok) return { status: 'sent' };
    let msg = text.slice(0, 160);
    try {
      const j = JSON.parse(text);
      msg = j?.error?.message || j?.message || j?.error || msg;
    } catch {
      /* not JSON */
    }
    return { status: 'failed', info: `${r.status}: ${String(msg).slice(0, 160)}` };
  } catch (e) {
    return { status: 'failed', info: (e as Error).name === 'TimeoutError' ? 'Provider timed out' : (e as Error).message.slice(0, 160) };
  }
}

const adapters: Record<Channel, ChannelAdapter> = {
  inApp: { send: async () => ({ status: 'sent' }) },
  /** WhatsApp Business Cloud API (Meta). Set WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID (+ WHATSAPP_TEMPLATE). */
  whatsapp: {
    send: async ({ to, title, message }) => {
      if (!to) return { status: 'skipped', info: 'No phone number' };
      const w = config.whatsapp;
      if (!w.token || !w.phoneNumberId) {
        devLog('whatsapp', to, title);
        return { status: 'queued', info: 'WhatsApp not connected — set WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID' };
      }
      const body = w.template
        ? {
            messaging_product: 'whatsapp', to: e164(to), type: 'template',
            template: { name: w.template, language: { code: w.templateLang }, components: [{ type: 'body', parameters: [{ type: 'text', text: title.slice(0, 200) }, { type: 'text', text: message.replace(/\s+/g, ' ').slice(0, 900) }] }] },
          }
        : { messaging_product: 'whatsapp', to: e164(to), type: 'text', text: { body: `*${title}*\n${message}`.slice(0, 4000) } };
      return post(`https://graph.facebook.com/v20.0/${w.phoneNumberId}/messages`, {
        headers: { Authorization: `Bearer ${w.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    },
  },
  /** Email via Resend (RESEND_API_KEY + EMAIL_FROM). */
  email: {
    send: async ({ to, title, message }) => {
      if (!to) return { status: 'skipped', info: 'No email address' };
      const e = config.email;
      if (!e.resendKey || !e.from) {
        devLog('email', to, title);
        return { status: 'queued', info: 'Email not connected — set RESEND_API_KEY and EMAIL_FROM' };
      }
      const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
      return post('https://api.resend.com/emails', {
        headers: { Authorization: `Bearer ${e.resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: e.from, to: [to], subject: title, text: message, html: `<h3>${esc(title)}</h3><p>${esc(message)}</p>` }),
      });
    },
  },
  /** SMS via Fast2SMS (India) or Twilio — SMS_PROVIDER=fast2sms | twilio. */
  sms: {
    send: async ({ to, title, message }) => {
      if (!to) return { status: 'skipped', info: 'No phone number' };
      const s = config.sms;
      const text = `${title}: ${message}`.slice(0, 600);
      if (s.provider === 'fast2sms' && s.fast2smsKey) {
        return post('https://www.fast2sms.com/dev/bulkV2', {
          headers: { authorization: s.fast2smsKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ route: 'q', message: text, numbers: e164(to).slice(-10) }),
        });
      }
      if (s.provider === 'twilio' && s.twilioSid && s.twilioToken && s.twilioFrom) {
        return post(`https://api.twilio.com/2010-04-01/Accounts/${s.twilioSid}/Messages.json`, {
          headers: { Authorization: `Basic ${Buffer.from(`${s.twilioSid}:${s.twilioToken}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ To: `+${e164(to)}`, From: s.twilioFrom, Body: text }).toString(),
        });
      }
      devLog('sms', to, title);
      return { status: 'queued', info: 'SMS not connected — set SMS_PROVIDER and its API keys' };
    },
  },
};

/** Which external channels have a provider configured (shown in Settings). */
export const providerStatus = () => ({
  whatsapp: !!(config.whatsapp.token && config.whatsapp.phoneNumberId),
  sms: (config.sms.provider === 'fast2sms' && !!config.sms.fast2smsKey) || (config.sms.provider === 'twilio' && !!(config.sms.twilioSid && config.sms.twilioToken && config.sms.twilioFrom)),
  email: !!(config.email.resendKey && config.email.from),
});

// Guard against runaway costs: at most this many paid messages (WhatsApp / SMS / email) per
// institute per hour, whatever triggers them.
const externalLimit = createLimiter({ windowMs: 60 * 60_000, max: 3000 });

/*
 * Monthly WhatsApp usage per institute, so the plan's whatsappLimit is actually enforced.
 * The count is loaded once (one shared promise, so parallel sends don't each re-count and
 * overwrite each other) and then incremented in memory; it is re-synced every 5 minutes.
 */
type Usage = { month: number; count: number; loadedAt: number };
const waUsage = new Map<string, Promise<Usage>>();

function loadUsage(institute: InstituteDoc, month: number, carry = 0): Promise<Usage> {
  return Notification.countDocuments({
    instituteId: institute._id,
    createdAt: { $gte: new Date(month) },
    deliveries: { $elemMatch: { channel: 'whatsapp', status: { $in: ['sent', 'queued'] } } },
  }).then((count) => ({ month, count: Math.max(count, carry), loadedAt: Date.now() }));
}

async function whatsappAllowance(institute: InstituteDoc, limit: number) {
  if (limit < 0) return true; // unlimited
  if (limit === 0) return false;
  const key = String(institute._id);
  const month = startOfMonth().getTime();
  let pending = waUsage.get(key);
  let u = pending ? await pending : null;
  if (!u || u.month !== month || Date.now() - u.loadedAt > 5 * 60_000) {
    // Keep the higher of the stored count and what we already counted in memory (sends in flight).
    pending = loadUsage(institute, month, u && u.month === month ? u.count : 0);
    waUsage.set(key, pending);
    pending.catch(() => waUsage.delete(key));
    u = await waUsage.get(key)!;
  }
  if (u.count >= limit) return false;
  u.count++; // synchronous after the await — no lost increments between parallel workers
  return true;
}

export interface NotifyInput {
  institute: InstituteDoc;
  type: 'attendance' | 'fee' | 'test' | 'announcement' | 'system' | 'payment' | 'salary' | 'staff' | 'lead' | 'leave' | 'material' | 'report';
  title: string;
  message: string;
  /** parent = the student's parents, owner = institute owners, staff = teachers (a specific one via userId) */
  audience: 'owner' | 'staff' | 'parent';
  studentId?: Types.ObjectId;
  href?: string;
  userId?: Types.ObjectId;
  contact?: { phone?: string; email?: string };
  /** In-app only (e.g. the same family was already messaged for a sibling). */
  skipExternal?: boolean;
  /** Platform messages to the owner (plan approved, trial changed…) also go to contact.email. */
  emailOwner?: boolean;
}

export async function notify(input: NotifyInput) {
  const { institute, contact } = input;
  const ch = institute.settings?.channels;
  const deliveries: { channel: Channel; to?: string; status: string; info?: string }[] = [];

  const channels: Channel[] = ['inApp'];
  if (input.audience === 'parent') {
    if (ch?.whatsapp) {
      const plan = await getEffectivePlan(institute);
      if (plan?.features.includes('whatsapp')) {
        if (await whatsappAllowance(institute, plan.whatsappLimit ?? 0)) channels.push('whatsapp');
        else deliveries.push({ channel: 'whatsapp', status: 'skipped', info: 'Monthly WhatsApp limit reached for your plan' });
      }
    }
    if (ch?.email) channels.push('email');
    if (ch?.sms) channels.push('sms');
  }
  if (input.audience === 'owner' && input.emailOwner && contact?.email) channels.push('email');

  for (const channel of channels) {
    const to = channel === 'email' ? contact?.email : channel === 'inApp' ? undefined : contact?.phone;
    if (channel !== 'inApp' && input.skipExternal) {
      deliveries.push({ channel, to, status: 'skipped', info: 'Already sent to this family for a sibling' });
      continue;
    }
    if (channel !== 'inApp' && to && externalLimit(`${String(institute._id)}:${channel}`)) {
      deliveries.push({ channel, to, status: 'skipped', info: 'Hourly sending limit reached' });
      continue;
    }
    try {
      const r = await adapters[channel].send({ to, title: input.title, message: input.message });
      deliveries.push({ channel, to, ...r });
    } catch (e) {
      deliveries.push({ channel, to, status: 'failed', info: (e as Error).message });
    }
  }

  const doc = await Notification.create({
    instituteId: institute._id,
    type: input.type,
    title: input.title,
    message: input.message,
    audience: input.audience,
    studentId: input.studentId,
    userId: input.userId,
    // Where tapping the notification goes (it used to be dropped here, so links fell back to a default page).
    href: input.href,
    deliveries,
  });
  emitNotification(doc);
  return doc;
}

/** Runs notify() for many recipients with limited parallelism (announcements, results). */
export async function notifyMany(inputs: NotifyInput[], concurrency = 10) {
  let i = 0;
  const worker = async () => {
    while (i < inputs.length) {
      const item = inputs[i++];
      await notify(item).catch((e) => console.error('[notify]', e));
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, inputs.length) }, worker));
  return inputs.length;
}
