import { CheckCircle2, Clock, Laptop, Plus, Save, Trash2, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useApi } from '../hooks/useApi';
import { api, errMsg } from '../lib/api';
import { fmtDateTime } from '../lib/format';
import { Badge, Button, Card, CardHeader, Input, Modal, Toggle, clsx } from './ui';

export interface OnlineTestData {
  _id: string; mode?: 'offline' | 'online'; maxMarks: number; status: string;
  questions?: { text: string; options: string[]; correct: number; marks?: number; explanation?: string }[];
  durationMins?: number; wrongPenalty?: number; opensAt?: string | null; closesAt?: string | null; showAnswers?: boolean;
}
interface Q { text: string; options: string[]; correct: number; marks: string; explanation: string }
interface Attempts {
  rows: { student: { _id: string; name: string; studentCode: string }; startedAt: string | null; submittedAt: string | null; score: number | null; correct: number | null; wrong: number | null }[];
  perQuestion: { correct: number; skipped: number }[];
  submitted: number;
}

const blank = (): Q => ({ text: '', options: ['', '', '', ''], correct: 0, marks: '1', explanation: '' });
const local = (d?: string | null) => {
  if (!d) return '';
  const x = new Date(d);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}T${p(x.getHours())}:${p(x.getMinutes())}`;
};

/** Teacher: build an objective (MCQ) test that students take online; see who attempted. */
export function OnlineTestCard({ test, onSaved }: { test: OnlineTestData; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const online = test.mode === 'online' && !!test.questions?.length;
  const attempts = useApi<Attempts>(online ? `/tests/${test._id}/attempts` : null);
  const a = attempts.data;

  return (
    <Card className="mb-6">
      <CardHeader title="Online test (MCQ)" icon={<Laptop className="h-5 w-5" />}
        subtitle={online
          ? `${test.questions!.length} questions · ${test.maxMarks} marks · ${test.durationMins} min${test.wrongPenalty ? ` · −${test.wrongPenalty} per wrong answer` : ''}`
          : 'Students can take this test in the parent portal. Scores fill the mark sheet automatically.'}
        action={<Button size="sm" variant={online ? 'secondary' : 'primary'} icon={online ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>{online ? 'Edit questions' : 'Create online test'}</Button>} />
      {online && (
        <>
          <div className="mb-3 flex flex-wrap gap-2 text-xs">
            <Badge tone="blue"><Clock className="h-3 w-3" />{test.opensAt ? `Opens ${fmtDateTime(test.opensAt)}` : 'Open now'}</Badge>
            {test.closesAt && <Badge tone="gray">Closes {fmtDateTime(test.closesAt)}</Badge>}
            <Badge tone="green"><Users className="h-3 w-3" />{a ? `${a.submitted}/${a.rows.length} submitted` : '…'}</Badge>
            {test.status !== 'published' && <Badge tone="amber">Publish results when everyone has finished</Badge>}
          </div>
          {a && a.rows.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {a.rows.map((r) => (
                <div key={r.student._id} className={clsx('flex items-center justify-between rounded-xl border px-3 py-2 text-sm', r.submittedAt ? 'border-emerald-200 bg-emerald-50/60' : r.startedAt ? 'border-amber-200 bg-amber-50/60' : 'border-slate-200')}>
                  <span className="truncate font-semibold text-slate-800">{r.student.name}</span>
                  <span className="shrink-0 text-xs font-bold">
                    {r.submittedAt ? <span className="text-emerald-700">{r.score}/{test.maxMarks} · ✓{r.correct} ✗{r.wrong}</span> : r.startedAt ? <span className="text-amber-700">In progress</span> : <span className="text-slate-400">Not started</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
          {a && a.submitted > 0 && (
            <div className="mt-4">
              <p className="label">Questions answered correctly</p>
              <div className="flex flex-wrap gap-1.5">
                {a.perQuestion.map((q, i) => {
                  const pct = Math.round((q.correct / a.submitted) * 100);
                  return <span key={i} title={`${q.correct} of ${a.submitted} correct, ${q.skipped} skipped`} className={clsx('rounded-lg px-2 py-1 text-xs font-bold', pct >= 70 ? 'bg-emerald-100 text-emerald-700' : pct >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700')}>Q{i + 1} · {pct}%</span>;
                })}
              </div>
            </div>
          )}
        </>
      )}
      <EditorModal open={open} onClose={() => setOpen(false)} test={test} onSaved={() => { onSaved(); attempts.reload(); }} />
    </Card>
  );
}

function EditorModal({ open, onClose, test, onSaved }: { open: boolean; onClose: () => void; test: OnlineTestData; onSaved: () => void }) {
  const [qs, setQs] = useState<Q[]>([blank()]);
  const [cfg, setCfg] = useState({ durationMins: '30', wrongPenalty: '0', opensAt: '', closesAt: '', showAnswers: true });
  const [saving, setSaving] = useState(false);
  const [bulk, setBulk] = useState('');

  useEffect(() => {
    if (!open) return;
    setQs(test.questions?.length ? test.questions.map((q) => ({ text: q.text, options: [...q.options, ...Array(Math.max(0, 4 - q.options.length)).fill('')], correct: q.correct, marks: String(q.marks ?? 1), explanation: q.explanation ?? '' })) : [blank()]);
    setCfg({ durationMins: String(test.durationMins ?? 30), wrongPenalty: String(test.wrongPenalty ?? 0), opensAt: local(test.opensAt), closesAt: local(test.closesAt), showAnswers: test.showAnswers !== false });
    setBulk('');
  }, [open, test]);

  const upd = (i: number, patch: Partial<Q>) => setQs((l) => l.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const total = qs.reduce((a, q) => a + (Number(q.marks) || 0), 0);

  /** Paste questions: blank line between questions; options start with A) B) …; mark the answer with * */
  const importBulk = () => {
    const blocks = bulk.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
    const parsed: Q[] = [];
    for (const b of blocks) {
      const lines = b.split('\n').map((l) => l.trim()).filter(Boolean);
      const text = lines[0]?.replace(/^(Q?\d+[.)]\s*)/i, '');
      const opts = lines.slice(1).filter((l) => /^\*?\s*[A-F][.)]/i.test(l));
      if (!text || opts.length < 2) continue;
      const correct = Math.max(0, opts.findIndex((o) => o.startsWith('*')));
      parsed.push({ text, options: opts.map((o) => o.replace(/^\*?\s*[A-F][.)]\s*/i, '')), correct, marks: '1', explanation: '' });
    }
    if (!parsed.length) return toast.error('No questions found. Check the format shown below the box.');
    setQs((l) => [...l.filter((q) => q.text.trim()), ...parsed]);
    setBulk('');
    toast.success(`Added ${parsed.length} question${parsed.length > 1 ? 's' : ''}`);
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/tests/${test._id}/online`, {
        questions: qs.map((q) => ({ text: q.text, options: q.options.filter((o) => o.trim()), correct: q.correct, marks: q.marks, explanation: q.explanation })),
        durationMins: cfg.durationMins, wrongPenalty: cfg.wrongPenalty, showAnswers: cfg.showAnswers,
        opensAt: cfg.opensAt ? new Date(cfg.opensAt).toISOString() : null, closesAt: cfg.closesAt ? new Date(cfg.closesAt).toISOString() : null,
      });
      toast.success('Online test saved');
      onSaved();
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="xl" title="Online test questions" subtitle={`${qs.length} questions · ${total} marks (max marks of the test become ${total})`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={saving} icon={<Save className="h-4 w-4" />}>Save test</Button></>}>
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-4">
          <Input label="Duration (min)" type="number" min={1} max={600} value={cfg.durationMins} onChange={(e) => setCfg({ ...cfg, durationMins: e.target.value })} />
          <Input label="Minus per wrong" type="number" min={0} step="0.25" value={cfg.wrongPenalty} onChange={(e) => setCfg({ ...cfg, wrongPenalty: e.target.value })} hint="0 = none" />
          <Input label="Opens at" type="datetime-local" value={cfg.opensAt} onChange={(e) => setCfg({ ...cfg, opensAt: e.target.value })} hint="Empty = now" />
          <Input label="Closes at" type="datetime-local" value={cfg.closesAt} onChange={(e) => setCfg({ ...cfg, closesAt: e.target.value })} hint="Empty = no limit" />
          <div className="sm:col-span-4"><Toggle checked={cfg.showAnswers} onChange={(v) => setCfg({ ...cfg, showAnswers: v })} label="Show correct answers after results are published" /></div>
        </div>

        {qs.map((q, i) => (
          <div key={i} className="rounded-2xl border border-slate-200 p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-50 text-xs font-bold text-brand-700">{i + 1}</span>
              <input className="input flex-1" placeholder="Question" value={q.text} onChange={(e) => upd(i, { text: e.target.value })} />
              <input className="input w-20" type="number" min={0.25} step="0.25" title="Marks" value={q.marks} onChange={(e) => upd(i, { marks: e.target.value })} />
              <button className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Remove question" onClick={() => setQs((l) => (l.length > 1 ? l.filter((_, j) => j !== i) : [blank()]))}><Trash2 className="h-4 w-4" /></button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {q.options.map((o, k) => (
                <label key={k} className={clsx('flex items-center gap-2 rounded-xl border px-2 py-1.5', q.correct === k ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200')}>
                  <input type="radio" name={`q${i}`} checked={q.correct === k} onChange={() => upd(i, { correct: k })} title="Correct answer" />
                  <span className="text-xs font-bold text-slate-400">{String.fromCharCode(65 + k)}</span>
                  <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder={`Option ${String.fromCharCode(65 + k)}`} value={o}
                    onChange={(e) => upd(i, { options: q.options.map((x, j) => (j === k ? e.target.value : x)) })} />
                  {q.correct === k && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                </label>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              {q.options.length < 6 && <button className="text-xs font-semibold text-brand-600 hover:underline" onClick={() => upd(i, { options: [...q.options, ''] })}>+ Option</button>}
              <input className="input flex-1 py-1.5 text-xs" placeholder="Explanation (optional, shown after results)" value={q.explanation} onChange={(e) => upd(i, { explanation: e.target.value })} />
            </div>
          </div>
        ))}
        <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setQs((l) => [...l, blank()])}>Add question</Button>

        <div className="rounded-2xl bg-slate-50 p-4">
          <p className="label">Paste many questions at once</p>
          <textarea className="input h-28 font-mono text-xs" value={bulk} onChange={(e) => setBulk(e.target.value)}
            placeholder={'1. What is the SI unit of force?\nA) Joule\n*B) Newton\nC) Watt\nD) Pascal\n\n2. Next question…'} />
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-xs text-slate-500">Leave a blank line between questions. Put <b>*</b> before the correct option.</p>
            <Button size="sm" variant="secondary" onClick={importBulk} disabled={!bulk.trim()}>Add these</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
