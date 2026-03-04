import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../auth/auth.middleware.js';
import { getUploadUrl, getDownloadUrl } from '../../lib/s3.js';
import { randomUUID } from 'node:crypto';

export const uploadRoutes = new Hono();

const ALLOWED_CONTENT_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'video/mp4', 'video/webm',
  'audio/mpeg', 'audio/wav', 'audio/ogg',
  'application/pdf',
  'text/plain', 'text/csv',
] as const;

const PresignSchema = z.object({
  filename: z.string().min(1).max(255),
  content_type: z.enum(ALLOWED_CONTENT_TYPES),
});

uploadRoutes.post('/uploads/presign', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json().catch(() => null);
  const parsed = PresignSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation error', details: parsed.error.flatten() }, 422);
  }

  const ext = parsed.data.filename.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '') || '';
  const key = `uploads/${userId}/${randomUUID()}${ext ? '.' + ext : ''}`;

  try {
    const url = await getUploadUrl(key, parsed.data.content_type, 300);
    return c.json({ url, key }, 200);
  } catch {
    return c.json({ error: 'Failed to generate upload URL' }, 500);
  }
});

uploadRoutes.get('/uploads/:key{.+}', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const key = c.req.param('key');

  // Enforce users can only access their own uploads
  if (!key.startsWith(`uploads/${userId}/`)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  try {
    const url = await getDownloadUrl(key);
    return c.json({ url }, 200);
  } catch {
    return c.json({ error: 'Failed to generate download URL' }, 500);
  }
});
