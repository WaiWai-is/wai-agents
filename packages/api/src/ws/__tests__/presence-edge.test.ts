import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock DB connection (required by transitive imports)
vi.mock('../../db/connection.js', () => ({
  sql: Object.assign(vi.fn(), { unsafe: vi.fn() }),
  db: {},
}));

describe('presence — addToPresence', () => {
  let addToPresence: typeof import('../../ws/presence.js').addToPresence;
  let removeFromPresence: typeof import('../../ws/presence.js').removeFromPresence;
  let getOnlineUsers: typeof import('../../ws/presence.js').getOnlineUsers;
  let isUserOnline: typeof import('../../ws/presence.js').isUserOnline;

  function createMockIO() {
    return { emit: vi.fn() } as any;
  }

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    const mod = await import('../../ws/presence.js');
    addToPresence = mod.addToPresence;
    removeFromPresence = mod.removeFromPresence;
    getOnlineUsers = mod.getOnlineUsers;
    isUserOnline = mod.isUserOnline;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits presence:update online when first socket connects', () => {
    const io = createMockIO();
    addToPresence(io, 'user-1', 'socket-1');
    expect(io.emit).toHaveBeenCalledWith('presence:update', { userId: 'user-1', online: true });
  });

  it('does not emit when user already has a socket', () => {
    const io = createMockIO();
    addToPresence(io, 'user-1', 'socket-1');
    io.emit.mockClear();

    addToPresence(io, 'user-1', 'socket-2');
    expect(io.emit).not.toHaveBeenCalled();
  });

  it('isUserOnline returns true for online user', () => {
    const io = createMockIO();
    addToPresence(io, 'user-1', 'socket-1');
    expect(isUserOnline('user-1')).toBe(true);
  });

  it('isUserOnline returns false for unknown user', () => {
    expect(isUserOnline('unknown')).toBe(false);
  });

  it('getOnlineUsers returns all online users', () => {
    const io = createMockIO();
    addToPresence(io, 'user-1', 'socket-1');
    addToPresence(io, 'user-2', 'socket-2');

    const online = getOnlineUsers();
    expect(online).toContain('user-1');
    expect(online).toContain('user-2');
    expect(online.length).toBe(2);
  });
});

describe('presence — removeFromPresence', () => {
  let addToPresence: typeof import('../../ws/presence.js').addToPresence;
  let removeFromPresence: typeof import('../../ws/presence.js').removeFromPresence;
  let isUserOnline: typeof import('../../ws/presence.js').isUserOnline;
  let getOnlineUsers: typeof import('../../ws/presence.js').getOnlineUsers;

  function createMockIO() {
    return { emit: vi.fn() } as any;
  }

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    const mod = await import('../../ws/presence.js');
    addToPresence = mod.addToPresence;
    removeFromPresence = mod.removeFromPresence;
    isUserOnline = mod.isUserOnline;
    getOnlineUsers = mod.getOnlineUsers;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not immediately mark user offline when last socket disconnects', () => {
    const io = createMockIO();
    addToPresence(io, 'user-1', 'socket-1');
    io.emit.mockClear();

    removeFromPresence(io, 'user-1', 'socket-1');

    // Should not emit offline yet (grace period)
    expect(io.emit).not.toHaveBeenCalledWith('presence:update', {
      userId: 'user-1',
      online: false,
    });
  });

  it('emits offline after grace period', () => {
    const io = createMockIO();
    addToPresence(io, 'user-1', 'socket-1');
    io.emit.mockClear();

    removeFromPresence(io, 'user-1', 'socket-1');

    // Advance past the 30s grace period
    vi.advanceTimersByTime(31_000);

    expect(io.emit).toHaveBeenCalledWith('presence:update', {
      userId: 'user-1',
      online: false,
    });
  });

  it('cancels offline emit if user reconnects within grace period', () => {
    const io = createMockIO();
    addToPresence(io, 'user-1', 'socket-1');
    io.emit.mockClear();

    removeFromPresence(io, 'user-1', 'socket-1');

    // Reconnect within grace period
    vi.advanceTimersByTime(15_000);
    addToPresence(io, 'user-1', 'socket-2');

    // Advance past remaining grace period
    vi.advanceTimersByTime(20_000);

    // Should not have emitted offline since user reconnected
    expect(io.emit).not.toHaveBeenCalledWith('presence:update', {
      userId: 'user-1',
      online: false,
    });
  });

  it('does not emit offline when user has other active sockets', () => {
    const io = createMockIO();
    addToPresence(io, 'user-1', 'socket-1');
    addToPresence(io, 'user-1', 'socket-2');
    io.emit.mockClear();

    removeFromPresence(io, 'user-1', 'socket-1');

    vi.advanceTimersByTime(31_000);

    // User still has socket-2, should not emit offline
    expect(io.emit).not.toHaveBeenCalledWith('presence:update', {
      userId: 'user-1',
      online: false,
    });
    expect(isUserOnline('user-1')).toBe(true);
  });

  it('removes user from presenceMap after grace period', () => {
    const io = createMockIO();
    addToPresence(io, 'user-1', 'socket-1');

    removeFromPresence(io, 'user-1', 'socket-1');
    vi.advanceTimersByTime(31_000);

    expect(isUserOnline('user-1')).toBe(false);
    expect(getOnlineUsers()).not.toContain('user-1');
  });

  it('handles removing unknown socket gracefully', () => {
    const io = createMockIO();
    // Should not throw
    removeFromPresence(io, 'unknown-user', 'unknown-socket');

    vi.advanceTimersByTime(31_000);
    expect(io.emit).toHaveBeenCalledWith('presence:update', {
      userId: 'unknown-user',
      online: false,
    });
  });

  it('handles multiple rapid disconnects and reconnects', () => {
    const io = createMockIO();
    addToPresence(io, 'user-1', 'socket-1');
    io.emit.mockClear();

    removeFromPresence(io, 'user-1', 'socket-1');
    vi.advanceTimersByTime(5_000);
    addToPresence(io, 'user-1', 'socket-2');
    removeFromPresence(io, 'user-1', 'socket-2');
    vi.advanceTimersByTime(5_000);
    addToPresence(io, 'user-1', 'socket-3');

    vi.advanceTimersByTime(31_000);

    // Should not have emitted offline because user reconnected
    expect(io.emit).not.toHaveBeenCalledWith('presence:update', {
      userId: 'user-1',
      online: false,
    });
  });
});
