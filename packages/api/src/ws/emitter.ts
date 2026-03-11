import type { AgentEvent, CrewEvent } from '@wai-agents/shared';
import type { Server as SocketIOServer } from 'socket.io';

let io: SocketIOServer | null = null;

export function setIO(server: SocketIOServer): void {
  io = server;
}

export function emitAgentEvent(conversationId: string, event: AgentEvent): void {
  if (!io) throw new Error('Socket.IO not initialized');
  io.to(`agent:${conversationId}`).emit('agent:event', event);
}

export function emitMessage(conversationId: string, message: unknown): void {
  if (!io) throw new Error('Socket.IO not initialized');
  io.to(`conversation:${conversationId}`).emit('message:new', message);
}

export function emitMessageUpdated(conversationId: string, message: unknown): void {
  if (!io) throw new Error('Socket.IO not initialized');
  io.to(`conversation:${conversationId}`).emit('message:updated', message);
}

export function emitMessageDeleted(conversationId: string, messageId: string): void {
  if (!io) throw new Error('Socket.IO not initialized');
  io.to(`conversation:${conversationId}`).emit('message:deleted', { id: messageId });
}

export function emitNotification(userId: string, notification: unknown): void {
  if (!io) throw new Error('Socket.IO not initialized');
  io.to(`user:${userId}`).emit('notification', notification);
}

export function emitConversationUpdated(userId: string, conversation: unknown): void {
  if (!io) throw new Error('Socket.IO not initialized');
  io.to(`user:${userId}`).emit('conversation:updated', conversation);
}

export function emitA2AEvent(
  conversationId: string,
  event: {
    type: 'a2a_call_start' | 'a2a_call_end';
    caller_agent_id: string;
    callee_agent_id: string;
    callee_name?: string;
    task_summary?: string;
    status?: string;
    duration_ms?: number;
  },
): void {
  if (!io) throw new Error('Socket.IO not initialized');
  io.to(`agent:${conversationId}`).emit('a2a:event', event);
}

export function emitCrewEvent(conversationId: string, event: CrewEvent): void {
  if (!io) throw new Error('Socket.IO not initialized');
  io.to(`agent:${conversationId}`).emit('crew:event', event);
}

export function emitFeedbackEvent(conversationId: string, event: unknown): void {
  if (!io) throw new Error('Socket.IO not initialized');
  io.to(`conversation:${conversationId}`).emit('feedback:event', event);
}

export function emitCollaborationEvent(userId: string, event: unknown): void {
  if (!io) throw new Error('Socket.IO not initialized');
  io.to(`user:${userId}`).emit('collaboration:event', event);
}

export function forceLeaveRoom(userId: string, conversationId: string): void {
  if (!io) return;
  const room = `user:${userId}`;
  io.in(room)
    .fetchSockets()
    .then((sockets) => {
      for (const s of sockets) {
        s.leave(`conversation:${conversationId}`);
        s.leave(`agent:${conversationId}`);
      }
    })
    .catch((err) => {
      console.error(`Failed to force leave room for user ${userId}:`, (err as Error).message);
    });
}
