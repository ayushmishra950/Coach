import { Copy, ExternalLink, Globe, ImagePlus, Loader2, Plus, Save, Star, Trash2, Trophy, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { Button, Card, CardHeader, ErrorState, Input, PageHeader, Skeleton, Textarea, Toggle } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import { api, errMsg } from '../../lib/api';
import { publicFileUrl, uploadFile } from '../../lib/files';

interface Topper { name: string; result?: string; year?: string; quote?: string; photoId?: string | null }
interface Testimonial { name: string; role?: string; text: string; rating?: number }
interface Site {
  enabled?: boolean; slug?: string; tagline?: string; about?: string; whatsapp?: string; mapUrl?: string; heroImageId?: string | null; demoEnabled?: boolean;
  showTeachers?: boolean; showBatches?: boolean; showCounts?: boolean;
  stats?: { label: string; value: string }[]; toppers?: Topper[]; testimonials?: Testimonial[];
}

/** Owner: build the public admissions website (/site/<slug>). */
export default function Website() {
  const { data, error, reload } = useApi<{ website: Site; suggestedSlug: string; publicCourses: number }>('/website');
  const [w, setW] = useState<Site | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (data) setW({ demoEnabled: true, stats: [], toppers: [], testimonials: [], ...data.website, slug: data.website.slug || data.suggestedSlug });
  }, [data]);
  const url = w?.slug ? `${location.origin}/site/${w.slug}` : '';

  const save = async (patch: Partial<Site> = {}) => {
    if (!w) return;
    setSaving(true);
    try {
      const { data: r } = await api.put<{ website: Site }>('/website', { ...w, ...patch });
      setW((cur) => ({ ...cur, ...r.website }));
      toast.success(patch.enabled === true ? 'Website is live 🎉' : patch.enabled === false ? 'Website hidden' : 'Website saved');
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!w || !data) return <Skeleton className="h-96" />;
  const setList = <K extends 'toppers' | 'testimonials' | 'stats'>(k: K, list: NonNullable<Site[K]>) => setW({ ...w, [k]: list });

  return (
    <div>
      <PageHeader title="Admissions website" subtitle="A public page for new parents: courses & fees, toppers, reviews, demo-class booking and WhatsApp chat"
        actions={<>
          {w.enabled && url && <a href={url} target="_blank" rel="noreferrer" className="btn-secondary"><ExternalLink className="h-4 w-4" />Open website</a>}
          <Button icon={<Save className="h-4 w-4" />} loading={saving} onClick={() => save()}>Save</Button>
        </>} />

      <Card className="mb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <div className="flex-1">
            <p className="label">Web address</p>
            <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 pl-3 text-sm">
              <span className="whitespace-nowrap text-slate-500">{location.host}/site/</span>
              <input className="min-w-0 flex-1 rounded-r-xl bg-white px-2 py-2.5 font-semibold outline-none" value={w.slug ?? ''} onChange={(e) => setW({ ...w, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} />
            </div>
          </div>
          {url && w.enabled && <Button variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={() => navigator.clipboard.writeText(url).then(() => toast.success('Link copied'))}>Copy link</Button>}
          {w.enabled
            ? <Button variant="danger" loading={saving} onClick={() => save({ enabled: false })}>Unpublish</Button>
            : <Button variant="success" icon={<Globe className="h-4 w-4" />} loading={saving} onClick={() => save({ enabled: true })}>Publish website</Button>}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          {w.enabled ? '🟢 Live. ' : '⚪ Not published yet. '}
          Courses come from <Link to="/app/courses" className="font-semibold text-brand-600 hover:underline">Courses</Link> ({data.publicCourses} shown). Contact details come from Settings. Enquiries arrive in <Link to="/app/leads" className="font-semibold text-brand-600 hover:underline">Enquiries</Link>.
        </p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Main section" icon={<Globe className="h-5 w-5" />} />
          <div className="space-y-4">
            <Input label="Tagline" value={w.tagline ?? ''} onChange={(e) => setW({ ...w, tagline: e.target.value })} placeholder="e.g. Results that speak — Class 6 to 12, JEE & NEET" maxLength={160} />
            <Textarea label="About your coaching" rows={5} value={w.about ?? ''} onChange={(e) => setW({ ...w, about: e.target.value })} maxLength={4000} placeholder="Since 2012, … experienced faculty, small batches, weekly tests…" />
            <PhotoField label="Cover photo" id={w.heroImageId} onChange={(id) => setW({ ...w, heroImageId: id })} wide />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="WhatsApp number (counsellor)" value={w.whatsapp ?? ''} onChange={(e) => setW({ ...w, whatsapp: e.target.value })} placeholder="98765 43210" hint="Shows a WhatsApp chat button" />
              <Input label="Google Maps link" value={w.mapUrl ?? ''} onChange={(e) => setW({ ...w, mapUrl: e.target.value })} placeholder="https://maps.app.goo.gl/…" />
            </div>
            <Toggle checked={w.demoEnabled !== false} onChange={(v) => setW({ ...w, demoEnabled: v })} label="Free demo class booking form" description="Parents pick a course and a preferred date" />
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm font-bold text-slate-800">Fill the page automatically</p>
              <p className="mb-3 text-xs text-slate-500">Shown from your live data — the page never looks empty, even before you add courses or toppers. Anything you write above replaces the automatic text.</p>
              <div className="space-y-3">
                <Toggle checked={w.showBatches !== false} onChange={(v) => setW({ ...w, showBatches: v })} label="Batches, classes & timings" description="From your active batches" />
                <Toggle checked={w.showTeachers !== false} onChange={(v) => setW({ ...w, showTeachers: v })} label="Faculty" description="Teacher names, subjects and qualification (never phone or email)" />
                <Toggle checked={w.showCounts !== false} onChange={(v) => setW({ ...w, showCounts: v })} label="Numbers" description="Students, teachers, batches and subjects — used when you haven't added your own highlights" />
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Highlights" subtitle="Big numbers under the cover (max 6). Leave empty to show live numbers automatically." icon={<Star className="h-5 w-5" />}
            action={(w.stats?.length ?? 0) < 6 && <Button size="sm" variant="secondary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setList('stats', [...(w.stats ?? []), { label: '', value: '' }])}>Add</Button>} />
          <div className="space-y-2">
            {(w.stats ?? []).map((s, i) => (
              <div key={i} className="flex gap-2">
                <input className="input w-28" placeholder="500+" value={s.value} onChange={(e) => setList('stats', w.stats!.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                <input className="input flex-1" placeholder="Students taught" value={s.label} onChange={(e) => setList('stats', w.stats!.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                <button className="rounded-lg p-2 text-slate-400 hover:text-rose-600" onClick={() => setList('stats', w.stats!.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            {!w.stats?.length && <p className="text-sm text-slate-400">e.g. “15 years”, “1200+ students”, “98% board pass rate”.</p>}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Toppers & results" subtitle="Photos of last year's toppers build the most trust" icon={<Trophy className="h-5 w-5" />}
            action={<Button size="sm" variant="secondary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setList('toppers', [...(w.toppers ?? []), { name: '', result: '', year: String(new Date().getFullYear()) }])}>Add topper</Button>} />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(w.toppers ?? []).map((t, i) => {
              const upd = (p: Partial<Topper>) => setList('toppers', w.toppers!.map((x, j) => (j === i ? { ...x, ...p } : x)));
              return (
                <div key={i} className="flex gap-3 rounded-2xl border border-slate-200 p-3">
                  <PhotoField id={t.photoId} onChange={(id) => upd({ photoId: id })} />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <input className="input py-1.5 text-sm font-semibold" placeholder="Student name" value={t.name} onChange={(e) => upd({ name: e.target.value })} />
                    <div className="flex gap-1.5">
                      <input className="input py-1.5 text-xs" placeholder="98.4% · Class 10" value={t.result ?? ''} onChange={(e) => upd({ result: e.target.value })} />
                      <input className="input w-20 py-1.5 text-xs" placeholder="Year" value={t.year ?? ''} onChange={(e) => upd({ year: e.target.value })} />
                    </div>
                    <input className="input py-1.5 text-xs" placeholder="Short quote (optional)" value={t.quote ?? ''} onChange={(e) => upd({ quote: e.target.value })} />
                    <button className="text-xs font-semibold text-rose-600 hover:underline" onClick={() => setList('toppers', w.toppers!.filter((_, j) => j !== i))}>Remove</button>
                  </div>
                </div>
              );
            })}
          </div>
          {!w.toppers?.length && <p className="text-sm text-slate-400">No toppers added yet.</p>}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Parent & student reviews" icon={<Star className="h-5 w-5" />}
            action={<Button size="sm" variant="secondary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setList('testimonials', [...(w.testimonials ?? []), { name: '', role: 'Parent', text: '', rating: 5 }])}>Add review</Button>} />
          <div className="grid gap-3 md:grid-cols-2">
            {(w.testimonials ?? []).map((t, i) => {
              const upd = (p: Partial<Testimonial>) => setList('testimonials', w.testimonials!.map((x, j) => (j === i ? { ...x, ...p } : x)));
              return (
                <div key={i} className="space-y-1.5 rounded-2xl border border-slate-200 p-3">
                  <div className="flex gap-1.5">
                    <input className="input py-1.5 text-sm" placeholder="Name" value={t.name} onChange={(e) => upd({ name: e.target.value })} />
                    <input className="input w-40 py-1.5 text-sm" placeholder="Parent of Riya (Cl. 10)" value={t.role ?? ''} onChange={(e) => upd({ role: e.target.value })} />
                    <select className="input w-20 py-1.5 text-sm" value={t.rating ?? 5} onChange={(e) => upd({ rating: Number(e.target.value) })}>{[5, 4, 3].map((n) => <option key={n} value={n}>{n}★</option>)}</select>
                  </div>
                  <textarea className="input text-sm" rows={2} placeholder="What they said" value={t.text} onChange={(e) => upd({ text: e.target.value })} />
                  <button className="text-xs font-semibold text-rose-600 hover:underline" onClick={() => setList('testimonials', w.testimonials!.filter((_, j) => j !== i))}>Remove</button>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-slate-500">Add only real reviews that parents or students actually gave you.</p>
        </Card>
      </div>
      <div className="mt-6 flex justify-end"><Button icon={<Save className="h-4 w-4" />} loading={saving} onClick={() => save()}>Save website</Button></div>
    </div>
  );
}

function PhotoField({ id, onChange, label, wide }: { id?: string | null; onChange: (id: string | null) => void; label?: string; wide?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error('Choose a JPG, PNG or WebP photo');
    if (file.size > 5 * 1024 * 1024) return toast.error('Photos can be up to 5 MB');
    setBusy(true);
    try {
      const up = await uploadFile(file, { isPublic: true });
      onChange(up._id);
    } catch (e) {
      toast.error(errMsg(e, (e as Error).message));
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = '';
    }
  };
  return (
    <div>
      {label && <p className="label">{label}</p>}
      <div className={`group relative grid shrink-0 place-items-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50 ${wide ? 'h-36 w-full' : 'h-24 w-20'}`}>
        {id ? <img src={publicFileUrl(id)} alt="" className="h-full w-full object-cover" /> : busy ? <Loader2 className="h-5 w-5 animate-spin text-slate-400" /> : <ImagePlus className="h-6 w-6 text-slate-300" />}
        <div className="absolute inset-0 flex items-center justify-center gap-1 bg-slate-900/50 opacity-0 transition group-hover:opacity-100">
          <button type="button" className="rounded-lg bg-white/90 p-1.5 text-slate-700" title="Upload" onClick={() => ref.current?.click()}><Upload className="h-4 w-4" /></button>
          {id && <button type="button" className="rounded-lg bg-white/90 p-1.5 text-rose-600" title="Remove" onClick={() => onChange(null)}><Trash2 className="h-4 w-4" /></button>}
        </div>
        {!id && !busy && <button type="button" className="absolute inset-0" aria-label="Upload photo" onClick={() => ref.current?.click()} />}
      </div>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
    </div>
  );
}
