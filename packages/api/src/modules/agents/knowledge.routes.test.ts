/* eslint-disable @typescript-eslint/no-explicit-any */
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { knowledgeRoutes } from './knowledge.routes.js';

// Mock DB connection
vi.mock('../../db/connection.js', () => ({
  sql: Object.assign(vi.fn(), { unsafe: vi.fn() }),
  db: {},
}));

// Mock knowledge service
vi.mock('./knowledge.service.js', () => ({
  createNode: vi.fn(),
  listNodes: vi.fn(),
  getNode: vi.fn(),
  updateNode: vi.fn(),
  deleteNode: vi.fn(),
  createEdge: vi.fn(),
  listEdges: vi.fn(),
  deleteEdge: vi.fn(),
  getNeighbors: vi.fn(),
  findPaths: vi.fn(),
}));

async function getTokenHeader(): Promise<Record<string, string>> {
  const { generateTokens } = await import('../auth/auth.service.js');
  const { access_token } = await generateTokens('user-uuid', 'user');
  return { Authorization: `Bearer ${access_token}` };
}

function buildApp() {
  const app = new Hono();
  app.route('/agents', knowledgeRoutes);
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
const NODE_ID = 'aa0e8400-e29b-41d4-a716-446655440010';
const NODE_ID_2 = 'aa0e8400-e29b-41d4-a716-446655440011';
const EDGE_ID = 'cc0e8400-e29b-41d4-a716-446655440020';

/* -------------------------------------------------------------------------- */
/*  Authentication                                                            */
/* -------------------------------------------------------------------------- */

describe('Knowledge Routes — Authentication', () => {
  it('POST /agents/:agentId/knowledge/nodes returns 401 without auth', async () => {
    const { status, body } = await request(app, 'POST', `/agents/${AGENT_ID}/knowledge/nodes`, {
      body: { label: 'Person', name: 'Alice' },
    });
    expect(status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('GET /agents/:agentId/knowledge/nodes returns 401 without auth', async () => {
    const { status } = await request(app, 'GET', `/agents/${AGENT_ID}/knowledge/nodes`);
    expect(status).toBe(401);
  });

  it('GET /agents/:agentId/knowledge/nodes/:nodeId returns 401 without auth', async () => {
    const { status } = await request(app, 'GET', `/agents/${AGENT_ID}/knowledge/nodes/${NODE_ID}`);
    expect(status).toBe(401);
  });

  it('PATCH /agents/:agentId/knowledge/nodes/:nodeId returns 401 without auth', async () => {
    const { status } = await request(
      app,
      'PATCH',
      `/agents/${AGENT_ID}/knowledge/nodes/${NODE_ID}`,
      {
        body: { name: 'Bob' },
      },
    );
    expect(status).toBe(401);
  });

  it('DELETE /agents/:agentId/knowledge/nodes/:nodeId returns 401 without auth', async () => {
    const { status } = await request(
      app,
      'DELETE',
      `/agents/${AGENT_ID}/knowledge/nodes/${NODE_ID}`,
    );
    expect(status).toBe(401);
  });

  it('POST /agents/:agentId/knowledge/edges returns 401 without auth', async () => {
    const { status } = await request(app, 'POST', `/agents/${AGENT_ID}/knowledge/edges`, {
      body: { source_node_id: NODE_ID, target_node_id: NODE_ID_2, relationship: 'knows' },
    });
    expect(status).toBe(401);
  });

  it('GET /agents/:agentId/knowledge/edges returns 401 without auth', async () => {
    const { status } = await request(app, 'GET', `/agents/${AGENT_ID}/knowledge/edges`);
    expect(status).toBe(401);
  });

  it('DELETE /agents/:agentId/knowledge/edges/:edgeId returns 401 without auth', async () => {
    const { status } = await request(
      app,
      'DELETE',
      `/agents/${AGENT_ID}/knowledge/edges/${EDGE_ID}`,
    );
    expect(status).toBe(401);
  });

  it('GET neighbors returns 401 without auth', async () => {
    const { status } = await request(
      app,
      'GET',
      `/agents/${AGENT_ID}/knowledge/nodes/${NODE_ID}/neighbors`,
    );
    expect(status).toBe(401);
  });

  it('GET paths returns 401 without auth', async () => {
    const { status } = await request(
      app,
      'GET',
      `/agents/${AGENT_ID}/knowledge/paths?source=${NODE_ID}&target=${NODE_ID_2}`,
    );
    expect(status).toBe(401);
  });

  it('rejects invalid auth token with 401', async () => {
    const { status } = await request(app, 'GET', `/agents/${AGENT_ID}/knowledge/nodes`, {
      headers: { Authorization: 'Bearer invalid.token.here' },
    });
    expect(status).toBe(401);
  });
});

/* -------------------------------------------------------------------------- */
/*  POST /agents/:agentId/knowledge/nodes                                     */
/* -------------------------------------------------------------------------- */

describe('POST /agents/:agentId/knowledge/nodes', () => {
  it('returns 201 with created node', async () => {
    const { createNode } = await import('./knowledge.service.js');
    vi.mocked(createNode).mockResolvedValueOnce({
      id: NODE_ID,
      agent_id: AGENT_ID,
      user_id: 'user-uuid',
      label: 'Person',
      name: 'Alice',
      description: null,
      properties: {},
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    } as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'POST', `/agents/${AGENT_ID}/knowledge/nodes`, {
      headers: authHeaders,
      body: { label: 'Person', name: 'Alice' },
    });

    expect(status).toBe(201);
    expect(body.node.name).toBe('Alice');
    expect(body.node.label).toBe('Person');
  });

  it('returns 422 for missing label', async () => {
    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'POST', `/agents/${AGENT_ID}/knowledge/nodes`, {
      headers: authHeaders,
      body: { name: 'Alice' },
    });

    expect(status).toBe(422);
    expect(body.error).toBe('Validation error');
  });

  it('returns 422 for missing name', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'POST', `/agents/${AGENT_ID}/knowledge/nodes`, {
      headers: authHeaders,
      body: { label: 'Person' },
    });

    expect(status).toBe(422);
  });

  it('returns 422 for name exceeding 200 characters', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'POST', `/agents/${AGENT_ID}/knowledge/nodes`, {
      headers: authHeaders,
      body: { label: 'Person', name: 'a'.repeat(201) },
    });

    expect(status).toBe(422);
  });

  it('returns 422 for description exceeding 2000 characters', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'POST', `/agents/${AGENT_ID}/knowledge/nodes`, {
      headers: authHeaders,
      body: { label: 'Person', name: 'Alice', description: 'a'.repeat(2001) },
    });

    expect(status).toBe(422);
  });

  it('returns 404 when agent not found from service', async () => {
    const { createNode } = await import('./knowledge.service.js');
    vi.mocked(createNode).mockRejectedValueOnce(
      Object.assign(new Error('Agent not found'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'POST', `/agents/${AGENT_ID}/knowledge/nodes`, {
      headers: authHeaders,
      body: { label: 'Person', name: 'Alice' },
    });

    expect(status).toBe(404);
    expect(body.error).toBe('Not found');
  });

  it('strips HTML from label and name', async () => {
    const { createNode } = await import('./knowledge.service.js');
    vi.mocked(createNode).mockResolvedValueOnce({
      id: NODE_ID,
      label: 'Person',
      name: 'alert(1)',
    } as any);

    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'POST', `/agents/${AGENT_ID}/knowledge/nodes`, {
      headers: authHeaders,
      body: { label: '<b>Person</b>', name: '<script>alert(1)</script>' },
    });

    expect(status).toBe(201);
    expect(vi.mocked(createNode)).toHaveBeenCalledWith(
      AGENT_ID,
      expect.any(String),
      expect.objectContaining({ label: 'Person', name: 'alert(1)' }),
    );
  });

  it('returns 422 for invalid JSON body', async () => {
    const authHeaders = await getTokenHeader();
    const res = await app.fetch(
      new Request(`http://localhost/agents/${AGENT_ID}/knowledge/nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: 'not-json',
      }),
    );
    expect(res.status).toBe(422);
  });
});

/* -------------------------------------------------------------------------- */
/*  GET /agents/:agentId/knowledge/nodes                                      */
/* -------------------------------------------------------------------------- */

describe('GET /agents/:agentId/knowledge/nodes', () => {
  it('returns 200 with nodes list', async () => {
    const { listNodes } = await import('./knowledge.service.js');
    vi.mocked(listNodes).mockResolvedValueOnce([
      {
        id: NODE_ID,
        agent_id: AGENT_ID,
        user_id: 'user-uuid',
        label: 'Person',
        name: 'Alice',
        description: null,
        properties: {},
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'GET', `/agents/${AGENT_ID}/knowledge/nodes`, {
      headers: authHeaders,
    });

    expect(status).toBe(200);
    expect(body.nodes).toHaveLength(1);
    expect(body.nodes[0].name).toBe('Alice');
  });

  it('returns 200 with empty list', async () => {
    const { listNodes } = await import('./knowledge.service.js');
    vi.mocked(listNodes).mockResolvedValueOnce([]);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'GET', `/agents/${AGENT_ID}/knowledge/nodes`, {
      headers: authHeaders,
    });

    expect(status).toBe(200);
    expect(body.nodes).toHaveLength(0);
  });

  it('returns 404 when agent not found', async () => {
    const { listNodes } = await import('./knowledge.service.js');
    vi.mocked(listNodes).mockRejectedValueOnce(
      Object.assign(new Error('Agent not found'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'GET', `/agents/${AGENT_ID}/knowledge/nodes`, {
      headers: authHeaders,
    });

    expect(status).toBe(404);
    expect(body.error).toBe('Not found');
  });

  it('passes query params to service', async () => {
    const { listNodes } = await import('./knowledge.service.js');
    vi.mocked(listNodes).mockResolvedValueOnce([]);

    const authHeaders = await getTokenHeader();
    await request(app, 'GET', `/agents/${AGENT_ID}/knowledge/nodes?label=Person&search=Ali`, {
      headers: authHeaders,
    });

    expect(vi.mocked(listNodes)).toHaveBeenCalledWith(AGENT_ID, 'user-uuid', {
      label: 'Person',
      search: 'Ali',
      limit: undefined,
      offset: undefined,
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  GET /agents/:agentId/knowledge/nodes/:nodeId                              */
/* -------------------------------------------------------------------------- */

describe('GET /agents/:agentId/knowledge/nodes/:nodeId', () => {
  it('returns 200 with node data', async () => {
    const { getNode } = await import('./knowledge.service.js');
    vi.mocked(getNode).mockResolvedValueOnce({
      id: NODE_ID,
      label: 'Person',
      name: 'Alice',
    } as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'GET',
      `/agents/${AGENT_ID}/knowledge/nodes/${NODE_ID}`,
      { headers: authHeaders },
    );

    expect(status).toBe(200);
    expect(body.node.name).toBe('Alice');
  });

  it('returns 404 for non-existent node', async () => {
    const { getNode } = await import('./knowledge.service.js');
    vi.mocked(getNode).mockRejectedValueOnce(
      Object.assign(new Error('Node not found'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'GET',
      `/agents/${AGENT_ID}/knowledge/nodes/nonexistent`,
      { headers: authHeaders },
    );

    expect(status).toBe(404);
    expect(body.error).toBe('Not found');
  });
});

/* -------------------------------------------------------------------------- */
/*  PATCH /agents/:agentId/knowledge/nodes/:nodeId                            */
/* -------------------------------------------------------------------------- */

describe('PATCH /agents/:agentId/knowledge/nodes/:nodeId', () => {
  it('returns 200 with updated node', async () => {
    const { updateNode } = await import('./knowledge.service.js');
    vi.mocked(updateNode).mockResolvedValueOnce({
      id: NODE_ID,
      name: 'Bob',
    } as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'PATCH',
      `/agents/${AGENT_ID}/knowledge/nodes/${NODE_ID}`,
      {
        headers: authHeaders,
        body: { name: 'Bob' },
      },
    );

    expect(status).toBe(200);
    expect(body.node.name).toBe('Bob');
  });

  it('returns 422 for name exceeding 200 characters in update', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(
      app,
      'PATCH',
      `/agents/${AGENT_ID}/knowledge/nodes/${NODE_ID}`,
      {
        headers: authHeaders,
        body: { name: 'a'.repeat(201) },
      },
    );

    expect(status).toBe(422);
  });

  it('returns 404 when node not found', async () => {
    const { updateNode } = await import('./knowledge.service.js');
    vi.mocked(updateNode).mockRejectedValueOnce(
      Object.assign(new Error('Node not found'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'PATCH',
      `/agents/${AGENT_ID}/knowledge/nodes/nonexistent`,
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
      new Request(`http://localhost/agents/${AGENT_ID}/knowledge/nodes/${NODE_ID}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: 'not-json',
      }),
    );
    expect(res.status).toBe(422);
  });
});

/* -------------------------------------------------------------------------- */
/*  DELETE /agents/:agentId/knowledge/nodes/:nodeId                           */
/* -------------------------------------------------------------------------- */

describe('DELETE /agents/:agentId/knowledge/nodes/:nodeId', () => {
  it('returns 200 with ok true', async () => {
    const { deleteNode } = await import('./knowledge.service.js');
    vi.mocked(deleteNode).mockResolvedValueOnce(undefined);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'DELETE',
      `/agents/${AGENT_ID}/knowledge/nodes/${NODE_ID}`,
      { headers: authHeaders },
    );

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it('returns 404 for non-existent node', async () => {
    const { deleteNode } = await import('./knowledge.service.js');
    vi.mocked(deleteNode).mockRejectedValueOnce(
      Object.assign(new Error('Node not found'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'DELETE',
      `/agents/${AGENT_ID}/knowledge/nodes/nonexistent`,
      { headers: authHeaders },
    );

    expect(status).toBe(404);
    expect(body.error).toBe('Not found');
  });
});

/* -------------------------------------------------------------------------- */
/*  POST /agents/:agentId/knowledge/edges                                     */
/* -------------------------------------------------------------------------- */

describe('POST /agents/:agentId/knowledge/edges', () => {
  it('returns 201 with created edge', async () => {
    const { createEdge } = await import('./knowledge.service.js');
    vi.mocked(createEdge).mockResolvedValueOnce({
      id: EDGE_ID,
      agent_id: AGENT_ID,
      user_id: 'user-uuid',
      source_node_id: NODE_ID,
      target_node_id: NODE_ID_2,
      relationship: 'knows',
      weight: 1.0,
      properties: {},
      created_at: '2026-01-01T00:00:00.000Z',
    } as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'POST', `/agents/${AGENT_ID}/knowledge/edges`, {
      headers: authHeaders,
      body: {
        source_node_id: NODE_ID,
        target_node_id: NODE_ID_2,
        relationship: 'knows',
      },
    });

    expect(status).toBe(201);
    expect(body.edge.relationship).toBe('knows');
  });

  it('returns 422 for missing source_node_id', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'POST', `/agents/${AGENT_ID}/knowledge/edges`, {
      headers: authHeaders,
      body: { target_node_id: NODE_ID_2, relationship: 'knows' },
    });

    expect(status).toBe(422);
  });

  it('returns 422 for missing target_node_id', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'POST', `/agents/${AGENT_ID}/knowledge/edges`, {
      headers: authHeaders,
      body: { source_node_id: NODE_ID, relationship: 'knows' },
    });

    expect(status).toBe(422);
  });

  it('returns 422 for missing relationship', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'POST', `/agents/${AGENT_ID}/knowledge/edges`, {
      headers: authHeaders,
      body: { source_node_id: NODE_ID, target_node_id: NODE_ID_2 },
    });

    expect(status).toBe(422);
  });

  it('returns 422 for invalid source_node_id (not uuid)', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'POST', `/agents/${AGENT_ID}/knowledge/edges`, {
      headers: authHeaders,
      body: { source_node_id: 'not-a-uuid', target_node_id: NODE_ID_2, relationship: 'knows' },
    });

    expect(status).toBe(422);
  });

  it('returns 422 for weight out of range', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'POST', `/agents/${AGENT_ID}/knowledge/edges`, {
      headers: authHeaders,
      body: {
        source_node_id: NODE_ID,
        target_node_id: NODE_ID_2,
        relationship: 'knows',
        weight: 11,
      },
    });

    expect(status).toBe(422);
  });

  it('returns 404 when source node not found from service', async () => {
    const { createEdge } = await import('./knowledge.service.js');
    vi.mocked(createEdge).mockRejectedValueOnce(
      Object.assign(new Error('Source node not found'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'POST', `/agents/${AGENT_ID}/knowledge/edges`, {
      headers: authHeaders,
      body: {
        source_node_id: NODE_ID,
        target_node_id: NODE_ID_2,
        relationship: 'knows',
      },
    });

    expect(status).toBe(404);
    expect(body.error).toBe('Not found');
  });

  it('returns 422 for relationship exceeding 100 characters', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'POST', `/agents/${AGENT_ID}/knowledge/edges`, {
      headers: authHeaders,
      body: {
        source_node_id: NODE_ID,
        target_node_id: NODE_ID_2,
        relationship: 'a'.repeat(101),
      },
    });

    expect(status).toBe(422);
  });
});

/* -------------------------------------------------------------------------- */
/*  GET /agents/:agentId/knowledge/edges                                      */
/* -------------------------------------------------------------------------- */

describe('GET /agents/:agentId/knowledge/edges', () => {
  it('returns 200 with edges list', async () => {
    const { listEdges } = await import('./knowledge.service.js');
    vi.mocked(listEdges).mockResolvedValueOnce([
      {
        id: EDGE_ID,
        agent_id: AGENT_ID,
        user_id: 'user-uuid',
        source_node_id: NODE_ID,
        target_node_id: NODE_ID_2,
        relationship: 'knows',
        weight: 1.0,
        properties: {},
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'GET', `/agents/${AGENT_ID}/knowledge/edges`, {
      headers: authHeaders,
    });

    expect(status).toBe(200);
    expect(body.edges).toHaveLength(1);
    expect(body.edges[0].relationship).toBe('knows');
  });

  it('passes query params to service', async () => {
    const { listEdges } = await import('./knowledge.service.js');
    vi.mocked(listEdges).mockResolvedValueOnce([]);

    const authHeaders = await getTokenHeader();
    await request(
      app,
      'GET',
      `/agents/${AGENT_ID}/knowledge/edges?relationship=knows&node_id=${NODE_ID}`,
      { headers: authHeaders },
    );

    expect(vi.mocked(listEdges)).toHaveBeenCalledWith(AGENT_ID, 'user-uuid', {
      relationship: 'knows',
      nodeId: NODE_ID,
      limit: undefined,
      offset: undefined,
    });
  });

  it('returns 404 when agent not found', async () => {
    const { listEdges } = await import('./knowledge.service.js');
    vi.mocked(listEdges).mockRejectedValueOnce(
      Object.assign(new Error('Agent not found'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'GET', `/agents/${AGENT_ID}/knowledge/edges`, {
      headers: authHeaders,
    });

    expect(status).toBe(404);
    expect(body.error).toBe('Not found');
  });
});

/* -------------------------------------------------------------------------- */
/*  DELETE /agents/:agentId/knowledge/edges/:edgeId                           */
/* -------------------------------------------------------------------------- */

describe('DELETE /agents/:agentId/knowledge/edges/:edgeId', () => {
  it('returns 200 with ok true', async () => {
    const { deleteEdge } = await import('./knowledge.service.js');
    vi.mocked(deleteEdge).mockResolvedValueOnce(undefined);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'DELETE',
      `/agents/${AGENT_ID}/knowledge/edges/${EDGE_ID}`,
      { headers: authHeaders },
    );

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it('returns 404 for non-existent edge', async () => {
    const { deleteEdge } = await import('./knowledge.service.js');
    vi.mocked(deleteEdge).mockRejectedValueOnce(
      Object.assign(new Error('Edge not found'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'DELETE',
      `/agents/${AGENT_ID}/knowledge/edges/nonexistent`,
      { headers: authHeaders },
    );

    expect(status).toBe(404);
    expect(body.error).toBe('Not found');
  });
});

/* -------------------------------------------------------------------------- */
/*  GET /agents/:agentId/knowledge/nodes/:nodeId/neighbors                    */
/* -------------------------------------------------------------------------- */

describe('GET /agents/:agentId/knowledge/nodes/:nodeId/neighbors', () => {
  it('returns 200 with neighbors', async () => {
    const { getNeighbors } = await import('./knowledge.service.js');
    vi.mocked(getNeighbors).mockResolvedValueOnce([
      {
        node: { id: NODE_ID_2, name: 'Bob' } as any,
        edge: { id: EDGE_ID, relationship: 'knows' } as any,
        depth: 1,
      },
    ]);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'GET',
      `/agents/${AGENT_ID}/knowledge/nodes/${NODE_ID}/neighbors`,
      { headers: authHeaders },
    );

    expect(status).toBe(200);
    expect(body.neighbors).toHaveLength(1);
    expect(body.neighbors[0].depth).toBe(1);
  });

  it('passes depth and direction to service', async () => {
    const { getNeighbors } = await import('./knowledge.service.js');
    vi.mocked(getNeighbors).mockResolvedValueOnce([]);

    const authHeaders = await getTokenHeader();
    await request(
      app,
      'GET',
      `/agents/${AGENT_ID}/knowledge/nodes/${NODE_ID}/neighbors?depth=2&direction=out`,
      { headers: authHeaders },
    );

    expect(vi.mocked(getNeighbors)).toHaveBeenCalledWith(NODE_ID, 'user-uuid', {
      depth: 2,
      direction: 'out',
    });
  });

  it('returns 404 when node not found', async () => {
    const { getNeighbors } = await import('./knowledge.service.js');
    vi.mocked(getNeighbors).mockRejectedValueOnce(
      Object.assign(new Error('Node not found'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'GET',
      `/agents/${AGENT_ID}/knowledge/nodes/nonexistent/neighbors`,
      { headers: authHeaders },
    );

    expect(status).toBe(404);
    expect(body.error).toBe('Not found');
  });

  it('returns 422 for invalid direction', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(
      app,
      'GET',
      `/agents/${AGENT_ID}/knowledge/nodes/${NODE_ID}/neighbors?direction=invalid`,
      { headers: authHeaders },
    );

    expect(status).toBe(422);
  });
});

/* -------------------------------------------------------------------------- */
/*  GET /agents/:agentId/knowledge/paths                                      */
/* -------------------------------------------------------------------------- */

describe('GET /agents/:agentId/knowledge/paths', () => {
  it('returns 200 with paths', async () => {
    const { findPaths } = await import('./knowledge.service.js');
    vi.mocked(findPaths).mockResolvedValueOnce([
      {
        nodes: [{ id: NODE_ID } as any, { id: NODE_ID_2 } as any],
        edges: [{ id: EDGE_ID } as any],
        total_weight: 1.0,
      },
    ]);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'GET',
      `/agents/${AGENT_ID}/knowledge/paths?source=${NODE_ID}&target=${NODE_ID_2}`,
      { headers: authHeaders },
    );

    expect(status).toBe(200);
    expect(body.paths).toHaveLength(1);
    expect(body.paths[0].total_weight).toBe(1.0);
  });

  it('passes max_depth to service', async () => {
    const { findPaths } = await import('./knowledge.service.js');
    vi.mocked(findPaths).mockResolvedValueOnce([]);

    const authHeaders = await getTokenHeader();
    await request(
      app,
      'GET',
      `/agents/${AGENT_ID}/knowledge/paths?source=${NODE_ID}&target=${NODE_ID_2}&max_depth=5`,
      { headers: authHeaders },
    );

    expect(vi.mocked(findPaths)).toHaveBeenCalledWith(NODE_ID, NODE_ID_2, 'user-uuid', 5);
  });

  it('returns 422 when source is missing', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(
      app,
      'GET',
      `/agents/${AGENT_ID}/knowledge/paths?target=${NODE_ID_2}`,
      { headers: authHeaders },
    );

    expect(status).toBe(422);
  });

  it('returns 422 when target is missing', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(
      app,
      'GET',
      `/agents/${AGENT_ID}/knowledge/paths?source=${NODE_ID}`,
      { headers: authHeaders },
    );

    expect(status).toBe(422);
  });

  it('returns 422 for non-uuid source', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(
      app,
      'GET',
      `/agents/${AGENT_ID}/knowledge/paths?source=not-a-uuid&target=${NODE_ID_2}`,
      { headers: authHeaders },
    );

    expect(status).toBe(422);
  });

  it('returns 404 when node not found', async () => {
    const { findPaths } = await import('./knowledge.service.js');
    vi.mocked(findPaths).mockRejectedValueOnce(
      Object.assign(new Error('Node not found'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'GET',
      `/agents/${AGENT_ID}/knowledge/paths?source=${NODE_ID}&target=${NODE_ID_2}`,
      { headers: authHeaders },
    );

    expect(status).toBe(404);
    expect(body.error).toBe('Not found');
  });
});
