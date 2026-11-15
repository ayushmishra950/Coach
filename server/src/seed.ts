import './config.js'; // pins the time zone before any demo date is generated
import bcrypt from 'bcryptjs';
import mongoose, { Types } from 'mongoose';
import { fileURLToPath } from 'node:url';
import {
  Announcement, Attendance, AuditLog, Batch, Conversation, DEFAULT_PLANS, Institute, Invoice, Message, Notification, Payment, Plan, Student,
  SubscriptionPayment, SupportTicket, Test, User, Salary, StaffAttendance, Course, Lead, Material, LeaveRequest,
} from './models/index.js';
import { DAYS, addDays, ymd } from './utils/dates.js';

// Deterministic PRNG so the demo looks the same every time
let _s = 42;
const rand = () => ((_s = (_s * 16807) % 2147483647) - 1) / 2147483646;
const pick = <T>(a: readonly T[]) => a[Math.floor(rand() * a.length)];
const between = (a: number, b: number) => Math.floor(a + rand() * (b - a + 1));

const FIRST_M = ['Rahul', 'Aman', 'Mohit', 'Arjun', 'Rohan', 'Karan', 'Vivek', 'Yash', 'Aditya', 'Harsh', 'Nikhil', 'Siddharth', 'Kunal', 'Dev', 'Ishaan', 'Manish', 'Raj', 'Tanmay', 'Varun', 'Pranav'];
const FIRST_F = ['Priya', 'Anjali', 'Sneha', 'Pooja', 'Neha', 'Riya', 'Kavya', 'Ananya', 'Isha', 'Simran', 'Tanvi', 'Meera', 'Diya', 'Aditi', 'Shreya', 'Nidhi', 'Khushi', 'Sakshi'];
const LAST = ['Sharma', 'Verma', 'Gupta', 'Singh', 'Agarwal', 'Jain', 'Mehta', 'Patel', 'Yadav', 'Mishra', 'Choudhary', 'Joshi', 'Saxena', 'Kumar', 'Bansal', 'Malhotra'];
const PARENT_M = ['Suresh', 'Ramesh', 'Mahesh', 'Rajendra', 'Anil', 'Sunil', 'Vinod', 'Ashok', 'Manoj', 'Sanjay'];
const phone = () => '9' + String(between(100000000, 999999999));

/**
 * Login details for the Super Admin and the demo institute's owner. Set them in the
 * environment (never in code) — otherwise the public demo logins are used.
 */
function seedAccounts() {
  const live = !!process.env.MONGO_URI || process.env.NODE_ENV === 'production';
  if (live && (!(process.env.SUPERADMIN_PASSWORD ?? '').trim() || !(process.env.OWNER_PASSWORD ?? '').trim())) {
    throw new Error('Refusing to seed a real database with the public demo passwords. Set SUPERADMIN_PASSWORD and OWNER_PASSWORD first.');
  }
  const env = (k: string) => (process.env[k] ?? '').trim().replace(/^["']|["']$/g, '');
  return {
    admin: {
      name: env('SUPERADMIN_NAME') || 'CoachFlow Admin',
      email: (env('SUPERADMIN_EMAIL') || 'admin@coachflow.in').toLowerCase(),
      password: env('SUPERADMIN_PASSWORD') || 'admin123',
      custom: !!env('SUPERADMIN_PASSWORD'),
    },
    owner: {
      name: env('OWNER_NAME') || 'Rajesh Kumar',
      email: (env('OWNER_EMAIL') || 'owner@coachflow.in').toLowerCase(),
      password: env('OWNER_PASSWORD') || 'owner123',
      custom: !!env('OWNER_PASSWORD'),
    },
  };
}

export async function seed() {
  _s = 42;
  const hash = (p: string) => bcrypt.hash(p, 10);
  const acc = seedAccounts();
  for (const p of DEFAULT_PLANS) await Plan.updateOne({ key: p.key }, { $setOnInsert: p }, { upsert: true });

  await User.create({ name: acc.admin.name, email: acc.admin.email, password: await hash(acc.admin.password), role: 'superadmin' });

  // ── Demo institute ────────────────────────────────────────────────
  const now = new Date();
  const inst = await Institute.create({
    name: 'ABC Coaching Institute',
    ownerName: acc.owner.name,
    email: 'rajesh@abccoaching.in',
    phone: '9876543210',
    address: '2nd Floor, Shanti Complex, MG Road',
    city: 'Jaipur',
    type: 'JEE/NEET & School Tuition',
    logoText: 'AB',
    plan: 'growth',
    billingCycle: 'monthly',
    status: 'active',
    currentPeriodEnd: addDays(now, 18),
    settings: { channels: { inApp: true, whatsapp: true, email: true, sms: false } },
    createdAt: addDays(now, -200),
  });
  const I = inst._id;
  await User.create({ name: acc.owner.name, email: acc.owner.email, phone: '9876543210', password: await hash(acc.owner.password), role: 'owner', instituteId: I });

  const teacherDefs = [
    { name: 'Amit Verma', email: 'teacher@coachflow.in', subjects: ['Mathematics'], qualification: 'M.Sc Mathematics' },
    { name: 'Neha Kapoor', email: 'neha@abccoaching.in', subjects: ['Science', 'Biology'], qualification: 'M.Sc Zoology' },
    { name: 'Vikram Rathore', email: 'vikram@abccoaching.in', subjects: ['Physics'], qualification: 'B.Tech, IIT Delhi' },
    { name: 'Sunita Joshi', email: 'sunita@abccoaching.in', subjects: ['English'], qualification: 'M.A. English' },
    { name: 'Deepak Saini', email: 'deepak@abccoaching.in', subjects: ['Chemistry'], qualification: 'M.Sc Chemistry' },
  ];
  const teachers: any[] = [];
  for (const t of teacherDefs) {
    teachers.push(await User.create({ ...t, phone: phone(), password: await hash('teacher123'), role: 'teacher', instituteId: I, joiningDate: addDays(now, -between(100, 700)), salary: between(25, 45) * 1000 }));
  }

  const batchDefs = [
    { name: 'Class 10 Mathematics — A', course: 'Class 10', subject: 'Mathematics', t: 0, days: ['Mon', 'Wed', 'Fri'], startTime: '17:00', endTime: '18:00', room: 'Room 1', color: '#6366f1' },
    { name: 'Class 10 Science — A', course: 'Class 10', subject: 'Science', t: 1, days: ['Tue', 'Thu', 'Sat'], startTime: '17:00', endTime: '18:00', room: 'Room 1', color: '#10b981' },
    { name: 'JEE Physics — 2027', course: 'JEE', subject: 'Physics', t: 2, days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], startTime: '07:00', endTime: '08:30', room: 'Hall A', color: '#f59e0b' },
    { name: 'NEET Biology — 2027', course: 'NEET', subject: 'Biology', t: 1, days: ['Mon', 'Wed', 'Fri', 'Sat'], startTime: '09:00', endTime: '10:30', room: 'Hall B', color: '#ec4899' },
    { name: 'Class 9 English', course: 'Class 9', subject: 'English', t: 3, days: ['Tue', 'Thu'], startTime: '16:00', endTime: '17:00', room: 'Room 2', color: '#0ea5e9' },
    { name: 'Class 12 Chemistry', course: 'Class 12', subject: 'Chemistry', t: 4, days: ['Mon', 'Wed', 'Fri'], startTime: '18:15', endTime: '19:30', room: 'Room 3', color: '#8b5cf6' },
    { name: 'Class 10 Mathematics — B', course: 'Class 10', subject: 'Mathematics', t: 0, days: ['Tue', 'Thu', 'Sat'], startTime: '18:15', endTime: '19:15', room: 'Room 2', color: '#14b8a6' },
  ];
  const batches: any[] = [];
  for (const b of batchDefs) batches.push(await Batch.create({ ...b, teacherId: teachers[b.t]._id, instituteId: I, capacity: 40 }));

  // Students: each course group joins related batches
  const groups: { course: string; batchIdx: number[]; n: number }[] = [
    { course: 'Class 10', batchIdx: [0, 1], n: 26 },
    { course: 'Class 10', batchIdx: [6, 1], n: 16 },
    { course: 'JEE', batchIdx: [2, 5], n: 18 },
    { course: 'NEET', batchIdx: [3, 5], n: 14 },
    { course: 'Class 9', batchIdx: [4], n: 12 },
  ];
  const students: (mongoose.HydratedDocument<any> & { _ability: number })[] = [];
  let code = 0;
  for (const g of groups) {
    for (let i = 0; i < g.n; i++) {
      const female = rand() < 0.45;
      let name = `${pick(female ? FIRST_F : FIRST_M)} ${pick(LAST)}`;
      if (code === 0) name = 'Rahul Sharma';
      const last = name.split(' ')[1];
      const parentName = `${pick(PARENT_M)} ${last}`;
      code++;
      const s = await Student.create({
        instituteId: I,
        studentCode: `STU-${String(code).padStart(4, '0')}`,
        name,
        phone: phone(),
        gender: female ? 'female' : 'male',
        dob: new Date(2008 + between(0, 4), between(0, 11), between(1, 28)),
        address: `${between(1, 250)}, ${pick(['Malviya Nagar', 'Vaishali Nagar', 'Mansarovar', 'C-Scheme', 'Raja Park', 'Jagatpura'])}, Jaipur`,
        parentName,
        parentPhone: phone(),
        parentEmail: code === 1 ? 'parent@coachflow.in' : `${parentName.split(' ')[0].toLowerCase()}.${last.toLowerCase()}${code}@gmail.com`,
        course: g.course,
        batchIds: g.batchIdx.map((x) => batches[x]._id),
        joiningDate: addDays(now, -between(60, 190)),
      });
      (s as any)._ability = code === 1 ? 0.84 : 0.35 + rand() * 0.6;
      (s as any)._attend = code === 1 ? 0.93 : 0.72 + rand() * 0.27;
      students.push(s as any);
    }
  }
  const counter = code;

  // Parent login for Rahul
  const rahul = students[0];
  const parent = await User.create({ name: rahul.parentName, email: 'parent@coachflow.in', phone: rahul.parentPhone, password: await hash('parent123'), role: 'parent', instituteId: I, studentIds: [rahul._id] });
  rahul.parentUserId = parent._id;
  await rahul.save();

  // Chronic absentees for smart alerts
  const absentees = new Set([students[5], students[30], students[47], students[70]].filter(Boolean).map((s) => String(s._id)));

  // ── Attendance: last 45 days ──────────────────────────────────────
  const attDocs = [];
  for (let d = 45; d >= 1; d--) {
    const date = addDays(now, -d);
    const day = DAYS[date.getDay()];
    for (const b of batches) {
      if (!b.days.includes(day as never)) continue;
      const members = students.filter((s) => s.batchIds.some((x: Types.ObjectId) => String(x) === String(b._id)));
      attDocs.push({
        instituteId: I,
        batchId: b._id,
        date: ymd(date),
        markedBy: b.teacherId,
        records: members.map((s) => {
          const streak = absentees.has(String(s._id)) && d <= 9;
          const r = rand();
          return { studentId: s._id, status: streak ? 'absent' : r < (s as any)._attend ? (r < 0.04 ? 'late' : 'present') : 'absent' };
        }),
      });
    }
  }
  // Today: first scheduled batch already marked
  const today = DAYS[now.getDay()];
  const todays = batches.filter((b) => b.days.includes(today as never));
  if (todays[0]) {
    const members = students.filter((s) => s.batchIds.some((x: Types.ObjectId) => String(x) === String(todays[0]._id)));
    attDocs.push({
      instituteId: I, batchId: todays[0]._id, date: ymd(now), markedBy: todays[0].teacherId,
      records: members.map((s) => ({ studentId: s._id, status: absentees.has(String(s._id)) || rand() > (s as any)._attend ? 'absent' : 'present' })),
    });
  }
  await Attendance.insertMany(attDocs);

  // ── Teacher check-in / check-out for the last 3 weeks (+ today) ─────
  const staffDocs: any[] = [];
  const clock = (base: Date, h: number, m: number) => { const x = new Date(base); x.setHours(h, m, 0, 0); return x; };
  for (let d = 21; d >= 0; d--) {
    const date = addDays(now, -d);
    if (date.getDay() === 0) continue; // Sundays off
    for (const t of teachers) {
      const r = rand();
      if (d > 0 && r < 0.06) { staffDocs.push({ instituteId: I, teacherId: t._id, date: ymd(date), status: 'leave', ownerNote: 'Personal leave' }); continue; }
      const inMin = 8 * 60 + 45 + Math.floor(rand() * 45); // 8:45 – 9:30
      const checkIn = clock(date, Math.floor(inMin / 60), inMin % 60);
      const lateBy = inMin - 9 * 60;
      const row: any = { instituteId: I, teacherId: t._id, date: ymd(date), status: 'present', checkIn, late: lateBy > 15, lateBy: lateBy > 15 ? lateBy : 0 };
      if (d > 0 && rand() > 0.04) {
        const outMin = 17 * 60 + 30 + Math.floor(rand() * 60);
        row.checkOut = clock(date, Math.floor(outMin / 60), outMin % 60);
        row.minutes = Math.round((row.checkOut.getTime() - checkIn.getTime()) / 60000);
        row.earlyLeave = outMin < 18 * 60;
      }
      if (d === 0 && (checkIn > now || rand() < 0.3)) continue; // some teachers haven't come in yet today
      staffDocs.push(row);
    }
  }
  await StaffAttendance.insertMany(staffDocs);

  // ── Teacher salaries: two months back paid, last month partly paid (shows overdue) ──
  const mKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const salaryDocs: any[] = [];
  for (const back of [3, 2, 1]) {
    const workMonth = new Date(now.getFullYear(), now.getMonth() - back, 1);
    const due = new Date(now.getFullYear(), now.getMonth() - back + 1, 1);
    teachers.forEach((t, i) => {
      const paid = back > 1 || i % 2 === 0;
      salaryDocs.push({
        instituteId: I, teacherId: t._id, month: mKey(workMonth), baseAmount: t.salary, amount: t.salary, dueDate: due,
        paidAmount: paid ? t.salary : 0, status: paid ? 'paid' : 'pending', paidAt: paid ? addDays(due, 1) : undefined,
        payments: paid ? [{ amount: t.salary, method: 'bank', paidAt: addDays(due, 1) }] : [],
      });
    });
  }
  await Salary.insertMany(salaryDocs);
  await Institute.updateOne({ _id: I }, { $set: { 'settings.salary.trackFrom': new Date(now.getFullYear(), now.getMonth() - 3, 1) } });

  // ── Fees: 3 installments per student, ~ ₹24k–36k annual ────────────
  let receipt = 0;
  const payments = [];
  for (const s of students) {
    const annual = s.course === 'JEE' || s.course === 'NEET' ? pick([36000, 42000, 45000]) : pick([18000, 24000, 24000, 27000]);
    const inst1 = Math.floor(annual / 3);
    const join = s.joiningDate as Date;
    for (let k = 0; k < 3; k++) {
      const due = new Date(join.getFullYear(), join.getMonth() + k * 3, 10);
      const amount = k === 2 ? annual - inst1 * 2 : inst1;
      const isPast = due < now;
      const reliable = (s as any)._attend > 0.8 || rand() < 0.5;
      let paidAmount = 0;
      if (isPast && (k === 0 || reliable)) paidAmount = amount;
      else if (isPast && rand() < 0.3) paidAmount = Math.round(amount / 2);
      else if (!isPast && rand() < 0.2) paidAmount = amount;
      if (s === rahul) paidAmount = k < 2 ? amount : 0;
      const inv = await Invoice.create({
        instituteId: I, studentId: s._id, title: `Installment ${k + 1}`, installmentNo: k + 1, amount, paidAmount, dueDate: due,
        status: paidAmount >= amount ? 'paid' : paidAmount > 0 ? 'partial' : 'pending',
      });
      if (paidAmount > 0) {
        receipt++;
        const paidAt = addDays(due < now ? due : now, -between(0, 6));
        payments.push({
          instituteId: I, studentId: s._id, invoiceId: inv._id, amount: paidAmount,
          method: pick(['cash', 'upi', 'upi', 'online', 'bank']), receiptNo: `CF-${paidAt.getFullYear()}-${String(receipt).padStart(5, '0')}`,
          paidAt: paidAt > now ? now : paidAt,
        });
      }
    }
  }
  await Payment.insertMany(payments);

  // ── Tests ──────────────────────────────────────────────────────────
  const topics: Record<string, string[]> = {
    Mathematics: ['Algebra', 'Quadratic Equations', 'Trigonometry', 'Coordinate Geometry', 'Statistics'],
    Science: ['Chemical Reactions', 'Life Processes', 'Electricity', 'Light'],
    Physics: ['Kinematics', 'Laws of Motion', 'Work, Energy & Power', 'Rotational Motion'],
    Biology: ['Cell Biology', 'Plant Physiology', 'Human Physiology', 'Genetics'],
    English: ['Grammar — Tenses', 'Reading Comprehension', 'Letter Writing'],
    Chemistry: ['Mole Concept', 'Atomic Structure', 'Chemical Bonding', 'Thermodynamics'],
  };
  const hardness: Record<string, number> = { 'Trigonometry': -0.18, 'Rotational Motion': -0.2, 'Genetics': -0.12, 'Thermodynamics': -0.16, 'Electricity': -0.1 };
  for (const b of batches) {
    const members = students.filter((s) => s.batchIds.some((x: Types.ObjectId) => String(x) === String(b._id)));
    const list = topics[b.subject!];
    const n = Math.min(list.length, 4);
    for (let k = 0; k < n; k++) {
      const topic = list[k];
      const date = addDays(now, -(n - k) * 9 + between(-2, 1));
      const max = pick([25, 50, 50, 100]);
      const isLatest = k === n - 1;
      const pending = isLatest && (b === batches[0] || b === batches[3] || b === batches[5]);
      await Test.create({
        instituteId: I, batchId: b._id, subject: b.subject, topic, maxMarks: max, date, createdBy: b.teacherId,
        status: pending ? 'scheduled' : isLatest && b === batches[2] ? 'graded' : 'published',
        publishedAt: pending ? undefined : addDays(date, 2),
        results: pending ? [] : members.map((s) => {
          const absent = rand() < 0.05;
          const trend = k * 0.02 * (rand() < 0.5 ? 1 : -1);
          const p = Math.max(0.08, Math.min(1, (s as any)._ability + (hardness[topic] ?? 0) + trend + (rand() - 0.5) * 0.2));
          return { studentId: s._id, absent, marks: absent ? null : Math.round(p * max) };
        }),
      });
    }
  }
  // Upcoming test
  await Test.create({ instituteId: I, batchId: batches[0]._id, subject: 'Mathematics', topic: 'Statistics', maxMarks: 50, date: addDays(now, 3), createdBy: batches[0].teacherId });

  // ── Announcements & notifications ─────────────────────────────────
  await Announcement.create([
    { instituteId: I, title: 'Diwali holidays', body: 'The institute will remain closed from 30 Oct to 3 Nov. Regular classes resume on 4 Nov.', pinned: true, createdByName: acc.owner.name, createdAt: addDays(now, -2) },
    { instituteId: I, title: "Tomorrow's class timing changed", body: 'Class 10 Mathematics — A will be held at 6:00 PM tomorrow instead of 5:00 PM.', batchIds: [batches[0]._id], createdByName: 'Amit Verma', createdAt: addDays(now, -1) },
    { instituteId: I, title: 'JEE mock test series', body: 'Full-length JEE mock tests start every Sunday from next week, 9 AM – 12 PM in Hall A.', batchIds: [batches[2]._id, batches[5]._id], createdByName: acc.owner.name, createdAt: addDays(now, -5) },
  ]);
  const notes = [
    { type: 'attendance', audience: 'parent', studentId: rahul._id, title: 'Absent today', message: 'Rahul Sharma was absent today from Class 10 Science — A.', createdAt: addDays(now, -6) },
    { type: 'fee', audience: 'parent', studentId: rahul._id, title: 'Fee reminder', message: 'Reminder: Rahul Sharma\'s fee installment of ₹8,000 is due soon.', createdAt: addDays(now, -1) },
    { type: 'test', audience: 'parent', studentId: rahul._id, title: 'Mathematics result published', message: 'Rahul Sharma scored 42/50 in Mathematics — Trigonometry.', createdAt: addDays(now, -3) },
    { type: 'attendance', audience: 'owner', studentId: students[5]._id, title: 'Attendance alert', message: `${students[5].name} has been absent for 3 consecutive classes.`, createdAt: addDays(now, -1) },
    { type: 'payment', audience: 'owner', title: 'Fee collected', message: '₹8,000 received from Aman Gupta via UPI — CF-2026-00211', createdAt: addDays(now, 0) },
    { type: 'system', audience: 'owner', title: 'Welcome to CoachFlow 👋', message: 'Your institute is set up. Explore attendance, fees and reports from the sidebar.', createdAt: addDays(now, -30) },
  ];
  await Notification.insertMany(notes.map((n) => ({ ...n, instituteId: I, deliveries: [{ channel: 'inApp', status: 'sent' }, ...(n.audience === 'parent' ? [{ channel: 'whatsapp', to: rahul.parentPhone, status: 'queued', info: 'Demo mode' }] : [])] })));

  await Institute.updateOne({ _id: I }, { 'counters.student': counter, 'counters.receipt': receipt });

  // ── Courses, admissions website, enquiries ────────────────────────
  await Course.create([
    { instituteId: I, name: 'Class 10 Board Excellence', category: 'School (Class 9–10)', duration: '11 months', fee: 24000, feeNote: 'per year · 3 installments', order: 1,
      description: 'Complete Maths & Science for CBSE Class 10 with weekly tests and doubt sessions.',
      syllabus: ['Real Numbers', 'Polynomials', 'Linear Equations', 'Quadratic Equations', 'Trigonometry', 'Statistics', 'Chemical Reactions', 'Life Processes', 'Electricity', 'Light'],
      highlights: ['Weekly chapter tests', 'Printed notes', 'Parent app with attendance & results'], batchIds: [batches[0]._id, batches[1]._id, batches[6]._id] },
    { instituteId: I, name: 'JEE Main + Advanced (2-year)', category: 'JEE', duration: '2 years', fee: 95000, feeNote: 'per year', order: 2,
      description: 'Physics, Chemistry and Maths for JEE with full-length mock tests every Sunday.',
      syllabus: ['Kinematics', "Newton's Laws", 'Work, Energy & Power', 'Rotational Motion', 'Electrostatics', 'Mole Concept', 'Organic Basics', 'Calculus'],
      highlights: ['IIT-qualified faculty', 'Online MCQ practice tests', 'All-India test series'], batchIds: [batches[2]._id, batches[5]._id] },
    { instituteId: I, name: 'NEET Biology Intensive', category: 'NEET', duration: '12 months', fee: 60000, feeNote: 'per year', order: 3,
      description: 'NCERT-focused Biology with daily practice questions.', syllabus: ['Cell Biology', 'Genetics', 'Human Physiology', 'Plant Physiology', 'Ecology'],
      highlights: ['NCERT line-by-line', 'Daily DPPs'], batchIds: [batches[3]._id] },
  ]);
  await Institute.updateOne({ _id: I }, { $set: { website: {
    enabled: true, slug: 'abc-coaching', demoEnabled: true, whatsapp: '9876543210',
    tagline: 'Jaipur’s trusted coaching for Class 9–12, JEE & NEET since 2012',
    about: 'ABC Coaching Institute has helped 3,000+ students since 2012. Small batches (max 40), experienced faculty, weekly tests and a parent app that shows attendance, results and fees in real time.',
    stats: [{ value: '14 yrs', label: 'Teaching experience' }, { value: '3000+', label: 'Students taught' }, { value: '96%', label: 'Board pass rate' }, { value: '120+', label: 'JEE / NEET selections' }],
    toppers: [
      { name: 'Ananya Gupta', result: '98.6% · CBSE 10', year: '2026' }, { name: 'Rohan Mehta', result: 'AIR 1,240 · JEE Adv', year: '2026' },
      { name: 'Sneha Kapoor', result: '655/720 · NEET', year: '2026' }, { name: 'Arjun Singh', result: '97.2% · CBSE 12', year: '2025' },
    ],
    testimonials: [
      { name: 'Mrs. Sunita Sharma', role: 'Parent of a Class 10 student', text: 'Regular tests and the parent app keep us informed every day. My son’s maths improved from 62% to 88%.', rating: 5 },
      { name: 'Rohan Mehta', role: 'JEE 2026', text: 'Sunday mock tests and doubt sessions made the real exam feel easy.', rating: 5 },
    ],
  } } });
  const leadDefs: [string, string, string, string, string, number, string?][] = [
    ['Mr. Vikas Jain', '9811122233', 'Class 10', 'website', 'new', 0, 'Is there a batch in the evening?'],
    ['Mrs. Pooja Rathore', '9822233344', 'JEE', 'demo_form', 'demo_scheduled', -1],
    ['Mr. Anil Saini', '9833344455', 'Class 9', 'walk_in', 'contacted', -3],
    ['Ms. Kavita Rao', '9844455566', 'NEET', 'phone', 'demo_done', -6],
    ['Mr. Deepak Joshi', '9855566677', 'Class 10', 'referral', 'converted', -12],
    ['Mrs. Nidhi Arora', '9866677788', 'Class 12', 'website', 'lost', -20],
  ];
  await Lead.insertMany(leadDefs.map(([name, phone, cls, source, status, d, message]) => ({
    instituteId: I, name, phone, studentClass: cls, source, status, message, kind: source === 'demo_form' ? 'demo' : 'enquiry',
    courseName: cls === 'JEE' ? 'JEE Main + Advanced (2-year)' : cls === 'NEET' ? 'NEET Biology Intensive' : 'Class 10 Board Excellence',
    demoAt: status === 'demo_scheduled' ? addDays(now, 2) : undefined, demoBatchId: status === 'demo_scheduled' ? batches[2]._id : undefined,
    followUpAt: ['converted', 'lost'].includes(status) ? undefined : addDays(now, status === 'new' ? 0 : 1),
    lostReason: status === 'lost' ? 'Fees too high' : undefined,
    notes: [{ text: source === 'website' || source === 'demo_form' ? 'Enquiry from the website' : 'Added by office', by: 'Office', at: addDays(now, d) }],
    createdAt: addDays(now, d),
  })));

  // ── Syllabus progress, study material, an online MCQ test, a leave request ──
  const sylTopics = ['Real Numbers', 'Polynomials', 'Pair of Linear Equations', 'Quadratic Equations', 'Arithmetic Progressions', 'Triangles', 'Coordinate Geometry', 'Trigonometry', 'Circles', 'Statistics', 'Probability'];
  for (const b of [batches[0], batches[6]]) {
    b.syllabus = sylTopics.map((title: string, i: number) => ({ title, subject: 'Mathematics', done: i < 7, doneAt: i < 7 ? addDays(now, -70 + i * 9) : undefined, doneByName: i < 7 ? teachers[0].name : undefined }));
    await b.save();
  }
  await Material.insertMany([
    { instituteId: I, batchIds: [batches[0]._id, batches[6]._id], title: 'Trigonometry — formula sheet', kind: 'link', subject: 'Mathematics', url: 'https://ncert.nic.in/textbook.php?jemh1=8-15', uploadedBy: teachers[0]._id, uploadedByName: teachers[0].name, createdAt: addDays(now, -4) },
    { instituteId: I, batchIds: [batches[0]._id], title: 'Quadratic Equations — recorded class', kind: 'video', subject: 'Mathematics', url: 'https://www.youtube.com/results?search_query=quadratic+equations+class+10', uploadedBy: teachers[0]._id, uploadedByName: teachers[0].name, createdAt: addDays(now, -2) },
    { instituteId: I, batchIds: [batches[0]._id], title: 'Exercise 8.1 (all questions)', kind: 'assignment', subject: 'Mathematics', description: 'Solve in your notebook and bring it to the next class.', dueDate: addDays(now, 2), uploadedBy: teachers[0]._id, uploadedByName: teachers[0].name, createdAt: addDays(now, -1) },
  ]);
  await Test.create({
    instituteId: I, batchId: batches[0]._id, subject: 'Mathematics', topic: 'Trigonometry quick quiz', date: now, createdBy: teachers[0]._id,
    mode: 'online', durationMins: 10, maxMarks: 4, opensAt: addDays(now, -1), closesAt: addDays(now, 5), showAnswers: true,
    questions: [
      { text: 'sin²θ + cos²θ = ?', options: ['0', '1', '2', 'tan θ'], correct: 1, marks: 1, explanation: 'Basic identity.' },
      { text: 'tan 45° = ?', options: ['0', '1/√2', '1', '√3'], correct: 2, marks: 1 },
      { text: 'sin 30° = ?', options: ['1/2', '√3/2', '1', '0'], correct: 0, marks: 1 },
      { text: 'cos 60° = ?', options: ['√3/2', '1/2', '0', '1'], correct: 1, marks: 1 },
    ],
  });
  await LeaveRequest.create({ instituteId: I, studentId: students[1]._id, from: ymd(addDays(now, 1)), to: ymd(addDays(now, 2)), reason: 'Family function out of town', status: 'pending' });
  await Announcement.create([
    { instituteId: I, title: 'Parent-Teacher Meeting', body: 'PTM for Class 10 batches. Please meet the subject teachers between 10 AM and 1 PM.', category: 'ptm', eventDate: addDays(now, 6), batchIds: [batches[0]._id, batches[1]._id], createdByName: acc.owner.name },
    { instituteId: I, title: 'Extra class: Trigonometry revision', body: 'Extra revision class for Class 10 Maths — A at 4 PM.', category: 'extra_class', eventDate: addDays(now, 3), batchIds: [batches[0]._id], createdByName: teachers[0].name },
  ]);

  // ── Demo chats (in-app messaging) ────────────────────────────────
  const owner = (await User.findOne({ email: acc.owner.email }))!;
  const amit = teachers[0];
  const chat = async (a: { _id: Types.ObjectId; role: string }, b: { _id: Types.ObjectId; role: string }, lines: [0 | 1, string, number][]) => {
    const conv = await Conversation.create({
      instituteId: I,
      key: [String(a._id), String(b._id)].sort().join('_'),
      members: [{ userId: a._id, role: a.role }, { userId: b._id, role: b.role }],
    });
    const people = [a, b];
    let last: { text: string; senderId: Types.ObjectId; at: Date } | null = null;
    for (const [who, text, minsAgo] of lines) {
      const at = new Date(now.getTime() - minsAgo * 60_000);
      await Message.create({ instituteId: I, conversationId: conv._id, senderId: people[who]._id, text, createdAt: at, updatedAt: at });
      last = { text, senderId: people[who]._id, at };
    }
    // `a` has read everything; `b` has the last message from `a` unread if `a` sent it.
    const unreadForB = last && String(last.senderId) === String(a._id) ? 1 : 0;
    await Conversation.updateOne(
      { _id: conv._id },
      { $set: { lastMessage: last, members: [
        { userId: a._id, role: a.role, unread: 0, lastReadAt: last?.at },
        { userId: b._id, role: b.role, unread: unreadForB, lastReadAt: unreadForB ? new Date(last!.at.getTime() - 1000) : last?.at },
      ], updatedAt: last?.at } },
      { timestamps: false },
    );
  };
  await chat(parent, owner, [
    [0, 'Namaste sir, Rahul will be late tomorrow — he has a school function till 5 PM.', 180],
    [1, 'Noted, thank you for letting us know. Amit sir will share the class notes with him.', 170],
    [0, 'Thank you! Also, can we pay the next installment in two parts?', 60],
  ]);
  await chat(amit, parent, [
    [0, 'Hello! Rahul did very well in the Trigonometry test — 42/50. Please ask him to revise Heights & Distances once.', 1500],
    [1, 'That is great news, thank you sir. I will make sure he revises it this weekend.', 1440],
    [0, 'Sure. Extra practice sheet is shared in class today 👍', 25],
  ]);
  await chat(owner, amit, [
    [0, 'Amit, the Class 10 Maths — A test on Statistics is on Friday, right?', 300],
    [1, 'Yes sir, 50 marks. I will enter marks the same evening.', 290],
  ]);

  // ── Other SaaS tenants (for the Super Admin panel) ───────────────
  const cities = ['Kota', 'Indore', 'Lucknow', 'Pune', 'Patna', 'Delhi', 'Bhopal', 'Nagpur', 'Ahmedabad', 'Chandigarh', 'Dehradun', 'Ranchi'];
  const kinds = ['JEE/NEET', 'SSC/Banking', 'English Speaking', 'Computer Institute', 'Coding Academy', 'School Tuition'];
  const names = ['Excel', 'Vidya', 'Pinnacle', 'Gurukul', 'Brilliant', 'Success Point', 'Career Plus', 'Target', 'Aakash Study', 'Toppers', 'Shiksha', 'Vision', 'Apex', 'Unique', 'Mentors', 'Pathshala', 'Nova', 'Prime', 'Akshara', 'Elite', 'Genius', 'Momentum', 'Crest', 'Scholars'];
  const tenants: any[] = [inst];
  for (let i = 0; i < names.length; i++) {
    const created = addDays(now, -between(5, 190));
    const status = pick(['active', 'active', 'active', 'active', 'trial', 'trial', 'cancelled', 'past_due']);
    const plan = pick(['starter', 'growth', 'growth', 'premium', 'premium']);
    const t = await Institute.create({
      name: `${names[i]} ${pick(['Classes', 'Academy', 'Institute', 'Coaching Centre', 'Tutorials'])}`,
      ownerName: `${pick(PARENT_M)} ${pick(LAST)}`,
      email: `contact@${names[i].toLowerCase().replace(/\s/g, '')}.in`,
      phone: phone(),
      city: pick(cities),
      type: pick(kinds),
      plan: status === 'trial' ? 'premium' : plan,
      billingCycle: rand() < 0.25 ? 'yearly' : 'monthly',
      status,
      trialEndsAt: status === 'trial' ? addDays(created, 30) : undefined,
      currentPeriodEnd: addDays(now, between(1, 28)),
      createdAt: created,
    });
    tenants.push(t);
  }
  const plans = await Plan.find().lean();
  const subPays = [];
  for (const t of tenants) {
    if (t.status === 'trial') continue;
    const p = plans.find((x) => x.key === t.plan)!;
    for (let m = 5; m >= 0; m--) {
      const at = new Date(now.getFullYear(), now.getMonth() - m, between(1, 27));
      if (at < (t.createdAt as Date)) continue;
      if (t.billingCycle === 'yearly' && m !== 5) continue;
      const failed = (t.status === 'past_due' && m === 0) || rand() < 0.04;
      subPays.push({
        instituteId: t._id, plan: t.plan, cycle: t.billingCycle, amount: t.billingCycle === 'yearly' ? p.priceYearly : p.priceMonthly,
        status: failed ? 'failed' : 'success', failureReason: failed ? pick(['Card declined', 'Insufficient funds', 'UPI mandate expired']) : undefined,
        reference: 'pay_' + Math.random().toString(36).slice(2, 12), createdAt: at,
      });
    }
  }
  await SubscriptionPayment.insertMany(subPays);
  await SupportTicket.create([
    { instituteId: tenants[3]._id, subject: 'Unable to import students from Excel', message: 'The CSV import shows an error for the date of birth column.', priority: 'high', status: 'open' },
    { instituteId: tenants[7]._id, subject: 'WhatsApp messages not delivered', message: 'Parents are not receiving attendance messages since yesterday.', priority: 'high', status: 'in_progress' },
    { instituteId: I, subject: 'Need GST on fee receipts', message: 'Can we show our GST number on fee receipts?', priority: 'normal', status: 'open' },
    { instituteId: tenants[11]._id, subject: 'How to change batch timing?', message: 'Where can I change the class time for a batch?', priority: 'low', status: 'resolved', replies: [{ by: 'CoachFlow Support', text: 'Go to Batches → Edit and update the timing. 🙂' }] },
  ]);
  await AuditLog.create({ instituteId: I, userName: 'System', action: 'seed', entity: 'institute', entityId: String(I) });

  console.log('✓ Demo data ready');
  console.log(`  Super Admin : ${acc.admin.email}${acc.admin.custom ? ' (password from SUPERADMIN_PASSWORD)' : ' / admin123'}`);
  console.log(`  Owner       : ${acc.owner.email}${acc.owner.custom ? ' (password from OWNER_PASSWORD)' : ' / owner123'}`);
  console.log('  Teacher     : teacher@coachflow.in / teacher123');
  console.log('  Parent      : parent@coachflow.in  / parent123');
}

// `npm run seed` — wipe and reseed
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { connectDB } = await import('./db.js');
  await connectDB();
  if (process.argv.includes('--force')) {
    if ((process.env.MONGO_URI ?? '').trim() || process.env.NODE_ENV === 'production') {
      if (process.env.ALLOW_DESTRUCTIVE !== 'I_UNDERSTAND') {
        console.error('✗ Refusing to WIPE a real database. This deletes every collection of MONGO_URI.\n  If you really mean it, run with ALLOW_DESTRUCTIVE=I_UNDERSTAND.');
        process.exit(1);
      }
    }
    const db = mongoose.connection.db!;
    for (const c of await db.collections()) await c.deleteMany({});
  }
  await seed();
  await mongoose.disconnect();
  process.exit(0);
}
