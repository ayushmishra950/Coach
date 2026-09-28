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

## Live chat & notifications

- **Server:** `server/src/services/realtime.ts` (Socket.IO), `server/src/services/chat.ts` (rules, storage), `server/src/routes/chat.ts` (history + REST fallback).
- **Client:** `client/src/context/RealtimeContext.tsx` (one socket per signed-in user), `client/src/pages/Messages.tsx` (`/app/messages`, `/portal/messages`).
- Collections: `conversations` (one per pair of people, with each member's unread count and last-read time) and `messages`.
- Who can chat: owner ↔ teachers on every plan; owner ↔ parents and teacher ↔ parents of students in their batches on plans with the parent portal. Parents appear once their portal login is created.
- The socket re-checks the login on every message and every 10 minutes. Disabling a teacher or suspending an institute disconnects their live sessions at once.
- Scaling to several API servers: add `@socket.io/redis-adapter` (rooms and presence are in memory today).

## Environment (`server/.env`)

| Variable | Default | Notes |
|---|---|---|
| `JWT_SECRET` | dev secret | **Required in production** (32+ random characters) — the server refuses to start without it. |
| `MONGO_URI` | embedded DB | Use MongoDB Atlas or another managed database in production. |
| `CLIENT_URL` | `http://localhost:5173` | Allowed web origin(s), comma-separated. Also used by the chat socket. |
| `APP_TIMEZONE` | `Asia/Kolkata` | All "today", due-date, attendance and monthly-report logic runs in this zone, whatever the server's own zone is. |
| `DEMO_PAYMENTS` | on in dev, off in prod | Demo checkout / Pay Now. Keep off on a live site until Razorpay is connected. |
| `TRUST_PROXY` | `false` | Set `true` behind Nginx / a load balancer so rate limits see real client IPs. |
| `BILLING_GRACE_DAYS` | `3` | Days a paid plan keeps working after its period ends before falling back to Starter. |

## Billing rules

- When a paid period ends the institute becomes **Past due** (banner shown to the owner); after the grace days it falls back to Starter features until it renews.
- Renewing early adds the new period on top of the remaining days.
- A Super Admin who sets an institute to **Active** by hand (e.g. after an offline payment) starts a fresh billing period.
- Super Admin → Institutes → Manage can generate a new password for an owner who forgot theirs.

## Production build

```bash
npm run build
cd server && npm start      # serves the API and the built client from client/dist
```

Before deploying, set `JWT_SECRET`, `MONGO_URI` and `CLIENT_URL` in `server/.env`. `npm start` runs with `NODE_ENV=production`, so demo payments are off unless `DEMO_PAYMENTS=true`.
