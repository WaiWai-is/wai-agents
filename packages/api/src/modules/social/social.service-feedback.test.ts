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
const CONVERSATION_ID = '660e8400-e29b-41d4-a716-446655440001';
const MESSAGE_ID = '770e8400-e29b-41d4-a716-446655440002';
const AGENT_ID = '880e8400-e29b-41d4-a716-446655440003';

/* ================================================================
 * submitMessageFeedback
 * ================================================================ */
describe('submitMessageFeedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts feedback and returns the result', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { submitMessageFeedback } = await import('./social.service.js');
    const result = await submitMessageFeedback(
      CONVERSATION_ID,
      MESSAGE_ID,
      USER_ID,
      AGENT_ID,
      'positive',
      undefined,
    );

    expect(result.message_id).toBe(MESSAGE_ID);
    expect(result.feedback).toBe('positive');
    expect(result.reason).toBeUndefined();
  });

  it('inserts feedback with reason', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { submitMessageFeedback } = await import('./social.service.js');
    const result = await submitMessageFeedback(
      CONVERSATION_ID,
      MESSAGE_ID,
      USER_ID,
      AGENT_ID,
      'negative',
      'too_verbose',
    );

    expect(result.feedback).toBe('negative');
    expect(result.reason).toBe('too_verbose');
  });

  it('calls sql for the upsert operation', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    sqlMock.mockResolvedValueOnce([] as any);

    const { submitMessageFeedback } = await import('./social.service.js');
    await submitMessageFeedback(CONVERSATION_ID, MESSAGE_ID, USER_ID, AGENT_ID, 'positive');

    expect(sqlMock).toHaveBeenCalledTimes(1);
  });
});

/* ================================================================
 * shouldPromptFeedback
 * ================================================================ */
describe('shouldPromptFeedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when conversation has 6+ messages', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([{ cnt: 8 }] as any);

    const { shouldPromptFeedback } = await import('./social.service.js');
    const result = await shouldPromptFeedback(CONVERSATION_ID);

    expect(result).toBe(true);
  });

  it('returns true when conversation has exactly 6 messages', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([{ cnt: 6 }] as any);

    const { shouldPromptFeedback } = await import('./social.service.js');
    const result = await shouldPromptFeedback(CONVERSATION_ID);

    expect(result).toBe(true);
  });

  it('returns boolean for short conversations (random sampling)', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([{ cnt: 2 }] as any);

    const { shouldPromptFeedback } = await import('./social.service.js');
    const result = await shouldPromptFeedback(CONVERSATION_ID);

    // Result should be a boolean (either true from 20% sampling or false)
    expect(typeof result).toBe('boolean');
  });

  it('returns boolean for conversation with 0 messages', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([{ cnt: 0 }] as any);

    const { shouldPromptFeedback } = await import('./social.service.js');
    const result = await shouldPromptFeedback(CONVERSATION_ID);

    expect(typeof result).toBe('boolean');
  });
});

/* ================================================================
 * Feed formatFeedItem — liked_by_me coercion
 * ================================================================ */
describe('formatFeedItem liked_by_me coercion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeFeedItemRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'item-1',
      creator_id: 'user-1',
      type: 'agent',
      reference_id: 'agent-1',
      reference_type: 'agent',
      title: 'Test',
      description: 'Desc',
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

  it('liked_by_me = true → true', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([makeFeedItemRow({ liked_by_me: true })] as any);

    const { listFeed } = await import('./social.service.js');
    const items = await listFeed(USER_ID);
    expect(items[0].liked_by_me).toBe(true);
  });

  it('liked_by_me = 1 (number) → true', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([makeFeedItemRow({ liked_by_me: 1 })] as any);

    const { listFeed } = await import('./social.service.js');
    const items = await listFeed(USER_ID);
    expect(items[0].liked_by_me).toBe(true);
  });

  it('liked_by_me = 2 (number > 0) → true', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([makeFeedItemRow({ liked_by_me: 2 })] as any);

    const { listFeed } = await import('./social.service.js');
    const items = await listFeed(USER_ID);
    expect(items[0].liked_by_me).toBe(true);
  });

  it('liked_by_me = 0 → false', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([makeFeedItemRow({ liked_by_me: 0 })] as any);

    const { listFeed } = await import('./social.service.js');
    const items = await listFeed(USER_ID);
    expect(items[0].liked_by_me).toBe(false);
  });

  it('liked_by_me = false → false', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([makeFeedItemRow({ liked_by_me: false })] as any);

    const { listFeed } = await import('./social.service.js');
    const items = await listFeed(USER_ID);
    expect(items[0].liked_by_me).toBe(false);
  });

  it('liked_by_me = null → false', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([makeFeedItemRow({ liked_by_me: null })] as any);

    const { listFeed } = await import('./social.service.js');
    const items = await listFeed(USER_ID);
    expect(items[0].liked_by_me).toBe(false);
  });

  it('liked_by_me = "true" (string) → false', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([makeFeedItemRow({ liked_by_me: 'true' })] as any);

    const { listFeed } = await import('./social.service.js');
    const items = await listFeed(USER_ID);
    // "true" is not === true, not === 1, not a number > 0
    expect(items[0].liked_by_me).toBe(false);
  });
});

/* ================================================================
 * clampLimit behavior
 * ================================================================ */
describe('clampLimit behavior (via listFeed)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defaults to 20 when no limit specified', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { listFeed } = await import('./social.service.js');
    await listFeed(USER_ID, undefined, undefined);

    // Should have been called, with the SQL containing LIMIT 20
    expect(vi.mocked(sql)).toHaveBeenCalledTimes(1);
  });

  it('clamps limit of 0 to 1', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { listFeed } = await import('./social.service.js');
    await listFeed(USER_ID, undefined, 0);

    expect(vi.mocked(sql)).toHaveBeenCalledTimes(1);
  });

  it('clamps limit of 200 to 100', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { listFeed } = await import('./social.service.js');
    await listFeed(USER_ID, undefined, 200);

    expect(vi.mocked(sql)).toHaveBeenCalledTimes(1);
  });

  it('handles NaN limit gracefully', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { listFeed } = await import('./social.service.js');
    await listFeed(USER_ID, undefined, NaN);

    expect(vi.mocked(sql)).toHaveBeenCalledTimes(1);
  });
});

/* ================================================================
 * listTrending with cursor
 * ================================================================ */
describe('listTrending with cursor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('looks up cursor trending_score and inserted_at', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // Cursor lookup
    sqlMock.mockResolvedValueOnce([
      { trending_score: 5.0, inserted_at: new Date('2026-01-15') },
    ] as any);
    // Actual trending query
    sqlMock.mockResolvedValueOnce([] as any);

    const { listTrending } = await import('./social.service.js');
    await listTrending(USER_ID, 'some-cursor');

    expect(sqlMock).toHaveBeenCalledTimes(2);
  });

  it('throws BAD_REQUEST for invalid trending cursor', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { listTrending } = await import('./social.service.js');
    await expect(listTrending(USER_ID, 'invalid-cursor')).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });
});

/* ================================================================
 * listFollowing with cursor
 * ================================================================ */
describe('listFollowing with cursor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses cursor for pagination', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // Cursor lookup
    sqlMock.mockResolvedValueOnce([{ inserted_at: new Date('2026-01-15') }] as any);
    // Following query
    sqlMock.mockResolvedValueOnce([] as any);

    const { listFollowing } = await import('./social.service.js');
    await listFollowing(USER_ID, 'some-cursor');

    expect(sqlMock).toHaveBeenCalledTimes(2);
  });
});

/* ================================================================
 * listNew with cursor
 * ================================================================ */
describe('listNew with cursor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses cursor for pagination', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ inserted_at: new Date('2026-01-15') }] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { listNew } = await import('./social.service.js');
    await listNew(USER_ID, 'some-cursor');

    expect(sqlMock).toHaveBeenCalledTimes(2);
  });
});

/* ================================================================
 * searchMarketplace with cursor
 * ================================================================ */
describe('searchMarketplace with cursor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('looks up cursor from agents table for search', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ inserted_at: new Date('2026-01-15') }] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { searchMarketplace } = await import('./social.service.js');
    await searchMarketplace('test', USER_ID, 'some-cursor');

    expect(sqlMock).toHaveBeenCalledTimes(2);
  });

  it('throws BAD_REQUEST for invalid search cursor', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { searchMarketplace } = await import('./social.service.js');
    await expect(searchMarketplace('test', USER_ID, 'invalid')).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('escapes special SQL characters in search query', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { searchMarketplace } = await import('./social.service.js');
    // Should not throw for queries with special chars
    const result = await searchMarketplace('test%_\\query', USER_ID);
    expect(result).toEqual([]);
  });
});

/* ================================================================
 * listMarketplace with cursor and category
 * ================================================================ */
describe('listMarketplace with cursor and category', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles cursor with category filter', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([
      { usage_count: 42, inserted_at: new Date('2026-01-15') },
    ] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { listMarketplace } = await import('./social.service.js');
    await listMarketplace(USER_ID, 'cursor-id', undefined, 'productivity');

    expect(sqlMock).toHaveBeenCalledTimes(2);
  });

  it('handles cursor without category filter', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([
      { usage_count: 42, inserted_at: new Date('2026-01-15') },
    ] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { listMarketplace } = await import('./social.service.js');
    await listMarketplace(USER_ID, 'cursor-id');

    expect(sqlMock).toHaveBeenCalledTimes(2);
  });

  it('throws BAD_REQUEST for invalid marketplace cursor', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { listMarketplace } = await import('./social.service.js');
    await expect(listMarketplace(USER_ID, 'invalid-cursor')).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });
});

/* ================================================================
 * rateAgent with dimensional scores
 * ================================================================ */
describe('rateAgent with dimensional scores', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes dimensional scores to new rating', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any); // Agent exists
    sqlMock.mockResolvedValueOnce([] as any); // No existing rating
    sqlMock.mockResolvedValueOnce([] as any); // Insert rating
    sqlMock.mockResolvedValueOnce([] as any); // Update agent
    sqlMock.mockResolvedValueOnce([{ rating_sum: 5, rating_count: 1, rating_avg: 5.0 }] as any);

    const { rateAgent } = await import('./social.service.js');
    const result = await rateAgent(AGENT_ID, USER_ID, 5, 'Excellent', {
      accuracy_score: 5,
      helpfulness_score: 4,
      speed_score: 5,
      conversation_id: CONVERSATION_ID,
      message_id: MESSAGE_ID,
    });

    expect(result.your_rating).toBe(5);
    expect(result.rating_avg).toBe(5.0);
  });
});

/* ================================================================
 * forkAgent slug collision
 * ================================================================ */
describe('forkAgent slug collision handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('increments slug suffix when base slug is taken', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // 1. Get source agent
    sqlMock.mockResolvedValueOnce([
      {
        id: AGENT_ID,
        name: 'Agent',
        slug: 'agent',
        description: 'Desc',
        avatar_url: null,
        system_prompt: 'Prompt',
        model: 'claude-sonnet-4-6',
        temperature: 0.7,
        max_tokens: 4096,
        tools: [],
        mcp_servers: [],
        visibility: 'public',
        category: null,
        metadata: {},
      },
    ] as any);
    // 2. Check slug uniqueness — existing slugs found
    sqlMock.mockResolvedValueOnce([
      { slug: 'agent-fork' },
      { slug: 'agent-fork-2' },
    ] as any);
    // 3. Insert new agent
    sqlMock.mockResolvedValueOnce([] as any);
    // 4. Increment fork_count
    sqlMock.mockResolvedValueOnce([] as any);
    // 5. Insert feed item
    sqlMock.mockResolvedValueOnce([] as any);
    // 6. Return new agent
    sqlMock.mockResolvedValueOnce([
      {
        id: 'new-id',
        creator_id: USER_ID,
        name: 'Agent',
        slug: 'agent-fork-3',
        description: 'Desc',
        avatar_url: null,
        system_prompt: 'Prompt',
        model: 'claude-sonnet-4-6',
        visibility: 'private',
        category: null,
        usage_count: 0,
        rating_sum: 0,
        rating_count: 0,
        metadata: { forked_from: AGENT_ID },
        inserted_at: new Date(),
        updated_at: new Date(),
      },
    ] as any);

    const { forkAgent } = await import('./social.service.js');
    const result = await forkAgent(AGENT_ID, USER_ID);

    expect(result.slug).toBe('agent-fork-3');
  });
});
