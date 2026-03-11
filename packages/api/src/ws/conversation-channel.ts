import type { Server as SocketIOServer } from 'socket.io';
import { sql } from '../db/connection.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const socketRateLimits = new WeakMap<any, { count: number; resetAt: number }>();
function checkSocketRate(socket: any, limit = 30, windowMs = 10000): boolean {
  const now = Date.now();
  let entry = socketRateLimits.get(socket);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    socketRateLimits.set(socket, entry);
  }
  entry.count++;
  return entry.count <= limit;
}

export function setupConversationHandlers(io: SocketIOServer): void {
  io.on('connection', (socket) => {
    const userId = socket.data.userId as string;

    socket.on('join:conversation', async (conversationId: string, callback?: (ok: boolean) => void) => {
      if (!checkSocketRate(socket)) return;
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
      if (!checkSocketRate(socket)) return;
      if (!conversationId || typeof conversationId !== 'string' || !UUID_RE.test(conversationId)) return;
      socket.leave(`conversation:${conversationId}`);
    });

    // Typing events: only emit to rooms the socket has joined (membership already verified)
    socket.on('typing:start', (conversationId: string) => {
      if (!checkSocketRate(socket)) return;
      if (!conversationId || typeof conversationId !== 'string' || !UUID_RE.test(conversationId)) return;
      if (!socket.rooms.has(`conversation:${conversationId}`)) return;
      socket.to(`conversation:${conversationId}`).emit('typing:start', { userId, conversationId });
    });

    socket.on('typing:stop', (conversationId: string) => {
      if (!checkSocketRate(socket)) return;
      if (!conversationId || typeof conversationId !== 'string' || !UUID_RE.test(conversationId)) return;
      if (!socket.rooms.has(`conversation:${conversationId}`)) return;
      socket.to(`conversation:${conversationId}`).emit('typing:stop', { userId, conversationId });
    });

    socket.on('read', async ({ conversationId, messageId }: { conversationId: string; messageId: string }) => {
      if (!checkSocketRate(socket)) return;
      if (!conversationId || !messageId) return;
      if (!UUID_RE.test(conversationId) || !UUID_RE.test(messageId)) return;
      if (!socket.rooms.has(`conversation:${conversationId}`)) return;

      try {
        await sql`
          UPDATE conversation_members
          SET last_read_at = NOW()
          WHERE conversation_id = ${conversationId}::uuid
            AND user_id = ${userId}::uuid
        `;
      } catch {
        // Silently ignore — read receipts are best-effort
      }
    });
  });
}
