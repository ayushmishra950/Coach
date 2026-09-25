# CoachFlow — Your Coaching Institute. One Simple Dashboard.

A multi-tenant **MERN + TypeScript** SaaS for small and mid-sized coaching institutes. It covers students, teachers, batches, attendance, fees, tests and marks, parent communication, reports, AI insights, subscriptions and a Super Admin panel.

```
client/   React 18 + Vite + TypeScript + Tailwind + Recharts
server/   Node + Express + TypeScript + MongoDB (Mongoose) + JWT
```

## Quick start

```bash
npm run install:all     # installs root, server and client deps
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
| **Notifications** | Central `notify()` service with pluggable channel adapters: in-app, WhatsApp, email and SMS (`server/src/services/notify.ts`), plus a full message log |
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

## Production build

```bash
npm run build
cd server && npm start      # serves the API and the built client from client/dist
```

Before deploying, set `JWT_SECRET`, `MONGO_URI` and `CLIENT_URL` in `server/.env`.
