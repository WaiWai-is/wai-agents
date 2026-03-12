import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRateLimiter } from './rate-limiter.js';

function buildApp(maxRequests: number, windowMs: number) {
  const app = new Hono();
  const limiter = createRateLimiter(maxRequests, windowMs);
  app.use('*', limiter);
  app.get('/ping', (c) => c.json({ ok: true }));
  app.post('/ping', (c) => c.json({ ok: true }));
  return app;
}

function makeRequest(app: Hono, ip: string, opts: { method?: string; path?: string } = {}) {
  const method = opts.method || 'GET';
  const path = opts.path || '/ping';
  return app.fetch(
    new Request(`http://localhost${path}`, {
      method,
      headers: { 'x-real-ip': ip },
    }),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/* -------------------------------------------------------------------------- */
/*  Basic rate limiting                                                       */
/* -------------------------------------------------------------------------- */

describe('Rate Limiter — basic behavior', () => {
  it('allows requests within the limit', async () => {
    const app = buildApp(3, 60_000);

    for (let i = 0; i < 3; i++) {
      const res = await makeRequest(app, '10.0.0.1');
      expect(res.status).toBe(200);
    }
  });

  it('blocks requests exceeding the limit with 429', async () => {
    const app = buildApp(2, 60_000);

    // Exhaust the limit
    for (let i = 0; i < 2; i++) {
      const res = await makeRequest(app, '10.0.0.2');
      expect(res.status).toBe(200);
    }

    // Third request should be blocked
    const res = await makeRequest(app, '10.0.0.2');
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: string; retry_after: number };
    expect(body.error).toBe('Too many requests');
    expect(body.retry_after).toBeGreaterThan(0);
  });

  it('returns retry_after in seconds', async () => {
    const app = buildApp(1, 30_000);

    await makeRequest(app, '10.0.0.3'); // use up the limit
    const res = await makeRequest(app, '10.0.0.3');
    expect(res.status).toBe(429);

    const body = (await res.json()) as { retry_after: number };
    // Should be roughly 30 seconds (ceiling of remaining ms / 1000)
    expect(body.retry_after).toBeLessThanOrEqual(30);
    expect(body.retry_after).toBeGreaterThan(0);
  });

  it('allows exactly maxRequests before blocking', async () => {
    const limit = 5;
    const app = buildApp(limit, 60_000);

    const results: number[] = [];
    for (let i = 0; i < limit + 2; i++) {
      const res = await makeRequest(app, '10.0.0.4');
      results.push(res.status);
    }

    // First 5 should be 200, rest should be 429
    expect(results.slice(0, limit).every((s) => s === 200)).toBe(true);
    expect(results.slice(limit).every((s) => s === 429)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/*  Per-IP isolation                                                          */
/* -------------------------------------------------------------------------- */

describe('Rate Limiter — per-IP isolation', () => {
  it('tracks different IPs independently', async () => {
    const app = buildApp(1, 60_000);

    // IP A uses its one request
    const r1 = await makeRequest(app, '192.168.1.1');
    expect(r1.status).toBe(200);

    // IP B should still be allowed
    const r2 = await makeRequest(app, '192.168.1.2');
    expect(r2.status).toBe(200);

    // IP A is now blocked
    const r3 = await makeRequest(app, '192.168.1.1');
    expect(r3.status).toBe(429);

    // IP B is now blocked
    const r4 = await makeRequest(app, '192.168.1.2');
    expect(r4.status).toBe(429);

    // IP C is still fine
    const r5 = await makeRequest(app, '192.168.1.3');
    expect(r5.status).toBe(200);
  });

  it('uses x-forwarded-for header rightmost IP for identification', async () => {
    const app = buildApp(1, 60_000);

    const res1 = await app.fetch(
      new Request('http://localhost/ping', {
        headers: { 'x-forwarded-for': '203.0.113.1, 10.0.0.1' },
      }),
    );
    expect(res1.status).toBe(200);

    // Same rightmost IP in x-forwarded-for — should be blocked
    const res2 = await app.fetch(
      new Request('http://localhost/ping', {
        headers: { 'x-forwarded-for': '203.0.113.2, 10.0.0.1' },
      }),
    );
    expect(res2.status).toBe(429);

    // Different rightmost IP — should be allowed (different bucket)
    const res3 = await app.fetch(
      new Request('http://localhost/ping', {
        headers: { 'x-forwarded-for': '203.0.113.1, 10.0.0.2' },
      }),
    );
    expect(res3.status).toBe(200);
  });

  it('falls back to x-real-ip when x-forwarded-for is absent', async () => {
    const app = buildApp(1, 60_000);

    const res1 = await app.fetch(
      new Request('http://localhost/ping', {
        headers: { 'x-real-ip': '172.16.0.1' },
      }),
    );
    expect(res1.status).toBe(200);

    const res2 = await app.fetch(
      new Request('http://localhost/ping', {
        headers: { 'x-real-ip': '172.16.0.1' },
      }),
    );
    expect(res2.status).toBe(429);
  });
});

/* -------------------------------------------------------------------------- */
/*  Window reset                                                              */
/* -------------------------------------------------------------------------- */

describe('Rate Limiter — window reset', () => {
  it('resets the counter after the window expires', async () => {
    const windowMs = 10_000;
    const app = buildApp(2, windowMs);

    // Use up both requests
    await makeRequest(app, '10.1.0.1');
    await makeRequest(app, '10.1.0.1');

    // Should be blocked
    const blocked = await makeRequest(app, '10.1.0.1');
    expect(blocked.status).toBe(429);

    // Advance time past the window
    vi.advanceTimersByTime(windowMs + 1);

    // Should be allowed again
    const res = await makeRequest(app, '10.1.0.1');
    expect(res.status).toBe(200);
  });

  it('starts a new window after the previous one expires', async () => {
    const windowMs = 5_000;
    const app = buildApp(1, windowMs);

    // First window — use up the limit
    const r1 = await makeRequest(app, '10.1.0.2');
    expect(r1.status).toBe(200);

    const r2 = await makeRequest(app, '10.1.0.2');
    expect(r2.status).toBe(429);

    // Advance past the window
    vi.advanceTimersByTime(windowMs + 1);

    // Second window — should have a fresh limit
    const r3 = await makeRequest(app, '10.1.0.2');
    expect(r3.status).toBe(200);

    const r4 = await makeRequest(app, '10.1.0.2');
    expect(r4.status).toBe(429);
  });

  it('does not reset before window expires', async () => {
    const windowMs = 10_000;
    const app = buildApp(1, windowMs);

    await makeRequest(app, '10.1.0.3');

    // Advance time but not past the window
    vi.advanceTimersByTime(windowMs - 1);

    // Should still be blocked
    const res = await makeRequest(app, '10.1.0.3');
    expect(res.status).toBe(429);
  });
});

/* -------------------------------------------------------------------------- */
/*  Rate limiting applies to all HTTP methods                                 */
/* -------------------------------------------------------------------------- */

describe('Rate Limiter — HTTP methods', () => {
  it('counts GET and POST toward the same limit', async () => {
    const app = buildApp(2, 60_000);

    const r1 = await makeRequest(app, '10.2.0.1', { method: 'GET' });
    expect(r1.status).toBe(200);

    const r2 = await makeRequest(app, '10.2.0.1', { method: 'POST' });
    expect(r2.status).toBe(200);

    // Third request (either method) should be blocked
    const r3 = await makeRequest(app, '10.2.0.1', { method: 'GET' });
    expect(r3.status).toBe(429);
  });
});

/* -------------------------------------------------------------------------- */
/*  Edge cases                                                                */
/* -------------------------------------------------------------------------- */

describe('Rate Limiter — edge cases', () => {
  it('handles limit of 1 request correctly', async () => {
    const app = buildApp(1, 60_000);

    const r1 = await makeRequest(app, '10.3.0.1');
    expect(r1.status).toBe(200);

    const r2 = await makeRequest(app, '10.3.0.1');
    expect(r2.status).toBe(429);
  });

  it('handles requests with no IP headers gracefully', async () => {
    const app = buildApp(1, 60_000);

    // No x-forwarded-for or x-real-ip — falls back to "unknown"
    const r1 = await app.fetch(new Request('http://localhost/ping'));
    expect(r1.status).toBe(200);

    // Second request with no headers also falls back to "unknown" — same bucket
    const r2 = await app.fetch(new Request('http://localhost/ping'));
    expect(r2.status).toBe(429);
  });
});
