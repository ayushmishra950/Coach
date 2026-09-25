import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT || 4600),
  mongoUri: process.env.MONGO_URI || '',
  jwtSecret: process.env.JWT_SECRET || 'coachflow-dev-secret-change-me',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  seedOnEmpty: process.env.SEED_ON_EMPTY !== 'false',
};
