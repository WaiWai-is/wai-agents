/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { socialRoutes } from './social.routes.js';
import { generateTokens } from '../auth/auth.service.js';

// Mock DB connection
vi.mock('../../db/connection.js', () => {
  const sqlFn = Object.assign(vi.fn(), {
    unsafe: vi.fn(),
    begin: vi.fn(async (cb: (tx: any) => Promise<any>) => {
      return cb(sqlFn);
    }),
  });
  return { sql: sqlFn, db: {} };
});

const USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_USER_ID = '660e8400-e29b-41d4-a716-446655440001';
const FEED_ITEM_ID = '770e8400-e29b-41d4-a716-446655440002';
const AGENT_ID = '880e8400-e29b-41d4-a716-446655440003';

function buildApp() {
  const app = new Hono();
  app.route('/', socialRoutes);
  return app;
}

async function request(
  app: ReturnType<typeof buildApp>,
  method: string,
  path: string,
  opts: { body?: unknown; headers?: Record<string, string> } = {},
) {
  const { access_token } = await generateTokens(USER_ID, 'user');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${access_token}`,
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

async function unauthRequest(
  app: ReturnType<typeof buildApp>,
  method: string,
  path: string,
) {
  const req = new Request(`http://localhost${path}`, { method });
  const res = await app.fetch(req);
  return { status: res.status };
}

function makeFeedItemRow(overrides: Record<string, unknown> = {}) {
  return {
    id: FEED_ITEM_ID,
    creator_id: OTHER_USER_ID,
    type: 'agent',
    reference_id: AGENT_ID,
    reference_type: 'agent',
    title: 'Test Agent',
    description: 'A test agent',
    thumbnail_url: null,
    quality_score: 0,
    trending_score: 5.0,
    like_count: 3,
    fork_count: 1,
    view_count: 100,
    inserted_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
    username: 'testuser',
    display_name: 'Test User',
    avatar_url: null,
    liked_by_me: 0,
    ...overrides,
  };
}

let app: ReturnType<typeof buildApp>;

beforeEach(() => {
  vi.clearAllMocks();
  app = buildApp();
});

/* -------------------------------------------------------------------------- */
/*  Feed routes                                                               */
/* -------------------------------------------------------------------------- */

describe('GET /feed', () => {
  it('returns 401 without auth', async () => {
    const { status } = await unauthRequest(app, 'GET', '/feed');
    expect(status).toBe(401);
  });

  it('returns 200 with feed items', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([makeFeedItemRow()] as any);

    const { status, body } = await request(app, 'GET', '/feed');
    expect(status).toBe(200);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].creator.username).toBe('testuser');
  });
});

describe('GET /feed/trending', () => {
  it('returns 200 with trending items', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([makeFeedItemRow({ trending_score: 10 })] as any);

    const { status, body } = await request(app, 'GET', '/feed/trending');
    expect(status).toBe(200);
    expect(body.items).toHaveLength(1);
  });
});

describe('GET /feed/following', () => {
  it('returns 200 with following items', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([makeFeedItemRow()] as any);

    const { status, body } = await request(app, 'GET', '/feed/following');
    expect(status).toBe(200);
    expect(body.items).toHaveLength(1);
  });
});

describe('GET /feed/new', () => {
  it('returns 200 with new items', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([makeFeedItemRow()] as any);

    const { status, body } = await request(app, 'GET', '/feed/new');
    expect(status).toBe(200);
    expect(body.items).toHaveLength(1);
  });
});

describe('POST /feed/:id/like', () => {
  it('returns 200 on successful like', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // 1. Check feed item exists
    sqlMock.mockResolvedValueOnce([{ id: FEED_ITEM_ID }] as any);
    // 2. Insert like (inside transaction)
    sqlMock.mockResolvedValueOnce([] as any);
    // 3. Update + RETURNING feed item
    sqlMock.mockResolvedValueOnce([{
      id: FEED_ITEM_ID, creator_id: OTHER_USER_ID, type: 'agent',
      reference_id: AGENT_ID, reference_type: 'agent', title: 'Test',
      description: 'Desc', thumbnail_url: null, quality_score: 0,
      trending_score: 5.0, like_count: 4, fork_count: 1, view_count: 100,
      inserted_at: new Date('2026-01-01'), updated_at: new Date('2026-01-01'),
    }] as any);
    // 4. Creator lookup
    sqlMock.mockResolvedValueOnce([{
      username: 'testuser', display_name: 'Test User', avatar_url: null,
    }] as any);

    const { status, body } = await request(app, 'POST', `/feed/${FEED_ITEM_ID}/like`);
    expect(status).toBe(200);
    expect(body.item.like_count).toBe(4);
  });

  it('returns 404 for missing feed item', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { status } = await request(app, 'POST', '/feed/00000000-0000-0000-0000-000000000099/like');
    expect(status).toBe(404);
  });
});

describe('DELETE /feed/:id/like', () => {
  it('returns 200 on successful unlike', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // 1. Check feed item exists
    sqlMock.mockResolvedValueOnce([{ id: FEED_ITEM_ID }] as any);
    // 2. Delete like (inside transaction)
    sqlMock.mockResolvedValueOnce([] as any);
    // 3. Update like_count
    sqlMock.mockResolvedValueOnce([] as any);

    const { status, body } = await request(app, 'DELETE', `/feed/${FEED_ITEM_ID}/like`);
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });
});

describe('POST /feed/:id/fork', () => {
  it('returns 201 on successful fork', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // Source agent lookup
    sqlMock.mockResolvedValueOnce([{
      id: AGENT_ID,
      name: 'Test Agent',
      slug: 'test-agent',
      description: 'A test agent',
      avatar_url: null,
      system_prompt: 'You are a test agent.',
      model: 'claude-sonnet-4-6',
      temperature: 0.7,
      max_tokens: 4096,
      tools: [],
      mcp_servers: [],
      visibility: 'public',
      category: 'productivity',
      metadata: {},
    }] as any);
    // Slug check
    sqlMock.mockResolvedValueOnce([] as any);
    // Insert new agent
    sqlMock.mockResolvedValueOnce([] as any);
    // Increment fork_count
    sqlMock.mockResolvedValueOnce([] as any);
    // Insert feed item
    sqlMock.mockResolvedValueOnce([] as any);
    // Return new agent
    sqlMock.mockResolvedValueOnce([{
      id: 'new-agent-id',
      creator_id: USER_ID,
      name: 'Test Agent',
      slug: 'test-agent-fork',
      description: 'A test agent',
      avatar_url: null,
      system_prompt: 'You are a test agent.',
      model: 'claude-sonnet-4-6',
      visibility: 'private',
      category: 'productivity',
      usage_count: 0,
      rating_sum: 0,
      rating_count: 0,
      execution_mode: 'raw',
      metadata: { forked_from: AGENT_ID },
      inserted_at: new Date(),
      updated_at: new Date(),
    }] as any);

    const { status, body } = await request(app, 'POST', `/feed/${AGENT_ID}/fork`);
    expect(status).toBe(201);
    expect(body.agent.id).toBe('new-agent-id');
  });

  it('returns 404 for missing agent', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { status } = await request(app, 'POST', '/feed/00000000-0000-0000-0000-000000000099/fork');
    expect(status).toBe(404);
  });
});

/* -------------------------------------------------------------------------- */
/*  Marketplace routes                                                        */
/* -------------------------------------------------------------------------- */

describe('GET /marketplace', () => {
  it('returns 200 with marketplace agents', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([{
      id: AGENT_ID,
      creator_id: OTHER_USER_ID,
      name: 'Test Agent',
      slug: 'test-agent',
      description: 'Desc',
      avatar_url: null,
      model: 'claude-sonnet-4-6',
      visibility: 'public',
      category: 'productivity',
      usage_count: 42,
      rating_sum: 20,
      rating_count: 5,
      rating_avg: 4.0,
      inserted_at: new Date(),
      updated_at: new Date(),
      username: 'creator',
      display_name: 'Creator',
      creator_avatar_url: null,
    }] as any);

    const { status, body } = await request(app, 'GET', '/marketplace');
    expect(status).toBe(200);
    expect(body.agents).toHaveLength(1);
  });

  it('passes category query param', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { status, body } = await request(app, 'GET', '/marketplace?category=creative');
    expect(status).toBe(200);
    expect(body.agents).toHaveLength(0);
  });
});

describe('GET /marketplace/search', () => {
  it('returns 400 without q param', async () => {
    const { status, body } = await request(app, 'GET', '/marketplace/search');
    expect(status).toBe(400);
    expect(body.error).toBe('Bad request');
  });

  it('returns 200 with search results', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([{
      id: AGENT_ID,
      creator_id: OTHER_USER_ID,
      name: 'Test Agent',
      slug: 'test-agent',
      description: 'Desc',
      avatar_url: null,
      model: 'claude-sonnet-4-6',
      visibility: 'public',
      category: 'productivity',
      usage_count: 42,
      rating_sum: 20,
      rating_count: 5,
      rating_avg: 4.0,
      inserted_at: new Date(),
      updated_at: new Date(),
      username: 'creator',
      display_name: 'Creator',
      creator_avatar_url: null,
    }] as any);

    const { status, body } = await request(app, 'GET', '/marketplace/search?q=test');
    expect(status).toBe(200);
    expect(body.agents).toHaveLength(1);
  });
});

describe('GET /marketplace/categories', () => {
  it('returns 200 with categories', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([
      { category: 'productivity', count: 5 },
      { category: 'creative', count: 3 },
    ] as any);

    const { status, body } = await request(app, 'GET', '/marketplace/categories');
    expect(status).toBe(200);
    expect(body.categories).toHaveLength(2);
  });
});

describe('GET /marketplace/agents/:slug', () => {
  it('returns 200 with agent details', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([{
      id: AGENT_ID,
      creator_id: OTHER_USER_ID,
      name: 'Test Agent',
      slug: 'test-agent',
      description: 'Desc',
      avatar_url: null,
      system_prompt: 'Prompt',
      model: 'claude-sonnet-4-6',
      visibility: 'public',
      category: 'productivity',
      usage_count: 42,
      rating_sum: 20,
      rating_count: 5,
      rating_avg: 4.0,
      metadata: {},
      inserted_at: new Date(),
      updated_at: new Date(),
      username: 'creator',
      display_name: 'Creator',
      creator_avatar_url: null,
    }] as any);

    const { status, body } = await request(app, 'GET', '/marketplace/agents/test-agent');
    expect(status).toBe(200);
    expect(body.agent.slug).toBe('test-agent');
  });

  it('returns 404 for unknown slug', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    sqlMock.mockResolvedValueOnce([] as any); // slug lookup
    sqlMock.mockResolvedValueOnce([] as any); // id lookup

    const { status } = await request(app, 'GET', '/marketplace/agents/nonexistent');
    expect(status).toBe(404);
  });
});

describe('POST /marketplace/agents/:id/rate', () => {
  it('returns 422 for invalid rating', async () => {
    const { status } = await request(app, 'POST', `/marketplace/agents/${AGENT_ID}/rate`, {
      body: { rating: 6 },
    });
    expect(status).toBe(422);
  });

  it('returns 422 for non-integer rating', async () => {
    const { status } = await request(app, 'POST', `/marketplace/agents/${AGENT_ID}/rate`, {
      body: { rating: 3.5 },
    });
    expect(status).toBe(422);
  });

  it('returns 200 on successful rating', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([{ rating_sum: 24, rating_count: 6, rating_avg: 4.0 }] as any);

    const { status, body } = await request(app, 'POST', `/marketplace/agents/${AGENT_ID}/rate`, {
      body: { rating: 4, review: 'Great agent' },
    });
    expect(status).toBe(200);
    expect(body.rating.your_rating).toBe(4);
  });

  it('returns 404 for missing agent', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { status } = await request(app, 'POST', `/marketplace/agents/00000000-0000-0000-0000-000000000099/rate`, {
      body: { rating: 4 },
    });
    expect(status).toBe(404);
  });
});

/* -------------------------------------------------------------------------- */
/*  Follow routes                                                             */
/* -------------------------------------------------------------------------- */

describe('POST /users/:id/follow', () => {
  it('returns 201 on successful follow', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: OTHER_USER_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { status, body } = await request(app, 'POST', `/users/${OTHER_USER_ID}/follow`);
    expect(status).toBe(201);
    expect(body.ok).toBe(true);
  });

  it('returns 400 when following self', async () => {
    const { status, body } = await request(app, 'POST', `/users/${USER_ID}/follow`);
    expect(status).toBe(400);
    expect(body.error).toBe('Bad request');
  });

  it('returns 404 for missing user', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { status } = await request(app, 'POST', '/users/00000000-0000-0000-0000-000000000099/follow');
    expect(status).toBe(404);
  });
});

describe('DELETE /users/:id/follow', () => {
  it('returns 200 on successful unfollow', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { status, body } = await request(app, 'DELETE', `/users/${OTHER_USER_ID}/follow`);
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });
});
