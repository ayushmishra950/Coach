import { Router } from 'express';
import { Plan } from '../models/index.js';
import { ah } from '../utils/http.js';

const r = Router();
r.get('/plans', ah(async (_req, res) => res.json(await Plan.find().sort({ order: 1 }).lean())));
r.get('/health', (_req, res) => res.json({ ok: true, time: new Date() }));
export default r;
