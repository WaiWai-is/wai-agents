/* eslint-disable @typescript-eslint/no-explicit-any */

import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authRoutes } from './auth.routes.js';
import { generateTokens } from './auth.service.js';
import { createRateLimiter } from './rate-limiter.js';
import { clearBlacklist } from './token-blacklist.js';
import { userRoutes } from './user.routes.js';

// Mock DB connection
vi.mock('../../db/connection.js', () => ({
  sql: Object.assign(vi.fn(), { unsafe: vi.fn() }),
  db: {},
}));

// The authRoutes module uses a module-level rate limiter with 5 req/min.
// In tests we use unique IPs per request to avoid state bleeding.
let ipCounter = 0;
function nextIp() {
  ipCounter++;
  return `10.${Math.floor(ipCounter / 255)}.${ipCounter % 255}.1`;
}

function buildApp() {
  const app = new Hono();
  app.route('/auth', authRoutes);
  app.route('/users', userRoutes);
  return app;
}

async function request(
  app: ReturnType<typeof buildApp>,
  method: string,
  path: string,
  opts: { body?: unknown; headers?: Record<string, string> } = {},
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-real-ip': nextIp(), // unique IP per request to avoid rate limit bleeding
    ...opts.headers,
  };
  const req = new Request(`http://localhost${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const res = await app.fetch(req);
  const json = (await res.json().catch(() => null)) as any;
  return { status: res.status, body: json };
}

let app: ReturnType<typeof buildApp>;

beforeEach(() => {
  vi.clearAllMocks();
  clearBlacklist();
  app = buildApp();
});

describe('POST /auth/register', () => {
  it('returns 422 for invalid input', async () => {
    const { status } = await request(app, 'POST', '/auth/register', {
      body: { username: 'ab', email: 'not-email', password: 'short' },
    });
    expect(status).toBe(422);
  });

  it('returns 409 when email/username is taken', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([{ id: 'existing' }] as any);

    const { status, body } = await request(app, 'POST', '/auth/register', {
      body: { username: 'newuser', email: 'taken@example.com', password: 'password123' },
    });
    expect(status).toBe(409);
    expect(body.error).toBe('Conflict');
  });

  it('returns 201 with user and tokens on success', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql)
      .mockResolvedValueOnce([] as any) // no existing
      .mockResolvedValueOnce([
        {
          id: 'new-uuid',
          username: 'newuser',
          display_name: null,
          email: 'new@example.com',
          avatar_url: null,
          bio: null,
          status: 'active',
          role: 'user',
          settings: {},
          plan: 'free',
          inserted_at: new Date(),
          updated_at: new Date(),
        },
      ] as any);

    const { status, body } = await request(app, 'POST', '/auth/register', {
      body: { username: 'newuser', email: 'new@example.com', password: 'password123' },
    });
    expect(status).toBe(201);
    expect(body.user.username).toBe('newuser');
    expect(body.tokens.access_token).toBeDefined();
    expect(body.tokens.refresh_token).toBeDefined();
  });
});

describe('POST /auth/login', () => {
  it('returns 422 for missing fields', async () => {
    const { status } = await request(app, 'POST', '/auth/login', {
      body: { email: 'x@x.com' },
    });
    expect(status).toBe(422);
  });

  it('returns 401 for unknown email', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { status } = await request(app, 'POST', '/auth/login', {
      body: { email: 'nobody@example.com', password: 'password123' },
    });
    expect(status).toBe(401);
  });

  it('returns 200 with user and tokens on success', async () => {
    const { sql } = await import('../../db/connection.js');
    const { hashPassword } = await import('./auth.service.js');
    const passwordHash = await hashPassword('correctpass');

    vi.mocked(sql).mockResolvedValueOnce([
      {
        id: 'user-uuid',
        username: 'loginuser',
        display_name: null,
        email: 'login@example.com',
        password_hash: passwordHash,
        avatar_url: null,
        bio: null,
        status: 'active',
        role: 'user',
        settings: {},
        plan: 'free',
        inserted_at: new Date(),
        updated_at: new Date(),
      },
    ] as any);

    const { status, body } = await request(app, 'POST', '/auth/login', {
      body: { email: 'login@example.com', password: 'correctpass' },
    });
    expect(status).toBe(200);
    expect(body.user.email).toBe('login@example.com');
    expect(body.tokens.access_token).toBeDefined();
  });
});

describe('POST /auth/refresh', () => {
  it('returns 401 for invalid refresh token', async () => {
    const { status } = await request(app, 'POST', '/auth/refresh', {
      body: { refresh_token: 'invalid.token.here' },
    });
    expect(status).toBe(401);
  });

  it('returns 200 with new tokens for valid refresh token', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([{ id: 'user-uuid', role: 'user' }] as any);

    const { refresh_token } = await generateTokens('user-uuid', 'user');
    const { status, body } = await request(app, 'POST', '/auth/refresh', {
      body: { refresh_token },
    });
    expect(status).toBe(200);
    expect(body.tokens.access_token).toBeDefined();
  });
});

describe('DELETE /auth/logout', () => {
  it('returns 401 without auth token', async () => {
    const { status } = await request(app, 'DELETE', '/auth/logout');
    expect(status).toBe(401);
  });

  it('returns 200 with valid auth token', async () => {
    const { access_token } = await generateTokens('user-uuid', 'user');
    const { status, body } = await request(app, 'DELETE', '/auth/logout', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    expect(status).toBe(200);
    expect(body.message).toContain('Logged out');
  });
});

describe('GET /users/me', () => {
  it('returns 401 without token', async () => {
    const { status } = await request(app, 'GET', '/users/me');
    expect(status).toBe(401);
  });

  it('returns 200 with user data for authenticated request', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([
      {
        id: 'user-uuid',
        username: 'meuser',
        display_name: 'Me User',
        email: 'me@example.com',
        avatar_url: null,
        bio: null,
        status: 'active',
        role: 'user',
        settings: {},
        plan: 'free',
        inserted_at: new Date(),
        updated_at: new Date(),
      },
    ] as any);

    const { access_token } = await generateTokens('user-uuid', 'user');
    const { status, body } = await request(app, 'GET', '/users/me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    expect(status).toBe(200);
    expect(body.user.username).toBe('meuser');
  });
});

describe('authMiddleware', () => {
  it('blocks requests with no Authorization header', async () => {
    const testApp = new Hono();
    const { authMiddleware } = await import('./auth.middleware.js');
    testApp.get('/protected', authMiddleware, (c) => c.json({ ok: true }));

    const res = await testApp.fetch(new Request('http://localhost/protected'));
    expect(res.status).toBe(401);
  });

  it('blocks requests with invalid token', async () => {
    const testApp = new Hono();
    const { authMiddleware } = await import('./auth.middleware.js');
    testApp.get('/protected', authMiddleware, (c) => c.json({ ok: true }));

    const res = await testApp.fetch(
      new Request('http://localhost/protected', {
        headers: { Authorization: 'Bearer this.is.invalid' },
      }),
    );
    expect(res.status).toBe(401);
  });

  it('allows requests with valid token', async () => {
    const testApp = new Hono();
    const { authMiddleware } = await import('./auth.middleware.js');
    testApp.get('/protected', authMiddleware, (c) =>
      c.json({ userId: c.get('userId'), role: c.get('userRole') }),
    );

    const { access_token } = await generateTokens('some-user-id', 'admin');
    const res = await testApp.fetch(
      new Request('http://localhost/protected', {
        headers: { Authorization: `Bearer ${access_token}` },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { userId: string; role: string };
    expect(body.userId).toBe('some-user-id');
    expect(body.role).toBe('admin');
  });
});

describe('Rate limiter', () => {
  it('allows up to maxRequests requests, blocks the next one', async () => {
    const limiter = createRateLimiter(5, 60_000);
    const testApp = new Hono();
    testApp.use('*', limiter);
    testApp.get('/ping', (c) => c.json({ ok: true }));

    const ip = '192.168.100.1';
    const makeRequest = () =>
      testApp.fetch(new Request('http://localhost/ping', { headers: { 'x-real-ip': ip } }));

    // First 5 should succeed
    for (let i = 0; i < 5; i++) {
      const res = await makeRequest();
      expect(res.status).toBe(200);
    }

    // 6th should be rate limited
    const res = await makeRequest();
    expect(res.status).toBe(429);
  });

  it('tracks different IPs separately', async () => {
    const limiter = createRateLimiter(1, 60_000);
    const testApp = new Hono();
    testApp.use('*', limiter);
    testApp.get('/ping', (c) => c.json({ ok: true }));

    const r1 = await testApp.fetch(
      new Request('http://localhost/ping', { headers: { 'x-real-ip': '192.168.200.1' } }),
    );
    expect(r1.status).toBe(200);

    // Different IP — should succeed even though first IP is exhausted
    const r2 = await testApp.fetch(
      new Request('http://localhost/ping', { headers: { 'x-real-ip': '192.168.200.2' } }),
    );
    expect(r2.status).toBe(200);

    // Same first IP again — should be blocked
    const r3 = await testApp.fetch(
      new Request('http://localhost/ping', { headers: { 'x-real-ip': '192.168.200.1' } }),
    );
    expect(r3.status).toBe(429);
  });
});
