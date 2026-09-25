import { ArrowLeft, CheckCircle2, GraduationCap, MapPin, Phone, Printer } from 'lucide-react';
import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, ErrorState, PageLoader } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../hooks/useApi';
import { fmtDate, fmtDateTime, inr } from '../../lib/format';

interface ReceiptResp {
  payment: {
    _id: string; amount: number; method: string; receiptNo: string; reference?: string; note?: string; paidAt: string;
    studentId: { _id: string; name: string; studentCode: string; parentName?: string; course?: string } | null;
    invoiceId: { _id: string; title: string; amount: number; paidAmount?: number; dueDate?: string } | null;
  };
  institute: { name: string; phone?: string; address?: string; city?: string };
}

const METHOD_LABEL: Record<string, string> = { upi: 'UPI', cash: 'Cash', bank: 'Bank transfer', card: 'Card', online: 'Online payment' };

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n: number) {
  return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`;
}
function threeDigits(n: number) {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', rest ? twoDigits(rest) : ''].filter(Boolean).join(' ');
}
/** 125000 → "One Lakh Twenty Five Thousand Rupees Only" (Indian numbering). */
function amountInWords(amount: number) {
  let n = Math.floor(Math.abs(amount));
  const paise = Math.round((Math.abs(amount) - n) * 100);
  if (n === 0 && !paise) return 'Zero Rupees Only';
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const thousand = Math.floor(n / 1e3); n %= 1e3;
  if (crore) parts.push(`${crore > 99 ? threeDigits(crore) : twoDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (n) parts.push(threeDigits(n));
  let s = `${parts.join(' ')} Rupees`;
  if (paise) s += ` and ${twoDigits(paise)} Paise`;
  return `${s} Only`;
}

export default function Receipt() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const isParent = session?.user.role === 'parent';
  const { data, loading, error, reload } = useApi<ReceiptResp>(id ? (isParent ? `/parent/receipt/${id}` : `/fees/payments/${id}`) : null);

  const back = () => (window.history.length > 1 ? navigate(-1) : navigate(isParent ? '/portal' : '/app/fees'));

  const wrap = (child: ReactNode) => (
    <div className={isParent ? 'min-h-screen bg-gradient-to-br from-slate-50 via-white to-brand-50/40 px-4 py-8 print:bg-white print:p-0 sm:py-12' : 'py-2'}>
      {child}
    </div>
  );

  if (loading) return wrap(<PageLoader />);
  if (error || !data) return wrap(<div className="mx-auto max-w-2xl"><ErrorState message={error ?? 'Receipt not found'} onRetry={reload} /></div>);

  const { payment: p, institute: inst } = data;
  const s = p.studentId;
  const inv = p.invoiceId;
  const balance = inv ? Math.max(0, inv.amount - (inv.paidAmount ?? inv.amount)) : null;

  return wrap(
    <div className="mx-auto max-w-2xl">
      <div className="no-print mb-4 flex items-center justify-between gap-2">
        <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={back}>Back</Button>
        <Button icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>Print receipt</Button>
      </div>

      <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-soft print:rounded-none print:border-0 print:shadow-none">
        <div className="h-2 bg-gradient-to-r from-brand-600 via-violet-600 to-fuchsia-600" />

        {/* Institute header */}
        <div className="flex flex-col gap-4 border-b border-dashed border-slate-200 px-6 py-6 sm:flex-row sm:items-start sm:justify-between sm:px-8">
          <div className="flex items-start gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-600 to-violet-600 text-white shadow-sm">
              <GraduationCap className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold text-slate-900">{inst.name}</h1>
              {(inst.address || inst.city) && (
                <p className="mt-0.5 flex items-start gap-1 text-xs text-slate-500">
                  <MapPin className="mt-0.5 h-3 w-3 shrink-0" /> {[inst.address, inst.city].filter(Boolean).join(', ')}
                </p>
              )}
              {inst.phone && <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500"><Phone className="h-3 w-3" /> {inst.phone}</p>}
            </div>
          </div>
          <div className="sm:text-right">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600">Payment Receipt</p>
            <p className="mt-1 font-mono text-sm font-bold text-slate-900">#{p.receiptNo}</p>
            <p className="text-xs text-slate-500">{fmtDateTime(p.paidAt)}</p>
          </div>
        </div>

        {/* Success banner */}
        <div className="px-6 pt-6 sm:px-8">
          <div className="flex flex-col items-center rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 px-4 py-6 text-center ring-1 ring-emerald-100">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <p className="mt-3 text-lg font-extrabold text-emerald-700">Payment Successful ✓</p>
            <p className="mt-2 text-4xl font-extrabold tracking-tight text-slate-900">{inr(p.amount)}</p>
            <p className="mt-1 text-sm italic text-slate-600">{amountInWords(p.amount)}</p>
          </div>
        </div>

        {/* Details */}
        <div className="grid gap-x-8 gap-y-4 px-6 py-6 sm:grid-cols-2 sm:px-8">
          <Detail label="Student" value={s?.name ?? '—'} sub={[s?.studentCode, s?.course].filter(Boolean).join(' · ')} />
          <Detail label="Parent / Guardian" value={s?.parentName || '—'} />
          <Detail label="Towards" value={inv?.title ?? 'Fee payment'} sub={inv?.dueDate ? `Due ${fmtDate(inv.dueDate)}` : undefined} />
          <Detail label="Payment date" value={fmtDate(p.paidAt, { day: 'numeric', month: 'long', year: 'numeric' })} />
          <Detail label="Payment method" value={METHOD_LABEL[p.method] ?? p.method} />
          <Detail label="Reference" value={p.reference || '—'} mono={!!p.reference} />
          {p.note && <Detail label="Note" value={p.note} className="sm:col-span-2" />}
        </div>

        {inv && (
          <div className="mx-6 mb-6 overflow-hidden rounded-2xl border border-slate-200 sm:mx-8">
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-slate-100"><td className="px-4 py-2.5 text-slate-500">Installment amount</td><td className="px-4 py-2.5 text-right font-semibold">{inr(inv.amount)}</td></tr>
                <tr className="border-b border-slate-100"><td className="px-4 py-2.5 text-slate-500">Paid now</td><td className="px-4 py-2.5 text-right font-semibold text-emerald-600">{inr(p.amount)}</td></tr>
                {balance != null && (
                  <tr className="bg-slate-50"><td className="px-4 py-2.5 font-semibold text-slate-700">Balance remaining</td><td className="px-4 py-2.5 text-right font-extrabold text-slate-900">{inr(balance)}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-col items-center justify-between gap-4 border-t border-dashed border-slate-200 bg-slate-50/60 px-6 py-5 text-xs text-slate-500 sm:flex-row sm:px-8">
          <p>This is a computer-generated receipt and does not require a signature.</p>
          <p className="font-semibold text-slate-400">Powered by <span className="text-gradient">CoachFlow</span></p>
        </div>
      </div>

      <p className="no-print mt-4 text-center text-xs text-slate-400">Thank you for your payment!</p>
    </div>,
  );
}

function Detail({ label, value, sub, mono, className }: { label: string; value: string; sub?: string; mono?: boolean; className?: string }) {
  return (
    <div className={className}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-0.5 font-semibold text-slate-900 ${mono ? 'font-mono text-sm' : ''}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}
