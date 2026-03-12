import { Hono } from 'hono';
import { authMiddleware } from './auth.middleware.js';
import {
  LoginSchema,
  MagicLinkSchema,
  MagicLinkVerifySchema,
  RefreshSchema,
  RegisterSchema,
} from './auth.schema.js';
import {
  createMagicLink,
  login,
  logout,
  refreshTokens,
  register,
  verifyMagicLink,
} from './auth.service.js';
import { createRateLimiter } from './rate-limiter.js';

export const authRoutes = new Hono();

const rateLimiter = createRateLimiter(5, 60_000);

// Apply rate limiter to all auth routes
authRoutes.use('*', rateLimiter);

authRoutes.post('/register', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation error', details: parsed.error.flatten() }, 422);
  }
  try {
    const result = await register(parsed.data);
    return c.json(result, 201);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'CONFLICT') {
      return c.json({ error: 'Conflict', message: e.message }, 409);
    }
    throw err;
  }
});

authRoutes.post('/login', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation error', details: parsed.error.flatten() }, 422);
  }
  try {
    const result = await login(parsed.data);
    return c.json(result, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'UNAUTHORIZED') {
      return c.json({ error: 'Unauthorized', message: e.message }, 401);
    }
    throw err;
  }
});

authRoutes.post('/refresh', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = RefreshSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation error', details: parsed.error.flatten() }, 422);
  }
  try {
    const tokens = await refreshTokens(parsed.data.refresh_token);
    return c.json({ tokens }, 200);
  } catch {
    return c.json({ error: 'Unauthorized', message: 'Invalid or expired refresh token' }, 401);
  }
});

authRoutes.delete('/logout', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const authHeader = c.req.header('Authorization');
  if (!authHeader) {
    return c.json({ error: 'Unauthorized', message: 'Missing Authorization header' }, 401);
  }
  const token = authHeader.slice(7);
  await logout(userId, token);
  return c.json({ message: 'Logged out successfully' }, 200);
});

authRoutes.post('/magic-link', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = MagicLinkSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation error', details: parsed.error.flatten() }, 422);
  }
  await createMagicLink(parsed.data.email);
  // Always return success to avoid email enumeration
  return c.json(
    { message: 'If an account exists for that email, a magic link has been sent.' },
    200,
  );
});

authRoutes.post('/magic-link/verify', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = MagicLinkVerifySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation error', details: parsed.error.flatten() }, 422);
  }
  try {
    const result = await verifyMagicLink(parsed.data.token);
    return c.json(result, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'UNAUTHORIZED') {
      return c.json({ error: 'Unauthorized', message: e.message }, 401);
    }
    throw err;
  }
});
