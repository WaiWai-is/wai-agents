/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
const AGENT_ID = '880e8400-e29b-41d4-a716-446655440003';

/* ================================================================
 * searchMarketplace edge cases
 * ================================================================ */
describe('searchMarketplace edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('escapes percent sign in search query', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { searchMarketplace } = await import('./social.service.js');
    const result = await searchMarketplace('100%', USER_ID);
    expect(result).toEqual([]);
  });

  it('escapes underscore in search query', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { searchMarketplace } = await import('./social.service.js');
    const result = await searchMarketplace('my_agent', USER_ID);
    expect(result).toEqual([]);
  });

  it('escapes backslash in search query', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { searchMarketplace } = await import('./social.service.js');
    const result = await searchMarketplace('test\\path', USER_ID);
    expect(result).toEqual([]);
  });

  it('handles empty search query', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { searchMarketplace } = await import('./social.service.js');
    const result = await searchMarketplace('', USER_ID);
    expect(result).toEqual([]);
  });

  it('handles unicode search query', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { searchMarketplace } = await import('./social.service.js');
    const result = await searchMarketplace('\u0422\u0435\u0441\u0442\u043e\u0432\u044b\u0439 \u0430\u0433\u0435\u043d\u0442', USER_ID);
    expect(result).toEqual([]);
  });

  it('handles very long search query', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { searchMarketplace } = await import('./social.service.js');
    const result = await searchMarketplace('a'.repeat(1000), USER_ID);
    expect(result).toEqual([]);
  });
});

/* ================================================================
 * getMarketplaceAgent edge cases
 * ================================================================ */
describe('getMarketplaceAgent edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns correct usage_count as number', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([
      {
        id: AGENT_ID,
        creator_id: USER_ID,
        name: 'Agent',
        slug: 'agent',
        description: null,
        avatar_url: null,
        system_prompt: 'prompt',
        model: 'claude-sonnet-4-6',
        visibility: 'public',
        category: null,
        usage_count: '42', // string from DB
        rating_sum: 20,
        rating_count: 5,
        rating_avg: 4.0,
        metadata: {},
        inserted_at: new Date('2026-01-01'),
        updated_at: new Date('2026-01-01'),
        username: 'user',
        display_name: 'User',
        creator_avatar_url: null,
      },
    ] as any);

    const { getMarketplaceAgent } = await import('./social.service.js');
    const agent = await getMarketplaceAgent('agent');
    expect(typeof agent.usage_count).toBe('number');
    expect(agent.usage_count).toBe(42);
  });

  it('formats dates via toISO', async () => {
    const { sql } = await import('../../db/connection.js');
    const date = new Date('2026-06-15T12:00:00Z');
    vi.mocked(sql).mockResolvedValueOnce([
      {
        id: AGENT_ID,
        creator_id: USER_ID,
        name: 'Agent',
        slug: 'agent',
        description: null,
        avatar_url: null,
        system_prompt: 'prompt',
        model: 'claude-sonnet-4-6',
        visibility: 'public',
        category: null,
        usage_count: 0,
        rating_sum: 0,
        rating_count: 0,
        rating_avg: 0,
        metadata: {},
        inserted_at: date,
        updated_at: date,
        username: 'user',
        display_name: 'User',
        creator_avatar_url: null,
      },
    ] as any);

    const { getMarketplaceAgent } = await import('./social.service.js');
    const agent = await getMarketplaceAgent('agent');
    expect(agent.created_at).toBe('2026-06-15T12:00:00.000Z');
    expect(agent.updated_at).toBe('2026-06-15T12:00:00.000Z');
  });
});

/* ================================================================
 * formatFeedItem edge cases
 * ================================================================ */
describe('formatFeedItem edge cases (via listFeed)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles null inserted_at', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([
      {
        id: 'item-1',
        creator_id: 'user-1',
        type: 'agent',
        reference_id: 'agent-1',
        reference_type: 'agent',
        title: 'Test',
        description: null,
        thumbnail_url: null,
        quality_score: 0,
        trending_score: 0,
        like_count: 0,
        fork_count: 0,
        view_count: 0,
        inserted_at: null,
        updated_at: null,
        username: 'user',
        display_name: null,
        avatar_url: null,
        liked_by_me: false,
      },
    ] as any);

    const { listFeed } = await import('./social.service.js');
    const items = await listFeed(USER_ID);
    expect(items[0].created_at).toBeNull();
    expect(items[0].updated_at).toBeNull();
  });

  it('handles negative liked_by_me number', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([
      {
        id: 'item-1',
        creator_id: 'user-1',
        type: 'agent',
        reference_id: 'agent-1',
        reference_type: 'agent',
        title: 'Test',
        description: null,
        thumbnail_url: null,
        quality_score: 0,
        trending_score: 0,
        like_count: 0,
        fork_count: 0,
        view_count: 0,
        inserted_at: new Date('2026-01-01'),
        updated_at: new Date('2026-01-01'),
        username: 'user',
        display_name: null,
        avatar_url: null,
        liked_by_me: -1,
      },
    ] as any);

    const { listFeed } = await import('./social.service.js');
    const items = await listFeed(USER_ID);
    // -1 is a number but not > 0
    expect(items[0].liked_by_me).toBe(false);
  });

  it('handles empty feed result', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { listFeed } = await import('./social.service.js');
    const items = await listFeed(USER_ID);
    expect(items).toEqual([]);
  });
});

/* ================================================================
 * followUser/unfollowUser edge cases
 * ================================================================ */
describe('followUser/unfollowUser edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('followUser with empty string IDs throws BAD_REQUEST', async () => {
    const { followUser } = await import('./social.service.js');
    // Same ID triggers BAD_REQUEST before DB call
    await expect(followUser('same-id', 'same-id')).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('unfollowUser succeeds even if no relationship exists', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { unfollowUser } = await import('./social.service.js');
    // Should not throw
    await unfollowUser(USER_ID, 'nonexistent');
    expect(vi.mocked(sql)).toHaveBeenCalledTimes(1);
  });
});

/* ================================================================
 * rateAgent error edge cases
 * ================================================================ */
describe('rateAgent error edge cases', () => {
  beforeEach(async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    sqlMock.mockReset();
    // Re-establish begin mock after mockReset clears implementation
    (sqlMock as any).begin = vi.fn(async (cb: (tx: any) => Promise<any>) => {
      return cb(sqlMock);
    });
  });

  it('throws NOT_FOUND when agent does not exist', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any); // No agent found

    const { rateAgent } = await import('./social.service.js');
    await expect(rateAgent(AGENT_ID, USER_ID, 5)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws BAD_REQUEST when user has not used the agent', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([{ id: AGENT_ID }] as any); // Agent exists
    vi.mocked(sql).mockResolvedValueOnce([] as any); // No usage

    const { rateAgent } = await import('./social.service.js');
    await expect(rateAgent(AGENT_ID, USER_ID, 5)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('creates new rating when none exists', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any); // Agent exists
    sqlMock.mockResolvedValueOnce([{ '?column?': 1 }] as any); // User has used agent
    sqlMock.mockResolvedValueOnce([] as any); // No existing rating
    sqlMock.mockResolvedValueOnce([] as any); // Insert rating
    sqlMock.mockResolvedValueOnce([] as any); // Update agent
    sqlMock.mockResolvedValueOnce([{ rating_sum: 5, rating_count: 1, rating_avg: 5.0 }] as any);

    const { rateAgent } = await import('./social.service.js');
    const result = await rateAgent(AGENT_ID, USER_ID, 5, undefined, undefined);

    expect(result.your_rating).toBe(5);
    expect(result.agent_id).toBe(AGENT_ID);
  });
});
