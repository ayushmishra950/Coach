import { Router } from 'express';
import { Types } from 'mongoose';
import { allow, auth, tid } from '../middleware/auth.js';
import { Batch, Course, Institute, Lead, Student, User } from '../models/index.js';
import { audit } from '../services/audit.js';
import { hasFeature } from '../services/plan.js';
import { deleteFile, fileInfo } from '../services/files.js';
import { notify } from '../services/notify.js';
import { emitToInstituteRole } from '../services/realtime.js';
import { parseDate } from '../utils/dates.js';
import { HttpError, ah, oid } from '../utils/http.js';
import { PHONE_RX, cleanName, isEmail, optStr, rateLimit } from '../utils/security.js';

/**
 * Public admissions website for each institute: /site/<slug>
 *   Owner:  GET / PUT /api/website
 *   Public: GET /api/public/site/:slug · POST /api/public/site/:slug/enquiry
 */
const r = Router();
r.use(auth, allow('owner'));

const SLUG_RX = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
const RESERVED = new Set(['admin', 'app', 'api', 'portal', 'login', 'register', 'site', 'www', 'coachflow', 'help', 'support']);

export const slugify = (s: string) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

r.get(
  '/',
  ah(async (req, res) => {
    const inst = req.institute!;
    const courses = await Course.countDocuments({ instituteId: tid(req), active: true, public: true });
    res.json({ website: inst.website ?? {}, suggestedSlug: slugify(inst.name), publicCourses: courses });
  }),
);

async function ownImage(instituteId: Types.ObjectId, v: unknown) {
  if (!v) return undefined;
  const f = await fileInfo(oid(String(v)));
  if (!f || String(f.metadata?.instituteId) !== String(instituteId) || !f.metadata?.public) throw new HttpError(400, 'Upload the photo again');
  return f._id as Types.ObjectId;
}

r.put(
  '/',
  ah(async (req, res) => {
    const inst = req.institute!;
    const instituteId = tid(req);
    const b = req.body ?? {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const before: Record<string, any> = (inst.toObject() as { website?: Record<string, unknown> }).website ?? {};
    const w: Record<string, unknown> = {};
    if (typeof b.enabled === 'boolean') w.enabled = b.enabled;
    if (typeof b.demoEnabled === 'boolean') w.demoEnabled = b.demoEnabled;
    for (const k of ['showTeachers', 'showBatches', 'showCounts'] as const) if (typeof b[k] === 'boolean') w[k] = b[k];
    if (b.slug !== undefined) {
      const slug = String(b.slug ?? '').trim().toLowerCase();
      if (!SLUG_RX.test(slug) || RESERVED.has(slug)) throw new HttpError(400, 'Web address: 3–40 lowercase letters, numbers or "-" (e.g. sharma-classes)');
      if (await Institute.exists({ _id: { $ne: instituteId }, 'website.slug': slug })) throw new HttpError(409, 'This web address is already taken — try another');
      w.slug = slug;
    }
    w.tagline = b.tagline !== undefined ? optStr(b.tagline, 160) : before.tagline;
    w.about = b.about !== undefined ? optStr(b.about, 4000) : before.about;
    w.mapUrl = b.mapUrl !== undefined ? optStr(b.mapUrl, 500) : before.mapUrl;
    if (w.mapUrl && !/^https:\/\//i.test(String(w.mapUrl))) throw new HttpError(400, 'Map link must start with https://');
    if (b.whatsapp !== undefined) {
      const v = optStr(b.whatsapp, 20);
      if (v && !PHONE_RX.test(v)) throw new HttpError(400, 'Enter a valid WhatsApp number');
      w.whatsapp = v;
    }
    if (b.heroImageId !== undefined) w.heroImageId = await ownImage(instituteId, b.heroImageId);
    if (b.stats !== undefined) {
      w.stats = (Array.isArray(b.stats) ? b.stats : []).slice(0, 6)
        .map((x: Record<string, unknown>) => ({ label: optStr(x?.label, 40), value: optStr(x?.value, 20) }))
        .filter((x: { label?: string; value?: string }) => x.label && x.value);
    }
    if (b.toppers !== undefined) {
      const list = Array.isArray(b.toppers) ? b.toppers.slice(0, 40) : [];
      const out = [];
      for (const t of list as Record<string, unknown>[]) {
        const name = optStr(t?.name, 80);
        if (!name) continue;
        out.push({ name, result: optStr(t.result, 80), year: optStr(t.year, 10), quote: optStr(t.quote, 300), photoId: await ownImage(instituteId, t.photoId) });
      }
      w.toppers = out;
    }
    if (b.testimonials !== undefined) {
      w.testimonials = (Array.isArray(b.testimonials) ? b.testimonials.slice(0, 30) : [])
        .map((t: Record<string, unknown>) => ({ name: optStr(t?.name, 80), role: optStr(t?.role, 80), text: optStr(t?.text, 800), rating: Math.max(1, Math.min(5, Math.round(Number(t?.rating) || 5))) }))
        .filter((t: { name?: string; text?: string }) => t.name && t.text);
    }
    const next = { ...before, ...w };
    if (next.enabled && !next.slug) throw new HttpError(400, 'Choose a web address before publishing the website');
    inst.set('website', next);
    if (!next.slug) inst.set('website.slug', undefined);
    await inst.save();
    // Photos that are no longer used anywhere on the site.
    const used = new Set([String(next.heroImageId ?? ''), ...((next.toppers ?? []) as { photoId?: unknown }[]).map((t) => String(t.photoId ?? ''))]);
    const old = [before.heroImageId, ...((before.toppers ?? []) as { photoId?: unknown }[]).map((t) => t.photoId)].filter(Boolean) as Types.ObjectId[];
    for (const id of old) if (!used.has(String(id))) await deleteFile(id);
    audit(req, 'website.update', 'Institute', inst._id, `${next.enabled ? 'published' : 'hidden'} · /site/${next.slug ?? ''}`);
    res.json({ website: inst.website });
  }),
);

export default r;

/* ─────────────────────────── Public ─────────────────────────── */

export const publicSite = Router();

async function siteInstitute(slug: string) {
  const s = String(slug ?? '').toLowerCase();
  if (!SLUG_RX.test(s)) throw new HttpError(404, 'Website not found');
  const inst = await Institute.findOne({ 'website.slug': s, 'website.enabled': true, status: { $ne: 'suspended' } });
  if (!inst) throw new HttpError(404, 'Website not found');
  return inst;
}

publicSite.get(
  '/:slug',
  ah(async (req, res) => {
    const inst = await siteInstitute(req.params.slug);
    const courses = await Course.find({ instituteId: inst._id, active: true, public: true })
      .select('name category description duration fee feeNote syllabus highlights batchIds')
      .populate('batchIds', 'name days startTime endTime active')
      .sort({ order: 1, name: 1 })
      .lean();
    const w = inst.website!;
    // Live details so the page is never empty: batches & timings, faculty, subjects and counts.
    const [parentApp, onlinePay, batches, teachers, studentCount] = await Promise.all([
      hasFeature(inst, 'parentPortal'),
      hasFeature(inst, 'onlinePayments'),
      Batch.find({ instituteId: inst._id, active: true }).select('name course subject days startTime endTime teacherId').populate('teacherId', 'name').sort({ course: 1, startTime: 1 }).lean(),
      User.find({ instituteId: inst._id, role: 'teacher', active: true }).select('name subjects qualification joiningDate').sort({ joiningDate: 1, name: 1 }).limit(24).lean(),
      Student.countDocuments({ instituteId: inst._id, status: 'active' }),
    ]);
    const subjects = [...new Set([...batches.map((b) => b.subject), ...teachers.flatMap((t) => t.subjects ?? [])].filter(Boolean).map((s) => String(s).trim()))].slice(0, 20);
    const classes = [...new Set(batches.map((b) => b.course).filter(Boolean) as string[])];
    const years = (d?: Date | null) => (d ? Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / (365.25 * 86400000))) : null);
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json({
      institute: {
        name: inst.name, phone: inst.phone, email: inst.email, address: inst.address, city: inst.city, type: inst.type,
        brandColor: inst.brandColor, logoText: inst.logoText || inst.name.slice(0, 2).toUpperCase(),
      },
      website: {
        slug: w.slug, tagline: w.tagline, about: w.about, whatsapp: w.whatsapp, mapUrl: w.mapUrl, heroImageId: w.heroImageId, demoEnabled: w.demoEnabled !== false,
        stats: w.stats ?? [], toppers: w.toppers ?? [], testimonials: w.testimonials ?? [],
      },
      auto: {
        batches: w.showBatches === false ? [] : batches.map((b) => ({
          name: b.name, course: b.course, subject: b.subject, days: b.days, startTime: b.startTime, endTime: b.endTime,
          teacher: (b.teacherId as unknown as { name?: string } | null)?.name,
        })),
        teachers: w.showTeachers === false ? [] : teachers.map((t) => ({ name: t.name, subjects: t.subjects ?? [], qualification: t.qualification, years: years(t.joiningDate) })),
        subjects,
        classes,
        counts: w.showCounts === false ? null : { students: studentCount, teachers: teachers.length, batches: batches.length, subjects: subjects.length },
        since: inst.createdAt ? new Date(inst.createdAt).getFullYear() : null,
        // Only promise what this institute's plan really includes.
        parentApp,
        onlinePay: onlinePay && !!inst.payments?.enabled,
      },
      courses: courses.map((c) => ({
        ...c,
        batches: ((c.batchIds ?? []) as unknown as { name: string; days: string[]; startTime: string; endTime: string; active: boolean }[])
          .filter((b) => b && b.active !== false)
          .map((b) => ({ name: b.name, days: b.days, startTime: b.startTime, endTime: b.endTime })),
        batchIds: undefined,
      })),
    });
  }),
);

publicSite.post(
  '/:slug/enquiry',
  rateLimit({ windowMs: 60 * 60_000, max: 6, message: 'Too many requests from this device. Please call or WhatsApp us instead.' }),
  ah(async (req, res) => {
    const inst = await siteInstitute(req.params.slug);
    const b = req.body ?? {};
    // Honeypot: real people never fill the hidden "company" field.
    if (b.company) return res.status(201).json({ ok: true });
    const name = cleanName(b.name, 'Your name');
    const phone = optStr(b.phone, 20) ?? '';
    if (!PHONE_RX.test(phone)) throw new HttpError(400, 'Enter a valid phone number');
    const email = (optStr(b.email, 120) ?? '').toLowerCase();
    if (email && !isEmail(email)) throw new HttpError(400, 'Enter a valid email address');
    const demo = b.kind === 'demo';
    if (demo && inst.website?.demoEnabled === false) throw new HttpError(400, 'Demo booking is closed right now. Please send an enquiry instead.');
    let demoAt: Date | undefined;
    if (demo && b.demoAt) {
      demoAt = parseDate(b.demoAt, 'Preferred date');
      if (demoAt.getTime() < Date.now() - 86400000) throw new HttpError(400, 'Pick a date in the future');
    }
    const course = b.courseId ? await Course.findOne({ _id: oid(String(b.courseId)), instituteId: inst._id }).select('name').lean() : null;
    const demoBatch = demo && b.batchName ? await Batch.findOne({ instituteId: inst._id, name: String(b.batchName).slice(0, 80) }).select('_id').lean() : null;
    // Same phone enquired in the last 7 days → add to that lead instead of a duplicate.
    const recent = await Lead.findOne({ instituteId: inst._id, phone, createdAt: { $gte: new Date(Date.now() - 7 * 86400000) }, status: { $nin: ['converted', 'lost'] } });
    const note = `${demo ? 'Demo class request' : 'Website enquiry'}${optStr(b.message, 1000) ? `: ${optStr(b.message, 1000)}` : ''}`;
    let lead;
    if (recent) {
      recent.notes.push({ text: `Enquired again from the website. ${note}`, by: 'Website', at: new Date() });
      if (demo) recent.set({ kind: 'demo', demoAt: demoAt ?? recent.demoAt, status: recent.status === 'new' ? 'new' : recent.status });
      lead = await recent.save();
    } else {
      lead = await Lead.create({
        instituteId: inst._id, name, phone, email: email || undefined,
        studentName: optStr(b.studentName, 80), studentClass: optStr(b.studentClass, 40),
        courseId: course?._id, courseName: course?.name ?? optStr(b.courseName, 80), message: optStr(b.message, 1000),
        source: demo ? 'demo_form' : 'website', kind: demo ? 'demo' : 'enquiry', demoAt, demoBatchId: demoBatch?._id,
        followUpAt: new Date(), notes: [{ text: note, by: 'Website', at: new Date() }],
      });
    }
    notify({
      institute: inst, type: 'lead', audience: 'owner',
      title: demo ? 'New demo class booking' : 'New website enquiry',
      message: `${name} (${phone})${b.studentClass ? ` · ${optStr(b.studentClass, 40)}` : ''}${course ? ` · ${course.name}` : ''}${demoAt ? ` · demo on ${demoAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}`,
      href: `/app/leads?open=${lead._id}`,
    }).catch(() => undefined);
    // Owners with the Enquiries page or dashboard open see the new lead straight away.
    emitToInstituteRole(inst._id, 'owner', 'lead:new', { _id: String(lead._id), kind: demo ? 'demo' : 'enquiry', repeat: !!recent });
    res.status(201).json({ ok: true });
  }),
);
