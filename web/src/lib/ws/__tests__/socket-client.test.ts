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

describe('SocketClient', () => {
  let client: SocketClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSocket.connected = false;
    client = new SocketClient();
  });

  describe('connect', () => {
    it('creates a socket.io connection with auth token', () => {
      client.connect('my_token');

      expect(io).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          auth: { token: 'my_token' },
          transports: ['websocket', 'polling'],
          reconnection: true,
        }),
      );
    });

    it('does not reconnect if socket is already connected', () => {
      client.connect('tok1');
      mockSocket.connected = true;

      client.connect('tok2');

      // io should only be called once
      expect(io).toHaveBeenCalledOnce();
    });

    it('registers connect, disconnect, and connect_error handlers', () => {
      client.connect('tok');

      const registeredEvents = (mockSocket.on as Mock).mock.calls.map(([event]: [string]) => event);
      expect(registeredEvents).toContain('connect');
      expect(registeredEvents).toContain('disconnect');
      expect(registeredEvents).toContain('connect_error');
    });

    it('applies existing listeners to the new socket', () => {
      // Register a listener before connecting
      client.onMessage(() => {});
      client.connect('tok');

      // The listener should be registered on the socket
      const registeredEvents = (mockSocket.on as Mock).mock.calls.map(([event]: [string]) => event);
      expect(registeredEvents).toContain('message:new');
    });
  });

  describe('disconnect', () => {
    it('disconnects the socket and clears rooms', () => {
      client.connect('tok');
      client.joinConversation('c1');

      client.disconnect();

      expect(mockSocket.disconnect).toHaveBeenCalled();
    });

    it('is a no-op when not connected', () => {
      client.disconnect();
      expect(mockSocket.disconnect).not.toHaveBeenCalled();
    });
  });

  describe('isConnected', () => {
    it('returns false when no socket exists', () => {
      expect(client.isConnected()).toBe(false);
    });

    it('returns the connected state of the socket', () => {
      client.connect('tok');
      expect(client.isConnected()).toBe(false);

      mockSocket.connected = true;
      expect(client.isConnected()).toBe(true);
    });
  });

  describe('room management', () => {
    beforeEach(() => {
      client.connect('tok');
    });

    it('joinConversation emits join:conversation', () => {
      client.joinConversation('conv_1');
      expect(mockSocket.emit).toHaveBeenCalledWith('join:conversation', 'conv_1');
    });

    it('leaveConversation emits leave:conversation', () => {
      client.leaveConversation('conv_1');
      expect(mockSocket.emit).toHaveBeenCalledWith('leave:conversation', 'conv_1');
    });

    it('joinAgent emits join:agent', () => {
      client.joinAgent('agent_1');
      expect(mockSocket.emit).toHaveBeenCalledWith('join:agent', 'agent_1');
    });

    it('leaveAgent emits leave:agent', () => {
      client.leaveAgent('agent_1');
      expect(mockSocket.emit).toHaveBeenCalledWith('leave:agent', 'agent_1');
    });

    it('joinConversation is a no-op without a socket', () => {
      const disconnectedClient = new SocketClient();
      disconnectedClient.joinConversation('conv_1');
      // No error, no emit on mockSocket (from this client)
    });
  });

  describe('event listeners', () => {
    beforeEach(() => {
      client.connect('tok');
    });

    it('onMessage registers message:new listener', () => {
      const cb = vi.fn();
      client.onMessage(cb);

      const registeredEvents = (mockSocket.on as Mock).mock.calls.map(([event]: [string]) => event);
      expect(registeredEvents).toContain('message:new');
    });

    it('onMessageUpdated registers message:updated listener', () => {
      const cb = vi.fn();
      client.onMessageUpdated(cb);

      const registeredEvents = (mockSocket.on as Mock).mock.calls.map(([event]: [string]) => event);
      expect(registeredEvents).toContain('message:updated');
    });

    it('onMessageDeleted registers message:deleted listener', () => {
      const cb = vi.fn();
      client.onMessageDeleted(cb);

      const registeredEvents = (mockSocket.on as Mock).mock.calls.map(([event]: [string]) => event);
      expect(registeredEvents).toContain('message:deleted');
    });

    it('onAgentEvent registers agent:event listener', () => {
      const cb = vi.fn();
      client.onAgentEvent(cb);

      const registeredEvents = (mockSocket.on as Mock).mock.calls.map(([event]: [string]) => event);
      expect(registeredEvents).toContain('agent:event');
    });

    it('onTyping registers typing, typing:start, and typing:stop listeners', () => {
      const cb = vi.fn();
      client.onTyping(cb);

      const registeredEvents = (mockSocket.on as Mock).mock.calls.map(([event]: [string]) => event);
      expect(registeredEvents).toContain('typing');
      expect(registeredEvents).toContain('typing:start');
      expect(registeredEvents).toContain('typing:stop');
    });

    it('onPresence registers presence:update and presence:snapshot listeners', () => {
      const cb = vi.fn();
      client.onPresence(cb);

      const registeredEvents = (mockSocket.on as Mock).mock.calls.map(([event]: [string]) => event);
      expect(registeredEvents).toContain('presence:update');
      expect(registeredEvents).toContain('presence:snapshot');
    });

    it('unsubscribe function removes the listener', () => {
      const cb = vi.fn();
      const unsubscribe = client.onMessage(cb);

      unsubscribe();

      expect(mockSocket.off).toHaveBeenCalledWith('message:new', cb);
    });

    it('onTyping unsubscribe removes all three typing listeners', () => {
      const cb = vi.fn();
      const unsubscribe = client.onTyping(cb);

      unsubscribe();

      const offEvents = (mockSocket.off as Mock).mock.calls.map(([event]: [string]) => event);
      expect(offEvents).toContain('typing');
      expect(offEvents).toContain('typing:start');
      expect(offEvents).toContain('typing:stop');
    });

    it('listeners registered before connect are applied on connect', () => {
      const freshClient = new SocketClient();
      const cb = vi.fn();
      freshClient.onMessage(cb);

      // Clear mocks from earlier connect calls
      vi.clearAllMocks();

      freshClient.connect('tok');

      const registeredEvents = (mockSocket.on as Mock).mock.calls.map(([event]: [string]) => event);
      expect(registeredEvents).toContain('message:new');
    });
  });

  describe('emit methods', () => {
    beforeEach(() => {
      client.connect('tok');
    });

    it('emitTyping emits typing:start', () => {
      client.emitTyping('conv_1');
      expect(mockSocket.emit).toHaveBeenCalledWith('typing:start', 'conv_1');
    });

    it('emitStopTyping emits typing:stop', () => {
      client.emitStopTyping('conv_1');
      expect(mockSocket.emit).toHaveBeenCalledWith('typing:stop', 'conv_1');
    });

    it('emitRead emits read with conversationId and messageId', () => {
      client.emitRead('conv_1', 'msg_1');
      expect(mockSocket.emit).toHaveBeenCalledWith('read', {
        conversationId: 'conv_1',
        messageId: 'msg_1',
      });
    });

    it('emitApprovalDecision emits approval_decision', () => {
      client.emitApprovalDecision('conv_1', 'req_1', 'approve', 'allow_session');

      expect(mockSocket.emit).toHaveBeenCalledWith('approval_decision', {
        conversationId: 'conv_1',
        requestId: 'req_1',
        decision: 'approve',
        scope: 'allow_session',
      });
    });

    it('emitApprovalDecision uses default scope', () => {
      client.emitApprovalDecision('conv_1', 'req_1', 'deny');

      expect(mockSocket.emit).toHaveBeenCalledWith('approval_decision', {
        conversationId: 'conv_1',
        requestId: 'req_1',
        decision: 'deny',
        scope: 'allow_once',
      });
    });

    it('emitStopAgent emits agent:stop', () => {
      client.emitStopAgent('conv_1');
      expect(mockSocket.emit).toHaveBeenCalledWith('agent:stop', {
        conversationId: 'conv_1',
      });
    });
  });

  describe('resubscribe on reconnect', () => {
    it('re-joins conversation rooms on connect event', () => {
      client.connect('tok');
      client.joinConversation('c1');
      client.joinConversation('c2');

      // Find the 'connect' handler
      const connectCall = (mockSocket.on as Mock).mock.calls.find(
        ([event]: [string]) => event === 'connect',
      );
      expect(connectCall).toBeDefined();

      // Clear emits to check re-join
      mockSocket.emit.mockClear();

      // Simulate reconnect
      const connectHandler = connectCall[1];
      connectHandler();

      expect(mockSocket.emit).toHaveBeenCalledWith('join:conversation', 'c1');
      expect(mockSocket.emit).toHaveBeenCalledWith('join:conversation', 'c2');
    });

    it('re-joins agent rooms on connect event', () => {
      client.connect('tok');
      client.joinAgent('a1');

      const connectCall = (mockSocket.on as Mock).mock.calls.find(
        ([event]: [string]) => event === 'connect',
      );

      mockSocket.emit.mockClear();
      connectCall[1]();

      expect(mockSocket.emit).toHaveBeenCalledWith('join:agent', 'a1');
    });
  });
});
