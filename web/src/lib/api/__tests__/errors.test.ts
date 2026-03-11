import { describe, expect, it } from 'vitest';
import { ApiError, parseApiError } from '../errors';

describe('ApiError', () => {
  it('sets all properties from constructor', () => {
    const err = new ApiError('Not found', { status: 404, code: 'NOT_FOUND', details: { id: '1' } });

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe('Not found');
    expect(err.name).toBe('ApiError');
    expect(err.status).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.details).toEqual({ id: '1' });
  });

  it('works without optional fields', () => {
    const err = new ApiError('Server error', { status: 500 });

    expect(err.status).toBe(500);
    expect(err.code).toBeUndefined();
    expect(err.details).toBeUndefined();
  });
});

describe('parseApiError', () => {
  it('uses top-level message from payload', () => {
    const err = parseApiError(400, { message: 'Bad request body' });

    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(400);
    expect(err.message).toBe('Bad request body');
  });

  it('uses top-level string error field', () => {
    const err = parseApiError(401, { error: 'Unauthorized' });

    expect(err.message).toBe('Unauthorized');
    expect(err.status).toBe(401);
  });

  it('uses nested error.message', () => {
    const err = parseApiError(422, {
      error: {
        code: 'VALIDATION',
        message: 'Email is required',
        details: { field: 'email' },
      },
    });

    expect(err.message).toBe('Email is required');
    expect(err.code).toBe('VALIDATION');
    expect(err.details).toEqual({ field: 'email' });
  });

  it('uses top-level code when nested error has no code', () => {
    const err = parseApiError(409, {
      code: 'CONFLICT',
      message: 'Duplicate entry',
    });

    expect(err.code).toBe('CONFLICT');
  });

  it('falls back to generic message for non-object payload', () => {
    const err = parseApiError(500, 'plain text');

    expect(err.message).toBe('Request failed with status 500');
    expect(err.details).toBe('plain text');
  });

  it('falls back to generic message for null payload', () => {
    const err = parseApiError(502, null);

    expect(err.message).toBe('Request failed with status 502');
  });

  it('falls back to generic message for empty object payload', () => {
    const err = parseApiError(503, {});

    expect(err.message).toBe('Request failed with status 503');
  });

  it('prefers top-level message over nested error.message', () => {
    const err = parseApiError(400, {
      message: 'Top level',
      error: {
        message: 'Nested',
      },
    });

    expect(err.message).toBe('Top level');
  });

  it('extracts details from top-level payload', () => {
    const err = parseApiError(400, {
      message: 'Bad input',
      details: [{ field: 'name', reason: 'too short' }],
    });

    expect(err.details).toEqual([{ field: 'name', reason: 'too short' }]);
  });
});
