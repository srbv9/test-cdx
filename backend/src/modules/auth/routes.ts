import { FastifyInstance } from 'fastify';
import argon2 from 'argon2';
import { nanoid } from 'nanoid';
import { addHours } from 'date-fns';
import { registrationSchema, loginSchema } from './validation.js';
import { config } from '../../config/env.js';

async function createTokens(app: FastifyInstance, userId: string) {
  const accessToken = app.jwt.sign({ sub: userId }, { expiresIn: config.accessTokenTtl });
  const refreshTokenValue = nanoid(64);
  const expiresAt = addHours(new Date(), config.refreshTokenTtlHours);
  await app.prisma.refreshToken.create({ data: { token: refreshTokenValue, userId, expiresAt } });
  return { accessToken, refreshToken: refreshTokenValue };
}

export async function authRoutes(app: FastifyInstance) {
  app.post('/register', async (request, reply) => {
    const parsed = registrationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid input' });
    }
    const existing = await app.prisma.user.findUnique({ where: { username: parsed.data.username } });
    if (existing) {
      return reply.status(409).send({ error: 'Username already exists' });
    }
    const passwordHash = await argon2.hash(parsed.data.password);
    const profileId = nanoid(24);
    const user = await app.prisma.user.create({ data: { username: parsed.data.username, passwordHash, profileId } });
    const tokens = await createTokens(app, user.id);
    return reply.send({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, user: { id: user.id, username: user.username } });
  });

  app.post('/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid input' });
    }
    const user = await app.prisma.user.findUnique({ where: { username: parsed.data.username } });
    if (!user) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }
    const valid = await argon2.verify(user.passwordHash, parsed.data.password);
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }
    const tokens = await createTokens(app, user.id);
    return reply.send({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, user: { id: user.id, username: user.username } });
  });

  app.post('/refresh', async (request, reply) => {
    const token = (request.body as { refreshToken?: string }).refreshToken;
    if (!token) {
      return reply.status(400).send({ error: 'Missing token' });
    }
    const stored = await app.prisma.refreshToken.findUnique({ where: { token } });
    if (!stored || stored.expiresAt < new Date()) {
      return reply.status(401).send({ error: 'Invalid token' });
    }
    const accessToken = app.jwt.sign({ sub: stored.userId }, { expiresIn: config.accessTokenTtl });
    return reply.send({ accessToken });
  });
}
