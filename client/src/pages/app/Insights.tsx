import {
  AlertTriangle, BookOpen, Check, Copy, FileText, Lock, RefreshCw, Sparkles, TrendingDown, TrendingUp, UserCheck, Users,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { PremiumCard } from '../../components/Upgrade';
import {
  Avatar, Badge, Button, Card, CardHeader, EmptyState, ErrorState, PageHeader, PageLoader, Progress, Select, Spinner, clsx,
} from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../hooks/useApi';
import { api, errMsg } from '../../lib/api';
import { fmtDateTime, pctTone } from '../../lib/format';
import type { Student } from '../../lib/types';

interface InsightsData {
  generatedAt: string;
  engine: string;
  headline: string[];
  atRisk: { studentId: string; name: string; studentCode: string; reasons: string[]; risk: number }[];
  weakTopics: { testId: string; subject: string; topic: string; batch?: string; avg: number; below40: number }[];
  improving: { name: string; delta: number; last: number; before: number }[];
  declining: { name: string; delta: number; last: number; before: number }[];
  teacherInsights: { batch: string; teacher: string; attendance: number | null; score: number | null; students: number }[];
}
interface StudentReport { student: { name: string; studentCode: string }; summary: string; subjects: { subject: string; avg: number }[] }

export default function Insights() {
  const { hasFeature } = useAuth();
  if (!hasFeature('aiInsights')) return <LockedInsights />;
  return <InsightsView />;
}

/* ------------------------------------------------------------------ */

function LockedInsights() {
  const fakeRisk = [
    { name: 'Rohan Mehta', risk: 82, reasons: ['Attendance 58%', 'Avg score 38%'] },
    { name: 'Sneha Gupta', risk: 64, reasons: ['Avg score 41%', '₹8,000 overdue'] },
    { name: 'Karan Singh', risk: 47, reasons: ['Attendance 69%'] },
  ];
  return (
    <div>
      <PageHeader title={<span className="flex items-center gap-2">AI Insights <Badge tone="violet">Premium</Badge></span>} subtitle="Know which students need attention before it's too late" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="relative lg:col-span-2">
          <div className="pointer-events-none select-none space-y-4 blur-[3px]" aria-hidden>
            <div className="rounded-3xl bg-gradient-to-br from-brand-600 via-violet-600 to-fuchsia-600 p-6 text-white">
              <p className="flex items-center gap-2 text-sm font-bold"><Sparkles className="h-4 w-4" /> AI summary</p>
              <ul className="mt-3 space-y-2 text-sm">
                <li>• 7 students need attention this week.</li>
                <li>• Weakest topic: Trigonometry (Class 10 Maths — A) at 42% average.</li>
                <li>• Priya improved by 18 points in the latest test.</li>
              </ul>
            </div>
            <div className="card card-pad">
              <p className="mb-4 font-bold text-slate-900">At-risk students</p>
              {fakeRisk.map((r) => (
                <div key={r.name} className="flex items-center gap-3 border-b border-slate-100 py-3 last:border-0">
                  <Avatar name={r.name} size="sm" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{r.name}</p>
                    <div className="mt-1 flex gap-1">{r.reasons.map((x) => <Badge key={x} tone="red">{x}</Badge>)}</div>
                  </div>
                  <div className="w-24"><Progress value={r.risk} /></div>
                </div>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="card card-pad"><p className="font-bold">Improving 📈</p><p className="mt-2 text-sm">Priya Nair +18 · Arjun Rao +12</p></div>
              <div className="card card-pad"><p className="font-bold">Declining 📉</p><p className="mt-2 text-sm">Dev Patel −14 · Isha Jain −9</p></div>
            </div>
          </div>
          <div className="absolute inset-0 grid place-items-center rounded-3xl bg-gradient-to-b from-white/40 via-white/70 to-white/90 p-4">
            <div className="max-w-md rounded-3xl border border-violet-100 bg-white/95 p-7 text-center shadow-2xl">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-600 to-fuchsia-600 text-white shadow-glow">
                <Lock className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-xl font-extrabold text-slate-900">AI Student Insights</h3>
              <p className="mt-2 text-sm text-slate-500">
                Automatically spot at-risk students, weak topics, improving and declining performers — plus one-click parent progress reports ready for WhatsApp.
              </p>
              <Link to="/app/subscription" className="btn-premium mt-5"><Sparkles className="h-4 w-4" /> Unlock with Premium</Link>
            </div>
          </div>
        </div>
        <PremiumCard />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function riskTone(r: number) {
  return r >= 60 ? { bar: 'bg-rose-500', text: 'text-rose-600', label: 'High' } : r >= 35 ? { bar: 'bg-amber-500', text: 'text-amber-600', label: 'Medium' } : { bar: 'bg-sky-500', text: 'text-sky-600', label: 'Low' };
}

function InsightsView() {
  const { data, loading, error, reload } = useApi<InsightsData>('/insights');
  if (loading && !data) return <PageLoader />;
  if (error || !data) return <ErrorState message={error ?? 'Could not load insights'} onRetry={reload} />;

  return (
    <div>
      <PageHeader
        title={<span className="flex items-center gap-2">AI Insights <Badge tone="violet">Premium</Badge></span>}
        subtitle="Actionable signals from attendance, tests and fees"
        actions={<Button variant="secondary" icon={<RefreshCw className={clsx('h-4 w-4', loading && 'animate-spin')} />} onClick={reload}>Refresh</Button>}
      />

      {/* Hero */}
      <div className="relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-violet-600 to-fuchsia-600 p-6 text-white shadow-glow sm:p-8">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-fuchsia-300/20 blur-2xl" />
        <div className="relative">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-amber-200"><Sparkles className="h-4 w-4" /> AI summary</p>
            <p className="text-xs text-white/70">Generated {fmtDateTime(data.generatedAt)}</p>
          </div>
          <ul className="mt-4 space-y-3">
            {data.headline.map((h, i) => (
              <li key={i} className="flex items-start gap-3 text-base font-semibold sm:text-lg">
                <span className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/15 text-xs">{i + 1}</span>
                {h}
              </li>
            ))}
          </ul>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { l: 'At risk', v: data.atRisk.length },
              { l: 'Weak topics', v: data.weakTopics.length },
              { l: 'Improving', v: data.improving.length },
              { l: 'Declining', v: data.declining.length },
            ].map((x) => (
              <div key={x.l} className="rounded-2xl bg-white/10 px-4 py-3 backdrop-blur">
                <p className="text-2xl font-extrabold">{x.v}</p>
                <p className="text-xs text-white/75">{x.l}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* At-risk */}
        <Card className="lg:col-span-3">
          <CardHeader title="At-risk students" subtitle="Ranked by combined risk score" icon={<AlertTriangle className="h-4 w-4" />} />
          {data.atRisk.length === 0 ? (
            <EmptyState icon={<span className="text-2xl">🎉</span>} title="No students at risk" text="Attendance, scores and fees all look healthy." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.atRisk.map((s) => {
                const t = riskTone(s.risk);
                return (
                  <li key={s.studentId} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
                    <Link to={`/app/students/${s.studentId}`} className="flex min-w-0 flex-1 items-center gap-3">
                      <Avatar name={s.name} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-800 hover:text-brand-600">{s.name}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {s.reasons.map((r) => <Badge key={r} tone={r.includes('overdue') ? 'amber' : 'red'}>{r}</Badge>)}
                        </div>
                      </div>
                    </Link>
                    <div className="w-full sm:w-36">
                      <div className="mb-1 flex justify-between text-xs">
                        <span className={clsx('font-semibold', t.text)}>{t.label} risk</span>
                        <b className="text-slate-700">{s.risk}</b>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className={clsx('h-full rounded-full', t.bar)} style={{ width: `${s.risk}%` }} />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Weak topics */}
        <Card className="lg:col-span-2">
          <CardHeader title="Weak topics" subtitle="Tests averaging below 65%" icon={<BookOpen className="h-4 w-4" />} />
          {data.weakTopics.length === 0 ? <EmptyState title="No weak topics" text="All tests are averaging 65% or above." /> : (
            <ul className="space-y-3">
              {data.weakTopics.map((w) => (
                <li key={w.testId} className="rounded-xl border border-slate-100 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">{w.topic}</p>
                      <p className="truncate text-xs text-slate-400">{w.subject} · {w.batch ?? '—'}</p>
                    </div>
                    <span className={clsx('text-lg font-extrabold', pctTone(w.avg))}>{w.avg}%</span>
                  </div>
                  <Progress value={w.avg} className="mt-2 h-1.5" />
                  {w.below40 > 0 && <p className="mt-1.5 text-xs text-rose-600">{w.below40} student{w.below40 > 1 ? 's' : ''} scored below 40%</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <TrendCard title="Improving 📈" items={data.improving} up />
        <TrendCard title="Declining 📉" items={data.declining} />

        {/* Teacher/batch insights */}
        <Card pad={false} className="lg:col-span-5">
          <div className="p-5 pb-0 sm:p-6 sm:pb-0"><CardHeader title="Teacher & batch insights" icon={<UserCheck className="h-4 w-4" />} /></div>
          <div className="table-wrap scrollbar-thin">
            <table className="table">
              <thead><tr><th>Batch</th><th>Teacher</th><th className="!text-right">Students</th><th>Avg attendance</th><th>Avg score</th><th>Signal</th></tr></thead>
              <tbody>
                {data.teacherInsights.map((t) => {
                  const signal = t.attendance != null && t.attendance < 75 ? { tone: 'red' as const, l: 'Low attendance' }
                    : t.score != null && t.score < 55 ? { tone: 'amber' as const, l: 'Scores need work' }
                    : t.score != null && t.score >= 75 && (t.attendance ?? 0) >= 85 ? { tone: 'green' as const, l: 'Performing well' }
                    : { tone: 'gray' as const, l: 'Steady' };
                  return (
                    <tr key={t.batch}>
                      <td className="font-semibold text-slate-800">{t.batch}</td>
                      <td className="text-slate-600">{t.teacher}</td>
                      <td className="text-right">{t.students}</td>
                      <td>{t.attendance != null ? <div className="flex items-center gap-2"><Progress value={t.attendance} className="h-1.5 w-16" /><b className={pctTone(t.attendance)}>{t.attendance}%</b></div> : '—'}</td>
                      <td>{t.score != null ? <b className={pctTone(t.score)}>{t.score}%</b> : '—'}</td>
                      <td><Badge tone={signal.tone}>{signal.l}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <ParentReportGenerator />

      <p className="mt-6 text-center text-xs text-slate-400">
        Engine: <code className="rounded bg-slate-100 px-1.5 py-0.5">{data.engine}</code> · deterministic rule engine, LLM-ready for richer narratives.
      </p>
    </div>
  );
}

function TrendCard({ title, items, up }: { title: string; items: InsightsData['improving']; up?: boolean }) {
  return (
    <Card className={clsx(up ? 'lg:col-span-3' : 'lg:col-span-2')}>
      <CardHeader title={title} subtitle="Latest test vs. earlier average" icon={up ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />} />
      {items.length === 0 ? <p className="py-6 text-center text-sm text-slate-400">No significant {up ? 'improvements' : 'declines'} yet.</p> : (
        <ul className="space-y-2.5">
          {items.map((x) => (
            <li key={x.name} className="flex items-center gap-3">
              <Avatar name={x.name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800">{x.name}</p>
                <p className="text-xs text-slate-400">{x.before}% → {x.last}%</p>
              </div>
              <span className={clsx('rounded-full px-2.5 py-1 text-xs font-bold', up ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700')}>
                {x.delta > 0 ? '+' : ''}{x.delta} pts
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function ParentReportGenerator() {
  const { data: students } = useApi<Student[]>('/students', { status: 'active' });
  const [id, setId] = useState('');
  const [report, setReport] = useState<StudentReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const generate = async (sid: string) => {
    setId(sid);
    setReport(null);
    if (!sid) return;
    setBusy(true);
    try {
      const { data } = await api.get<StudentReport>(`/insights/student/${sid}`);
      setReport(data);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const text = report ? `Progress report — ${report.student.name} (${report.student.studentCode})\n\n${report.summary}` : '';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Copied — paste it in WhatsApp');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy to clipboard');
    }
  };

  return (
    <Card className="mt-6">
      <CardHeader title="Generate parent report" subtitle="A friendly progress summary you can share on WhatsApp" icon={<FileText className="h-4 w-4" />} />
      <div className="grid gap-5 lg:grid-cols-3">
        <div>
          <Select label="Student" value={id} onChange={(e) => generate(e.target.value)}>
            <option value="">Select a student…</option>
            {(students ?? []).map((s) => <option key={s._id} value={s._id}>{s.name} · {s.studentCode}</option>)}
          </Select>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400"><Users className="h-3.5 w-3.5" /> {students?.length ?? 0} active students</p>
        </div>
        <div className="lg:col-span-2">
          {busy ? (
            <div className="grid h-36 place-items-center rounded-2xl bg-slate-50"><Spinner /></div>
          ) : report ? (
            <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-slate-800">{report.student.name}</p>
                <Button size="sm" variant={copied ? 'success' : 'secondary'} icon={copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} onClick={copy}>
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
              <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{report.summary}</p>
              {report.subjects.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {report.subjects.map((s) => <Badge key={s.subject} tone={s.avg >= 75 ? 'green' : s.avg >= 50 ? 'amber' : 'red'}>{s.subject} {s.avg}%</Badge>)}
                </div>
              )}
            </div>
          ) : (
            <div className="grid h-36 place-items-center rounded-2xl border border-dashed border-slate-200 text-sm text-slate-400">
              Pick a student to generate their report
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
