import { Router } from 'express';
import { allow, auth, tid } from '../middleware/auth.js';
import { Announcement, Attendance, Batch, Invoice, Payment, Salary, StaffAttendance, Student, Test, User } from '../models/index.js';
import { audit } from '../services/audit.js';
import { providerStatus } from '../services/notify.js';
import { checkKeys, decryptSecret, encryptSecret, loadInstituteCreds, platformCreds } from '../services/razorpay.js';
import { Institute } from '../models/index.js';
import { hasFeature } from '../services/plan.js';
import { HttpError, ah } from '../utils/http.js';
import { ymd } from '../utils/dates.js';
import { isEmail, HEX_COLOR_RX, PHONE_RX, cleanName, optStr, rateLimit } from '../utils/security.js';

const r = Router();
r.use(auth, allow('owner'));

const GSTIN_RX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;

/** The institute document without the encrypted payment secret. */
function publicInstitute(inst: NonNullable<Express.Request['institute']>) {
  const o = inst.toObject() as Record<string, unknown> & { payments?: Record<string, unknown> };
  // The encrypted secret is never loaded here (select: false); only show what is safe.
  if (o.payments) o.payments = { enabled: !!o.payments.enabled, razorpayKeyId: o.payments.razorpayKeyId ?? '' };
  return o;
}

r.get('/', ah(async (req, res) => res.json(publicInstitute(req.institute!))));

/** Which message / payment providers are connected on the server (set in server/.env). */
r.get('/providers', ah(async (req, res) => res.json({ ...providerStatus(), razorpay: !!(await loadInstituteCreds(tid(req))), platformRazorpay: !!platformCreds() })));

/**
 * The institute's own Razorpay account for parent fee payments (money goes straight to the
 * institute). Keys are checked with Razorpay before saving; the secret is stored encrypted.
 */
r.put(
  '/payments',
  ah(async (req, res) => {
    // Fresh copy including the stored (encrypted) secret.
    const inst = (await Institute.findById(tid(req)).select('+payments.razorpaySecretEnc'))!;
    const b = req.body ?? {};
    if (b.enabled === false) {
      inst.set('payments.enabled', false);
      await inst.save();
      audit(req, 'settings.payments', 'Institute', inst._id, 'online fee payment turned off');
      return res.json({ enabled: false, razorpayKeyId: inst.payments?.razorpayKeyId ?? '', hasSecret: !!inst.payments?.razorpaySecretEnc });
    }
    const keyId = String(b.keyId ?? inst.payments?.razorpayKeyId ?? '').trim();
    if (!/^rzp_(test|live)_[A-Za-z0-9]{8,32}$/.test(keyId)) throw new HttpError(400, 'Key ID should look like rzp_live_XXXXXXXX (Razorpay Dashboard → Settings → API Keys)');
    const secret = typeof b.keySecret === 'string' && b.keySecret.trim() ? b.keySecret.trim() : null;
    const current = inst.payments?.razorpaySecretEnc && inst.payments.razorpayKeyId === keyId ? await loadInstituteCreds(inst._id) : null;
    const keySecret = secret ?? current?.keySecret ?? (inst.payments?.razorpaySecretEnc && inst.payments.razorpayKeyId === keyId ? decryptSecret(inst.payments.razorpaySecretEnc) : null);
    if (!keySecret) throw new HttpError(400, 'Enter the Key Secret');
    await checkKeys({ keyId, keySecret }); // throws a clear error when the keys are wrong
    inst.set('payments', { enabled: true, razorpayKeyId: keyId, razorpaySecretEnc: secret ? encryptSecret(secret) : inst.payments?.razorpaySecretEnc });
    await inst.save();
    audit(req, 'settings.payments', 'Institute', inst._id, `Razorpay ${keyId.startsWith('rzp_test') ? 'TEST' : 'LIVE'} keys connected`);
    res.json({ enabled: true, razorpayKeyId: keyId, hasSecret: true, mode: keyId.startsWith('rzp_test') ? 'test' : 'live' });
  }),
);

r.put(
  '/',
  ah(async (req, res) => {
    const inst = req.institute!;
    const b = req.body ?? {};
    const changed: string[] = [];
    const setText = (k: 'address' | 'city' | 'type', max: number) => {
      if (b[k] === undefined) return;
      inst.set(k, optStr(b[k], max) ?? undefined);
      changed.push(k);
    };
    if (b.name !== undefined) {
      inst.name = cleanName(b.name, 'Institute name');
      changed.push('name');
    }
    if (b.phone !== undefined) {
      const v = optStr(b.phone, 20);
      if (v && !PHONE_RX.test(v)) throw new HttpError(400, 'Enter a valid phone number');
      inst.set('phone', v);
      changed.push('phone');
    }
    if (b.email !== undefined) {
      const v = optStr(b.email, 120)?.toLowerCase();
      if (v && !isEmail(v)) throw new HttpError(400, 'Enter a valid email address');
      inst.set('email', v);
      changed.push('email');
    }
    setText('address', 300);
    setText('city', 80);
    setText('type', 60);
    if (b.logoText !== undefined) {
      inst.set('logoText', optStr(b.logoText, 3)?.toUpperCase());
      changed.push('logoText');
    }
    if (b.gstin !== undefined) {
      const v = optStr(b.gstin, 15)?.toUpperCase();
      if (v && !GSTIN_RX.test(v)) throw new HttpError(400, 'GSTIN should look like 22AAAAA0000A1Z5 (15 characters)');
      inst.set('gstin', v);
      changed.push('gstin');
    }
    if (b.brandColor && b.brandColor !== inst.brandColor) {
      if (typeof b.brandColor !== 'string' || !HEX_COLOR_RX.test(b.brandColor)) throw new HttpError(400, 'Brand colour must be a hex colour like #6366f1');
      if (!(await hasFeature(inst, 'customBranding'))) throw new HttpError(402, 'Custom branding is a Premium feature', 'UPGRADE_REQUIRED', { feature: 'customBranding' });
      inst.brandColor = b.brandColor;
      changed.push('brandColor');
    }
    if (b.settings) {
      const s = b.settings;
      if (s.channels) {
        if (s.channels.whatsapp && !inst.settings?.channels?.whatsapp && !(await hasFeature(inst, 'whatsapp'))) {
          throw new HttpError(402, 'WhatsApp notifications need the Growth or Premium plan', 'UPGRADE_REQUIRED', { feature: 'whatsapp' });
        }
        for (const c of ['whatsapp', 'email', 'sms'] as const) if (typeof s.channels[c] === 'boolean') inst.set(`settings.channels.${c}`, s.channels[c]);
      }
      if (s.reminders) {
        for (const k of ['enabled', 'onDueDate'] as const) if (typeof s.reminders[k] === 'boolean') inst.set(`settings.reminders.${k}`, s.reminders[k]);
        for (const k of ['daysBefore', 'daysAfter'] as const) {
          if (s.reminders[k] === undefined) continue;
          const n = Number(s.reminders[k]);
          if (!Number.isFinite(n)) throw new HttpError(400, 'Reminder days must be a number');
          inst.set(`settings.reminders.${k}`, Math.max(0, Math.min(30, Math.round(n))));
        }
        if (s.reminders.overduePerDay !== undefined) {
          const n = Number(s.reminders.overduePerDay);
          if (n !== 1 && n !== 2) throw new HttpError(400, 'Overdue reminders can go once or twice a day');
          inst.set('settings.reminders.overduePerDay', n);
        }
      }
      if (s.absentAlertAfter !== undefined) {
        const n = Number(s.absentAlertAfter);
        if (!Number.isFinite(n)) throw new HttpError(400, 'Absence alert must be a number');
        inst.set('settings.absentAlertAfter', Math.max(2, Math.min(10, Math.round(n))));
      }
      if (typeof s.notifyParentOnAbsence === 'boolean') inst.set('settings.notifyParentOnAbsence', s.notifyParentOnAbsence);
      if (s.receiptPrefix !== undefined) {
        const v = optStr(s.receiptPrefix, 12)?.toUpperCase();
        if (v && !/^[A-Z0-9-]{1,12}$/.test(v)) throw new HttpError(400, 'Receipt prefix can use letters, numbers and "-" (max 12)');
        inst.set('settings.receiptPrefix', v);
      }
      if (s.attendanceEditDays !== undefined) {
        const n = Number(s.attendanceEditDays);
        if (!Number.isFinite(n)) throw new HttpError(400, 'Attendance edit window must be a number of days');
        inst.set('settings.attendanceEditDays', Math.max(0, Math.min(365, Math.round(n))));
      }
      if (s.holidays !== undefined) {
        if (!Array.isArray(s.holidays) || s.holidays.length > 200) throw new HttpError(400, 'Invalid holiday list');
        const seen = new Set<string>();
        const list = s.holidays
          .map((h: { date?: unknown; name?: unknown }) => ({ date: String(h?.date ?? ''), name: optStr(h?.name, 60) ?? 'Holiday' }))
          .filter((h: { date: string }) => DATE_RX.test(h.date) && !seen.has(h.date) && seen.add(h.date))
          .sort((a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date));
        inst.set('settings.holidays', list);
      }
      changed.push('settings');
    }
    await inst.save();
    audit(req, 'settings.update', 'Institute', inst._id, changed.join(', '));
    res.json(publicInstitute(inst));
  }),
);

/**
 * Full backup of the institute's data as one JSON download (DPDP: the institute can take
 * its data with it). Streamed collection by collection, so it never builds in memory.
 */
r.get(
  '/export',
  rateLimit({ windowMs: 60 * 60_000, max: 5, message: 'You can download a full export 5 times an hour.', key: (req) => `export:${String(req.user.id)}` }),
  ah(async (req, res) => {
    const instituteId = tid(req);
    const inst = req.institute!;
    const stamp = ymd();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="coachflow-export-${stamp}.json"`);
    res.write(`{"exportedAt":${JSON.stringify(new Date())},"institute":${JSON.stringify(publicInstitute(inst))}`);

    const collections: [string, () => AsyncIterable<unknown>][] = [
      ['staffAndParents', () => User.find({ instituteId }).select('-password -tokenVersion').lean().cursor()],
      ['students', () => Student.find({ instituteId }).lean().cursor()],
      ['batches', () => Batch.find({ instituteId }).lean().cursor()],
      ['attendance', () => Attendance.find({ instituteId }).sort({ date: 1 }).lean().cursor()],
      ['tests', () => Test.find({ instituteId }).sort({ date: 1 }).lean().cursor()],
      ['invoices', () => Invoice.find({ instituteId }).lean().cursor()],
      ['payments', () => Payment.find({ instituteId }).sort({ paidAt: 1 }).lean().cursor()],
      ['announcements', () => Announcement.find({ instituteId }).lean().cursor()],
      ['staffAttendance', () => StaffAttendance.find({ instituteId }).sort({ date: 1 }).lean().cursor()],
      ['salaries', () => Salary.find({ instituteId }).sort({ month: 1 }).lean().cursor()],
    ];
    // Stop reading from MongoDB as soon as the browser goes away.
    let gone = false;
    res.once('close', () => (gone = true));
    const waitDrain = () => new Promise<void>((ok) => {
      const done = () => { res.off('drain', done); res.off('close', done); ok(); };
      res.once('drain', done);
      res.once('close', done);
    });
    for (const [name, open] of collections) {
      if (gone) break;
      res.write(`,${JSON.stringify(name)}:[`);
      let first = true;
      for await (const doc of open()) {
        if (gone) break;
        if (!res.write((first ? '' : ',') + JSON.stringify(doc))) await waitDrain();
        first = false;
      }
      res.write(']');
    }
    if (gone) return;
    res.end('}');
    audit(req, 'data.export', 'Institute', instituteId);
  }),
);

export default r;
