import { describe, expect, it } from 'vitest';
import { ApiError, parseApiError } from '../errors';

describe('ApiError edge cases', () => {
  it('has the correct name property', () => {
    const err = new ApiError('test', { status: 400 });
    expect(err.name).toBe('ApiError');
  });

  it('is an instance of Error', () => {
    const err = new ApiError('test', { status: 500 });
    expect(err).toBeInstanceOf(Error);
  });

  it('preserves stack trace', () => {
    const err = new ApiError('test', { status: 400 });
    expect(err.stack).toBeDefined();
    expect(err.stack).toContain('ApiError');
  });

  it('stores details of various types', () => {
    const arrayDetails = [{ field: 'email' }, { field: 'name' }];
    const err = new ApiError('Validation', { status: 422, details: arrayDetails });
    expect(err.details).toEqual(arrayDetails);
  });
});

describe('parseApiError edge cases', () => {
  it('handles undefined payload', () => {
    const err = parseApiError(500, undefined);
    expect(err.message).toBe('Request failed with status 500');
  });

  it('handles numeric payload', () => {
    const err = parseApiError(500, 42);
    expect(err.message).toBe('Request failed with status 500');
    expect(err.details).toBe(42);
  });

  it('handles boolean payload', () => {
    const err = parseApiError(500, false);
    expect(err.message).toBe('Request failed with status 500');
  });

  it('handles array payload', () => {
    const err = parseApiError(500, ['error1', 'error2']);
    expect(err).toBeInstanceOf(ApiError);
    // Arrays are objects, so isRecord returns true
    expect(err.status).toBe(500);
  });

  it('handles payload with only whitespace message', () => {
    const err = parseApiError(400, { message: '   ' });
    expect(err.message).toBe('Request failed with status 400');
  });

  it('handles payload with only whitespace error string', () => {
    const err = parseApiError(400, { error: '   ' });
    expect(err.message).toBe('Request failed with status 400');
  });

  it('extracts nested error details over top-level details when both exist', () => {
    const err = parseApiError(422, {
      details: 'top-level',
      error: {
        message: 'Nested error',
        details: 'nested-details',
      },
    });
    // top-level details is preferred
    expect(err.details).toBe('top-level');
  });

  it('falls back to nested details when top-level details is undefined', () => {
    const err = parseApiError(422, {
      error: {
        message: 'Nested',
        details: { field: 'name' },
      },
    });
    expect(err.details).toEqual({ field: 'name' });
  });

  it('handles deeply nested code with no top-level code', () => {
    const err = parseApiError(409, {
      error: {
        code: 'CONFLICT',
        message: 'Duplicate',
      },
    });
    expect(err.code).toBe('CONFLICT');
  });

  it('prefers top-level code over nested code', () => {
    const err = parseApiError(409, {
      code: 'TOP_CODE',
      error: {
        code: 'NESTED_CODE',
        message: 'err',
      },
    });
    expect(err.code).toBe('TOP_CODE');
  });

  it('handles error as a non-object, non-string value', () => {
    const err = parseApiError(400, { error: 42 });
    // error is not a string and not an object, so it falls to generic message
    expect(err.message).toBe('Request failed with status 400');
  });

  it('extracts message from top-level when error is an empty object', () => {
    const err = parseApiError(400, { message: 'Real message', error: {} });
    expect(err.message).toBe('Real message');
  });
});
