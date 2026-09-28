import { Building2, ScrollText, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Card, EmptyState, ErrorState, PageHeader, SearchInput, Skeleton, clsx } from '../../components/ui';
import { Pager } from '../../components/Pager';
import { useDebounced, usePagedApi } from '../../hooks/useApi';
import { fmtDate } from '../../lib/format';

interface AuditItem {
  _id: string;
  createdAt: string;
  action: string;
  entity?: string;
  entityId?: string;
  detail?: string;
  userName?: string;
  instituteId: { _id: string; name: string } | string | null;
}

const ACTION_PRESETS = ['institute.', 'owner.', 'saas.', 'plan.', 'payment.'];
const OBJECT_ID = /^[a-f0-9]{24}$/i;

export default function AdminAudit() {
  const [params, setParams] = useSearchParams();
  const instituteId = params.get('instituteId') ?? '';
  const [action, setAction] = useState(params.get('action') ?? '');
  const [instInput, setInstInput] = useState(instituteId);
  const actionQ = useDebounced(action.trim(), 350);

  // Keep the institute box in sync when the URL changes (e.g. arriving from an institute's detail).
  useEffect(() => setInstInput(instituteId), [instituteId]);

  const setInstitute = (id: string) => {
    const next = new URLSearchParams(params);
    if (id) next.set('instituteId', id);
    else next.delete('instituteId');
    setParams(next, { replace: true });
  };

  const validInst = !instituteId || OBJECT_ID.test(instituteId);
  const list = usePagedApi<AuditItem>(validInst ? '/admin/audit' : null, { action: actionQ || undefined, instituteId: instituteId || undefined });
  const { data, loading, error, reload } = list;
  const rows = data?.items ?? [];
  const instName = rows.map((r) => (r.instituteId && typeof r.instituteId === 'object' ? r.instituteId.name : null)).find(Boolean);

  const applyInst = () => {
    const v = instInput.trim();
    if (v === instituteId) return;
    setInstitute(v);
  };

  return (
    <div>
      <PageHeader
        title="Audit log"
        subtitle="Every sensitive action across CoachFlow — who did what, when, and for which institute."
        actions={data ? <span className="badge bg-white px-3 py-1.5 text-slate-600 ring-1 ring-slate-200">{data.total} {data.total === 1 ? 'entry' : 'entries'}</span> : null}
      />

      <Card pad={false}>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-2">
            <p className="label mb-0">Action starts with</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="sm:w-64">
                <SearchInput value={action} onChange={setAction} placeholder="e.g. institute. or saas.refund" />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ACTION_PRESETS.map((p) => (
                  <button key={p} type="button" onClick={() => setAction(action === p ? '' : p)}
                    className={clsx('rounded-full px-3 py-1 font-mono text-xs font-semibold ring-1 transition',
                      action === p ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-600 ring-slate-200 hover:ring-brand-300')}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); applyInst(); }}>
            <label className="label mb-0" htmlFor="audit-inst">Institute ID (optional)</label>
            <div className="flex gap-2">
              <input id="audit-inst" className="input font-mono sm:w-64" value={instInput} onChange={(e) => setInstInput(e.target.value)}
                onBlur={applyInst} placeholder="24-character ID" />
              {instituteId && (
                <Button type="button" variant="secondary" icon={<X className="h-4 w-4" />} onClick={() => setInstitute('')}>Clear</Button>
              )}
            </div>
          </form>
        </div>

        {instituteId && validInst && (
          <p className="flex items-center gap-2 border-b border-slate-100 bg-brand-50/50 px-4 py-2 text-sm text-brand-800">
            <Building2 className="h-4 w-4" /> Showing entries for <b>{instName ?? instituteId}</b>
          </p>
        )}

        {!validInst ? (
          <div className="p-4"><ErrorState message="That is not a valid institute ID (24 hexadecimal characters)." /></div>
        ) : error ? (
          <div className="p-4"><ErrorState message={error} onRetry={reload} /></div>
        ) : loading && !data ? (
          <div className="space-y-3 p-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<ScrollText className="h-7 w-7" />} title="No audit entries" text="Nothing matches these filters." />
        ) : (
          <div className={clsx('table-wrap scrollbar-thin transition-opacity', loading && 'opacity-60')}>
            <table className="table">
              <thead>
                <tr><th>Time</th><th>Institute</th><th>Who</th><th>Action</th><th>Detail</th></tr>
              </thead>
              <tbody>
                {rows.map((a) => {
                  const inst = a.instituteId && typeof a.instituteId === 'object' ? a.instituteId : null;
                  return (
                    <tr key={a._id}>
                      <td className="whitespace-nowrap">
                        <p className="font-medium text-slate-800">{fmtDate(a.createdAt)}</p>
                        <p className="text-xs text-slate-400">{new Date(a.createdAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</p>
                      </td>
                      <td>
                        {inst ? (
                          <button type="button" onClick={() => setInstitute(inst._id)} title="Show only this institute"
                            className="rounded text-left font-semibold text-slate-900 hover:text-brand-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
                            {inst.name}
                          </button>
                        ) : <span className="text-slate-400">Platform</span>}
                      </td>
                      <td className="text-slate-700">{a.userName || <span className="text-slate-400">System</span>}</td>
                      <td>
                        <button type="button" onClick={() => setAction(a.action)} title="Filter by this action"
                          className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-brand-700 hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
                          {a.action}
                        </button>
                        {a.entity && <p className="mt-0.5 text-[11px] text-slate-400">{a.entity}</p>}
                      </td>
                      <td className="max-w-[28rem] whitespace-normal break-words text-sm text-slate-600">{a.detail || <span className="text-slate-300">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {validInst && list.pager && <Pager {...list.pager} noun="entries" />}
      </Card>
    </div>
  );
}
