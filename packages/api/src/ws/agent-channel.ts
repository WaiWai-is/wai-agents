import type { Server as SocketIOServer } from 'socket.io';
import { sql } from '../db/connection.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function setupAgentHandlers(io: SocketIOServer): void {
  io.on('connection', (socket) => {
    const userId = socket.data.userId as string;

    socket.on('join:agent', async (conversationId: string, callback?: (ok: boolean) => void) => {
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

        socket.join(`agent:${conversationId}`);
        callback?.(true);
      } catch {
        callback?.(false);
      }
    });

    socket.on('leave:agent', (conversationId: string) => {
      if (!conversationId || typeof conversationId !== 'string' || !UUID_RE.test(conversationId)) return;
      socket.leave(`agent:${conversationId}`);
    });
  });
}

// Outbound AG-UI events are sent via emitter.ts: emitAgentEvent()
// Event types: run_started, text_delta, tool_call_start, tool_call_end,
//              step_started, thinking, run_finished, run_error
