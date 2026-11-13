import { Notification } from '../models/index.js';
import { startOfMonth } from '../utils/dates.js';
import { createLimiter, maskContact } from '../utils/security.js';
import { config } from '../config.js';
import { getEffectivePlan } from './plan.js';
import { emitNotification } from './realtime.js';
// Logs never contain the message text and only a masked phone / email (privacy — DPDP).
const devLog = (channel, to, title) => {
    if (!config.isProd)
        console.log(`[${channel} → ${maskContact(to)}] ${title}`);
};
const adapters = {
    inApp: { send: async () => ({ status: 'sent' }) },
    whatsapp: {
        send: async ({ to, title }) => {
            if (!to)
                return { status: 'skipped', info: 'No phone number' };
            devLog('whatsapp', to, title);
            return { status: 'queued', info: 'Not connected yet' };
        },
    },
    email: {
        send: async ({ to, title }) => {
            if (!to)
                return { status: 'skipped', info: 'No email address' };
            devLog('email', to, title);
            return { status: 'queued', info: 'Not connected yet — add an email provider in services/notify.ts' };
        },
    },
    sms: {
        send: async ({ to, title }) => {
            if (!to)
                return { status: 'skipped', info: 'No phone number' };
            devLog('sms', to, title);
            return { status: 'queued', info: 'Not connected yet — add an SMS gateway in services/notify.ts' };
        },
    },
};
// Guard against runaway costs: at most this many paid messages (WhatsApp / SMS / email) per
// institute per hour, whatever triggers them.
const externalLimit = createLimiter({ windowMs: 60 * 60_000, max: 3000 });
const waUsage = new Map();
function loadUsage(institute, month, carry = 0) {
    return Notification.countDocuments({
        instituteId: institute._id,
        createdAt: { $gte: new Date(month) },
        deliveries: { $elemMatch: { channel: 'whatsapp', status: { $in: ['sent', 'queued'] } } },
    }).then((count) => ({ month, count: Math.max(count, carry), loadedAt: Date.now() }));
}
async function whatsappAllowance(institute, limit) {
    if (limit < 0)
        return true; // unlimited
    if (limit === 0)
        return false;
    const key = String(institute._id);
    const month = startOfMonth().getTime();
    let pending = waUsage.get(key);
    let u = pending ? await pending : null;
    if (!u || u.month !== month || Date.now() - u.loadedAt > 5 * 60_000) {
        // Keep the higher of the stored count and what we already counted in memory (sends in flight).
        pending = loadUsage(institute, month, u && u.month === month ? u.count : 0);
        waUsage.set(key, pending);
        pending.catch(() => waUsage.delete(key));
        u = await waUsage.get(key);
    }
    if (u.count >= limit)
        return false;
    u.count++; // synchronous after the await — no lost increments between parallel workers
    return true;
}
export async function notify(input) {
    const { institute, contact } = input;
    const ch = institute.settings?.channels;
    const deliveries = [];
    const channels = ['inApp'];
    if (input.audience === 'parent') {
        if (ch?.whatsapp) {
            const plan = await getEffectivePlan(institute);
            if (plan?.features.includes('whatsapp')) {
                if (await whatsappAllowance(institute, plan.whatsappLimit ?? 0))
                    channels.push('whatsapp');
                else
                    deliveries.push({ channel: 'whatsapp', status: 'skipped', info: 'Monthly WhatsApp limit reached for your plan' });
            }
        }
        if (ch?.email)
            channels.push('email');
        if (ch?.sms)
            channels.push('sms');
    }
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
        }
        catch (e) {
            deliveries.push({ channel, to, status: 'failed', info: e.message });
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
        deliveries,
    });
    emitNotification(doc);
    return doc;
}
/** Runs notify() for many recipients with limited parallelism (announcements, results). */
export async function notifyMany(inputs, concurrency = 10) {
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
