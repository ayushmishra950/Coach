import { Router } from 'express';
import { config } from '../config.js';
import { Plan } from '../models/index.js';
import { ah } from '../utils/http.js';

const r = Router();
r.get('/plans', ah(async (_req, res) => res.json(await Plan.find().sort({ order: 1 }).lean())));
/** What the Login page may show (demo buttons only in local demo mode). */
r.get('/meta', (_req, res) => res.json({ demoLogins: config.demoLogins }));
r.get('/health', (_req, res) => res.json({ ok: true, time: new Date() }));
export default r;
