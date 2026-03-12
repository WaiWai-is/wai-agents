/* eslint-disable @typescript-eslint/no-explicit-any */
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryRoutes } from './memory.routes.js';

// Mock DB connection
vi.mock('../../db/connection.js', () => ({
  sql: Object.assign(vi.fn(), { unsafe: vi.fn() }),
  db: {},
}));

// Mock memory service
vi.mock('./memory.service.js', () => ({
  listMemories: vi.fn(),
  createMemory: vi.fn(),
  getMemory: vi.fn(),
  updateMemory: vi.fn(),
  deleteMemory: vi.fn(),
  bulkDeleteMemories: vi.fn(),
  recallMemories: vi.fn(),
}));

// Mock memory-consolidation service
vi.mock('./memory-consolidation.service.js', () => ({
  consolidateMemories: vi.fn(),
  decayAgentMemories: vi.fn(),
  getMemoryStats: vi.fn(),
  softDeleteMemory: vi.fn(),
  recallMemoriesAdvanced: vi.fn(),
}));

// Mock emitter (used by routes for Socket.IO events)
vi.mock('../../ws/emitter.js', () => ({
  emitMemoryEvent: vi.fn(),
}));

async function getTokenHeader(): Promise<Record<string, string>> {
  const { generateTokens } = await import('../auth/auth.service.js');
  const { access_token } = await generateTokens('user-uuid', 'user');
  return { Authorization: `Bearer ${access_token}` };
}

function buildApp() {
  const app = new Hono();
  app.route('/agents', memoryRoutes);
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
const MEMORY_ID = 'bb0e8400-e29b-41d4-a716-446655440020';

/* -------------------------------------------------------------------------- */
/*  Authentication                                                            */
/* -------------------------------------------------------------------------- */

describe('Memory Routes — Authentication', () => {
  it('GET /agents/:agentId/memories returns 401 without auth', async () => {
    const { status, body } = await request(app, 'GET', `/agents/${AGENT_ID}/memories`);
    expect(status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('POST /agents/:agentId/memories returns 401 without auth', async () => {
    const { status } = await request(app, 'POST', `/agents/${AGENT_ID}/memories`, {
      body: { memory_type: 'fact', content: 'Test' },
    });
    expect(status).toBe(401);
  });

  it('GET /agents/:agentId/memories/:id returns 401 without auth', async () => {
    const { status } = await request(app, 'GET', `/agents/${AGENT_ID}/memories/${MEMORY_ID}`);
    expect(status).toBe(401);
  });

  it('PATCH /agents/:agentId/memories/:id returns 401 without auth', async () => {
    const { status } = await request(app, 'PATCH', `/agents/${AGENT_ID}/memories/${MEMORY_ID}`, {
      body: { content: 'Updated' },
    });
    expect(status).toBe(401);
  });

  it('DELETE /agents/:agentId/memories/:id returns 401 without auth', async () => {
    const { status } = await request(app, 'DELETE', `/agents/${AGENT_ID}/memories/${MEMORY_ID}`);
    expect(status).toBe(401);
  });

  it('DELETE /agents/:agentId/memories returns 401 without auth', async () => {
    const { status } = await request(app, 'DELETE', `/agents/${AGENT_ID}/memories`);
    expect(status).toBe(401);
  });

  it('GET /agents/:agentId/memories/recall returns 401 without auth', async () => {
    const { status } = await request(app, 'GET', `/agents/${AGENT_ID}/memories/recall`);
    expect(status).toBe(401);
  });

  it('rejects invalid auth token with 401', async () => {
    const { status } = await request(app, 'GET', `/agents/${AGENT_ID}/memories`, {
      headers: { Authorization: 'Bearer invalid.token.here' },
    });
    expect(status).toBe(401);
  });
});

/* -------------------------------------------------------------------------- */
/*  GET /agents/:agentId/memories                                             */
/* -------------------------------------------------------------------------- */

describe('GET /agents/:agentId/memories', () => {
  it('returns 200 with memories list', async () => {
    const { listMemories } = await import('./memory.service.js');
    vi.mocked(listMemories).mockResolvedValueOnce([
      {
        id: MEMORY_ID,
        agent_id: AGENT_ID,
        user_id: 'user-uuid',
        memory_type: 'fact',
        content: 'User likes dark mode',
        embedding_key: null,
        embedding_text: null,
        importance: 0.7,
        access_count: 0,
        last_accessed_at: null,
        source_conversation_id: null,
        source_message_id: null,
        expires_at: null,
        metadata: {},
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'GET', `/agents/${AGENT_ID}/memories`, {
      headers: authHeaders,
    });

    expect(status).toBe(200);
    expect(body.memories).toHaveLength(1);
    expect(body.memories[0].content).toBe('User likes dark mode');
  });

  it('returns 200 with empty list', async () => {
    const { listMemories } = await import('./memory.service.js');
    vi.mocked(listMemories).mockResolvedValueOnce([]);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'GET', `/agents/${AGENT_ID}/memories`, {
      headers: authHeaders,
    });

    expect(status).toBe(200);
    expect(body.memories).toHaveLength(0);
  });

  it('returns 404 when agent not found', async () => {
    const { listMemories } = await import('./memory.service.js');
    vi.mocked(listMemories).mockRejectedValueOnce(
      Object.assign(new Error('Agent not found'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'GET', `/agents/${AGENT_ID}/memories`, {
      headers: authHeaders,
    });

    expect(status).toBe(404);
    expect(body.error).toBe('Not found');
  });

  it('passes query params to service', async () => {
    const { listMemories } = await import('./memory.service.js');
    vi.mocked(listMemories).mockResolvedValueOnce([]);

    const authHeaders = await getTokenHeader();
    await request(
      app,
      'GET',
      `/agents/${AGENT_ID}/memories?type=preference&search=dark&minImportance=0.5`,
      { headers: authHeaders },
    );

    expect(vi.mocked(listMemories)).toHaveBeenCalledWith(AGENT_ID, 'user-uuid', {
      type: 'preference',
      search: 'dark',
      minImportance: 0.5,
      limit: undefined,
      offset: undefined,
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  POST /agents/:agentId/memories                                            */
/* -------------------------------------------------------------------------- */

describe('POST /agents/:agentId/memories', () => {
  it('returns 201 with created memory', async () => {
    const { createMemory } = await import('./memory.service.js');
    vi.mocked(createMemory).mockResolvedValueOnce({
      id: MEMORY_ID,
      agent_id: AGENT_ID,
      user_id: 'user-uuid',
      memory_type: 'fact',
      content: 'New memory',
      embedding_key: null,
      importance: 0.5,
      access_count: 0,
      last_accessed_at: null,
      expires_at: null,
      metadata: {},
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    } as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'POST', `/agents/${AGENT_ID}/memories`, {
      headers: authHeaders,
      body: { memory_type: 'fact', content: 'New memory' },
    });

    expect(status).toBe(201);
    expect(body.memory.content).toBe('New memory');
  });

  it('returns 422 for missing content', async () => {
    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'POST', `/agents/${AGENT_ID}/memories`, {
      headers: authHeaders,
      body: { memory_type: 'fact' },
    });

    expect(status).toBe(422);
    expect(body.error).toBe('Validation error');
  });

  it('returns 422 for missing memory_type', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'POST', `/agents/${AGENT_ID}/memories`, {
      headers: authHeaders,
      body: { content: 'Test' },
    });

    expect(status).toBe(422);
  });

  it('returns 422 for invalid memory_type', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'POST', `/agents/${AGENT_ID}/memories`, {
      headers: authHeaders,
      body: { memory_type: 'invalid', content: 'Test' },
    });

    expect(status).toBe(422);
  });

  it('returns 422 for content exceeding 10000 characters', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'POST', `/agents/${AGENT_ID}/memories`, {
      headers: authHeaders,
      body: { memory_type: 'fact', content: 'a'.repeat(10001) },
    });

    expect(status).toBe(422);
  });

  it('returns 422 for importance out of range', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'POST', `/agents/${AGENT_ID}/memories`, {
      headers: authHeaders,
      body: { memory_type: 'fact', content: 'Test', importance: 1.5 },
    });

    expect(status).toBe(422);
  });

  it('returns 422 for invalid JSON body', async () => {
    const authHeaders = await getTokenHeader();
    const res = await app.fetch(
      new Request(`http://localhost/agents/${AGENT_ID}/memories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: 'not-json',
      }),
    );
    expect(res.status).toBe(422);
  });

  it('returns 404 when agent not found from service', async () => {
    const { createMemory } = await import('./memory.service.js');
    vi.mocked(createMemory).mockRejectedValueOnce(
      Object.assign(new Error('Agent not found'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'POST', `/agents/${AGENT_ID}/memories`, {
      headers: authHeaders,
      body: { memory_type: 'fact', content: 'Test' },
    });

    expect(status).toBe(404);
    expect(body.error).toBe('Not found');
  });

  it('strips HTML from content', async () => {
    const { createMemory } = await import('./memory.service.js');
    vi.mocked(createMemory).mockResolvedValueOnce({
      id: MEMORY_ID,
      content: 'alert(1)',
    } as any);

    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'POST', `/agents/${AGENT_ID}/memories`, {
      headers: authHeaders,
      body: {
        memory_type: 'fact',
        content: '<script>alert(1)</script>',
      },
    });

    expect(status).toBe(201);
    expect(vi.mocked(createMemory)).toHaveBeenCalledWith(
      AGENT_ID,
      expect.any(String),
      expect.objectContaining({ content: 'alert(1)' }),
    );
  });

  it('creates memory with all valid memory types', async () => {
    const { createMemory } = await import('./memory.service.js');

    for (const memoryType of ['fact', 'preference', 'context', 'relationship']) {
      vi.mocked(createMemory).mockResolvedValueOnce({
        id: MEMORY_ID,
        memory_type: memoryType,
        content: `${memoryType} memory`,
      } as any);

      const authHeaders = await getTokenHeader();
      const { status } = await request(app, 'POST', `/agents/${AGENT_ID}/memories`, {
        headers: authHeaders,
        body: { memory_type: memoryType, content: `${memoryType} memory` },
      });

      expect(status).toBe(201);
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  GET /agents/:agentId/memories/recall                                      */
/* -------------------------------------------------------------------------- */

describe('GET /agents/:agentId/memories/recall', () => {
  it('returns 200 with recalled memories', async () => {
    const { recallMemories } = await import('./memory.service.js');
    vi.mocked(recallMemories).mockResolvedValueOnce([
      {
        id: MEMORY_ID,
        agent_id: AGENT_ID,
        user_id: 'user-uuid',
        memory_type: 'fact',
        content: 'Recalled memory',
        embedding_key: null,
        embedding_text: null,
        importance: 0.8,
        access_count: 1,
        last_accessed_at: '2026-01-02T00:00:00.000Z',
        source_conversation_id: null,
        source_message_id: null,
        expires_at: null,
        metadata: {},
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'GET',
      `/agents/${AGENT_ID}/memories/recall?query=test&limit=5`,
      { headers: authHeaders },
    );

    expect(status).toBe(200);
    expect(body.memories).toHaveLength(1);
    expect(body.memories[0].content).toBe('Recalled memory');
  });

  it('passes query and limit to service', async () => {
    const { recallMemories } = await import('./memory.service.js');
    vi.mocked(recallMemories).mockResolvedValueOnce([]);

    const authHeaders = await getTokenHeader();
    await request(app, 'GET', `/agents/${AGENT_ID}/memories/recall?query=dark+mode&limit=3`, {
      headers: authHeaders,
    });

    expect(vi.mocked(recallMemories)).toHaveBeenCalledWith(AGENT_ID, 'user-uuid', 'dark mode', 3);
  });

  it('works without query param', async () => {
    const { recallMemories } = await import('./memory.service.js');
    vi.mocked(recallMemories).mockResolvedValueOnce([]);

    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'GET', `/agents/${AGENT_ID}/memories/recall`, {
      headers: authHeaders,
    });

    expect(status).toBe(200);
  });

  it('returns 404 when agent not found', async () => {
    const { recallMemories } = await import('./memory.service.js');
    vi.mocked(recallMemories).mockRejectedValueOnce(
      Object.assign(new Error('Agent not found'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'GET', `/agents/${AGENT_ID}/memories/recall`, {
      headers: authHeaders,
    });

    expect(status).toBe(404);
    expect(body.error).toBe('Not found');
  });
});

/* -------------------------------------------------------------------------- */
/*  GET /agents/:agentId/memories/:id                                         */
/* -------------------------------------------------------------------------- */

describe('GET /agents/:agentId/memories/:id', () => {
  it('returns 200 with memory data', async () => {
    const { getMemory } = await import('./memory.service.js');
    vi.mocked(getMemory).mockResolvedValueOnce({
      id: MEMORY_ID,
      memory_type: 'fact',
      content: 'My Memory',
    } as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'GET',
      `/agents/${AGENT_ID}/memories/${MEMORY_ID}`,
      { headers: authHeaders },
    );

    expect(status).toBe(200);
    expect(body.memory.content).toBe('My Memory');
  });

  it('returns 404 for non-existent memory', async () => {
    const { getMemory } = await import('./memory.service.js');
    vi.mocked(getMemory).mockRejectedValueOnce(
      Object.assign(new Error('Memory not found'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'GET', `/agents/${AGENT_ID}/memories/nonexistent`, {
      headers: authHeaders,
    });

    expect(status).toBe(404);
    expect(body.error).toBe('Not found');
  });
});

/* -------------------------------------------------------------------------- */
/*  PATCH /agents/:agentId/memories/:id                                       */
/* -------------------------------------------------------------------------- */

describe('PATCH /agents/:agentId/memories/:id', () => {
  it('returns 200 with updated memory', async () => {
    const { updateMemory } = await import('./memory.service.js');
    vi.mocked(updateMemory).mockResolvedValueOnce({
      id: MEMORY_ID,
      content: 'Updated Content',
    } as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'PATCH',
      `/agents/${AGENT_ID}/memories/${MEMORY_ID}`,
      {
        headers: authHeaders,
        body: { content: 'Updated Content' },
      },
    );

    expect(status).toBe(200);
    expect(body.memory.content).toBe('Updated Content');
  });

  it('returns 422 for invalid importance in update', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'PATCH', `/agents/${AGENT_ID}/memories/${MEMORY_ID}`, {
      headers: authHeaders,
      body: { importance: 2.0 },
    });

    expect(status).toBe(422);
  });

  it('returns 404 when memory not found', async () => {
    const { updateMemory } = await import('./memory.service.js');
    vi.mocked(updateMemory).mockRejectedValueOnce(
      Object.assign(new Error('Memory not found'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'PATCH',
      `/agents/${AGENT_ID}/memories/nonexistent`,
      {
        headers: authHeaders,
        body: { content: 'Nope' },
      },
    );

    expect(status).toBe(404);
    expect(body.error).toBe('Not found');
  });

  it('returns 422 for invalid JSON body', async () => {
    const authHeaders = await getTokenHeader();
    const res = await app.fetch(
      new Request(`http://localhost/agents/${AGENT_ID}/memories/${MEMORY_ID}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: 'not-json',
      }),
    );
    expect(res.status).toBe(422);
  });

  it('updates importance to valid value', async () => {
    const { updateMemory } = await import('./memory.service.js');
    vi.mocked(updateMemory).mockResolvedValueOnce({
      id: MEMORY_ID,
      importance: 0.9,
    } as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'PATCH',
      `/agents/${AGENT_ID}/memories/${MEMORY_ID}`,
      {
        headers: authHeaders,
        body: { importance: 0.9 },
      },
    );

    expect(status).toBe(200);
    expect(body.memory.importance).toBe(0.9);
  });
});

/* -------------------------------------------------------------------------- */
/*  DELETE /agents/:agentId/memories/:id                                      */
/* -------------------------------------------------------------------------- */

describe('DELETE /agents/:agentId/memories/:id', () => {
  it('returns 200 with ok true', async () => {
    const { softDeleteMemory } = await import('./memory-consolidation.service.js');
    vi.mocked(softDeleteMemory).mockResolvedValueOnce(undefined);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'DELETE',
      `/agents/${AGENT_ID}/memories/${MEMORY_ID}`,
      { headers: authHeaders },
    );

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it('returns 404 for non-existent memory', async () => {
    const { softDeleteMemory } = await import('./memory-consolidation.service.js');
    vi.mocked(softDeleteMemory).mockRejectedValueOnce(
      Object.assign(new Error('Memory not found or access denied'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'DELETE',
      `/agents/${AGENT_ID}/memories/nonexistent`,
      { headers: authHeaders },
    );

    expect(status).toBe(404);
    expect(body.error).toBe('Not found');
  });
});

/* -------------------------------------------------------------------------- */
/*  DELETE /agents/:agentId/memories (bulk)                                   */
/* -------------------------------------------------------------------------- */

describe('DELETE /agents/:agentId/memories (bulk)', () => {
  it('returns 200 with ok true for bulk delete', async () => {
    const { bulkDeleteMemories } = await import('./memory.service.js');
    vi.mocked(bulkDeleteMemories).mockResolvedValueOnce(undefined);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'DELETE', `/agents/${AGENT_ID}/memories`, {
      headers: authHeaders,
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it('passes type filter to bulk delete', async () => {
    const { bulkDeleteMemories } = await import('./memory.service.js');
    vi.mocked(bulkDeleteMemories).mockResolvedValueOnce(undefined);

    const authHeaders = await getTokenHeader();
    await request(app, 'DELETE', `/agents/${AGENT_ID}/memories?type=fact`, {
      headers: authHeaders,
    });

    expect(vi.mocked(bulkDeleteMemories)).toHaveBeenCalledWith(AGENT_ID, 'user-uuid', 'fact');
  });

  it('returns 404 when agent not found', async () => {
    const { bulkDeleteMemories } = await import('./memory.service.js');
    vi.mocked(bulkDeleteMemories).mockRejectedValueOnce(
      Object.assign(new Error('Agent not found'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'DELETE', `/agents/${AGENT_ID}/memories`, {
      headers: authHeaders,
    });

    expect(status).toBe(404);
    expect(body.error).toBe('Not found');
  });
});
