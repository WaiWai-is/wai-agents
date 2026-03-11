import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from '../client';
import { WaiAgentsApi, createWaiAgentsApi } from '../services';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('WaiAgentsApi', () => {
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

  describe('auth methods', () => {
    it('register sends POST /auth/register', async () => {
      const body = {
        username: 'alice',
        email: 'alice@test.com',
        password: 'pass123',
        display_name: 'Alice',
      };
      fetchMock.mockResolvedValue(
        jsonResponse({ user: { id: '1' }, tokens: { access_token: 'a', refresh_token: 'r' } }),
      );

      await api.register(body);

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.test.com/auth/register');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body)).toEqual(body);
    });

    it('login sends POST /auth/login', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ user: { id: '1' }, tokens: { access_token: 'a', refresh_token: 'r' } }),
      );

      await api.login({ email: 'a@b.com', password: 'p' });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.test.com/auth/login');
      expect(init.method).toBe('POST');
    });

    it('refresh sends POST /auth/refresh', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ access_token: 'new', refresh_token: 'new_r' }),
      );

      await api.refresh('old_refresh_tok');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.test.com/auth/refresh');
      expect(JSON.parse(init.body)).toEqual({ refresh_token: 'old_refresh_tok' });
    });

    it('logout sends DELETE /auth/logout', async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, 200));

      await api.logout('rt');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.test.com/auth/logout');
      expect(init.method).toBe('DELETE');
    });

    it('requestMagicLink sends POST /auth/magic-link', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ message: 'sent' }));

      await api.requestMagicLink('a@b.com');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.test.com/auth/magic-link');
      expect(JSON.parse(init.body)).toEqual({ email: 'a@b.com' });
    });

    it('verifyMagicLink sends POST /auth/magic-link/verify', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ user: { id: '1' }, tokens: { access_token: 'a', refresh_token: 'r' } }),
      );

      await api.verifyMagicLink('tok_abc');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.test.com/auth/magic-link/verify');
      expect(JSON.parse(init.body)).toEqual({ token: 'tok_abc' });
    });
  });

  describe('user methods', () => {
    it('me sends GET /users/me', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ user: { id: '1', username: 'me' } }));

      const result = await api.me();

      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.test.com/users/me');
      expect(result.user.username).toBe('me');
    });

    it('updateMe sends PATCH /users/me', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ user: { id: '1' } }));

      await api.updateMe({ display_name: 'New Name' });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.test.com/users/me');
      expect(init.method).toBe('PATCH');
    });

    it('userByUsername encodes the username', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ user: { id: '2' } }));

      await api.userByUsername('user name');

      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.test.com/users/user%20name');
    });
  });

  describe('conversation methods', () => {
    it('listConversations normalizes response into items and page_info', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          conversations: [
            { id: 'c1', type: 'dm', title: null },
            { id: 'c2', type: 'group', title: 'Group' },
          ],
          page_info: { next_cursor: 'cursor_2', has_more: true },
        }),
      );

      const result = await api.listConversations();

      expect(result.items).toHaveLength(2);
      expect(result.items[0].id).toBe('c1');
      expect(result.page_info.next_cursor).toBe('cursor_2');
      expect(result.page_info.has_more).toBe(true);
    });

    it('listConversations passes cursor and limit as query params', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ conversations: [], page_info: { next_cursor: null, has_more: false } }));

      await api.listConversations({ cursor: 'abc', limit: 5 });

      const [url] = fetchMock.mock.calls[0];
      expect(url).toContain('cursor=abc');
      expect(url).toContain('limit=5');
    });

    it('createConversation normalizes member_id to member_ids array', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ conversation: { id: 'c1' } }));

      await api.createConversation({ type: 'dm', member_id: 'u_42' });

      const [, init] = fetchMock.mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.member_ids).toEqual(['u_42']);
      expect(body).not.toHaveProperty('member_id');
    });

    it('createConversation omits empty metadata', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ conversation: { id: 'c1' } }));

      await api.createConversation({ type: 'group', title: 'Test', metadata: {} });

      const [, init] = fetchMock.mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body).not.toHaveProperty('metadata');
    });

    it('sendTextMessage includes an Idempotency-Key header', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ message: { id: 'm1' } }));

      await api.sendTextMessage('c1', 'hello');

      const [, init] = fetchMock.mock.calls[0];
      const headers = new Headers(init.headers);
      expect(headers.get('Idempotency-Key')).toBeTruthy();
    });

    it('sendTextMessage sends correct body structure', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ message: { id: 'm1' } }));

      await api.sendTextMessage('c1', 'hello');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.test.com/conversations/c1/messages');
      const body = JSON.parse(init.body);
      expect(body.content).toEqual([{ type: 'text', text: 'hello' }]);
    });

    it('sendTextMessage includes metadata when non-empty', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ message: { id: 'm1' } }));

      await api.sendTextMessage('c1', 'hello', { source: 'web' });

      const [, init] = fetchMock.mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.metadata).toEqual({ source: 'web' });
    });

    it('listMembers requests the correct path', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ members: [], page_info: { next_cursor: null, has_more: false } }));

      await api.listMembers('c1');

      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.test.com/conversations/c1/members');
    });
  });

  describe('agent methods', () => {
    it('startAgentConversation sends POST /agents/:id/conversation', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ conversation: { id: 'conv_1' } }));

      await api.startAgentConversation('agent_1');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.test.com/agents/agent_1/conversation');
      expect(init.method).toBe('POST');
    });

    it('deleteAgent sends DELETE /agents/:id', async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, 200));

      await api.deleteAgent('agent_1');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.test.com/agents/agent_1');
      expect(init.method).toBe('DELETE');
    });
  });

  describe('feed methods', () => {
    it('listFeed defaults to /feed for "for_you"', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ items: [] }));

      await api.listFeed();

      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.test.com/feed');
    });

    it('listFeed uses correct path for each kind', async () => {
      fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ items: [] })));

      await api.listFeed('trending');
      expect(fetchMock.mock.calls[0][0]).toBe('https://api.test.com/feed/trending');

      await api.listFeed('following');
      expect(fetchMock.mock.calls[1][0]).toBe('https://api.test.com/feed/following');

      await api.listFeed('new');
      expect(fetchMock.mock.calls[2][0]).toBe('https://api.test.com/feed/new');
    });

    it('forkFeedItem includes Idempotency-Key', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ feed_item: { id: 'f1' } }));

      await api.forkFeedItem('f1');

      const [, init] = fetchMock.mock.calls[0];
      const headers = new Headers(init.headers);
      expect(headers.get('Idempotency-Key')).toBeTruthy();
    });
  });

  describe('marketplace methods', () => {
    it('searchMarketplace includes query parameter', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ agents: [] }));

      await api.searchMarketplace('chatbot');

      const [url] = fetchMock.mock.calls[0];
      expect(url).toContain('q=chatbot');
    });

    it('marketplaceCategories normalizes string categories', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ categories: ['Productivity', 'Creative Tools'] }),
      );

      const result = await api.marketplaceCategories();

      expect(result.categories).toHaveLength(2);
      expect(result.categories[0]).toEqual({
        slug: 'productivity',
        name: 'Productivity',
        description: '',
      });
      expect(result.categories[1]).toEqual({
        slug: 'creative-tools',
        name: 'Creative Tools',
        description: '',
      });
    });

    it('marketplaceCategories normalizes object categories', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          categories: [{ name: 'AI Assistants', slug: 'ai-assistants', description: 'AI helpers' }],
        }),
      );

      const result = await api.marketplaceCategories();

      expect(result.categories[0]).toEqual({
        slug: 'ai-assistants',
        name: 'AI Assistants',
        description: 'AI helpers',
      });
    });

    it('normalizeMarketplaceAgent computes average_rating from sum/count', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          agents: [
            {
              id: 'a1',
              name: 'Bot',
              rating_sum: 45,
              rating_count: 10,
              usage_count: 100,
            },
          ],
        }),
      );

      const result = await api.listMarketplace();

      expect(result.items[0].average_rating).toBe(4.5);
      expect(result.items[0].rating_count).toBe(10);
      expect(result.items[0].usage_count).toBe(100);
    });

    it('normalizeMarketplaceAgent prefers average_rating when present', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          agents: [
            {
              id: 'a1',
              name: 'Bot',
              average_rating: 3.8,
              rating_sum: 0,
              rating_count: 0,
            },
          ],
        }),
      );

      const result = await api.listMarketplace();

      expect(result.items[0].average_rating).toBe(3.8);
    });
  });

  describe('list response normalization', () => {
    it('handles response with items key', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          items: [{ id: 'm1' }, { id: 'm2' }],
          page_info: { next_cursor: 'next', has_more: true },
        }),
      );

      const result = await api.listMessages('c1');

      expect(result.items).toHaveLength(2);
      expect(result.page_info.has_more).toBe(true);
    });

    it('handles response with alternative collection key', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          messages: [{ id: 'm1' }],
          page_info: { next_cursor: null, has_more: false },
        }),
      );

      const result = await api.listMessages('c1');

      expect(result.items).toHaveLength(1);
    });

    it('returns empty items for payload without matching collection key', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ something_else: [1, 2, 3] }));

      const result = await api.listMessages('c1');

      expect(result.items).toEqual([]);
    });

    it('handles camelCase page_info (pageInfo)', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          conversations: [{ id: 'c1' }],
          pageInfo: { nextCursor: 'abc', hasMore: true },
        }),
      );

      const result = await api.listConversations();

      expect(result.page_info.next_cursor).toBe('abc');
      expect(result.page_info.has_more).toBe(true);
    });

    it('returns default page_info when missing', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ conversations: [{ id: 'c1' }] }));

      const result = await api.listConversations();

      expect(result.page_info).toEqual({ next_cursor: null, has_more: false });
    });
  });
});

describe('createWaiAgentsApi', () => {
  it('creates an API instance (smoke test)', () => {
    // process.env.NEXT_PUBLIC_API_BASE_URL may not be set, falls back to /api/v1
    const api = createWaiAgentsApi();
    expect(api).toBeInstanceOf(WaiAgentsApi);
  });

  it('creates an API with a token provider', () => {
    const api = createWaiAgentsApi(() => 'my_token');
    expect(api).toBeInstanceOf(WaiAgentsApi);
  });
});
