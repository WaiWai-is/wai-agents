import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { ApiClient, type SessionStoreAdapter } from '../client';
import { ApiError } from '../errors';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('ApiClient edge cases', () => {
  let fetchMock: Mock;

  beforeEach(() => {
    fetchMock = vi.fn();
  });

  it('does not set Content-Type when body is FormData', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

    const client = new ApiClient({
      baseUrl: 'https://api.test.com',
      fetchImpl: fetchMock,
    });

    const form = new FormData();
    form.append('file', new Blob(['test']), 'test.txt');

    await client.request('/upload', {
      method: 'POST',
      body: form,
    });

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init.headers);
    // FormData should not get Content-Type set (browser sets it with boundary)
    expect(headers.has('Content-Type')).toBe(false);
  });

  it('does not set Content-Type when there is no body', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

    const client = new ApiClient({
      baseUrl: 'https://api.test.com',
      fetchImpl: fetchMock,
    });

    await client.request('/items', { method: 'DELETE' });

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init.headers);
    expect(headers.has('Content-Type')).toBe(false);
  });

  it('handles empty baseUrl gracefully', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

    const client = new ApiClient({
      baseUrl: '',
      fetchImpl: fetchMock,
    });

    await client.request('/test');

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('/test');
  });

  it('passes through custom headers alongside auth header', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

    const client = new ApiClient({
      baseUrl: 'https://api.test.com',
      fetchImpl: fetchMock,
      getAccessToken: () => 'my-token',
    });

    await client.request('/items', {
      headers: { 'X-Custom': 'value', 'Idempotency-Key': 'idem-123' },
    });

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe('Bearer my-token');
    expect(headers.get('X-Custom')).toBe('value');
    expect(headers.get('Idempotency-Key')).toBe('idem-123');
  });

  it('throws ApiError with correct status for 422 validation error', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          error: 'Validation error',
          details: { fieldErrors: { name: ['Too short'] } },
        },
        422,
      ),
    );

    const client = new ApiClient({
      baseUrl: 'https://api.test.com',
      fetchImpl: fetchMock,
    });

    try {
      await client.request('/items', { method: 'POST', body: '{}' });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(422);
      expect(apiErr.details).toBeDefined();
    }
  });

  it('throws ApiError with correct status for 403 forbidden', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Forbidden' }, 403));

    const client = new ApiClient({
      baseUrl: 'https://api.test.com',
      fetchImpl: fetchMock,
    });

    try {
      await client.request('/admin');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(403);
    }
  });

  it('throws ApiError with correct status for 429 rate limit', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Too many requests' }, 429));

    const client = new ApiClient({
      baseUrl: 'https://api.test.com',
      fetchImpl: fetchMock,
    });

    try {
      await client.request('/api');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(429);
    }
  });

  it('deduplicates concurrent refresh attempts', async () => {
    const sessionStore: SessionStoreAdapter = {
      getRefreshToken: () => 'refresh_tok',
      setTokens: vi.fn(),
      clearSession: vi.fn(),
    };

    let refreshCallCount = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/auth/refresh')) {
        refreshCallCount++;
        // Simulate delay
        await new Promise((r) => setTimeout(r, 10));
        return jsonResponse({ access_token: 'new', refresh_token: 'new_r' });
      }
      return jsonResponse({ error: 'Unauthorized' }, 401);
    });

    const client = new ApiClient({
      baseUrl: 'https://api.test.com',
      fetchImpl: fetchMock,
      getAccessToken: () => 'expired',
      sessionStore,
    });

    // Fire two requests simultaneously — both hit 401 and try to refresh
    const results = await Promise.allSettled([
      client.request('/a'),
      client.request('/b'),
    ]);

    // Both will still fail because the retry also returns 401,
    // but the refresh should only be called once due to deduplication
    expect(refreshCallCount).toBe(1);
    // Both should have rejected
    expect(results[0].status).toBe('rejected');
    expect(results[1].status).toBe('rejected');
  });

  it('clears session when refresh response has no access_token', async () => {
    const sessionStore: SessionStoreAdapter = {
      getRefreshToken: () => 'refresh_tok',
      setTokens: vi.fn(),
      clearSession: vi.fn(),
    };

    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/auth/refresh')) {
        return jsonResponse({ some_other_field: 'value' }); // No access_token
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

  it('clears session when refresh throws a network error', async () => {
    const sessionStore: SessionStoreAdapter = {
      getRefreshToken: () => 'refresh_tok',
      setTokens: vi.fn(),
      clearSession: vi.fn(),
    };

    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/auth/refresh')) {
        throw new Error('Network error');
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

  it('uses tokens from nested tokens object in refresh response', async () => {
    const sessionStore: SessionStoreAdapter = {
      getRefreshToken: () => 'refresh_tok',
      setTokens: vi.fn(),
      clearSession: vi.fn(),
    };

    let callCount = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/auth/refresh')) {
        return jsonResponse({
          tokens: { access_token: 'nested_access', refresh_token: 'nested_refresh' },
        });
      }
      callCount++;
      if (callCount === 1) {
        return jsonResponse({ error: 'Unauthorized' }, 401);
      }
      return jsonResponse({ ok: true });
    });

    const client = new ApiClient({
      baseUrl: 'https://api.test.com',
      fetchImpl: fetchMock,
      getAccessToken: () => 'expired',
      sessionStore,
    });

    await client.request('/test');
    expect(sessionStore.setTokens).toHaveBeenCalledWith('nested_access', 'nested_refresh');
  });
});
