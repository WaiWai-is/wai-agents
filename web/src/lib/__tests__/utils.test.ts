import { describe, expect, it } from 'vitest';
import {
  asTextContent,
  createIdempotencyKey,
  getErrorMessage,
  toIsoLocal,
  toSessionUser,
} from '../utils';

describe('toSessionUser', () => {
  it('maps all fields from a full user object', () => {
    const input = {
      id: 'u_123',
      username: 'alex',
      display_name: 'Alex Dev',
      email: 'alex@waiagents.com',
      avatar_url: 'https://cdn.example.com/avatar.png',
      bio: 'Builder of things',
    };

    const result = toSessionUser(input);

    expect(result).toEqual({
      id: 'u_123',
      username: 'alex',
      display_name: 'Alex Dev',
      email: 'alex@waiagents.com',
      avatar_url: 'https://cdn.example.com/avatar.png',
      bio: 'Builder of things',
    });
  });

  it('preserves null fields', () => {
    const input = {
      id: 'u_456',
      username: 'minimal',
      display_name: null,
      avatar_url: null,
      bio: null,
    };

    const result = toSessionUser(input);

    expect(result).toEqual({
      id: 'u_456',
      username: 'minimal',
      display_name: null,
      email: undefined,
      avatar_url: null,
      bio: null,
    });
  });

  it('does not carry extra properties from the source object', () => {
    const input = {
      id: 'u_789',
      username: 'extra',
      display_name: 'Extra',
      email: 'e@e.com',
      avatar_url: null,
      bio: null,
      role: 'admin',
      created_at: '2025-01-01T00:00:00Z',
    };

    const result = toSessionUser(input);

    expect(result).not.toHaveProperty('role');
    expect(result).not.toHaveProperty('created_at');
  });
});

describe('getErrorMessage', () => {
  it('returns the message from an Error instance', () => {
    const err = new Error('Something broke');
    expect(getErrorMessage(err)).toBe('Something broke');
  });

  it('returns the reason property from an object', () => {
    const err = { reason: 'Token expired' };
    expect(getErrorMessage(err)).toBe('Token expired');
  });

  it('returns the default fallback for null', () => {
    expect(getErrorMessage(null)).toBe('Request failed');
  });

  it('returns the default fallback for undefined', () => {
    expect(getErrorMessage(undefined)).toBe('Request failed');
  });

  it('returns a custom fallback when provided', () => {
    expect(getErrorMessage(42, 'Custom fallback')).toBe('Custom fallback');
  });

  it('returns fallback for a plain string (not Error, no reason)', () => {
    expect(getErrorMessage('oops')).toBe('Request failed');
  });

  it('converts non-string reason to a string', () => {
    const err = { reason: 404 };
    expect(getErrorMessage(err)).toBe('404');
  });

  it('returns fallback for an Error with an empty message', () => {
    const err = new Error('');
    expect(getErrorMessage(err)).toBe('Request failed');
  });
});

describe('createIdempotencyKey', () => {
  it('returns a non-empty string', () => {
    const key = createIdempotencyKey();
    expect(key).toBeTruthy();
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(0);
  });

  it('returns unique values on consecutive calls', () => {
    const keys = new Set(Array.from({ length: 100 }, () => createIdempotencyKey()));
    expect(keys.size).toBe(100);
  });
});

describe('asTextContent', () => {
  it('returns empty string for null/undefined/false/0', () => {
    expect(asTextContent(null)).toBe('');
    expect(asTextContent(undefined)).toBe('');
    expect(asTextContent(false)).toBe('');
    expect(asTextContent(0)).toBe('');
  });

  it('returns a string directly', () => {
    expect(asTextContent('hello world')).toBe('hello world');
  });

  it('extracts text from an array of strings', () => {
    expect(asTextContent(['line 1', 'line 2'])).toBe('line 1\nline 2');
  });

  it('extracts text from an array of {text} blocks', () => {
    const blocks = [
      { type: 'text', text: 'First paragraph' },
      { type: 'text', text: 'Second paragraph' },
    ];
    expect(asTextContent(blocks)).toBe('First paragraph\nSecond paragraph');
  });

  it('filters out blocks without text', () => {
    const blocks = [
      { type: 'text', text: 'Keep this' },
      { type: 'image', url: 'https://example.com/img.png' },
      { type: 'text', text: 'And this' },
    ];
    expect(asTextContent(blocks)).toBe('Keep this\nAnd this');
  });

  it('extracts .text from a plain object', () => {
    expect(asTextContent({ text: 'from object' })).toBe('from object');
  });

  it('returns empty string for an object without .text', () => {
    expect(asTextContent({ foo: 'bar' })).toBe('');
  });

  it('returns empty string for an object with non-string .text', () => {
    expect(asTextContent({ text: 42 })).toBe('');
  });

  it('handles mixed array of strings and blocks', () => {
    const mixed = ['plain', { text: 'block' }, '', { type: 'code' }];
    expect(asTextContent(mixed)).toBe('plain\nblock');
  });
});

describe('toIsoLocal', () => {
  it('returns empty string for null/undefined', () => {
    expect(toIsoLocal(null)).toBe('');
    expect(toIsoLocal(undefined)).toBe('');
  });

  it('returns empty string for an empty string', () => {
    expect(toIsoLocal('')).toBe('');
  });

  it('returns empty string for an invalid date string', () => {
    expect(toIsoLocal('not-a-date')).toBe('');
  });

  it('returns a locale string for a valid ISO date', () => {
    const result = toIsoLocal('2025-06-15T12:30:00Z');
    // We can't assert the exact locale string since it varies by environment,
    // but it must be non-empty and not the input
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toBe('2025-06-15T12:30:00Z');
  });
});
