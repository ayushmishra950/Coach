import cors from 'cors';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { connectDB } from './db.js';
import { User } from './models/index.js';
import admin from './routes/admin.js';
import announcements from './routes/announcements.js';
import attendance from './routes/attendance.js';
import authRoutes from './routes/auth.js';
import batches from './routes/batches.js';
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
import { startReminderScheduler } from './services/reminders.js';
import { errorHandler } from './utils/http.js';

const app = express();
app.use(cors({ origin: config.clientUrl.split(','), credentials: true }));
app.use(express.json({ limit: '2mb' }));

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
app.use('/api', (_req, res) => res.status(404).json({ message: 'Not found' }));

// Serve the built React app in production
const clientDist = path.resolve(process.cwd(), '../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use(errorHandler);

async function main() {
  await connectDB();
  await ensurePlans();
  if (config.seedOnEmpty && !(await User.exists({}))) {
    console.log('🌱 Empty database — seeding demo data…');
    await seed();
  }
  startReminderScheduler();
  app.listen(config.port, () => console.log(`🚀 CoachFlow API running on http://localhost:${config.port}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
