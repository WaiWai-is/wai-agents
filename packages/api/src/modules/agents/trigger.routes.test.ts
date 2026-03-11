/* eslint-disable @typescript-eslint/no-explicit-any */
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hookRoutes, triggerRoutes } from './trigger.routes.js';

// Mock DB connection
vi.mock('../../db/connection.js', () => ({
  sql: Object.assign(vi.fn(), { unsafe: vi.fn() }),
  db: {},
}));

// Mock trigger service
vi.mock('./trigger.service.js', () => ({
  listTriggers: vi.fn(),
  createTrigger: vi.fn(),
  getTrigger: vi.fn(),
  updateTrigger: vi.fn(),
  deleteTrigger: vi.fn(),
  fireTrigger: vi.fn(),
}));

async function getTokenHeader(): Promise<Record<string, string>> {
  const { generateTokens } = await import('../auth/auth.service.js');
  const { access_token } = await generateTokens('user-uuid', 'user');
  return { Authorization: `Bearer ${access_token}` };
}

function buildApp() {
  const app = new Hono();
  app.route('/agents', triggerRoutes);
  app.route('/hooks', hookRoutes);
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

const AGENT_ID = '880e8400-e29b-41d4-a716-446655440003';
const TRIGGER_ID = 'aa0e8400-e29b-41d4-a716-446655440010';

/* -------------------------------------------------------------------------- */
/*  Authentication                                                            */
/* -------------------------------------------------------------------------- */

describe('Trigger Routes — Authentication', () => {
  it('GET /agents/:agentId/triggers returns 401 without auth', async () => {
    const { status, body } = await request(app, 'GET', `/agents/${AGENT_ID}/triggers`);
    expect(status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('POST /agents/:agentId/triggers returns 401 without auth', async () => {
    const { status } = await request(app, 'POST', `/agents/${AGENT_ID}/triggers`, {
      body: { name: 'Test', trigger_type: 'webhook' },
    });
    expect(status).toBe(401);
  });

  it('GET /agents/:agentId/triggers/:id returns 401 without auth', async () => {
    const { status } = await request(app, 'GET', `/agents/${AGENT_ID}/triggers/${TRIGGER_ID}`);
    expect(status).toBe(401);
  });

  it('PATCH /agents/:agentId/triggers/:id returns 401 without auth', async () => {
    const { status } = await request(app, 'PATCH', `/agents/${AGENT_ID}/triggers/${TRIGGER_ID}`, {
      body: { name: 'Updated' },
    });
    expect(status).toBe(401);
  });

  it('DELETE /agents/:agentId/triggers/:id returns 401 without auth', async () => {
    const { status } = await request(app, 'DELETE', `/agents/${AGENT_ID}/triggers/${TRIGGER_ID}`);
    expect(status).toBe(401);
  });

  it('rejects invalid auth token with 401', async () => {
    const { status } = await request(app, 'GET', `/agents/${AGENT_ID}/triggers`, {
      headers: { Authorization: 'Bearer invalid.token.here' },
    });
    expect(status).toBe(401);
  });
});

/* -------------------------------------------------------------------------- */
/*  GET /agents/:agentId/triggers                                             */
/* -------------------------------------------------------------------------- */

describe('GET /agents/:agentId/triggers', () => {
  it('returns 200 with triggers list', async () => {
    const { listTriggers } = await import('./trigger.service.js');
    vi.mocked(listTriggers).mockResolvedValueOnce([
      {
        id: TRIGGER_ID,
        agent_id: AGENT_ID,
        creator_id: 'user-uuid',
        name: 'My Trigger',
        trigger_type: 'webhook',
        token: 'abc123',
        hmac_secret: null,
        condition_filter: null,
        message_template: null,
        cron_expression: null,
        enabled: true,
        last_fired_at: null,
        fire_count: 0,
        metadata: {},
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'GET', `/agents/${AGENT_ID}/triggers`, {
      headers: authHeaders,
    });

    expect(status).toBe(200);
    expect(body.triggers).toHaveLength(1);
    expect(body.triggers[0].name).toBe('My Trigger');
  });

  it('returns 200 with empty list', async () => {
    const { listTriggers } = await import('./trigger.service.js');
    vi.mocked(listTriggers).mockResolvedValueOnce([]);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'GET', `/agents/${AGENT_ID}/triggers`, {
      headers: authHeaders,
    });

    expect(status).toBe(200);
    expect(body.triggers).toHaveLength(0);
  });

  it('returns 404 when agent not found', async () => {
    const { listTriggers } = await import('./trigger.service.js');
    vi.mocked(listTriggers).mockRejectedValueOnce(
      Object.assign(new Error('Agent not found'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'GET', `/agents/${AGENT_ID}/triggers`, {
      headers: authHeaders,
    });

    expect(status).toBe(404);
    expect(body.error).toBe('Not found');
  });
});

/* -------------------------------------------------------------------------- */
/*  POST /agents/:agentId/triggers                                            */
/* -------------------------------------------------------------------------- */

describe('POST /agents/:agentId/triggers', () => {
  it('returns 201 with created trigger', async () => {
    const { createTrigger } = await import('./trigger.service.js');
    vi.mocked(createTrigger).mockResolvedValueOnce({
      id: TRIGGER_ID,
      agent_id: AGENT_ID,
      creator_id: 'user-uuid',
      name: 'New Trigger',
      trigger_type: 'webhook',
      token: 'newtoken123',
      hmac_secret: null,
      condition_filter: null,
      message_template: null,
      cron_expression: null,
      enabled: true,
      last_fired_at: null,
      fire_count: 0,
      metadata: {},
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    } as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'POST', `/agents/${AGENT_ID}/triggers`, {
      headers: authHeaders,
      body: { name: 'New Trigger', trigger_type: 'webhook' },
    });

    expect(status).toBe(201);
    expect(body.trigger.name).toBe('New Trigger');
  });

  it('returns 422 for missing name', async () => {
    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'POST', `/agents/${AGENT_ID}/triggers`, {
      headers: authHeaders,
      body: { trigger_type: 'webhook' },
    });

    expect(status).toBe(422);
    expect(body.error).toBe('Validation error');
  });

  it('returns 422 for missing trigger_type', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'POST', `/agents/${AGENT_ID}/triggers`, {
      headers: authHeaders,
      body: { name: 'Test' },
    });

    expect(status).toBe(422);
  });

  it('returns 422 for invalid trigger_type', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'POST', `/agents/${AGENT_ID}/triggers`, {
      headers: authHeaders,
      body: { name: 'Test', trigger_type: 'invalid' },
    });

    expect(status).toBe(422);
  });

  it('returns 422 for name exceeding 64 characters', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'POST', `/agents/${AGENT_ID}/triggers`, {
      headers: authHeaders,
      body: { name: 'a'.repeat(65), trigger_type: 'webhook' },
    });

    expect(status).toBe(422);
  });

  it('returns 422 for invalid JSON body', async () => {
    const authHeaders = await getTokenHeader();
    const res = await app.fetch(
      new Request(`http://localhost/agents/${AGENT_ID}/triggers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: 'not-json',
      }),
    );
    expect(res.status).toBe(422);
  });

  it('returns 404 when agent not found from service', async () => {
    const { createTrigger } = await import('./trigger.service.js');
    vi.mocked(createTrigger).mockRejectedValueOnce(
      Object.assign(new Error('Agent not found'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'POST', `/agents/${AGENT_ID}/triggers`, {
      headers: authHeaders,
      body: { name: 'Test', trigger_type: 'webhook' },
    });

    expect(status).toBe(404);
    expect(body.error).toBe('Not found');
  });

  it('creates trigger with condition_filter', async () => {
    const { createTrigger } = await import('./trigger.service.js');
    vi.mocked(createTrigger).mockResolvedValueOnce({
      id: TRIGGER_ID,
      name: 'Conditional Trigger',
      trigger_type: 'condition',
      condition_filter: { all: [{ field: 'action', op: 'eq', value: 'opened' }] },
    } as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'POST', `/agents/${AGENT_ID}/triggers`, {
      headers: authHeaders,
      body: {
        name: 'Conditional Trigger',
        trigger_type: 'condition',
        condition_filter: { all: [{ field: 'action', op: 'eq', value: 'opened' }] },
      },
    });

    expect(status).toBe(201);
    expect(body.trigger.condition_filter).toBeTruthy();
  });

  it('strips HTML from name', async () => {
    const { createTrigger } = await import('./trigger.service.js');
    vi.mocked(createTrigger).mockResolvedValueOnce({
      id: TRIGGER_ID,
      name: 'alert(1)',
    } as any);

    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'POST', `/agents/${AGENT_ID}/triggers`, {
      headers: authHeaders,
      body: {
        name: '<script>alert(1)</script>',
        trigger_type: 'webhook',
      },
    });

    expect(status).toBe(201);
    expect(vi.mocked(createTrigger)).toHaveBeenCalledWith(
      AGENT_ID,
      expect.any(String),
      expect.objectContaining({ name: 'alert(1)' }),
    );
  });
});

/* -------------------------------------------------------------------------- */
/*  GET /agents/:agentId/triggers/:id                                         */
/* -------------------------------------------------------------------------- */

describe('GET /agents/:agentId/triggers/:id', () => {
  it('returns 200 with trigger data', async () => {
    const { getTrigger } = await import('./trigger.service.js');
    vi.mocked(getTrigger).mockResolvedValueOnce({
      id: TRIGGER_ID,
      name: 'My Trigger',
      trigger_type: 'webhook',
    } as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'GET',
      `/agents/${AGENT_ID}/triggers/${TRIGGER_ID}`,
      { headers: authHeaders },
    );

    expect(status).toBe(200);
    expect(body.trigger.name).toBe('My Trigger');
  });

  it('returns 404 for non-existent trigger', async () => {
    const { getTrigger } = await import('./trigger.service.js');
    vi.mocked(getTrigger).mockRejectedValueOnce(
      Object.assign(new Error('Trigger not found'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'GET', `/agents/${AGENT_ID}/triggers/nonexistent`, {
      headers: authHeaders,
    });

    expect(status).toBe(404);
    expect(body.error).toBe('Not found');
  });
});

/* -------------------------------------------------------------------------- */
/*  PATCH /agents/:agentId/triggers/:id                                       */
/* -------------------------------------------------------------------------- */

describe('PATCH /agents/:agentId/triggers/:id', () => {
  it('returns 200 with updated trigger', async () => {
    const { updateTrigger } = await import('./trigger.service.js');
    vi.mocked(updateTrigger).mockResolvedValueOnce({
      id: TRIGGER_ID,
      name: 'Updated Name',
    } as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'PATCH',
      `/agents/${AGENT_ID}/triggers/${TRIGGER_ID}`,
      {
        headers: authHeaders,
        body: { name: 'Updated Name' },
      },
    );

    expect(status).toBe(200);
    expect(body.trigger.name).toBe('Updated Name');
  });

  it('returns 422 for invalid name exceeding 64 chars in update', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'PATCH', `/agents/${AGENT_ID}/triggers/${TRIGGER_ID}`, {
      headers: authHeaders,
      body: { name: 'a'.repeat(65) },
    });

    expect(status).toBe(422);
  });

  it('returns 404 when trigger not found', async () => {
    const { updateTrigger } = await import('./trigger.service.js');
    vi.mocked(updateTrigger).mockRejectedValueOnce(
      Object.assign(new Error('Trigger not found'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'PATCH',
      `/agents/${AGENT_ID}/triggers/nonexistent`,
      {
        headers: authHeaders,
        body: { name: 'Nope' },
      },
    );

    expect(status).toBe(404);
    expect(body.error).toBe('Not found');
  });

  it('returns 422 for invalid JSON body', async () => {
    const authHeaders = await getTokenHeader();
    const res = await app.fetch(
      new Request(`http://localhost/agents/${AGENT_ID}/triggers/${TRIGGER_ID}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: 'not-json',
      }),
    );
    expect(res.status).toBe(422);
  });

  it('updates enabled flag to false', async () => {
    const { updateTrigger } = await import('./trigger.service.js');
    vi.mocked(updateTrigger).mockResolvedValueOnce({
      id: TRIGGER_ID,
      enabled: false,
    } as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'PATCH',
      `/agents/${AGENT_ID}/triggers/${TRIGGER_ID}`,
      {
        headers: authHeaders,
        body: { enabled: false },
      },
    );

    expect(status).toBe(200);
    expect(body.trigger.enabled).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/*  DELETE /agents/:agentId/triggers/:id                                      */
/* -------------------------------------------------------------------------- */

describe('DELETE /agents/:agentId/triggers/:id', () => {
  it('returns 200 with ok true', async () => {
    const { deleteTrigger } = await import('./trigger.service.js');
    vi.mocked(deleteTrigger).mockResolvedValueOnce(undefined);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'DELETE',
      `/agents/${AGENT_ID}/triggers/${TRIGGER_ID}`,
      { headers: authHeaders },
    );

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it('returns 404 for non-existent trigger', async () => {
    const { deleteTrigger } = await import('./trigger.service.js');
    vi.mocked(deleteTrigger).mockRejectedValueOnce(
      Object.assign(new Error('Trigger not found'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'DELETE',
      `/agents/${AGENT_ID}/triggers/nonexistent`,
      { headers: authHeaders },
    );

    expect(status).toBe(404);
    expect(body.error).toBe('Not found');
  });
});

/* -------------------------------------------------------------------------- */
/*  POST /hooks/:token (public webhook)                                       */
/* -------------------------------------------------------------------------- */

describe('POST /hooks/:token', () => {
  it('returns 200 with fired true on success', async () => {
    const { fireTrigger } = await import('./trigger.service.js');
    vi.mocked(fireTrigger).mockResolvedValueOnce({
      fired: true,
      conversation_id: 'conv-123',
    });

    const { status, body } = await request(app, 'POST', '/hooks/mytoken123', {
      body: { event: 'push', ref: 'refs/heads/main' },
    });

    expect(status).toBe(200);
    expect(body.fired).toBe(true);
    expect(body.conversation_id).toBe('conv-123');
  });

  it('returns 200 with fired false when condition does not match', async () => {
    const { fireTrigger } = await import('./trigger.service.js');
    vi.mocked(fireTrigger).mockResolvedValueOnce({
      fired: false,
      conversation_id: null,
      reason: 'Condition filter did not match',
    });

    const { status, body } = await request(app, 'POST', '/hooks/mytoken123', {
      body: { action: 'closed' },
    });

    expect(status).toBe(200);
    expect(body.fired).toBe(false);
    expect(body.reason).toBe('Condition filter did not match');
  });

  it('returns 404 for unknown token', async () => {
    const { fireTrigger } = await import('./trigger.service.js');
    vi.mocked(fireTrigger).mockRejectedValueOnce(
      Object.assign(new Error('Trigger not found'), { code: 'NOT_FOUND' }),
    );

    const { status, body } = await request(app, 'POST', '/hooks/unknown-token', {
      body: {},
    });

    expect(status).toBe(404);
    expect(body.error).toBe('Not found');
  });

  it('returns 401 for unauthorized HMAC', async () => {
    const { fireTrigger } = await import('./trigger.service.js');
    vi.mocked(fireTrigger).mockRejectedValueOnce(
      Object.assign(new Error('Invalid HMAC signature'), { code: 'UNAUTHORIZED' }),
    );

    const { status, body } = await request(app, 'POST', '/hooks/mytoken123', {
      body: { event: 'push' },
      headers: { 'X-Hub-Signature-256': 'bad-signature' },
    });

    expect(status).toBe(401);
    expect(body.error).toBe('Invalid HMAC signature');
  });

  it('does not require auth header (public endpoint)', async () => {
    const { fireTrigger } = await import('./trigger.service.js');
    vi.mocked(fireTrigger).mockResolvedValueOnce({
      fired: true,
      conversation_id: 'conv-456',
    });

    // No auth headers at all
    const { status, body } = await request(app, 'POST', '/hooks/mytoken123', {
      body: { event: 'push' },
    });

    expect(status).toBe(200);
    expect(body.fired).toBe(true);
  });

  it('handles empty body gracefully', async () => {
    const { fireTrigger } = await import('./trigger.service.js');
    vi.mocked(fireTrigger).mockResolvedValueOnce({
      fired: true,
      conversation_id: 'conv-789',
    });

    const { status } = await request(app, 'POST', '/hooks/mytoken123', {
      body: {},
    });

    expect(status).toBe(200);
  });
});
