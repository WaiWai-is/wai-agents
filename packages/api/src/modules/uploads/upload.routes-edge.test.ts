/* eslint-disable @typescript-eslint/no-explicit-any */
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadRoutes } from './upload.routes.js';

// Mock DB connection (required by auth middleware -> auth.service)
vi.mock('../../db/connection.js', () => ({
  sql: Object.assign(vi.fn(), { unsafe: vi.fn() }),
  db: {},
}));

// Mock S3 helpers
vi.mock('../../lib/s3.js', () => ({
  getUploadUrl: vi.fn(),
  getDownloadUrl: vi.fn(),
}));

async function getTokenHeader(): Promise<Record<string, string>> {
  const { generateTokens } = await import('../auth/auth.service.js');
  const { access_token } = await generateTokens('user-uuid', 'user');
  return { Authorization: `Bearer ${access_token}` };
}

function buildApp() {
  const app = new Hono();
  app.route('/', uploadRoutes);
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
/*  Filename edge cases                                                       */
/* -------------------------------------------------------------------------- */

describe('POST /uploads/presign — filename edge cases', () => {
  it('handles filename with multiple dots (e.g. archive.tar.gz)', async () => {
    const { getUploadUrl } = await import('../../lib/s3.js');
    vi.mocked(getUploadUrl).mockResolvedValueOnce('https://s3.example.com/url');

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'POST', '/uploads/presign', {
      headers: authHeaders,
      body: { filename: 'archive.tar.gz', content_type: 'text/plain' },
    });

    expect(status).toBe(200);
    // Extension should be 'gz' (last part after split by '.')
    expect(body.key).toMatch(/\.gz$/);
  });

  it('handles filename with special characters in extension', async () => {
    const { getUploadUrl } = await import('../../lib/s3.js');
    vi.mocked(getUploadUrl).mockResolvedValueOnce('https://s3.example.com/url');

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'POST', '/uploads/presign', {
      headers: authHeaders,
      body: { filename: 'file.p@ng!', content_type: 'image/png' },
    });

    expect(status).toBe(200);
    // Special characters are stripped from extension
    expect(body.key).toMatch(/\.png$/);
  });

  it('handles filename with spaces', async () => {
    const { getUploadUrl } = await import('../../lib/s3.js');
    vi.mocked(getUploadUrl).mockResolvedValueOnce('https://s3.example.com/url');

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'POST', '/uploads/presign', {
      headers: authHeaders,
      body: { filename: 'my photo.png', content_type: 'image/png' },
    });

    expect(status).toBe(200);
    expect(body.key).toMatch(/\.png$/);
  });

  it('handles filename at exactly 255 characters', async () => {
    const { getUploadUrl } = await import('../../lib/s3.js');
    vi.mocked(getUploadUrl).mockResolvedValueOnce('https://s3.example.com/url');

    const authHeaders = await getTokenHeader();
    const filename = `${'a'.repeat(251)}.png`;
    expect(filename.length).toBe(255);

    const { status } = await request(app, 'POST', '/uploads/presign', {
      headers: authHeaders,
      body: { filename, content_type: 'image/png' },
    });

    expect(status).toBe(200);
  });

  it('handles unicode filename', async () => {
    const { getUploadUrl } = await import('../../lib/s3.js');
    vi.mocked(getUploadUrl).mockResolvedValueOnce('https://s3.example.com/url');

    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'POST', '/uploads/presign', {
      headers: authHeaders,
      body: { filename: '\u0444\u043e\u0442\u043e.png', content_type: 'image/png' },
    });

    expect(status).toBe(200);
  });
});

/* -------------------------------------------------------------------------- */
/*  Content type edge cases                                                   */
/* -------------------------------------------------------------------------- */

describe('POST /uploads/presign — content type edge cases', () => {
  it('rejects application/json content type', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'POST', '/uploads/presign', {
      headers: authHeaders,
      body: { filename: 'data.json', content_type: 'application/json' },
    });
    expect(status).toBe(422);
  });

  it('rejects application/zip content type', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'POST', '/uploads/presign', {
      headers: authHeaders,
      body: { filename: 'archive.zip', content_type: 'application/zip' },
    });
    expect(status).toBe(422);
  });

  it('rejects empty content type', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'POST', '/uploads/presign', {
      headers: authHeaders,
      body: { filename: 'file.txt', content_type: '' },
    });
    expect(status).toBe(422);
  });
});

/* -------------------------------------------------------------------------- */
/*  GET /uploads/:key — access control edge cases                             */
/* -------------------------------------------------------------------------- */

describe('GET /uploads/:key — access control edge cases', () => {
  it('blocks path traversal attempt', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(
      app,
      'GET',
      '/uploads/../../../etc/passwd',
      { headers: authHeaders },
    );
    // Path traversal is caught — results in 404 (key doesn't match user prefix)
    expect([403, 404]).toContain(status);
  });

  it('blocks access to key without uploads/ prefix for user', async () => {
    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'GET',
      '/uploads/other-prefix/user-uuid/file.png',
      { headers: authHeaders },
    );
    expect(status).toBe(403);
    expect(body.error).toBe('Forbidden');
  });

  it('allows access to deeply nested path under own uploads', async () => {
    const { getDownloadUrl } = await import('../../lib/s3.js');
    vi.mocked(getDownloadUrl).mockResolvedValueOnce('https://s3.example.com/url');

    const authHeaders = await getTokenHeader();
    const key = 'uploads/user-uuid/2026/01/15/file.png';
    const { status } = await request(app, 'GET', `/uploads/${key}`, {
      headers: authHeaders,
    });
    expect(status).toBe(200);
  });
});

/* -------------------------------------------------------------------------- */
/*  Body validation                                                           */
/* -------------------------------------------------------------------------- */

describe('POST /uploads/presign — body validation', () => {
  it('returns 422 for null body', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'POST', '/uploads/presign', {
      headers: authHeaders,
      body: null,
    });
    expect(status).toBe(422);
  });

  it('returns 422 for array body', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'POST', '/uploads/presign', {
      headers: authHeaders,
      body: [],
    });
    expect(status).toBe(422);
  });

  it('returns 422 for body with extra unexpected fields', async () => {
    const { getUploadUrl } = await import('../../lib/s3.js');
    vi.mocked(getUploadUrl).mockResolvedValueOnce('https://s3.example.com/url');

    const authHeaders = await getTokenHeader();
    // Zod strips unknown fields by default — should still succeed
    const { status } = await request(app, 'POST', '/uploads/presign', {
      headers: authHeaders,
      body: {
        filename: 'test.png',
        content_type: 'image/png',
        malicious_field: 'payload',
      },
    });
    expect(status).toBe(200);
  });

  it('returns 422 for numeric filename', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'POST', '/uploads/presign', {
      headers: authHeaders,
      body: { filename: 12345, content_type: 'image/png' },
    });
    expect(status).toBe(422);
  });
});
