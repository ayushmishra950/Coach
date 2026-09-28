import 'dotenv/config';

const isProd = process.env.NODE_ENV === 'production';

// All "today", due-date and attendance-date logic runs in the institute's local time zone,
// not in whatever zone the server happens to be deployed in (most clouds default to UTC).
// Node picks up a change to process.env.TZ at runtime, so this must stay at the top.
const timezone = process.env.APP_TIMEZONE || 'Asia/Kolkata';
process.env.TZ = timezone;

const mongoUri = process.env.MONGO_URI || '';
/**
 * "Local demo mode": no MONGO_URI (embedded database) and not production. Only in this mode
 * do the convenient-but-unsafe defaults switch on (dev JWT secret, demo seed data, demo
 * payments, one-click demo logins). A real database or NODE_ENV=production turns them all off.
 */
const localDemo = !isProd && !mongoUri;

if (isProd && !mongoUri) {
  throw new Error('MONGO_URI must be set in production. The embedded database is for local development only (no auth, no backups).');
}

const DEV_SECRET = 'coachflow-dev-secret-change-me';
const envSecret = process.env.JWT_SECRET || '';
const strongSecret = envSecret.length >= 32 && !envSecret.startsWith('change-this');
if (!strongSecret && !localDemo) {
  throw new Error('JWT_SECRET must be set to a long random string (32+ characters) in server/.env. It is only optional in local demo mode (no MONGO_URI).');
}
if (!strongSecret) console.warn('⚠  Using the built-in development JWT secret (local demo mode). Set JWT_SECRET before going live.');
const jwtSecret = strongSecret ? envSecret : DEV_SECRET;

const flag = (name: string, fallback: boolean) => (process.env[name] ? process.env[name] === 'true' : fallback);

if (isProd && process.env.TRUST_PROXY !== 'true' && process.env.TRUST_PROXY !== 'false') {
  console.warn('⚠  TRUST_PROXY is not set. If the API runs behind Nginx or a load balancer, set TRUST_PROXY=true so login limits see real client IPs.');
}

export const config = {
  isProd,
  timezone,
  port: Number(process.env.PORT || 4600),
  mongoUri,
  localDemo,
  jwtSecret,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  /**
   * Seed the demo institute into an EMPTY database. On by default only in local demo mode; on a
   * live server only when SEED_ON_EMPTY=true is set explicitly (e.g. a demo / sales site).
   */
  seedOnEmpty: flag('SEED_ON_EMPTY', localDemo),
  /** Show one-click demo logins on the Login page. */
  demoLogins: flag('DEMO_LOGINS', localDemo) && !isProd,
  /**
   * Demo payments complete instantly without a gateway. They are ON only in local demo mode
   * and never in production, so nobody can get a free upgrade or mark a fee as paid on a
   * live site before Razorpay is connected.
   */
  demoPayments: flag('DEMO_PAYMENTS', localDemo) && !isProd,
  /** Behind Nginx / a load balancer, set TRUST_PROXY=true so rate limits see the real client IP. */
  trustProxy: process.env.TRUST_PROXY === 'true',
  /** Days a paid plan keeps working after its period ends, before falling back to Starter. */
  graceDays: Number.isFinite(Number(process.env.BILLING_GRACE_DAYS)) && process.env.BILLING_GRACE_DAYS ? Number(process.env.BILLING_GRACE_DAYS) : 3,
};
