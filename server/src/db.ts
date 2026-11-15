import crypto from 'node:crypto';
import dns from 'node:dns';
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { config } from './config.js';

export async function connectDB() {
  if (config.mongoDnsServers.length > 0) dns.setServers(config.mongoDnsServers);

  let uri = config.mongoUri;
  if (!uri) {
    // No external database configured: run an embedded MongoDB that persists to disk.
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const dbPath = path.resolve(process.cwd(), '.mongo-data');
    fs.mkdirSync(dbPath, { recursive: true });
    const mem = await MongoMemoryServer.create({
      instance: { dbPath, storageEngine: 'wiredTiger', dbName: 'coachflow' },
    });
    uri = mem.getUri('coachflow');
    console.log(`ℹ  No MONGO_URI set — using embedded MongoDB at ${dbPath}`);
    const stop = async () => {
      await mongoose.disconnect();
      await mem.stop({ doCleanup: false });
      process.exit(0);
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  }
  try {
    await mongoose.connect(uri);
  } catch (err) {
    // mongodb+srv:// needs a DNS lookup (SRV record). On some networks the DNS server in MONGO_DNS_SERVERS, or the
    // router's, can't answer it (querySrv ETIMEOUT / ECONNREFUSED). Try once more with public DNS.
    const e = err as NodeJS.ErrnoException & { syscall?: string };
    if (!uri.startsWith('mongodb+srv://') || !/^query(Srv|Txt)$/.test(e?.syscall ?? '')) throw err;
    const fallback = ['8.8.8.8', '1.1.1.1'];
    console.warn(`⚠  DNS lookup for MongoDB failed (${e.code} via ${dns.getServers().join(', ') || 'system DNS'}). Retrying with ${fallback.join(', ')}…`);
    dns.setServers(fallback);
    await mongoose.disconnect().catch(() => undefined);
    await mongoose.connect(uri);
    console.warn(`   Connected using public DNS. Set MONGO_DNS_SERVERS=${fallback.join(',')} in server/.env to skip this retry.`);
  }
  console.log('✓ MongoDB connected');
}

/**
 * When no strong JWT_SECRET is configured on a live server, use a random secret kept in the
 * database: created once (atomically, so several instances agree) and reused on every restart.
 */
export async function ensureJwtSecret() {
  if (config.jwtSecret) return;
  const col = mongoose.connection.db!.collection<{ _id: string; value: string }>('appsecrets');
  await col.updateOne({ _id: 'jwt' }, { $setOnInsert: { value: crypto.randomBytes(48).toString('hex') } }, { upsert: true });
  const doc = await col.findOne({ _id: 'jwt' });
  if (!doc?.value) throw new Error('Could not load the login signing key from the database.');
  config.jwtSecret = doc.value;
  console.warn('⚠  JWT_SECRET is not set — using a signing key stored in the database. Setting JWT_SECRET (64 random characters) is recommended.');
}
