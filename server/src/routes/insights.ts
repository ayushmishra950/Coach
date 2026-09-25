import { Router } from 'express';
import { allow, auth, requireFeature, tid } from '../middleware/auth.js';
import { Batch, Student, Test } from '../models/index.js';
import { inr } from '../services/payments.js';
import { attendanceByStudent, feesByStudent, scoresByStudent } from '../services/stats.js';
import { HttpError, ah, oid } from '../utils/http.js';

/**
 * AI Insights. Ships with a deterministic rule engine so it works offline; the
 * `summarise()` hook is where an LLM call can be plugged in to rewrite the
 * structured findings into richer narrative.
 */
const r = Router();
r.use(auth, allow('owner', 'teacher'), requireFeature('aiInsights'));

r.get(
  '/',
  ah(async (req, res) => {
    const instituteId = tid(req);
    const students = await Student.find({ instituteId, status: 'active' }).select('name studentCode batchIds').lean();
    const ids = students.map((s) => s._id);
    const [att, scores, fees, tests, batches] = await Promise.all([
      attendanceByStudent(instituteId, ids),
      scoresByStudent(instituteId, ids),
      feesByStudent(instituteId, ids),
      Test.find({ instituteId, status: { $ne: 'scheduled' } }).sort({ date: 1 }).lean(),
      Batch.find({ instituteId, active: true }).populate('teacherId', 'name').lean(),
    ]);

    // 1. At-risk students
    const atRisk = students
      .map((s) => {
        const a = att.get(String(s._id));
        const sc = scores.get(String(s._id));
        const reasons: string[] = [];
        let score = 0;
        if (a && a.total >= 4 && a.pct < 75) {
          reasons.push(`Attendance ${a.pct}%`);
          score += (75 - a.pct) * 1.2;
        }
        if (sc && sc.avg < 50) {
          reasons.push(`Avg score ${sc.avg}%`);
          score += (50 - sc.avg) * 1.5;
        }
        const f = fees.get(String(s._id));
        if (f && f.overdue > 0) {
          reasons.push(`${inr(f.overdue)} overdue`);
          score += 10;
        }
        return { studentId: s._id, name: s.name, studentCode: s.studentCode, reasons, risk: Math.min(100, Math.round(score)) };
      })
      .filter((x) => x.reasons.length >= 1 && x.risk >= 15)
      .sort((a, b) => b.risk - a.risk)
      .slice(0, 12);

    // 2. Weak topics
    const weakTopics = tests
      .map((t) => {
        const v = t.results.filter((x) => !x.absent && x.marks != null);
        const avg = v.length ? Math.round((v.reduce((s, x) => s + (x.marks as number), 0) / (v.length * t.maxMarks)) * 100) : null;
        const batch = batches.find((b) => String(b._id) === String(t.batchId));
        return { testId: t._id, subject: t.subject, topic: t.topic || t.subject, batch: batch?.name, avg, below40: v.filter((x) => ((x.marks as number) / t.maxMarks) * 100 < 40).length };
      })
      .filter((t) => t.avg != null && t.avg < 65)
      .sort((a, b) => (a.avg as number) - (b.avg as number))
      .slice(0, 8);

    // 3. Improving / declining students (last test vs their earlier average)
    const trend: { name: string; delta: number; last: number; before: number }[] = [];
    for (const s of students) {
      const series = tests
        .flatMap((t) => t.results.filter((x) => String(x.studentId) === String(s._id) && !x.absent && x.marks != null).map((x) => ((x.marks as number) / t.maxMarks) * 100))
        .filter((x) => !Number.isNaN(x));
      if (series.length < 3) continue;
      const last = series[series.length - 1];
      const before = series.slice(0, -1).reduce((a, b) => a + b, 0) / (series.length - 1);
      trend.push({ name: s.name, delta: Math.round(last - before), last: Math.round(last), before: Math.round(before) });
    }
    const improving = trend.filter((x) => x.delta >= 8).sort((a, b) => b.delta - a.delta).slice(0, 5);
    const declining = trend.filter((x) => x.delta <= -8).sort((a, b) => a.delta - b.delta).slice(0, 5);

    // 4. Teacher / batch insights
    const teacherInsights = batches.map((b) => {
      const members = students.filter((s) => s.batchIds.some((x) => String(x) === String(b._id)));
      const atts = members.map((m) => att.get(String(m._id))?.pct).filter((x): x is number => x != null);
      const scs = members.map((m) => scores.get(String(m._id))?.avg).filter((x): x is number => x != null);
      return {
        batch: b.name,
        teacher: (b.teacherId as unknown as { name?: string })?.name ?? 'Unassigned',
        attendance: atts.length ? Math.round(atts.reduce((a, c) => a + c, 0) / atts.length) : null,
        score: scs.length ? Math.round(scs.reduce((a, c) => a + c, 0) / scs.length) : null,
        students: members.length,
      };
    });

    const headline = [
      atRisk.length ? `${atRisk.length} students need attention this week.` : 'No students are currently at risk. 🎉',
      weakTopics[0] ? `Weakest topic: ${weakTopics[0].topic} (${weakTopics[0].batch}) at ${weakTopics[0].avg}% average.` : null,
      improving[0] ? `${improving[0].name} improved by ${improving[0].delta} points in the latest test.` : null,
    ].filter(Boolean);

    res.json({ generatedAt: new Date(), engine: 'rules-v1', headline, atRisk, weakTopics, improving, declining, teacherInsights });
  }),
);

/** Parent-friendly progress report for one student. */
r.get(
  '/student/:id',
  ah(async (req, res) => {
    const instituteId = tid(req);
    const s = await Student.findOne({ _id: oid(req.params.id), instituteId }).populate('batchIds', 'name').lean();
    if (!s) throw new HttpError(404, 'Student not found');
    const [att, sc, fees, tests] = await Promise.all([
      attendanceByStudent(instituteId, [s._id]),
      scoresByStudent(instituteId, [s._id]),
      feesByStudent(instituteId, [s._id]),
      Test.find({ instituteId, 'results.studentId': s._id, status: { $ne: 'scheduled' } }).lean(),
    ]);
    const a = att.get(String(s._id));
    const avg = sc.get(String(s._id))?.avg;
    const subj: Record<string, number[]> = {};
    for (const t of tests) {
      const x = t.results.find((y) => String(y.studentId) === String(s._id));
      if (x && !x.absent && x.marks != null) (subj[t.subject] ??= []).push((x.marks / t.maxMarks) * 100);
    }
    const ranked = Object.entries(subj).map(([k, v]) => ({ subject: k, avg: Math.round(v.reduce((a, b) => a + b, 0) / v.length) })).sort((x, y) => y.avg - x.avg);
    const first = s.name.split(' ')[0];
    const parts = [
      `${first} has attended ${a?.pct ?? 0}% of classes${a && a.pct >= 90 ? ', which is excellent' : a && a.pct < 75 ? ' — regular attendance needs improvement' : ''}.`,
      avg != null ? `Across ${sc.get(String(s._id))?.count} tests the average score is ${avg}%.` : 'No test results are available yet.',
      ranked[0] ? `Strongest subject: ${ranked[0].subject} (${ranked[0].avg}%).` : '',
      ranked.length > 1 ? `Needs more practice in ${ranked[ranked.length - 1].subject} (${ranked[ranked.length - 1].avg}%).` : '',
      fees.get(String(s._id))?.pending ? `Pending fees: ${inr(fees.get(String(s._id))!.pending)}.` : 'All fees are clear.',
    ].filter(Boolean);
    res.json({ student: { name: s.name, studentCode: s.studentCode }, summary: parts.join(' '), subjects: ranked });
  }),
);

export default r;
