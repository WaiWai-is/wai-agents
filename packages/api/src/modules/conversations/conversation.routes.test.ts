/* eslint-disable @typescript-eslint/no-explicit-any */
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { conversationRoutes } from './conversation.routes.js';

const CONV_ID = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_CONV_ID = '660e8400-e29b-41d4-a716-446655440001';
const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OTHER_USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const MESSAGE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const AGENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

// Mock DB connection
vi.mock('../../db/connection.js', () => ({
  sql: Object.assign(vi.fn(), { unsafe: vi.fn() }),
  db: {},
}));

// Mock conversation service
vi.mock('./conversation.service.js', () => ({
  listConversations: vi.fn(),
  createConversation: vi.fn(),
  getConversation: vi.fn(),
  updateConversation: vi.fn(),
  deleteConversation: vi.fn(),
  listMessages: vi.fn(),
  sendMessage: vi.fn(),
  listMembers: vi.fn(),
  addMember: vi.fn(),
  removeMember: vi.fn(),
}));

// Mock social service
vi.mock('../social/social.service.js', () => ({
  submitMessageFeedback: vi.fn(),
  shouldPromptFeedback: vi.fn(),
}));

async function getTokenHeader(): Promise<Record<string, string>> {
  const { generateTokens } = await import('../auth/auth.service.js');
  const { access_token } = await generateTokens(USER_ID, 'user');
  return { Authorization: `Bearer ${access_token}` };
}

function buildApp() {
  const app = new Hono();
  app.route('/conversations', conversationRoutes);
  return app;
}

async function request(
  app: ReturnType<typeof buildApp>,
  method: string,
  path: string,
  opts: { body?: unknown; headers?: Record<string, string> } = {},
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...opts.headers,
  };
  const req = new Request(`http://localhost${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const res = await app.fetch(req);
  const json = (await res.json().catch(() => null)) as any;
  return { status: res.status, body: json };
}

let app: ReturnType<typeof buildApp>;

beforeEach(() => {
  vi.clearAllMocks();
  app = buildApp();
});

/* -------------------------------------------------------------------------- */
/*  Authentication — all routes require auth                                  */
/* -------------------------------------------------------------------------- */

describe('Conversation Routes — Authentication', () => {
  it('GET /conversations returns 401 without auth token', async () => {
    const { status, body } = await request(app, 'GET', '/conversations');
    expect(status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('POST /conversations returns 401 without auth token', async () => {
    const { status } = await request(app, 'POST', '/conversations', {
      body: { type: 'dm' },
    });
    expect(status).toBe(401);
  });

  it('GET /conversations/:id returns 401 without auth token', async () => {
    const { status } = await request(app, 'GET', `/conversations/${CONV_ID}`);
    expect(status).toBe(401);
  });

  it('PATCH /conversations/:id returns 401 without auth token', async () => {
    const { status } = await request(app, 'PATCH', `/conversations/${CONV_ID}`, {
      body: { title: 'New Title' },
    });
    expect(status).toBe(401);
  });

  it('DELETE /conversations/:id returns 401 without auth token', async () => {
    const { status } = await request(app, 'DELETE', `/conversations/${CONV_ID}`);
    expect(status).toBe(401);
  });

  it('GET /conversations/:id/messages returns 401 without auth token', async () => {
    const { status } = await request(app, 'GET', `/conversations/${CONV_ID}/messages`);
    expect(status).toBe(401);
  });

  it('POST /conversations/:id/messages returns 401 without auth token', async () => {
    const { status } = await request(app, 'POST', `/conversations/${CONV_ID}/messages`, {
      body: { content: [{ type: 'text', text: 'hello' }] },
      headers: { 'Idempotency-Key': 'key-1' },
    });
    expect(status).toBe(401);
  });

  it('GET /conversations/:id/members returns 401 without auth token', async () => {
    const { status } = await request(app, 'GET', `/conversations/${CONV_ID}/members`);
    expect(status).toBe(401);
  });

  it('POST /conversations/:id/members returns 401 without auth token', async () => {
    const { status } = await request(app, 'POST', `/conversations/${CONV_ID}/members`, {
      body: { user_id: OTHER_USER_ID },
    });
    expect(status).toBe(401);
  });

  it('DELETE /conversations/:id/members/:userId returns 401 without auth token', async () => {
    const { status } = await request(
      app,
      'DELETE',
      `/conversations/${CONV_ID}/members/${OTHER_USER_ID}`,
    );
    expect(status).toBe(401);
  });

  it('POST /conversations/:id/messages/:messageId/feedback returns 401 without auth token', async () => {
    const { status } = await request(
      app,
      'POST',
      `/conversations/${CONV_ID}/messages/${MESSAGE_ID}/feedback`,
      { body: { feedback: 'positive' } },
    );
    expect(status).toBe(401);
  });

  it('GET /conversations/:id/should-prompt-feedback returns 401 without auth token', async () => {
    const { status } = await request(
      app,
      'GET',
      `/conversations/${CONV_ID}/should-prompt-feedback`,
    );
    expect(status).toBe(401);
  });

  it('rejects invalid auth token with 401', async () => {
    const { status } = await request(app, 'GET', '/conversations', {
      headers: { Authorization: 'Bearer invalid.token.here' },
    });
    expect(status).toBe(401);
  });
});

/* -------------------------------------------------------------------------- */
/*  GET /conversations                                                        */
/* -------------------------------------------------------------------------- */

describe('GET /conversations', () => {
  it('returns 200 with conversations list', async () => {
    const { listConversations } = await import('./conversation.service.js');
    vi.mocked(listConversations).mockResolvedValueOnce([
      {
        id: CONV_ID,
        type: 'dm',
        title: 'Test Chat',
        avatar_url: null,
        creator_id: USER_ID,
        agent_id: null,
        metadata: {},
        last_message_at: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        unread_count: 0,
        last_message: null,
      },
    ] as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'GET', '/conversations', {
      headers: authHeaders,
    });

    expect(status).toBe(200);
    expect(body.conversations).toHaveLength(1);
    expect(body.conversations[0].id).toBe(CONV_ID);
    expect(body.conversations[0].type).toBe('dm');
  });

  it('returns 200 with empty list when user has no conversations', async () => {
    const { listConversations } = await import('./conversation.service.js');
    vi.mocked(listConversations).mockResolvedValueOnce([]);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'GET', '/conversations', {
      headers: authHeaders,
    });

    expect(status).toBe(200);
    expect(body.conversations).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/*  POST /conversations                                                       */
/* -------------------------------------------------------------------------- */

describe('POST /conversations', () => {
  it('returns 201 with created conversation', async () => {
    const { createConversation } = await import('./conversation.service.js');
    vi.mocked(createConversation).mockResolvedValueOnce({
      id: CONV_ID,
      type: 'dm',
      title: null,
      avatar_url: null,
      creator_id: USER_ID,
      agent_id: null,
      metadata: {},
      last_message_at: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    } as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'POST', '/conversations', {
      headers: authHeaders,
      body: { type: 'dm' },
    });

    expect(status).toBe(201);
    expect(body.conversation.id).toBe(CONV_ID);
    expect(body.conversation.type).toBe('dm');
  });

  it('returns 201 with title and member_ids', async () => {
    const { createConversation } = await import('./conversation.service.js');
    vi.mocked(createConversation).mockResolvedValueOnce({
      id: CONV_ID,
      type: 'group',
      title: 'My Group',
      avatar_url: null,
      creator_id: USER_ID,
      agent_id: null,
      metadata: {},
      last_message_at: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    } as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'POST', '/conversations', {
      headers: authHeaders,
      body: { type: 'group', title: 'My Group', member_ids: [OTHER_USER_ID] },
    });

    expect(status).toBe(201);
    expect(body.conversation.title).toBe('My Group');
    expect(vi.mocked(createConversation)).toHaveBeenCalledWith(USER_ID, {
      type: 'group',
      title: 'My Group',
      member_ids: [OTHER_USER_ID],
    });
  });

  it('returns 201 for agent type conversation', async () => {
    const { createConversation } = await import('./conversation.service.js');
    vi.mocked(createConversation).mockResolvedValueOnce({
      id: CONV_ID,
      type: 'agent',
      title: null,
      avatar_url: null,
      creator_id: USER_ID,
      agent_id: null,
      metadata: {},
      last_message_at: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    } as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'POST', '/conversations', {
      headers: authHeaders,
      body: { type: 'agent' },
    });

    expect(status).toBe(201);
    expect(body.conversation.type).toBe('agent');
  });

  it('returns 422 when type is missing', async () => {
    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'POST', '/conversations', {
      headers: authHeaders,
      body: {},
    });

    expect(status).toBe(422);
    expect(body.error).toBe('Validation error');
  });

  it('returns 422 for invalid type value', async () => {
    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'POST', '/conversations', {
      headers: authHeaders,
      body: { type: 'invalid_type' },
    });

    expect(status).toBe(422);
    expect(body.error).toBe('Validation error');
  });

  it('returns 422 for invalid member_ids format (non-UUID)', async () => {
    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'POST', '/conversations', {
      headers: authHeaders,
      body: { type: 'group', member_ids: ['not-a-uuid'] },
    });

    expect(status).toBe(422);
    expect(body.error).toBe('Validation error');
  });

  it('returns 422 for title exceeding 255 chars', async () => {
    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'POST', '/conversations', {
      headers: authHeaders,
      body: { type: 'dm', title: 'a'.repeat(256) },
    });

    expect(status).toBe(422);
    expect(body.error).toBe('Validation error');
  });

  it('returns 422 for invalid JSON body', async () => {
    const authHeaders = await getTokenHeader();
    const res = await app.fetch(
      new Request('http://localhost/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: 'not-json',
      }),
    );
    expect(res.status).toBe(422);
  });
});

/* -------------------------------------------------------------------------- */
/*  GET /conversations/:id                                                    */
/* -------------------------------------------------------------------------- */

describe('GET /conversations/:id', () => {
  it('returns 200 with conversation data', async () => {
    const { getConversation } = await import('./conversation.service.js');
    vi.mocked(getConversation).mockResolvedValueOnce({
      id: CONV_ID,
      type: 'dm',
      title: 'Chat',
      avatar_url: null,
      creator_id: USER_ID,
      agent_id: null,
      metadata: {},
      last_message_at: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    } as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'GET', `/conversations/${CONV_ID}`, {
      headers: authHeaders,
    });

    expect(status).toBe(200);
    expect(body.conversation.id).toBe(CONV_ID);
  });

  it('returns 404 for non-existent conversation', async () => {
    const { getConversation } = await import('./conversation.service.js');
    vi.mocked(getConversation).mockRejectedValueOnce(
      Object.assign(new Error('Conversation not found or access denied'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'GET', `/conversations/${OTHER_CONV_ID}`, {
      headers: authHeaders,
    });

    expect(status).toBe(404);
    expect(body.error).toBe('Not found');
  });

  it('returns 404 when user is not a member', async () => {
    const { getConversation } = await import('./conversation.service.js');
    vi.mocked(getConversation).mockRejectedValueOnce(
      Object.assign(new Error('Conversation not found or access denied'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'GET', `/conversations/${CONV_ID}`, {
      headers: authHeaders,
    });

    expect(status).toBe(404);
  });

  it('returns 400 for invalid UUID format', async () => {
    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'GET', '/conversations/not-a-uuid', {
      headers: authHeaders,
    });

    expect(status).toBe(400);
    expect(body.error).toBe('Invalid ID format');
  });
});

/* -------------------------------------------------------------------------- */
/*  PATCH /conversations/:id                                                  */
/* -------------------------------------------------------------------------- */

describe('PATCH /conversations/:id', () => {
  it('returns 200 with updated conversation', async () => {
    const { updateConversation } = await import('./conversation.service.js');
    vi.mocked(updateConversation).mockResolvedValueOnce({
      id: CONV_ID,
      type: 'dm',
      title: 'Updated Title',
      avatar_url: null,
      creator_id: USER_ID,
      agent_id: null,
      metadata: {},
      last_message_at: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    } as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'PATCH', `/conversations/${CONV_ID}`, {
      headers: authHeaders,
      body: { title: 'Updated Title' },
    });

    expect(status).toBe(200);
    expect(body.conversation.title).toBe('Updated Title');
  });

  it('returns 200 when updating avatar_url', async () => {
    const { updateConversation } = await import('./conversation.service.js');
    vi.mocked(updateConversation).mockResolvedValueOnce({
      id: CONV_ID,
      type: 'group',
      title: 'Group',
      avatar_url: 'https://example.com/avatar.jpg',
      creator_id: USER_ID,
      agent_id: null,
      metadata: {},
      last_message_at: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    } as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'PATCH', `/conversations/${CONV_ID}`, {
      headers: authHeaders,
      body: { avatar_url: 'https://example.com/avatar.jpg' },
    });

    expect(status).toBe(200);
    expect(body.conversation.avatar_url).toBe('https://example.com/avatar.jpg');
  });

  it('returns 422 for invalid avatar_url', async () => {
    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'PATCH', `/conversations/${CONV_ID}`, {
      headers: authHeaders,
      body: { avatar_url: 'not-a-url' },
    });

    expect(status).toBe(422);
    expect(body.error).toBe('Validation error');
  });

  it('returns 422 for title exceeding 255 chars', async () => {
    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'PATCH', `/conversations/${CONV_ID}`, {
      headers: authHeaders,
      body: { title: 'a'.repeat(256) },
    });

    expect(status).toBe(422);
    expect(body.error).toBe('Validation error');
  });

  it('returns 404 for non-existent conversation', async () => {
    const { updateConversation } = await import('./conversation.service.js');
    vi.mocked(updateConversation).mockRejectedValueOnce(
      Object.assign(new Error('Conversation not found or access denied'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'PATCH', `/conversations/${CONV_ID}`, {
      headers: authHeaders,
      body: { title: 'Nope' },
    });

    expect(status).toBe(404);
    expect(body.error).toBe('Not found');
  });

  it('returns 403 when non-admin tries to update', async () => {
    const { updateConversation } = await import('./conversation.service.js');
    vi.mocked(updateConversation).mockRejectedValueOnce(
      Object.assign(new Error('Forbidden: must be owner or admin'), { code: 'FORBIDDEN' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'PATCH', `/conversations/${CONV_ID}`, {
      headers: authHeaders,
      body: { title: 'Hacked' },
    });

    expect(status).toBe(403);
    expect(body.error).toBe('Forbidden');
  });

  it('returns 400 for invalid UUID format', async () => {
    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'PATCH', '/conversations/not-a-uuid', {
      headers: authHeaders,
      body: { title: 'Test' },
    });

    expect(status).toBe(400);
    expect(body.error).toBe('Invalid ID format');
  });

  it('returns 422 for invalid JSON body', async () => {
    const authHeaders = await getTokenHeader();
    const res = await app.fetch(
      new Request(`http://localhost/conversations/${CONV_ID}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: 'not-json',
      }),
    );
    expect(res.status).toBe(422);
  });
});

/* -------------------------------------------------------------------------- */
/*  DELETE /conversations/:id                                                 */
/* -------------------------------------------------------------------------- */

describe('DELETE /conversations/:id', () => {
  it('returns 200 with ok true on successful deletion', async () => {
    const { deleteConversation } = await import('./conversation.service.js');
    vi.mocked(deleteConversation).mockResolvedValueOnce(undefined);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'DELETE', `/conversations/${CONV_ID}`, {
      headers: authHeaders,
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it('returns 404 for non-existent conversation', async () => {
    const { deleteConversation } = await import('./conversation.service.js');
    vi.mocked(deleteConversation).mockRejectedValueOnce(
      Object.assign(new Error('Conversation not found or access denied'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'DELETE', `/conversations/${CONV_ID}`, {
      headers: authHeaders,
    });

    expect(status).toBe(404);
    expect(body.error).toBe('Not found');
  });

  it('returns 403 when non-owner tries to delete', async () => {
    const { deleteConversation } = await import('./conversation.service.js');
    vi.mocked(deleteConversation).mockRejectedValueOnce(
      Object.assign(new Error('Forbidden: must be owner'), { code: 'FORBIDDEN' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'DELETE', `/conversations/${CONV_ID}`, {
      headers: authHeaders,
    });

    expect(status).toBe(403);
    expect(body.error).toBe('Forbidden');
  });

  it('returns 400 for invalid UUID format', async () => {
    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'DELETE', '/conversations/not-a-uuid', {
      headers: authHeaders,
    });

    expect(status).toBe(400);
    expect(body.error).toBe('Invalid ID format');
  });
});

/* -------------------------------------------------------------------------- */
/*  GET /conversations/:id/messages                                           */
/* -------------------------------------------------------------------------- */

describe('GET /conversations/:id/messages', () => {
  it('returns 200 with messages', async () => {
    const { listMessages } = await import('./conversation.service.js');
    vi.mocked(listMessages).mockResolvedValueOnce([
      {
        id: MESSAGE_ID,
        conversation_id: CONV_ID,
        sender_id: USER_ID,
        sender_type: 'human',
        type: 'text',
        content: [{ type: 'text', text: 'Hello' }],
        metadata: {},
        edited_at: null,
        deleted_at: null,
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ] as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'GET', `/conversations/${CONV_ID}/messages`, {
      headers: authHeaders,
    });

    expect(status).toBe(200);
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].id).toBe(MESSAGE_ID);
  });

  it('returns 200 with empty messages list', async () => {
    const { listMessages } = await import('./conversation.service.js');
    vi.mocked(listMessages).mockResolvedValueOnce([]);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'GET', `/conversations/${CONV_ID}/messages`, {
      headers: authHeaders,
    });

    expect(status).toBe(200);
    expect(body.messages).toHaveLength(0);
  });

  it('passes cursor query param to service', async () => {
    const { listMessages } = await import('./conversation.service.js');
    vi.mocked(listMessages).mockResolvedValueOnce([]);

    const cursorId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
    const authHeaders = await getTokenHeader();
    await request(app, 'GET', `/conversations/${CONV_ID}/messages?cursor=${cursorId}`, {
      headers: authHeaders,
    });

    expect(vi.mocked(listMessages)).toHaveBeenCalledWith(CONV_ID, USER_ID, cursorId, 50);
  });

  it('passes limit query param to service', async () => {
    const { listMessages } = await import('./conversation.service.js');
    vi.mocked(listMessages).mockResolvedValueOnce([]);

    const authHeaders = await getTokenHeader();
    await request(app, 'GET', `/conversations/${CONV_ID}/messages?limit=20`, {
      headers: authHeaders,
    });

    expect(vi.mocked(listMessages)).toHaveBeenCalledWith(CONV_ID, USER_ID, undefined, 20);
  });

  it('passes cursor and limit together', async () => {
    const { listMessages } = await import('./conversation.service.js');
    vi.mocked(listMessages).mockResolvedValueOnce([]);

    const cursorId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
    const authHeaders = await getTokenHeader();
    await request(app, 'GET', `/conversations/${CONV_ID}/messages?cursor=${cursorId}&limit=10`, {
      headers: authHeaders,
    });

    expect(vi.mocked(listMessages)).toHaveBeenCalledWith(CONV_ID, USER_ID, cursorId, 10);
  });

  it('defaults limit to 50 for NaN limit param', async () => {
    const { listMessages } = await import('./conversation.service.js');
    vi.mocked(listMessages).mockResolvedValueOnce([]);

    const authHeaders = await getTokenHeader();
    await request(app, 'GET', `/conversations/${CONV_ID}/messages?limit=abc`, {
      headers: authHeaders,
    });

    expect(vi.mocked(listMessages)).toHaveBeenCalledWith(CONV_ID, USER_ID, undefined, 50);
  });

  it('returns 404 when user is not a member', async () => {
    const { listMessages } = await import('./conversation.service.js');
    vi.mocked(listMessages).mockRejectedValueOnce(
      Object.assign(new Error('Conversation not found or access denied'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'GET', `/conversations/${CONV_ID}/messages`, {
      headers: authHeaders,
    });

    expect(status).toBe(404);
    expect(body.error).toBe('Not found');
  });

  it('returns 400 for invalid cursor', async () => {
    const { listMessages } = await import('./conversation.service.js');
    vi.mocked(listMessages).mockRejectedValueOnce(
      Object.assign(new Error('Invalid cursor'), { code: 'BAD_REQUEST' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'GET',
      `/conversations/${CONV_ID}/messages?cursor=bad-cursor`,
      { headers: authHeaders },
    );

    expect(status).toBe(400);
    expect(body.error).toBe('Bad request');
  });

  it('returns 400 for invalid UUID format', async () => {
    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'GET', '/conversations/not-a-uuid/messages', {
      headers: authHeaders,
    });

    expect(status).toBe(400);
    expect(body.error).toBe('Invalid ID format');
  });
});

/* -------------------------------------------------------------------------- */
/*  POST /conversations/:id/messages                                          */
/* -------------------------------------------------------------------------- */

describe('POST /conversations/:id/messages', () => {
  it('returns 201 with sent message', async () => {
    const { sendMessage } = await import('./conversation.service.js');
    vi.mocked(sendMessage).mockResolvedValueOnce({
      id: MESSAGE_ID,
      conversation_id: CONV_ID,
      sender_id: USER_ID,
      sender_type: 'human',
      type: 'text',
      content: [{ type: 'text', text: 'Hello world' }],
      metadata: {},
      edited_at: null,
      deleted_at: null,
      created_at: '2026-01-01T00:00:00.000Z',
    } as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'POST', `/conversations/${CONV_ID}/messages`, {
      headers: { ...authHeaders, 'Idempotency-Key': 'idem-1' },
      body: { content: [{ type: 'text', text: 'Hello world' }] },
    });

    expect(status).toBe(201);
    expect(body.message.id).toBe(MESSAGE_ID);
    expect(body.message.content[0].text).toBe('Hello world');
  });

  it('passes idempotency key to service', async () => {
    const { sendMessage } = await import('./conversation.service.js');
    vi.mocked(sendMessage).mockResolvedValueOnce({ id: MESSAGE_ID } as any);

    const authHeaders = await getTokenHeader();
    await request(app, 'POST', `/conversations/${CONV_ID}/messages`, {
      headers: { ...authHeaders, 'Idempotency-Key': 'unique-key-123' },
      body: { content: [{ type: 'text', text: 'test' }] },
    });

    expect(vi.mocked(sendMessage)).toHaveBeenCalledWith(
      CONV_ID,
      USER_ID,
      { content: [{ type: 'text', text: 'test' }] },
      'unique-key-123',
    );
  });

  it('returns 400 when Idempotency-Key header is missing', async () => {
    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'POST', `/conversations/${CONV_ID}/messages`, {
      headers: authHeaders,
      body: { content: [{ type: 'text', text: 'test' }] },
    });

    expect(status).toBe(400);
    expect(body.error).toBe('Bad request');
    expect(body.message).toContain('Idempotency-Key');
  });

  it('returns 422 when content is missing', async () => {
    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'POST', `/conversations/${CONV_ID}/messages`, {
      headers: { ...authHeaders, 'Idempotency-Key': 'key-1' },
      body: {},
    });

    expect(status).toBe(422);
    expect(body.error).toBe('Validation error');
  });

  it('returns 422 when content is empty array', async () => {
    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'POST', `/conversations/${CONV_ID}/messages`, {
      headers: { ...authHeaders, 'Idempotency-Key': 'key-2' },
      body: { content: [] },
    });

    expect(status).toBe(422);
    expect(body.error).toBe('Validation error');
  });

  it('returns 422 for invalid content block type', async () => {
    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'POST', `/conversations/${CONV_ID}/messages`, {
      headers: { ...authHeaders, 'Idempotency-Key': 'key-3' },
      body: { content: [{ type: 'invalid_block', data: 'test' }] },
    });

    expect(status).toBe(422);
    expect(body.error).toBe('Validation error');
  });

  it('returns 404 when user is not a member', async () => {
    const { sendMessage } = await import('./conversation.service.js');
    vi.mocked(sendMessage).mockRejectedValueOnce(
      Object.assign(new Error('Conversation not found or access denied'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'POST', `/conversations/${CONV_ID}/messages`, {
      headers: { ...authHeaders, 'Idempotency-Key': 'key-4' },
      body: { content: [{ type: 'text', text: 'test' }] },
    });

    expect(status).toBe(404);
    expect(body.error).toBe('Not found');
  });

  it('returns 400 for invalid UUID format', async () => {
    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'POST', '/conversations/not-a-uuid/messages', {
      headers: { ...authHeaders, 'Idempotency-Key': 'key-5' },
      body: { content: [{ type: 'text', text: 'test' }] },
    });

    expect(status).toBe(400);
    expect(body.error).toBe('Invalid ID format');
  });

  it('returns 422 for invalid JSON body', async () => {
    const authHeaders = await getTokenHeader();
    const res = await app.fetch(
      new Request(`http://localhost/conversations/${CONV_ID}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': 'key-6',
          ...authHeaders,
        },
        body: 'not-json',
      }),
    );
    expect(res.status).toBe(422);
  });
});

/* -------------------------------------------------------------------------- */
/*  GET /conversations/:id/members                                            */
/* -------------------------------------------------------------------------- */

describe('GET /conversations/:id/members', () => {
  it('returns 200 with members list', async () => {
    const { listMembers } = await import('./conversation.service.js');
    vi.mocked(listMembers).mockResolvedValueOnce([
      {
        id: 'mem-1',
        conversation_id: CONV_ID,
        user_id: USER_ID,
        role: 'owner',
        muted: false,
        last_read_at: null,
        joined_at: '2026-01-01T00:00:00.000Z',
        user: {
          id: USER_ID,
          username: 'testuser',
          display_name: 'Test User',
          avatar_url: null,
        },
      },
    ] as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'GET', `/conversations/${CONV_ID}/members`, {
      headers: authHeaders,
    });

    expect(status).toBe(200);
    expect(body.members).toHaveLength(1);
    expect(body.members[0].role).toBe('owner');
    expect(body.members[0].user.username).toBe('testuser');
  });

  it('returns 404 when user is not a member', async () => {
    const { listMembers } = await import('./conversation.service.js');
    vi.mocked(listMembers).mockRejectedValueOnce(
      Object.assign(new Error('Conversation not found or access denied'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'GET', `/conversations/${CONV_ID}/members`, {
      headers: authHeaders,
    });

    expect(status).toBe(404);
    expect(body.error).toBe('Not found');
  });

  it('returns 400 for invalid UUID format', async () => {
    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'GET', '/conversations/not-a-uuid/members', {
      headers: authHeaders,
    });

    expect(status).toBe(400);
    expect(body.error).toBe('Invalid ID format');
  });
});

/* -------------------------------------------------------------------------- */
/*  POST /conversations/:id/members                                           */
/* -------------------------------------------------------------------------- */

describe('POST /conversations/:id/members', () => {
  it('returns 201 with added member', async () => {
    const { addMember } = await import('./conversation.service.js');
    vi.mocked(addMember).mockResolvedValueOnce({
      id: 'mem-2',
      conversation_id: CONV_ID,
      user_id: OTHER_USER_ID,
      role: 'member',
      muted: false,
      last_read_at: null,
      joined_at: '2026-01-01T00:00:00.000Z',
      user: {
        id: OTHER_USER_ID,
        username: 'otheruser',
        display_name: 'Other User',
        avatar_url: null,
      },
    } as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'POST', `/conversations/${CONV_ID}/members`, {
      headers: authHeaders,
      body: { user_id: OTHER_USER_ID },
    });

    expect(status).toBe(201);
    expect(body.member.user_id).toBe(OTHER_USER_ID);
    expect(body.member.role).toBe('member');
  });

  it('returns 201 with custom role', async () => {
    const { addMember } = await import('./conversation.service.js');
    vi.mocked(addMember).mockResolvedValueOnce({
      id: 'mem-3',
      conversation_id: CONV_ID,
      user_id: OTHER_USER_ID,
      role: 'admin',
      muted: false,
      last_read_at: null,
      joined_at: '2026-01-01T00:00:00.000Z',
    } as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'POST', `/conversations/${CONV_ID}/members`, {
      headers: authHeaders,
      body: { user_id: OTHER_USER_ID, role: 'admin' },
    });

    expect(status).toBe(201);
    expect(body.member.role).toBe('admin');
  });

  it('returns 422 when user_id is missing', async () => {
    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'POST', `/conversations/${CONV_ID}/members`, {
      headers: authHeaders,
      body: {},
    });

    expect(status).toBe(422);
    expect(body.error).toBe('Validation error');
  });

  it('returns 422 for invalid user_id (non-UUID)', async () => {
    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'POST', `/conversations/${CONV_ID}/members`, {
      headers: authHeaders,
      body: { user_id: 'not-a-uuid' },
    });

    expect(status).toBe(422);
    expect(body.error).toBe('Validation error');
  });

  it('returns 422 for invalid role value', async () => {
    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'POST', `/conversations/${CONV_ID}/members`, {
      headers: authHeaders,
      body: { user_id: OTHER_USER_ID, role: 'superadmin' },
    });

    expect(status).toBe(422);
    expect(body.error).toBe('Validation error');
  });

  it('returns 403 when non-admin tries to add member', async () => {
    const { addMember } = await import('./conversation.service.js');
    vi.mocked(addMember).mockRejectedValueOnce(
      Object.assign(new Error('Forbidden: must be owner or admin'), { code: 'FORBIDDEN' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'POST', `/conversations/${CONV_ID}/members`, {
      headers: authHeaders,
      body: { user_id: OTHER_USER_ID },
    });

    expect(status).toBe(403);
    expect(body.error).toBe('Forbidden');
  });

  it('returns 404 for non-existent conversation', async () => {
    const { addMember } = await import('./conversation.service.js');
    vi.mocked(addMember).mockRejectedValueOnce(
      Object.assign(new Error('Conversation not found or access denied'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'POST', `/conversations/${CONV_ID}/members`, {
      headers: authHeaders,
      body: { user_id: OTHER_USER_ID },
    });

    expect(status).toBe(404);
    expect(body.error).toBe('Not found');
  });

  it('returns 400 for invalid UUID format', async () => {
    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'POST', '/conversations/not-a-uuid/members', {
      headers: authHeaders,
      body: { user_id: OTHER_USER_ID },
    });

    expect(status).toBe(400);
    expect(body.error).toBe('Invalid ID format');
  });

  it('returns 422 for invalid JSON body', async () => {
    const authHeaders = await getTokenHeader();
    const res = await app.fetch(
      new Request(`http://localhost/conversations/${CONV_ID}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: 'not-json',
      }),
    );
    expect(res.status).toBe(422);
  });
});

/* -------------------------------------------------------------------------- */
/*  DELETE /conversations/:id/members/:userId                                 */
/* -------------------------------------------------------------------------- */

describe('DELETE /conversations/:id/members/:userId', () => {
  it('returns 200 with ok true on successful removal', async () => {
    const { removeMember } = await import('./conversation.service.js');
    vi.mocked(removeMember).mockResolvedValueOnce(undefined);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'DELETE',
      `/conversations/${CONV_ID}/members/${OTHER_USER_ID}`,
      { headers: authHeaders },
    );

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it('calls removeMember with correct arguments', async () => {
    const { removeMember } = await import('./conversation.service.js');
    vi.mocked(removeMember).mockResolvedValueOnce(undefined);

    const authHeaders = await getTokenHeader();
    await request(app, 'DELETE', `/conversations/${CONV_ID}/members/${OTHER_USER_ID}`, {
      headers: authHeaders,
    });

    expect(vi.mocked(removeMember)).toHaveBeenCalledWith(CONV_ID, USER_ID, OTHER_USER_ID);
  });

  it('returns 404 when member is not found', async () => {
    const { removeMember } = await import('./conversation.service.js');
    vi.mocked(removeMember).mockRejectedValueOnce(
      Object.assign(new Error('Member not found'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'DELETE',
      `/conversations/${CONV_ID}/members/${OTHER_USER_ID}`,
      { headers: authHeaders },
    );

    expect(status).toBe(404);
    expect(body.error).toBe('Not found');
  });

  it('returns 403 when non-admin tries to remove member', async () => {
    const { removeMember } = await import('./conversation.service.js');
    vi.mocked(removeMember).mockRejectedValueOnce(
      Object.assign(new Error('Forbidden: must be owner or admin'), { code: 'FORBIDDEN' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'DELETE',
      `/conversations/${CONV_ID}/members/${OTHER_USER_ID}`,
      { headers: authHeaders },
    );

    expect(status).toBe(403);
    expect(body.error).toBe('Forbidden');
  });

  it('returns 403 when trying to remove the owner', async () => {
    const { removeMember } = await import('./conversation.service.js');
    vi.mocked(removeMember).mockRejectedValueOnce(
      Object.assign(new Error('Cannot remove the owner'), { code: 'FORBIDDEN' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'DELETE',
      `/conversations/${CONV_ID}/members/${OTHER_USER_ID}`,
      { headers: authHeaders },
    );

    expect(status).toBe(403);
    expect(body.error).toBe('Forbidden');
  });

  it('returns 400 for invalid conversation UUID format', async () => {
    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'DELETE',
      `/conversations/not-a-uuid/members/${OTHER_USER_ID}`,
      { headers: authHeaders },
    );

    expect(status).toBe(400);
    expect(body.error).toBe('Invalid ID format');
  });

  it('returns 400 for invalid userId UUID format', async () => {
    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'DELETE',
      `/conversations/${CONV_ID}/members/not-a-uuid`,
      { headers: authHeaders },
    );

    expect(status).toBe(400);
    expect(body.error).toBe('Invalid ID format');
  });
});

/* -------------------------------------------------------------------------- */
/*  POST /conversations/:id/messages/:messageId/feedback                      */
/* -------------------------------------------------------------------------- */

describe('POST /conversations/:id/messages/:messageId/feedback', () => {
  it('returns 201 with positive feedback', async () => {
    const { sql } = await import('../../db/connection.js');
    // Mock: member check
    vi.mocked(sql).mockResolvedValueOnce([{ id: 'mem-1' }] as any);
    // Mock: conversation with agent_id
    vi.mocked(sql).mockResolvedValueOnce([{ agent_id: AGENT_ID }] as any);
    // Mock: message exists (agent message)
    vi.mocked(sql).mockResolvedValueOnce([{ id: MESSAGE_ID }] as any);

    const { submitMessageFeedback } = await import('../social/social.service.js');
    vi.mocked(submitMessageFeedback).mockResolvedValueOnce({
      id: 'fb-1',
      conversation_id: CONV_ID,
      message_id: MESSAGE_ID,
      user_id: USER_ID,
      agent_id: AGENT_ID,
      feedback: 'positive',
      reason: null,
      created_at: '2026-01-01T00:00:00.000Z',
    } as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'POST',
      `/conversations/${CONV_ID}/messages/${MESSAGE_ID}/feedback`,
      {
        headers: authHeaders,
        body: { feedback: 'positive' },
      },
    );

    expect(status).toBe(201);
    expect(body.feedback.feedback).toBe('positive');
  });

  it('returns 201 with negative feedback and reason', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([{ id: 'mem-1' }] as any);
    vi.mocked(sql).mockResolvedValueOnce([{ agent_id: AGENT_ID }] as any);
    vi.mocked(sql).mockResolvedValueOnce([{ id: MESSAGE_ID }] as any);

    const { submitMessageFeedback } = await import('../social/social.service.js');
    vi.mocked(submitMessageFeedback).mockResolvedValueOnce({
      id: 'fb-2',
      feedback: 'negative',
      reason: 'inaccurate',
    } as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'POST',
      `/conversations/${CONV_ID}/messages/${MESSAGE_ID}/feedback`,
      {
        headers: authHeaders,
        body: { feedback: 'negative', reason: 'inaccurate' },
      },
    );

    expect(status).toBe(201);
    expect(body.feedback.feedback).toBe('negative');
    expect(body.feedback.reason).toBe('inaccurate');
  });

  it('returns 422 when feedback field is missing', async () => {
    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'POST',
      `/conversations/${CONV_ID}/messages/${MESSAGE_ID}/feedback`,
      {
        headers: authHeaders,
        body: {},
      },
    );

    expect(status).toBe(422);
    expect(body.error).toBe('Validation error');
  });

  it('returns 422 for invalid feedback value', async () => {
    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'POST',
      `/conversations/${CONV_ID}/messages/${MESSAGE_ID}/feedback`,
      {
        headers: authHeaders,
        body: { feedback: 'neutral' },
      },
    );

    expect(status).toBe(422);
    expect(body.error).toBe('Validation error');
  });

  it('returns 422 for reason exceeding 30 chars', async () => {
    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'POST',
      `/conversations/${CONV_ID}/messages/${MESSAGE_ID}/feedback`,
      {
        headers: authHeaders,
        body: { feedback: 'positive', reason: 'a'.repeat(31) },
      },
    );

    expect(status).toBe(422);
    expect(body.error).toBe('Validation error');
  });

  it('returns 404 when user is not a member', async () => {
    const { sql } = await import('../../db/connection.js');
    // Member check returns empty
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'POST',
      `/conversations/${CONV_ID}/messages/${MESSAGE_ID}/feedback`,
      {
        headers: authHeaders,
        body: { feedback: 'positive' },
      },
    );

    expect(status).toBe(404);
    expect(body.error).toBe('Not found');
  });

  it('returns 404 when conversation has no agent', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([{ id: 'mem-1' }] as any);
    // No agent conversation
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'POST',
      `/conversations/${CONV_ID}/messages/${MESSAGE_ID}/feedback`,
      {
        headers: authHeaders,
        body: { feedback: 'positive' },
      },
    );

    expect(status).toBe(404);
    expect(body.message).toContain('Agent conversation not found');
  });

  it('returns 404 when message is not found in conversation', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([{ id: 'mem-1' }] as any);
    vi.mocked(sql).mockResolvedValueOnce([{ agent_id: AGENT_ID }] as any);
    // Message not found
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'POST',
      `/conversations/${CONV_ID}/messages/${MESSAGE_ID}/feedback`,
      {
        headers: authHeaders,
        body: { feedback: 'positive' },
      },
    );

    expect(status).toBe(404);
    expect(body.message).toContain('Agent message not found');
  });

  it('returns 400 for invalid conversation UUID format', async () => {
    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'POST',
      `/conversations/not-a-uuid/messages/${MESSAGE_ID}/feedback`,
      {
        headers: authHeaders,
        body: { feedback: 'positive' },
      },
    );

    expect(status).toBe(400);
    expect(body.error).toBe('Invalid ID format');
  });

  it('returns 400 for invalid messageId UUID format', async () => {
    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'POST',
      `/conversations/${CONV_ID}/messages/not-a-uuid/feedback`,
      {
        headers: authHeaders,
        body: { feedback: 'positive' },
      },
    );

    expect(status).toBe(400);
    expect(body.error).toBe('Invalid ID format');
  });
});

/* -------------------------------------------------------------------------- */
/*  GET /conversations/:id/should-prompt-feedback                             */
/* -------------------------------------------------------------------------- */

describe('GET /conversations/:id/should-prompt-feedback', () => {
  it('returns 200 with should_prompt true', async () => {
    const { sql } = await import('../../db/connection.js');
    // Member check
    vi.mocked(sql).mockResolvedValueOnce([{ id: 'mem-1' }] as any);

    const { shouldPromptFeedback } = await import('../social/social.service.js');
    vi.mocked(shouldPromptFeedback).mockResolvedValueOnce(true);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'GET',
      `/conversations/${CONV_ID}/should-prompt-feedback`,
      { headers: authHeaders },
    );

    expect(status).toBe(200);
    expect(body.should_prompt).toBe(true);
  });

  it('returns 200 with should_prompt false', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([{ id: 'mem-1' }] as any);

    const { shouldPromptFeedback } = await import('../social/social.service.js');
    vi.mocked(shouldPromptFeedback).mockResolvedValueOnce(false);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'GET',
      `/conversations/${CONV_ID}/should-prompt-feedback`,
      { headers: authHeaders },
    );

    expect(status).toBe(200);
    expect(body.should_prompt).toBe(false);
  });

  it('returns 404 when user is not a member', async () => {
    const { sql } = await import('../../db/connection.js');
    // Member check returns empty
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'GET',
      `/conversations/${CONV_ID}/should-prompt-feedback`,
      { headers: authHeaders },
    );

    expect(status).toBe(404);
    expect(body.error).toBe('Not found');
  });

  it('returns 400 for invalid UUID format', async () => {
    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'GET',
      '/conversations/not-a-uuid/should-prompt-feedback',
      { headers: authHeaders },
    );

    expect(status).toBe(400);
    expect(body.error).toBe('Invalid ID format');
  });
});
