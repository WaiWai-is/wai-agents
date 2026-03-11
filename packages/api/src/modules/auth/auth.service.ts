import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import * as argon2 from 'argon2';
import { jwtVerify, SignJWT } from 'jose';
import { sql } from '../../db/connection.js';
import { toISO } from '../../lib/utils.js';
import type { LoginInput, RegisterInput } from './auth.schema.js';

const scryptAsync = promisify(scrypt);

export const JWT_SECRET_STRING =
  process.env.JWT_SECRET ||
  (process.env.NODE_ENV === 'production'
    ? (() => {
        throw new Error('JWT_SECRET must be set in production');
      })()
    : 'dev-secret-wai-agents-change-in-production');

const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_STRING);

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  // Handle argon2id hashes (current format from hashPassword())
  if (storedHash.startsWith('$argon2')) {
    try {
      return await argon2.verify(storedHash, password);
    } catch {
      return false;
    }
  }

  // Handle legacy scrypt hashes (salt:hash format) from older deployments
  const [salt, hash] = storedHash.split(':');
  if (!salt || !hash) return false;
  const hashBuffer = Buffer.from(hash, 'hex');
  const derivedHash = (await scryptAsync(password, salt, 64)) as Buffer;
  if (hashBuffer.length !== derivedHash.length) return false;
  return timingSafeEqual(hashBuffer, derivedHash);
}

const ACCESS_TOKEN_EXPIRY_SECONDS = 900; // 15 minutes

export async function generateTokens(
  userId: string,
  role: string,
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const now = Math.floor(Date.now() / 1000);

  const access_token = await new SignJWT({ sub: userId, role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime('15m')
    .sign(JWT_SECRET);

  const refresh_token = await new SignJWT({ sub: userId, type: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime('7d')
    .sign(JWT_SECRET);

  return { access_token, refresh_token, expires_in: ACCESS_TOKEN_EXPIRY_SECONDS };
}

export async function verifyAccessToken(token: string): Promise<{ sub: string; role: string }> {
  const { payload } = await jwtVerify(token, JWT_SECRET);
  if (!payload.sub || typeof payload.role !== 'string') {
    throw new Error('Invalid access token payload');
  }
  // Explicitly reject refresh tokens used as access tokens
  if (payload.type === 'refresh') {
    throw new Error('Refresh token cannot be used as access token');
  }
  return { sub: payload.sub, role: payload.role };
}

export async function verifyRefreshToken(token: string): Promise<{ sub: string }> {
  const { payload } = await jwtVerify(token, JWT_SECRET);
  if (!payload.sub || payload.type !== 'refresh') {
    throw new Error('Invalid refresh token');
  }
  return { sub: payload.sub };
}

function formatUser(row: Record<string, unknown>) {
  return {
    id: row.id,
    username: row.username,
    display_name: row.display_name,
    email: row.email,
    avatar_url: row.avatar_url,
    bio: row.bio,
    status: row.status,
    role: row.role,
    settings: row.settings,
    plan: row.plan,
    created_at: toISO(row.inserted_at),
    updated_at: toISO(row.updated_at),
  };
}

export async function register(input: RegisterInput): Promise<{
  user: ReturnType<typeof formatUser>;
  tokens: { access_token: string; refresh_token: string; expires_in: number };
}> {
  const { username, email, password } = input;

  // Check for existing user
  const existing = await sql`
    SELECT id FROM users WHERE email = ${email} OR username = ${username} LIMIT 1
  `;
  if (existing.length > 0) {
    throw Object.assign(new Error('Email or username already taken'), { code: 'CONFLICT' });
  }

  const passwordHash = await hashPassword(password);

  const rows = await sql`
    INSERT INTO users (username, email, password_hash, role, status, plan, settings, inserted_at, updated_at)
    VALUES (
      ${username},
      ${email},
      ${passwordHash},
      'user',
      'active',
      'free',
      '{}',
      NOW(),
      NOW()
    )
    RETURNING id, username, display_name, email, avatar_url, bio, status, role, settings, plan, inserted_at, updated_at
  `;

  const user = formatUser(rows[0] as Record<string, unknown>);
  const tokens = await generateTokens(user.id as string, user.role as string);

  return { user, tokens };
}

export async function login(input: LoginInput): Promise<{
  user: ReturnType<typeof formatUser>;
  tokens: { access_token: string; refresh_token: string; expires_in: number };
}> {
  const { email, password } = input;

  const rows = await sql`
    SELECT id, username, display_name, email, password_hash, avatar_url, bio, status, role, settings, plan, inserted_at, updated_at
    FROM users
    WHERE email = ${email}
    LIMIT 1
  `;

  if (rows.length === 0) {
    throw Object.assign(new Error('Invalid email or password'), { code: 'UNAUTHORIZED' });
  }

  const row = rows[0] as Record<string, unknown>;
  const storedHash = row.password_hash as string;

  if (!storedHash || !(await verifyPassword(password, storedHash))) {
    throw Object.assign(new Error('Invalid email or password'), { code: 'UNAUTHORIZED' });
  }

  const user = formatUser(row);
  const tokens = await generateTokens(user.id as string, user.role as string);

  return { user, tokens };
}

export async function refreshTokens(
  refreshToken: string,
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const { sub } = await verifyRefreshToken(refreshToken);

  const rows = await sql`
    SELECT id, role FROM users WHERE id = ${sub} LIMIT 1
  `;

  if (rows.length === 0) {
    throw Object.assign(new Error('User not found'), { code: 'UNAUTHORIZED' });
  }

  const row = rows[0] as Record<string, unknown>;
  return generateTokens(row.id as string, row.role as string);
}

export async function logout(_userId: string): Promise<void> {
  // Stateless JWT — no server-side invalidation needed
}

export async function createMagicLink(email: string): Promise<{ token: string }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minutes

  // Store token in magic_link_tokens table
  await sql`
    INSERT INTO magic_link_tokens (email, token, expires_at, used, inserted_at)
    VALUES (${email}, ${token}, ${expiresAt}, false, NOW())
  `;

  return { token };
}

export async function verifyMagicLink(token: string): Promise<{
  user: ReturnType<typeof formatUser>;
  tokens: { access_token: string; refresh_token: string; expires_in: number };
}> {
  const rows = await sql`
    SELECT mlt.id AS token_id, mlt.expires_at, mlt.used,
           u.id, u.username, u.display_name, u.email, u.avatar_url, u.bio, u.status, u.role, u.settings, u.plan, u.inserted_at, u.updated_at
    FROM magic_link_tokens mlt
    JOIN users u ON u.email = mlt.email
    WHERE mlt.token = ${token}
    LIMIT 1
  `;

  if (rows.length === 0) {
    throw Object.assign(new Error('Invalid or expired magic link'), { code: 'UNAUTHORIZED' });
  }

  const row = rows[0] as Record<string, unknown>;

  if (row.used) {
    throw Object.assign(new Error('Magic link already used'), { code: 'UNAUTHORIZED' });
  }

  if (new Date(row.expires_at as string) < new Date()) {
    throw Object.assign(new Error('Magic link expired'), { code: 'UNAUTHORIZED' });
  }

  // Mark token as used
  const tokenId = row.token_id as string;
  await sql`UPDATE magic_link_tokens SET used = true WHERE id = ${tokenId}`;

  const user = formatUser(row);
  const tokens = await generateTokens(user.id as string, user.role as string);

  return { user, tokens };
}

export async function getUserById(userId: string): Promise<ReturnType<typeof formatUser>> {
  const rows = await sql`
    SELECT id, username, display_name, email, avatar_url, bio, status, role, settings, plan, inserted_at, updated_at
    FROM users
    WHERE id = ${userId}
    LIMIT 1
  `;

  if (rows.length === 0) {
    throw Object.assign(new Error('User not found'), { code: 'NOT_FOUND' });
  }

  return formatUser(rows[0] as Record<string, unknown>);
}

export async function getUserByUsername(username: string): Promise<ReturnType<typeof formatUser>> {
  const rows = await sql`
    SELECT id, username, display_name, email, avatar_url, bio, status, role, settings, plan, inserted_at, updated_at
    FROM users
    WHERE username = ${username}
    LIMIT 1
  `;

  if (rows.length === 0) {
    throw Object.assign(new Error('User not found'), { code: 'NOT_FOUND' });
  }

  return formatUser(rows[0] as Record<string, unknown>);
}

export async function updateProfile(
  userId: string,
  updates: {
    display_name?: string;
    bio?: string;
    avatar_url?: string;
    settings?: Record<string, unknown>;
  },
): Promise<ReturnType<typeof formatUser>> {
  const displayName = updates.display_name !== undefined ? updates.display_name : null;
  const bio = updates.bio !== undefined ? updates.bio : null;
  const avatarUrlProvided = updates.avatar_url !== undefined;
  const avatarUrl = avatarUrlProvided ? updates.avatar_url || null : null;
  const settings = updates.settings !== undefined ? JSON.stringify(updates.settings) : null;

  // Build a partial update: only update fields that were explicitly provided
  // We use COALESCE to keep existing values when the incoming value is null (not provided)
  const rows = await sql`
    UPDATE users SET
      display_name = CASE WHEN ${displayName !== null} THEN ${displayName} ELSE display_name END,
      bio          = CASE WHEN ${bio !== null} THEN ${bio} ELSE bio END,
      avatar_url   = CASE WHEN ${avatarUrlProvided} THEN ${avatarUrl} ELSE avatar_url END,
      settings     = CASE WHEN ${settings !== null} THEN ${settings}::jsonb ELSE settings END,
      updated_at   = NOW()
    WHERE id = ${userId}
    RETURNING id, username, display_name, email, avatar_url, bio, status, role, settings, plan, inserted_at, updated_at
  `;

  if (rows.length === 0) {
    throw Object.assign(new Error('User not found'), { code: 'NOT_FOUND' });
  }

  return formatUser(rows[0] as Record<string, unknown>);
}
