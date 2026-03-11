/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as argon2 from 'argon2';
import {
  hashPassword,
  verifyPassword,
  generateTokens,
  verifyAccessToken,
  verifyRefreshToken,
} from './auth.service.js';

// Mock DB connection to avoid needing a real database in unit tests
vi.mock('../../db/connection.js', () => ({
  sql: Object.assign(vi.fn(), { unsafe: vi.fn() }),
  db: {},
}));

describe('hashPassword / verifyPassword', () => {
  it('hashes a password and verifies it correctly', async () => {
    const password = 'supersecret123';
    const hash = await hashPassword(password);

    expect(hash).toMatch(/^\$argon2/);
    expect(hash).not.toBe(password);

    const valid = await verifyPassword(password, hash);
    expect(valid).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('correcthorsebatterystaple');
    const valid = await verifyPassword('wrongpassword', hash);
    expect(valid).toBe(false);
  });

  it('produces different hashes for the same password (salted)', async () => {
    const h1 = await hashPassword('mypassword');
    const h2 = await hashPassword('mypassword');
    expect(h1).not.toBe(h2);
  });

  it('returns false for malformed hash string', async () => {
    const valid = await verifyPassword('password', 'badstoredvalue');
    expect(valid).toBe(false);
  });
});

describe('verifyPassword with argon2id hashes (Elixir backend compat)', () => {
  it('verifies a correct password against an argon2id hash', async () => {
    const password = 'TestPass123!';
    const argon2Hash = await argon2.hash(password, { type: argon2.argon2id });

    const valid = await verifyPassword(password, argon2Hash);
    expect(valid).toBe(true);
  });

  it('rejects a wrong password against an argon2id hash', async () => {
    const argon2Hash = await argon2.hash('TestPass123!', { type: argon2.argon2id });

    const valid = await verifyPassword('wrongpassword', argon2Hash);
    expect(valid).toBe(false);
  });
});

describe('generateTokens / verifyAccessToken / verifyRefreshToken', () => {
  const userId = '550e8400-e29b-41d4-a716-446655440000';
  const role = 'user';

  it('generates access and refresh tokens', async () => {
    const { access_token, refresh_token } = await generateTokens(userId, role);
    expect(typeof access_token).toBe('string');
    expect(typeof refresh_token).toBe('string');
    expect(access_token.split('.').length).toBe(3); // JWT format
    expect(refresh_token.split('.').length).toBe(3);
  });

  it('verifyAccessToken returns correct sub and role', async () => {
    const { access_token } = await generateTokens(userId, role);
    const payload = await verifyAccessToken(access_token);
    expect(payload.sub).toBe(userId);
    expect(payload.role).toBe(role);
  });

  it('verifyRefreshToken returns correct sub', async () => {
    const { refresh_token } = await generateTokens(userId, role);
    const payload = await verifyRefreshToken(refresh_token);
    expect(payload.sub).toBe(userId);
  });

  it('verifyAccessToken rejects a refresh token', async () => {
    const { refresh_token } = await generateTokens(userId, role);
    // Refresh token has no "role" claim — should throw
    await expect(verifyAccessToken(refresh_token)).rejects.toThrow();
  });

  it('verifyRefreshToken rejects an access token', async () => {
    const { access_token } = await generateTokens(userId, role);
    await expect(verifyRefreshToken(access_token)).rejects.toThrow();
  });

  it('verifyAccessToken rejects a tampered token', async () => {
    const { access_token } = await generateTokens(userId, role);
    const tampered = access_token.slice(0, -4) + 'XXXX';
    await expect(verifyAccessToken(tampered)).rejects.toThrow();
  });
});

describe('register (mocked DB)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls sql with correct insert and returns user + tokens', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // First call: check existing (empty = no conflict)
    sqlMock.mockResolvedValueOnce([] as any);
    // Second call: insert returning user
    sqlMock.mockResolvedValueOnce([
      {
        id: 'test-uuid',
        username: 'testuser',
        display_name: null,
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

    const { register } = await import('./auth.service.js');
    const result = await register({
      username: 'testuser',
      email: 'test@example.com',
      password: 'password123',
    });

    expect(result.user.username).toBe('testuser');
    expect(result.user.email).toBe('test@example.com');
    expect(result.tokens.access_token).toBeDefined();
    expect(result.tokens.refresh_token).toBeDefined();
  });

  it('throws CONFLICT when email/username exists', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // Existing user found
    sqlMock.mockResolvedValueOnce([{ id: 'existing-id' }] as any);

    const { register } = await import('./auth.service.js');
    await expect(
      register({ username: 'taken', email: 'taken@example.com', password: 'password123' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('login (mocked DB)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns user + tokens with correct credentials', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    const passwordHash = await hashPassword('correctpassword');

    sqlMock.mockResolvedValueOnce([
      {
        id: 'test-uuid',
        username: 'testuser',
        display_name: null,
        email: 'test@example.com',
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

    const { login } = await import('./auth.service.js');
    const result = await login({ email: 'test@example.com', password: 'correctpassword' });

    expect(result.user.email).toBe('test@example.com');
    expect(result.tokens.access_token).toBeDefined();
  });

  it('throws UNAUTHORIZED for wrong password', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    const passwordHash = await hashPassword('correctpassword');

    sqlMock.mockResolvedValueOnce([
      {
        id: 'test-uuid',
        username: 'testuser',
        display_name: null,
        email: 'test@example.com',
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

    const { login } = await import('./auth.service.js');
    await expect(
      login({ email: 'test@example.com', password: 'wrongpassword' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('throws UNAUTHORIZED for unknown email', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([] as any);

    const { login } = await import('./auth.service.js');
    await expect(
      login({ email: 'nobody@example.com', password: 'password123' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
