import { describe, expect, it } from 'vitest';
import { CreateMemorySchema, MemoryTypeEnum, UpdateMemorySchema } from './memory.schema.js';

/* ================================================================
 * MemoryTypeEnum
 * ================================================================ */
describe('MemoryTypeEnum', () => {
  it.each(['fact', 'preference', 'context', 'relationship'] as const)(
    'accepts valid type "%s"',
    (type) => {
      expect(MemoryTypeEnum.parse(type)).toBe(type);
    },
  );

  it('rejects invalid memory type', () => {
    expect(MemoryTypeEnum.safeParse('observation').success).toBe(false);
  });

  it('rejects empty string', () => {
    expect(MemoryTypeEnum.safeParse('').success).toBe(false);
  });

  it('rejects undefined', () => {
    expect(MemoryTypeEnum.safeParse(undefined).success).toBe(false);
  });

  it('rejects numeric value', () => {
    expect(MemoryTypeEnum.safeParse(42).success).toBe(false);
  });
});

/* ================================================================
 * CreateMemorySchema
 * ================================================================ */
describe('CreateMemorySchema', () => {
  it('accepts a minimal valid input', () => {
    const data = { memory_type: 'fact', content: 'The user likes TypeScript' };
    const result = CreateMemorySchema.parse(data);
    expect(result.memory_type).toBe('fact');
    expect(result.content).toBe('The user likes TypeScript');
  });

  it('accepts a fully specified input', () => {
    const data = {
      memory_type: 'preference',
      content: 'Prefers dark mode',
      embedding_key: 'dark-mode-pref',
      importance: 0.9,
      expires_at: '2026-12-31T23:59:59Z',
      metadata: { source: 'explicit' },
    };
    const result = CreateMemorySchema.parse(data);
    expect(result.importance).toBe(0.9);
    expect(result.embedding_key).toBe('dark-mode-pref');
    expect(result.metadata).toEqual({ source: 'explicit' });
  });

  it('strips HTML tags from content', () => {
    const data = {
      memory_type: 'fact',
      content: '<script>alert("xss")</script>Clean text',
    };
    const result = CreateMemorySchema.parse(data);
    expect(result.content).toBe('alert("xss")Clean text');
  });

  it('strips nested HTML tags from content', () => {
    const data = {
      memory_type: 'fact',
      content: '<div><b>Bold</b> and <a href="https://evil.com">link</a></div>',
    };
    const result = CreateMemorySchema.parse(data);
    expect(result.content).toBe('Bold and link');
  });

  it('rejects empty content', () => {
    const result = CreateMemorySchema.safeParse({ memory_type: 'fact', content: '' });
    expect(result.success).toBe(false);
  });

  it('rejects content exceeding 10000 characters', () => {
    const result = CreateMemorySchema.safeParse({
      memory_type: 'fact',
      content: 'a'.repeat(10001),
    });
    expect(result.success).toBe(false);
  });

  it('accepts content at exactly 10000 characters', () => {
    const result = CreateMemorySchema.parse({
      memory_type: 'fact',
      content: 'a'.repeat(10000),
    });
    expect(result.content).toBe('a'.repeat(10000));
  });

  it('rejects missing memory_type', () => {
    const result = CreateMemorySchema.safeParse({ content: 'Something' });
    expect(result.success).toBe(false);
  });

  it('rejects missing content', () => {
    const result = CreateMemorySchema.safeParse({ memory_type: 'fact' });
    expect(result.success).toBe(false);
  });

  it('rejects importance below 0', () => {
    const result = CreateMemorySchema.safeParse({
      memory_type: 'fact',
      content: 'test',
      importance: -0.1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects importance above 1', () => {
    const result = CreateMemorySchema.safeParse({
      memory_type: 'fact',
      content: 'test',
      importance: 1.1,
    });
    expect(result.success).toBe(false);
  });

  it('accepts importance at boundaries 0 and 1', () => {
    expect(
      CreateMemorySchema.parse({ memory_type: 'fact', content: 'test', importance: 0 }).importance,
    ).toBe(0);
    expect(
      CreateMemorySchema.parse({ memory_type: 'fact', content: 'test', importance: 1 }).importance,
    ).toBe(1);
  });

  it('rejects embedding_key exceeding 256 characters', () => {
    const result = CreateMemorySchema.safeParse({
      memory_type: 'fact',
      content: 'test',
      embedding_key: 'k'.repeat(257),
    });
    expect(result.success).toBe(false);
  });

  it('accepts embedding_key at exactly 256 characters', () => {
    const result = CreateMemorySchema.parse({
      memory_type: 'fact',
      content: 'test',
      embedding_key: 'k'.repeat(256),
    });
    expect(result.embedding_key).toBe('k'.repeat(256));
  });

  it('rejects invalid datetime for expires_at', () => {
    const result = CreateMemorySchema.safeParse({
      memory_type: 'fact',
      content: 'test',
      expires_at: 'not-a-date',
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid ISO datetime for expires_at', () => {
    const result = CreateMemorySchema.parse({
      memory_type: 'fact',
      content: 'test',
      expires_at: '2026-06-15T12:00:00Z',
    });
    expect(result.expires_at).toBe('2026-06-15T12:00:00Z');
  });

  it('accepts unicode content', () => {
    const data = { memory_type: 'fact', content: 'Пользователь говорит по-русски 🎉' };
    const result = CreateMemorySchema.parse(data);
    expect(result.content).toContain('🎉');
  });

  it('accepts metadata with nested objects', () => {
    const data = {
      memory_type: 'context',
      content: 'test',
      metadata: { nested: { deep: { value: 42 } } },
    };
    const result = CreateMemorySchema.parse(data);
    expect(result.metadata).toEqual({ nested: { deep: { value: 42 } } });
  });
});

/* ================================================================
 * UpdateMemorySchema
 * ================================================================ */
describe('UpdateMemorySchema', () => {
  it('accepts an empty update (all fields optional)', () => {
    expect(UpdateMemorySchema.parse({})).toEqual({});
  });

  it('accepts a partial update with only content', () => {
    const result = UpdateMemorySchema.parse({ content: 'Updated content' });
    expect(result.content).toBe('Updated content');
  });

  it('strips HTML from content in update', () => {
    const result = UpdateMemorySchema.parse({ content: '<b>Updated</b>' });
    expect(result.content).toBe('Updated');
  });

  it('accepts nullable embedding_key', () => {
    const result = UpdateMemorySchema.parse({ embedding_key: null });
    expect(result.embedding_key).toBeNull();
  });

  it('accepts nullable expires_at', () => {
    const result = UpdateMemorySchema.parse({ expires_at: null });
    expect(result.expires_at).toBeNull();
  });

  it('rejects content exceeding 10000 characters', () => {
    const result = UpdateMemorySchema.safeParse({ content: 'a'.repeat(10001) });
    expect(result.success).toBe(false);
  });

  it('rejects empty content string (min 1)', () => {
    const result = UpdateMemorySchema.safeParse({ content: '' });
    expect(result.success).toBe(false);
  });

  it('rejects importance outside valid range', () => {
    expect(UpdateMemorySchema.safeParse({ importance: -0.5 }).success).toBe(false);
    expect(UpdateMemorySchema.safeParse({ importance: 1.5 }).success).toBe(false);
  });

  it('accepts a full update with all fields', () => {
    const data = {
      content: 'New content',
      memory_type: 'relationship' as const,
      importance: 0.8,
      embedding_key: 'new-key',
      expires_at: '2027-01-01T00:00:00Z',
      metadata: { updated: true },
    };
    const result = UpdateMemorySchema.parse(data);
    expect(result.content).toBe('New content');
    expect(result.memory_type).toBe('relationship');
    expect(result.importance).toBe(0.8);
  });

  it('rejects invalid memory_type in update', () => {
    const result = UpdateMemorySchema.safeParse({ memory_type: 'invalid' });
    expect(result.success).toBe(false);
  });
});
