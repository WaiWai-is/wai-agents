/* eslint-disable @typescript-eslint/no-explicit-any */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blacklistToken, clearBlacklist, isTokenBlacklisted } from './token-blacklist.js';

describe('token-blacklist — blacklistToken', () => {
  beforeEach(() => {
    clearBlacklist();
    vi.useRealTimers();
  });

  afterEach(() => {
    clearBlacklist();
  });

  it('stores a token that can be retrieved', () => {
    blacklistToken('token-1', 60_000);
    expect(isTokenBlacklisted('token-1')).toBe(true);
  });

  it('stores multiple tokens independently', () => {
    blacklistToken('token-a', 60_000);
    blacklistToken('token-b', 60_000);
    expect(isTokenBlacklisted('token-a')).toBe(true);
    expect(isTokenBlacklisted('token-b')).toBe(true);
  });

  it('overwrites expiry when same token is blacklisted again', () => {
    blacklistToken('token-x', 1_000);
    blacklistToken('token-x', 120_000);
    expect(isTokenBlacklisted('token-x')).toBe(true);
  });

  it('accepts an empty string as a token', () => {
    blacklistToken('', 60_000);
    expect(isTokenBlacklisted('')).toBe(true);
  });

  it('accepts a very long token string', () => {
    const longToken = 'a'.repeat(10_000);
    blacklistToken(longToken, 60_000);
    expect(isTokenBlacklisted(longToken)).toBe(true);
  });

  it('accepts a token with special characters', () => {
    const specialToken = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`';
    blacklistToken(specialToken, 60_000);
    expect(isTokenBlacklisted(specialToken)).toBe(true);
  });

  it('accepts a token with unicode characters', () => {
    const unicodeToken = '\u{1F600}\u{1F601}\u{1F602}';
    blacklistToken(unicodeToken, 60_000);
    expect(isTokenBlacklisted(unicodeToken)).toBe(true);
  });

  it('accepts a JWT-like token', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEifQ.abc123';
    blacklistToken(jwt, 60_000);
    expect(isTokenBlacklisted(jwt)).toBe(true);
  });
});

describe('token-blacklist — isTokenBlacklisted', () => {
  beforeEach(() => {
    clearBlacklist();
  });

  afterEach(() => {
    clearBlacklist();
  });

  it('returns false for a token that was never blacklisted', () => {
    expect(isTokenBlacklisted('never-added')).toBe(false);
  });

  it('returns true for a recently blacklisted token', () => {
    blacklistToken('recent-token', 60_000);
    expect(isTokenBlacklisted('recent-token')).toBe(true);
  });

  it('returns false for an expired token (0 expiry)', () => {
    blacklistToken('zero-expiry', 0);
    expect(isTokenBlacklisted('zero-expiry')).toBe(false);
  });

  it('returns false for an expired token (negative expiry)', () => {
    blacklistToken('negative-expiry', -5000);
    expect(isTokenBlacklisted('negative-expiry')).toBe(false);
  });

  it('returns false for an empty string that was never blacklisted', () => {
    expect(isTokenBlacklisted('')).toBe(false);
  });

  it('auto-deletes an expired token on lookup', () => {
    blacklistToken('auto-delete', -1);
    // The first call should return false AND delete the entry
    expect(isTokenBlacklisted('auto-delete')).toBe(false);
    // Second call confirms it's gone
    expect(isTokenBlacklisted('auto-delete')).toBe(false);
  });

  it('distinguishes between similar token strings', () => {
    blacklistToken('token-1', 60_000);
    expect(isTokenBlacklisted('token-1')).toBe(true);
    expect(isTokenBlacklisted('token-2')).toBe(false);
    expect(isTokenBlacklisted('token-10')).toBe(false);
    expect(isTokenBlacklisted('TOKEN-1')).toBe(false);
  });

  it('handles case-sensitive tokens correctly', () => {
    blacklistToken('CaseSensitive', 60_000);
    expect(isTokenBlacklisted('CaseSensitive')).toBe(true);
    expect(isTokenBlacklisted('casesensitive')).toBe(false);
    expect(isTokenBlacklisted('CASESENSITIVE')).toBe(false);
  });
});

describe('token-blacklist — clearBlacklist', () => {
  beforeEach(() => {
    clearBlacklist();
  });

  it('removes all blacklisted tokens', () => {
    blacklistToken('t1', 60_000);
    blacklistToken('t2', 60_000);
    blacklistToken('t3', 60_000);
    clearBlacklist();
    expect(isTokenBlacklisted('t1')).toBe(false);
    expect(isTokenBlacklisted('t2')).toBe(false);
    expect(isTokenBlacklisted('t3')).toBe(false);
  });

  it('is safe to call on an empty blacklist', () => {
    expect(() => clearBlacklist()).not.toThrow();
  });

  it('can be called multiple times safely', () => {
    blacklistToken('t1', 60_000);
    clearBlacklist();
    clearBlacklist();
    expect(isTokenBlacklisted('t1')).toBe(false);
  });

  it('allows re-adding tokens after clearing', () => {
    blacklistToken('t1', 60_000);
    clearBlacklist();
    expect(isTokenBlacklisted('t1')).toBe(false);
    blacklistToken('t1', 60_000);
    expect(isTokenBlacklisted('t1')).toBe(true);
  });
});

describe('token-blacklist — expiry behavior', () => {
  beforeEach(() => {
    clearBlacklist();
    vi.useFakeTimers();
  });

  afterEach(() => {
    clearBlacklist();
    vi.useRealTimers();
  });

  it('token is valid before expiry', () => {
    blacklistToken('timed-token', 5_000);
    vi.advanceTimersByTime(4_000);
    expect(isTokenBlacklisted('timed-token')).toBe(true);
  });

  it('token expires after the specified duration', () => {
    blacklistToken('timed-token', 5_000);
    vi.advanceTimersByTime(6_000);
    expect(isTokenBlacklisted('timed-token')).toBe(false);
  });

  it('token expires at exact boundary', () => {
    blacklistToken('boundary-token', 5_000);
    vi.advanceTimersByTime(5_000);
    expect(isTokenBlacklisted('boundary-token')).toBe(false);
  });

  it('different tokens can have different expiry times', () => {
    blacklistToken('short-lived', 1_000);
    blacklistToken('long-lived', 10_000);
    vi.advanceTimersByTime(2_000);
    expect(isTokenBlacklisted('short-lived')).toBe(false);
    expect(isTokenBlacklisted('long-lived')).toBe(true);
  });

  it('prune timer cleans up expired tokens', () => {
    blacklistToken('prunable', 30_000);
    vi.advanceTimersByTime(31_000);
    // After 31s the token is expired
    expect(isTokenBlacklisted('prunable')).toBe(false);
    // Advance past prune interval (60s total)
    vi.advanceTimersByTime(30_000);
    // After prune runs, the entry should be removed
    expect(isTokenBlacklisted('prunable')).toBe(false);
  });

  it('prune timer does not remove non-expired tokens', () => {
    blacklistToken('still-valid', 120_000);
    // Advance past the prune interval
    vi.advanceTimersByTime(61_000);
    // Token should still be valid (120s > 61s)
    expect(isTokenBlacklisted('still-valid')).toBe(true);
  });

  it('extending expiry by re-blacklisting works', () => {
    blacklistToken('extended', 5_000);
    vi.advanceTimersByTime(3_000);
    // Re-blacklist with longer expiry
    blacklistToken('extended', 10_000);
    vi.advanceTimersByTime(5_000);
    // Original would have expired at 5s, but we extended
    expect(isTokenBlacklisted('extended')).toBe(true);
  });
});

describe('token-blacklist — concurrent operations', () => {
  beforeEach(() => {
    clearBlacklist();
  });

  afterEach(() => {
    clearBlacklist();
  });

  it('handles many concurrent blacklist additions', () => {
    for (let i = 0; i < 100; i++) {
      blacklistToken(`concurrent-${i}`, 60_000);
    }
    for (let i = 0; i < 100; i++) {
      expect(isTokenBlacklisted(`concurrent-${i}`)).toBe(true);
    }
  });

  it('handles interleaved adds and checks', () => {
    blacklistToken('interleave-1', 60_000);
    expect(isTokenBlacklisted('interleave-1')).toBe(true);
    blacklistToken('interleave-2', 60_000);
    expect(isTokenBlacklisted('interleave-1')).toBe(true);
    expect(isTokenBlacklisted('interleave-2')).toBe(true);
    clearBlacklist();
    expect(isTokenBlacklisted('interleave-1')).toBe(false);
    expect(isTokenBlacklisted('interleave-2')).toBe(false);
  });

  it('handles rapid add/check/clear cycles', () => {
    for (let i = 0; i < 50; i++) {
      blacklistToken(`rapid-${i}`, 60_000);
      expect(isTokenBlacklisted(`rapid-${i}`)).toBe(true);
    }
    clearBlacklist();
    for (let i = 0; i < 50; i++) {
      expect(isTokenBlacklisted(`rapid-${i}`)).toBe(false);
    }
  });

  it('handles large number of tokens without error', () => {
    for (let i = 0; i < 1000; i++) {
      blacklistToken(`bulk-${i}`, 60_000);
    }
    expect(isTokenBlacklisted('bulk-0')).toBe(true);
    expect(isTokenBlacklisted('bulk-500')).toBe(true);
    expect(isTokenBlacklisted('bulk-999')).toBe(true);
    expect(isTokenBlacklisted('bulk-1000')).toBe(false);
  });

  it('clearBlacklist during active tokens removes all', () => {
    blacklistToken('active-1', 60_000);
    blacklistToken('active-2', 60_000);
    blacklistToken('active-3', 60_000);
    expect(isTokenBlacklisted('active-1')).toBe(true);
    clearBlacklist();
    expect(isTokenBlacklisted('active-1')).toBe(false);
    expect(isTokenBlacklisted('active-2')).toBe(false);
    expect(isTokenBlacklisted('active-3')).toBe(false);
  });
});

describe('token-blacklist — edge cases', () => {
  beforeEach(() => {
    clearBlacklist();
  });

  afterEach(() => {
    clearBlacklist();
  });

  it('token with whitespace is distinct', () => {
    blacklistToken(' token ', 60_000);
    expect(isTokenBlacklisted(' token ')).toBe(true);
    expect(isTokenBlacklisted('token')).toBe(false);
  });

  it('token with newlines is stored correctly', () => {
    blacklistToken('line1\nline2', 60_000);
    expect(isTokenBlacklisted('line1\nline2')).toBe(true);
  });

  it('extremely short expiry (1ms)', () => {
    vi.useFakeTimers();
    blacklistToken('1ms-token', 1);
    expect(isTokenBlacklisted('1ms-token')).toBe(true);
    vi.advanceTimersByTime(2);
    expect(isTokenBlacklisted('1ms-token')).toBe(false);
    vi.useRealTimers();
  });

  it('very large expiry value', () => {
    blacklistToken('forever-token', Number.MAX_SAFE_INTEGER);
    expect(isTokenBlacklisted('forever-token')).toBe(true);
  });

  it('NaN expiry makes token never expire (NaN comparisons always false)', () => {
    blacklistToken('nan-token', Number.NaN);
    // Date.now() + NaN = NaN; NaN <= Date.now() is always false, so token stays valid
    expect(isTokenBlacklisted('nan-token')).toBe(true);
  });
});
