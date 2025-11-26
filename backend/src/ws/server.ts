import { FastifyInstance } from 'fastify';

export function createSocketServer(app: FastifyInstance) {
  app.get('/ws', { websocket: true }, (connection, req) => {
    const url = new URL(req.url ?? '', 'http://localhost');
    const token = req.headers.authorization?.replace('Bearer ', '') || url.searchParams.get('token') || '';
    if (!token) {
      connection.socket.close();
      return;
    }
    try {
      const decoded = app.jwt.verify(token) as { sub: string };
      const userId = decoded.sub;
      connection.socket.on('message', async (raw) => {
        const payload = JSON.parse(String(raw)) as { type: string; conversationId: string; ciphertext: string };
        if (payload.type === 'message') {
          const conversation = await app.prisma.conversation.findUnique({ where: { id: payload.conversationId } });
          if (!conversation || (conversation.userAId !== userId && conversation.userBId !== userId)) {
            return;
          }
          const recipientId = conversation.userAId === userId ? conversation.userBId : conversation.userAId;
          const message = await app.prisma.message.create({
            data: {
              conversationId: payload.conversationId,
              senderId: userId,
              recipientId,
              ciphertext: payload.ciphertext
            }
          });
          const outbound = JSON.stringify({
            type: 'message',
            conversationId: payload.conversationId,
            senderId: userId,
            recipientId,
            ciphertext: payload.ciphertext,
            createdAt: message.createdAt
          });
          connection.socket.send(outbound);
        }
      });
    } catch {
      connection.socket.close();
    }
  });
}
