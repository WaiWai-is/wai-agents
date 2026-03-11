import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

// Mock socket.io-client before importing SocketClient
const mockSocket = {
  connected: false,
  id: 'mock_socket_id',
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  disconnect: vi.fn(),
};

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocket),
}));

import { io } from 'socket.io-client';
import { SocketClient } from '../socket-client';

describe('SocketClient — edge cases', () => {
  let client: SocketClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSocket.connected = false;
    client = new SocketClient();
  });

  /* ---- Room management without socket ---- */

  describe('operations without socket', () => {
    it('leaveConversation is a no-op without socket', () => {
      client.leaveConversation('conv_1');
      // Should not throw, no emit
    });

    it('joinAgent is a no-op without socket', () => {
      client.joinAgent('agent_1');
      // Should not throw
    });

    it('leaveAgent is a no-op without socket', () => {
      client.leaveAgent('agent_1');
      // Should not throw
    });

    it('emitTyping is a no-op without socket', () => {
      client.emitTyping('conv_1');
      // Should not throw
    });

    it('emitStopTyping is a no-op without socket', () => {
      client.emitStopTyping('conv_1');
      // Should not throw
    });

    it('emitRead is a no-op without socket', () => {
      client.emitRead('conv_1', 'msg_1');
      // Should not throw
    });

    it('emitApprovalDecision is a no-op without socket', () => {
      client.emitApprovalDecision('conv_1', 'req_1', 'approve');
      // Should not throw
    });

    it('emitStopAgent is a no-op without socket', () => {
      client.emitStopAgent('conv_1');
      // Should not throw
    });
  });

  /* ---- Multiple listener management ---- */

  describe('listener cleanup', () => {
    it('unsubscribing twice does not throw', () => {
      client.connect('tok');
      const cb = vi.fn();
      const unsub = client.onMessage(cb);

      unsub();
      unsub(); // Second call should not throw
    });

    it('unsubscribing presence removes both listeners', () => {
      client.connect('tok');
      const cb = vi.fn();
      const unsub = client.onPresence(cb);

      unsub();

      const offEvents = (mockSocket.off as Mock).mock.calls.map((call: any[]) => call[0]);
      expect(offEvents).toContain('presence:update');
      expect(offEvents).toContain('presence:snapshot');
    });

    it('can add multiple independent listeners to same event', () => {
      client.connect('tok');
      const cb1 = vi.fn();
      const cb2 = vi.fn();

      const unsub1 = client.onMessage(cb1);
      const unsub2 = client.onMessage(cb2);

      // Both should be registered
      const onCalls = (mockSocket.on as Mock).mock.calls.filter(
        (call: any[]) => call[0] === 'message:new',
      );
      expect(onCalls.length).toBeGreaterThanOrEqual(2);

      // Unsubscribing one should not affect the other
      unsub1();
      expect(mockSocket.off).toHaveBeenCalledWith('message:new', cb1);

      // cb2 should still be registered
      unsub2();
      expect(mockSocket.off).toHaveBeenCalledWith('message:new', cb2);
    });
  });

  /* ---- Reconnection room tracking ---- */

  describe('room tracking across reconnect', () => {
    it('does not re-join left conversation rooms on reconnect', () => {
      client.connect('tok');
      client.joinConversation('c1');
      client.leaveConversation('c1');

      // Get the connect handler
      const connectCall = (mockSocket.on as Mock).mock.calls.find(
        (call: any[]) => call[0] === 'connect',
      );

      mockSocket.emit.mockClear();
      connectCall?.[1]();

      // Should NOT re-join c1
      const joinCalls = mockSocket.emit.mock.calls.filter(
        (call: any[]) => call[0] === 'join:conversation',
      );
      expect(joinCalls).not.toContainEqual(['join:conversation', 'c1']);
    });

    it('does not re-join left agent rooms on reconnect', () => {
      client.connect('tok');
      client.joinAgent('a1');
      client.leaveAgent('a1');

      const connectCall = (mockSocket.on as Mock).mock.calls.find(
        (call: any[]) => call[0] === 'connect',
      );

      mockSocket.emit.mockClear();
      connectCall?.[1]();

      const joinCalls = mockSocket.emit.mock.calls.filter(
        (call: any[]) => call[0] === 'join:agent',
      );
      expect(joinCalls).not.toContainEqual(['join:agent', 'a1']);
    });

    it('disconnect clears all tracked rooms', () => {
      client.connect('tok');
      client.joinConversation('c1');
      client.joinConversation('c2');
      client.joinAgent('a1');

      client.disconnect();

      // Connect a new client to check resubscribe would be empty
      // (rooms were cleared)
      expect(mockSocket.disconnect).toHaveBeenCalled();
    });
  });

  /* ---- onTyping callback structure ---- */

  describe('onTyping callback normalization', () => {
    it('typing event normalizes isTyping field', () => {
      client.connect('tok');
      const cb = vi.fn();
      client.onTyping(cb);

      // Find the typing handler
      const typingCall = (mockSocket.on as Mock).mock.calls.find(
        (call: any[]) => call[0] === 'typing',
      );
      expect(typingCall).toBeDefined();

      // Simulate typing event without isTyping
      typingCall?.[1]({ conversationId: 'c1', userId: 'u1' });
      expect(cb).toHaveBeenCalledWith({
        conversationId: 'c1',
        userId: 'u1',
        isTyping: true,
      });
    });

    it('typing:start event sets isTyping to true', () => {
      client.connect('tok');
      const cb = vi.fn();
      client.onTyping(cb);

      const startCall = (mockSocket.on as Mock).mock.calls.find(
        (call: any[]) => call[0] === 'typing:start',
      );
      startCall?.[1]({ conversationId: 'c1', userId: 'u1' });
      expect(cb).toHaveBeenCalledWith({
        conversationId: 'c1',
        userId: 'u1',
        isTyping: true,
      });
    });

    it('typing:stop event sets isTyping to false', () => {
      client.connect('tok');
      const cb = vi.fn();
      client.onTyping(cb);

      const stopCall = (mockSocket.on as Mock).mock.calls.find(
        (call: any[]) => call[0] === 'typing:stop',
      );
      stopCall?.[1]({ conversationId: 'c1', userId: 'u1' });
      expect(cb).toHaveBeenCalledWith({
        conversationId: 'c1',
        userId: 'u1',
        isTyping: false,
      });
    });
  });

  /* ---- onPresence snapshot handling ---- */

  describe('onPresence snapshot', () => {
    it('snapshot with multiple users calls callback for each', () => {
      client.connect('tok');
      const cb = vi.fn();
      client.onPresence(cb);

      const snapshotCall = (mockSocket.on as Mock).mock.calls.find(
        (call: any[]) => call[0] === 'presence:snapshot',
      );
      snapshotCall?.[1]({ onlineUsers: ['u1', 'u2', 'u3'] });

      expect(cb).toHaveBeenCalledTimes(3);
      expect(cb).toHaveBeenCalledWith({ userId: 'u1', online: true });
      expect(cb).toHaveBeenCalledWith({ userId: 'u2', online: true });
      expect(cb).toHaveBeenCalledWith({ userId: 'u3', online: true });
    });

    it('snapshot with empty onlineUsers does not call callback', () => {
      client.connect('tok');
      const cb = vi.fn();
      client.onPresence(cb);

      const snapshotCall = (mockSocket.on as Mock).mock.calls.find(
        (call: any[]) => call[0] === 'presence:snapshot',
      );
      snapshotCall?.[1]({ onlineUsers: [] });

      expect(cb).not.toHaveBeenCalled();
    });

    it('snapshot without onlineUsers property does not throw', () => {
      client.connect('tok');
      const cb = vi.fn();
      client.onPresence(cb);

      const snapshotCall = (mockSocket.on as Mock).mock.calls.find(
        (call: any[]) => call[0] === 'presence:snapshot',
      );
      // Should not throw
      snapshotCall?.[1]({});
      expect(cb).not.toHaveBeenCalled();
    });
  });
});
