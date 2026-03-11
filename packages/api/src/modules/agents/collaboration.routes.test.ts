/* eslint-disable @typescript-eslint/no-explicit-any */
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { collaborationRoutes } from './collaboration.routes.js';

// Mock DB connection
vi.mock('../../db/connection.js', () => ({
  sql: Object.assign(vi.fn(), { unsafe: vi.fn() }),
  db: {},
}));

// Mock collaboration service
vi.mock('./collaboration.service.js', () => ({
  requestCollaboration: vi.fn(),
  acceptCollaboration: vi.fn(),
  completeCollaboration: vi.fn(),
  rejectCollaboration: vi.fn(),
  listCollaborations: vi.fn(),
  getCollaboration: vi.fn(),
  discoverAgents: vi.fn(),
}));

async function getTokenHeader(): Promise<Record<string, string>> {
  const { generateTokens } = await import('../auth/auth.service.js');
  const { access_token } = await generateTokens('user-uuid', 'user');
  return { Authorization: `Bearer ${access_token}` };
}

function buildApp() {
  const app = new Hono();
  app.route('/agents', collaborationRoutes);
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
const RESPONDER_AGENT_ID = '990e8400-e29b-41d4-a716-446655440004';
const CONVERSATION_ID = 'cc0e8400-e29b-41d4-a716-446655440005';
const COLLAB_ID = 'dd0e8400-e29b-41d4-a716-446655440006';

/* -------------------------------------------------------------------------- */
/*  Authentication                                                             */
/* -------------------------------------------------------------------------- */

describe('Collaboration Routes — Authentication', () => {
  it('POST /agents/:agentId/collaborations returns 401 without auth', async () => {
    const { status, body } = await request(app, 'POST', `/agents/${AGENT_ID}/collaborations`, {
      body: {
        responder_agent_id: RESPONDER_AGENT_ID,
        task_description: 'Test',
        conversation_id: CONVERSATION_ID,
      },
    });
    expect(status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('GET /agents/:agentId/collaborations returns 401 without auth', async () => {
    const { status } = await request(app, 'GET', `/agents/${AGENT_ID}/collaborations`);
    expect(status).toBe(401);
  });

  it('GET /agents/:agentId/collaborations/:id returns 401 without auth', async () => {
    const { status } = await request(app, 'GET', `/agents/${AGENT_ID}/collaborations/${COLLAB_ID}`);
    expect(status).toBe(401);
  });

  it('PATCH accept returns 401 without auth', async () => {
    const { status } = await request(
      app,
      'PATCH',
      `/agents/${AGENT_ID}/collaborations/${COLLAB_ID}/accept`,
    );
    expect(status).toBe(401);
  });

  it('PATCH complete returns 401 without auth', async () => {
    const { status } = await request(
      app,
      'PATCH',
      `/agents/${AGENT_ID}/collaborations/${COLLAB_ID}/complete`,
      { body: { result: 'Done' } },
    );
    expect(status).toBe(401);
  });

  it('PATCH reject returns 401 without auth', async () => {
    const { status } = await request(
      app,
      'PATCH',
      `/agents/${AGENT_ID}/collaborations/${COLLAB_ID}/reject`,
      { body: { reason: 'No' } },
    );
    expect(status).toBe(401);
  });

  it('GET /agents/discover returns 401 without auth', async () => {
    const { status } = await request(app, 'GET', '/agents/discover?capability=data');
    expect(status).toBe(401);
  });

  it('rejects invalid auth token with 401', async () => {
    const { status } = await request(app, 'GET', `/agents/${AGENT_ID}/collaborations`, {
      headers: { Authorization: 'Bearer invalid.token.here' },
    });
    expect(status).toBe(401);
  });
});

/* -------------------------------------------------------------------------- */
/*  POST /agents/:agentId/collaborations                                       */
/* -------------------------------------------------------------------------- */

describe('POST /agents/:agentId/collaborations', () => {
  it('returns 201 with created collaboration', async () => {
    const { requestCollaboration } = await import('./collaboration.service.js');
    vi.mocked(requestCollaboration).mockResolvedValueOnce({
      id: COLLAB_ID,
      requester_agent_id: AGENT_ID,
      responder_agent_id: RESPONDER_AGENT_ID,
      requester_user_id: 'user-uuid',
      conversation_id: CONVERSATION_ID,
      status: 'pending',
      task_description: 'Analyze data',
      task_result: null,
      metadata: {},
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      completed_at: null,
    } as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'POST', `/agents/${AGENT_ID}/collaborations`, {
      headers: authHeaders,
      body: {
        responder_agent_id: RESPONDER_AGENT_ID,
        task_description: 'Analyze data',
        conversation_id: CONVERSATION_ID,
      },
    });

    expect(status).toBe(201);
    expect(body.collaboration.id).toBe(COLLAB_ID);
    expect(body.collaboration.status).toBe('pending');
  });

  it('returns 422 for missing responder_agent_id', async () => {
    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'POST', `/agents/${AGENT_ID}/collaborations`, {
      headers: authHeaders,
      body: { task_description: 'Test', conversation_id: CONVERSATION_ID },
    });

    expect(status).toBe(422);
    expect(body.error).toBe('Validation error');
  });

  it('returns 422 for missing task_description', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'POST', `/agents/${AGENT_ID}/collaborations`, {
      headers: authHeaders,
      body: { responder_agent_id: RESPONDER_AGENT_ID, conversation_id: CONVERSATION_ID },
    });

    expect(status).toBe(422);
  });

  it('returns 422 for missing conversation_id', async () => {
    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'POST', `/agents/${AGENT_ID}/collaborations`, {
      headers: authHeaders,
      body: {
        responder_agent_id: RESPONDER_AGENT_ID,
        task_description: 'Test',
      },
    });

    expect(status).toBe(422);
    expect(body.error).toBe('Validation error');
  });

  it('returns 422 for invalid responder_agent_id (not UUID)', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'POST', `/agents/${AGENT_ID}/collaborations`, {
      headers: authHeaders,
      body: {
        responder_agent_id: 'not-a-uuid',
        task_description: 'Test',
        conversation_id: CONVERSATION_ID,
      },
    });

    expect(status).toBe(422);
  });

  it('returns 422 for empty task_description', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'POST', `/agents/${AGENT_ID}/collaborations`, {
      headers: authHeaders,
      body: {
        responder_agent_id: RESPONDER_AGENT_ID,
        task_description: '',
        conversation_id: CONVERSATION_ID,
      },
    });

    expect(status).toBe(422);
  });

  it('returns 404 when agent not found from service', async () => {
    const { requestCollaboration } = await import('./collaboration.service.js');
    vi.mocked(requestCollaboration).mockRejectedValueOnce(
      Object.assign(new Error('Agent not found'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'POST', `/agents/${AGENT_ID}/collaborations`, {
      headers: authHeaders,
      body: {
        responder_agent_id: RESPONDER_AGENT_ID,
        task_description: 'Test',
        conversation_id: CONVERSATION_ID,
      },
    });

    expect(status).toBe(404);
    expect(body.error).toBe('Not found');
  });

  it('returns 400 for self-collaboration from service', async () => {
    const { requestCollaboration } = await import('./collaboration.service.js');
    vi.mocked(requestCollaboration).mockRejectedValueOnce(
      Object.assign(new Error('Agent cannot collaborate with itself'), { code: 'BAD_REQUEST' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'POST', `/agents/${AGENT_ID}/collaborations`, {
      headers: authHeaders,
      body: {
        responder_agent_id: AGENT_ID,
        task_description: 'Test',
        conversation_id: CONVERSATION_ID,
      },
    });

    expect(status).toBe(400);
    expect(body.error).toBe('Bad request');
  });

  it('strips HTML from task_description', async () => {
    const { requestCollaboration } = await import('./collaboration.service.js');
    vi.mocked(requestCollaboration).mockResolvedValueOnce({
      id: COLLAB_ID,
      task_description: 'alert(1)',
    } as any);

    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'POST', `/agents/${AGENT_ID}/collaborations`, {
      headers: authHeaders,
      body: {
        responder_agent_id: RESPONDER_AGENT_ID,
        task_description: '<script>alert(1)</script>',
        conversation_id: CONVERSATION_ID,
      },
    });

    expect(status).toBe(201);
    expect(vi.mocked(requestCollaboration)).toHaveBeenCalledWith(
      AGENT_ID,
      expect.any(String),
      CONVERSATION_ID,
      expect.objectContaining({ task_description: 'alert(1)' }),
    );
  });

  it('returns 422 for invalid JSON body', async () => {
    const authHeaders = await getTokenHeader();
    const res = await app.fetch(
      new Request(`http://localhost/agents/${AGENT_ID}/collaborations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: 'not-json',
      }),
    );
    expect(res.status).toBe(422);
  });
});

/* -------------------------------------------------------------------------- */
/*  GET /agents/:agentId/collaborations                                        */
/* -------------------------------------------------------------------------- */

describe('GET /agents/:agentId/collaborations', () => {
  it('returns 200 with collaborations list', async () => {
    const { listCollaborations } = await import('./collaboration.service.js');
    vi.mocked(listCollaborations).mockResolvedValueOnce([
      {
        id: COLLAB_ID,
        requester_agent_id: AGENT_ID,
        responder_agent_id: RESPONDER_AGENT_ID,
        status: 'pending',
        task_description: 'Test',
      },
    ] as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'GET', `/agents/${AGENT_ID}/collaborations`, {
      headers: authHeaders,
    });

    expect(status).toBe(200);
    expect(body.collaborations).toHaveLength(1);
  });

  it('returns 200 with empty list', async () => {
    const { listCollaborations } = await import('./collaboration.service.js');
    vi.mocked(listCollaborations).mockResolvedValueOnce([]);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'GET', `/agents/${AGENT_ID}/collaborations`, {
      headers: authHeaders,
    });

    expect(status).toBe(200);
    expect(body.collaborations).toHaveLength(0);
  });

  it('returns 404 when agent not found', async () => {
    const { listCollaborations } = await import('./collaboration.service.js');
    vi.mocked(listCollaborations).mockRejectedValueOnce(
      Object.assign(new Error('Agent not found'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'GET', `/agents/${AGENT_ID}/collaborations`, {
      headers: authHeaders,
    });

    expect(status).toBe(404);
    expect(body.error).toBe('Not found');
  });

  it('passes status filter to service', async () => {
    const { listCollaborations } = await import('./collaboration.service.js');
    vi.mocked(listCollaborations).mockResolvedValueOnce([]);

    const authHeaders = await getTokenHeader();
    await request(app, 'GET', `/agents/${AGENT_ID}/collaborations?status=completed`, {
      headers: authHeaders,
    });

    expect(vi.mocked(listCollaborations)).toHaveBeenCalledWith(
      AGENT_ID,
      expect.any(String),
      expect.objectContaining({ status: 'completed' }),
    );
  });

  it('passes direction filter to service', async () => {
    const { listCollaborations } = await import('./collaboration.service.js');
    vi.mocked(listCollaborations).mockResolvedValueOnce([]);

    const authHeaders = await getTokenHeader();
    await request(app, 'GET', `/agents/${AGENT_ID}/collaborations?direction=sent`, {
      headers: authHeaders,
    });

    expect(vi.mocked(listCollaborations)).toHaveBeenCalledWith(
      AGENT_ID,
      expect.any(String),
      expect.objectContaining({ direction: 'sent' }),
    );
  });
});

/* -------------------------------------------------------------------------- */
/*  GET /agents/:agentId/collaborations/:id                                    */
/* -------------------------------------------------------------------------- */

describe('GET /agents/:agentId/collaborations/:id', () => {
  it('returns 200 with collaboration data', async () => {
    const { getCollaboration } = await import('./collaboration.service.js');
    vi.mocked(getCollaboration).mockResolvedValueOnce({
      id: COLLAB_ID,
      status: 'pending',
      task_description: 'Test',
    } as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'GET',
      `/agents/${AGENT_ID}/collaborations/${COLLAB_ID}`,
      { headers: authHeaders },
    );

    expect(status).toBe(200);
    expect(body.collaboration.id).toBe(COLLAB_ID);
  });

  it('returns 404 for non-existent collaboration', async () => {
    const { getCollaboration } = await import('./collaboration.service.js');
    vi.mocked(getCollaboration).mockRejectedValueOnce(
      Object.assign(new Error('Collaboration not found'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'GET',
      `/agents/${AGENT_ID}/collaborations/nonexistent`,
      { headers: authHeaders },
    );

    expect(status).toBe(404);
    expect(body.error).toBe('Not found');
  });
});

/* -------------------------------------------------------------------------- */
/*  PATCH /agents/:agentId/collaborations/:id/accept                           */
/* -------------------------------------------------------------------------- */

describe('PATCH /agents/:agentId/collaborations/:id/accept', () => {
  it('returns 200 with accepted collaboration', async () => {
    const { acceptCollaboration } = await import('./collaboration.service.js');
    vi.mocked(acceptCollaboration).mockResolvedValueOnce({
      id: COLLAB_ID,
      status: 'accepted',
    } as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'PATCH',
      `/agents/${AGENT_ID}/collaborations/${COLLAB_ID}/accept`,
      { headers: authHeaders },
    );

    expect(status).toBe(200);
    expect(body.collaboration.status).toBe('accepted');
  });

  it('returns 404 for non-existent collaboration', async () => {
    const { acceptCollaboration } = await import('./collaboration.service.js');
    vi.mocked(acceptCollaboration).mockRejectedValueOnce(
      Object.assign(new Error('Collaboration not found'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status } = await request(
      app,
      'PATCH',
      `/agents/${AGENT_ID}/collaborations/nonexistent/accept`,
      { headers: authHeaders },
    );

    expect(status).toBe(404);
  });

  it('returns 400 for invalid status transition', async () => {
    const { acceptCollaboration } = await import('./collaboration.service.js');
    vi.mocked(acceptCollaboration).mockRejectedValueOnce(
      Object.assign(new Error('Cannot accept'), { code: 'BAD_REQUEST' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'PATCH',
      `/agents/${AGENT_ID}/collaborations/${COLLAB_ID}/accept`,
      { headers: authHeaders },
    );

    expect(status).toBe(400);
    expect(body.error).toBe('Bad request');
  });

  it('returns 403 when non-owner tries to accept', async () => {
    const { acceptCollaboration } = await import('./collaboration.service.js');
    vi.mocked(acceptCollaboration).mockRejectedValueOnce(
      Object.assign(new Error('Only the responder agent owner can accept'), { code: 'FORBIDDEN' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'PATCH',
      `/agents/${AGENT_ID}/collaborations/${COLLAB_ID}/accept`,
      { headers: authHeaders },
    );

    expect(status).toBe(403);
    expect(body.error).toBe('Forbidden');
  });
});

/* -------------------------------------------------------------------------- */
/*  PATCH /agents/:agentId/collaborations/:id/complete                         */
/* -------------------------------------------------------------------------- */

describe('PATCH /agents/:agentId/collaborations/:id/complete', () => {
  it('returns 200 with completed collaboration', async () => {
    const { completeCollaboration } = await import('./collaboration.service.js');
    vi.mocked(completeCollaboration).mockResolvedValueOnce({
      id: COLLAB_ID,
      status: 'completed',
      task_result: 'Analysis done',
    } as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'PATCH',
      `/agents/${AGENT_ID}/collaborations/${COLLAB_ID}/complete`,
      {
        headers: authHeaders,
        body: { result: 'Analysis done' },
      },
    );

    expect(status).toBe(200);
    expect(body.collaboration.status).toBe('completed');
    expect(body.collaboration.task_result).toBe('Analysis done');
  });

  it('returns 422 for missing result', async () => {
    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'PATCH',
      `/agents/${AGENT_ID}/collaborations/${COLLAB_ID}/complete`,
      {
        headers: authHeaders,
        body: {},
      },
    );

    expect(status).toBe(422);
    expect(body.error).toBe('Validation error');
  });

  it('returns 422 for empty result', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(
      app,
      'PATCH',
      `/agents/${AGENT_ID}/collaborations/${COLLAB_ID}/complete`,
      {
        headers: authHeaders,
        body: { result: '' },
      },
    );

    expect(status).toBe(422);
  });

  it('returns 400 for invalid status transition', async () => {
    const { completeCollaboration } = await import('./collaboration.service.js');
    vi.mocked(completeCollaboration).mockRejectedValueOnce(
      Object.assign(new Error('Cannot complete'), { code: 'BAD_REQUEST' }),
    );

    const authHeaders = await getTokenHeader();
    const { status } = await request(
      app,
      'PATCH',
      `/agents/${AGENT_ID}/collaborations/${COLLAB_ID}/complete`,
      {
        headers: authHeaders,
        body: { result: 'Done' },
      },
    );

    expect(status).toBe(400);
  });

  it('returns 403 when non-owner tries to complete', async () => {
    const { completeCollaboration } = await import('./collaboration.service.js');
    vi.mocked(completeCollaboration).mockRejectedValueOnce(
      Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' }),
    );

    const authHeaders = await getTokenHeader();
    const { status } = await request(
      app,
      'PATCH',
      `/agents/${AGENT_ID}/collaborations/${COLLAB_ID}/complete`,
      {
        headers: authHeaders,
        body: { result: 'Done' },
      },
    );

    expect(status).toBe(403);
  });

  it('returns 422 for invalid JSON body', async () => {
    const authHeaders = await getTokenHeader();
    const res = await app.fetch(
      new Request(`http://localhost/agents/${AGENT_ID}/collaborations/${COLLAB_ID}/complete`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: 'not-json',
      }),
    );
    expect(res.status).toBe(422);
  });
});

/* -------------------------------------------------------------------------- */
/*  PATCH /agents/:agentId/collaborations/:id/reject                           */
/* -------------------------------------------------------------------------- */

describe('PATCH /agents/:agentId/collaborations/:id/reject', () => {
  it('returns 200 with rejected collaboration', async () => {
    const { rejectCollaboration } = await import('./collaboration.service.js');
    vi.mocked(rejectCollaboration).mockResolvedValueOnce({
      id: COLLAB_ID,
      status: 'rejected',
      task_result: 'Not my area',
    } as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'PATCH',
      `/agents/${AGENT_ID}/collaborations/${COLLAB_ID}/reject`,
      {
        headers: authHeaders,
        body: { reason: 'Not my area' },
      },
    );

    expect(status).toBe(200);
    expect(body.collaboration.status).toBe('rejected');
  });

  it('returns 422 for missing reason', async () => {
    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'PATCH',
      `/agents/${AGENT_ID}/collaborations/${COLLAB_ID}/reject`,
      {
        headers: authHeaders,
        body: {},
      },
    );

    expect(status).toBe(422);
    expect(body.error).toBe('Validation error');
  });

  it('returns 422 for empty reason', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(
      app,
      'PATCH',
      `/agents/${AGENT_ID}/collaborations/${COLLAB_ID}/reject`,
      {
        headers: authHeaders,
        body: { reason: '' },
      },
    );

    expect(status).toBe(422);
  });

  it('returns 400 for invalid status transition', async () => {
    const { rejectCollaboration } = await import('./collaboration.service.js');
    vi.mocked(rejectCollaboration).mockRejectedValueOnce(
      Object.assign(new Error('Cannot reject'), { code: 'BAD_REQUEST' }),
    );

    const authHeaders = await getTokenHeader();
    const { status } = await request(
      app,
      'PATCH',
      `/agents/${AGENT_ID}/collaborations/${COLLAB_ID}/reject`,
      {
        headers: authHeaders,
        body: { reason: 'No' },
      },
    );

    expect(status).toBe(400);
  });

  it('returns 403 when non-owner tries to reject', async () => {
    const { rejectCollaboration } = await import('./collaboration.service.js');
    vi.mocked(rejectCollaboration).mockRejectedValueOnce(
      Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' }),
    );

    const authHeaders = await getTokenHeader();
    const { status } = await request(
      app,
      'PATCH',
      `/agents/${AGENT_ID}/collaborations/${COLLAB_ID}/reject`,
      {
        headers: authHeaders,
        body: { reason: 'No' },
      },
    );

    expect(status).toBe(403);
  });

  it('strips HTML from reason', async () => {
    const { rejectCollaboration } = await import('./collaboration.service.js');
    vi.mocked(rejectCollaboration).mockResolvedValueOnce({
      id: COLLAB_ID,
      status: 'rejected',
    } as any);

    const authHeaders = await getTokenHeader();
    await request(app, 'PATCH', `/agents/${AGENT_ID}/collaborations/${COLLAB_ID}/reject`, {
      headers: authHeaders,
      body: { reason: '<b>No</b>' },
    });

    expect(vi.mocked(rejectCollaboration)).toHaveBeenCalledWith(
      COLLAB_ID,
      expect.any(String),
      'No',
    );
  });

  it('returns 422 for invalid JSON body', async () => {
    const authHeaders = await getTokenHeader();
    const res = await app.fetch(
      new Request(`http://localhost/agents/${AGENT_ID}/collaborations/${COLLAB_ID}/reject`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: 'not-json',
      }),
    );
    expect(res.status).toBe(422);
  });
});

/* -------------------------------------------------------------------------- */
/*  GET /agents/discover                                                       */
/* -------------------------------------------------------------------------- */

describe('GET /agents/discover', () => {
  it('returns 200 with matching agents', async () => {
    const { discoverAgents } = await import('./collaboration.service.js');
    vi.mocked(discoverAgents).mockResolvedValueOnce([
      {
        id: RESPONDER_AGENT_ID,
        name: 'Data Analyst',
        slug: 'data-analyst',
        description: 'Analyzes data',
        category: 'analytics',
        visibility: 'public',
        usage_count: 100,
        rating_sum: 45,
        rating_count: 10,
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ] as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'GET', '/agents/discover?capability=data', {
      headers: authHeaders,
    });

    expect(status).toBe(200);
    expect(body.agents).toHaveLength(1);
    expect(body.agents[0].name).toBe('Data Analyst');
  });

  it('returns 200 with empty array when no matches', async () => {
    const { discoverAgents } = await import('./collaboration.service.js');
    vi.mocked(discoverAgents).mockResolvedValueOnce([]);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'GET', '/agents/discover?capability=nonexistent', {
      headers: authHeaders,
    });

    expect(status).toBe(200);
    expect(body.agents).toHaveLength(0);
  });

  it('returns 422 for missing capability param', async () => {
    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'GET', '/agents/discover', {
      headers: authHeaders,
    });

    expect(status).toBe(422);
    expect(body.error).toBe('Validation error');
  });

  it('returns 422 for empty capability param', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'GET', '/agents/discover?capability=', {
      headers: authHeaders,
    });

    expect(status).toBe(422);
  });

  it('passes limit query param to service', async () => {
    const { discoverAgents } = await import('./collaboration.service.js');
    vi.mocked(discoverAgents).mockResolvedValueOnce([]);

    const authHeaders = await getTokenHeader();
    await request(app, 'GET', '/agents/discover?capability=data&limit=5', {
      headers: authHeaders,
    });

    expect(vi.mocked(discoverAgents)).toHaveBeenCalledWith('data', expect.any(String), 5);
  });
});
