import { Router } from 'express';
import mongoose from 'mongoose';
import { config } from '../config.js';
import { Plan } from '../models/index.js';
import { ah } from '../utils/http.js';
import { platformSettings } from '../services/platform.js';

const r = Router();
r.get('/plans', ah(async (_req, res) => res.json(await Plan.find().sort({ order: 1 }).lean())));
/** What the Login page may show (demo buttons only in local demo mode). */
r.get('/meta', ah(async (_req, res) => res.json({ demoLogins: config.demoLogins, trialDays: (await platformSettings()).trialDays })));
r.get('/health', async (_req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) throw new Error('db not connected');
    await mongoose.connection.db!.admin().ping();
    res.json({ ok: true, time: new Date() });
  } catch {
    res.status(503).json({ ok: false });
  }
});
export default r;
