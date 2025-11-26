import { FastifyInstance } from 'fastify';

export async function conversationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (request, reply) => {
    if (request.routerPath && request.routerPath.startsWith('/conversations')) {
      try {
        await request.jwtVerify();
      } catch {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
    }
  });

  app.post('/conversations/by-profile-id', async (request, reply) => {
    const profileId = (request.body as { profileId?: string }).profileId;
    if (!profileId) {
      return reply.status(400).send({ error: 'Missing profileId' });
    }
    const currentUserId = request.user.sub as string;
    const targetUser = await app.prisma.user.findUnique({ where: { profileId } });
    if (!targetUser) {
      return reply.status(404).send({ error: 'User not found' });
    }
    const participants = [currentUserId, targetUser.id].sort();
    const existing = await app.prisma.conversation.findFirst({
      where: { userAId: participants[0], userBId: participants[1] },
      include: { userA: true, userB: true }
    });
    const conversation = existing
      ? existing
      : await app.prisma.conversation.create({
          data: { userAId: participants[0], userBId: participants[1] },
          include: { userA: true, userB: true }
        });
    const peer = conversation.userAId === currentUserId ? conversation.userB : conversation.userA;
    return reply.send({ conversationId: conversation.id, peer: { id: peer.id, username: peer.username, publicKey: peer.publicKey } });
  });

  app.get('/conversations', async (request, reply) => {
    const currentUserId = request.user.sub as string;
    const conversations = await app.prisma.conversation.findMany({
      where: { OR: [{ userAId: currentUserId }, { userBId: currentUserId }] },
      include: { userA: true, userB: true }
    });
    const sanitized = conversations.map((c) => {
      const peer = c.userAId === currentUserId ? c.userB : c.userA;
      return { id: c.id, peer: { id: peer.id, username: peer.username, publicKey: peer.publicKey } };
    });
    return reply.send(sanitized);
  });

  app.get('/conversations/:id/messages', async (request, reply) => {
    const currentUserId = request.user.sub as string;
    const conversationId = (request.params as { id: string }).id;
    const conversation = await app.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation || (conversation.userAId !== currentUserId && conversation.userBId !== currentUserId)) {
      return reply.status(404).send({ error: 'Not found' });
    }
    const messages = await app.prisma.message.findMany({ where: { conversationId }, orderBy: { createdAt: 'asc' } });
    return reply.send(messages);
  });
}
