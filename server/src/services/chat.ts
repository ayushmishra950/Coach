import { Types } from 'mongoose';
import type { AuthUser } from '../middleware/auth.js';
import { Batch, Conversation, MESSAGE_MAX, Message, Student, User, type InstituteDoc } from '../models/index.js';
import { HttpError } from '../utils/http.js';
import { PAGE_SIZE, pageArray, type PageParams } from '../utils/paginate.js';
import { hasFeature } from './plan.js';
import { emitToUser, isOnline } from './realtime.js';

/**
 * In-app chat between people of the same institute. Who may talk to whom:
 *   owner   ↔ teacher, teacher ↔ teacher       (every plan)
 *   owner   ↔ parent                           (plans with the parent portal)
 *   teacher ↔ parent of a student in one of the teacher's batches (parent portal plans)
 * Messages are stored in MongoDB and pushed live over Socket.IO (see realtime.ts).
 */

type Ctx = { user: AuthUser; institute?: InstituteDoc };
type ChatRole = 'owner' | 'teacher' | 'parent';
type Id = Types.ObjectId;

const same = (a: unknown, b: unknown) => String(a) === String(b);

export interface Contact {
  id: string;
  name: string;
  role: ChatRole;
  subtitle: string;
  online: boolean;
}

/* ------------------------------------------------------------------ */
/* Permission rules                                                     */
/* ------------------------------------------------------------------ */

async function teacherBatchIds(instituteId: Id, teacherId: Id) {
  return (await Batch.find({ instituteId, $or: [{ teacherId }, { coTeacherIds: teacherId }] }).select('_id').lean()).map((b) => b._id);
}

async function childBatchIds(instituteId: Id, studentIds: Id[]) {
  const kids = await Student.find({ instituteId, _id: { $in: studentIds } }).select('batchIds').lean();
  return kids.flatMap((k) => k.batchIds);
}

/** True when `me` is allowed to start or continue a chat with `other`. */
export async function canChat(ctx: Ctx, other: { _id: Id; role: string; instituteId?: Id | null; active?: boolean | null; studentIds?: Id[] | null }) {
  const me = ctx.user;
  if (!me.instituteId || !ctx.institute) return false;
  if (same(other._id, me.id) || !other.active || !same(other.instituteId, me.instituteId)) return false;
  const parentsAllowed = await hasFeature(ctx.institute, 'parentPortal');

  if (me.role === 'owner') {
    if (other.role === 'owner' || other.role === 'teacher') return true;
    return other.role === 'parent' && parentsAllowed;
  }
  if (me.role === 'teacher') {
    if (other.role === 'owner' || other.role === 'teacher') return true;
    if (other.role !== 'parent' || !parentsAllowed) return false;
    const mine = await teacherBatchIds(me.instituteId, me.id);
    return !!(await Student.exists({ instituteId: me.instituteId, _id: { $in: other.studentIds ?? [] }, batchIds: { $in: mine } }));
  }
  if (me.role === 'parent') {
    if (!parentsAllowed) return false;
    if (other.role === 'owner') return true;
    if (other.role !== 'teacher') return false;
    const batches = await childBatchIds(me.instituteId, me.studentIds);
    return !!(await Batch.exists({ instituteId: me.instituteId, _id: { $in: batches }, $or: [{ teacherId: other._id }, { coTeacherIds: other._id }] }));
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* People                                                               */
/* ------------------------------------------------------------------ */

type UserLite = { _id: Id; name: string; role: string; subjects?: string[] | null; studentIds?: Id[] | null };

/** `visibleBatches`: for a teacher, only children in these batches are named (no siblings elsewhere). */
async function subtitles(instituteId: Id, users: UserLite[], visibleBatches?: Id[]) {
  const kidIds = users.filter((u) => u.role === 'parent').flatMap((u) => u.studentIds ?? []);
  const kids = kidIds.length
    ? await Student.find({ instituteId, _id: { $in: kidIds }, ...(visibleBatches && { batchIds: { $in: visibleBatches } }) }).select('name').lean()
    : [];
  const kidName = new Map(kids.map((k) => [String(k._id), k.name]));
  const out = new Map<string, string>();
  for (const u of users) {
    if (u.role === 'owner') out.set(String(u._id), 'Institute owner');
    else if (u.role === 'teacher') out.set(String(u._id), u.subjects?.length ? `Teacher · ${u.subjects.join(', ')}` : 'Teacher');
    else {
      const names = (u.studentIds ?? []).map((s) => kidName.get(String(s))).filter(Boolean);
      out.set(String(u._id), names.length ? `Parent of ${names.join(', ')}` : 'Parent');
    }
  }
  return out;
}

/** Everyone the current user may start a conversation with. */
/** People the user may start a chat with — searchable (name or child's name), 20 per page. */
export async function listContacts(ctx: Ctx, opts: { search?: string; page: PageParams }) {
  const me = ctx.user;
  const instituteId = me.instituteId!;
  const parentsAllowed = ctx.institute ? await hasFeature(ctx.institute, 'parentPortal') : false;
  const base = { instituteId, active: true, _id: { $ne: me.id } };
  const fields = 'name role subjects studentIds';
  let users: UserLite[] = [];
  let visibleBatches: Id[] | undefined;

  if (me.role === 'owner') {
    users = await User.find({ ...base, role: { $in: parentsAllowed ? ['owner', 'teacher', 'parent'] : ['owner', 'teacher'] } }).select(fields).lean();
  } else if (me.role === 'teacher') {
    const staff = await User.find({ ...base, role: { $in: ['owner', 'teacher'] } }).select(fields).lean();
    let parents: UserLite[] = [];
    if (parentsAllowed) {
      const mine = await teacherBatchIds(instituteId, me.id);
      visibleBatches = mine;
      const kids = await Student.find({ instituteId, batchIds: { $in: mine } }).select('_id').lean();
      parents = await User.find({ ...base, role: 'parent', studentIds: { $in: kids.map((k) => k._id) } }).select(fields).lean();
    }
    users = [...staff, ...parents];
  } else if (me.role === 'parent' && parentsAllowed) {
    const owners = await User.find({ ...base, role: 'owner' }).select(fields).lean();
    const batches = await Batch.find({ instituteId, _id: { $in: await childBatchIds(instituteId, me.studentIds) } }).select('teacherId coTeacherIds').lean();
    const teacherIds = batches.flatMap((b) => [b.teacherId, ...(b.coTeacherIds ?? [])]).filter(Boolean);
    const teachers = await User.find({ ...base, role: 'teacher', _id: { $in: teacherIds } }).select(fields).lean();
    users = [...owners, ...teachers];
  }

  const subs = await subtitles(instituteId, users, visibleBatches);
  const order: Record<string, number> = { owner: 0, teacher: 1, parent: 2 };
  const q = opts.search?.trim().toLowerCase() ?? '';
  const all: Contact[] = users
    .map((u) => ({ id: String(u._id), name: u.name, role: u.role as ChatRole, subtitle: subs.get(String(u._id)) ?? '', online: isOnline(u._id) }))
    .filter((c) => !q || c.name.toLowerCase().includes(q) || c.subtitle.toLowerCase().includes(q))
    .sort((a, b) => order[a.role] - order[b.role] || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return pageArray(all, opts.page);
}

/* ------------------------------------------------------------------ */
/* Conversations                                                        */
/* ------------------------------------------------------------------ */

type ConvLean = {
  _id: Id;
  members: { userId: Id; role: string; unread?: number | null; lastReadAt?: Date | null }[];
  lastMessage?: { text?: string | null; senderId?: Id | null; at?: Date | null } | null;
  updatedAt: Date;
  createdAt: Date;
};

async function summarize(meId: Id, instituteId: Id, convs: ConvLean[], meRole?: string) {
  const otherIds = convs.map((c) => c.members.find((m) => !same(m.userId, meId))?.userId).filter(Boolean) as Id[];
  const users = await User.find({ _id: { $in: otherIds } }).select('name role subjects studentIds active').lean();
  const subs = await subtitles(instituteId, users, meRole === 'teacher' ? await teacherBatchIds(instituteId, meId) : undefined);
  return convs.map((c) => {
    const mine = c.members.find((m) => same(m.userId, meId));
    const other = c.members.find((m) => !same(m.userId, meId));
    const u = users.find((x) => same(x._id, other?.userId));
    return {
      _id: String(c._id),
      other: {
        id: String(other?.userId ?? ''),
        name: u?.name ?? 'Former member',
        role: (u?.role ?? other?.role ?? 'parent') as ChatRole,
        subtitle: subs.get(String(other?.userId)) ?? '',
        online: other ? isOnline(other.userId) : false,
        active: !!u?.active,
      },
      lastMessage: c.lastMessage?.at ? { text: c.lastMessage.text ?? '', senderId: String(c.lastMessage.senderId), at: c.lastMessage.at } : null,
      unread: mine?.unread ?? 0,
      otherLastReadAt: other?.lastReadAt ?? null,
      updatedAt: c.updatedAt,
    };
  });
}

/**
 * Newest-first chat list, 20 at a time. `before` is a cursor "<updatedAt ISO>_<id>" taken
 * from the last chat already shown, so scrolling down loads the next 20 without gaps even
 * while new messages keep reordering the top of the list.
 */
export async function listConversations(ctx: Ctx, before?: string, search?: string) {
  const filter: Record<string, unknown> = { instituteId: ctx.user.instituteId, 'members.userId': ctx.user.id };
  if (search?.trim()) {
    // Search by the other person's name across ALL chats, not only the ones already loaded.
    const rx = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    // Only people this user actually chats with (so a common name can't crowd out matches).
    const partners = (await chatPartners(String(ctx.user.id))).map((x) => new Types.ObjectId(x));
    const people = await User.find({ _id: { $in: partners }, name: rx }).select('_id').lean();
    filter.$and = [{ 'members.userId': ctx.user.id }, { 'members.userId': { $in: people.map((x) => x._id) } }];
    delete filter['members.userId'];
  }
  const [at, id] = (before ?? '').split('_');
  const t = at ? new Date(at) : null;
  if (t && !Number.isNaN(t.getTime()) && Types.ObjectId.isValid(id)) {
    filter.$or = [{ updatedAt: { $lt: t } }, { updatedAt: t, _id: { $lt: new Types.ObjectId(id) } }];
  }
  const rows = (await Conversation.find(filter)
    .sort({ updatedAt: -1, _id: -1 })
    .limit(PAGE_SIZE + 1)
    .lean()) as unknown as ConvLean[];
  const hasMore = rows.length > PAGE_SIZE;
  const items = await summarize(ctx.user.id, ctx.user.instituteId!, rows.slice(0, PAGE_SIZE), ctx.user.role);
  return { items, hasMore, next: hasMore ? `${new Date(rows[PAGE_SIZE - 1].updatedAt).toISOString()}_${String(rows[PAGE_SIZE - 1]._id)}` : null };
}

/** Finds the 1-to-1 conversation with `otherId`, creating it on first contact. */
export async function openConversation(ctx: Ctx, otherId: Id) {
  const me = ctx.user;
  const other = await User.findById(otherId).select('name role instituteId active studentIds').lean();
  if (!other || !(await canChat(ctx, other))) throw new HttpError(403, 'You cannot message this person');

  const key = [String(me.id), String(other._id)].sort().join('_');
  const filter = { instituteId: me.instituteId, key };
  let conv: unknown = await Conversation.findOne(filter).lean();
  if (!conv) {
    try {
      conv = (
        await Conversation.create({
          ...filter,
          members: [
            { userId: me.id, role: me.role },
            { userId: other._id, role: other.role },
          ],
        })
      ).toObject();
    } catch (e) {
      // Both people opened the chat at the same moment — the unique index kept one copy.
      if ((e as { code?: number }).code !== 11000) throw e;
      conv = await Conversation.findOne(filter).lean();
    }
  }
  const [summary] = await summarize(me.id, me.instituteId!, [conv as ConvLean], me.role);
  return summary;
}

/** Loads a conversation the user belongs to (404 otherwise, so ids can't be probed). */
export async function assertMember(user: AuthUser, conversationId: Id) {
  const conv = await Conversation.findOne({ _id: conversationId, instituteId: user.instituteId, 'members.userId': user.id });
  if (!conv) throw new HttpError(404, 'Conversation not found');
  return conv;
}

/**
 * Newest-first pages of history. `beforeId` is the oldest message the client already has;
 * paging on (createdAt, _id) means messages sharing a timestamp are never skipped.
 */
export async function listMessages(user: AuthUser, conversationId: Id, beforeId?: string, limit = PAGE_SIZE) {
  await assertMember(user, conversationId);
  const n = Math.max(1, Math.min(PAGE_SIZE, limit));
  const filter: Record<string, unknown> = { conversationId };
  if (beforeId && Types.ObjectId.isValid(beforeId)) {
    const pivot = await Message.findOne({ _id: beforeId, conversationId }).select('createdAt').lean();
    if (pivot) {
      filter.$or = [{ createdAt: { $lt: pivot.createdAt } }, { createdAt: pivot.createdAt, _id: { $lt: pivot._id } }];
    }
  }
  const rows = await Message.find(filter).sort({ createdAt: -1, _id: -1 }).limit(n + 1).lean();
  const hasMore = rows.length > n;
  return { messages: rows.slice(0, n).reverse().map(serialize), hasMore };
}

type MsgLike = { _id: unknown; conversationId: unknown; senderId: unknown; text: string; clientId?: string | null; createdAt: Date };
const serialize = (m: MsgLike) => ({
  _id: String(m._id),
  conversationId: String(m.conversationId),
  senderId: String(m.senderId),
  text: m.text,
  clientId: m.clientId ?? undefined,
  createdAt: m.createdAt,
});

export async function unreadTotal(userId: Id | string) {
  const uid = new Types.ObjectId(String(userId));
  // Only conversations where this user actually has unread messages are touched.
  const [row] = await Conversation.aggregate<{ n: number }>([
    { $match: { members: { $elemMatch: { userId: uid, unread: { $gt: 0 } } } } },
    { $unwind: '$members' },
    { $match: { 'members.userId': uid } },
    { $group: { _id: null, n: { $sum: '$members.unread' } } },
  ]);
  return row?.n ?? 0;
}

export async function sendMessage(ctx: Ctx, conversationId: Id, rawText: unknown, clientId?: unknown) {
  const me = ctx.user;
  const text = String(rawText ?? '').replace(/\r\n/g, '\n').trim();
  if (!text) throw new HttpError(400, 'Message cannot be empty');
  if (text.length > MESSAGE_MAX) throw new HttpError(400, `Messages can be at most ${MESSAGE_MAX} characters`);
  const cid = typeof clientId === 'string' && clientId.length <= 64 ? clientId : undefined;

  const conv = await assertMember(me, conversationId);
  const otherMember = conv.members.find((m) => !same(m.userId, me.id));
  const other = otherMember ? await User.findById(otherMember.userId).select('role instituteId active studentIds').lean() : null;
  if (!other || !(await canChat(ctx, other))) throw new HttpError(403, 'You can no longer message this person');

  let doc;
  try {
    doc = await Message.create({ instituteId: me.instituteId, conversationId: conv._id, senderId: me.id, text, clientId: cid });
  } catch (e) {
    // Same clientId sent twice (e.g. a retry after a dropped connection) — return the original.
    if ((e as { code?: number }).code === 11000 && cid) {
      const existing = await Message.findOne({ senderId: me.id, clientId: cid, conversationId: conv._id }).lean();
      if (existing) return { message: serialize(existing), duplicate: true };
    }
    throw e;
  }

  const at = doc.createdAt;
  await Conversation.updateOne(
    { _id: conv._id },
    {
      $set: {
        lastMessage: { text: text.slice(0, 160), senderId: me.id, at },
        'members.$[me].lastReadAt': at,
        'members.$[me].unread': 0,
      },
      $inc: { 'members.$[other].unread': 1 },
    },
    { arrayFilters: [{ 'me.userId': me.id }, { 'other.userId': { $ne: me.id } }] },
  );

  const message = serialize(doc);
  await Promise.all(
    conv.members.map(async (m) =>
      emitToUser(m.userId, 'chat:message', { conversationId: String(conv._id), message, unreadTotal: await unreadTotal(m.userId) }),
    ),
  );
  return { message, duplicate: false };
}

export async function markRead(user: AuthUser, conversationId: Id) {
  const conv = await assertMember(user, conversationId);
  const at = new Date();
  // timestamps:false — reading must not move the conversation to the top of the list.
  await Conversation.updateOne(
    { _id: conv._id, 'members.userId': user.id },
    { $set: { 'members.$.unread': 0, 'members.$.lastReadAt': at } },
    { timestamps: false },
  );
  for (const m of conv.members) {
    if (same(m.userId, user.id)) emitToUser(m.userId, 'chat:unread', { total: await unreadTotal(user.id), conversationId: String(conv._id) });
    else emitToUser(m.userId, 'chat:read', { conversationId: String(conv._id), userId: String(user.id), lastReadAt: at });
  }
  return { lastReadAt: at };
}

/** Everyone this user has a conversation with (used for online/offline updates). */
export async function chatPartners(userId: string) {
  const convs = await Conversation.find({ 'members.userId': new Types.ObjectId(userId) }).select('members.userId').lean();
  const ids = new Set<string>();
  for (const c of convs) for (const m of c.members) if (String(m.userId) !== userId) ids.add(String(m.userId));
  return [...ids];
}
