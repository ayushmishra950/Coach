import { Router, type Request } from 'express';
import { allow, auth, requireFeature } from '../middleware/auth.js';
import { Attendance, Invoice, LeaveRequest, Material, Payment, Student, Test, TestAttempt, User } from '../models/index.js';
import { closeExpired, grade, recordScore, windowState } from '../services/onlineTest.js';
import { notify } from '../services/notify.js';
import { recordPayment } from '../services/payments.js';
import { createOrder, fetchOrder, loadInstituteCreds, verifySignature, type RzpCreds } from '../services/razorpay.js';
import { ymd } from '../utils/dates.js';
import { HttpError, ah, oid, str } from '../utils/http.js';
import { optStr, rateLimit } from '../utils/security.js';
import { fmtDay, teachersOf } from './academics.js';

/** Parent portal: study material, leave requests, online tests, report card, Razorpay payments. */
const r = Router();
r.use(auth, allow('parent'), requireFeature('parentPortal'));

async function ownStudent(req: Request, id: unknown) {
  const sid = oid(String(id ?? ''));
  if (!req.user.studentIds.some((s) => String(s) === String(sid))) throw new HttpError(404, 'Student not found');
  const s = await Student.findOne({ _id: sid, instituteId: req.user.instituteId }).select('name batchIds parentName studentCode course');
  if (!s) throw new HttpError(404, 'Student not found');
  return s;
}

/* ─────────────── Study material ─────────────── */

r.get(
  '/materials',
  ah(async (req, res) => {
    const s = await ownStudent(req, req.query.studentId);
    const items = await Material.find({ instituteId: req.user.instituteId, batchIds: { $in: s.batchIds } })
      .select('title description subject kind fileId fileName fileSize mime url dueDate uploadedByName createdAt batchIds')
      .populate('batchIds', 'name color')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json(items);
  }),
);

/* ─────────────── Leave requests ─────────────── */

r.get(
  '/leaves',
  ah(async (req, res) => {
    const s = await ownStudent(req, req.query.studentId);
    res.json(await LeaveRequest.find({ instituteId: req.user.instituteId, studentId: s._id }).sort({ from: -1, createdAt: -1 }).limit(50).lean());
  }),
);

const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;

r.post(
  '/leaves',
  rateLimit({ windowMs: 60 * 60_000, max: 20, message: 'Too many leave requests. Please try again later.', key: (req) => `leave:${String(req.user.id)}` }),
  ah(async (req, res) => {
    const s = await ownStudent(req, req.body?.studentId);
    const from = String(req.body?.from ?? '');
    const to = String(req.body?.to || from);
    if (!DATE_RX.test(from) || !DATE_RX.test(to)) throw new HttpError(400, 'Pick the leave dates');
    if (to < from) throw new HttpError(400, 'The end date must be on or after the start date');
    if (from < ymd(new Date(Date.now() - 7 * 86400000))) throw new HttpError(400, 'Leave can be requested for at most 7 days back');
    const days = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
    if (days > 60) throw new HttpError(400, 'A leave request can cover up to 60 days');
    const reason = optStr(req.body?.reason, 500);
    if (!reason) throw new HttpError(400, 'Write the reason for leave');
    if (await LeaveRequest.exists({ instituteId: req.user.instituteId, studentId: s._id, status: { $in: ['pending', 'approved'] }, from: { $lte: to }, to: { $gte: from } })) {
      throw new HttpError(409, 'There is already a leave request for these dates');
    }
    const leave = await LeaveRequest.create({ instituteId: req.user.instituteId, studentId: s._id, parentUserId: req.user.id, from, to, reason });
    // Tell the owner and the child's teachers.
    const range = from === to ? fmtDay(from) : `${fmtDay(from)} – ${fmtDay(to)}`;
    const msg = { title: `Leave request: ${s.name}`, message: `${s.name} — ${range} (${days} day${days > 1 ? 's' : ''}). Reason: ${reason}`, href: '/app/leaves' };
    notify({ institute: req.institute!, type: 'leave', audience: 'owner', ...msg }).catch(() => undefined);
    for (const t of await teachersOf(req.user.instituteId!, s.batchIds)) {
      notify({ institute: req.institute!, type: 'leave', audience: 'staff', userId: t._id, ...msg }).catch(() => undefined);
    }
    res.status(201).json(leave);
  }),
);

r.post(
  '/leaves/:id/cancel',
  ah(async (req, res) => {
    const leave = await LeaveRequest.findOne({ _id: oid(req.params.id), instituteId: req.user.instituteId, studentId: { $in: req.user.studentIds } });
    if (!leave) throw new HttpError(404, 'Leave request not found');
    if (leave.status !== 'pending') throw new HttpError(400, 'Only a pending request can be cancelled');
    leave.status = 'cancelled';
    await leave.save();
    res.json(leave);
  }),
);

/* ─────────────── Online tests ─────────────── */

r.get(
  '/online-tests',
  ah(async (req, res) => {
    const s = await ownStudent(req, req.query.studentId);
    const tests = await Test.find({ instituteId: req.user.instituteId, batchId: { $in: s.batchIds }, mode: 'online', 'questions.0': { $exists: true } })
      .select('subject topic date maxMarks durationMins opensAt closesAt status questions.marks batchId wrongPenalty')
      .populate('batchId', 'name')
      .sort({ date: -1 })
      .limit(40)
      .lean();
    await closeExpired(tests.map((t) => t._id));
    const attempts = await TestAttempt.find({ testId: { $in: tests.map((t) => t._id) }, studentId: s._id }).lean();
    res.json(tests.map((t) => {
      const a = attempts.find((x) => String(x.testId) === String(t._id));
      return {
        _id: t._id, subject: t.subject, topic: t.topic, date: t.date, maxMarks: t.maxMarks, durationMins: t.durationMins, opensAt: t.opensAt, closesAt: t.closesAt,
        batch: (t.batchId as unknown as { name?: string })?.name, questionCount: t.questions.length, wrongPenalty: t.wrongPenalty ?? 0,
        window: windowState(t), published: t.status === 'published',
        attempt: a ? { startedAt: a.startedAt, deadline: a.deadline, submittedAt: a.submittedAt, score: t.status === 'published' ? a.score : undefined } : null,
      };
    }));
  }),
);

async function loadOnline(req: Request) {
  const s = await ownStudent(req, req.body?.studentId ?? req.query.studentId);
  const test = await Test.findOne({ _id: oid(req.params.id), instituteId: req.user.instituteId, mode: 'online' });
  if (!test || !s.batchIds.some((b) => String(b) === String(test.batchId))) throw new HttpError(404, 'Test not found');
  return { s, test };
}

const cleanAnswers = (v: unknown, n: number) => Array.from({ length: n }, (_, i) => {
  const x = Array.isArray(v) ? v[i] : null;
  return x === null || x === undefined || x === '' || !Number.isInteger(Number(x)) ? null : Number(x);
});

/** Start (or resume) the test. Questions are sent WITHOUT the answers. */
r.post(
  '/online-tests/:id/start',
  ah(async (req, res) => {
    const { s, test } = await loadOnline(req);
    const now = new Date();
    let a = await TestAttempt.findOne({ testId: test._id, studentId: s._id });
    if (a?.submittedAt) throw new HttpError(409, 'This test has already been submitted');
    if (!a) {
      const w = windowState(test, now);
      if (w === 'upcoming') throw new HttpError(400, `The test opens at ${test.opensAt!.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`);
      if (w === 'closed') throw new HttpError(400, 'This test has closed');
      if (test.status === 'published') throw new HttpError(400, 'Results for this test are already out');
      let deadline = new Date(now.getTime() + (test.durationMins ?? 30) * 60_000);
      if (test.closesAt && test.closesAt < deadline) deadline = test.closesAt;
      try {
        a = await TestAttempt.create({ instituteId: test.instituteId, testId: test._id, studentId: s._id, startedAt: now, deadline, answers: test.questions.map(() => null) });
      } catch (e) {
        if ((e as { code?: number }).code !== 11000) throw e;
        a = (await TestAttempt.findOne({ testId: test._id, studentId: s._id }))!;
      }
    }
    if (a.deadline && a.deadline.getTime() + 60_000 < now.getTime()) {
      await closeExpired([test._id]);
      throw new HttpError(409, 'Time is up — your saved answers were submitted');
    }
    res.json({
      test: { _id: test._id, subject: test.subject, topic: test.topic, maxMarks: test.maxMarks, wrongPenalty: test.wrongPenalty ?? 0 },
      questions: test.questions.map((q) => ({ _id: q._id, text: q.text, options: q.options, marks: q.marks })),
      answers: a.answers,
      deadline: a.deadline,
      serverTime: now,
    });
  }),
);

/** Autosave while answering. */
r.put(
  '/online-tests/:id/answers',
  ah(async (req, res) => {
    const { s, test } = await loadOnline(req);
    const answers = cleanAnswers(req.body?.answers, test.questions.length);
    const a = await TestAttempt.findOneAndUpdate(
      { testId: test._id, studentId: s._id, submittedAt: null, deadline: { $gt: new Date(Date.now() - 30_000) } },
      { $set: { answers } },
      { new: true },
    );
    if (!a) throw new HttpError(409, 'Time is up or the test was already submitted');
    res.json({ ok: true });
  }),
);

r.post(
  '/online-tests/:id/submit',
  ah(async (req, res) => {
    const { s, test } = await loadOnline(req);
    const a = await TestAttempt.findOne({ testId: test._id, studentId: s._id });
    if (!a) throw new HttpError(400, 'Start the test first');
    if (a.submittedAt) throw new HttpError(409, 'Already submitted');
    // Answers sent after the deadline (+60 s for slow networks) are ignored; the saved ones count.
    const late = a.deadline && Date.now() > a.deadline.getTime() + 60_000;
    const answers = late ? a.answers : cleanAnswers(req.body?.answers, test.questions.length);
    const g = grade(test, answers);
    const done = await TestAttempt.findOneAndUpdate({ _id: a._id, submittedAt: null }, { $set: { answers, ...g, submittedAt: new Date() } }, { new: true });
    if (!done) throw new HttpError(409, 'Already submitted');
    await recordScore(test._id, s._id, g.score);
    res.json({ ok: true, submittedAt: done.submittedAt, answered: answers.filter((x) => x !== null).length, total: test.questions.length });
  }),
);

/** After results are published: score, correct answers and explanations. */
r.get(
  '/online-tests/:id/review',
  ah(async (req, res) => {
    const { s, test } = await loadOnline(req);
    if (test.status !== 'published') throw new HttpError(400, 'Results are not published yet');
    const a = await TestAttempt.findOne({ testId: test._id, studentId: s._id }).lean();
    if (!a?.submittedAt) throw new HttpError(404, 'No submitted attempt');
    res.json({
      test: { subject: test.subject, topic: test.topic, maxMarks: test.maxMarks },
      score: a.score, correct: a.correct, wrong: a.wrong,
      questions: test.questions.map((q, i) => ({
        text: q.text, options: q.options, marks: q.marks, yourAnswer: a.answers[i] ?? null,
        ...(test.showAnswers !== false && { correct: q.correct, explanation: q.explanation }),
      })),
    });
  }),
);

/* ─────────────── Report card ─────────────── */

r.get(
  '/report-card',
  ah(async (req, res) => {
    const s = await ownStudent(req, req.query.studentId);
    const instituteId = req.user.instituteId!;
    const [tests, att] = await Promise.all([
      Test.find({ instituteId, status: 'published', 'results.studentId': s._id }).select('subject topic date maxMarks passPercent results').sort({ date: 1 }).lean(),
      Attendance.find({ instituteId, 'records.studentId': s._id }).select('records').lean(),
    ]);
    const rows = tests.map((t) => {
      const mine = t.results.find((x) => String(x.studentId) === String(s._id))!;
      const scored = t.results.filter((x) => !x.absent && typeof x.marks === 'number');
      const rank = mine.absent || typeof mine.marks !== 'number' ? null : 1 + scored.filter((x) => (x.marks as number) > (mine.marks as number)).length;
      const avg = scored.length ? scored.reduce((a, x) => a + (x.marks as number), 0) / scored.length : null;
      return {
        _id: t._id, subject: t.subject, topic: t.topic, date: t.date, maxMarks: t.maxMarks, marks: mine.marks ?? null, absent: !!mine.absent,
        pct: mine.absent || typeof mine.marks !== 'number' ? null : Math.round((mine.marks / t.maxMarks) * 100),
        classAvgPct: avg == null ? null : Math.round((avg / t.maxMarks) * 100),
        highest: scored.length ? Math.max(...scored.map((x) => x.marks as number)) : null,
        rank, outOf: scored.length, passPercent: t.passPercent ?? 40,
      };
    });
    const bySubject = new Map<string, number[]>();
    for (const x of rows) if (x.pct != null) bySubject.set(x.subject, [...(bySubject.get(x.subject) ?? []), x.pct]);
    const subjects = [...bySubject].map(([subject, list]) => ({
      subject, tests: list.length, avg: Math.round(list.reduce((a, b) => a + b, 0) / list.length), best: Math.max(...list),
    })).sort((a, b) => b.avg - a.avg);
    const recs = att.flatMap((d) => d.records.filter((x) => String(x.studentId) === String(s._id)));
    const present = recs.filter((x) => x.status !== 'absent').length;
    const scoredRows = rows.filter((x) => x.pct != null);
    res.json({
      student: { name: s.name, studentCode: s.studentCode, course: s.course, parentName: s.parentName },
      institute: { name: req.institute!.name, phone: req.institute!.phone, address: req.institute!.address, city: req.institute!.city, logoText: req.institute!.logoText, brandColor: req.institute!.brandColor },
      overall: scoredRows.length ? Math.round(scoredRows.reduce((a, x) => a + (x.pct as number), 0) / scoredRows.length) : null,
      attendance: { total: recs.length, present, pct: recs.length ? Math.round((present / recs.length) * 100) : null },
      subjects,
      tests: rows.reverse(),
      generatedAt: new Date(),
    });
  }),
);

/* ─────────────── Razorpay fee payment (to the institute's own account) ─────────────── */

async function gatewayOf(req: Request): Promise<RzpCreds> {
  const creds = await loadInstituteCreds(req.user.instituteId);
  if (!creds) throw new HttpError(503, 'Online payment is not set up yet. Please pay at the institute office.');
  return creds;
}

r.post(
  '/pay/order',
  requireFeature('onlinePayments'),
  ah(async (req, res) => {
    const creds = await gatewayOf(req);
    const inv = await Invoice.findOne({ _id: oid(req.body?.invoiceId), instituteId: req.user.instituteId });
    if (!inv || !req.user.studentIds.some((s) => String(s) === String(inv.studentId))) throw new HttpError(404, 'Invoice not found');
    const due = inv.amount - inv.paidAmount;
    if (due <= 0) throw new HttpError(400, 'This installment is already paid');
    const order = await createOrder(creds, due, `inv_${String(inv._id).slice(-12)}_${Date.now().toString(36)}`, {
      invoiceId: String(inv._id), instituteId: String(inv.instituteId), studentId: String(inv.studentId),
    });
    const [student, me] = await Promise.all([
      Student.findById(inv.studentId).select('name').lean(),
      User.findById(req.user.id).select('name email phone').lean(),
    ]);
    res.json({
      keyId: creds.keyId, orderId: order.id, amount: order.amount, currency: order.currency,
      name: req.institute!.name, description: `${inv.title} — ${student?.name ?? ''}`,
      prefill: { name: me?.name, email: me?.email, contact: me?.phone },
      color: req.institute!.brandColor,
    });
  }),
);

r.post(
  '/pay/verify',
  requireFeature('onlinePayments'),
  ah(async (req, res) => {
    const creds = await gatewayOf(req);
    const orderId = str(req.body?.razorpay_order_id);
    const paymentId = str(req.body?.razorpay_payment_id);
    const signature = str(req.body?.razorpay_signature);
    if (!orderId || !paymentId || !signature || !verifySignature(creds, orderId, paymentId, signature)) throw new HttpError(400, 'Payment could not be verified');
    // Same payment reported twice (double click / retry) → return the existing receipt.
    const existing = await Payment.findOne({ instituteId: req.user.instituteId, reference: paymentId }).lean();
    if (existing) return res.json({ ok: true, payment: existing });
    const order = await fetchOrder(creds, orderId);
    const invoiceId = order.notes?.invoiceId;
    if (!invoiceId || order.notes?.instituteId !== String(req.user.instituteId)) throw new HttpError(400, 'Payment does not match this account');
    const inv = await Invoice.findOne({ _id: oid(invoiceId), instituteId: req.user.instituteId });
    if (!inv || !req.user.studentIds.some((s) => String(s) === String(inv.studentId))) throw new HttpError(404, 'Invoice not found');
    const paid = Math.round(order.amount / 100);
    const due = inv.amount - inv.paidAmount;
    if (due <= 0) throw new HttpError(409, `This installment was already paid. Payment ${paymentId} will be refunded by the institute — please share this ID with them.`);
    const payment = await recordPayment({
      institute: req.institute!, invoiceId: inv._id, amount: Math.min(paid, due), method: 'online', reference: paymentId,
      note: `Razorpay ${orderId}${paid > due ? ` (₹${paid - due} extra received — refund or adjust)` : ''}`,
    });
    res.json({ ok: true, payment });
  }),
);

export default r;
