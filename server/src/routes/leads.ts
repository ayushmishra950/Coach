import { Router } from 'express';
import { allow, auth, tid } from '../middleware/auth.js';
import { Batch, Course, LEAD_SOURCES, LEAD_STATUSES, Lead, Student } from '../models/index.js';
import { audit } from '../services/audit.js';
import { addDays, parseDate, startOfDay } from '../utils/dates.js';
import { HttpError, ah, oid, str } from '../utils/http.js';
import { pageParams, paged } from '../utils/paginate.js';
import { PHONE_RX, cleanName, escapeRegex, isEmail, optStr } from '../utils/security.js';

/** Enquiry & lead management (owner). Website / demo-form leads arrive via routes/site.ts. */
const r = Router();
r.use(auth, allow('owner'));

export function leadFields(b: Record<string, unknown>, partial = false) {
  const set: Record<string, unknown> = {};
  if (!partial || b.name !== undefined) set.name = cleanName(b.name, 'Name');
  if (!partial || b.phone !== undefined) {
    const v = optStr(b.phone, 20) ?? '';
    if (!PHONE_RX.test(v)) throw new HttpError(400, 'Enter a valid phone number');
    set.phone = v;
  }
  if (b.email !== undefined) {
    const v = (optStr(b.email, 120) ?? '').toLowerCase();
    if (v && !isEmail(v)) throw new HttpError(400, 'Enter a valid email address');
    set.email = v || undefined;
  }
  for (const k of ['studentName', 'studentClass', 'courseName'] as const) if (b[k] !== undefined) set[k] = optStr(b[k], 80);
  if (b.message !== undefined) set.message = optStr(b.message, 1000);
  if (b.source !== undefined) set.source = (LEAD_SOURCES as readonly string[]).includes(String(b.source)) ? b.source : 'other';
  if (b.kind !== undefined) set.kind = b.kind === 'demo' ? 'demo' : 'enquiry';
  if (b.status !== undefined) {
    if (!(LEAD_STATUSES as readonly string[]).includes(String(b.status))) throw new HttpError(400, 'Invalid status');
    set.status = b.status;
  }
  if (b.followUpAt !== undefined) set.followUpAt = b.followUpAt ? parseDate(b.followUpAt, 'Follow-up date') : null;
  if (b.demoAt !== undefined) set.demoAt = b.demoAt ? parseDate(b.demoAt, 'Demo date') : null;
  if (b.lostReason !== undefined) set.lostReason = optStr(b.lostReason, 200);
  return set;
}

r.get(
  '/',
  ah(async (req, res) => {
    const instituteId = tid(req);
    const p = pageParams(req.query);
    const q: Record<string, unknown> = { instituteId };
    const status = str(req.query.status);
    const today = startOfDay();
    if (status === 'open') q.status = { $nin: ['converted', 'lost'] };
    else if (status === 'followup') Object.assign(q, { status: { $nin: ['converted', 'lost'] }, followUpAt: { $lt: addDays(today, 1) } });
    else if (status && (LEAD_STATUSES as readonly string[]).includes(status)) q.status = status;
    if (str(req.query.kind) === 'demo') q.kind = 'demo';
    const search = str(req.query.search)?.trim();
    if (search) {
      const rx = new RegExp(escapeRegex(search), 'i');
      q.$or = [{ name: rx }, { studentName: rx }, { phone: rx }, { email: rx }, { courseName: rx }];
    }
    const [items, total, byStatus, followUps, last30] = await Promise.all([
      // "Active" list: the ones whose follow-up is due (today or missed) come first, then newest.
      status === 'open' || !status
        ? Lead.aggregate([
          { $match: q },
          { $addFields: { _due: { $cond: [{ $and: [{ $ne: [{ $ifNull: ['$followUpAt', null] }, null] }, { $lt: ['$followUpAt', addDays(today, 1)] }, { $not: [{ $in: ['$status', ['converted', 'lost']] }] }] }, 0, 1] } } },
          { $sort: { _due: 1, followUpAt: 1, createdAt: -1, _id: -1 } },
          { $skip: p.skip }, { $limit: p.limit },
          { $project: { _due: 0 } },
        ]).then((rows) => Lead.populate(rows, { path: 'demoBatchId', select: 'name' }))
        : Lead.find(q).sort(status === 'followup' ? { followUpAt: 1, _id: 1 } : { createdAt: -1, _id: -1 }).skip(p.skip).limit(p.limit).populate('demoBatchId', 'name').lean(),
      Lead.countDocuments(q),
      Lead.aggregate<{ _id: string; n: number }>([{ $match: { instituteId } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
      Lead.countDocuments({ instituteId, status: { $nin: ['converted', 'lost'] }, followUpAt: { $lt: addDays(today, 1) } }),
      Lead.aggregate<{ _id: string; n: number }>([
        { $match: { instituteId, createdAt: { $gte: addDays(today, -30) } } },
        { $group: { _id: '$status', n: { $sum: 1 } } },
      ]),
    ]);
    const counts = Object.fromEntries(byStatus.map((x) => [x._id, x.n]));
    const all = byStatus.reduce((a, x) => a + x.n, 0);
    const recent = last30.reduce((a, x) => a + x.n, 0);
    const recentConverted = last30.find((x) => x._id === 'converted')?.n ?? 0;
    res.json({
      ...paged(items, total, p),
      counts: { ...counts, all, open: all - (counts.converted ?? 0) - (counts.lost ?? 0), followup: followUps },
      last30: { total: recent, converted: recentConverted, rate: recent ? Math.round((recentConverted / recent) * 100) : 0 },
    });
  }),
);

r.get(
  '/:id',
  ah(async (req, res) => {
    const lead = await Lead.findOne({ _id: oid(req.params.id), instituteId: tid(req) }).populate('demoBatchId', 'name').lean();
    if (!lead) throw new HttpError(404, 'Enquiry not found');
    res.json(lead);
  }),
);

r.post(
  '/',
  ah(async (req, res) => {
    const set = leadFields(req.body ?? {});
    if (req.body?.courseId) {
      const c = await Course.findOne({ _id: oid(String(req.body.courseId)), instituteId: tid(req) }).select('name').lean();
      if (c) Object.assign(set, { courseId: c._id, courseName: c.name });
    }
    const lead = await Lead.create({ ...set, instituteId: tid(req), notes: req.body?.note ? [{ text: optStr(req.body.note, 500), by: req.user.name }] : [] });
    audit(req, 'lead.create', 'Lead', lead._id, `${lead.name} · ${lead.phone}`);
    res.status(201).json(lead);
  }),
);

r.put(
  '/:id',
  ah(async (req, res) => {
    const lead = await Lead.findOne({ _id: oid(req.params.id), instituteId: tid(req) });
    if (!lead) throw new HttpError(404, 'Enquiry not found');
    const set = leadFields(req.body ?? {}, true);
    if (req.body?.demoBatchId !== undefined) {
      if (!req.body.demoBatchId) set.demoBatchId = null;
      else {
        const b = await Batch.exists({ _id: oid(String(req.body.demoBatchId)), instituteId: tid(req) });
        if (!b) throw new HttpError(400, 'Batch not found');
        set.demoBatchId = b._id;
      }
    }
    if (set.status && set.status !== lead.status) {
      lead.notes.push({ text: `Status: ${String(lead.status).replace('_', ' ')} → ${String(set.status).replace('_', ' ')}`, by: req.user.name, at: new Date() });
      if (set.status !== 'new') set.lastContactAt = new Date();
    }
    lead.set(set);
    await lead.save();
    res.json(await lead.populate('demoBatchId', 'name'));
  }),
);

r.post(
  '/:id/notes',
  ah(async (req, res) => {
    const text = optStr(req.body?.text, 500);
    if (!text) throw new HttpError(400, 'Write a note');
    const lead = await Lead.findOneAndUpdate(
      { _id: oid(req.params.id), instituteId: tid(req) },
      {
        $push: { notes: { text, by: req.user.name, at: new Date() } },
        $set: { lastContactAt: new Date(), ...(req.body?.followUpAt ? { followUpAt: parseDate(req.body.followUpAt, 'Follow-up date') } : {}) },
      },
      { new: true },
    ).populate('demoBatchId', 'name');
    if (!lead) throw new HttpError(404, 'Enquiry not found');
    res.json(lead);
  }),
);

/** After the student was created (POST /students), link it and close the lead. */
r.post(
  '/:id/convert',
  ah(async (req, res) => {
    const instituteId = tid(req);
    const studentId = oid(String(req.body?.studentId ?? ''));
    if (!(await Student.exists({ _id: studentId, instituteId }))) throw new HttpError(400, 'Student not found');
    const lead = await Lead.findOneAndUpdate(
      { _id: oid(req.params.id), instituteId },
      { $set: { status: 'converted', studentId, convertedAt: new Date(), followUpAt: null }, $push: { notes: { text: 'Admission done ✓', by: req.user.name, at: new Date() } } },
      { new: true },
    );
    if (!lead) throw new HttpError(404, 'Enquiry not found');
    audit(req, 'lead.convert', 'Lead', lead._id, lead.name);
    res.json(lead);
  }),
);

r.delete(
  '/:id',
  ah(async (req, res) => {
    const lead = await Lead.findOneAndDelete({ _id: oid(req.params.id), instituteId: tid(req) });
    if (!lead) throw new HttpError(404, 'Enquiry not found');
    audit(req, 'lead.delete', 'Lead', lead._id, `${lead.name} · ${lead.phone}`);
    res.json({ ok: true });
  }),
);

export default r;
