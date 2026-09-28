import { ChevronLeft, ChevronRight } from 'lucide-react';
import { clsx } from './ui';

/**
 * Previous / Next pagination bar used under every list (20 items per page).
 * Shows "21–40 of 134" and "Page 2 of 7". Hidden when there is nothing to show.
 */
export function Pager({
  page, pages, total, limit = 20, onChange, loading, className, noun = 'items',
}: {
  page: number; pages: number; total: number; limit?: number; onChange: (p: number) => void;
  loading?: boolean; className?: string; noun?: string;
}) {
  if (!total || (page - 1) * limit >= total) return null;
  const from = (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);
  const go = (p: number) => {
    if (p < 1 || p > pages || p === page || loading) return;
    onChange(p);
  };
  return (
    <div className={clsx('no-print flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm sm:px-5', className)}>
      <p className="text-slate-500">
        Showing <b className="text-slate-800">{from}–{to}</b> of <b className="text-slate-800">{total}</b> {noun}
      </p>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => go(page - 1)} disabled={page <= 1 || loading} className="btn-secondary btn-sm disabled:cursor-not-allowed disabled:opacity-40" aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" /> Previous
        </button>
        <span className="min-w-[5.5rem] text-center text-xs font-semibold text-slate-500">Page {page} of {pages}</span>
        <button type="button" onClick={() => go(page + 1)} disabled={page >= pages || loading} className="btn-secondary btn-sm disabled:cursor-not-allowed disabled:opacity-40" aria-label="Next page">
          Next <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
