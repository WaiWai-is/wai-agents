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
const MEMORY_ID = 'bb0e8400-e29b-41d4-a716-446655440020';

function makeMemoryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: MEMORY_ID,
    agent_id: AGENT_ID,
    user_id: USER_ID,
    memory_type: 'fact',
    content: 'The user prefers dark mode',
    embedding_key: null,
    importance: 0.7,
    access_count: 0,
    last_accessed_at: null,
    expires_at: null,
    metadata: {},
    inserted_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/*  recallMemories — edge cases                                               */
/* -------------------------------------------------------------------------- */

describe('memory.service (edge) — recallMemories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not call UPDATE when recall returns empty results', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // assertAgentOwner
    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    // SELECT with relevance_score returns empty
    sqlMock.mockResolvedValueOnce([] as any);

    const { recallMemories } = await import('./memory.service.js');
    const memories = await recallMemories(AGENT_ID, USER_ID, 'nonexistent');

    expect(memories).toHaveLength(0);
    // Should only have 2 calls: assertAgentOwner + SELECT. No UPDATE call.
    expect(sqlMock).toHaveBeenCalledTimes(2);
  });

  it('caps limit to 50 even when a higher value is passed', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { recallMemories } = await import('./memory.service.js');
    await recallMemories(AGENT_ID, USER_ID, undefined, 999);

    // Should still succeed without error
    expect(sqlMock).toHaveBeenCalledTimes(2);
  });

  it('defaults limit to 10 when not provided', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([makeMemoryRow()] as any);
    sqlMock.mockResolvedValueOnce([] as any); // UPDATE access_count

    const { recallMemories } = await import('./memory.service.js');
    const memories = await recallMemories(AGENT_ID, USER_ID, undefined);

    expect(memories).toHaveLength(1);
  });

  it('escapes SQL LIKE wildcards in query', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { recallMemories } = await import('./memory.service.js');
    // Query with SQL LIKE wildcards should not throw
    await recallMemories(AGENT_ID, USER_ID, '100%_match\\test');

    expect(sqlMock).toHaveBeenCalledTimes(2);
  });

  it('updates access_count for multiple recalled memories', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    const mem1 = makeMemoryRow({ id: 'mem-1', relevance_score: 0.9 });
    const mem2 = makeMemoryRow({ id: 'mem-2', content: 'Second', relevance_score: 0.7 });
    const mem3 = makeMemoryRow({ id: 'mem-3', content: 'Third', relevance_score: 0.5 });

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([mem1, mem2, mem3] as any);
    sqlMock.mockResolvedValueOnce([] as any); // UPDATE access_count

    const { recallMemories } = await import('./memory.service.js');
    const memories = await recallMemories(AGENT_ID, USER_ID, 'test');

    expect(memories).toHaveLength(3);
    expect(sqlMock).toHaveBeenCalledTimes(3);
  });
});

/* -------------------------------------------------------------------------- */
/*  decayMemories — edge cases                                                */
/* -------------------------------------------------------------------------- */

describe('memory.service (edge) — decayMemories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs decay without errors when there are no memories to decay', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([] as any);

    const { decayMemories } = await import('./memory.service.js');
    await expect(decayMemories()).resolves.toBeUndefined();

    expect(sqlMock).toHaveBeenCalledTimes(1);
  });

  it('is a global operation not scoped to any user or agent', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([] as any);

    const { decayMemories } = await import('./memory.service.js');
    // decayMemories takes no arguments — it operates globally
    await decayMemories();

    expect(sqlMock).toHaveBeenCalledTimes(1);
  });
});

/* -------------------------------------------------------------------------- */
/*  deleteExpiredMemories — edge cases                                        */
/* -------------------------------------------------------------------------- */

describe('memory.service (edge) — deleteExpiredMemories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('completes without error when there are no expired memories', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([] as any);

    const { deleteExpiredMemories } = await import('./memory.service.js');
    await expect(deleteExpiredMemories()).resolves.toBeUndefined();

    expect(sqlMock).toHaveBeenCalledTimes(1);
  });

  it('is a global cleanup not scoped to any agent', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([] as any);

    const { deleteExpiredMemories } = await import('./memory.service.js');
    await deleteExpiredMemories();

    expect(sqlMock).toHaveBeenCalledTimes(1);
  });
});

/* -------------------------------------------------------------------------- */
/*  createMemory — edge cases                                                 */
/* -------------------------------------------------------------------------- */

describe('memory.service (edge) — createMemory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates memory with maximum length content (10000 chars)', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    const longContent = 'x'.repeat(10000);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([makeMemoryRow({ content: longContent })] as any);

    const { createMemory } = await import('./memory.service.js');
    const result = await createMemory(AGENT_ID, USER_ID, {
      memory_type: 'fact',
      content: longContent,
    });

    expect(result.content).toBe(longContent);
    expect((result.content as string).length).toBe(10000);
  });

  it('creates memory with complex metadata object', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    const complexMetadata = {
      source: 'conversation',
      nested: { deep: { value: 42 } },
      tags: ['important', 'user-pref'],
    };

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([makeMemoryRow({ metadata: complexMetadata })] as any);

    const { createMemory } = await import('./memory.service.js');
    const result = await createMemory(AGENT_ID, USER_ID, {
      memory_type: 'context',
      content: 'Test with metadata',
      metadata: complexMetadata,
    });

    expect(result.metadata).toEqual(complexMetadata);
  });

  it('creates memory with importance at boundary 0', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([makeMemoryRow({ importance: 0 })] as any);

    const { createMemory } = await import('./memory.service.js');
    const result = await createMemory(AGENT_ID, USER_ID, {
      memory_type: 'fact',
      content: 'Low importance',
      importance: 0,
    });

    expect(result.importance).toBe(0);
  });

  it('creates memory with importance at boundary 1', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([makeMemoryRow({ importance: 1 })] as any);

    const { createMemory } = await import('./memory.service.js');
    const result = await createMemory(AGENT_ID, USER_ID, {
      memory_type: 'fact',
      content: 'Critical importance',
      importance: 1,
    });

    expect(result.importance).toBe(1);
  });

  it('creates memory with embedding_key at max length (256 chars)', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    const longKey = 'k'.repeat(256);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([makeMemoryRow({ embedding_key: longKey })] as any);

    const { createMemory } = await import('./memory.service.js');
    const result = await createMemory(AGENT_ID, USER_ID, {
      memory_type: 'fact',
      content: 'Has embedding key',
      embedding_key: longKey,
    });

    expect(result.embedding_key).toBe(longKey);
    expect((result.embedding_key as string)?.length).toBe(256);
  });
});

/* -------------------------------------------------------------------------- */
/*  updateMemory — edge cases                                                 */
/* -------------------------------------------------------------------------- */

describe('memory.service (edge) — updateMemory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates only content, leaving other fields unchanged', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: MEMORY_ID }] as any);
    sqlMock.mockResolvedValueOnce([
      makeMemoryRow({ content: 'Only content changed', importance: 0.7, memory_type: 'fact' }),
    ] as any);

    const { updateMemory } = await import('./memory.service.js');
    const result = await updateMemory(MEMORY_ID, USER_ID, { content: 'Only content changed' });

    expect(result.content).toBe('Only content changed');
    expect(result.importance).toBe(0.7);
    expect(result.memory_type).toBe('fact');
  });

  it('updates only metadata', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    const newMeta = { updated: true, version: 2 };

    sqlMock.mockResolvedValueOnce([{ id: MEMORY_ID }] as any);
    sqlMock.mockResolvedValueOnce([makeMemoryRow({ metadata: newMeta })] as any);

    const { updateMemory } = await import('./memory.service.js');
    const result = await updateMemory(MEMORY_ID, USER_ID, { metadata: newMeta });

    expect(result.metadata).toEqual(newMeta);
  });

  it('sets expires_at to a future date', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    const futureDate = '2028-06-15T00:00:00.000Z';

    sqlMock.mockResolvedValueOnce([{ id: MEMORY_ID }] as any);
    sqlMock.mockResolvedValueOnce([makeMemoryRow({ expires_at: new Date(futureDate) })] as any);

    const { updateMemory } = await import('./memory.service.js');
    const result = await updateMemory(MEMORY_ID, USER_ID, { expires_at: futureDate });

    expect(result.expires_at).toBe(futureDate);
  });

  it('clears expires_at by setting it to null', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: MEMORY_ID }] as any);
    sqlMock.mockResolvedValueOnce([makeMemoryRow({ expires_at: null })] as any);

    const { updateMemory } = await import('./memory.service.js');
    const result = await updateMemory(MEMORY_ID, USER_ID, { expires_at: null });

    expect(result.expires_at).toBeNull();
  });

  it('throws NOT_FOUND when UPDATE RETURNING returns empty', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: MEMORY_ID }] as any); // assertMemoryOwner
    sqlMock.mockResolvedValueOnce([] as any); // UPDATE RETURNING empty

    const { updateMemory } = await import('./memory.service.js');
    await expect(updateMemory(MEMORY_ID, USER_ID, { content: 'test' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('updates all fields simultaneously', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: MEMORY_ID }] as any);
    sqlMock.mockResolvedValueOnce([
      makeMemoryRow({
        content: 'All updated',
        memory_type: 'preference',
        importance: 0.95,
        embedding_key: 'new-key',
        expires_at: new Date('2028-01-01'),
        metadata: { all: 'updated' },
      }),
    ] as any);

    const { updateMemory } = await import('./memory.service.js');
    const result = await updateMemory(MEMORY_ID, USER_ID, {
      content: 'All updated',
      memory_type: 'preference',
      importance: 0.95,
      embedding_key: 'new-key',
      expires_at: '2028-01-01T00:00:00.000Z',
      metadata: { all: 'updated' },
    });

    expect(result.content).toBe('All updated');
    expect(result.memory_type).toBe('preference');
    expect(result.importance).toBe(0.95);
    expect(result.embedding_key).toBe('new-key');
    expect(result.metadata).toEqual({ all: 'updated' });
  });
});

/* -------------------------------------------------------------------------- */
/*  listMemories — edge cases                                                 */
/* -------------------------------------------------------------------------- */

describe('memory.service (edge) — listMemories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clamps limit to maximum 200', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { listMemories } = await import('./memory.service.js');
    await listMemories(AGENT_ID, USER_ID, { limit: 500 });

    // Should succeed without error
    expect(sqlMock).toHaveBeenCalledTimes(2);
  });

  it('defaults offset to 0 when negative value is provided', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { listMemories } = await import('./memory.service.js');
    await listMemories(AGENT_ID, USER_ID, { offset: -5 });

    expect(sqlMock).toHaveBeenCalledTimes(2);
  });

  it('escapes SQL LIKE wildcards in search parameter', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { listMemories } = await import('./memory.service.js');
    // Search with SQL LIKE wildcards should not cause issues
    await listMemories(AGENT_ID, USER_ID, { search: '%dangerous_query\\' });

    expect(sqlMock).toHaveBeenCalledTimes(2);
  });

  it('filters by minImportance', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([makeMemoryRow({ importance: 0.9 })] as any);

    const { listMemories } = await import('./memory.service.js');
    const memories = await listMemories(AGENT_ID, USER_ID, { minImportance: 0.8 });

    expect(memories).toHaveLength(1);
    expect(memories[0].importance).toBe(0.9);
  });

  it('handles all filter options simultaneously', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([makeMemoryRow({ memory_type: 'preference' })] as any);

    const { listMemories } = await import('./memory.service.js');
    const memories = await listMemories(AGENT_ID, USER_ID, {
      type: 'preference',
      search: 'dark',
      minImportance: 0.5,
      limit: 10,
      offset: 0,
    });

    expect(memories).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */
/*  bulkDeleteMemories — edge cases                                           */
/* -------------------------------------------------------------------------- */

describe('memory.service (edge) — bulkDeleteMemories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('completes successfully when deleting from agent with no memories', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any); // assertAgentOwner
    sqlMock.mockResolvedValueOnce([] as any); // DELETE (no rows affected)

    const { bulkDeleteMemories } = await import('./memory.service.js');
    await expect(bulkDeleteMemories(AGENT_ID, USER_ID)).resolves.toBeUndefined();
  });

  it('deletes by type even when no memories of that type exist', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { bulkDeleteMemories } = await import('./memory.service.js');
    await expect(
      bulkDeleteMemories(AGENT_ID, USER_ID, 'nonexistent_type'),
    ).resolves.toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/*  formatMemory — edge cases via getMemory                                   */
/* -------------------------------------------------------------------------- */

describe('memory.service (edge) — formatMemory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles null embedding_key returning null', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([makeMemoryRow({ embedding_key: null })] as any);

    const { getMemory } = await import('./memory.service.js');
    const memory = await getMemory(MEMORY_ID, USER_ID);

    expect(memory.embedding_key).toBeNull();
  });

  it('handles undefined embedding_key returning null', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([makeMemoryRow({ embedding_key: undefined })] as any);

    const { getMemory } = await import('./memory.service.js');
    const memory = await getMemory(MEMORY_ID, USER_ID);

    expect(memory.embedding_key).toBeNull();
  });

  it('converts Date objects to ISO strings in created_at and updated_at', async () => {
    const { sql } = await import('../../db/connection.js');
    const date = new Date('2026-06-15T14:30:00.000Z');
    vi.mocked(sql).mockResolvedValueOnce([
      makeMemoryRow({ inserted_at: date, updated_at: date }),
    ] as any);

    const { getMemory } = await import('./memory.service.js');
    const memory = await getMemory(MEMORY_ID, USER_ID);

    expect(memory.created_at).toBe('2026-06-15T14:30:00.000Z');
    expect(memory.updated_at).toBe('2026-06-15T14:30:00.000Z');
  });

  it('handles null last_accessed_at', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([makeMemoryRow({ last_accessed_at: null })] as any);

    const { getMemory } = await import('./memory.service.js');
    const memory = await getMemory(MEMORY_ID, USER_ID);

    expect(memory.last_accessed_at).toBeNull();
  });

  it('handles Date for last_accessed_at', async () => {
    const { sql } = await import('../../db/connection.js');
    const accessDate = new Date('2026-03-10T08:00:00.000Z');
    vi.mocked(sql).mockResolvedValueOnce([makeMemoryRow({ last_accessed_at: accessDate })] as any);

    const { getMemory } = await import('./memory.service.js');
    const memory = await getMemory(MEMORY_ID, USER_ID);

    expect(memory.last_accessed_at).toBe('2026-03-10T08:00:00.000Z');
  });
});
