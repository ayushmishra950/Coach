import {
  Award, BellRing, BookOpen, CalendarCheck, CheckCircle2, ChevronDown, ClipboardCheck, Clock, FileText, GraduationCap, IndianRupee, Laptop, Mail, MapPin,
  MessageCircle, Phone, Quote, Send, ShieldCheck, Smartphone, Star, Trophy, UserCheck, Users,
} from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { api, errMsg } from '../lib/api';
import { publicFileUrl } from '../lib/files';
import { fmtTime, inr, ymd } from '../lib/format';

interface AutoBatch { name: string; course?: string; subject?: string; days: string[]; startTime: string; endTime: string; teacher?: string }
interface SiteData {
  institute: { name: string; phone?: string; email?: string; address?: string; city?: string; type?: string; brandColor?: string; logoText: string };
  website: {
    slug: string; tagline?: string; about?: string; whatsapp?: string; mapUrl?: string; heroImageId?: string; demoEnabled: boolean;
    stats: { label: string; value: string }[];
    toppers: { _id: string; name: string; result?: string; year?: string; quote?: string; photoId?: string }[];
    testimonials: { _id: string; name: string; role?: string; text: string; rating?: number }[];
  };
  courses: { _id: string; name: string; category?: string; description?: string; duration?: string; fee?: number; feeNote?: string; syllabus: string[]; highlights: string[]; batches: { name: string; days: string[]; startTime: string; endTime: string }[] }[];
  auto?: {
    batches: AutoBatch[];
    teachers: { name: string; subjects: string[]; qualification?: string; years: number | null }[];
    subjects: string[];
    classes: string[];
    counts: { students: number; teachers: number; batches: number; subjects: number } | null;
    since: number | null;
    parentApp?: boolean;
    onlinePay?: boolean;
  };
}

const wa = (n: string, text: string) => `https://wa.me/${n.replace(/\D/g, '').replace(/^(\d{10})$/, '91$1')}?text=${encodeURIComponent(text)}`;
const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const daysText = (d: string[]) => {
  const sorted = WEEK.filter((x) => d.includes(x));
  if (sorted.length === 7) return 'All days';
  if (sorted.length === 6 && !sorted.includes('Sun')) return 'Mon – Sat';
  if (sorted.length === 5 && !sorted.includes('Sat') && !sorted.includes('Sun')) return 'Mon – Fri';
  return sorted.join(', ');
};
const initials = (n: string) => n.replace(/^(mr|mrs|ms|dr)\.?\s+/i, '').split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase();

/* What every CoachFlow institute really gives parents & students (all of it is built in). */
const WHY = (parentApp: boolean) => parentApp ? [
  { icon: ClipboardCheck, title: 'Regular tests & report cards', text: 'Chapter tests and online MCQ practice, with marks, rank and progress graphs after every test.' },
  { icon: BellRing, title: 'Instant attendance alerts', text: 'Parents are informed the same day if their child misses a class.' },
  { icon: Smartphone, title: 'Parent app', text: 'Attendance, results, fees, notices and holidays — all in one place on your phone.' },
  { icon: FileText, title: 'Notes & study material', text: 'PDF notes, recorded lectures and assignments shared batch-wise.' },
  { icon: Clock, title: 'Fixed batch timings', text: 'A clear weekly timetable and syllabus that is tracked chapter by chapter.' },
  { icon: MessageCircle, title: 'Doubt support', text: 'Students and parents can message teachers directly for doubts and updates.' },
] : [
  { icon: ClipboardCheck, title: 'Regular tests', text: 'Chapter-wise tests with marks and feedback so every student knows where they stand.' },
  { icon: UserCheck, title: 'Daily attendance', text: 'Attendance is taken in every class and absences are followed up with parents.' },
  { icon: Users, title: 'Personal attention', text: 'Batch sizes are kept manageable so teachers can help every student.' },
  { icon: Clock, title: 'Fixed batch timings', text: 'A clear weekly timetable that fits around school hours.' },
  { icon: BookOpen, title: 'Complete syllabus', text: 'The full syllabus is covered chapter by chapter, with revision before exams.' },
  { icon: Phone, title: 'Easy to reach', text: 'Call or WhatsApp us any time for doubts, fees or updates about your child.' },
];

/** Public admissions website of one institute: /site/<slug> (no login). */
export default function PublicSite() {
  const { slug } = useParams();
  const [data, setData] = useState<SiteData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formKind, setFormKind] = useState<'demo' | 'enquiry'>('demo');
  const [courseId, setCourseId] = useState('');

  useEffect(() => {
    api.get<SiteData>(`/public/site/${slug}`).then(({ data }) => {
      setData(data);
      document.title = `${data.institute.name}${data.website.tagline ? ` — ${data.website.tagline}` : data.institute.city ? ` — Coaching in ${data.institute.city}` : ''}`;
      if (!data.website.demoEnabled) setFormKind('enquiry');
    }).catch((e) => setError(errMsg(e, 'Website not found')));
  }, [slug]);

  if (error) return <div className="grid min-h-screen place-items-center p-6 text-center"><div><p className="text-5xl">🏫</p><h1 className="mt-3 text-xl font-bold text-slate-800">{error}</h1></div></div>;
  if (!data) return <div className="grid min-h-screen place-items-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-slate-600" /></div>;

  const { institute: inst, website: w, courses } = data;
  const auto = data.auto ?? { batches: [], teachers: [], subjects: [], classes: [], counts: null, since: null };
  const color = inst.brandColor || '#6366f1';
  const whatsapp = w.whatsapp || inst.phone;
  const waText = `Hello ${inst.name}, I want to know about admissions.`;
  const goForm = (kind: 'demo' | 'enquiry', cid = '') => {
    setFormKind(kind);
    setCourseId(cid);
    document.getElementById('book')?.scrollIntoView({ behavior: 'smooth' });
  };

  // ── Owner's own text first, otherwise sensible text from live data ──
  const kind = inst.type || 'Coaching institute';
  const tagline = w.tagline || [kind, inst.city && `in ${inst.city}`].filter(Boolean).join(' ') + (auto.classes.length ? ` · ${auto.classes.slice(0, 4).join(', ')}` : '');
  const thisYear = new Date().getFullYear();
  const stats = w.stats.length ? w.stats : [
    auto.since && auto.since < thisYear ? { value: `Since ${auto.since}`, label: 'Teaching students' } : null,
    auto.counts && auto.counts.students >= 10 ? { value: `${auto.counts.students}+`, label: 'Students learning with us' } : null,
    auto.counts?.teachers ? { value: String(auto.counts.teachers), label: auto.counts.teachers === 1 ? 'Dedicated teacher' : 'Dedicated teachers' } : null,
    auto.counts?.batches ? { value: String(auto.counts.batches), label: 'Batches running' } : null,
    auto.counts?.subjects ? { value: String(auto.counts.subjects), label: 'Subjects taught' } : null,
  ].filter(Boolean) as { value: string; label: string }[];
  const about = w.about || [
    `${inst.name} is a ${kind.toLowerCase()}${inst.city ? ` in ${inst.city}` : ''}${auto.since && auto.since < thisYear ? `, guiding students since ${auto.since}` : ''}.`,
    auto.classes.length ? `We run batches for ${listText(auto.classes)}${auto.subjects.length ? ` covering ${listText(auto.subjects.slice(0, 6))}` : ''}.` : auto.subjects.length ? `We teach ${listText(auto.subjects.slice(0, 6))}.` : '',
    auto.parentApp
      ? 'Every student gets regular tests and personal attention, and parents get live updates on attendance, results and fees through our parent app.'
      : 'Every student gets regular tests and personal attention, and we stay in close touch with parents about attendance and progress.',
  ].filter(Boolean).join(' ');
  const feeRange = courses.filter((c) => c.fee != null).map((c) => c.fee as number);
  const groups = groupBatches(auto.batches);

  const nav = [
    courses.length ? ['courses', 'Courses'] : groups.length ? ['batches', 'Batches'] : null,
    auto.teachers.length ? ['faculty', 'Faculty'] : null,
    w.toppers.length ? ['toppers', 'Results'] : null,
    ['faq', 'FAQ'],
    ['contact', 'Contact'],
  ].filter(Boolean) as string[][];

  return (
    <div className="min-h-screen bg-white pb-16 text-slate-800 md:pb-0">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-extrabold text-white" style={{ background: color }}>{inst.logoText}</div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-extrabold leading-tight">{inst.name}</p>
            {inst.city && <p className="truncate text-xs text-slate-500">{inst.city}</p>}
          </div>
          <nav className="hidden gap-5 text-sm font-semibold text-slate-600 lg:flex">
            {nav.map(([id, l]) => <a key={id} href={`#${id}`} className="hover:text-slate-900">{l}</a>)}
          </nav>
          {inst.phone && <a href={`tel:${inst.phone}`} className="hidden items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold sm:flex"><Phone className="h-4 w-4" />{inst.phone}</a>}
          <button onClick={() => goForm(w.demoEnabled ? 'demo' : 'enquiry')} className="hidden rounded-xl px-4 py-2 text-sm font-bold text-white shadow sm:block" style={{ background: color }}>{w.demoEnabled ? 'Book free demo' : 'Enquire now'}</button>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        {w.heroImageId && <img src={publicFileUrl(w.heroImageId)} alt="" className="absolute inset-0 h-full w-full object-cover" />}
        <div className="absolute inset-0" style={{ background: w.heroImageId ? 'linear-gradient(90deg, rgba(15,23,42,.88), rgba(15,23,42,.5))' : `linear-gradient(135deg, ${color}, #0f172a)` }} />
        {!w.heroImageId && <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />}
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 text-white sm:py-20 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <p className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold"><ShieldCheck className="h-3.5 w-3.5" />{kind}{inst.city ? ` · ${inst.city}` : ''}</p>
            <h1 className="text-3xl font-extrabold leading-tight sm:text-5xl">{inst.name}</h1>
            <p className="mt-4 max-w-2xl text-lg text-white/85">{tagline}</p>
            {(auto.classes.length > 0 || auto.subjects.length > 0) && (
              <div className="mt-5 flex flex-wrap gap-2">
                {(auto.classes.length ? auto.classes : auto.subjects).slice(0, 8).map((c) => <span key={c} className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">{c}</span>)}
              </div>
            )}
            <div className="mt-8 flex flex-wrap gap-3">
              {w.demoEnabled && <button onClick={() => goForm('demo')} className="flex items-center gap-2 rounded-xl bg-white px-5 py-3 font-bold text-slate-900 shadow-lg"><CalendarCheck className="h-5 w-5" />Book a FREE demo class</button>}
              {whatsapp && <a href={wa(whatsapp, waText)} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 font-bold text-white shadow-lg"><MessageCircle className="h-5 w-5" />Chat on WhatsApp</a>}
              {inst.phone && <a href={`tel:${inst.phone}`} className="flex items-center gap-2 rounded-xl border border-white/30 px-5 py-3 font-bold text-white"><Phone className="h-5 w-5" />Call now</a>}
            </div>
          </div>
          {/* Quick facts card */}
          <div className="hidden rounded-3xl bg-white/95 p-6 text-slate-800 shadow-2xl lg:block">
            <p className="text-sm font-bold uppercase tracking-wide" style={{ color }}>Quick facts</p>
            <ul className="mt-4 space-y-3 text-sm">
              {auto.classes.length > 0 && <Fact icon={<GraduationCap className="h-4 w-4" />} label="Classes">{auto.classes.join(', ')}</Fact>}
              {auto.subjects.length > 0 && <Fact icon={<BookOpen className="h-4 w-4" />} label="Subjects">{auto.subjects.slice(0, 6).join(', ')}{auto.subjects.length > 6 ? '…' : ''}</Fact>}
              {auto.batches.length > 0 && <Fact icon={<Clock className="h-4 w-4" />} label="Timings">{timingSummary(auto.batches)}</Fact>}
              {feeRange.length > 0 && <Fact icon={<IndianRupee className="h-4 w-4" />} label="Fees">{feeRange.length === 1 ? inr(feeRange[0]) : `${inr(Math.min(...feeRange))} – ${inr(Math.max(...feeRange))}`}</Fact>}
              {(inst.address || inst.city) && <Fact icon={<MapPin className="h-4 w-4" />} label="Address">{[inst.address, inst.city].filter(Boolean).join(', ')}</Fact>}
              {inst.phone && <Fact icon={<Phone className="h-4 w-4" />} label="Phone"><a href={`tel:${inst.phone}`} className="font-semibold hover:underline">{inst.phone}</a></Fact>}
            </ul>
            {w.demoEnabled && <button onClick={() => goForm('demo')} className="mt-5 w-full rounded-xl py-3 text-sm font-bold text-white" style={{ background: color }}>Book your free demo</button>}
          </div>
        </div>
      </section>

      {stats.length > 0 && (
        <section className="border-b border-slate-100 bg-slate-50">
          <div className={`mx-auto grid max-w-6xl grid-cols-2 gap-4 px-4 py-8 text-center ${({ 1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3' } as Record<number, string>)[stats.length] ?? 'lg:grid-cols-4'}`}>
            {stats.slice(0, 6).map((s, i) => <div key={i}><p className="text-2xl font-extrabold sm:text-3xl" style={{ color }}>{s.value}</p><p className="text-sm text-slate-500">{s.label}</p></div>)}
          </div>
        </section>
      )}

      {/* About + subjects */}
      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-14 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <SectionTitle color={color} kicker="About us">Welcome to {inst.name}</SectionTitle>
          <p className="mt-4 whitespace-pre-line leading-relaxed text-slate-600">{about}</p>
        </div>
        {auto.subjects.length > 0 && (
          <div className="rounded-3xl bg-slate-50 p-6">
            <p className="font-bold">Subjects we teach</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {auto.subjects.map((s) => <span key={s} className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm font-semibold shadow-sm"><BookOpen className="h-3.5 w-3.5" style={{ color }} />{s}</span>)}
            </div>
          </div>
        )}
      </section>

      {/* Why choose us */}
      <section className="bg-slate-50 py-14">
        <div className="mx-auto max-w-6xl px-4">
          <SectionTitle color={color} kicker="Why parents choose us" center>Learning that you can see every day</SectionTitle>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {WHY(!!auto.parentApp).map((f) => (
              <div key={f.title} className="rounded-2xl bg-white p-5 shadow-sm">
                <div className="grid h-11 w-11 place-items-center rounded-xl text-white" style={{ background: color }}><f.icon className="h-5 w-5" /></div>
                <p className="mt-4 font-bold">{f.title}</p>
                <p className="mt-1 text-sm text-slate-600">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Courses (owner) or batches & timings (live) */}
      {courses.length > 0 ? (
        <section id="courses" className="scroll-mt-20 py-14">
          <div className="mx-auto max-w-6xl px-4">
            <SectionTitle color={color} kicker="Courses & fees">Choose the right course</SectionTitle>
            <p className="mt-1 text-slate-500">Clear fees, duration and syllabus — no hidden charges.</p>
            <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {courses.map((c) => <CourseCard key={c._id} c={c} color={color} onEnquire={() => goForm(w.demoEnabled ? 'demo' : 'enquiry', c._id)} demo={w.demoEnabled} />)}
            </div>
          </div>
        </section>
      ) : null}
      {groups.length > 0 && (
        <section id="batches" className={`scroll-mt-20 py-14 ${courses.length ? 'bg-slate-50' : ''}`}>
          <div className="mx-auto max-w-6xl px-4">
            <SectionTitle color={color} kicker="Batches & timings">{courses.length ? 'Current batches' : 'Classes we run'}</SectionTitle>
            <p className="mt-1 text-slate-500">Pick a batch that suits your school timing. Call us to check seat availability.</p>
            <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {groups.map(([group, list]) => (
                <div key={group} className="flex flex-col rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                  <p className="flex items-center gap-2 text-lg font-extrabold"><GraduationCap className="h-5 w-5" style={{ color }} />{group}</p>
                  <ul className="mt-3 flex-1 space-y-2.5">
                    {list.map((b, i) => (
                      <li key={i} className="rounded-xl bg-slate-50 p-3 text-sm">
                        <p className="font-semibold">{b.subject || b.name}</p>
                        <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
                          <span className="flex items-center gap-1"><CalendarCheck className="h-3 w-3" />{daysText(b.days)}</span>
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{fmtTime(b.startTime)} – {fmtTime(b.endTime)}</span>
                          {b.teacher && <span className="flex items-center gap-1"><UserCheck className="h-3 w-3" />{b.teacher}</span>}
                        </p>
                      </li>
                    ))}
                  </ul>
                  <button onClick={() => goForm(w.demoEnabled ? 'demo' : 'enquiry')} className="mt-4 rounded-xl px-4 py-2.5 text-sm font-bold text-white" style={{ background: color }}>{w.demoEnabled ? 'Book a free demo' : 'Enquire'}</button>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Faculty */}
      {auto.teachers.length > 0 && (
        <section id="faculty" className="scroll-mt-20 py-14">
          <div className="mx-auto max-w-6xl px-4">
            <SectionTitle color={color} kicker="Our faculty">Learn from experienced teachers</SectionTitle>
            <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {auto.teachers.map((t) => (
                <div key={t.name} className="rounded-2xl border border-slate-100 p-5 text-center shadow-sm">
                  <div className="mx-auto grid h-16 w-16 place-items-center rounded-full text-lg font-extrabold text-white" style={{ background: `linear-gradient(135deg, ${color}, #0f172a)` }}>{initials(t.name)}</div>
                  <p className="mt-3 font-bold">{t.name}</p>
                  {t.subjects.length > 0 && <p className="text-sm font-semibold" style={{ color }}>{t.subjects.slice(0, 3).join(', ')}</p>}
                  {t.qualification && <p className="mt-1 text-xs text-slate-500">{t.qualification}</p>}
                  {t.years != null && t.years >= 1 && <p className="mt-1 text-xs text-slate-400">{t.years}+ year{t.years > 1 ? 's' : ''} with us</p>}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {w.toppers.length > 0 && (
        <section id="toppers" className="scroll-mt-20 bg-slate-50 py-14">
          <div className="mx-auto max-w-6xl px-4">
            <SectionTitle color={color} kicker="Results"><span className="inline-flex items-center gap-2"><Trophy className="h-7 w-7 text-amber-500" />Our toppers</span></SectionTitle>
            <div className="mt-8 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
              {w.toppers.map((t) => (
                <figure key={t._id} className="overflow-hidden rounded-2xl bg-white text-center shadow-sm">
                  <div className="aspect-[4/5] bg-slate-100">
                    {t.photoId ? <img src={publicFileUrl(t.photoId)} alt={t.name} loading="lazy" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-3xl font-extrabold text-slate-300">{initials(t.name)}</div>}
                  </div>
                  <figcaption className="p-3">
                    <p className="font-bold">{t.name}</p>
                    {t.result && <p className="text-lg font-extrabold" style={{ color }}>{t.result}</p>}
                    {t.year && <p className="text-xs text-slate-400">{t.year}</p>}
                    {t.quote && <p className="mt-1 text-xs italic text-slate-500">“{t.quote}”</p>}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      {w.testimonials.length > 0 && (
        <section id="reviews" className="scroll-mt-20 py-14">
          <div className="mx-auto max-w-6xl px-4">
            <SectionTitle color={color} kicker="Reviews">What parents & students say</SectionTitle>
            <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {w.testimonials.map((t) => (
                <blockquote key={t._id} className="rounded-2xl bg-slate-50 p-5">
                  <Quote className="h-6 w-6" style={{ color }} />
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{t.text}</p>
                  <div className="mt-3 flex items-center justify-between">
                    <div><p className="text-sm font-bold">{t.name}</p>{t.role && <p className="text-xs text-slate-400">{t.role}</p>}</div>
                    <span className="flex">{Array.from({ length: t.rating ?? 5 }, (_, i) => <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />)}</span>
                  </div>
                </blockquote>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* How admission works */}
      <section className="py-14" style={{ background: `${color}0d` }}>
        <div className="mx-auto max-w-6xl px-4">
          <SectionTitle color={color} kicker="Admission process" center>Join in 4 simple steps</SectionTitle>
          <ol className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Send, t: 'Send an enquiry', d: 'Fill the form below, call, or WhatsApp us.' },
              { icon: Laptop, t: w.demoEnabled ? 'Attend a free demo' : 'Visit the centre', d: w.demoEnabled ? 'Sit in a real class and meet the teacher.' : 'Meet our teachers and see the classrooms.' },
              { icon: Award, t: 'Take admission', d: 'Choose your batch and pay the fees in easy installments.' },
              auto.parentApp ? { icon: Smartphone, t: 'Get parent app access', d: 'Track attendance, results and fees from day one.' } : { icon: GraduationCap, t: 'Start classes', d: 'Join your batch and get the timetable and study plan.' },
            ].map((s, i) => (
              <li key={s.t} className="relative rounded-2xl bg-white p-5 shadow-sm">
                <span className="absolute right-4 top-4 text-3xl font-extrabold text-slate-100">{i + 1}</span>
                <s.icon className="h-6 w-6" style={{ color }} />
                <p className="mt-3 font-bold">{s.t}</p>
                <p className="mt-1 text-sm text-slate-600">{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Booking + contact */}
      <section id="book" className="scroll-mt-20 py-14">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 lg:grid-cols-2">
          <BookingForm slug={w.slug} kind={formKind} setKind={setFormKind} demoEnabled={w.demoEnabled} courses={courses} courseId={courseId} setCourseId={setCourseId} color={color} classes={auto.classes} />
          <div id="contact" className="scroll-mt-20 space-y-4">
            <SectionTitle color={color} kicker="Contact">Visit or call us</SectionTitle>
            <div className="space-y-3 rounded-2xl bg-slate-50 p-5">
              {(inst.address || inst.city) && <p className="flex gap-3 text-slate-700"><MapPin className="mt-0.5 h-5 w-5 shrink-0" style={{ color }} />{[inst.address, inst.city].filter(Boolean).join(', ')}</p>}
              {inst.phone && <a href={`tel:${inst.phone}`} className="flex gap-3 text-slate-700 hover:text-slate-900"><Phone className="h-5 w-5 shrink-0" style={{ color }} />{inst.phone}</a>}
              {inst.email && <a href={`mailto:${inst.email}`} className="flex gap-3 break-all text-slate-700 hover:text-slate-900"><Mail className="h-5 w-5 shrink-0" style={{ color }} />{inst.email}</a>}
              {auto.batches.length > 0 && <p className="flex gap-3 text-slate-700"><Clock className="mt-0.5 h-5 w-5 shrink-0" style={{ color }} />Classes: {timingSummary(auto.batches)}</p>}
              {w.mapUrl && <a href={w.mapUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold"><MapPin className="h-4 w-4" />Get directions on Google Maps</a>}
            </div>
            {whatsapp && (
              <a href={wa(whatsapp, waText)} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-800">
                <MessageCircle className="h-8 w-8" /><span><b>Talk to our counsellor on WhatsApp</b><br /><span className="text-sm">Ask about batches, fees and seats</span></span>
              </a>
            )}
            <Faq color={color} items={[
              ['Is the demo class really free?', w.demoEnabled ? 'Yes. Book a demo, attend a real class and decide only after that — no payment and no obligation.' : 'Call or WhatsApp us to visit the centre and meet the teachers before taking admission.'],
              ['What are the class timings?', auto.batches.length ? `Our batches run ${timingSummary(auto.batches)}. Exact timings for each class are listed above.` : 'Timings depend on the class and batch. Call us and we will suggest the best batch for your child.'],
              ['How much are the fees?', feeRange.length ? `Course fees start from ${inr(Math.min(...feeRange))}, payable in easy installments. See the course cards above for details.` : 'Fees depend on the class and subjects. Send an enquiry and we will share the complete fee details — installments are available.'],
              ['How will I know how my child is doing?', auto.parentApp ? 'You get our parent app: attendance alerts the same day, test results with rank, fees, notices and holidays — and you can message the teachers directly.' : 'We share test results and attendance with parents regularly, and you can call or WhatsApp us any time.'],
              ['How can I pay the fees?', auto.onlinePay ? 'Pay at the centre, or online from the parent app by UPI, card or net banking. You get a receipt for every payment.' : 'Fees are paid at the centre in easy installments, and you get a receipt for every payment.'],
            ]} />
          </div>
        </div>
      </section>

      <footer className="bg-slate-950 py-10 text-slate-400">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 text-sm sm:grid-cols-3">
          <div>
            <p className="font-extrabold text-white">{inst.name}</p>
            <p className="mt-1">{tagline}</p>
          </div>
          <div className="space-y-1">
            {nav.map(([id, l]) => <a key={id} href={`#${id}`} className="block hover:text-white">{l}</a>)}
          </div>
          <div className="space-y-1">
            {inst.phone && <a href={`tel:${inst.phone}`} className="block hover:text-white">{inst.phone}</a>}
            {inst.email && <a href={`mailto:${inst.email}`} className="block break-all hover:text-white">{inst.email}</a>}
            {(inst.address || inst.city) && <p>{[inst.address, inst.city].filter(Boolean).join(', ')}</p>}
          </div>
        </div>
        <p className="mt-8 text-center text-xs">© {thisYear} {inst.name}. All rights reserved.</p>
      </footer>

      {/* Mobile action bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t border-slate-200 bg-white md:hidden">
        {inst.phone ? <a href={`tel:${inst.phone}`} className="flex flex-col items-center gap-0.5 py-2 text-xs font-semibold text-slate-700"><Phone className="h-5 w-5" />Call</a> : <span />}
        {whatsapp ? <a href={wa(whatsapp, waText)} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-0.5 py-2 text-xs font-semibold text-emerald-600"><MessageCircle className="h-5 w-5" />WhatsApp</a> : <span />}
        <button onClick={() => goForm(w.demoEnabled ? 'demo' : 'enquiry')} className="flex flex-col items-center gap-0.5 py-2 text-xs font-bold text-white" style={{ background: color }}><CalendarCheck className="h-5 w-5" />{w.demoEnabled ? 'Free demo' : 'Enquire'}</button>
      </div>

      {whatsapp && (
        <a href={wa(whatsapp, waText)} target="_blank" rel="noreferrer" aria-label="Chat on WhatsApp"
          className="fixed bottom-5 right-5 z-40 hidden h-14 w-14 place-items-center rounded-full bg-emerald-500 text-white shadow-xl transition hover:scale-105 md:grid">
          <MessageCircle className="h-7 w-7" />
        </a>
      )}
    </div>
  );
}

/* ───────────────────────── helpers ───────────────────────── */

function listText(items: string[]) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Batches grouped by class / course (falls back to subject). */
function groupBatches(batches: AutoBatch[]): [string, AutoBatch[]][] {
  const map = new Map<string, AutoBatch[]>();
  for (const b of batches) {
    const k = b.course || b.subject || 'Batches';
    map.set(k, [...(map.get(k) ?? []), b]);
  }
  return [...map];
}

/** e.g. "7:00 AM – 7:30 PM, Mon – Sat" */
function timingSummary(batches: AutoBatch[]) {
  if (!batches.length) return '';
  const start = batches.map((b) => b.startTime).sort()[0];
  const end = batches.map((b) => b.endTime).sort().slice(-1)[0];
  const days = [...new Set(batches.flatMap((b) => b.days))];
  return `${fmtTime(start)} – ${fmtTime(end)}, ${daysText(days)}`;
}

function SectionTitle({ children, kicker, color, center }: { children: ReactNode; kicker: string; color: string; center?: boolean }) {
  return (
    <div className={center ? 'text-center' : ''}>
      <p className="text-xs font-bold uppercase tracking-widest" style={{ color }}>{kicker}</p>
      <h2 className="mt-1 text-2xl font-extrabold sm:text-3xl">{children}</h2>
    </div>
  );
}

function Fact({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">{icon}</span>
      <span><span className="block text-xs text-slate-400">{label}</span>{children}</span>
    </li>
  );
}

function Faq({ items, color }: { items: [string, string][]; color: string }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div id="faq" className="scroll-mt-20 pt-2">
      <p className="mb-2 font-bold">Frequently asked questions</p>
      <div className="divide-y divide-slate-100 rounded-2xl border border-slate-100">
        {items.map(([q, a], i) => (
          <div key={q}>
            <button onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold">
              {q}<ChevronDown className={`h-4 w-4 shrink-0 transition ${open === i ? 'rotate-180' : ''}`} style={{ color }} />
            </button>
            {open === i && <p className="px-4 pb-4 text-sm text-slate-600">{a}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function CourseCard({ c, color, onEnquire, demo }: { c: SiteData['courses'][number]; color: string; onEnquire: () => void; demo: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      {c.category && <p className="text-xs font-bold uppercase tracking-wide" style={{ color }}>{c.category}</p>}
      <h3 className="text-lg font-extrabold">{c.name}</h3>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {c.fee != null && <span className="flex items-center gap-1 font-bold"><IndianRupee className="h-4 w-4" />{inr(c.fee).slice(1)}{c.feeNote && <span className="font-normal text-slate-500">&nbsp;{c.feeNote}</span>}</span>}
        {c.duration && <span className="flex items-center gap-1 text-slate-600"><Clock className="h-4 w-4" />{c.duration}</span>}
      </div>
      {c.description && <p className="mt-3 text-sm text-slate-600">{c.description}</p>}
      {c.highlights.length > 0 && <ul className="mt-3 space-y-1">{c.highlights.map((h) => <li key={h} className="flex gap-2 text-sm text-slate-700"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />{h}</li>)}</ul>}
      {c.batches.length > 0 && (
        <div className="mt-3 space-y-1 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
          {c.batches.map((b) => <p key={b.name}><b>{b.name}</b> · {daysText(b.days)} · {fmtTime(b.startTime)}–{fmtTime(b.endTime)}</p>)}
        </div>
      )}
      {c.syllabus.length > 0 && (
        <>
          <button onClick={() => setOpen(!open)} className="mt-3 flex items-center gap-1 text-sm font-semibold" style={{ color }}>Syllabus ({c.syllabus.length} topics)<ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} /></button>
          {open && <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-sm text-slate-600">{c.syllabus.map((s, i) => <li key={i}>{s}</li>)}</ol>}
        </>
      )}
      <button onClick={onEnquire} className="mt-5 rounded-xl px-4 py-2.5 text-sm font-bold text-white" style={{ background: color }}>{demo ? 'Book a free demo' : 'Enquire'}</button>
    </div>
  );
}

function BookingForm({ slug, kind, setKind, demoEnabled, courses, courseId, setCourseId, color, classes }: {
  slug: string; kind: 'demo' | 'enquiry'; setKind: (k: 'demo' | 'enquiry') => void; demoEnabled: boolean; courses: SiteData['courses']; courseId: string; setCourseId: (v: string) => void; color: string; classes: string[];
}) {
  const [f, setF] = useState({ name: '', phone: '', studentName: '', studentClass: '', demoAt: '', message: '', company: '' });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
  const tomorrow = ymd(new Date(Date.now() + 86400000));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    setSending(true);
    try {
      await api.post(`/public/site/${slug}/enquiry`, { ...f, kind, courseId: courseId || undefined, demoAt: kind === 'demo' && f.demoAt ? f.demoAt : undefined });
      setSent(true);
    } catch (e2) {
      setErr(errMsg(e2));
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <CheckCircle2 className="h-12 w-12 text-emerald-600" />
        <h3 className="mt-3 text-xl font-extrabold text-emerald-900">Thank you!</h3>
        <p className="mt-1 text-emerald-800">{kind === 'demo' ? 'Your demo class request is booked. We will call you to confirm the time.' : 'We have received your enquiry and will call you shortly.'}</p>
      </div>
    );
  }

  const field = 'w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-slate-400';
  return (
    <form onSubmit={submit} className="rounded-3xl border border-slate-100 bg-white p-6 shadow-xl">
      {demoEnabled && (
        <div className="mb-5 grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-sm font-bold">
          {(['demo', 'enquiry'] as const).map((k) => (
            <button type="button" key={k} onClick={() => setKind(k)} className={`rounded-lg py-2 ${kind === k ? 'bg-white shadow' : 'text-slate-500'}`}>{k === 'demo' ? 'Free demo class' : 'Ask a question'}</button>
          ))}
        </div>
      )}
      <h2 className="text-xl font-extrabold">{kind === 'demo' ? 'Book your FREE demo class' : 'Send us an enquiry'}</h2>
      <p className="mb-4 text-sm text-slate-500">Takes 30 seconds. We'll call you back.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <input className={field} placeholder="Parent's name *" required value={f.name} onChange={set('name')} />
        <input className={field} placeholder="Mobile number *" required inputMode="tel" value={f.phone} onChange={set('phone')} />
        <input className={field} placeholder="Student's name" value={f.studentName} onChange={set('studentName')} />
        {classes.length > 0 && !courses.length ? (
          <select className={field} value={f.studentClass} onChange={set('studentClass')}>
            <option value="">Class / course</option>
            {classes.map((c) => <option key={c}>{c}</option>)}
            <option>Other</option>
          </select>
        ) : <input className={field} placeholder="Class (e.g. 10th)" value={f.studentClass} onChange={set('studentClass')} />}
        {courses.length > 0 && (
          <select className={field} value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            <option value="">Interested course</option>
            {courses.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
        )}
        {kind === 'demo' && <label className="text-xs text-slate-500">Preferred date<input type="date" min={tomorrow} className={field} value={f.demoAt} onChange={set('demoAt')} /></label>}
        <textarea className={`${field} sm:col-span-2`} rows={3} placeholder="Message (optional)" value={f.message} onChange={set('message')} />
        {/* Honeypot for bots — hidden from people. */}
        <input tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" value={f.company} onChange={set('company')} />
      </div>
      {err && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</p>}
      <button disabled={sending} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3 font-bold text-white disabled:opacity-60" style={{ background: color }}>
        <Send className="h-4 w-4" />{sending ? 'Sending…' : kind === 'demo' ? 'Book demo class' : 'Send enquiry'}
      </button>
      <p className="mt-2 flex items-center justify-center gap-1 text-center text-[11px] text-slate-400"><Users className="h-3 w-3" />Your details are only used to contact you about admissions.</p>
    </form>
  );
}
