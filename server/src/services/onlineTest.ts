import { Types } from 'mongoose';
import { Test, TestAttempt } from '../models/index.js';
import { bumpData } from '../utils/cache.js';

type Q = { correct: number; marks?: number | null };
type TestLike = { _id: Types.ObjectId; questions: Q[]; wrongPenalty?: number | null; maxMarks: number; negativeMarking?: boolean | null };

/** Score for a set of answers (option index per question, null = skipped). */
export function grade(test: TestLike, answers: (number | null | undefined)[]) {
  let score = 0;
  let correct = 0;
  let wrong = 0;
  test.questions.forEach((q, i) => {
    const a = answers[i];
    if (a === null || a === undefined || a < 0) return;
    if (a === q.correct) {
      correct++;
      score += q.marks ?? 1;
    } else {
      wrong++;
      score -= test.wrongPenalty ?? 0;
    }
  });
  score = Math.round(score * 100) / 100;
  // Without negative marking on the test, the lowest score is 0.
  if (!test.negativeMarking) score = Math.max(0, score);
  score = Math.max(-test.maxMarks, Math.min(test.maxMarks, score));
  return { score, correct, wrong };
}

/** Writes a submitted attempt's score into the test's mark sheet (same place as hand-entered marks). */
export async function recordScore(testId: Types.ObjectId, studentId: Types.ObjectId, score: number) {
  const test = await Test.findById(testId);
  if (!test) return;
  const rest = test.results.filter((x) => String(x.studentId) !== String(studentId));
  test.set('results', [...rest, { studentId, marks: score, absent: false, remark: 'Online test' }]);
  if (test.status === 'scheduled') test.status = 'graded';
  await test.save();
  bumpData(test.instituteId);
}

/** Submits attempts whose time ran out without the student pressing Submit (saved answers count). */
export async function closeExpired(testIds: Types.ObjectId[]) {
  const now = new Date();
  const expired = await TestAttempt.find({ testId: { $in: testIds }, submittedAt: null, deadline: { $lt: new Date(now.getTime() - 60_000) } });
  for (const a of expired) {
    const test = await Test.findById(a.testId).select('questions wrongPenalty maxMarks negativeMarking').lean();
    if (!test) continue;
    const g = grade(test as unknown as TestLike, a.answers);
    a.set({ ...g, submittedAt: a.deadline });
    await a.save();
    await recordScore(a.testId, a.studentId, g.score);
  }
}

/** Open / upcoming / closed for an online test. */
export function windowState(t: { opensAt?: Date | null; closesAt?: Date | null }, now = new Date()) {
  if (t.opensAt && now < t.opensAt) return 'upcoming' as const;
  if (t.closesAt && now > t.closesAt) return 'closed' as const;
  return 'open' as const;
}
