// config must load first: it pins the process time zone before any date is computed.
import { config } from './config.js';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { connectDB, ensureJwtSecret } from './db.js';
import { Institute, User } from './models/index.js';
import admin from './routes/admin.js';
import announcements from './routes/announcements.js';
import attendance from './routes/attendance.js';
import authRoutes from './routes/auth.js';
import batches from './routes/batches.js';
import chat from './routes/chat.js';
import dashboard from './routes/dashboard.js';
import fees from './routes/fees.js';
import insights from './routes/insights.js';
import notifications from './routes/notifications.js';
import parent from './routes/parent.js';
import publicRoutes from './routes/public.js';
import reports from './routes/reports.js';
import settings from './routes/settings.js';
import students from './routes/students.js';
import subscription from './routes/subscription.js';
import teachers from './routes/teachers.js';
import tests from './routes/tests.js';
import { seed } from './seed.js';
import { ensurePlans } from './services/plan.js';
import { initRealtime } from './services/realtime.js';
import { startReminderScheduler } from './services/reminders.js';
import { errorHandler } from './utils/http.js';
import { compressJson, flatQueryParser, securityHeaders } from './utils/security.js';

const app = express();
app.disable('x-powered-by');
app.set('query parser', flatQueryParser);
if (config.trustProxy) app.set('trust proxy', 1);
app.use(securityHeaders);
app.use(cors({ origin: config.clientUrl.split(','), credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use('/api', compressJson);

app.use('/api/public', publicRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboard);
app.use('/api/students', students);
app.use('/api/teachers', teachers);
app.use('/api/batches', batches);
app.use('/api/attendance', attendance);
app.use('/api/fees', fees);
app.use('/api/tests', tests);
app.use('/api/reports', reports);
app.use('/api/announcements', announcements);
app.use('/api/notifications', notifications);
app.use('/api/insights', insights);
app.use('/api/subscription', subscription);
app.use('/api/settings', settings);
app.use('/api/parent', parent);
app.use('/api/admin', admin);
app.use('/api/chat', chat);
app.use('/api', (_req, res) => res.status(404).json({ message: 'Not found' }));

// Serve the built React app in production
const clientDist = path.resolve(process.cwd(), '../client/dist');
if (fs.existsSync(clientDist)) {
  // Hashed build files never change → cache for a year; index.html is always re-checked.
  app.use('/assets', express.static(path.join(clientDist, 'assets'), { maxAge: '1y', immutable: true, index: false }));
  app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
  app.get('*', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use(errorHandler);

async function main() {
  await connectDB();
  await ensureJwtSecret();
  await ensurePlans();
  if (config.demoPayments) console.warn('⚠  Demo payments are ON (local demo mode): fees and plans can be "paid" without a gateway.');
  if (config.seedOnEmpty && !(await User.exists({}))) {
    if (config.isProd) console.warn('⚠  SEED_ON_EMPTY=true on a live server: loading the demo institute. Remove it once the demo data exists.');
    console.log('🌱 Empty database — seeding demo data…');
    await seed();
  }
  await syncConfiguredAccounts().catch((e) => console.error('[accounts]', e?.message));
  startReminderScheduler();
  const server = http.createServer(app);
  initRealtime(server);
  server.listen(config.port, () => console.log(`🚀 CoachFlow API running on http://localhost:${config.port} (time zone ${config.timezone})`));
}

/** Env value, trimmed, with accidental surrounding quotes removed. */
const envVal = (k: string) => (process.env[k] ?? '').trim().replace(/^["']|["']$/g, '');

/**
 * Makes the logins given in the environment actually work, on every start:
 *   SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD / SUPERADMIN_NAME
 *   OWNER_EMAIL / OWNER_PASSWORD / OWNER_NAME / INSTITUTE_NAME
 * If the account exists its password is set to the configured one. If it doesn't, the demo
 * account (admin@coachflow.in / owner@coachflow.in) is renamed to it, or — on a fresh
 * database — a new Super Admin, or a new owner with their own institute, is created. Remove these variables once you have changed the passwords from "My account",
 * otherwise a restart puts the configured password back.
 */
async function syncConfiguredAccounts() {
  const sync = async (role: 'superadmin' | 'owner', prefix: 'SUPERADMIN' | 'OWNER', demoEmail: string) => {
    const email = envVal(`${prefix}_EMAIL`).toLowerCase();
    const password = envVal(`${prefix}_PASSWORD`);
    const name = envVal(`${prefix}_NAME`);
    if (!email || !password) return;
    if (password.length < 8) return console.warn(`⚠  ${prefix}_PASSWORD must be at least 8 characters — ${email} not updated.`);

    let user = await User.findOne({ email }).select('+password');
    if (user && user.role !== role) return console.warn(`⚠  ${email} belongs to a ${user.role} account — not changed.`);
    if (!user) {
      // Take over the demo account (keeps the demo institute and all its data).
      user = await User.findOne({ email: demoEmail, role }).select('+password');
      if (!user && role === 'owner') {
        // Fresh database: create the owner together with their institute (same as signing up).
        const ownerName = name || 'Institute Owner';
        const instituteName = envVal('INSTITUTE_NAME') || 'My Institute';
        const institute = await Institute.create({
          name: instituteName,
          ownerName,
          email,
          logoText: instituteName.slice(0, 2).toUpperCase(),
          plan: 'premium',
          status: 'trial',
          trialEndsAt: new Date(Date.now() + 30 * 86400000),
        });
        await User.create({ name: ownerName, email, password: await bcrypt.hash(password, 10), role, instituteId: institute._id });
        return console.log(`✓ Owner created: ${email} (institute "${instituteName}")`);
      }
      if (!user) {
        await User.create({ name: name || 'CoachFlow Admin', email, password: await bcrypt.hash(password, 10), role });
        return console.log(`✓ Super Admin created: ${email}`);
      }
      user.email = email;
    }
    let changed = user.isModified('email');
    if (name && user.name !== name) {
      user.name = name;
      changed = true;
    }
    if (!(await bcrypt.compare(password, user.password))) {
      user.password = await bcrypt.hash(password, 10);
      user.tokenVersion = (user.tokenVersion ?? 0) + 1;
      changed = true;
    }
    user.active = true;
    if (changed || user.isModified()) await user.save();
    console.log(`✓ ${role === 'owner' ? 'Owner' : 'Super Admin'} login ready: ${email}${changed ? ' (updated from environment)' : ''}`);
  };
  const [users, admins, owners] = await Promise.all([User.countDocuments(), User.countDocuments({ role: 'superadmin' }), User.countDocuments({ role: 'owner' })]);
  console.log(`ℹ  Accounts in database: ${users} total · ${admins} super admin · ${owners} owners`);
  if (!envVal('SUPERADMIN_EMAIL') || !envVal('SUPERADMIN_PASSWORD')) console.log('ℹ  SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD not set — Super Admin login not synced.');
  if (!envVal('OWNER_EMAIL') || !envVal('OWNER_PASSWORD')) console.log('ℹ  OWNER_EMAIL / OWNER_PASSWORD not set — owner login not synced.');
  await sync('superadmin', 'SUPERADMIN', 'admin@coachflow.in');
  await sync('owner', 'OWNER', 'owner@coachflow.in');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
