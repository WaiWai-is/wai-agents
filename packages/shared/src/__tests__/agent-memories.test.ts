import { describe, expect, it } from 'vitest';
import type { AgentMemory, AgentMemoryType, CreateMemoryInput, UpdateMemoryInput } from '../types/agent-memories.js';

/* ================================================================
 * AgentMemoryType exhaustiveness
 * ================================================================ */
describe('AgentMemoryType', () => {
  it('allows all valid memory types', () => {
    const validTypes: AgentMemoryType[] = ['fact', 'preference', 'context', 'relationship'];
    expect(validTypes).toHaveLength(4);
  });

  it('type assertion compiles for each valid type', () => {
    const fact: AgentMemoryType = 'fact';
    const preference: AgentMemoryType = 'preference';
    const context: AgentMemoryType = 'context';
    const relationship: AgentMemoryType = 'relationship';
    expect([fact, preference, context, relationship]).toHaveLength(4);
  });
});

/* ================================================================
 * AgentMemory interface shape
 * ================================================================ */
describe('AgentMemory interface', () => {
  it('satisfies the interface with all required fields', () => {
    const memory: AgentMemory = {
      id: 'mem-1',
      agent_id: 'agent-1',
      user_id: 'user-1',
      memory_type: 'fact',
      content: 'User prefers dark mode',
      embedding_key: 'dark-mode',
      importance: 0.8,
      access_count: 5,
      last_accessed_at: '2026-03-10T12:00:00Z',
      expires_at: null,
      metadata: { source: 'explicit' },
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-03-10T12:00:00Z',
    };

    expect(memory.id).toBe('mem-1');
    expect(memory.memory_type).toBe('fact');
    expect(memory.importance).toBe(0.8);
    expect(memory.access_count).toBe(5);
  });

  it('allows null for nullable fields', () => {
    const memory: AgentMemory = {
      id: 'mem-2',
      agent_id: 'agent-2',
      user_id: 'user-2',
      memory_type: 'preference',
      content: 'Prefers short responses',
      embedding_key: null,
      importance: 0.5,
      access_count: 0,
      last_accessed_at: null,
      expires_at: null,
      metadata: {},
      created_at: null,
      updated_at: null,
    };

    expect(memory.embedding_key).toBeNull();
    expect(memory.last_accessed_at).toBeNull();
    expect(memory.expires_at).toBeNull();
    expect(memory.created_at).toBeNull();
    expect(memory.updated_at).toBeNull();
  });

  it('allows empty metadata object', () => {
    const memory: AgentMemory = {
      id: 'mem-3',
      agent_id: 'agent-3',
      user_id: 'user-3',
      memory_type: 'context',
      content: 'In a meeting',
      embedding_key: null,
      importance: 0.3,
      access_count: 0,
      last_accessed_at: null,
      expires_at: null,
      metadata: {},
      created_at: null,
      updated_at: null,
    };

    expect(memory.metadata).toEqual({});
  });
});

/* ================================================================
 * CreateMemoryInput interface
 * ================================================================ */
describe('CreateMemoryInput interface', () => {
  it('accepts minimal required fields', () => {
    const input: CreateMemoryInput = {
      memory_type: 'fact',
      content: 'Test content',
    };

    expect(input.memory_type).toBe('fact');
    expect(input.content).toBe('Test content');
    expect(input.embedding_key).toBeUndefined();
    expect(input.importance).toBeUndefined();
    expect(input.expires_at).toBeUndefined();
    expect(input.metadata).toBeUndefined();
  });

  it('accepts all optional fields', () => {
    const input: CreateMemoryInput = {
      memory_type: 'relationship',
      content: 'User is a developer',
      embedding_key: 'dev-role',
      importance: 0.9,
      expires_at: '2027-01-01T00:00:00Z',
      metadata: { source: 'conversation', turn: 5 },
    };

    expect(input.embedding_key).toBe('dev-role');
    expect(input.importance).toBe(0.9);
    expect(input.metadata).toEqual({ source: 'conversation', turn: 5 });
  });
});

/* ================================================================
 * UpdateMemoryInput interface
 * ================================================================ */
describe('UpdateMemoryInput interface', () => {
  it('accepts a fully empty update (all optional)', () => {
    const input: UpdateMemoryInput = {};
    expect(Object.keys(input)).toHaveLength(0);
  });

  it('accepts partial updates', () => {
    const input: UpdateMemoryInput = {
      content: 'Updated content',
      importance: 0.7,
    };

    expect(input.content).toBe('Updated content');
    expect(input.importance).toBe(0.7);
    expect(input.memory_type).toBeUndefined();
  });

  it('accepts null for nullable fields (clearing values)', () => {
    const input: UpdateMemoryInput = {
      embedding_key: null,
      expires_at: null,
    };

    expect(input.embedding_key).toBeNull();
    expect(input.expires_at).toBeNull();
  });
});
