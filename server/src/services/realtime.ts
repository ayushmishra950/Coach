import type { Server as HttpServer } from 'node:http';
import { Types } from 'mongoose';
import { Server, type Socket } from 'socket.io';
import { config } from '../config.js';
import { NOT_ENABLED, authenticateToken } from '../middleware/auth.js';
import { HttpError } from '../utils/http.js';
import { createLimiter } from '../utils/security.js';
import { assertMember, chatPartners, markRead, sendMessage } from './chat.js';
import { hasFeature } from './plan.js';

/**
 * Socket.IO layer. Every signed-in owner, teacher and parent keeps one connection and joins:
 *   user:<userId>                 — their own chat messages, read receipts, unread counts
 *   inst:<instituteId>:<role>     — institute notifications for owners / teachers
 *   student:<studentId>           — (parents) notifications about their child
 *
 * Presence and rooms are in memory, which is right for a single API server. To run several
 * instances behind a load balancer, add @socket.io/redis-adapter.
 */

let io: Server | null = null;
const online = new Map<string, number>();
const sendLimit = createLimiter({ windowMs: 10_000, max: 20 });
const typingLimit = createLimiter({ windowMs: 2_000, max: 1 });

type Ctx = Awaited<ReturnType<typeof authenticateToken>>;
type Ack = (res: Record<string, unknown>) => void;

export const isOnline = (userId: unknown) => (online.get(String(userId)) ?? 0) > 0;

export function emitToUser(userId: unknown, event: string, payload: unknown) {
  io?.to(`user:${String(userId)}`).emit(event, payload);
}

/** Pushes a freshly created in-app notification to everyone who should see it. */
export function emitNotification(n: {
  _id: unknown; instituteId?: unknown; audience: string; studentId?: unknown; userId?: unknown;
  type: string; title: string; message: string; createdAt?: Date;
}) {
  if (!io || !n.instituteId) return;
  const payload = { _id: String(n._id), type: n.type, title: n.title, message: n.message, audience: n.audience, createdAt: n.createdAt ?? new Date() };
  const inst = String(n.instituteId);
  if (n.audience === 'parent') {
    if (n.studentId) io.to(`student:${String(n.studentId)}`).emit('notification:new', payload);
  } else if (n.audience === 'owner') {
    io.to(`inst:${inst}:owner`).emit('notification:new', payload);
  } else if (n.audience === 'staff') {
    // Addressed to one teacher → only them. Staff-wide → every teacher and the owners.
    if (n.userId) emitToUser(n.userId, 'notification:new', payload);
    else io.to(`inst:${inst}:teacher`).to(`inst:${inst}:owner`).emit('notification:new', payload);
  }
}

/** Drops live connections, e.g. when a user is disabled or an institute is suspended. */
export function disconnectUser(userId: unknown) {
  io?.in(`user:${String(userId)}`).disconnectSockets(true);
}
export function disconnectInstitute(instituteId: unknown) {
  if (!io) return;
  for (const role of ['owner', 'teacher', 'parent']) io.in(`inst:${String(instituteId)}:${role}`).disconnectSockets(true);
}

const errText = (e: unknown) => (e instanceof HttpError ? e.message : 'Something went wrong');
const toId = (v: unknown) => {
  if (typeof v !== 'string' || !Types.ObjectId.isValid(v)) throw new HttpError(400, 'Invalid conversation');
  return new Types.ObjectId(v);
};

async function checkAccess(ctx: Ctx) {
  if (ctx.user.role === 'superadmin') throw new HttpError(403, 'Chat is not available for this account');
  if (ctx.user.role === 'parent' && !(await hasFeature(ctx.institute!, 'parentPortal'))) {
    throw new HttpError(402, NOT_ENABLED);
  }
  return ctx;
}

async function broadcastPresence(userId: string, isOn: boolean) {
  // Only people who are online right now can see a presence change.
  for (const p of await chatPartners(userId)) if (isOnline(p)) emitToUser(p, 'presence', { userId, online: isOn });
}

export function initRealtime(server: HttpServer) {
  io = new Server(server, {
    cors: { origin: config.clientUrl.split(','), credentials: true },
    maxHttpBufferSize: 64 * 1024,
  });

  io.use(async (socket, next) => {
    try {
      const token = typeof socket.handshake.auth?.token === 'string' ? socket.handshake.auth.token : undefined;
      socket.data.token = token;
      socket.data.ctx = await checkAccess(await authenticateToken(token));
      next();
    } catch (e) {
      next(new Error(errText(e)));
    }
  });

  io.on('connection', (socket) => {
    try {
      onConnection(socket);
    } catch (e) {
      console.error('[realtime]', e);
      socket.disconnect(true);
    }
  });
  console.log('✓ Realtime chat ready (Socket.IO)');
}

function onConnection(socket: Socket) {
  const { user } = socket.data.ctx as Ctx;
  const uid = String(user.id);
  void socket.join(`user:${uid}`);
  if (user.instituteId) {
    void socket.join(`inst:${String(user.instituteId)}:${user.role}`);
    if (user.role === 'parent') for (const s of user.studentIds) void socket.join(`student:${String(s)}`);
  }

  const count = (online.get(uid) ?? 0) + 1;
  online.set(uid, count);
  if (count === 1) broadcastPresence(uid, true).catch(() => {});

  // Re-check the session on every action — the account may have been disabled, the
  // institute suspended or the token may have expired since the socket connected.
  const fresh = async () => checkAccess(await authenticateToken(socket.data.token as string | undefined));

  socket.on('chat:send', async (payload: { conversationId?: string; text?: string; clientId?: string }, ack?: Ack) => {
    const reply: Ack = typeof ack === 'function' ? ack : () => {};
    try {
      if (sendLimit(uid)) throw new HttpError(429, 'You are sending messages too fast. Please wait a moment.');
      const ctx = await fresh();
      const { message } = await sendMessage(ctx, toId(payload?.conversationId), payload?.text, payload?.clientId);
      reply({ ok: true, message });
    } catch (e) {
      reply({ ok: false, error: errText(e) });
    }
  });

  socket.on('chat:read', async (payload: { conversationId?: string }, ack?: Ack) => {
    const reply: Ack = typeof ack === 'function' ? ack : () => {};
    try {
      const ctx = await fresh();
      reply({ ok: true, ...(await markRead(ctx.user, toId(payload?.conversationId))) });
    } catch (e) {
      reply({ ok: false, error: errText(e) });
    }
  });

  socket.on('chat:typing', async (payload: { conversationId?: string }) => {
    try {
      const cid = String(payload?.conversationId ?? '');
      if (typingLimit(`${uid}:${cid}`)) return;
      const conv = await assertMember(user, toId(cid));
      for (const m of conv.members) {
        if (String(m.userId) !== uid) emitToUser(m.userId, 'chat:typing', { conversationId: cid, userId: uid, name: user.name });
      }
    } catch {
      /* ignore typing errors */
    }
  });

  // Re-check the session every 10 minutes so expired or disabled logins stop receiving pushes,
  // and a parent's child rooms follow the children currently linked to them.
  const recheck = setInterval(() => {
    fresh()
      .then((ctx) => {
        if (ctx.user.role !== 'parent') return;
        const want = new Set(ctx.user.studentIds.map((s) => `student:${String(s)}`));
        for (const room of socket.rooms) if (room.startsWith('student:') && !want.has(room)) void socket.leave(room);
        for (const room of want) if (!socket.rooms.has(room)) void socket.join(room);
      })
      .catch(() => socket.disconnect(true));
  }, 10 * 60_000);

  socket.on('disconnect', () => {
    clearInterval(recheck);
    const left = (online.get(uid) ?? 1) - 1;
    if (left > 0) online.set(uid, left);
    else {
      online.delete(uid);
      broadcastPresence(uid, false).catch(() => {});
    }
  });
}
