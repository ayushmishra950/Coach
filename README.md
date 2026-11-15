# CoachFlow — Your Coaching Institute. One Simple Dashboard.

A multi-tenant **MERN + TypeScript** SaaS for small and mid-sized coaching institutes. It covers students, teachers, batches, attendance, fees, tests and marks, parent communication, reports, AI insights, subscriptions and a Super Admin panel.

```
client/   React 18 + Vite + TypeScript + Tailwind + Recharts
server/   Node + Express + TypeScript + MongoDB (Mongoose) + JWT
```

## Quick start

```bash
npm run install:all     # installs root, server and client deps (run again after pulling — adds socket.io)
npm run dev             # API on :4600, web on :5173
```

Open **http://localhost:5173**.

No MongoDB installation is required. If `MONGO_URI` is empty in `server/.env`, the API starts an embedded MongoDB that persists to `server/.mongo-data/`. On the first start it seeds demo data. For production, set `MONGO_URI` to a MongoDB Atlas or other managed database.

| Role | Email | Password |
|---|---|---|
| Institute Owner | owner@coachflow.in | owner123 |
| Teacher | teacher@coachflow.in | teacher123 |
| Parent | parent@coachflow.in | parent123 |
| Super Admin | admin@coachflow.in | admin123 |

The Login page also has one-click demo buttons. To reset the demo data, run `npm run seed`.

## Features (mapped to the case study)

| Module | What's built |
|---|---|
| **Dashboard** | Greeting, student/teacher/batch counts, today's attendance, fees collected vs pending, *Action Required* list, 3-consecutive-absence alerts, today's classes, recent payments, upcoming dues, Premium card |
| **Students** | Add/edit/deactivate, parent and academic info, auto student ID, CSV import, profile with attendance %, average score, subject-wise chart, fees, notes, parent-portal login |
| **Teachers** | Create logins, subjects, batches, reset password, plan limits |
| **Staff check-in** | Teachers tap **Check in / Check out** on their dashboard (server clock, optional GPS). Owner sees who is in right now (live), late arrivals, early leaves, hours worked, missed check-outs, a monthly day-by-day grid and CSV export; owner can add or correct any day (leave / absent / half day) — every edit is audited |
| **Teacher salaries** | Monthly salary sheet created automatically from each teacher's salary (pro-rated in the joining month). Bonus / deduction, full or part payments (bank / UPI / cash / cheque), undo. **Automatic owner reminders** before, on and after pay day until paid; the teacher is told on pay day and when paid |
| **Batches** | Batch → class → teacher → students, schedule (days/time/room), performance and attendance trend |
| **Attendance** | Mobile-first marking (Present/Absent/Late), parent notification on absence, smart alert after N consecutive absences, register matrix plus CSV |
| **Fees** | Installment structures, collect payments (cash/UPI/bank/card), printable receipts `CF-2026-00001`, reminders (before, on and after the due date), 12-month collection chart |
| **Online payment** | Parent **Pay Now**, which updates the payment record, generates a receipt and notifies the parent (demo gateway, Razorpay-ready hook) |
| **Tests & marks** | Create tests, fast keyboard marks entry, average/highest/pass rate, distribution and toppers (Growth+), publish, which notifies parents |
| **Parent portal** | Attendance, latest result, fees with Pay Now, next class, schedule, announcements, notifications |
| **Messages (live chat)** | Real-time 1-to-1 chat over Socket.IO, stored in MongoDB: owner ↔ teacher, owner ↔ parent, teacher ↔ parents of their students. Unread badges, read receipts (✓✓), typing indicator, online status, message history, offline fallback over REST |
| **Notifications** | Central `notify()` service with pluggable channel adapters: in-app (pushed live over the socket), WhatsApp, email and SMS (`server/src/services/notify.ts`), plus a full message log |
| **Reports** | Student, attendance, fee and batch reports, CSV export, print to PDF; advanced analytics on Premium |
| **AI insights** | At-risk students, weak topics, improving/declining students, teacher insights, parent report generator (rule engine, ready for an LLM) |
| **Plans & upgrade** | Starter, Growth and Premium feature gating enforced **server-side** (HTTP 402), contextual upgrade cards, subscription page with monthly/yearly billing, 30-day trial |
| **Super Admin** | Institutes, MRR/ARR/ARPA/churn, plan distribution, signups, feature usage, failed payments, support tickets, live plan and price editor |

## Architecture notes

- **Multi-tenant isolation:** every institute-scoped document has an `instituteId`. Routes always read it from the authenticated user through `tid(req)`, never from the request body. Teachers are further scoped to their own batches with `scopedBatchIds` and `assertBatchAccess`, and parents to their own `studentIds`.
- **Roles:** `superadmin`, `owner`, `teacher` and `parent`. The `allow(...roles)` middleware checks them.
- **Plan gating:** `requireFeature('aiInsights')` checks the plan that is actually in force. An expired trial or a cancelled plan falls back to Starter. Student and teacher limits are enforced when records are created.
- **Background job:** the fee-reminder scheduler runs every 6 hours for eligible institutes (`services/reminders.ts`).
- **Integrations to plug in for production:**
  - Razorpay: `routes/subscription.ts` (checkout) and `routes/parent.ts` (`/pay`).
  - WhatsApp, email and SMS providers: `services/notify.ts`.
  - An LLM for richer AI summaries: `routes/insights.ts`.

## Admissions, academics & parent features

| Area | Where | What it does |
|---|---|---|
| **Enquiries & leads** | `/app/leads` · `routes/leads.ts` | Every enquiry (website form, demo booking, walk-in, phone, WhatsApp, referral) with status pipeline *New → Contacted → Demo scheduled → Demo done → Admitted / Lost*, follow-up dates, notes history, call / WhatsApp buttons, 30-day conversion rate, and **Give admission** (creates the student + fee installments in one step) |
| **Courses** | `/app/courses` · `routes/academics.ts` | Fee, duration, syllabus, highlights and batches per course — shown on the website |
| **Admissions website** | `/app/website` → public `/site/<slug>` · `routes/site.ts` | Cover photo, tagline, about, highlight numbers, courses & fees with syllabus and timings, toppers gallery (photos), reviews, **free demo class booking**, enquiry form (spam-protected, rate-limited), floating **WhatsApp chat** button, map & contact |
| **Study material** | `/app/materials` · portal *Study material* | PDF notes, recorded lectures (video file up to 40 MB or YouTube / Drive link), assignments with due dates, links. Files are stored in MongoDB GridFS (`services/files.ts`) |
| **Online tests (MCQ)** | Tests → a test → *Online test* · portal *Online tests* | Question builder (or paste many questions at once), timer, open/close window, negative marking, autosave, auto-submit on time-up, per-question analysis; the score fills the mark sheet automatically. After publishing, students review answers with explanations |
| **Timetable & syllabus** | `/app/timetable` | Weekly timetable from batch schedules; tick syllabus topics as done — parents see the progress |
| **Notice board** | Announcements → *Type* | Holiday, PTM, extra class, exam and event notices with dates; parents see upcoming holidays (Settings) and events together |
| **Leave requests** | portal *Leave* → `/app/leaves` | Parents apply; teachers / owner approve or reject (parent notified); approved leave shows on the attendance sheet |
| **Report card** | portal → Results → *Report card* | Rank in every test, class average, highest, subject-wise averages & grades, attendance — printable / save as PDF; progress graph in the portal |
| **Real providers** | `services/notify.ts`, `services/razorpay.ts` | WhatsApp Cloud API, Fast2SMS / Twilio SMS and Resend email are switched on by keys in `server/.env` (see `.env.example`). **Parent fee payments** go to each institute's own Razorpay account (owner enters keys in Settings → Online payments; the secret is stored encrypted). **Plan subscriptions** use CoachFlow's Razorpay keys from `.env` |

## Teacher salaries & check-in

- **Server:** `services/salary.ts` (salary sheets + reminder scheduler, every 3 h), `routes/salaries.ts` (`/api/salaries`), `routes/staff.ts` (`/api/staff-attendance`), models in `models/Staff.ts` (`salaries`, `staffattendances`).
- **Client:** `/app/staff` (owner, Staff check-in), `/app/salaries` (owner), `/app/my-attendance` (teacher), `components/CheckInCard.tsx`, `components/StaffOverview.tsx` (owner dashboard).
- **Pay day:** salary for a month is due on the pay day of the next month (default 1st). Defaults: reminder 1 day before, on pay day, then every day after until paid — change under Salaries → *Pay day & reminders*.
- Salary records start from the day tracking is first switched on, so old months never show up as "overdue". Use *Create salary sheet* to add an older month by hand.
- **Timings** (Staff check-in → *Timings*): work start / end, grace minutes, late-check-in alert to the owner, and optional location capture.

## Live chat & notifications

- **Server:** `server/src/services/realtime.ts` (Socket.IO), `server/src/services/chat.ts` (rules, storage), `server/src/routes/chat.ts` (history + REST fallback).
- **Client:** `client/src/context/RealtimeContext.tsx` (one socket per signed-in user), `client/src/pages/Messages.tsx` (`/app/messages`, `/portal/messages`).
- Collections: `conversations` (one per pair of people, with each member's unread count and last-read time) and `messages`.
- Who can chat: owner ↔ teachers on every plan; owner ↔ parents and teacher ↔ parents of students in their batches on plans with the parent portal. Parents appear once their portal login is created.
- The socket re-checks the login on every message and every 10 minutes. Disabling a teacher or suspending an institute disconnects their live sessions at once.
- Scaling to several API servers: add `@socket.io/redis-adapter` (rooms and presence are in memory today).

## Daily work reports, salary leave cuts, reminders

- Teachers send a **daily work report** (classes + topics, tests, homework, other work, issues) from *Daily report*; the owner reads it under *Work reports*, marks it seen or replies (`/api/work-reports`). What the app recorded that day (attendance, syllabus ticks, tests, material) is shown beside it.
- **Salary leave cut**: leave / absent days marked on *Staff check-in* cut that month's salary per day (monthly salary ÷ days in month; half day = ½). Teachers are notified the day before and on pay day.
- **Fee reminders**: N days before (default 1), on the due date, and overdue every day — once or twice a day (Settings → Fee reminders), only between 8 AM and 9 PM.
- Enquiries: one **Active** tab (new + contacted + demo…) with due follow-ups first; website enquiries / demo bookings update the owner's screens live.

## Mobile app (`mobile/`)

Expo (React Native) app for owners, teachers and parents, using the same server. See `mobile/README.md`:
`cd mobile && npm install && npx expo install --fix && npx expo start`, scan the QR with Expo Go and set the
server address to your PC's Wi-Fi IP (`http://<ip>:4600`). Parents pay fees through a hosted Razorpay page
(`/api/public/pay/:token`) that returns to the app via `coachflow://payment`; study files open through 10-minute signed links.

## Environment (`server/.env`)

| Variable | Default | Notes |
|---|---|---|
| `JWT_SECRET` | dev secret | **Required in production** (32+ random characters) — the server refuses to start without it. |
| `MONGO_URI` | embedded DB | Use MongoDB Atlas or another managed database in production. |
| `CLIENT_URL` | `http://localhost:5173` | Allowed web origin(s), comma-separated. Also used by the chat socket. |
| `APP_TIMEZONE` | `Asia/Kolkata` | All "today", due-date, attendance and monthly-report logic runs in this zone, whatever the server's own zone is. |
| `DEMO_PAYMENTS` | on in dev, off in prod | Demo checkout / Pay Now. Keep off on a live site until Razorpay is connected. |
| `TRUST_PROXY` | `0` | Number of proxy hops in front of the API (`true` = 1). Set it behind Nginx / a load balancer / Cloudflare (Cloudflare + Nginx = 2) so rate limits see real client IPs. |
| `BILLING_GRACE_DAYS` | `3` | Days a paid plan keeps working after its period ends before falling back to Starter. |

## Billing rules

- When a paid period ends the institute becomes **Past due** (banner shown to the owner); after the grace days it falls back to Starter features until it renews.
- Renewing early adds the new period on top of the remaining days.
- A Super Admin who sets an institute to **Active** by hand (e.g. after an offline payment) starts a fresh billing period.
- Super Admin → Institutes → Manage can generate a new password for an owner who forgot theirs.

## Production build

```bash
npm run build      # server → server/dist, web app → server/client_build
npm start          # API + web app on one port (works on Windows, macOS and Linux)
```

Before deploying, set `JWT_SECRET`, `MONGO_URI` and `CLIENT_URL` in `server/.env`. `npm start` runs in production mode, so demo payments and demo logins are always off.
