import { FastifyInstance } from 'fastify';

export async function userRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (request, reply) => {
    if (request.routerPath && request.routerPath.startsWith('/users')) {
      try {
        await request.jwtVerify();
      } catch {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
    }
  });

  app.get('/users/me', async (request, reply) => {
    const userId = request.user.sub as string;
    const user = await app.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return reply.status(404).send({ error: 'Not found' });
    }
    return reply.send({ id: user.id, username: user.username, profileId: user.profileId, publicKey: user.publicKey });
  });

  app.post('/users/public-key', async (request, reply) => {
    const userId = request.user.sub as string;
    const publicKey = (request.body as { publicKey?: string }).publicKey;
    if (!publicKey) {
      return reply.status(400).send({ error: 'Missing key' });
    }
    await app.prisma.user.update({ where: { id: userId }, data: { publicKey } });
    return reply.send({ success: true });
  });
}
