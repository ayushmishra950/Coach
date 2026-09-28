import { Router, type Request } from 'express';
import { NOT_ENABLED, allow, auth } from '../middleware/auth.js';
import { listContacts, listConversations, listMessages, markRead, openConversation, sendMessage, unreadTotal } from '../services/chat.js';
import { hasFeature } from '../services/plan.js';
import { HttpError, ah, oid, required } from '../utils/http.js';
import { rateLimit } from '../utils/security.js';
import { pageParams } from '../utils/paginate.js';

/**
 * REST side of the chat. The browser normally sends over Socket.IO; these endpoints load
 * history and act as a fallback when the socket is not connected.
 */
const r = Router();
r.use(
  auth,
  allow('owner', 'teacher', 'parent'),
  ah(async (req, _res, next) => {
    if (req.user.role === 'parent' && !(await hasFeature(req.institute!, 'parentPortal'))) {
      throw new HttpError(402, NOT_ENABLED, 'UPGRADE_REQUIRED', { feature: 'parentPortal' });
    }
    next();
  }),
);

const ctx = (req: Request) => ({ user: req.user, institute: req.institute });

r.get('/contacts', ah(async (req, res) => res.json(await listContacts(ctx(req), { search: typeof req.query.search === 'string' ? req.query.search : '', page: pageParams(req.query) }))));

r.get(
  '/conversations',
  ah(async (req, res) => {
    const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
    res.json(await listConversations(ctx(req), str(req.query.before), str(req.query.search)));
  }),
);

r.get('/unread', ah(async (req, res) => res.json({ total: await unreadTotal(req.user.id) })));

r.post(
  '/conversations',
  ah(async (req, res) => {
    required(req.body ?? {}, ['userId']);
    res.json(await openConversation(ctx(req), oid(req.body.userId)));
  }),
);

r.get(
  '/conversations/:id/messages',
  ah(async (req, res) => {
    const before = typeof req.query.before === 'string' ? req.query.before : undefined;
    res.json(await listMessages(req.user, oid(req.params.id), before, Number(req.query.limit) || 20));
  }),
);

r.post(
  '/conversations/:id/messages',
  rateLimit({ windowMs: 10_000, max: 20, message: 'You are sending messages too fast. Please wait a moment.', key: (req) => `chat:${String(req.user.id)}` }),
  ah(async (req, res) => {
    const { message } = await sendMessage(ctx(req), oid(req.params.id), req.body?.text, req.body?.clientId);
    res.status(201).json(message);
  }),
);

r.post('/conversations/:id/read', ah(async (req, res) => res.json(await markRead(req.user, oid(req.params.id)))));

export default r;
