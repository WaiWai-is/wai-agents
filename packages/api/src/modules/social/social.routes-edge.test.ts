/* eslint-disable @typescript-eslint/no-explicit-any */
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateTokens } from '../auth/auth.service.js';
import { socialRoutes } from './social.routes.js';

// Mock DB connection
vi.mock('../../db/connection.js', () => {
  const sqlFn = Object.assign(vi.fn(), {
    unsafe: vi.fn(),
    begin: vi.fn(async (cb: (tx: any) => Promise<any>) => {
      return cb(sqlFn);
    }),
  });
  return { sql: sqlFn, db: {} };
});

const USER_ID = '550e8400-e29b-41d4-a716-446655440000';

function buildApp() {
  const app = new Hono();
  app.route('/', socialRoutes);
  return app;
}

async function request(
  app: ReturnType<typeof buildApp>,
  method: string,
  path: string,
  opts: { body?: unknown; headers?: Record<string, string> } = {},
) {
  const { access_token } = await generateTokens(USER_ID, 'user');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${access_token}`,
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
  app = buildApp();
});

/* -------------------------------------------------------------------------- */
/*  Invalid UUID format tests                                                  */
/* -------------------------------------------------------------------------- */

describe('Invalid UUID format returns 400', () => {
  it('POST /feed/:id/like with invalid UUID returns 400', async () => {
    const { status, body } = await request(app, 'POST', '/feed/not-a-uuid/like');
    expect(status).toBe(400);
    expect(body.error).toBe('Invalid ID format');
  });

  it('DELETE /feed/:id/like with invalid UUID returns 400', async () => {
    const { status, body } = await request(app, 'DELETE', '/feed/not-a-uuid/like');
    expect(status).toBe(400);
    expect(body.error).toBe('Invalid ID format');
  });

  it('POST /feed/:id/fork with invalid UUID returns 400', async () => {
    const { status, body } = await request(app, 'POST', '/feed/not-a-uuid/fork');
    expect(status).toBe(400);
    expect(body.error).toBe('Invalid ID format');
  });

  it('POST /marketplace/agents/:id/rate with invalid UUID returns 400', async () => {
    const { status, body } = await request(app, 'POST', '/marketplace/agents/not-a-uuid/rate', {
      body: { rating: 4 },
    });
    expect(status).toBe(400);
    expect(body.error).toBe('Invalid ID format');
  });

  it('POST /users/:id/follow with invalid UUID returns 400', async () => {
    const { status, body } = await request(app, 'POST', '/users/not-a-uuid/follow');
    expect(status).toBe(400);
    expect(body.error).toBe('Invalid ID format');
  });

  it('DELETE /users/:id/follow with invalid UUID returns 400', async () => {
    const { status, body } = await request(app, 'DELETE', '/users/not-a-uuid/follow');
    expect(status).toBe(400);
    expect(body.error).toBe('Invalid ID format');
  });
});

/* -------------------------------------------------------------------------- */
/*  Auth required on all routes                                                */
/* -------------------------------------------------------------------------- */

describe('All routes require authentication', () => {
  async function unauthRequest(method: string, path: string) {
    const req = new Request(`http://localhost${path}`, { method });
    const res = await app.fetch(req);
    return { status: res.status };
  }

  it('GET /feed returns 401 without auth', async () => {
    const { status } = await unauthRequest('GET', '/feed');
    expect(status).toBe(401);
  });

  it('GET /feed/trending returns 401 without auth', async () => {
    const { status } = await unauthRequest('GET', '/feed/trending');
    expect(status).toBe(401);
  });

  it('GET /feed/following returns 401 without auth', async () => {
    const { status } = await unauthRequest('GET', '/feed/following');
    expect(status).toBe(401);
  });

  it('GET /feed/new returns 401 without auth', async () => {
    const { status } = await unauthRequest('GET', '/feed/new');
    expect(status).toBe(401);
  });

  it('GET /marketplace returns 401 without auth', async () => {
    const { status } = await unauthRequest('GET', '/marketplace');
    expect(status).toBe(401);
  });

  it('GET /marketplace/search returns 401 without auth', async () => {
    const { status } = await unauthRequest('GET', '/marketplace/search?q=test');
    expect(status).toBe(401);
  });

  it('GET /marketplace/categories returns 401 without auth', async () => {
    const { status } = await unauthRequest('GET', '/marketplace/categories');
    expect(status).toBe(401);
  });

  it('GET /marketplace/agents/:slug returns 401 without auth', async () => {
    const { status } = await unauthRequest('GET', '/marketplace/agents/test');
    expect(status).toBe(401);
  });
});

/* -------------------------------------------------------------------------- */
/*  Query params                                                               */
/* -------------------------------------------------------------------------- */

describe('Feed query params', () => {
  it('GET /feed passes cursor query param', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // Cursor lookup
    sqlMock.mockResolvedValueOnce([{ inserted_at: new Date('2026-01-15') }] as any);
    // Feed query
    sqlMock.mockResolvedValueOnce([] as any);

    const { status, body } = await request(app, 'GET', '/feed?cursor=some-id&limit=5');
    expect(status).toBe(200);
    expect(body.items).toEqual([]);
  });

  it('GET /feed/trending passes limit query param', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { status, body } = await request(app, 'GET', '/feed/trending?limit=10');
    expect(status).toBe(200);
    expect(body.items).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/*  Rating validation edge cases                                               */
/* -------------------------------------------------------------------------- */

describe('Rating validation edge cases', () => {
  it('returns 422 for missing body on rate', async () => {
    const agentId = '880e8400-e29b-41d4-a716-446655440003';
    const res = await app.fetch(
      new Request(`http://localhost/marketplace/agents/${agentId}/rate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${(await generateTokens(USER_ID, 'user')).access_token}`,
        },
        // No body at all
      }),
    );
    expect(res.status).toBe(422);
  });

  it('returns 422 for rating = 0', async () => {
    const agentId = '880e8400-e29b-41d4-a716-446655440003';
    const { status } = await request(app, 'POST', `/marketplace/agents/${agentId}/rate`, {
      body: { rating: 0 },
    });
    expect(status).toBe(422);
  });

  it('returns 422 for negative rating', async () => {
    const agentId = '880e8400-e29b-41d4-a716-446655440003';
    const { status } = await request(app, 'POST', `/marketplace/agents/${agentId}/rate`, {
      body: { rating: -1 },
    });
    expect(status).toBe(422);
  });

  it('returns 422 for string rating', async () => {
    const agentId = '880e8400-e29b-41d4-a716-446655440003';
    const { status } = await request(app, 'POST', `/marketplace/agents/${agentId}/rate`, {
      body: { rating: 'five' },
    });
    expect(status).toBe(422);
  });
});
