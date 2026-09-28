// config must load first: it pins the process time zone before any date is computed.
import { config } from './config.js';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { connectDB, ensureJwtSecret } from './db.js';
import { User } from './models/index.js';
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
  await bootstrapSuperAdmin();
  startReminderScheduler();
  const server = http.createServer(app);
  initRealtime(server);
  server.listen(config.port, () => console.log(`🚀 CoachFlow API running on http://localhost:${config.port} (time zone ${config.timezone})`));
}

/**
 * First deploy: creates the Super Admin from SUPERADMIN_EMAIL + SUPERADMIN_PASSWORD, but only
 * while no Super Admin exists yet. Later changes to these variables do nothing (change the
 * password from "My account" instead).
 */
async function bootstrapSuperAdmin() {
  const email = process.env.SUPERADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SUPERADMIN_PASSWORD ?? '';
  if (!email || (await User.exists({ role: 'superadmin' }))) return;
  if (password.length < 8) {
    console.warn('⚠  SUPERADMIN_PASSWORD must be at least 8 characters — Super Admin not created.');
    return;
  }
  if (await User.exists({ email })) {
    console.warn(`⚠  ${email} is already used by another account — Super Admin not created.`);
    return;
  }
  await User.create({ name: process.env.SUPERADMIN_NAME?.trim() || 'CoachFlow Admin', email, password: await bcrypt.hash(password, 10), role: 'superadmin' });
  console.log(`✓ Super Admin created: ${email}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
