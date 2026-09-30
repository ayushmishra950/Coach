/**
 * Removes all demo / dummy data from the database and keeps only the accounts.
 *
 *   npm run clean-data:preview   → shows what would be deleted (changes nothing)
 *   npm run clean-data           → deletes it
 *
 * KEPT
 *   users        every login (Super Admin, owners, teachers, parents)
 *   institutes   only the ones a user belongs to — logins need them — with the student and
 *                receipt counters reset, so new students start at 0001 again
 *   plans        pricing / plan settings (not dummy data)
 *   appsecrets   the stored login signing key (deleting it would log everyone out)
 *
 * EMPTIED (documents deleted, collections and indexes stay so the app keeps working)
 *   everything else: students, batches, attendance, invoices, payments, tests, announcements,
 *   notifications, chats and messages, subscription payments, support tickets, audit logs,
 *   locks, plus institutes that no user belongs to (the demo tenants in the Super Admin panel).
 *   Parent logins are unlinked from the deleted students.
 *
 * With the embedded database (empty MONGO_URI) stop the running server first.
 * For the live database run it with MONGO_URI set, then restart the live server so its
 * short-lived in-memory caches (dashboard, reports, insights) are cleared.
 */
import { config } from './config.js';
import mongoose from 'mongoose';
import { connectDB } from './db.js';

const KEEP = new Set(['users', 'plans', 'appsecrets']);
const apply = process.argv.includes('--yes');

async function main() {
  await connectDB();
  const db = mongoose.connection.db!;
  const where = config.mongoUri ? `${mongoose.connection.host} / ${db.databaseName}` : `embedded database (server/.mongo-data) / ${db.databaseName}`;
  console.log(`\nDatabase: ${where}`);
  console.log(apply ? 'Mode: DELETE\n' : 'Mode: PREVIEW (nothing is changed — run "npm run clean-data" to delete)\n');

  const users = db.collection('users');
  const institutes = db.collection('institutes');

  const keptInstituteIds = (await users.distinct('instituteId', { instituteId: { $ne: null } })) as mongoose.Types.ObjectId[];
  const names = (await db.listCollections({}, { nameOnly: true }).toArray())
    .map((c) => c.name)
    .filter((n) => !n.startsWith('system.'))
    .sort();

  const rows: { collection: string; now: number; remove: number; action: string }[] = [];
  for (const name of names) {
    const col = db.collection(name);
    const now = await col.countDocuments();
    if (KEEP.has(name)) {
      rows.push({ collection: name, now, remove: 0, action: 'keep' });
    } else if (name === 'institutes') {
      const remove = await col.countDocuments({ _id: { $nin: keptInstituteIds } });
      rows.push({ collection: name, now, remove, action: `keep ${now - remove} with users, delete the rest` });
    } else {
      rows.push({ collection: name, now, remove: now, action: 'delete all' });
    }
  }
  const parentsLinked = await users.countDocuments({ 'studentIds.0': { $exists: true } });
  console.table(rows);
  console.log(`Parent logins to unlink from deleted students: ${parentsLinked}`);
  const byRole = await users.aggregate<{ _id: string; n: number }>([{ $group: { _id: '$role', n: { $sum: 1 } } }, { $sort: { _id: 1 } }]).toArray();
  console.log(`Accounts kept: ${byRole.map((r) => `${r.n} ${r._id}`).join(' · ') || 'none'}`);

  if (!apply) return;

  for (const r of rows) {
    if (r.action === 'delete all' && r.now > 0) await db.collection(r.collection).deleteMany({});
  }
  if (names.includes('institutes')) {
    await institutes.deleteMany({ _id: { $nin: keptInstituteIds } });
    await institutes.updateMany({}, { $set: { 'counters.student': 0, 'counters.receipt': 0 } });
  }
  await users.updateMany({ 'studentIds.0': { $exists: true } }, { $set: { studentIds: [] } });

  // Make sure everything is on disk before the process (and the embedded database) exits.
  await db.admin().command({ fsync: 1 }).catch(() => undefined);

  const after = [];
  for (const name of names) after.push({ collection: name, documents: await db.collection(name).countDocuments() });
  console.log('\n✓ Dummy data removed. Documents left:');
  console.table(after);
  console.log('Restart the API server so cached dashboard / report figures refresh.');
}

main()
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error(e);
    await mongoose.disconnect().catch(() => undefined);
    process.exit(1);
  });
