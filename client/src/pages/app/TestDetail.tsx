import {
  ArrowLeft, Award, BarChart3, CalendarDays, CheckCircle2, HeartHandshake, Pencil, Save, Send, Target, Trash2, TrendingDown, TrendingUp, Users,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import toast from 'react-hot-toast';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  Avatar, Badge, Button, Card, CardHeader, ChartTooltip, ConfirmDialog, EmptyState, ErrorState, PageLoader, StatCard, StatusBadge, clsx,
} from '../../components/ui';
import { UpgradeCard } from '../../components/Upgrade';
import { useAuth } from '../../context/AuthContext';
import { useApi, useClientPage } from '../../hooks/useApi';
import { Pager } from '../../components/Pager';
import { api, errMsg } from '../../lib/api';
import { fmtDate } from '../../lib/format';
import type { Batch, BatchRef } from '../../lib/types';
import { TestFormModal } from './Tests';

interface Row { student: { _id: string; name: string; studentCode: string }; marks: number | null; absent: boolean; remark: string }
interface Stats { avg: number | null; highest: number | null; lowest: number | null; passRate: number | null; entered: number }
interface DetailResp {
  test: {
    _id: string; subject: string; topic?: string; maxMarks: number; date: string; status: 'scheduled' | 'graded' | 'published'; batch: BatchRef; publishedAt?: string;
    passPercent?: number; negativeMarking?: boolean;
  };
  rows: Row[];
  stats: Stats;
  analytics: { distribution: { range: string; count: number }[]; toppers: { name: string; marks: number }[]; needsHelp: { name: string; marks: number }[] } | null;
}
interface Draft { marks: string; absent: boolean; remark: string }

const DIST_COLORS = ['#f43f5e', '#f59e0b', '#0ea5e9', '#6366f1', '#10b981'];
const MEDALS = ['🥇', '🥈', '🥉'];

/** Score colour relative to this test's pass mark: below pass = red, comfortably above = green. */
const scoreTone = (p: number | null, pass: number) =>
  p == null ? 'text-slate-400' : p < pass ? 'text-rose-600' : p >= Math.max(75, pass + 20) ? 'text-emerald-600' : 'text-amber-600';

export default function TestDetail() {
  const isOwner = useAuth().session?.user.role === 'owner';
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, loading, error, status, reload } = useApi<DetailResp>(id ? `/tests/${id}` : null);
  const batches = useApi<Batch[]>('/batches/options');

  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  // The full roster stays in `data.rows` / `draft` (saving sends every row); only the table is paged.
  const rowPage = useClientPage(data?.rows, id);
  const pendingFocus = useRef<'first' | 'last' | null>(null);

  // After Enter/ArrowDown past the last row (or ArrowUp above the first), focus lands on the new page.
  useEffect(() => {
    const where = pendingFocus.current;
    if (!where) return;
    pendingFocus.current = null;
    const els = inputs.current.slice(0, rowPage.items.length);
    const order = where === 'first' ? els : [...els].reverse();
    const el = order.find((x) => x && !x.disabled);
    if (el) { el.focus(); el.select(); }
  }, [rowPage.pager.page]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!data) return;
    setDraft(Object.fromEntries(data.rows.map((r) => [r.student._id, { marks: r.marks == null ? '' : String(r.marks), absent: r.absent, remark: r.remark ?? '' }])));
    setDirty(false);
  }, [data]);

  const max = data?.test.maxMarks ?? 100;
  const min = data?.test.negativeMarking ? -max : 0;
  const passPct = data?.test.passPercent ?? 40;
  const invalid = (d?: Draft) => !!d && !d.absent && d.marks !== '' && (Number.isNaN(Number(d.marks)) || Number(d.marks) < min || Number(d.marks) > max);
  const invalidCount = useMemo(() => Object.values(draft).filter(invalid).length, [draft, max, min]); // eslint-disable-line react-hooks/exhaustive-deps

  // Warn before leaving with unsaved marks: browser close/reload, and in-app links.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      if (!window.confirm('You have unsaved marks. Leave this page and lose them?')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    // Browser Back: park a duplicate of the current history entry on top, so Back first lands on it
    // (same URL, same router state → nothing re-routes) and we can ask before really leaving.
    const GUARD = '__unsavedMarksGuard';
    const onPopState = () => {
      if (window.confirm('You have unsaved marks. Leave this page and lose them?')) {
        window.removeEventListener('popstate', onPopState);
        window.history.back();
      } else {
        window.history.pushState({ ...(window.history.state ?? {}), [GUARD]: true }, '', window.location.href);
      }
    };
    if (!(window.history.state as Record<string, unknown> | null)?.[GUARD]) {
      window.history.pushState({ ...(window.history.state ?? {}), [GUARD]: true }, '', window.location.href);
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('popstate', onPopState);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('popstate', onPopState);
      document.removeEventListener('click', onClick, true);
      // Saved (still on this page, top entry is our duplicate): drop it so Back needs one press again.
      if ((window.history.state as Record<string, unknown> | null)?.[GUARD]) window.history.back();
    };
  }, [dirty]);

  const live = useMemo(() => {
    const vals = Object.values(draft);
    const nums = vals.filter((d) => !d.absent && d.marks !== '' && !invalid(d)).map((d) => Number(d.marks));
    const entered = vals.filter((d) => d.absent || (d.marks !== '' && !invalid(d))).length;
    return { entered, total: vals.length, count: nums.length };
  }, [draft, max, min]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (sid: string, patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, [sid]: { ...d[sid], ...patch } }));
    setDirty(true);
  };

  // `i` is the index within the current page.
  const onKey = (e: KeyboardEvent<HTMLInputElement>, i: number) => {
    const { page, pages, onChange } = rowPage.pager;
    const count = rowPage.items.length;
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      for (let j = i + 1; j < count; j++) {
        const el = inputs.current[j];
        if (el && !el.disabled) { el.focus(); el.select(); return; }
      }
      if (page < pages) {
        pendingFocus.current = 'first';
        onChange(page + 1);
        return;
      }
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      for (let j = i - 1; j >= 0; j--) {
        const el = inputs.current[j];
        if (el && !el.disabled) { el.focus(); el.select(); return; }
      }
      if (page > 1) {
        pendingFocus.current = 'last';
        onChange(page - 1);
      }
    }
  };

  // Jump to the page holding the first invalid mark (it may not be the page on screen).
  const showInvalid = () => {
    const at = data?.rows.findIndex((r) => invalid(draft[r.student._id])) ?? -1;
    if (at >= 0) rowPage.pager.onChange(Math.floor(at / rowPage.pager.limit) + 1);
  };

  const save = async () => {
    if (!data) return;
    if (invalidCount) {
      showInvalid();
      return toast.error(`Marks must be between ${min} and ${max}`);
    }
    setSaving(true);
    try {
      const res = await api.put<{ changedAfterPublish?: number }>(`/tests/${data.test._id}/marks`, {
        results: data.rows.map((r) => {
          const d = draft[r.student._id];
          return { studentId: r.student._id, marks: d.absent || d.marks === '' ? null : Number(d.marks), absent: d.absent, remark: d.remark.trim() || undefined };
        }),
      });
      toast.success('Marks saved');
      const changed = res.data.changedAfterPublish ?? 0;
      if (changed > 0) {
        toast(`Parents had already seen the earlier marks for ${changed} student${changed === 1 ? '' : 's'}. The change has been logged.`, { icon: '⚠️', duration: 7000 });
      }
      setDirty(false);
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    if (!data) return;
    setPublishing(true);
    try {
      await api.post(`/tests/${data.test._id}/publish`);
      toast.success('Results published — parents notified');
      setPublishOpen(false);
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setPublishing(false);
    }
  };

  const remove = async () => {
    if (!data) return;
    setDeleting(true);
    try {
      await api.delete(`/tests/${data.test._id}`);
      toast.success('Test deleted');
      navigate('/app/tests');
    } catch (e) {
      toast.error(errMsg(e));
      setDeleting(false);
    }
  };

  if (loading && !data) return <PageLoader />;
  if (error || !data) {
    return (
      <div>
        <Link to="/app/tests" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" /> All tests
        </Link>
        <ErrorState message={error ?? 'Test not found'} onRetry={status === 404 ? undefined : reload} />
      </div>
    );
  }

  const { test, rows, stats, analytics } = data;
  // Absent-only results count too: a test where everyone was absent can still be published.
  const canPublish = !dirty && (stats.entered > 0 || data.rows.some((r) => r.absent || r.marks != null));

  return (
    <div className="pb-24">
      <Link to="/app/tests" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> All tests
      </Link>

      {/* Header */}
      <Card className="relative mb-6 overflow-hidden">
        <span className="absolute inset-x-0 top-0 h-1.5" style={{ background: test.batch?.color ?? '#6366f1' }} />
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-bold uppercase tracking-wider text-brand-600">{test.subject}</p>
              <StatusBadge status={test.status} />
            </div>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">{test.topic || `${test.subject} test`}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-slate-500">
              {test.batch && (
                <Link to={`/app/batches/${test.batch._id}`} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 hover:bg-slate-200">
                  <span className="h-2 w-2 rounded-full" style={{ background: test.batch.color ?? '#6366f1' }} /> {test.batch.name}
                </Link>
              )}
              <span className="inline-flex items-center gap-1"><CalendarDays className="h-4 w-4" /> {fmtDate(test.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
              <span className="inline-flex items-center gap-1"><Target className="h-4 w-4" /> Max {test.maxMarks} · Pass {passPct}%</span>
              {test.negativeMarking && <Badge tone="amber">Negative marking</Badge>}
              <span className="inline-flex items-center gap-1"><Users className="h-4 w-4" /> {rows.length} students</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => {
              if (dirty && !window.confirm('You have unsaved marks. Editing the test will reload the sheet and discard them. Continue?')) return;
              setEditOpen(true);
            }}>Edit test</Button>
            <Button variant="ghost" className="text-rose-600 hover:bg-rose-50" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDeleteOpen(true)}>Delete</Button>
            <Button
              variant={test.status === 'published' ? 'secondary' : 'success'}
              icon={test.status === 'published' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Send className="h-4 w-4" />}
              disabled={!canPublish || test.status === 'published'}
              title={dirty ? 'Save marks before publishing' : stats.entered === 0 ? 'Enter marks first' : undefined}
              onClick={() => setPublishOpen(true)}
            >
              {test.status === 'published' ? 'Published' : 'Publish results'}
            </Button>
          </div>
        </div>
        {dirty && test.status !== 'published' && (
          <p className="mt-3 text-xs font-semibold text-amber-600">Unsaved changes — save marks before publishing.</p>
        )}
      </Card>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Average" value={stats.avg != null ? `${stats.avg}%` : '—'} icon={<BarChart3 className="h-5 w-5" />} tone="brand" />
        <StatCard label="Highest" value={stats.highest != null ? `${stats.highest}/${test.maxMarks}` : '—'} icon={<TrendingUp className="h-5 w-5" />} tone="green" />
        <StatCard label="Lowest" value={stats.lowest != null ? `${stats.lowest}/${test.maxMarks}` : '—'} icon={<TrendingDown className="h-5 w-5" />} tone="rose" />
        <StatCard label="Pass rate" value={stats.passRate != null ? `${stats.passRate}%` : '—'} icon={<Award className="h-5 w-5" />} tone="amber" hint={`Pass mark ${passPct}%`} />
        <StatCard label="Entered" value={`${stats.entered}/${rows.length}`} icon={<Users className="h-5 w-5" />} tone="sky" className="col-span-2 lg:col-span-1" />
      </div>

      {/* Marks entry */}
      <Card pad={false} className="mb-6">
        <div className="flex flex-col gap-2 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-bold text-slate-900">Enter marks</h3>
            <p className="text-sm text-slate-500">Type marks and press <kbd className="rounded border border-slate-200 bg-slate-50 px-1 text-xs">Enter</kbd> to jump to the next student.</p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Badge tone="brand">{live.entered}/{live.total} entered</Badge>
            {invalidCount > 0 && (
              <button type="button" onClick={showInvalid} title="Show the first invalid mark"><Badge tone="red">{invalidCount} invalid</Badge></button>
            )}
          </div>
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={<Users className="h-7 w-7" />} title="No students in this batch" />
        ) : (
          <div className="table-wrap scrollbar-thin">
            <table className="table">
              <thead>
                <tr>
                  <th className="w-10">#</th><th>Student</th><th className="w-36">Marks / {test.maxMarks}</th><th className="w-20 text-center">Absent</th>
                  <th className="w-20 text-right">%</th><th className="min-w-[12rem]">Remark</th>
                </tr>
              </thead>
              <tbody>
                {rowPage.items.map((r, i) => {
                  const d = draft[r.student._id] ?? { marks: '', absent: false, remark: '' };
                  const bad = invalid(d);
                  const p = !d.absent && d.marks !== '' && !bad ? Math.round((Number(d.marks) / test.maxMarks) * 100) : null;
                  return (
                    <tr key={r.student._id} className={clsx(d.absent && 'bg-slate-50/80')}>
                      <td className="text-xs font-semibold text-slate-400">{rowPage.offset + i + 1}</td>
                      <td>
                        <div className="flex items-center gap-3">
                          <Avatar name={r.student.name} size="sm" />
                          <div>
                            <p className={clsx('font-semibold', d.absent ? 'text-slate-400 line-through' : 'text-slate-900')}>{r.student.name}</p>
                            <p className="text-xs text-slate-400">{r.student.studentCode}</p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <input
                          ref={(el) => { inputs.current[i] = el; }}
                          type="number"
                          inputMode="decimal"
                          min={min}
                          max={test.maxMarks}
                          step="any"
                          value={d.absent ? '' : d.marks}
                          disabled={d.absent || saving}
                          placeholder={d.absent ? 'AB' : '—'}
                          onChange={(e) => update(r.student._id, { marks: e.target.value })}
                          onKeyDown={(e) => onKey(e, i)}
                          onFocus={(e) => e.target.select()}
                          onWheel={(e) => (e.target as HTMLInputElement).blur()}
                          className={clsx('input w-24 py-2 text-center font-bold tabular-nums',
                            bad && 'border-rose-400 bg-rose-50 text-rose-700 focus:border-rose-400 focus:ring-rose-100')}
                        />
                      </td>
                      <td className="text-center">
                        <input
                          type="checkbox"
                          checked={d.absent}
                          disabled={saving}
                          onChange={(e) => update(r.student._id, { absent: e.target.checked })}
                          className="h-5 w-5 cursor-pointer rounded border-slate-300 accent-rose-500"
                          aria-label={`Mark ${r.student.name} absent`}
                        />
                      </td>
                      <td className={clsx('text-right font-extrabold tabular-nums', d.absent ? 'text-slate-400' : scoreTone(p, passPct))}>
                        {d.absent ? 'AB' : p != null ? `${p}%` : '—'}
                      </td>
                      <td>
                        <input
                          value={d.remark}
                          disabled={saving}
                          onChange={(e) => update(r.student._id, { remark: e.target.value })}
                          placeholder="Optional"
                          className="input py-2"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pager {...rowPage.pager} noun="students" />
      </Card>

      {/* Analytics */}
      {analytics ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="Score distribution" subtitle="Students per percentage band" icon={<BarChart3 className="h-5 w-5" />} />
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.distribution} margin={{ left: -20, right: 4, top: 8 }}>
                  <CartesianGrid vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="range" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                  <Tooltip cursor={{ fill: '#f5f3ff' }} content={<ChartTooltip />} />
                  <Bar dataKey="count" name="Students" radius={[8, 8, 0, 0]} maxBarSize={56}>
                    {analytics.distribution.map((_, i) => <Cell key={i} fill={DIST_COLORS[i % DIST_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <div className="space-y-6">
            <Card>
              <CardHeader title="Toppers" icon={<Award className="h-5 w-5" />} />
              {analytics.toppers.length === 0 ? (
                <p className="text-sm text-slate-400">No marks yet.</p>
              ) : (
                <ul className="space-y-2">
                  {analytics.toppers.map((t, i) => (
                    <li key={t.name} className="flex items-center justify-between rounded-xl bg-gradient-to-r from-amber-50 to-transparent px-3 py-2">
                      <span className="flex items-center gap-2 font-semibold text-slate-800"><span className="text-xl">{MEDALS[i]}</span>{t.name}</span>
                      <span className="font-extrabold text-slate-900">{t.marks}<span className="text-xs font-semibold text-slate-400">/{test.maxMarks}</span></span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <CardHeader title="Needs help" subtitle={`Scored below ${passPct}%`} icon={<HeartHandshake className="h-5 w-5" />} />
              {analytics.needsHelp.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-emerald-600"><CheckCircle2 className="h-4 w-4" /> Everyone cleared the pass mark!</p>
              ) : (
                <ul className="space-y-1.5">
                  {analytics.needsHelp.map((s) => (
                    <li key={s.name} className="flex items-center justify-between text-sm">
                      <span className="text-slate-700">{s.name}</span>
                      <Badge tone="red">{s.marks}/{test.maxMarks}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      ) : isOwner ? (
        // Plans & upgrades are the owner's business — teachers never see upgrade prompts.
        <UpgradeCard emoji="✨" title="UNLOCK TEST ANALYTICS" text="See score distribution, toppers and students who need extra help — automatically." cta="Upgrade" />
      ) : null}

      {/* Sticky save bar */}
      {rows.length > 0 && (
        <div className="no-print sticky bottom-0 z-20 -mx-4 mt-6 border-t border-slate-200 bg-white/90 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-slate-600">
              <b className="text-slate-900">{live.entered}</b>/{live.total} entered
              {dirty && <span className="ml-2 font-semibold text-amber-600">· unsaved</span>}
            </p>
            <div className="flex gap-2">
              <Button loading={saving} disabled={!dirty || invalidCount > 0} icon={<Save className="h-4 w-4" />} onClick={save}>Save marks</Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        onConfirm={publish}
        loading={publishing}
        title="Publish results?"
        text={<>Parents will be notified with their child&apos;s score for <b>{test.subject}{test.topic ? ` — ${test.topic}` : ''}</b>.</>}
        confirmLabel="Publish & notify"
      />
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={remove}
        loading={deleting}
        danger
        title="Delete this test?"
        text="All marks entered for this test will be permanently removed."
        confirmLabel="Delete test"
      />
      <TestFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        batches={batches.data ?? []}
        initial={{ _id: test._id, subject: test.subject, topic: test.topic, maxMarks: test.maxMarks, date: test.date, batchId: test.batch?._id ?? '', passPercent: test.passPercent, negativeMarking: test.negativeMarking }}
        onSaved={() => reload()}
      />
    </div>
  );
}
