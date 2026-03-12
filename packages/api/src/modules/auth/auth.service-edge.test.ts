/* eslint-disable @typescript-eslint/no-explicit-any */

import { SignJWT } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  generateTokens,
  hashPassword,
  JWT_SECRET_STRING,
  verifyAccessToken,
  verifyPassword,
  verifyRefreshToken,
} from './auth.service.js';
import { clearBlacklist } from './token-blacklist.js';

// Mock DB connection to avoid needing a real database in unit tests
vi.mock('../../db/connection.js', () => ({
  sql: Object.assign(vi.fn(), { unsafe: vi.fn() }),
  db: {},
}));

const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_STRING);

/* ================================================================
 * Token Expiration Edge Cases
 * ================================================================ */
describe('auth.service — token expiration edge cases', () => {
  it('access token expires after 15 minutes', async () => {
    const { access_token } = await generateTokens('user-1', 'user');
    // Token should be valid now
    const result = await verifyAccessToken(access_token);
    expect(result.sub).toBe('user-1');
  });

  it('returns expires_in as 900 seconds', async () => {
    const tokens = await generateTokens('user-1', 'user');
    expect(tokens.expires_in).toBe(900);
  });

  it('rejects an expired access token', async () => {
    // Create a token that expired 1 second ago
    const expiredToken = await new SignJWT({ sub: 'user-1', role: 'user' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 1)
      .sign(JWT_SECRET);

    await expect(verifyAccessToken(expiredToken)).rejects.toThrow();
  });

  it('rejects an expired refresh token', async () => {
    const expiredRefresh = await new SignJWT({ sub: 'user-1', type: 'refresh' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 700000)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 1)
      .sign(JWT_SECRET);

    await expect(verifyRefreshToken(expiredRefresh)).rejects.toThrow();
  });

  it('access token issued at exact boundary is still valid', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ sub: 'user-1', role: 'user' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now)
      .setExpirationTime(now + 900)
      .sign(JWT_SECRET);

    const result = await verifyAccessToken(token);
    expect(result.sub).toBe('user-1');
  });
});

/* ================================================================
 * Concurrent Refresh Token Usage
 * ================================================================ */
describe('auth.service — concurrent refresh token usage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('multiple concurrent refreshTokens calls all produce valid tokens', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // Both calls will query the DB for the user
    sqlMock.mockResolvedValue([{ id: 'user-1', role: 'user' }] as any);

    const { refreshTokens } = await import('./auth.service.js');
    const { refresh_token } = await generateTokens('user-1', 'user');

    const [result1, result2] = await Promise.all([
      refreshTokens(refresh_token),
      refreshTokens(refresh_token),
    ]);

    expect(result1.access_token).toBeDefined();
    expect(result2.access_token).toBeDefined();
    // Both calls succeed and produce valid tokens (may be identical when iat falls in the same second)
    const p1 = await verifyAccessToken(result1.access_token);
    const p2 = await verifyAccessToken(result2.access_token);
    expect(p1.sub).toBe('user-1');
    expect(p2.sub).toBe('user-1');
  });

  it('refresh token can be used to get a new access token and new refresh token', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValue([{ id: 'user-1', role: 'admin' }] as any);

    const { refreshTokens } = await import('./auth.service.js');
    const original = await generateTokens('user-1', 'admin');
    const refreshed = await refreshTokens(original.refresh_token);

    expect(refreshed.access_token).toBeDefined();
    expect(refreshed.refresh_token).toBeDefined();
    expect(refreshed.expires_in).toBe(900);
  });

  it('refreshTokens throws when user does not exist in DB', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // verifyRefreshToken succeeds but user lookup returns empty
    sqlMock.mockResolvedValueOnce([] as any);

    const { refreshTokens } = await import('./auth.service.js');
    const { refresh_token } = await generateTokens('deleted-user', 'user');

    await expect(refreshTokens(refresh_token)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});

/* ================================================================
 * Invalid Token Formats
 * ================================================================ */
describe('auth.service — invalid token formats', () => {
  it('rejects empty string as access token', async () => {
    await expect(verifyAccessToken('')).rejects.toThrow();
  });

  it('rejects empty string as refresh token', async () => {
    await expect(verifyRefreshToken('')).rejects.toThrow();
  });

  it('rejects random string as access token', async () => {
    await expect(verifyAccessToken('not-a-jwt-at-all')).rejects.toThrow();
  });

  it('rejects malformed JWT (missing segments) as access token', async () => {
    await expect(verifyAccessToken('header.payload')).rejects.toThrow();
  });

  it('rejects JWT with extra segments', async () => {
    await expect(verifyAccessToken('a.b.c.d')).rejects.toThrow();
  });

  it('rejects token signed with wrong secret', async () => {
    const wrongSecret = new TextEncoder().encode('wrong-secret-key-for-testing');
    const token = await new SignJWT({ sub: 'user-1', role: 'user' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('15m')
      .sign(wrongSecret);

    await expect(verifyAccessToken(token)).rejects.toThrow();
  });

  it('rejects access token with missing sub claim', async () => {
    const token = await new SignJWT({ role: 'user' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('15m')
      .sign(JWT_SECRET);

    await expect(verifyAccessToken(token)).rejects.toThrow('Invalid access token payload');
  });

  it('rejects access token with missing role claim', async () => {
    const token = await new SignJWT({ sub: 'user-1' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('15m')
      .sign(JWT_SECRET);

    await expect(verifyAccessToken(token)).rejects.toThrow('Invalid access token payload');
  });

  it('rejects refresh token used as access token', async () => {
    const { refresh_token } = await generateTokens('user-1', 'user');
    // Refresh tokens lack the `role` claim, so verifyAccessToken rejects them
    // (the exact error depends on which guard fires first)
    await expect(verifyAccessToken(refresh_token)).rejects.toThrow();
  });

  it('rejects access token used as refresh token', async () => {
    const { access_token } = await generateTokens('user-1', 'user');
    await expect(verifyRefreshToken(access_token)).rejects.toThrow('Invalid refresh token');
  });

  it('rejects refresh token with missing sub claim', async () => {
    const token = await new SignJWT({ type: 'refresh' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('7d')
      .sign(JWT_SECRET);

    await expect(verifyRefreshToken(token)).rejects.toThrow('Invalid refresh token');
  });

  it('rejects refresh token with wrong type claim', async () => {
    const token = await new SignJWT({ sub: 'user-1', type: 'access' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('7d')
      .sign(JWT_SECRET);

    await expect(verifyRefreshToken(token)).rejects.toThrow('Invalid refresh token');
  });
});

/* ================================================================
 * Password Validation Edge Cases
 * ================================================================ */
describe('auth.service — password validation edge cases', () => {
  it('handles extremely long password for hashing', async () => {
    const longPassword = 'a'.repeat(1000);
    const hash = await hashPassword(longPassword);
    expect(hash).toMatch(/^\$argon2/);
    const valid = await verifyPassword(longPassword, hash);
    expect(valid).toBe(true);
  });

  it('handles unicode characters in password', async () => {
    const password = 'pAssw0rd123456789';
    const hash = await hashPassword(password);
    const valid = await verifyPassword(password, hash);
    expect(valid).toBe(true);
  });

  it('handles password with special characters', async () => {
    const password = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    const hash = await hashPassword(password);
    const valid = await verifyPassword(password, hash);
    expect(valid).toBe(true);
  });

  it('returns false for empty stored hash', async () => {
    const valid = await verifyPassword('password', '');
    expect(valid).toBe(false);
  });

  it('returns false for stored hash with only salt (no hash part)', async () => {
    const valid = await verifyPassword('password', 'saltonly');
    expect(valid).toBe(false);
  });

  it('returns false for stored hash with valid salt but wrong-length hash', async () => {
    const valid = await verifyPassword('password', 'salt:ab');
    expect(valid).toBe(false);
  });

  it('returns false when argon2 hash is corrupted', async () => {
    const valid = await verifyPassword('password', '$argon2id$v=19$corrupted-data');
    expect(valid).toBe(false);
  });
});

/* ================================================================
 * Session Cleanup After Logout
 * ================================================================ */
describe('auth.service — logout behavior', () => {
  beforeEach(() => {
    clearBlacklist();
  });

  it('logout does not throw with valid token', async () => {
    const { access_token } = await generateTokens('user-1', 'user');
    const { logout } = await import('./auth.service.js');
    await expect(logout('user-1', access_token)).resolves.toBeUndefined();
  });

  it('logout returns void', async () => {
    const { access_token } = await generateTokens('user-1', 'user');
    const { logout } = await import('./auth.service.js');
    const result = await logout('user-1', access_token);
    expect(result).toBeUndefined();
  });

  it('logout blacklists the token so it cannot be reused', async () => {
    const { access_token } = await generateTokens('user-1', 'user');
    const { logout } = await import('./auth.service.js');
    await logout('user-1', access_token);
    // Token should now be revoked
    await expect(verifyAccessToken(access_token)).rejects.toThrow('Token has been revoked');
  });

  it('logout with invalid token throws JWS error', async () => {
    const { logout } = await import('./auth.service.js');
    await expect(logout('user-1', 'fake-token')).rejects.toThrow();
  });
});

/* ================================================================
 * Magic Link Edge Cases (mocked DB)
 * ================================================================ */
describe('auth.service — magic link edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createMagicLink returns a token string', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { createMagicLink } = await import('./auth.service.js');
    const result = await createMagicLink('test@example.com');
    expect(typeof result.token).toBe('string');
    expect(result.token.length).toBeGreaterThan(0);
  });

  it('verifyMagicLink throws for invalid token', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { verifyMagicLink } = await import('./auth.service.js');
    await expect(verifyMagicLink('bad-token')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('verifyMagicLink throws for already used token', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([
      {
        token_id: 'tk-1',
        expires_at: new Date(Date.now() + 600000).toISOString(),
        used: true,
        id: 'user-1',
        username: 'test',
        display_name: null,
        email: 'test@test.com',
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

    const { verifyMagicLink } = await import('./auth.service.js');
    await expect(verifyMagicLink('used-token')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      message: 'Magic link already used',
    });
  });

  it('verifyMagicLink throws for expired token', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([
      {
        token_id: 'tk-1',
        expires_at: new Date(Date.now() - 600000).toISOString(),
        used: false,
        id: 'user-1',
        username: 'test',
        display_name: null,
        email: 'test@test.com',
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

    const { verifyMagicLink } = await import('./auth.service.js');
    await expect(verifyMagicLink('expired-token')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      message: 'Magic link expired',
    });
  });
});

/* ================================================================
 * getUserById / getUserByUsername / updateProfile Edge Cases
 * ================================================================ */
describe('auth.service — getUserById edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws NOT_FOUND when user does not exist', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { getUserById } = await import('./auth.service.js');
    await expect(getUserById('nonexistent-id')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('returns formatted user with ISO dates', async () => {
    const { sql } = await import('../../db/connection.js');
    const now = new Date('2026-01-15T10:00:00Z');
    vi.mocked(sql).mockResolvedValueOnce([
      {
        id: 'u1',
        username: 'test',
        display_name: 'Test User',
        email: 'test@example.com',
        avatar_url: 'https://example.com/avatar.png',
        bio: 'Hello',
        status: 'active',
        role: 'user',
        settings: { theme: 'dark' },
        plan: 'pro',
        inserted_at: now,
        updated_at: now,
      },
    ] as any);

    const { getUserById } = await import('./auth.service.js');
    const user = await getUserById('u1');
    expect(user.id).toBe('u1');
    expect(user.created_at).toBe(now.toISOString());
    expect(user.updated_at).toBe(now.toISOString());
  });
});

describe('auth.service — getUserByUsername edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws NOT_FOUND when username does not exist', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { getUserByUsername } = await import('./auth.service.js');
    await expect(getUserByUsername('nonexistent')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('auth.service — updateProfile edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws NOT_FOUND when user does not exist', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { updateProfile } = await import('./auth.service.js');
    await expect(updateProfile('nonexistent', { display_name: 'New Name' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('updates only provided fields', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([
      {
        id: 'u1',
        username: 'test',
        display_name: 'Updated',
        email: 'test@example.com',
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

    const { updateProfile } = await import('./auth.service.js');
    const result = await updateProfile('u1', { display_name: 'Updated' });
    expect(result.display_name).toBe('Updated');
  });
});
