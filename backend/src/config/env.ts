import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: Number(process.env.PORT || 3001),
  jwtSecret: process.env.JWT_SECRET || 'change-me',
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL || '15m',
  refreshTokenTtlHours: Number(process.env.REFRESH_TOKEN_TTL_HOURS || 720),
  databaseUrl: process.env.DATABASE_URL || 'file:./dev.db',
  allowedOrigin: process.env.ALLOWED_ORIGIN || '*'
};
