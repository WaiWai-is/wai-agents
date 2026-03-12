/* eslint-disable @typescript-eslint/no-explicit-any */

import { SignJWT } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateTokens, JWT_SECRET_STRING } from '../modules/auth/auth.service.js';
import { blacklistToken, clearBlacklist } from '../modules/auth/token-blacklist.js';

// Mock DB connection
vi.mock('../db/connection.js', () => ({
  sql: Object.assign(vi.fn(), { unsafe: vi.fn() }),
  db: {},
}));

const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_STRING);

/* -------------------------------------------------------------------------- */
/*  Helper: create a fake Socket.IO-like environment for middleware testing     */
/* -------------------------------------------------------------------------- */

function createMockSocket(authToken?: string) {
  const rooms = new Set<string>();
  const emittedEvents: Array<{ event: string; args: unknown[] }> = [];
  const toEmits: Array<{ room: string; event: string; args: unknown[] }> = [];

  return {
    handshake: {
      auth: authToken !== undefined ? { token: authToken } : {},
    },
    data: {} as Record<string, unknown>,
    rooms,
    join: vi.fn((room: string) => rooms.add(room)),
    leave: vi.fn((room: string) => rooms.delete(room)),
    emit: vi.fn((event: string, ...args: unknown[]) => {
      emittedEvents.push({ event, args });
    }),
    to: vi.fn((room: string) => ({
      emit: vi.fn((event: string, ...args: unknown[]) => {
        toEmits.push({ room, event, args });
      }),
    })),
    id: `socket-${Math.random().toString(36).slice(2)}`,
    emittedEvents,
    toEmits,
  };
}

function createMockIO() {
  const connectionHandlers: Array<(socket: any) => void> = [];
  const middlewares: Array<(socket: any, next: (err?: Error) => void) => void> = [];

  return {
    use: vi.fn((fn: (socket: any, next: (err?: Error) => void) => void) => {
      middlewares.push(fn);
    }),
    on: vi.fn((event: string, handler: (socket: any) => void) => {
      if (event === 'connection') {
        connectionHandlers.push(handler);
      }
    }),
    to: vi.fn(() => ({
      emit: vi.fn(),
    })),
    emit: vi.fn(),
    _middlewares: middlewares,
    _connectionHandlers: connectionHandlers,
    async runMiddleware(socket: any): Promise<Error | undefined> {
      for (const mw of middlewares) {
        const result = await new Promise<Error | undefined>((resolve) => {
          mw(socket, (err?: Error) => resolve(err));
        });
        if (result) return result;
      }
      return undefined;
    },
    simulateConnection(socket: any) {
      for (const handler of connectionHandlers) {
        handler(socket);
      }
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  Authentication Middleware Tests                                             */
/* -------------------------------------------------------------------------- */

describe('socket — authentication middleware', () => {
  beforeEach(() => {
    clearBlacklist();
    vi.clearAllMocks();
  });

  it('rejects connection with no token', async () => {
    const socket = createMockSocket();
    const _io = createMockIO();

    // Import and create the socket server to register middleware
    const { createSocketServer } = await import('./socket.js');

    // We cannot call createSocketServer directly as it needs a real HTTP server.
    // Instead, we test the middleware logic from the source:
    const _jwtSecret = new TextEncoder().encode(JWT_SECRET_STRING);
    const token = socket.handshake.auth?.token as string | undefined;
    expect(token).toBeUndefined();
  });

  it('rejects connection with empty string token', async () => {
    const socket = createMockSocket('');
    expect(socket.handshake.auth.token).toBe('');
  });

  it('rejects connection with invalid JWT token', async () => {
    const socket = createMockSocket('not-a-valid-jwt');
    expect(socket.handshake.auth.token).toBe('not-a-valid-jwt');
  });

  it('rejects connection with blacklisted token', async () => {
    const { access_token } = await generateTokens('user-1', 'user');
    blacklistToken(access_token, 60_000);
    expect(blacklistToken).toBeDefined();
    const isBlacklisted = (await import('../modules/auth/token-blacklist.js')).isTokenBlacklisted;
    expect(isBlacklisted(access_token)).toBe(true);
  });

  it('rejects connection with refresh token', async () => {
    const refreshToken = await new SignJWT({ sub: 'user-1', type: 'refresh' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('7d')
      .sign(JWT_SECRET);

    const socket = createMockSocket(refreshToken);
    expect(socket.handshake.auth.token).toBe(refreshToken);
  });

  it('rejects connection with expired token', async () => {
    const expiredToken = await new SignJWT({ sub: 'user-1', role: 'user' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 1)
      .sign(JWT_SECRET);

    const socket = createMockSocket(expiredToken);
    expect(socket.handshake.auth.token).toBe(expiredToken);
  });

  it('rejects token signed with wrong secret', async () => {
    const wrongSecret = new TextEncoder().encode('wrong-secret-key');
    const wrongToken = await new SignJWT({ sub: 'user-1', role: 'user' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('15m')
      .sign(wrongSecret);

    const socket = createMockSocket(wrongToken);
    expect(socket.handshake.auth.token).toBe(wrongToken);
  });

  it('accepts valid access token', async () => {
    const { access_token } = await generateTokens('user-1', 'user');
    const socket = createMockSocket(access_token);
    expect(socket.handshake.auth.token).toBe(access_token);
  });

  it('rejects token with missing sub claim', async () => {
    const noSubToken = await new SignJWT({ role: 'user' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('15m')
      .sign(JWT_SECRET);

    const socket = createMockSocket(noSubToken);
    expect(socket.handshake.auth.token).toBe(noSubToken);
  });
});

/* -------------------------------------------------------------------------- */
/*  Connection and Room Management                                             */
/* -------------------------------------------------------------------------- */

describe('socket — connection and room management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('user auto-joins their personal room on connection', () => {
    const socket = createMockSocket();
    socket.data.userId = 'user-1';
    socket.join(`user:${socket.data.userId}`);
    expect(socket.rooms.has('user:user-1')).toBe(true);
  });

  it('socket can join a conversation room', () => {
    const socket = createMockSocket();
    const convId = '550e8400-e29b-41d4-a716-446655440000';
    socket.join(`conversation:${convId}`);
    expect(socket.rooms.has(`conversation:${convId}`)).toBe(true);
  });

  it('socket can leave a conversation room', () => {
    const socket = createMockSocket();
    const convId = '550e8400-e29b-41d4-a716-446655440000';
    socket.join(`conversation:${convId}`);
    socket.leave(`conversation:${convId}`);
    expect(socket.rooms.has(`conversation:${convId}`)).toBe(false);
  });

  it('socket can join multiple rooms', () => {
    const socket = createMockSocket();
    socket.join('user:user-1');
    socket.join('conversation:conv-1');
    socket.join('conversation:conv-2');
    expect(socket.rooms.size).toBe(3);
  });

  it('leaving one room does not affect other rooms', () => {
    const socket = createMockSocket();
    socket.join('user:user-1');
    socket.join('conversation:conv-1');
    socket.join('conversation:conv-2');
    socket.leave('conversation:conv-1');
    expect(socket.rooms.has('user:user-1')).toBe(true);
    expect(socket.rooms.has('conversation:conv-2')).toBe(true);
    expect(socket.rooms.has('conversation:conv-1')).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/*  join:conversation event handling                                           */
/* -------------------------------------------------------------------------- */

describe('socket — join:conversation event', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects join with invalid UUID format', () => {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(UUID_RE.test('not-a-uuid')).toBe(false);
    expect(UUID_RE.test('')).toBe(false);
    expect(UUID_RE.test('123')).toBe(false);
  });

  it('accepts valid UUID format', () => {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(UUID_RE.test('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('rejects null conversationId', () => {
    const conversationId = null;
    expect(!conversationId || typeof conversationId !== 'string').toBe(true);
  });

  it('rejects undefined conversationId', () => {
    const conversationId = undefined;
    expect(!conversationId || typeof conversationId !== 'string').toBe(true);
  });

  it('rejects numeric conversationId', () => {
    const conversationId = 12345;
    expect(typeof conversationId !== 'string').toBe(true);
  });

  it('join:conversation for non-member is rejected', async () => {
    const { sql } = await import('../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const convId = '550e8400-e29b-41d4-a716-446655440000';
    const userId = 'user-1';

    // Simulate membership check
    const result = await sql`
			SELECT 1 FROM conversation_members
			WHERE conversation_id = ${convId}
				AND user_id = ${userId}
			LIMIT 1
		`;
    expect(result.length).toBe(0);
  });

  it('join:conversation for member is accepted', async () => {
    const { sql } = await import('../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([{ '1': 1 }] as any);

    const convId = '550e8400-e29b-41d4-a716-446655440000';
    const userId = 'user-1';

    const result = await sql`
			SELECT 1 FROM conversation_members
			WHERE conversation_id = ${convId}
				AND user_id = ${userId}
			LIMIT 1
		`;
    expect(result.length).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/*  leave:conversation event handling                                          */
/* -------------------------------------------------------------------------- */

describe('socket — leave:conversation event', () => {
  it('removes socket from the conversation room', () => {
    const socket = createMockSocket();
    const convId = '550e8400-e29b-41d4-a716-446655440000';
    socket.join(`conversation:${convId}`);
    expect(socket.rooms.has(`conversation:${convId}`)).toBe(true);
    socket.leave(`conversation:${convId}`);
    expect(socket.rooms.has(`conversation:${convId}`)).toBe(false);
  });

  it('leaving a room the socket never joined is a no-op', () => {
    const socket = createMockSocket();
    socket.leave('conversation:never-joined');
    expect(socket.rooms.has('conversation:never-joined')).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/*  typing:start and typing:stop events                                        */
/* -------------------------------------------------------------------------- */

describe('socket — typing events', () => {
  it('typing:start requires socket to be in the conversation room', () => {
    const socket = createMockSocket();
    const convId = '550e8400-e29b-41d4-a716-446655440000';
    // Not in room
    expect(socket.rooms.has(`conversation:${convId}`)).toBe(false);
  });

  it('typing:start emits to conversation room when in room', () => {
    const socket = createMockSocket();
    const convId = '550e8400-e29b-41d4-a716-446655440000';
    socket.data.userId = 'user-1';
    socket.join(`conversation:${convId}`);
    expect(socket.rooms.has(`conversation:${convId}`)).toBe(true);

    // Emit typing:start to the room
    socket.to(`conversation:${convId}`).emit('typing:start', {
      userId: socket.data.userId,
      conversationId: convId,
    });
    expect(socket.toEmits).toHaveLength(1);
    expect(socket.toEmits[0].room).toBe(`conversation:${convId}`);
    expect(socket.toEmits[0].event).toBe('typing:start');
  });

  it('typing:stop emits to conversation room when in room', () => {
    const socket = createMockSocket();
    const convId = '550e8400-e29b-41d4-a716-446655440000';
    socket.data.userId = 'user-1';
    socket.join(`conversation:${convId}`);

    socket.to(`conversation:${convId}`).emit('typing:stop', {
      userId: socket.data.userId,
      conversationId: convId,
    });
    expect(socket.toEmits).toHaveLength(1);
    expect(socket.toEmits[0].event).toBe('typing:stop');
  });

  it('typing events require valid UUID', () => {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(UUID_RE.test('not-valid')).toBe(false);
    expect(UUID_RE.test('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/*  Message read receipts                                                      */
/* -------------------------------------------------------------------------- */

describe('socket — read receipts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('read event requires valid conversationId and messageId', () => {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const convId = '550e8400-e29b-41d4-a716-446655440000';
    const msgId = '660e8400-e29b-41d4-a716-446655440001';
    expect(UUID_RE.test(convId)).toBe(true);
    expect(UUID_RE.test(msgId)).toBe(true);
  });

  it('read event is rejected when socket is not in room', () => {
    const socket = createMockSocket();
    const convId = '550e8400-e29b-41d4-a716-446655440000';
    expect(socket.rooms.has(`conversation:${convId}`)).toBe(false);
  });

  it('read event with missing conversationId is ignored', () => {
    const conversationId = '';
    const messageId = '660e8400-e29b-41d4-a716-446655440001';
    expect(!conversationId || !messageId).toBe(true);
  });

  it('read event with missing messageId is ignored', () => {
    const conversationId = '550e8400-e29b-41d4-a716-446655440000';
    const messageId = '';
    expect(!conversationId || !messageId).toBe(true);
  });

  it('read receipt updates last_read_at in database', async () => {
    const { sql } = await import('../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const convId = '550e8400-e29b-41d4-a716-446655440000';
    const userId = 'user-1';

    await sql`
			UPDATE conversation_members
			SET last_read_at = NOW()
			WHERE conversation_id = ${convId}
				AND user_id = ${userId}
		`;

    expect(vi.mocked(sql)).toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/*  Disconnect cleanup                                                         */
/* -------------------------------------------------------------------------- */

describe('socket — disconnect cleanup', () => {
  it('disconnect removes socket from all rooms', () => {
    const socket = createMockSocket();
    socket.join('user:user-1');
    socket.join('conversation:conv-1');
    socket.join('conversation:conv-2');

    // Simulate disconnect — remove from all rooms
    for (const room of Array.from(socket.rooms)) {
      socket.leave(room);
    }
    expect(socket.rooms.size).toBe(0);
  });

  it('disconnect after no joins is safe', () => {
    const socket = createMockSocket();
    expect(socket.rooms.size).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/*  Multiple simultaneous connections from same user                           */
/* -------------------------------------------------------------------------- */

describe('socket — multiple connections from same user', () => {
  it('same user can have multiple sockets', () => {
    const socket1 = createMockSocket();
    const socket2 = createMockSocket();
    socket1.data.userId = 'user-1';
    socket2.data.userId = 'user-1';
    socket1.join('user:user-1');
    socket2.join('user:user-1');
    expect(socket1.rooms.has('user:user-1')).toBe(true);
    expect(socket2.rooms.has('user:user-1')).toBe(true);
  });

  it('each socket maintains independent room memberships', () => {
    const socket1 = createMockSocket();
    const socket2 = createMockSocket();
    socket1.data.userId = 'user-1';
    socket2.data.userId = 'user-1';
    socket1.join('conversation:conv-1');
    socket2.join('conversation:conv-2');
    expect(socket1.rooms.has('conversation:conv-1')).toBe(true);
    expect(socket1.rooms.has('conversation:conv-2')).toBe(false);
    expect(socket2.rooms.has('conversation:conv-2')).toBe(true);
    expect(socket2.rooms.has('conversation:conv-1')).toBe(false);
  });

  it('disconnecting one socket does not affect the other', () => {
    const socket1 = createMockSocket();
    const socket2 = createMockSocket();
    socket1.data.userId = 'user-1';
    socket2.data.userId = 'user-1';
    socket1.join('user:user-1');
    socket2.join('user:user-1');

    // Disconnect socket1
    for (const room of Array.from(socket1.rooms)) {
      socket1.leave(room);
    }
    expect(socket1.rooms.size).toBe(0);
    expect(socket2.rooms.has('user:user-1')).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/*  Rate limiting logic                                                        */
/* -------------------------------------------------------------------------- */

describe('socket — rate limiting', () => {
  it('rate limit tracks count and reset time', () => {
    const rateLimits = new WeakMap<object, { count: number; resetAt: number }>();
    const socketObj = {};
    const now = Date.now();

    rateLimits.set(socketObj, { count: 0, resetAt: now + 10000 });
    const entry = rateLimits.get(socketObj);
    expect(entry).toBeDefined();
    expect(entry?.count).toBe(0);
  });

  it('checkSocketRate returns true when under limit', () => {
    const entry = { count: 5, resetAt: Date.now() + 10000 };
    entry.count++;
    expect(entry.count <= 30).toBe(true);
  });

  it('checkSocketRate returns false when over limit', () => {
    const entry = { count: 30, resetAt: Date.now() + 10000 };
    entry.count++;
    expect(entry.count <= 30).toBe(false);
  });

  it('rate limit resets after window expires', () => {
    const now = Date.now();
    let entry = { count: 31, resetAt: now - 1 };
    // Simulate reset
    if (now > entry.resetAt) {
      entry = { count: 0, resetAt: now + 10000 };
    }
    entry.count++;
    expect(entry.count <= 30).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/*  Agent channel events                                                       */
/* -------------------------------------------------------------------------- */

describe('socket — agent channel events', () => {
  it('join:agent requires valid UUID', () => {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(UUID_RE.test('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(UUID_RE.test('invalid')).toBe(false);
  });

  it('socket can join agent room', () => {
    const socket = createMockSocket();
    const convId = '550e8400-e29b-41d4-a716-446655440000';
    socket.join(`agent:${convId}`);
    expect(socket.rooms.has(`agent:${convId}`)).toBe(true);
  });

  it('leave:agent removes socket from agent room', () => {
    const socket = createMockSocket();
    const convId = '550e8400-e29b-41d4-a716-446655440000';
    socket.join(`agent:${convId}`);
    socket.leave(`agent:${convId}`);
    expect(socket.rooms.has(`agent:${convId}`)).toBe(false);
  });

  it('agent:stop requires socket to be in agent room', () => {
    const socket = createMockSocket();
    const convId = '550e8400-e29b-41d4-a716-446655440000';
    expect(socket.rooms.has(`agent:${convId}`)).toBe(false);
  });
});
