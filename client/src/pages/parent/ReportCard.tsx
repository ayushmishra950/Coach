import { ArrowLeft, Printer } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, ErrorState, PageLoader, clsx } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import { fmtDate } from '../../lib/format';

interface Card {
  student: { name: string; studentCode: string; course?: string; parentName?: string };
  institute: { name: string; phone?: string; address?: string; city?: string; logoText?: string; brandColor?: string };
  overall: number | null;
  attendance: { total: number; present: number; pct: number | null };
  subjects: { subject: string; tests: number; avg: number; best: number }[];
  tests: { _id: string; subject: string; topic?: string; date: string; maxMarks: number; marks: number | null; absent: boolean; pct: number | null; classAvgPct: number | null; highest: number | null; rank: number | null; outOf: number; passPercent: number }[];
  generatedAt: string;
}

const grade = (p: number | null) => (p == null ? '—' : p >= 90 ? 'A+' : p >= 80 ? 'A' : p >= 70 ? 'B+' : p >= 60 ? 'B' : p >= 50 ? 'C' : p >= 40 ? 'D' : 'E');
const tone = (p: number | null) => (p == null ? 'text-slate-400' : p >= 75 ? 'text-emerald-700' : p >= 40 ? 'text-amber-700' : 'text-rose-700');

/** Printable report card: subject-wise averages, every test with rank and class average, attendance. */
export default function ReportCard() {
  const [params] = useSearchParams();
  const studentId = params.get('student') ?? '';
  const { data, error } = useApi<Card>(studentId ? '/parent/report-card' : null, { studentId });
  if (error) return <div className="p-6"><ErrorState message={error} /></div>;
  if (!data) return <PageLoader />;
  const color = data.institute.brandColor || '#6366f1';

  return (
    <div className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-3xl items-center justify-between px-4 print:hidden">
        <Link to={`/portal?student=${studentId}#results`} className="btn-secondary btn-sm"><ArrowLeft className="h-4 w-4" />Back</Link>
        <Button size="sm" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>Print / Save as PDF</Button>
      </div>
      <article className="mx-auto max-w-3xl bg-white p-8 shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-center gap-4 border-b-2 pb-4" style={{ borderColor: color }}>
          <div className="grid h-14 w-14 place-items-center rounded-xl text-lg font-extrabold text-white" style={{ background: color }}>{data.institute.logoText || data.institute.name.slice(0, 2).toUpperCase()}</div>
          <div className="flex-1">
            <h1 className="text-xl font-extrabold text-slate-900">{data.institute.name}</h1>
            <p className="text-xs text-slate-500">{[data.institute.address, data.institute.city, data.institute.phone].filter(Boolean).join(' · ')}</p>
          </div>
          <p className="text-right text-sm font-bold uppercase tracking-wider text-slate-500">Progress<br />Report</p>
        </header>

        <section className="mt-5 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <p><span className="text-slate-500">Student:</span> <b>{data.student.name}</b></p>
          <p><span className="text-slate-500">Student ID:</span> {data.student.studentCode}</p>
          {data.student.course && <p><span className="text-slate-500">Course:</span> {data.student.course}</p>}
          {data.student.parentName && <p><span className="text-slate-500">Parent:</span> {data.student.parentName}</p>}
          <p><span className="text-slate-500">Date:</span> {fmtDate(data.generatedAt)}</p>
        </section>

        <section className="mt-5 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-xl border border-slate-200 p-3"><p className="text-xs text-slate-500">Overall</p><p className={clsx('text-2xl font-extrabold', tone(data.overall))}>{data.overall != null ? `${data.overall}%` : '—'}</p></div>
          <div className="rounded-xl border border-slate-200 p-3"><p className="text-xs text-slate-500">Grade</p><p className={clsx('text-2xl font-extrabold', tone(data.overall))}>{grade(data.overall)}</p></div>
          <div className="rounded-xl border border-slate-200 p-3"><p className="text-xs text-slate-500">Attendance</p><p className={clsx('text-2xl font-extrabold', tone(data.attendance.pct))}>{data.attendance.pct != null ? `${data.attendance.pct}%` : '—'}</p><p className="text-[11px] text-slate-400">{data.attendance.present}/{data.attendance.total} classes</p></div>
        </section>

        {data.subjects.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Subject-wise</h2>
            <table className="w-full border-collapse text-sm">
              <thead><tr className="bg-slate-50 text-left text-xs text-slate-500"><th className="border border-slate-200 px-3 py-2">Subject</th><th className="border border-slate-200 px-3 py-2 text-center">Tests</th><th className="border border-slate-200 px-3 py-2 text-center">Average</th><th className="border border-slate-200 px-3 py-2 text-center">Best</th><th className="border border-slate-200 px-3 py-2 text-center">Grade</th></tr></thead>
              <tbody>
                {data.subjects.map((s) => (
                  <tr key={s.subject}>
                    <td className="border border-slate-200 px-3 py-2 font-semibold">{s.subject}</td>
                    <td className="border border-slate-200 px-3 py-2 text-center">{s.tests}</td>
                    <td className={clsx('border border-slate-200 px-3 py-2 text-center font-bold', tone(s.avg))}>{s.avg}%</td>
                    <td className="border border-slate-200 px-3 py-2 text-center">{s.best}%</td>
                    <td className="border border-slate-200 px-3 py-2 text-center font-bold">{grade(s.avg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 space-y-1.5 print:hidden">
              {data.subjects.map((s) => (
                <div key={s.subject} className="flex items-center gap-2 text-xs">
                  <span className="w-28 truncate text-slate-600">{s.subject}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${s.avg}%`, background: color }} /></div>
                  <span className="w-10 text-right font-bold">{s.avg}%</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="mt-6">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">All tests</h2>
          {data.tests.length === 0 ? <p className="text-sm text-slate-400">No published results yet.</p> : (
            <table className="w-full border-collapse text-xs">
              <thead><tr className="bg-slate-50 text-left text-slate-500"><th className="border border-slate-200 px-2 py-1.5">Date</th><th className="border border-slate-200 px-2 py-1.5">Test</th><th className="border border-slate-200 px-2 py-1.5 text-center">Marks</th><th className="border border-slate-200 px-2 py-1.5 text-center">%</th><th className="border border-slate-200 px-2 py-1.5 text-center">Class avg</th><th className="border border-slate-200 px-2 py-1.5 text-center">Highest</th><th className="border border-slate-200 px-2 py-1.5 text-center">Rank</th></tr></thead>
              <tbody>
                {data.tests.map((t) => (
                  <tr key={t._id}>
                    <td className="border border-slate-200 px-2 py-1.5 whitespace-nowrap">{fmtDate(t.date, { day: 'numeric', month: 'short', year: '2-digit' })}</td>
                    <td className="border border-slate-200 px-2 py-1.5">{t.subject}{t.topic ? ` — ${t.topic}` : ''}</td>
                    <td className="border border-slate-200 px-2 py-1.5 text-center">{t.absent ? 'Absent' : `${t.marks}/${t.maxMarks}`}</td>
                    <td className={clsx('border border-slate-200 px-2 py-1.5 text-center font-bold', tone(t.pct))}>{t.pct != null ? `${t.pct}%` : '—'}</td>
                    <td className="border border-slate-200 px-2 py-1.5 text-center">{t.classAvgPct != null ? `${t.classAvgPct}%` : '—'}</td>
                    <td className="border border-slate-200 px-2 py-1.5 text-center">{t.highest ?? '—'}</td>
                    <td className="border border-slate-200 px-2 py-1.5 text-center font-semibold">{t.rank ? `${t.rank}/${t.outOf}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <footer className="mt-10 flex justify-between text-xs text-slate-400"><span>Computer-generated report · {data.institute.name}</span><span>Signature: ________________</span></footer>
      </article>
    </div>
  );
}
