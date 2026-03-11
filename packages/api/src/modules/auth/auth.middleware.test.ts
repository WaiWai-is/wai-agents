/* eslint-disable @typescript-eslint/no-explicit-any */
import { Hono } from 'hono';
import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock DB connection
vi.mock('../../db/connection.js', () => ({
  sql: Object.assign(vi.fn(), { unsafe: vi.fn() }),
  db: {},
}));

import { authMiddleware } from './auth.middleware.js';
import { generateTokens } from './auth.service.js';

function buildApp() {
  const app = new Hono();
  app.use('/protected/*', authMiddleware);
  app.get('/protected/resource', (c) => {
    const userId = c.get('userId');
    const userRole = c.get('userRole');
    return c.json({ userId, userRole });
  });
  return app;
}

async function fetchApp(
  app: ReturnType<typeof buildApp>,
  path: string,
  headers: Record<string, string> = {},
) {
  const req = new Request(`http://localhost${path}`, { headers });
  const res = await app.fetch(req);
  const json = (await res.json().catch(() => null)) as any;
  return { status: res.status, body: json };
}

let app: ReturnType<typeof buildApp>;

beforeEach(() => {
  vi.clearAllMocks();
  app = buildApp();
});

describe('authMiddleware', () => {
  it('returns 401 when no Authorization header is present', async () => {
    const { status, body } = await fetchApp(app, '/protected/resource');
    expect(status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(body.message).toContain('Missing or invalid Authorization header');
  });

  it('returns 401 when Authorization header has no Bearer prefix', async () => {
    const { status, body } = await fetchApp(app, '/protected/resource', {
      Authorization: 'Token some-token',
    });
    expect(status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 401 when Authorization header is just "Bearer" with no token', async () => {
    const { status, body } = await fetchApp(app, '/protected/resource', {
      Authorization: 'Bearer',
    });
    expect(status).toBe(401);
    // "Bearer" without space+token fails the startsWith("Bearer ") check
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 401 when Authorization header has "Bearer " with empty token', async () => {
    // Note: the Request API normalizes "Bearer " (trailing space) to "Bearer",
    // which fails the startsWith("Bearer ") check in the middleware.
    const { status, body } = await fetchApp(app, '/protected/resource', {
      Authorization: 'Bearer ',
    });
    expect(status).toBe(401);
    expect(body.message).toContain('Missing or invalid Authorization header');
  });

  it('returns 401 for an invalid JWT token', async () => {
    const { status, body } = await fetchApp(app, '/protected/resource', {
      Authorization: 'Bearer invalid.jwt.token',
    });
    expect(status).toBe(401);
    expect(body.message).toContain('Invalid or expired token');
  });

  it('returns 401 for a malformed JWT (not three parts)', async () => {
    const { status } = await fetchApp(app, '/protected/resource', {
      Authorization: 'Bearer not-even-close',
    });
    expect(status).toBe(401);
  });

  it('allows access with a valid token and sets userId and userRole', async () => {
    const userId = '550e8400-e29b-41d4-a716-446655440000';
    const { access_token } = await generateTokens(userId, 'user');

    const { status, body } = await fetchApp(app, '/protected/resource', {
      Authorization: `Bearer ${access_token}`,
    });

    expect(status).toBe(200);
    expect(body.userId).toBe(userId);
    expect(body.userRole).toBe('user');
  });

  it('correctly extracts admin role from token', async () => {
    const userId = '550e8400-e29b-41d4-a716-446655440001';
    const { access_token } = await generateTokens(userId, 'admin');

    const { status, body } = await fetchApp(app, '/protected/resource', {
      Authorization: `Bearer ${access_token}`,
    });

    expect(status).toBe(200);
    expect(body.userRole).toBe('admin');
  });

  it('returns 401 for a refresh token used as access token', async () => {
    const userId = '550e8400-e29b-41d4-a716-446655440002';
    const { refresh_token } = await generateTokens(userId, 'user');

    const { status, body } = await fetchApp(app, '/protected/resource', {
      Authorization: `Bearer ${refresh_token}`,
    });

    // Refresh tokens have type='refresh' but no 'role' claim,
    // so verifyAccessToken should reject them
    expect(status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 401 for case-sensitive "bearer" (lowercase)', async () => {
    const userId = '550e8400-e29b-41d4-a716-446655440003';
    const { access_token } = await generateTokens(userId, 'user');

    const { status } = await fetchApp(app, '/protected/resource', {
      Authorization: `bearer ${access_token}`,
    });

    // "bearer" does not start with "Bearer " (capital B)
    expect(status).toBe(401);
  });
});
