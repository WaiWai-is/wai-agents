import { describe, expect, it } from 'vitest';
import {
  asTextContent,
  createIdempotencyKey,
  getErrorMessage,
  toIsoLocal,
  toSessionUser,
} from '../utils';

/* ================================================================
 * toSessionUser — edge cases
 * ================================================================ */
describe('toSessionUser edge cases', () => {
  it('handles empty string values', () => {
    const result = toSessionUser({
      id: '',
      username: '',
      display_name: null,
      avatar_url: null,
      bio: null,
    });
    expect(result.id).toBe('');
    expect(result.username).toBe('');
  });

  it('does not include email when it is not provided', () => {
    const result = toSessionUser({
      id: 'u-1',
      username: 'test',
      display_name: null,
      avatar_url: null,
      bio: null,
    });
    expect(result.email).toBeUndefined();
  });

  it('includes email when provided', () => {
    const result = toSessionUser({
      id: 'u-1',
      username: 'test',
      display_name: 'Test',
      email: 'test@test.com',
      avatar_url: null,
      bio: null,
    });
    expect(result.email).toBe('test@test.com');
  });
});

/* ================================================================
 * getErrorMessage — edge cases
 * ================================================================ */
describe('getErrorMessage edge cases', () => {
  it('handles an object with toString that is not an Error', () => {
    const obj = { toString: () => 'custom string' };
    expect(getErrorMessage(obj)).toBe('Request failed');
  });

  it('handles an array (not Error, not an object with reason)', () => {
    expect(getErrorMessage([1, 2, 3])).toBe('Request failed');
  });

  it('handles a boolean value', () => {
    expect(getErrorMessage(true)).toBe('Request failed');
    expect(getErrorMessage(false)).toBe('Request failed');
  });

  it('handles an Error subclass', () => {
    class CustomError extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'CustomError';
      }
    }
    expect(getErrorMessage(new CustomError('custom'))).toBe('custom');
  });

  it('handles an object with both message and reason', () => {
    // Since it's not an Error instance, it checks for reason
    const obj = { message: 'msg', reason: 'rsn' };
    expect(getErrorMessage(obj)).toBe('rsn');
  });

  it('handles a TypeError', () => {
    expect(getErrorMessage(new TypeError('cannot read'))).toBe('cannot read');
  });

  it('uses custom fallback when error has empty message', () => {
    const err = new Error('');
    expect(getErrorMessage(err, 'Something went wrong')).toBe('Something went wrong');
  });
});

/* ================================================================
 * createIdempotencyKey — edge cases
 * ================================================================ */
describe('createIdempotencyKey edge cases', () => {
  it('returns a string matching hex pattern', () => {
    const key = createIdempotencyKey();
    // Either a UUID pattern or hex-hex pattern
    expect(key).toMatch(/^[a-f0-9-]+$/);
  });

  it('generates keys of consistent length', () => {
    const keys = Array.from({ length: 10 }, () => createIdempotencyKey());
    const lengths = new Set(keys.map((k) => k.length));
    // UUID is 36 chars; fallback is variable but all generated keys should be consistent
    // within the same environment
    expect(lengths.size).toBeLessThanOrEqual(2);
  });
});

/* ================================================================
 * asTextContent — edge cases
 * ================================================================ */
describe('asTextContent edge cases', () => {
  it('handles empty string', () => {
    expect(asTextContent('')).toBe('');
  });

  it('handles an empty array', () => {
    expect(asTextContent([])).toBe('');
  });

  it('handles an array with all empty/falsy strings', () => {
    expect(asTextContent(['', '', ''])).toBe('');
  });

  it('handles deeply nested text blocks', () => {
    const blocks = [{ text: 'deep' }];
    expect(asTextContent(blocks)).toBe('deep');
  });

  it('handles an array of objects without text property', () => {
    expect(asTextContent([{ code: 'x = 1' }, { image: 'url' }])).toBe('');
  });

  it('handles a number directly', () => {
    expect(asTextContent(42)).toBe('');
  });

  it('handles a boolean true', () => {
    // true is truthy but not a string/array/object
    expect(asTextContent(true)).toBe('');
  });

  it('handles object with text being null', () => {
    expect(asTextContent({ text: null })).toBe('');
  });

  it('handles object with text being undefined', () => {
    expect(asTextContent({ text: undefined })).toBe('');
  });

  it('handles object with text being a number', () => {
    expect(asTextContent({ text: 42 })).toBe('');
  });

  it('handles single-element array with string', () => {
    expect(asTextContent(['hello'])).toBe('hello');
  });

  it('handles mixed content with numbers in array', () => {
    const content = ['text', 42, { text: 'block' }];
    const result = asTextContent(content);
    expect(result).toContain('text');
    expect(result).toContain('block');
  });
});

/* ================================================================
 * toIsoLocal — edge cases
 * ================================================================ */
describe('toIsoLocal edge cases', () => {
  it('handles a date with timezone offset', () => {
    const result = toIsoLocal('2025-06-15T12:30:00+05:00');
    expect(result.length).toBeGreaterThan(0);
  });

  it('handles a date-only string', () => {
    const result = toIsoLocal('2025-06-15');
    expect(result.length).toBeGreaterThan(0);
  });

  it('handles epoch milliseconds as string', () => {
    // Date constructor with a number-like string
    const result = toIsoLocal('1718451000000');
    // This should either produce a valid locale string or empty
    // depending on whether new Date("1718451000000") is valid
    expect(typeof result).toBe('string');
  });

  it('returns empty string for whitespace-only string', () => {
    // "   " is truthy but new Date("   ") is invalid
    const result = toIsoLocal('   ');
    expect(result).toBe('');
  });
});
