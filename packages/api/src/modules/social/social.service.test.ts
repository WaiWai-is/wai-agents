/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

function makeAgentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: AGENT_ID,
    creator_id: OTHER_USER_ID,
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
    usage_count: 42,
    rating_sum: 20,
    rating_count: 5,
    execution_mode: 'raw',
    metadata: {},
    inserted_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('social.service — Feed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listFeed returns formatted items with creator and liked_by_me', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([makeFeedItemRow()] as any);

    const { listFeed } = await import('./social.service.js');
    const items = await listFeed(USER_ID);

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(FEED_ITEM_ID);
    expect(items[0].creator.username).toBe('testuser');
    expect(items[0].liked_by_me).toBe(false);
  });

  it('listFeed with liked_by_me = 1 returns true', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([makeFeedItemRow({ liked_by_me: 1 })] as any);

    const { listFeed } = await import('./social.service.js');
    const items = await listFeed(USER_ID);

    expect(items[0].liked_by_me).toBe(true);
  });

  it('listFeed with cursor looks up cursor inserted_at first', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // First call: cursor lookup
    sqlMock.mockResolvedValueOnce([{ inserted_at: new Date('2026-01-15') }] as any);
    // Second call: actual feed query
    sqlMock.mockResolvedValueOnce([makeFeedItemRow()] as any);

    const { listFeed } = await import('./social.service.js');
    const items = await listFeed(USER_ID, 'some-cursor-id');

    expect(sqlMock).toHaveBeenCalledTimes(2);
    expect(items).toHaveLength(1);
  });

  it('listFeed with invalid cursor throws BAD_REQUEST', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { listFeed } = await import('./social.service.js');
    await expect(listFeed(USER_ID, 'invalid-cursor')).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('listTrending returns items sorted by trending_score', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([
      makeFeedItemRow({ trending_score: 10 }),
      makeFeedItemRow({ id: 'item-2', trending_score: 5 }),
    ] as any);

    const { listTrending } = await import('./social.service.js');
    const items = await listTrending(USER_ID);

    expect(items).toHaveLength(2);
  });

  it('listFollowing returns items from followed users', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([makeFeedItemRow()] as any);

    const { listFollowing } = await import('./social.service.js');
    const items = await listFollowing(USER_ID);

    expect(items).toHaveLength(1);
  });

  it('listNew returns all public items sorted by inserted_at', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([makeFeedItemRow()] as any);

    const { listNew } = await import('./social.service.js');
    const items = await listNew(USER_ID);

    expect(items).toHaveLength(1);
  });

  it('limit is clamped between 1 and 100', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { listFeed } = await import('./social.service.js');
    // Should not throw with extreme limits
    await listFeed(USER_ID, undefined, 0);  // gets clamped to 1
  });
});

describe('social.service — Likes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('likeFeedItem inserts like and returns updated item', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // 1. Check feed item exists
    sqlMock.mockResolvedValueOnce([{ id: FEED_ITEM_ID }] as any);
    // 2. Insert like
    sqlMock.mockResolvedValueOnce([] as any);
    // 3. Update + RETURNING feed item
    sqlMock.mockResolvedValueOnce([{
      id: FEED_ITEM_ID, creator_id: OTHER_USER_ID, type: 'agent',
      reference_id: AGENT_ID, reference_type: 'agent', title: 'Test Agent',
      description: 'A test agent', thumbnail_url: null, quality_score: 0,
      trending_score: 5.0, like_count: 4, fork_count: 1, view_count: 100,
      inserted_at: new Date('2026-01-01'), updated_at: new Date('2026-01-01'),
    }] as any);
    // 4. Creator lookup
    sqlMock.mockResolvedValueOnce([{
      username: 'testuser', display_name: 'Test User', avatar_url: null,
    }] as any);

    const { likeFeedItem } = await import('./social.service.js');
    const result = await likeFeedItem(FEED_ITEM_ID, USER_ID);

    expect(result.id).toBe(FEED_ITEM_ID);
    expect(result.like_count).toBe(4);
    expect(sqlMock).toHaveBeenCalledTimes(4);
  });

  it('likeFeedItem throws NOT_FOUND for missing feed item', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { likeFeedItem } = await import('./social.service.js');
    await expect(likeFeedItem('nonexistent', USER_ID)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('unlikeFeedItem deletes like and updates count', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // 1. Check feed item exists
    sqlMock.mockResolvedValueOnce([{ id: FEED_ITEM_ID }] as any);
    // 2. Delete like
    sqlMock.mockResolvedValueOnce([] as any);
    // 3. Update count
    sqlMock.mockResolvedValueOnce([] as any);

    const { unlikeFeedItem } = await import('./social.service.js');
    await unlikeFeedItem(FEED_ITEM_ID, USER_ID);

    expect(sqlMock).toHaveBeenCalledTimes(3);
  });

  it('unlikeFeedItem throws NOT_FOUND for missing feed item', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { unlikeFeedItem } = await import('./social.service.js');
    await expect(unlikeFeedItem('nonexistent', USER_ID)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('social.service — Fork', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forkAgent copies agent with forked_from in metadata', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // 1. Get source agent
    sqlMock.mockResolvedValueOnce([makeAgentRow()] as any);
    // 2. Check slug uniqueness
    sqlMock.mockResolvedValueOnce([] as any);
    // 3. Insert new agent
    sqlMock.mockResolvedValueOnce([] as any);
    // 4. Increment fork_count on feed items
    sqlMock.mockResolvedValueOnce([] as any);
    // 5. Insert feed item for fork
    sqlMock.mockResolvedValueOnce([] as any);
    // 6. Return new agent
    sqlMock.mockResolvedValueOnce([makeAgentRow({
      id: 'new-agent-id',
      creator_id: USER_ID,
      slug: 'test-agent-fork',
      metadata: { forked_from: AGENT_ID },
    })] as any);

    const { forkAgent } = await import('./social.service.js');
    const result = await forkAgent(AGENT_ID, USER_ID);

    expect(result.id).toBe('new-agent-id');
    expect(result.creator_id).toBe(USER_ID);
    expect(sqlMock).toHaveBeenCalledTimes(6);
  });

  it('forkAgent throws NOT_FOUND for missing agent', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { forkAgent } = await import('./social.service.js');
    await expect(forkAgent('nonexistent', USER_ID)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('social.service — Marketplace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listMarketplace returns public agents with rating_avg', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([
      {
        ...makeAgentRow(),
        rating_avg: 4.0,
        username: 'creator',
        display_name: 'Creator',
        creator_avatar_url: null,
      },
    ] as any);

    const { listMarketplace } = await import('./social.service.js');
    const agents = await listMarketplace(USER_ID);

    expect(agents).toHaveLength(1);
    expect(agents[0].rating_avg).toBe(4.0);
    expect(agents[0].creator.username).toBe('creator');
  });

  it('listMarketplace filters by category', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { listMarketplace } = await import('./social.service.js');
    const agents = await listMarketplace(USER_ID, undefined, undefined, 'productivity');

    expect(agents).toHaveLength(0);
  });

  it('searchMarketplace returns matching agents', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([
      {
        ...makeAgentRow(),
        rating_avg: 3.5,
        username: 'creator',
        display_name: 'Creator',
        creator_avatar_url: null,
      },
    ] as any);

    const { searchMarketplace } = await import('./social.service.js');
    const agents = await searchMarketplace('test', USER_ID);

    expect(agents).toHaveLength(1);
  });

  it('getMarketplaceAgent returns full agent details', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([
      {
        ...makeAgentRow(),
        rating_avg: 4.0,
        username: 'creator',
        display_name: 'Creator',
        creator_avatar_url: null,
      },
    ] as any);

    const { getMarketplaceAgent } = await import('./social.service.js');
    const agent = await getMarketplaceAgent('test-agent');

    expect(agent.slug).toBe('test-agent');
    expect(agent.creator.username).toBe('creator');
  });

  it('getMarketplaceAgent falls back to id lookup', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // Slug lookup: no result
    sqlMock.mockResolvedValueOnce([] as any);
    // ID lookup: found
    sqlMock.mockResolvedValueOnce([
      {
        ...makeAgentRow(),
        rating_avg: 4.0,
        username: 'creator',
        display_name: 'Creator',
        creator_avatar_url: null,
      },
    ] as any);

    const { getMarketplaceAgent } = await import('./social.service.js');
    const agent = await getMarketplaceAgent(AGENT_ID);

    expect(agent.id).toBe(AGENT_ID);
  });

  it('getMarketplaceAgent throws NOT_FOUND', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([] as any); // slug lookup
    sqlMock.mockResolvedValueOnce([] as any); // id lookup

    const { getMarketplaceAgent } = await import('./social.service.js');
    await expect(getMarketplaceAgent('nonexistent')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('listCategories returns categories with counts', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([
      { category: 'productivity', count: 5 },
      { category: 'creative', count: 3 },
    ] as any);

    const { listCategories } = await import('./social.service.js');
    const categories = await listCategories();

    expect(categories).toHaveLength(2);
    expect(categories[0].category).toBe('productivity');
    expect(categories[0].count).toBe(5);
  });

  it('rateAgent creates new rating and updates agent', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // 1. Check agent exists
    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    // 2. Check existing rating
    sqlMock.mockResolvedValueOnce([] as any);
    // 3. Insert rating
    sqlMock.mockResolvedValueOnce([] as any);
    // 4. Update agent rating_sum/count
    sqlMock.mockResolvedValueOnce([] as any);
    // 5. Return updated summary
    sqlMock.mockResolvedValueOnce([{ rating_sum: 24, rating_count: 6, rating_avg: 4.0 }] as any);

    const { rateAgent } = await import('./social.service.js');
    const result = await rateAgent(AGENT_ID, USER_ID, 4, 'Great agent');

    expect(result.your_rating).toBe(4);
    expect(result.rating_avg).toBe(4.0);
  });

  it('rateAgent updates existing rating', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // 1. Check agent exists
    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    // 2. Check existing rating — found
    sqlMock.mockResolvedValueOnce([{ id: 'rating-id', old_rating: 3 }] as any);
    // 3. Update rating
    sqlMock.mockResolvedValueOnce([] as any);
    // 4. Update agent rating_sum (diff)
    sqlMock.mockResolvedValueOnce([] as any);
    // 5. Return updated summary
    sqlMock.mockResolvedValueOnce([{ rating_sum: 21, rating_count: 5, rating_avg: 4.2 }] as any);

    const { rateAgent } = await import('./social.service.js');
    const result = await rateAgent(AGENT_ID, USER_ID, 4);

    expect(result.your_rating).toBe(4);
  });

  it('rateAgent throws NOT_FOUND for private/missing agent', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { rateAgent } = await import('./social.service.js');
    await expect(rateAgent('nonexistent', USER_ID, 5)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('social.service — Follows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('followUser inserts a follow relationship', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // 1. Check target user exists
    sqlMock.mockResolvedValueOnce([{ id: OTHER_USER_ID }] as any);
    // 2. Insert follow
    sqlMock.mockResolvedValueOnce([] as any);

    const { followUser } = await import('./social.service.js');
    await followUser(USER_ID, OTHER_USER_ID);

    expect(sqlMock).toHaveBeenCalledTimes(2);
  });

  it('followUser throws BAD_REQUEST when following self', async () => {
    const { followUser } = await import('./social.service.js');
    await expect(followUser(USER_ID, USER_ID)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('followUser throws NOT_FOUND for missing user', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { followUser } = await import('./social.service.js');
    await expect(followUser(USER_ID, 'nonexistent')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('unfollowUser deletes the follow', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([] as any);

    const { unfollowUser } = await import('./social.service.js');
    await unfollowUser(USER_ID, OTHER_USER_ID);

    expect(sqlMock).toHaveBeenCalledTimes(1);
  });
});
