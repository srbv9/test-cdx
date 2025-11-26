import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyCors from '@fastify/cors';
import websocketPlugin from '@fastify/websocket';
import { PrismaClient } from '@prisma/client';
import { config } from './config/env.js';
import { authRoutes } from './modules/auth/routes.js';
import { userRoutes } from './modules/users/routes.js';
import { conversationRoutes } from './modules/conversations/routes.js';
import { createSocketServer } from './ws/server.js';

const prisma = new PrismaClient();

const app = Fastify({ logger: true });

await app.register(fastifyCors, { origin: config.allowedOrigin, credentials: true });
await app.register(fastifyJwt, { secret: config.jwtSecret });
await app.register(websocketPlugin);

app.decorate('prisma', prisma);

app.get('/health', async () => ({ status: 'ok' }));
await app.register(authRoutes, { prefix: '/api' });
await app.register(userRoutes, { prefix: '/api' });
await app.register(conversationRoutes, { prefix: '/api' });
createSocketServer(app);

app.listen({ port: config.port, host: '0.0.0.0' }).then(() => {
  app.log.info(`API running on port ${config.port}`);
});
