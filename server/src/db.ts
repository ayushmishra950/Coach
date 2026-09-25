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
