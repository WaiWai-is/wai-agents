import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('./db.js', () => ({
  sql: vi.fn(),
}));

vi.mock('./embeddings.js', () => ({
  generateEmbedding: vi.fn(),
  embeddingToString: vi.fn((v: number[]) => `[${v.join(',')}]`),
}));

vi.mock('node:crypto', () => ({
  randomUUID: vi.fn(() => 'test-uuid-1234-5678-abcd-ef1234567890'),
}));

import { sql } from './db.js';
import { generateEmbedding } from './embeddings.js';
import {
  SaveMemoryInput,
  SearchMemoriesInput,
  ForgetMemoryInput,
  UpdateMemoryInput,
  GetMemoriesInput,
  handleSaveMemory,
  handleSearchMemories,
  handleForgetMemory,
  handleUpdateMemory,
  handleGetMemories,
} from './tools.js';

const AGENT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const MEMORY_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const FAKE_EMBEDDING = Array(1536).fill(0.1);

// sql mock returns an object with a count property by default
function makeSqlResult(rows: unknown[] = [], count = 0) {
  const result = Object.assign([...rows], { count });
  return result;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockSql(rows: unknown[] = [], count = 0): any {
  return Promise.resolve(makeSqlResult(rows, count));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(generateEmbedding).mockResolvedValue(FAKE_EMBEDDING);
  vi.mocked(sql).mockReturnValue(mockSql([], 1));
});

// ─── Input Validation Tests ───────────────────────────────────────────────────

describe('SaveMemoryInput schema', () => {
  it('accepts valid input with defaults', () => {
    const result = SaveMemoryInput.safeParse({
      agent_id: AGENT_ID,
      user_id: USER_ID,
      content: 'User prefers dark mode',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.importance).toBe(0.5);
      expect(result.data.memory_type).toBe('observation');
      expect(result.data.tags).toEqual([]);
    }
  });

  it('rejects invalid UUID for agent_id', () => {
    const result = SaveMemoryInput.safeParse({
      agent_id: 'not-a-uuid',
      user_id: USER_ID,
      content: 'test',
    });
    expect(result.success).toBe(false);
  });

  it('rejects importance out of range', () => {
    const result = SaveMemoryInput.safeParse({
      agent_id: AGENT_ID,
      user_id: USER_ID,
      content: 'test',
      importance: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty content', () => {
    const result = SaveMemoryInput.safeParse({
      agent_id: AGENT_ID,
      user_id: USER_ID,
      content: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('SearchMemoriesInput schema', () => {
  it('accepts valid input with defaults', () => {
    const result = SearchMemoriesInput.safeParse({
      agent_id: AGENT_ID,
      user_id: USER_ID,
      query: 'dark mode preferences',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(10);
    }
  });

  it('rejects empty query', () => {
    const result = SearchMemoriesInput.safeParse({
      agent_id: AGENT_ID,
      user_id: USER_ID,
      query: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects limit over 100', () => {
    const result = SearchMemoriesInput.safeParse({
      agent_id: AGENT_ID,
      user_id: USER_ID,
      query: 'test',
      limit: 101,
    });
    expect(result.success).toBe(false);
  });
});

describe('ForgetMemoryInput schema', () => {
  it('accepts valid UUIDs', () => {
    const result = ForgetMemoryInput.safeParse({ memory_id: MEMORY_ID, agent_id: AGENT_ID, user_id: USER_ID });
    expect(result.success).toBe(true);
  });

  it('rejects invalid UUID', () => {
    const result = ForgetMemoryInput.safeParse({ memory_id: 'bad-id', agent_id: AGENT_ID, user_id: USER_ID });
    expect(result.success).toBe(false);
  });
});

describe('UpdateMemoryInput schema', () => {
  it('accepts partial updates', () => {
    const result = UpdateMemoryInput.safeParse({
      memory_id: MEMORY_ID,
      agent_id: AGENT_ID,
      user_id: USER_ID,
      importance: 0.8,
    });
    expect(result.success).toBe(true);
  });

  it('accepts content-only update', () => {
    const result = UpdateMemoryInput.safeParse({
      memory_id: MEMORY_ID,
      agent_id: AGENT_ID,
      user_id: USER_ID,
      content: 'Updated content',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty content', () => {
    const result = UpdateMemoryInput.safeParse({
      memory_id: MEMORY_ID,
      agent_id: AGENT_ID,
      user_id: USER_ID,
      content: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('GetMemoriesInput schema', () => {
  it('accepts valid input with defaults', () => {
    const result = GetMemoriesInput.safeParse({
      agent_id: AGENT_ID,
      user_id: USER_ID,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(20);
      expect(result.data.memory_type).toBeUndefined();
    }
  });
});

// ─── Handler Tests ────────────────────────────────────────────────────────────

describe('handleSaveMemory', () => {
  it('generates embedding and inserts record', async () => {
    const result = await handleSaveMemory({
      agent_id: AGENT_ID,
      user_id: USER_ID,
      content: 'User prefers TypeScript',
      importance: 0.8,
      memory_type: 'preference',
      tags: ['code', 'language'],
    });

    expect(generateEmbedding).toHaveBeenCalledWith('User prefers TypeScript');
    expect(sql).toHaveBeenCalledTimes(1);
    expect(result).toHaveProperty('memory_id');
    expect(typeof result.memory_id).toBe('string');
  });

  it('uses default values for optional fields', async () => {
    const result = await handleSaveMemory({
      agent_id: AGENT_ID,
      user_id: USER_ID,
      content: 'Some observation',
      importance: 0.5,
      memory_type: 'observation',
      tags: [],
    });

    expect(result).toHaveProperty('memory_id');
    expect(generateEmbedding).toHaveBeenCalledOnce();
  });
});

describe('handleSearchMemories', () => {
  it('generates query embedding and returns ranked results', async () => {
    const mockMemories = [
      {
        id: MEMORY_ID,
        content: 'User prefers TypeScript',
        importance: 0.8,
        memory_type: 'preference',
        similarity: 0.95,
      },
    ];
    vi.mocked(sql).mockReturnValue(
      mockSql(mockMemories, 1),
    );

    const result = await handleSearchMemories({
      agent_id: AGENT_ID,
      user_id: USER_ID,
      query: 'programming language preferences',
      limit: 10,
    });

    expect(generateEmbedding).toHaveBeenCalledWith('programming language preferences');
    expect(sql).toHaveBeenCalledTimes(1);
    expect(result.memories).toHaveLength(1);
    expect(result.memories[0].similarity).toBe(0.95);
    expect(result.memories[0].content).toBe('User prefers TypeScript');
  });

  it('returns empty array when no memories match', async () => {
    vi.mocked(sql).mockReturnValue(
      mockSql([], 0),
    );

    const result = await handleSearchMemories({
      agent_id: AGENT_ID,
      user_id: USER_ID,
      query: 'nonexistent topic',
      limit: 10,
    });

    expect(result.memories).toHaveLength(0);
  });
});

describe('handleForgetMemory', () => {
  it('deletes memory and returns deleted true when found', async () => {
    vi.mocked(sql).mockReturnValue(
      mockSql([], 1),
    );

    const result = await handleForgetMemory({ memory_id: MEMORY_ID, agent_id: AGENT_ID, user_id: USER_ID });

    expect(sql).toHaveBeenCalledTimes(1);
    expect(result.deleted).toBe(true);
  });

  it('returns deleted false when memory not found', async () => {
    vi.mocked(sql).mockReturnValue(
      mockSql([], 0),
    );

    const result = await handleForgetMemory({ memory_id: MEMORY_ID, agent_id: AGENT_ID, user_id: USER_ID });
    expect(result.deleted).toBe(false);
  });
});

describe('handleUpdateMemory', () => {
  it('returns updated false when no fields provided', async () => {
    const result = await handleUpdateMemory({ memory_id: MEMORY_ID, agent_id: AGENT_ID, user_id: USER_ID });
    expect(result.updated).toBe(false);
    expect(sql).not.toHaveBeenCalled();
  });

  it('regenerates embedding when content changes', async () => {
    vi.mocked(sql).mockReturnValue(
      mockSql([], 1),
    );

    const result = await handleUpdateMemory({
      memory_id: MEMORY_ID,
      agent_id: AGENT_ID,
      user_id: USER_ID,
      content: 'Updated preference',
    });

    expect(generateEmbedding).toHaveBeenCalledWith('Updated preference');
    expect(result.updated).toBe(true);
  });

  it('does not regenerate embedding when only importance changes', async () => {
    vi.mocked(sql).mockReturnValue(
      mockSql([], 1),
    );

    const result = await handleUpdateMemory({
      memory_id: MEMORY_ID,
      agent_id: AGENT_ID,
      user_id: USER_ID,
      importance: 0.9,
    });

    expect(generateEmbedding).not.toHaveBeenCalled();
    expect(result.updated).toBe(true);
  });

  it('returns updated false when memory not found', async () => {
    vi.mocked(sql).mockReturnValue(
      mockSql([], 0),
    );

    const result = await handleUpdateMemory({
      memory_id: MEMORY_ID,
      agent_id: AGENT_ID,
      user_id: USER_ID,
      importance: 0.5,
    });

    expect(result.updated).toBe(false);
  });
});

describe('handleGetMemories', () => {
  const mockMemories = [
    {
      id: MEMORY_ID,
      agent_id: AGENT_ID,
      user_id: USER_ID,
      content: 'User loves coffee',
      importance: 0.7,
      memory_type: 'fact',
      tags: ['preferences'],
      access_count: 3,
      inserted_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    },
  ];

  it('returns memories ordered by inserted_at desc', async () => {
    vi.mocked(sql).mockReturnValue(
      mockSql(mockMemories, 1),
    );

    const result = await handleGetMemories({
      agent_id: AGENT_ID,
      user_id: USER_ID,
      limit: 20,
    });

    expect(sql).toHaveBeenCalledTimes(1);
    expect(generateEmbedding).not.toHaveBeenCalled();
    expect(result.memories).toHaveLength(1);
    expect(result.memories[0].content).toBe('User loves coffee');
  });

  it('filters by memory_type when provided', async () => {
    vi.mocked(sql).mockReturnValue(
      mockSql(mockMemories, 1),
    );

    const result = await handleGetMemories({
      agent_id: AGENT_ID,
      user_id: USER_ID,
      memory_type: 'fact',
      limit: 20,
    });

    expect(sql).toHaveBeenCalledTimes(1);
    expect(result.memories).toHaveLength(1);
  });
});
