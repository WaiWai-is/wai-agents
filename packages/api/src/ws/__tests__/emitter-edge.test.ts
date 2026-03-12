import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock DB connection (required by transitive imports)
vi.mock('../../db/connection.js', () => ({
  sql: Object.assign(vi.fn(), { unsafe: vi.fn() }),
  db: {},
}));

/** Minimal mock of a Socket.IO Server's room-targeting chain */
function createMockIO() {
  const emitFn = vi.fn();
  const fetchSocketsFn = vi.fn().mockResolvedValue([]);
  const toFn = vi.fn().mockReturnValue({ emit: emitFn });
  const inFn = vi.fn().mockReturnValue({ fetchSockets: fetchSocketsFn });

  const io = { to: toFn, in: inFn, emit: emitFn } as any;
  return { io, toFn, inFn, emitFn, fetchSocketsFn };
}

describe('emitter — collaboration event', () => {
  let setIO: typeof import('../../ws/emitter.js').setIO;
  let emitCollaborationEvent: typeof import('../../ws/emitter.js').emitCollaborationEvent;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../../ws/emitter.js');
    setIO = mod.setIO;
    emitCollaborationEvent = mod.emitCollaborationEvent;
  });

  it('throws before setIO is called', () => {
    expect(() =>
      emitCollaborationEvent('user-1', {
        type: 'collaboration:requested',
        collaboration_id: 'c-1',
        requester_agent_id: 'a-1',
        responder_agent_id: 'a-2',
        task_description: 'test task',
        priority: 'normal',
      }),
    ).toThrow('Socket.IO not initialized');
  });

  it('emits collaboration:event to user room', () => {
    const mock = createMockIO();
    setIO(mock.io);

    const event = {
      type: 'collaboration:accepted' as const,
      collaboration_id: 'c-1',
      responder_agent_id: 'a-2',
    };
    emitCollaborationEvent('user-1', event);

    expect(mock.toFn).toHaveBeenCalledWith('user:user-1');
    expect(mock.emitFn).toHaveBeenCalledWith('collaboration:event', event);
  });
});

describe('emitter — room name formatting', () => {
  let setIO: typeof import('../../ws/emitter.js').setIO;
  let emitAgentEvent: typeof import('../../ws/emitter.js').emitAgentEvent;
  let emitMessage: typeof import('../../ws/emitter.js').emitMessage;
  let emitNotification: typeof import('../../ws/emitter.js').emitNotification;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../../ws/emitter.js');
    setIO = mod.setIO;
    emitAgentEvent = mod.emitAgentEvent;
    emitMessage = mod.emitMessage;
    emitNotification = mod.emitNotification;
  });

  it('uses agent: prefix for emitAgentEvent', () => {
    const mock = createMockIO();
    setIO(mock.io);
    emitAgentEvent('abc-123', { type: 'text_delta', text: 'x' });
    expect(mock.toFn).toHaveBeenCalledWith('agent:abc-123');
  });

  it('uses conversation: prefix for emitMessage', () => {
    const mock = createMockIO();
    setIO(mock.io);
    emitMessage('abc-123', { body: 'hi' });
    expect(mock.toFn).toHaveBeenCalledWith('conversation:abc-123');
  });

  it('uses user: prefix for emitNotification', () => {
    const mock = createMockIO();
    setIO(mock.io);
    emitNotification('user-42', { title: 'test' });
    expect(mock.toFn).toHaveBeenCalledWith('user:user-42');
  });
});

describe('emitter — special characters in IDs', () => {
  let setIO: typeof import('../../ws/emitter.js').setIO;
  let emitMessage: typeof import('../../ws/emitter.js').emitMessage;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../../ws/emitter.js');
    setIO = mod.setIO;
    emitMessage = mod.emitMessage;
  });

  it('handles UUID-style conversation IDs', () => {
    const mock = createMockIO();
    setIO(mock.io);
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    emitMessage(uuid, { body: 'test' });
    expect(mock.toFn).toHaveBeenCalledWith(`conversation:${uuid}`);
  });

  it('handles empty string conversation ID', () => {
    const mock = createMockIO();
    setIO(mock.io);
    emitMessage('', { body: 'test' });
    expect(mock.toFn).toHaveBeenCalledWith('conversation:');
    expect(mock.emitFn).toHaveBeenCalledWith('message:new', { body: 'test' });
  });
});

describe('forceLeaveRoom — error handling', () => {
  let setIO: typeof import('../../ws/emitter.js').setIO;
  let forceLeaveRoom: typeof import('../../ws/emitter.js').forceLeaveRoom;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../../ws/emitter.js');
    setIO = mod.setIO;
    forceLeaveRoom = mod.forceLeaveRoom;
  });

  it('handles fetchSockets rejection gracefully', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchSocketsFn = vi.fn().mockRejectedValue(new Error('connection lost'));
    const inFn = vi.fn().mockReturnValue({ fetchSockets: fetchSocketsFn });
    const io = { to: vi.fn(), in: inFn, emit: vi.fn() } as any;
    setIO(io);

    forceLeaveRoom('user-1', 'conv-1');

    await vi.waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining('Failed to force leave room'),
        'connection lost',
      );
    });

    consoleError.mockRestore();
  });

  it('handles empty sockets list gracefully', async () => {
    const fetchSocketsFn = vi.fn().mockResolvedValue([]);
    const inFn = vi.fn().mockReturnValue({ fetchSockets: fetchSocketsFn });
    const io = { to: vi.fn(), in: inFn, emit: vi.fn() } as any;
    setIO(io);

    forceLeaveRoom('user-1', 'conv-1');

    await vi.waitFor(() => {
      expect(fetchSocketsFn).toHaveBeenCalled();
    });
    // No error, no leave calls
  });
});
