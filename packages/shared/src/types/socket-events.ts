import type { CollaborationEvent } from './agent-collaborations.js';
import type { AgentEvent } from './agent-events.js';
import type { CrewEvent } from './crews.js';
import type { WorkflowEvent } from './workflows.js';

export interface ServerToClientEvents {
  'message:new': (message: unknown) => void;
  'message:updated': (message: unknown) => void;
  'message:deleted': (data: { messageId: string; conversationId: string }) => void;
  'typing:start': (data: { userId: string; conversationId: string }) => void;
  'typing:stop': (data: { userId: string; conversationId: string }) => void;
  'conversation:updated': (conversation: unknown) => void;
  'agent:event': (event: AgentEvent) => void;
  'a2a:event': (event: unknown) => void;
  'crew:event': (event: CrewEvent) => void;
  'collaboration:event': (event: CollaborationEvent) => void;
  'workflow:event': (event: WorkflowEvent) => void;
  'presence:update': (data: { userId: string; status: 'online' | 'offline' }) => void;
  'presence:snapshot': (data: Record<string, 'online' | 'offline'>) => void;
}

export interface ClientToServerEvents {
  'join:conversation': (
    data: { conversationId: string },
    callback?: (success: boolean) => void,
  ) => void;
  'leave:conversation': (data: { conversationId: string }) => void;
  'join:agent': (data: { conversationId: string }, callback?: (success: boolean) => void) => void;
  'leave:agent': (data: { conversationId: string }) => void;
  'typing:start': (data: { conversationId: string }) => void;
  'typing:stop': (data: { conversationId: string }) => void;
  read: (data: { conversationId: string; messageId: string }) => void;
  'agent:stop': (data: { conversationId: string }) => void;
  approval_decision: (data: {
    conversationId: string;
    requestId: string;
    decision: 'approve' | 'deny';
    scope: string;
  }) => void;
}
