import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { ApiClient, type SessionStoreAdapter } from '../client';
import { ApiError } from '../errors';
import { WaiAgentsApi } from '../services';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  API Service Tests (comprehensive)                                  */
/* ------------------------------------------------------------------ */

describe('WaiAgentsApi comprehensive', () => {
  let fetchMock: Mock;
  let client: ApiClient;
  let api: WaiAgentsApi;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    client = new ApiClient({
      baseUrl: 'https://api.test.com',
      fetchImpl: fetchMock,
    });
    api = new WaiAgentsApi(client);
  });

  describe('conversation methods', () => {
    it('getConversation sends GET /conversations/:id', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ conversation: { id: 'c1' } }));
      const result = await api.getConversation('c1');

      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.test.com/conversations/c1');
      expect(result.conversation.id).toBe('c1');
    });

    it('addMember sends POST /conversations/:id/members', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ member: { id: 'm1' } }));
      await api.addMember('c1', 'u2', 'admin');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.test.com/conversations/c1/members');
      expect(init.method).toBe('POST');
      const body = JSON.parse(init.body);
      expect(body.user_id).toBe('u2');
      expect(body.role).toBe('admin');
    });

    it('addMember defaults role to member', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ member: { id: 'm1' } }));
      await api.addMember('c1', 'u2');

      const [, init] = fetchMock.mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.role).toBe('member');
    });

    it('removeMember sends DELETE /conversations/:id/members/:userId', async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, 200));
      await api.removeMember('c1', 'u2');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.test.com/conversations/c1/members/u2');
      expect(init.method).toBe('DELETE');
    });

    it('editTextMessage sends PATCH with text content', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ message: { id: 'm1' } }));
      await api.editTextMessage('c1', 'm1', 'updated text');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.test.com/conversations/c1/messages/m1');
      expect(init.method).toBe('PATCH');
      const body = JSON.parse(init.body);
      expect(body.content).toEqual([{ type: 'text', text: 'updated text' }]);
    });

    it('deleteMessage sends DELETE /conversations/:id/messages/:messageId', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ message: { id: 'm1' } }));
      await api.deleteMessage('c1', 'm1');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.test.com/conversations/c1/messages/m1');
      expect(init.method).toBe('DELETE');
    });

    it('sendTextMessage omits metadata when object is empty', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ message: { id: 'm1' } }));
      await api.sendTextMessage('c1', 'hello', {});

      const [, init] = fetchMock.mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body).not.toHaveProperty('metadata');
    });
  });

  describe('agent CRUD methods', () => {
    it('createAgent sends POST /agents with all fields', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ agent: { id: 'a1' } }));
      await api.createAgent({
        name: 'Bot',
        slug: 'bot',
        system_prompt: 'You are helpful',
        model: 'claude-sonnet-4-6',
        execution_mode: 'raw',
        temperature: 0.5,
        max_tokens: 2048,
        tools: [],
        mcp_servers: [],
        visibility: 'public',
        category: 'coding',
      });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.test.com/agents');
      expect(init.method).toBe('POST');
      const body = JSON.parse(init.body);
      expect(body.name).toBe('Bot');
      expect(body.model).toBe('claude-sonnet-4-6');
      expect(body.temperature).toBe(0.5);
    });

    it('updateAgent sends PATCH /agents/:id', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ agent: { id: 'a1' } }));
      await api.updateAgent('a1', { name: 'Updated Bot' });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.test.com/agents/a1');
      expect(init.method).toBe('PATCH');
      const body = JSON.parse(init.body);
      expect(body.name).toBe('Updated Bot');
    });

    it('getAgent sends GET /agents/:id', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ agent: { id: 'a1', name: 'Bot' } }));
      const result = await api.getAgent('a1');

      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.test.com/agents/a1');
      expect(result.agent.name).toBe('Bot');
    });

    it('listMyAgents normalizes response into items and page_info', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          agents: [{ id: 'a1' }, { id: 'a2' }],
          page_info: { next_cursor: 'next', has_more: true },
        }),
      );
      const result = await api.listMyAgents();

      expect(result.items).toHaveLength(2);
      expect(result.page_info.has_more).toBe(true);
    });
  });

  describe('schedule methods', () => {
    it('listSchedules sends GET /agents/:id/schedules', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ items: [] }));
      await api.listSchedules('a1');

      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.test.com/agents/a1/schedules');
    });

    it('createSchedule sends POST with schedule data', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ schedule: { id: 's1' } }));
      await api.createSchedule('a1', {
        schedule_type: 'cron',
        cron_expression: '0 * * * *',
        enabled: true,
      });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.test.com/agents/a1/schedules');
      expect(init.method).toBe('POST');
      const body = JSON.parse(init.body);
      expect(body.schedule_type).toBe('cron');
      expect(body.cron_expression).toBe('0 * * * *');
    });

    it('deleteSchedule sends DELETE /agents/:id/schedules/:scheduleId', async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, 200));
      await api.deleteSchedule('a1', 's1');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.test.com/agents/a1/schedules/s1');
      expect(init.method).toBe('DELETE');
    });
  });

  describe('page methods', () => {
    it('listPages sends GET /pages', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          pages: [{ id: 'p1' }],
          page_info: { next_cursor: null, has_more: false },
        }),
      );
      const result = await api.listPages();

      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.test.com/pages');
      expect(result.items).toHaveLength(1);
    });

    it('createPage sends POST /pages with default r2_path', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ page: { id: 'p1' } }));
      await api.createPage({ title: 'My Page', slug: 'my-page' });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.test.com/pages');
      expect(init.method).toBe('POST');
      const body = JSON.parse(init.body);
      expect(body.r2_path).toBe('pages/my-page/index.html');
    });

    it('deployPage sends POST /pages/:id/deploy with Idempotency-Key', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ page: { id: 'p1' } }));
      await api.deployPage('p1');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.test.com/pages/p1/deploy');
      expect(init.method).toBe('POST');
      const headers = new Headers(init.headers);
      expect(headers.get('Idempotency-Key')).toBeTruthy();
    });

    it('forkPage sends POST /pages/:id/fork with optional slug', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ page: { id: 'p2' } }));
      await api.forkPage('p1', 'my-fork');

      const [, init] = fetchMock.mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.slug).toBe('my-fork');
    });
  });

  describe('bridge methods', () => {
    it('listBridges normalizes response', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          bridges: [{ id: 'b1', platform: 'telegram' }],
          page_info: { next_cursor: null, has_more: false },
        }),
      );
      const result = await api.listBridges();

      expect(result.items).toHaveLength(1);
      expect(result.items[0].platform).toBe('telegram');
    });

    it('connectTelegram sends POST /bridges/telegram/connect', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ bridge: { id: 'b1' } }));
      await api.connectTelegram({ bot_token: 'tok' });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.test.com/bridges/telegram/connect');
      expect(init.method).toBe('POST');
    });

    it('disconnectBridge sends DELETE /bridges/:id', async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, 200));
      await api.disconnectBridge('b1');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.test.com/bridges/b1');
      expect(init.method).toBe('DELETE');
    });
  });

  describe('crew methods', () => {
    it('createCrew sends POST /crews', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ crew: { id: 'crew1' } }));
      await api.createCrew({
        name: 'Dev Team',
        agents: [{ agent_id: 'a1', role: 'developer', goal: 'write code' }],
        process: 'sequential',
      });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.test.com/crews');
      expect(init.method).toBe('POST');
      const body = JSON.parse(init.body);
      expect(body.name).toBe('Dev Team');
      expect(body.agents).toHaveLength(1);
    });

    it('runCrew sends POST /crews/:id/run with Idempotency-Key', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ run_id: 'run1', status: 'running' }));
      await api.runCrew('crew1', { task: 'Build feature' });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.test.com/crews/crew1/run');
      const headers = new Headers(init.headers);
      expect(headers.get('Idempotency-Key')).toBeTruthy();
    });
  });

  describe('trigger methods', () => {
    it('createTrigger sends POST /agents/:id/triggers', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ trigger: { id: 't1' } }));
      await api.createTrigger('a1', {
        name: 'On Push',
        trigger_type: 'webhook',
        config: { url: 'https://hook.example.com' },
      });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.test.com/agents/a1/triggers');
      expect(init.method).toBe('POST');
    });

    it('updateTrigger sends PATCH /agents/:id/triggers/:triggerId', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ trigger: { id: 't1' } }));
      await api.updateTrigger('a1', 't1', { enabled: false });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.test.com/agents/a1/triggers/t1');
      expect(init.method).toBe('PATCH');
    });

    it('deleteTrigger sends DELETE /agents/:id/triggers/:triggerId', async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, 200));
      await api.deleteTrigger('a1', 't1');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.test.com/agents/a1/triggers/t1');
      expect(init.method).toBe('DELETE');
    });
  });

  describe('integration methods', () => {
    it('listIntegrations sends GET /integrations', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ items: [] }));
      await api.listIntegrations();

      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.test.com/integrations');
    });

    it('authorizeIntegration sends POST /integrations/:service/authorize', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ authorize_url: 'https://auth.example.com' }));
      const result = await api.authorizeIntegration('github');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.test.com/integrations/github/authorize');
      expect(init.method).toBe('POST');
      expect(result.authorize_url).toBe('https://auth.example.com');
    });

    it('disconnectIntegration sends DELETE /integrations/:service', async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, 200));
      await api.disconnectIntegration('github');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.test.com/integrations/github');
      expect(init.method).toBe('DELETE');
    });
  });
});

/* ------------------------------------------------------------------ */
/*  ApiClient auth header injection                                    */
/* ------------------------------------------------------------------ */

describe('ApiClient auth header injection', () => {
  let fetchMock: Mock;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
  });

  it('injects Bearer token from sync getAccessToken', async () => {
    const client = new ApiClient({
      baseUrl: 'https://api.test.com',
      fetchImpl: fetchMock,
      getAccessToken: () => 'sync_token',
    });
    await client.request('/test');

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe('Bearer sync_token');
  });

  it('injects Bearer token from async getAccessToken', async () => {
    const client = new ApiClient({
      baseUrl: 'https://api.test.com',
      fetchImpl: fetchMock,
      getAccessToken: async () => 'async_token',
    });
    await client.request('/test');

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe('Bearer async_token');
  });

  it('omits Authorization when getAccessToken returns undefined', async () => {
    const client = new ApiClient({
      baseUrl: 'https://api.test.com',
      fetchImpl: fetchMock,
      getAccessToken: () => undefined,
    });
    await client.request('/test');

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init.headers);
    expect(headers.has('Authorization')).toBe(false);
  });

  it('omits Authorization when no getAccessToken provided', async () => {
    const client = new ApiClient({
      baseUrl: 'https://api.test.com',
      fetchImpl: fetchMock,
    });
    await client.request('/test');

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init.headers);
    expect(headers.has('Authorization')).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  ApiClient token refresh on 401                                     */
/* ------------------------------------------------------------------ */

describe('ApiClient token refresh on 401', () => {
  let fetchMock: Mock;

  beforeEach(() => {
    fetchMock = vi.fn();
  });

  it('retries the original request after successful refresh', async () => {
    const sessionStore: SessionStoreAdapter = {
      getRefreshToken: () => 'refresh_tok',
      setTokens: vi.fn(),
      clearSession: vi.fn(),
    };

    let callCount = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/auth/refresh')) {
        return jsonResponse({ access_token: 'new_tok', refresh_token: 'new_refresh' });
      }
      callCount++;
      if (callCount === 1) {
        return jsonResponse({ error: 'Unauthorized' }, 401);
      }
      return jsonResponse({ data: 'success' });
    });

    const client = new ApiClient({
      baseUrl: 'https://api.test.com',
      fetchImpl: fetchMock,
      getAccessToken: () => 'expired',
      sessionStore,
    });

    const result = await client.request<{ data: string }>('/protected');
    expect(result.data).toBe('success');
    expect(sessionStore.setTokens).toHaveBeenCalledWith('new_tok', 'new_refresh');
  });

  it('does not refresh on non-401 errors', async () => {
    const sessionStore: SessionStoreAdapter = {
      getRefreshToken: () => 'refresh_tok',
      setTokens: vi.fn(),
      clearSession: vi.fn(),
    };

    fetchMock.mockResolvedValue(jsonResponse({ error: 'Forbidden' }, 403));

    const client = new ApiClient({
      baseUrl: 'https://api.test.com',
      fetchImpl: fetchMock,
      sessionStore,
    });

    await expect(client.request('/admin')).rejects.toThrow(ApiError);
    // Only the original request, no refresh attempt
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not loop on refresh when retry also returns 401', async () => {
    const sessionStore: SessionStoreAdapter = {
      getRefreshToken: () => 'refresh_tok',
      setTokens: vi.fn(),
      clearSession: vi.fn(),
    };

    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/auth/refresh')) {
        return jsonResponse({ access_token: 'new_tok', refresh_token: 'new_r' });
      }
      return jsonResponse({ error: 'Unauthorized' }, 401);
    });

    const client = new ApiClient({
      baseUrl: 'https://api.test.com',
      fetchImpl: fetchMock,
      getAccessToken: () => 'tok',
      sessionStore,
    });

    await expect(client.request('/test')).rejects.toThrow(ApiError);
    // Original + refresh + retry = 3 calls total
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

/* ------------------------------------------------------------------ */
/*  ApiClient error mapping                                            */
/* ------------------------------------------------------------------ */

describe('ApiClient error mapping', () => {
  let fetchMock: Mock;

  beforeEach(() => {
    fetchMock = vi.fn();
  });

  it('maps 400 to ApiError with status 400', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'Bad request' }, 400));
    const client = new ApiClient({ baseUrl: 'https://api.test.com', fetchImpl: fetchMock });

    try {
      await client.request('/test');
      expect.fail('Should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(400);
      expect((err as ApiError).message).toBe('Bad request');
    }
  });

  it('maps 404 to ApiError with status 404', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'Not found', code: 'NOT_FOUND' }, 404));
    const client = new ApiClient({ baseUrl: 'https://api.test.com', fetchImpl: fetchMock });

    try {
      await client.request('/missing');
      expect.fail('Should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(404);
      expect((err as ApiError).code).toBe('NOT_FOUND');
    }
  });

  it('maps 500 to ApiError with status 500', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Internal server error' }, 500));
    const client = new ApiClient({ baseUrl: 'https://api.test.com', fetchImpl: fetchMock });

    try {
      await client.request('/crash');
      expect.fail('Should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(500);
    }
  });

  it('maps text error response to ApiError', async () => {
    fetchMock.mockResolvedValue(textResponse('Service Unavailable', 503));
    const client = new ApiClient({ baseUrl: 'https://api.test.com', fetchImpl: fetchMock });

    try {
      await client.request('/down');
      expect.fail('Should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(503);
    }
  });

  it('maps 409 conflict to ApiError', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'Conflict', code: 'DUPLICATE' }, 409));
    const client = new ApiClient({ baseUrl: 'https://api.test.com', fetchImpl: fetchMock });

    try {
      await client.request('/duplicate');
      expect.fail('Should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(409);
      expect((err as ApiError).code).toBe('DUPLICATE');
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Idempotency key generation                                         */
/* ------------------------------------------------------------------ */

describe('Idempotency key generation', () => {
  let fetchMock: Mock;
  let api: WaiAgentsApi;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    const client = new ApiClient({
      baseUrl: 'https://api.test.com',
      fetchImpl: fetchMock,
    });
    api = new WaiAgentsApi(client);
  });

  it('sendTextMessage generates unique idempotency keys', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ message: { id: 'm1' } }))
      .mockResolvedValueOnce(jsonResponse({ message: { id: 'm2' } }));
    await api.sendTextMessage('c1', 'hello');
    await api.sendTextMessage('c1', 'world');

    const key1 = new Headers(fetchMock.mock.calls[0][1].headers).get('Idempotency-Key');
    const key2 = new Headers(fetchMock.mock.calls[1][1].headers).get('Idempotency-Key');

    expect(key1).toBeTruthy();
    expect(key2).toBeTruthy();
    expect(key1).not.toBe(key2);
  });

  it('forkFeedItem includes Idempotency-Key header', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ feed_item: { id: 'f1' } }));
    await api.forkFeedItem('f1');

    const headers = new Headers(fetchMock.mock.calls[0][1].headers);
    expect(headers.get('Idempotency-Key')).toBeTruthy();
  });

  it('deployPage includes Idempotency-Key header', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ page: { id: 'p1' } }));
    await api.deployPage('p1');

    const headers = new Headers(fetchMock.mock.calls[0][1].headers);
    expect(headers.get('Idempotency-Key')).toBeTruthy();
  });

  it('runCrew includes Idempotency-Key header', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ run_id: 'r1', status: 'running' }));
    await api.runCrew('crew1');

    const headers = new Headers(fetchMock.mock.calls[0][1].headers);
    expect(headers.get('Idempotency-Key')).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ */
/*  Request cancellation via AbortController                           */
/* ------------------------------------------------------------------ */

describe('Request cancellation via AbortController', () => {
  it('forwards the signal to fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    const client = new ApiClient({
      baseUrl: 'https://api.test.com',
      fetchImpl: fetchMock,
    });

    const controller = new AbortController();
    await client.request('/test', { signal: controller.signal });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.signal).toBe(controller.signal);
  });

  it('throws when request is aborted', async () => {
    const fetchMock = vi.fn().mockImplementation(() => {
      throw new DOMException('The operation was aborted.', 'AbortError');
    });
    const client = new ApiClient({
      baseUrl: 'https://api.test.com',
      fetchImpl: fetchMock,
    });

    const controller = new AbortController();
    controller.abort();

    await expect(client.request('/test', { signal: controller.signal })).rejects.toThrow(
      'The operation was aborted.',
    );
  });
});
