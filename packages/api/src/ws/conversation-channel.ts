import type { Server as SocketIOServer } from 'socket.io';
import { sql } from '../db/connection.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function setupConversationHandlers(io: SocketIOServer): void {
  io.on('connection', (socket) => {
    const userId = socket.data.userId as string;

    socket.on('join:conversation', async (conversationId: string, callback?: (ok: boolean) => void) => {
      if (!conversationId || typeof conversationId !== 'string' || !UUID_RE.test(conversationId)) {
        callback?.(false);
        return;
      }

      try {
        const result = await sql`
          SELECT 1 FROM conversation_members
          WHERE conversation_id = ${conversationId}::uuid
            AND user_id = ${userId}::uuid
          LIMIT 1
        `;

        if (result.length === 0) {
          callback?.(false);
          return;
        }

        socket.join(`conversation:${conversationId}`);
        callback?.(true);
      } catch {
        callback?.(false);
      }
    });

    socket.on('leave:conversation', (conversationId: string) => {
      if (!conversationId || typeof conversationId !== 'string' || !UUID_RE.test(conversationId)) return;
      socket.leave(`conversation:${conversationId}`);
    });

    // Typing events: only emit to rooms the socket has joined (membership already verified)
    socket.on('typing:start', (conversationId: string) => {
      if (!conversationId || typeof conversationId !== 'string' || !UUID_RE.test(conversationId)) return;
      if (!socket.rooms.has(`conversation:${conversationId}`)) return;
      socket.to(`conversation:${conversationId}`).emit('typing:start', { userId, conversationId });
    });

    socket.on('typing:stop', (conversationId: string) => {
      if (!conversationId || typeof conversationId !== 'string' || !UUID_RE.test(conversationId)) return;
      if (!socket.rooms.has(`conversation:${conversationId}`)) return;
      socket.to(`conversation:${conversationId}`).emit('typing:stop', { userId, conversationId });
    });
  });
}
