import { describe, expect, it, vi } from 'vitest';
import { asTextContent, createIdempotencyKey, getErrorMessage, toIsoLocal, toSessionUser } from '../utils';

/* ================================================================
 * toSessionUser
 * ================================================================ */
describe('toSessionUser', () => {
  it('maps all fields correctly', () => {
    const user = {
      id: 'u1',
      username: 'alice',
      display_name: 'Alice A',
      email: 'alice@example.com',
      avatar_url: 'https://example.com/alice.png',
      bio: 'Hello world',
    };

    const result = toSessionUser(user);
    expect(result).toEqual({
      id: 'u1',
      username: 'alice',
      display_name: 'Alice A',
      email: 'alice@example.com',
      avatar_url: 'https://example.com/alice.png',
      bio: 'Hello world',
    });
  });

  it('handles null fields', () => {
    const user = {
      id: 'u2',
      username: 'bob',
      display_name: null,
      avatar_url: null,
      bio: null,
    };

    const result = toSessionUser(user);
    expect(result.display_name).toBeNull();
    expect(result.avatar_url).toBeNull();
    expect(result.bio).toBeNull();
    expect(result.email).toBeUndefined();
  });

  it('preserves email when provided', () => {
    const result = toSessionUser({
      id: 'u3',
      username: 'charlie',
      display_name: null,
      email: 'charlie@test.com',
      avatar_url: null,
      bio: null,
    });
    expect(result.email).toBe('charlie@test.com');
  });

  it('omits email when not provided', () => {
    const result = toSessionUser({
      id: 'u4',
      username: 'dave',
      display_name: null,
      avatar_url: null,
      bio: null,
    });
    expect(result.email).toBeUndefined();
  });
});

/* ================================================================
 * getErrorMessage
 * ================================================================ */
describe('getErrorMessage', () => {
  it('extracts message from Error instance', () => {
    expect(getErrorMessage(new Error('Something went wrong'))).toBe('Something went wrong');
  });

  it('extracts reason from object with reason property', () => {
    expect(getErrorMessage({ reason: 'bad request' })).toBe('bad request');
  });

  it('returns fallback for null', () => {
    expect(getErrorMessage(null)).toBe('Request failed');
  });

  it('returns fallback for undefined', () => {
    expect(getErrorMessage(undefined)).toBe('Request failed');
  });

  it('returns fallback for number', () => {
    expect(getErrorMessage(42)).toBe('Request failed');
  });

  it('returns fallback for string (not Error)', () => {
    expect(getErrorMessage('plain string')).toBe('Request failed');
  });

  it('returns custom fallback when provided', () => {
    expect(getErrorMessage(null, 'Custom error')).toBe('Custom error');
  });

  it('returns fallback for empty Error message', () => {
    const err = new Error('');
    expect(getErrorMessage(err)).toBe('Request failed');
  });

  it('returns reason as string for numeric reason', () => {
    expect(getErrorMessage({ reason: 404 })).toBe('404');
  });

  it('prefers Error.message over reason property', () => {
    const err = new Error('error msg');
    (err as any).reason = 'reason msg';
    expect(getErrorMessage(err)).toBe('error msg');
  });
});

/* ================================================================
 * createIdempotencyKey
 * ================================================================ */
describe('createIdempotencyKey', () => {
  it('returns a non-empty string', () => {
    const key = createIdempotencyKey();
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(0);
  });

  it('returns unique keys on consecutive calls', () => {
    const keys = new Set<string>();
    for (let i = 0; i < 100; i++) {
      keys.add(createIdempotencyKey());
    }
    expect(keys.size).toBe(100);
  });

  it('returns UUID format when crypto.randomUUID is available', () => {
    const key = createIdempotencyKey();
    // Should be UUID-like (contains dashes)
    expect(key).toContain('-');
  });
});

/* ================================================================
 * asTextContent
 * ================================================================ */
describe('asTextContent', () => {
  it('returns empty string for null', () => {
    expect(asTextContent(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(asTextContent(undefined)).toBe('');
  });

  it('returns empty string for 0', () => {
    expect(asTextContent(0)).toBe('');
  });

  it('returns empty string for false', () => {
    expect(asTextContent(false)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(asTextContent('')).toBe('');
  });

  it('returns string content directly', () => {
    expect(asTextContent('hello world')).toBe('hello world');
  });

  it('extracts text from array of strings', () => {
    expect(asTextContent(['hello', 'world'])).toBe('hello\nworld');
  });

  it('extracts text from array of objects with text property', () => {
    expect(asTextContent([{ text: 'line 1' }, { text: 'line 2' }])).toBe('line 1\nline 2');
  });

  it('handles mixed array of strings and objects', () => {
    expect(asTextContent(['prefix', { text: 'suffix' }])).toBe('prefix\nsuffix');
  });

  it('filters out empty strings in array', () => {
    expect(asTextContent(['hello', '', 'world'])).toBe('hello\nworld');
  });

  it('handles array with objects missing text property', () => {
    expect(asTextContent([{ notText: 'x' }, { text: 'found' }])).toBe('found');
  });

  it('extracts text from object with text property', () => {
    expect(asTextContent({ text: 'from object' })).toBe('from object');
  });

  it('returns empty for object without text property', () => {
    expect(asTextContent({ notText: 'no' })).toBe('');
  });

  it('returns empty for object with non-string text', () => {
    expect(asTextContent({ text: 42 })).toBe('');
  });

  it('returns empty for empty array', () => {
    expect(asTextContent([])).toBe('');
  });

  it('handles deeply nested content (only one level)', () => {
    expect(asTextContent({ text: { nested: true } })).toBe('');
  });

  it('handles array with null entries', () => {
    expect(asTextContent([null, 'text', null])).toBe('text');
  });
});

/* ================================================================
 * toIsoLocal
 * ================================================================ */
describe('toIsoLocal', () => {
  it('returns empty string for null', () => {
    expect(toIsoLocal(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(toIsoLocal(undefined)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(toIsoLocal('')).toBe('');
  });

  it('returns locale string for valid ISO date', () => {
    const result = toIsoLocal('2026-01-15T12:00:00Z');
    expect(result.length).toBeGreaterThan(0);
    // Should contain some recognizable date component
    expect(result).toBeTruthy();
  });

  it('returns empty string for invalid date string', () => {
    expect(toIsoLocal('not-a-date')).toBe('');
  });

  it('returns empty string for garbage input', () => {
    expect(toIsoLocal('xyz')).toBe('');
  });

  it('handles date-only string', () => {
    const result = toIsoLocal('2026-06-15');
    expect(result.length).toBeGreaterThan(0);
  });
});
