import type { Socket, Server as SocketIOServer } from 'socket.io';
import { sql } from '../db/connection.js';
import { type ApprovalScope, approvalGate } from '../modules/agents/approval-gate.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const socketRateLimits = new WeakMap<object, { count: number; resetAt: number }>();
function checkSocketRate(socket: Socket, limit = 30, windowMs = 10000): boolean {
  const now = Date.now();
  let entry = socketRateLimits.get(socket);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    socketRateLimits.set(socket, entry);
  }
  entry.count++;
  return entry.count <= limit;
}

export function setupAgentHandlers(io: SocketIOServer): void {
  io.on('connection', (socket) => {
    const userId = socket.data.userId as string;

    socket.on('join:agent', async (conversationId: string, callback?: (ok: boolean) => void) => {
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

        socket.join(`agent:${conversationId}`);
        callback?.(true);
      } catch {
        callback?.(false);
      }
    });

    socket.on('leave:agent', (conversationId: string) => {
      if (!checkSocketRate(socket)) return;
      if (!conversationId || typeof conversationId !== 'string' || !UUID_RE.test(conversationId))
        return;
      socket.leave(`agent:${conversationId}`);
    });

    socket.on('agent:stop', ({ conversationId }: { conversationId: string }) => {
      if (!checkSocketRate(socket)) return;
      if (!conversationId || !UUID_RE.test(conversationId)) return;
      if (!socket.rooms.has(`agent:${conversationId}`)) return;

      io.to(`agent:${conversationId}`).emit('agent:event', {
        type: 'run_error',
        error: 'Stopped by user',
      });
    });

    socket.on(
      'approval_decision',
      (data: { conversationId: string; requestId: string; decision: string; scope: string }) => {
        if (!checkSocketRate(socket)) return;
        if (!data.requestId || !data.decision) return;
        if (data.conversationId && !UUID_RE.test(data.conversationId)) return;

        const decision = data.decision === 'approve' ? 'approve' : 'deny';
        const validScopes: ApprovalScope[] = [
          'allow_once',
          'allow_session',
          'allow_always',
          'deny',
        ];
        const scope: ApprovalScope = validScopes.includes(data.scope as ApprovalScope)
          ? (data.scope as ApprovalScope)
          : 'allow_once';

        approvalGate.resolveApproval(data.requestId, decision, scope);
      },
    );
  });
}

// Outbound AG-UI events are sent via emitter.ts: emitAgentEvent()
// Event types: run_started, text_delta, tool_call_start, tool_call_end,
//              step_started, thinking, run_finished, run_error, tool_approval_request
