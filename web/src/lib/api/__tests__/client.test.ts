import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { ApiClient, type SessionStoreAdapter } from '../client';
import { ApiError } from '../errors';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain' },
  });
}

describe('ApiClient', () => {
  let fetchMock: Mock;

  beforeEach(() => {
    fetchMock = vi.fn();
  });

  it('sends a GET request to the correct URL', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

    const client = new ApiClient({
      baseUrl: 'https://api.test.com',
      fetchImpl: fetchMock,
    });

    const result = await client.request('/health');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.test.com/health');
    expect(init.cache).toBe('no-store');
    expect(result).toEqual({ ok: true });
  });

  it('sets Content-Type to application/json when body is present', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ created: true }));

    const client = new ApiClient({
      baseUrl: 'https://api.test.com',
      fetchImpl: fetchMock,
    });

    await client.request('/items', {
      method: 'POST',
      body: JSON.stringify({ name: 'test' }),
    });

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init.headers);
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('does not override an explicit Content-Type header', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

    const client = new ApiClient({
      baseUrl: 'https://api.test.com',
      fetchImpl: fetchMock,
    });

    await client.request('/items', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'raw text',
    });

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init.headers);
    expect(headers.get('Content-Type')).toBe('text/plain');
  });

  it('sets Authorization header when getAccessToken returns a token', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ user: {} }));

    const client = new ApiClient({
      baseUrl: 'https://api.test.com',
      fetchImpl: fetchMock,
      getAccessToken: () => 'tok_abc123',
    });

    await client.request('/users/me');

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe('Bearer tok_abc123');
  });

  it('does not set Authorization header when getAccessToken returns undefined', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [] }));

    const client = new ApiClient({
      baseUrl: 'https://api.test.com',
      fetchImpl: fetchMock,
      getAccessToken: () => undefined,
    });

    await client.request('/public/items');

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init.headers);
    expect(headers.has('Authorization')).toBe(false);
  });

  it('supports async getAccessToken', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

    const client = new ApiClient({
      baseUrl: 'https://api.test.com',
      fetchImpl: fetchMock,
      getAccessToken: async () => 'async_tok',
    });

    await client.request('/test');

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe('Bearer async_tok');
  });

  it('throws ApiError on non-OK JSON response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'Not found', code: 'NOT_FOUND' }, 404));

    const client = new ApiClient({
      baseUrl: 'https://api.test.com',
      fetchImpl: fetchMock,
    });

    try {
      await client.request('/missing');
      expect.fail('Expected request to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(404);
      expect(apiErr.message).toBe('Not found');
      expect(apiErr.code).toBe('NOT_FOUND');
    }
  });

  it('handles non-JSON error responses', async () => {
    fetchMock.mockResolvedValue(textResponse('Internal Server Error', 500));

    const client = new ApiClient({
      baseUrl: 'https://api.test.com',
      fetchImpl: fetchMock,
    });

    await expect(client.request('/broken')).rejects.toThrow(ApiError);
  });

  it('parses text responses when content-type is not JSON', async () => {
    fetchMock.mockResolvedValue(textResponse('plain text body', 200));

    const client = new ApiClient({
      baseUrl: 'https://api.test.com',
      fetchImpl: fetchMock,
    });

    const result = await client.request('/text');
    expect(result).toBe('plain text body');
  });

  describe('token refresh', () => {
    it('retries the request after a successful token refresh on 401', async () => {
      const sessionStore: SessionStoreAdapter = {
        getRefreshToken: () => 'refresh_tok',
        setTokens: vi.fn(),
        clearSession: vi.fn(),
      };

      let callCount = 0;
      fetchMock.mockImplementation(async (url: string) => {
        if (url.includes('/auth/refresh')) {
          return jsonResponse({ access_token: 'new_access', refresh_token: 'new_refresh' });
        }
        callCount++;
        if (callCount === 1) {
          return jsonResponse({ error: 'Unauthorized' }, 401);
        }
        return jsonResponse({ user: { id: '1' } });
      });

      const client = new ApiClient({
        baseUrl: 'https://api.test.com',
        fetchImpl: fetchMock,
        getAccessToken: () => 'expired_tok',
        sessionStore,
      });

      const result = await client.request<{ user: { id: string } }>('/users/me');

      expect(result.user.id).toBe('1');
      expect(sessionStore.setTokens).toHaveBeenCalledWith('new_access', 'new_refresh');
    });

    it('clears session when refresh token is missing', async () => {
      const sessionStore: SessionStoreAdapter = {
        getRefreshToken: () => undefined as unknown as string,
        setTokens: vi.fn(),
        clearSession: vi.fn(),
      };

      fetchMock.mockResolvedValue(jsonResponse({ error: 'Unauthorized' }, 401));

      const client = new ApiClient({
        baseUrl: 'https://api.test.com',
        fetchImpl: fetchMock,
        sessionStore,
      });

      await expect(client.request('/protected')).rejects.toThrow(ApiError);
      expect(sessionStore.clearSession).toHaveBeenCalled();
    });

    it('clears session when refresh endpoint returns non-OK', async () => {
      const sessionStore: SessionStoreAdapter = {
        getRefreshToken: () => 'refresh_tok',
        setTokens: vi.fn(),
        clearSession: vi.fn(),
      };

      fetchMock.mockImplementation(async (url: string) => {
        if (url.includes('/auth/refresh')) {
          return jsonResponse({ error: 'Refresh token expired' }, 401);
        }
        return jsonResponse({ error: 'Unauthorized' }, 401);
      });

      const client = new ApiClient({
        baseUrl: 'https://api.test.com',
        fetchImpl: fetchMock,
        sessionStore,
      });

      await expect(client.request('/protected')).rejects.toThrow(ApiError);
      expect(sessionStore.clearSession).toHaveBeenCalled();
    });

    it('does not attempt refresh without a sessionStore', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ error: 'Unauthorized' }, 401));

      const client = new ApiClient({
        baseUrl: 'https://api.test.com',
        fetchImpl: fetchMock,
      });

      await expect(client.request('/protected')).rejects.toThrow(ApiError);
      // Only one call -- no refresh attempt
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    it('does not attempt refresh on a retry (isRetry=true path)', async () => {
      const sessionStore: SessionStoreAdapter = {
        getRefreshToken: () => 'refresh_tok',
        setTokens: vi.fn(),
        clearSession: vi.fn(),
      };

      // Both original and refresh succeed, but the retried request also returns 401
      let _callCount = 0;
      fetchMock.mockImplementation(async (url: string) => {
        if (url.includes('/auth/refresh')) {
          return jsonResponse({ access_token: 'new_access', refresh_token: 'new_refresh' });
        }
        _callCount++;
        // Always return 401 -- the retry should not trigger another refresh
        return jsonResponse({ error: 'Still unauthorized' }, 401);
      });

      const client = new ApiClient({
        baseUrl: 'https://api.test.com',
        fetchImpl: fetchMock,
        getAccessToken: () => 'tok',
        sessionStore,
      });

      await expect(client.request('/protected')).rejects.toThrow(ApiError);

      // Should see: 1 original request, 1 refresh, 1 retry = 3 total fetch calls
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
  });

  describe('isApiError', () => {
    it('returns true for ApiError instances', () => {
      const err = new ApiError('test', { status: 400 });
      expect(ApiClient.isApiError(err)).toBe(true);
    });

    it('returns false for regular errors', () => {
      expect(ApiClient.isApiError(new Error('nope'))).toBe(false);
    });

    it('returns false for non-error values', () => {
      expect(ApiClient.isApiError(null)).toBe(false);
      expect(ApiClient.isApiError('string')).toBe(false);
      expect(ApiClient.isApiError(undefined)).toBe(false);
    });
  });
});
