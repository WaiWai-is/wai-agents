/* eslint-disable @typescript-eslint/no-explicit-any */
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { crewRoutes } from './crew.routes.js';

// Mock DB connection
vi.mock('../../db/connection.js', () => ({
  sql: Object.assign(vi.fn(), { unsafe: vi.fn() }),
  db: {},
}));

// Mock crew service
vi.mock('./crew.service.js', () => ({
  listCrews: vi.fn(),
  createCrew: vi.fn(),
  getCrew: vi.fn(),
  updateCrew: vi.fn(),
  deleteCrew: vi.fn(),
}));

// Mock crew orchestrator
vi.mock('./crew.js', () => ({
  runCrew: vi.fn(),
}));

async function getTokenHeader(): Promise<Record<string, string>> {
  const { generateTokens } = await import('../auth/auth.service.js');
  const { access_token } = await generateTokens('user-uuid', 'user');
  return { Authorization: `Bearer ${access_token}` };
}

function buildApp() {
  const app = new Hono();
  app.route('/crews', crewRoutes);
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

const AGENT_ID_1 = '880e8400-e29b-41d4-a716-446655440003';
const AGENT_ID_2 = '990e8400-e29b-41d4-a716-446655440004';
const CONVERSATION_ID = 'aa0e8400-e29b-41d4-a716-446655440005';

/* -------------------------------------------------------------------------- */
/*  Authentication                                                            */
/* -------------------------------------------------------------------------- */

describe('Crew Routes — Authentication', () => {
  it('GET /crews returns 401 without auth token', async () => {
    const { status, body } = await request(app, 'GET', '/crews');
    expect(status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('POST /crews returns 401 without auth token', async () => {
    const { status } = await request(app, 'POST', '/crews', {
      body: { name: 'Test', steps: [] },
    });
    expect(status).toBe(401);
  });

  it('GET /crews/:id returns 401 without auth token', async () => {
    const { status } = await request(app, 'GET', '/crews/some-id');
    expect(status).toBe(401);
  });

  it('PATCH /crews/:id returns 401 without auth token', async () => {
    const { status } = await request(app, 'PATCH', '/crews/some-id', {
      body: { name: 'Updated' },
    });
    expect(status).toBe(401);
  });

  it('DELETE /crews/:id returns 401 without auth token', async () => {
    const { status } = await request(app, 'DELETE', '/crews/some-id');
    expect(status).toBe(401);
  });

  it('POST /crews/:id/run returns 401 without auth token', async () => {
    const { status } = await request(app, 'POST', '/crews/some-id/run', {
      body: { conversation_id: CONVERSATION_ID, message: 'hello' },
    });
    expect(status).toBe(401);
  });

  it('rejects invalid auth token with 401', async () => {
    const { status } = await request(app, 'GET', '/crews', {
      headers: { Authorization: 'Bearer invalid.token.here' },
    });
    expect(status).toBe(401);
  });
});

/* -------------------------------------------------------------------------- */
/*  GET /crews                                                                */
/* -------------------------------------------------------------------------- */

describe('GET /crews', () => {
  it('returns 200 with crews list', async () => {
    const { listCrews } = await import('./crew.service.js');
    vi.mocked(listCrews).mockResolvedValueOnce([
      {
        id: 'crew-1',
        creator_id: 'user-uuid',
        name: 'My Crew',
        slug: 'my-crew',
        description: null,
        visibility: 'private',
        steps: [{ agentId: AGENT_ID_1, role: 'researcher' }],
        category: null,
        usage_count: 0,
        rating_sum: 0,
        rating_count: 0,
        metadata: {},
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'GET', '/crews', {
      headers: authHeaders,
    });

    expect(status).toBe(200);
    expect(body.crews).toHaveLength(1);
    expect(body.crews[0].name).toBe('My Crew');
  });

  it('returns 200 with empty list when user has no crews', async () => {
    const { listCrews } = await import('./crew.service.js');
    vi.mocked(listCrews).mockResolvedValueOnce([]);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'GET', '/crews', {
      headers: authHeaders,
    });

    expect(status).toBe(200);
    expect(body.crews).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/*  POST /crews                                                               */
/* -------------------------------------------------------------------------- */

describe('POST /crews', () => {
  it('returns 201 with created crew', async () => {
    const { createCrew } = await import('./crew.service.js');
    vi.mocked(createCrew).mockResolvedValueOnce({
      id: 'new-crew',
      creator_id: 'user-uuid',
      name: 'New Crew',
      slug: 'new-crew',
      description: null,
      visibility: 'private',
      steps: [{ agentId: AGENT_ID_1, role: 'researcher' }],
      category: null,
      usage_count: 0,
      rating_sum: 0,
      rating_count: 0,
      metadata: {},
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    } as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'POST', '/crews', {
      headers: authHeaders,
      body: {
        name: 'New Crew',
        steps: [{ agentId: AGENT_ID_1, role: 'researcher' }],
      },
    });

    expect(status).toBe(201);
    expect(body.crew.name).toBe('New Crew');
  });

  it('returns 422 for missing name', async () => {
    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'POST', '/crews', {
      headers: authHeaders,
      body: { steps: [{ agentId: AGENT_ID_1, role: 'researcher' }] },
    });

    expect(status).toBe(422);
    expect(body.error).toBe('Validation error');
  });

  it('returns 422 for missing steps', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'POST', '/crews', {
      headers: authHeaders,
      body: { name: 'Test' },
    });

    expect(status).toBe(422);
  });

  it('returns 422 for empty steps array', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'POST', '/crews', {
      headers: authHeaders,
      body: { name: 'Test', steps: [] },
    });

    expect(status).toBe(422);
  });

  it('returns 422 for steps exceeding 5', async () => {
    const authHeaders = await getTokenHeader();
    const steps = Array.from({ length: 6 }, (_, i) => ({
      agentId: AGENT_ID_1,
      role: `role-${i}`,
    }));
    const { status } = await request(app, 'POST', '/crews', {
      headers: authHeaders,
      body: { name: 'Test', steps },
    });

    expect(status).toBe(422);
  });

  it('returns 422 for invalid agentId in steps', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'POST', '/crews', {
      headers: authHeaders,
      body: {
        name: 'Test',
        steps: [{ agentId: 'not-a-uuid', role: 'researcher' }],
      },
    });

    expect(status).toBe(422);
  });

  it('returns 422 for empty role in steps', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'POST', '/crews', {
      headers: authHeaders,
      body: {
        name: 'Test',
        steps: [{ agentId: AGENT_ID_1, role: '' }],
      },
    });

    expect(status).toBe(422);
  });

  it('returns 422 for invalid visibility', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'POST', '/crews', {
      headers: authHeaders,
      body: {
        name: 'Test',
        steps: [{ agentId: AGENT_ID_1, role: 'researcher' }],
        visibility: 'invalid',
      },
    });

    expect(status).toBe(422);
  });

  it('returns 400 for invalid agent ID from service', async () => {
    const { createCrew } = await import('./crew.service.js');
    vi.mocked(createCrew).mockRejectedValueOnce(
      Object.assign(new Error('Agent not found'), { code: 'BAD_REQUEST' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'POST', '/crews', {
      headers: authHeaders,
      body: {
        name: 'Bad Crew',
        steps: [{ agentId: AGENT_ID_1, role: 'researcher' }],
      },
    });

    expect(status).toBe(400);
    expect(body.error).toBe('Bad request');
  });

  it('returns 422 for invalid JSON body', async () => {
    const authHeaders = await getTokenHeader();
    const res = await app.fetch(
      new Request('http://localhost/crews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: 'not-json',
      }),
    );
    expect(res.status).toBe(422);
  });

  it('creates crew with all optional fields', async () => {
    const { createCrew } = await import('./crew.service.js');
    vi.mocked(createCrew).mockResolvedValueOnce({
      id: 'id',
      name: 'Full Crew',
      description: 'A description',
      visibility: 'public',
      category: 'creative',
      steps: [
        { agentId: AGENT_ID_1, role: 'researcher' },
        { agentId: AGENT_ID_2, role: 'writer', parallelGroup: 'group-a' },
      ],
    } as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'POST', '/crews', {
      headers: authHeaders,
      body: {
        name: 'Full Crew',
        description: 'A description',
        visibility: 'public',
        category: 'creative',
        steps: [
          { agentId: AGENT_ID_1, role: 'researcher' },
          { agentId: AGENT_ID_2, role: 'writer', parallelGroup: 'group-a' },
        ],
      },
    });

    expect(status).toBe(201);
    expect(body.crew.name).toBe('Full Crew');
  });
});

/* -------------------------------------------------------------------------- */
/*  GET /crews/:id                                                            */
/* -------------------------------------------------------------------------- */

describe('GET /crews/:id', () => {
  it('returns 200 with crew data', async () => {
    const { getCrew } = await import('./crew.service.js');
    vi.mocked(getCrew).mockResolvedValueOnce({
      id: 'crew-1',
      name: 'My Crew',
      steps: [{ agentId: AGENT_ID_1, role: 'researcher' }],
    } as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'GET', '/crews/crew-1', {
      headers: authHeaders,
    });

    expect(status).toBe(200);
    expect(body.crew.name).toBe('My Crew');
  });

  it('returns 404 for non-existent crew', async () => {
    const { getCrew } = await import('./crew.service.js');
    vi.mocked(getCrew).mockRejectedValueOnce(
      Object.assign(new Error('Crew not found'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'GET', '/crews/nonexistent', {
      headers: authHeaders,
    });

    expect(status).toBe(404);
    expect(body.error).toBe('Not found');
  });

  it('returns 404 when non-owner tries to access', async () => {
    const { getCrew } = await import('./crew.service.js');
    vi.mocked(getCrew).mockRejectedValueOnce(
      Object.assign(new Error('Crew not found'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'GET', '/crews/other-crew', {
      headers: authHeaders,
    });

    expect(status).toBe(404);
  });
});

/* -------------------------------------------------------------------------- */
/*  PATCH /crews/:id                                                          */
/* -------------------------------------------------------------------------- */

describe('PATCH /crews/:id', () => {
  it('returns 200 with updated crew', async () => {
    const { updateCrew } = await import('./crew.service.js');
    vi.mocked(updateCrew).mockResolvedValueOnce({
      id: 'crew-1',
      name: 'Updated Name',
    } as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'PATCH', '/crews/crew-1', {
      headers: authHeaders,
      body: { name: 'Updated Name' },
    });

    expect(status).toBe(200);
    expect(body.crew.name).toBe('Updated Name');
  });

  it('returns 422 for invalid visibility in update', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'PATCH', '/crews/crew-1', {
      headers: authHeaders,
      body: { visibility: 'secret' },
    });

    expect(status).toBe(422);
  });

  it('returns 404 when updating non-existent crew', async () => {
    const { updateCrew } = await import('./crew.service.js');
    vi.mocked(updateCrew).mockRejectedValueOnce(
      Object.assign(new Error('Crew not found or access denied'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'PATCH', '/crews/nonexistent', {
      headers: authHeaders,
      body: { name: 'Nope' },
    });

    expect(status).toBe(404);
    expect(body.error).toBe('Not found');
  });

  it('returns 404 when non-owner tries to update', async () => {
    const { updateCrew } = await import('./crew.service.js');
    vi.mocked(updateCrew).mockRejectedValueOnce(
      Object.assign(new Error('Crew not found or access denied'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'PATCH', '/crews/other-crew', {
      headers: authHeaders,
      body: { name: 'Hacked' },
    });

    expect(status).toBe(404);
  });

  it('returns 400 when service throws BAD_REQUEST for invalid steps', async () => {
    const { updateCrew } = await import('./crew.service.js');
    vi.mocked(updateCrew).mockRejectedValueOnce(
      Object.assign(new Error('Agent not found'), { code: 'BAD_REQUEST' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'PATCH', '/crews/crew-1', {
      headers: authHeaders,
      body: { steps: [{ agentId: AGENT_ID_1, role: 'researcher' }] },
    });

    expect(status).toBe(400);
    expect(body.error).toBe('Bad request');
  });

  it('returns 422 for invalid JSON body', async () => {
    const authHeaders = await getTokenHeader();
    const res = await app.fetch(
      new Request('http://localhost/crews/crew-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: 'not-json',
      }),
    );
    expect(res.status).toBe(422);
  });

  it('updates multiple fields', async () => {
    const { updateCrew } = await import('./crew.service.js');
    vi.mocked(updateCrew).mockResolvedValueOnce({
      id: 'crew-1',
      name: 'New Name',
      visibility: 'public',
      category: 'creative',
    } as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'PATCH', '/crews/crew-1', {
      headers: authHeaders,
      body: { name: 'New Name', visibility: 'public', category: 'creative' },
    });

    expect(status).toBe(200);
    expect(body.crew.name).toBe('New Name');
    expect(body.crew.visibility).toBe('public');
  });
});

/* -------------------------------------------------------------------------- */
/*  DELETE /crews/:id                                                         */
/* -------------------------------------------------------------------------- */

describe('DELETE /crews/:id', () => {
  it('returns 200 with ok true on successful deletion', async () => {
    const { deleteCrew } = await import('./crew.service.js');
    vi.mocked(deleteCrew).mockResolvedValueOnce(undefined);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'DELETE', '/crews/crew-1', {
      headers: authHeaders,
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it('returns 404 when deleting non-existent crew', async () => {
    const { deleteCrew } = await import('./crew.service.js');
    vi.mocked(deleteCrew).mockRejectedValueOnce(
      Object.assign(new Error('Crew not found or access denied'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'DELETE', '/crews/nonexistent', {
      headers: authHeaders,
    });

    expect(status).toBe(404);
    expect(body.error).toBe('Not found');
  });

  it('returns 404 when non-owner tries to delete', async () => {
    const { deleteCrew } = await import('./crew.service.js');
    vi.mocked(deleteCrew).mockRejectedValueOnce(
      Object.assign(new Error('Crew not found or access denied'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'DELETE', '/crews/other-crew', {
      headers: authHeaders,
    });

    expect(status).toBe(404);
  });
});

/* -------------------------------------------------------------------------- */
/*  POST /crews/:id/run                                                       */
/* -------------------------------------------------------------------------- */

describe('POST /crews/:id/run', () => {
  it('returns 200 with crew execution result', async () => {
    const { runCrew } = await import('./crew.js');
    vi.mocked(runCrew).mockResolvedValueOnce({
      response: 'Final output',
      stepResults: [
        { agentId: AGENT_ID_1, role: 'researcher', response: 'Research done' },
        { agentId: AGENT_ID_2, role: 'writer', response: 'Final output' },
      ],
    });

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'POST', '/crews/crew-1/run', {
      headers: authHeaders,
      body: { conversation_id: CONVERSATION_ID, message: 'Write an article about AI' },
    });

    expect(status).toBe(200);
    expect(body.response).toBe('Final output');
    expect(body.step_results).toHaveLength(2);
  });

  it('returns 422 for missing conversation_id', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'POST', '/crews/crew-1/run', {
      headers: authHeaders,
      body: { message: 'hello' },
    });

    expect(status).toBe(422);
  });

  it('returns 422 for missing message', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'POST', '/crews/crew-1/run', {
      headers: authHeaders,
      body: { conversation_id: CONVERSATION_ID },
    });

    expect(status).toBe(422);
  });

  it('returns 422 for empty message', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'POST', '/crews/crew-1/run', {
      headers: authHeaders,
      body: { conversation_id: CONVERSATION_ID, message: '' },
    });

    expect(status).toBe(422);
  });

  it('returns 422 for invalid conversation_id format', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'POST', '/crews/crew-1/run', {
      headers: authHeaders,
      body: { conversation_id: 'not-a-uuid', message: 'hello' },
    });

    expect(status).toBe(422);
  });

  it('returns 404 for non-existent crew', async () => {
    const { runCrew } = await import('./crew.js');
    vi.mocked(runCrew).mockRejectedValueOnce(
      Object.assign(new Error('Crew not found'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'POST', '/crews/nonexistent/run', {
      headers: authHeaders,
      body: { conversation_id: CONVERSATION_ID, message: 'hello' },
    });

    expect(status).toBe(404);
    expect(body.error).toBe('Not found');
  });

  it('returns 400 when crew has no steps', async () => {
    const { runCrew } = await import('./crew.js');
    vi.mocked(runCrew).mockRejectedValueOnce(
      Object.assign(new Error('Crew has no steps'), { code: 'BAD_REQUEST' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'POST', '/crews/crew-1/run', {
      headers: authHeaders,
      body: { conversation_id: CONVERSATION_ID, message: 'hello' },
    });

    expect(status).toBe(400);
    expect(body.error).toBe('Bad request');
  });

  it('returns 422 for invalid JSON body', async () => {
    const authHeaders = await getTokenHeader();
    const res = await app.fetch(
      new Request('http://localhost/crews/crew-1/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: 'not-json',
      }),
    );
    expect(res.status).toBe(422);
  });
});

/* -------------------------------------------------------------------------- */
/*  Input Validation Edge Cases                                               */
/* -------------------------------------------------------------------------- */

describe('Crew Routes — Input Validation Edge Cases', () => {
  it('POST /crews returns 422 for category exceeding 32 characters', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'POST', '/crews', {
      headers: authHeaders,
      body: {
        name: 'Test',
        steps: [{ agentId: AGENT_ID_1, role: 'researcher' }],
        category: 'a'.repeat(33),
      },
    });

    expect(status).toBe(422);
  });

  it('POST /crews returns 422 for name exceeding 64 characters', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'POST', '/crews', {
      headers: authHeaders,
      body: {
        name: 'a'.repeat(65),
        steps: [{ agentId: AGENT_ID_1, role: 'researcher' }],
      },
    });

    expect(status).toBe(422);
  });

  it('POST /crews returns 422 for role exceeding 64 characters', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'POST', '/crews', {
      headers: authHeaders,
      body: {
        name: 'Test',
        steps: [{ agentId: AGENT_ID_1, role: 'a'.repeat(65) }],
      },
    });

    expect(status).toBe(422);
  });

  it('POST /crews returns 422 for parallelGroup exceeding 32 characters', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'POST', '/crews', {
      headers: authHeaders,
      body: {
        name: 'Test',
        steps: [{ agentId: AGENT_ID_1, role: 'researcher', parallelGroup: 'a'.repeat(33) }],
      },
    });

    expect(status).toBe(422);
  });

  it('POST /crews strips HTML from name', async () => {
    const { createCrew } = await import('./crew.service.js');
    vi.mocked(createCrew).mockResolvedValueOnce({
      id: 'id',
      name: 'alert(1)',
      steps: [{ agentId: AGENT_ID_1, role: 'researcher' }],
    } as any);

    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'POST', '/crews', {
      headers: authHeaders,
      body: {
        name: '<script>alert(1)</script>',
        steps: [{ agentId: AGENT_ID_1, role: 'researcher' }],
      },
    });

    expect(status).toBe(201);
    // Verify createCrew was called with HTML-stripped name
    expect(vi.mocked(createCrew)).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ name: 'alert(1)' }),
    );
  });

  it('POST /crews strips HTML from description', async () => {
    const { createCrew } = await import('./crew.service.js');
    vi.mocked(createCrew).mockResolvedValueOnce({
      id: 'id',
      name: 'Test',
      description: 'bolded',
    } as any);

    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'POST', '/crews', {
      headers: authHeaders,
      body: {
        name: 'Test',
        description: '<b>bolded</b>',
        steps: [{ agentId: AGENT_ID_1, role: 'researcher' }],
      },
    });

    expect(status).toBe(201);
    expect(vi.mocked(createCrew)).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ description: 'bolded' }),
    );
  });

  it('PATCH /crews/:id returns 422 for category exceeding 32 characters', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'PATCH', '/crews/crew-1', {
      headers: authHeaders,
      body: { category: 'a'.repeat(33) },
    });

    expect(status).toBe(422);
  });

  it('POST /crews/:id/run returns 422 for message exceeding 100000 characters', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'POST', '/crews/crew-1/run', {
      headers: authHeaders,
      body: {
        conversation_id: CONVERSATION_ID,
        message: 'a'.repeat(100001),
      },
    });

    expect(status).toBe(422);
  });
});
