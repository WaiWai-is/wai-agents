import { describe, expect, it } from 'vitest';
import type { ClientToServerEvents, ServerToClientEvents } from '../types/socket-events.js';

/* ================================================================
 * ServerToClientEvents — type shape verification
 * ================================================================ */
describe('ServerToClientEvents type shape', () => {
  it('has all expected event names', () => {
    // This test verifies the type compiles correctly and contains the expected keys.
    // We create a conforming object to prove the interface shape is correct.
    const events: Record<keyof ServerToClientEvents, true> = {
      'message:new': true,
      'message:updated': true,
      'message:deleted': true,
      'typing:start': true,
      'typing:stop': true,
      'conversation:updated': true,
      'agent:event': true,
      'a2a:event': true,
      'crew:event': true,
      'collaboration:event': true,
      'eval:event': true,
      'workflow:event': true,
      'memory:event': true,
      'presence:update': true,
      'presence:snapshot': true,
    };

    expect(Object.keys(events)).toHaveLength(15);
  });

  it('message:deleted event data has correct shape', () => {
    type DeleteData = Parameters<ServerToClientEvents['message:deleted']>[0];
    const data: DeleteData = { messageId: 'msg-1', conversationId: 'conv-1' };
    expect(data.messageId).toBe('msg-1');
    expect(data.conversationId).toBe('conv-1');
  });

  it('typing:start event data has correct shape', () => {
    type TypingData = Parameters<ServerToClientEvents['typing:start']>[0];
    const data: TypingData = { userId: 'user-1', conversationId: 'conv-1' };
    expect(data.userId).toBe('user-1');
  });

  it('presence:update event data has correct shape', () => {
    type PresenceData = Parameters<ServerToClientEvents['presence:update']>[0];
    const data: PresenceData = { userId: 'user-1', status: 'online' };
    expect(data.status).toBe('online');
  });
});

/* ================================================================
 * ClientToServerEvents — type shape verification
 * ================================================================ */
describe('ClientToServerEvents type shape', () => {
  it('has all expected event names', () => {
    const events: Record<keyof ClientToServerEvents, true> = {
      'join:conversation': true,
      'leave:conversation': true,
      'join:agent': true,
      'leave:agent': true,
      'typing:start': true,
      'typing:stop': true,
      read: true,
      'agent:stop': true,
      approval_decision: true,
    };

    expect(Object.keys(events)).toHaveLength(9);
  });

  it('approval_decision event data has correct shape', () => {
    type ApprovalData = Parameters<ClientToServerEvents['approval_decision']>[0];
    const data: ApprovalData = {
      conversationId: 'conv-1',
      requestId: 'req-1',
      decision: 'approve',
      scope: 'allow_once',
    };
    expect(data.decision).toBe('approve');
    expect(data.scope).toBe('allow_once');
  });

  it('read event data has correct shape', () => {
    type ReadData = Parameters<ClientToServerEvents['read']>[0];
    const data: ReadData = { conversationId: 'conv-1', messageId: 'msg-1' };
    expect(data.conversationId).toBe('conv-1');
    expect(data.messageId).toBe('msg-1');
  });
});
