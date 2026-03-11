import { describe, expect, it } from 'vitest';
import { formatConversation, toISO } from './utils.js';

/* ================================================================
 * toISO — additional edge cases
 * ================================================================ */
describe('toISO — additional edge cases', () => {
  it('returns null for NaN', () => {
    expect(toISO(Number.NaN)).toBeNull();
  });

  it('returns null for Infinity', () => {
    // new Date(String(Infinity)) is NaN
    expect(toISO(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('returns null for an object', () => {
    expect(toISO({})).toBeNull();
  });

  it('returns null for an array', () => {
    expect(toISO([])).toBeNull();
  });

  it('handles Date at epoch (1970-01-01)', () => {
    const date = new Date(0);
    expect(toISO(date)).toBe('1970-01-01T00:00:00.000Z');
  });

  it('handles far-future dates', () => {
    const date = new Date('9999-12-31T23:59:59Z');
    const result = toISO(date);
    expect(result).toBeTruthy();
    expect(result).toContain('9999-12-31');
  });

  it('handles negative timestamp date', () => {
    // Before epoch
    const date = new Date('1900-01-01T00:00:00Z');
    const result = toISO(date);
    expect(result).toBeTruthy();
    expect(result).toContain('1900-01-01');
  });

  it('returns ISO for a valid Date instance', () => {
    const d = new Date('2025-03-15T10:00:00Z');
    expect(toISO(d)).toBe('2025-03-15T10:00:00.000Z');
  });

  it('handles date string with milliseconds', () => {
    const result = toISO('2025-06-15T12:30:00.123Z');
    expect(result).toBe('2025-06-15T12:30:00.123Z');
  });
});

/* ================================================================
 * formatConversation — additional edge cases
 * ================================================================ */
describe('formatConversation — additional edge cases', () => {
  it('preserves metadata with nested objects', () => {
    const row = {
      id: 'conv-1',
      type: 'dm',
      title: null,
      avatar_url: null,
      creator_id: 'user-1',
      agent_id: null,
      metadata: { nested: { deep: true }, array: [1, 2, 3] },
      last_message_at: null,
      inserted_at: null,
      updated_at: null,
    };

    const result = formatConversation(row);
    expect(result.metadata).toEqual({ nested: { deep: true }, array: [1, 2, 3] });
  });

  it('maps agent_id correctly', () => {
    const row = {
      id: 'conv-1',
      type: 'agent',
      title: 'Agent Chat',
      avatar_url: null,
      creator_id: 'user-1',
      agent_id: 'agent-42',
      metadata: {},
      last_message_at: null,
      inserted_at: null,
      updated_at: null,
    };

    const result = formatConversation(row);
    expect(result.agent_id).toBe('agent-42');
    expect(result.type).toBe('agent');
  });

  it('handles all fields being non-null', () => {
    const now = new Date('2026-03-01T12:00:00Z');
    const row = {
      id: 'conv-full',
      type: 'group',
      title: 'Full Conversation',
      avatar_url: 'https://example.com/avatar.jpg',
      creator_id: 'user-1',
      agent_id: 'agent-1',
      metadata: { theme: 'dark' },
      last_message_at: now,
      inserted_at: now,
      updated_at: now,
    };

    const result = formatConversation(row);
    expect(result.id).toBe('conv-full');
    expect(result.title).toBe('Full Conversation');
    expect(result.avatar_url).toBe('https://example.com/avatar.jpg');
    expect(result.last_message_at).toBe('2026-03-01T12:00:00.000Z');
    expect(result.created_at).toBe('2026-03-01T12:00:00.000Z');
    expect(result.updated_at).toBe('2026-03-01T12:00:00.000Z');
  });

  it('handles row with extra unrelated fields', () => {
    const row = {
      id: 'conv-1',
      type: 'dm',
      title: null,
      avatar_url: null,
      creator_id: 'user-1',
      agent_id: null,
      metadata: {},
      last_message_at: null,
      inserted_at: null,
      updated_at: null,
      extra_field: 'should be ignored',
      another_field: 42,
    };

    const result = formatConversation(row);
    expect(result.id).toBe('conv-1');
    // Extra fields should not appear in result
    expect((result as any).extra_field).toBeUndefined();
    expect((result as any).another_field).toBeUndefined();
  });
});
