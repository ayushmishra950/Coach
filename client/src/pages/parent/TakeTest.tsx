import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, Send, Timer, XCircle } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Button, ConfirmDialog, ErrorState, PageLoader, clsx } from '../../components/ui';
import { api, errMsg } from '../../lib/api';

interface StartResp {
  test: { _id: string; subject: string; topic?: string; maxMarks: number; wrongPenalty: number };
  questions: { _id: string; text: string; options: string[]; marks: number }[];
  answers: (number | null)[];
  deadline: string;
  serverTime: string;
}
interface ReviewResp {
  test: { subject: string; topic?: string; maxMarks: number };
  score: number; correct: number; wrong: number;
  questions: { text: string; options: string[]; marks: number; yourAnswer: number | null; correct?: number; explanation?: string }[];
}

/** Student takes an online MCQ test (from the parent login), or reviews it after results are published. */
export default function TakeTest() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const studentId = params.get('student') ?? '';
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Link to={`/portal?student=${studentId}#online-tests`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Back"><ArrowLeft className="h-5 w-5" /></Link>
          <p className="font-bold text-slate-900">Online test</p>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">
        {params.get('review') ? <Review id={id!} studentId={studentId} /> : <Attempt id={id!} studentId={studentId} />}
      </main>
    </div>
  );
}

function Attempt({ id, studentId }: { id: string; studentId: string }) {
  const [data, setData] = useState<StartResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [idx, setIdx] = useState(0);
  const [left, setLeft] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ answered: number; total: number } | null>(null);
  const offset = useRef(0);
  const autoSent = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<(number | null)[]>([]);
  latest.current = answers;

  useEffect(() => {
    api.post<StartResp>(`/parent/online-tests/${id}/start`, { studentId })
      .then(({ data }) => {
        offset.current = new Date(data.serverTime).getTime() - Date.now();
        setData(data);
        setAnswers(data.answers.length ? data.answers : data.questions.map(() => null));
      })
      .catch((e) => setError(errMsg(e)));
  }, [id, studentId]);

  const submit = useCallback(async (auto = false) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSubmitting(true);
    try {
      const { data: r } = await api.post<{ answered: number; total: number }>(`/parent/online-tests/${id}/submit`, { studentId, answers: latest.current });
      setDone(r);
      if (auto) toast('Time is up — your test was submitted', { icon: '⏰' });
    } catch (e) {
      toast.error(errMsg(e));
      if ((e as { response?: { status?: number } })?.response?.status === 409) setDone({ answered: latest.current.filter((x) => x != null).length, total: latest.current.length });
    } finally {
      setSubmitting(false);
      setConfirm(false);
    }
  }, [id, studentId]);

  // Countdown from the server deadline; auto-submit at zero.
  useEffect(() => {
    if (!data || done) return;
    const tick = () => {
      const ms = new Date(data.deadline).getTime() - (Date.now() + offset.current);
      setLeft(Math.max(0, Math.floor(ms / 1000)));
      if (ms <= 0 && !autoSent.current) {
        autoSent.current = true;
        submit(true);
      }
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [data, done, submit]);

  const choose = (q: number, opt: number) => {
    const next = answers.map((a, i) => (i === q ? (a === opt ? null : opt) : a));
    setAnswers(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      api.put(`/parent/online-tests/${id}/answers`, { studentId, answers: next }).catch(() => undefined);
    }, 800);
  };

  if (error) return <ErrorState message={error} />;
  if (!data) return <PageLoader />;
  if (done) {
    return (
      <div className="card card-pad text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-emerald-600"><CheckCircle2 className="h-9 w-9" /></div>
        <h2 className="mt-4 text-xl font-extrabold text-slate-900">Test submitted ✓</h2>
        <p className="mt-1 text-sm text-slate-500">You answered {done.answered} of {done.total} questions. Your score will show once the teacher publishes the results.</p>
        <Link to={`/portal?student=${studentId}#online-tests`} className="btn-primary mt-6 inline-flex">Back to portal</Link>
      </div>
    );
  }

  const q = data.questions[idx];
  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  const answered = answers.filter((a) => a != null).length;

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-extrabold text-slate-900">{data.test.subject}{data.test.topic ? ` · ${data.test.topic}` : ''}</h1>
          <p className="text-xs text-slate-500">{data.questions.length} questions · {data.test.maxMarks} marks{data.test.wrongPenalty ? ` · −${data.test.wrongPenalty} for each wrong answer` : ''}</p>
        </div>
        <div className={clsx('flex items-center gap-1.5 rounded-xl px-3 py-2 font-mono text-lg font-bold', left < 60 ? 'bg-rose-100 text-rose-700' : left < 300 ? 'bg-amber-100 text-amber-700' : 'bg-white text-slate-800 ring-1 ring-slate-200')}>
          <Timer className="h-5 w-5" />{mm}:{ss}
        </div>
      </div>

      <div className="card card-pad">
        <p className="text-xs font-semibold text-slate-400">Question {idx + 1} of {data.questions.length} · {q.marks} mark{q.marks === 1 ? '' : 's'}</p>
        <p className="mt-2 whitespace-pre-line text-base font-semibold text-slate-900">{q.text}</p>
        <div className="mt-4 space-y-2">
          {q.options.map((o, k) => (
            <button key={k} onClick={() => choose(idx, k)}
              className={clsx('flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition', answers[idx] === k ? 'border-brand-500 bg-brand-50 font-semibold text-brand-800' : 'border-slate-200 hover:border-brand-300')}>
              <span className={clsx('grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold', answers[idx] === k ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500')}>{String.fromCharCode(65 + k)}</span>
              {o}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-400">Tap again to clear your answer. Answers save automatically.</p>
        <div className="mt-5 flex items-center justify-between">
          <Button variant="secondary" disabled={idx === 0} icon={<ChevronLeft className="h-4 w-4" />} onClick={() => setIdx(idx - 1)}>Previous</Button>
          {idx < data.questions.length - 1
            ? <Button onClick={() => setIdx(idx + 1)}>Next <ChevronRight className="h-4 w-4" /></Button>
            : <Button variant="success" icon={<Send className="h-4 w-4" />} onClick={() => setConfirm(true)}>Submit</Button>}
        </div>
      </div>

      <div className="card card-pad mt-4">
        <p className="mb-2 text-xs font-semibold text-slate-500">{answered} of {data.questions.length} answered</p>
        <div className="flex flex-wrap gap-1.5">
          {data.questions.map((_, i) => (
            <button key={i} onClick={() => setIdx(i)} className={clsx('h-9 w-9 rounded-lg text-sm font-bold', i === idx ? 'ring-2 ring-brand-500' : '', answers[i] != null ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500')}>{i + 1}</button>
          ))}
        </div>
        <Button className="mt-4 w-full" variant="success" icon={<Send className="h-4 w-4" />} onClick={() => setConfirm(true)}>Submit test</Button>
      </div>

      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={() => submit()} loading={submitting} title="Submit the test?" confirmLabel="Submit"
        text={answered < data.questions.length ? `${data.questions.length - answered} question(s) are not answered. You can't change answers after submitting.` : "You can't change answers after submitting."} />
    </>
  );
}

function Review({ id, studentId }: { id: string; studentId: string }) {
  const [data, setData] = useState<ReviewResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.get<ReviewResp>(`/parent/online-tests/${id}/review`, { params: { studentId } }).then(({ data }) => setData(data)).catch((e) => setError(errMsg(e)));
  }, [id, studentId]);
  if (error) return <ErrorState message={error} />;
  if (!data) return <PageLoader />;
  return (
    <>
      <div className="card card-pad mb-4 text-center">
        <p className="text-sm text-slate-500">{data.test.subject}{data.test.topic ? ` · ${data.test.topic}` : ''}</p>
        <p className="mt-1 text-4xl font-extrabold text-slate-900">{data.score}<span className="text-xl text-slate-400"> / {data.test.maxMarks}</span></p>
        <p className="mt-1 text-sm"><span className="font-semibold text-emerald-600">✓ {data.correct} correct</span> · <span className="font-semibold text-rose-600">✗ {data.wrong} wrong</span> · {data.questions.length - data.correct - data.wrong} skipped</p>
      </div>
      <ol className="space-y-3">
        {data.questions.map((q, i) => {
          const right = q.correct != null && q.yourAnswer === q.correct;
          return (
            <li key={i} className="card card-pad">
              <p className="flex items-start gap-2 text-sm font-semibold text-slate-900">
                {q.correct == null ? null : right ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /> : <XCircle className="h-5 w-5 shrink-0 text-rose-500" />}
                <span>{i + 1}. {q.text}</span>
              </p>
              <ul className="mt-2 space-y-1">
                {q.options.map((o, k) => (
                  <li key={k} className={clsx('rounded-lg px-3 py-1.5 text-sm', k === q.correct ? 'bg-emerald-50 font-semibold text-emerald-800' : k === q.yourAnswer ? 'bg-rose-50 text-rose-700' : 'text-slate-600')}>
                    {String.fromCharCode(65 + k)}. {o}{k === q.yourAnswer && ' ← your answer'}{k === q.correct && ' ✓'}
                  </li>
                ))}
              </ul>
              {q.yourAnswer == null && <p className="mt-1 text-xs text-slate-400">Not answered</p>}
              {q.explanation && <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600"><b>Explanation:</b> {q.explanation}</p>}
            </li>
          );
        })}
      </ol>
    </>
  );
}
