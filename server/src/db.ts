import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { config } from './config.js';

export async function connectDB() {
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
  await mongoose.connect(uri);
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
