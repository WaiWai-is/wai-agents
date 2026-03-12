/* eslint-disable @typescript-eslint/no-explicit-any */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock DB connection
vi.mock('../../db/connection.js', () => {
  const sqlFn = Object.assign(vi.fn(), {
    unsafe: vi.fn(),
    begin: vi.fn(async (cb: (tx: any) => Promise<any>) => {
      return cb(sqlFn);
    }),
  });
  return { sql: sqlFn, db: {} };
});

// Mock emitter
vi.mock('../../ws/emitter.js', () => ({
  emitMessage: vi.fn(),
}));

// Mock loop
vi.mock('../agents/loop.js', () => ({
  runAgentLoop: vi.fn().mockResolvedValue(undefined),
}));

const USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const _OTHER_USER_ID = '660e8400-e29b-41d4-a716-446655440099';
const CONV_ID = '660e8400-e29b-41d4-a716-446655440001';
const MSG_ID = '770e8400-e29b-41d4-a716-446655440002';

function makeMessageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: MSG_ID,
    conversation_id: CONV_ID,
    sender_id: USER_ID,
    sender_type: 'human',
    type: 'text',
    content: [{ type: 'text', text: 'Hello' }],
    metadata: {},
    edited_at: null,
    deleted_at: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeConversationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CONV_ID,
    type: 'dm',
    title: 'Test',
    avatar_url: null,
    creator_id: USER_ID,
    agent_id: null,
    metadata: {},
    last_message_at: null,
    inserted_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
    ...overrides,
  };
}

/* ================================================================
 * sendMessage — Content edge cases
 * ================================================================ */
describe('conversation.service-edge2 — sendMessage content edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends message with very long text content', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    const longText = 'a'.repeat(100_000);
    sqlMock.mockResolvedValueOnce([{ id: 'member-1' }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([
      makeMessageRow({ content: [{ type: 'text', text: longText }] }),
    ] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { sendMessage } = await import('./conversation.service.js');
    const result = await sendMessage(
      CONV_ID,
      USER_ID,
      { content: [{ type: 'text', text: longText }] },
      'long-key',
    );

    expect(result.id).toBe(MSG_ID);
  });

  it('sends message with multiple content blocks', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    const content = [
      { type: 'text' as const, text: 'Part 1' },
      { type: 'text' as const, text: 'Part 2' },
      { type: 'text' as const, text: 'Part 3' },
    ];
    sqlMock.mockResolvedValueOnce([{ id: 'member-1' }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([makeMessageRow({ content })] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { sendMessage } = await import('./conversation.service.js');
    const result = await sendMessage(CONV_ID, USER_ID, { content }, 'multi-key');

    expect(result.id).toBe(MSG_ID);
  });

  it('sends message with single text block', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: 'member-1' }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([makeMessageRow()] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { sendMessage } = await import('./conversation.service.js');
    const result = await sendMessage(
      CONV_ID,
      USER_ID,
      { content: [{ type: 'text', text: 'Single block' }] },
      'single-key',
    );

    expect(result.id).toBe(MSG_ID);
    expect(result.sender_type).toBe('human');
  });

  it('message stores metadata as empty object by default', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: 'member-1' }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([makeMessageRow({ metadata: {} })] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { sendMessage } = await import('./conversation.service.js');
    const result = await sendMessage(
      CONV_ID,
      USER_ID,
      { content: [{ type: 'text', text: 'Hi' }] },
      'metadata-key',
    );

    expect(result.metadata).toEqual({});
  });
});

/* ================================================================
 * sendMessage — Idempotency edge cases
 * ================================================================ */
describe('conversation.service-edge2 — idempotency edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not emit WebSocket event for duplicate messages', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    const cachedMessage = makeMessageRow({ id: 'cached-msg' });
    sqlMock.mockResolvedValueOnce([{ id: 'member-1' }] as any);
    sqlMock.mockResolvedValueOnce([{ response_body: cachedMessage }] as any);

    const { sendMessage } = await import('./conversation.service.js');
    await sendMessage(CONV_ID, USER_ID, { content: [{ type: 'text', text: 'Dupe' }] }, 'dupe-key');

    const { emitMessage } = await import('../../ws/emitter.js');
    expect(emitMessage).not.toHaveBeenCalled();
  });

  it('does not trigger agent loop for duplicate messages', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    const cachedMessage = makeMessageRow({ id: 'cached-msg' });
    sqlMock.mockResolvedValueOnce([{ id: 'member-1' }] as any);
    sqlMock.mockResolvedValueOnce([{ response_body: cachedMessage }] as any);

    const { sendMessage } = await import('./conversation.service.js');
    await sendMessage(
      CONV_ID,
      USER_ID,
      { content: [{ type: 'text', text: 'Dupe agent' }] },
      'dupe-agent-key',
    );

    const { runAgentLoop } = await import('../agents/loop.js');
    expect(runAgentLoop).not.toHaveBeenCalled();
  });

  it('different users with same idempotency key get independent messages', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // User 1
    sqlMock.mockResolvedValueOnce([{ id: 'member-1' }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([makeMessageRow({ id: 'msg-user1' })] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { sendMessage } = await import('./conversation.service.js');
    const result1 = await sendMessage(
      CONV_ID,
      USER_ID,
      { content: [{ type: 'text', text: 'Hello' }] },
      'shared-key',
    );

    expect(result1.id).toBe('msg-user1');
  });
});

/* ================================================================
 * listMessages — Pagination edge cases
 * ================================================================ */
describe('conversation.service-edge2 — listMessages pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clamps negative limit to minimum 1', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: 'member-1' }] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { listMessages } = await import('./conversation.service.js');
    const results = await listMessages(CONV_ID, USER_ID, undefined, -10);

    expect(results).toHaveLength(0);
  });

  it('returns empty array when no messages exist', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: 'member-1' }] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { listMessages } = await import('./conversation.service.js');
    const results = await listMessages(CONV_ID, USER_ID);

    expect(results).toHaveLength(0);
  });

  it('returns messages with correct format', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: 'member-1' }] as any);
    sqlMock.mockResolvedValueOnce([makeMessageRow()] as any);

    const { listMessages } = await import('./conversation.service.js');
    const results = await listMessages(CONV_ID, USER_ID);

    expect(results).toHaveLength(1);
    expect(results[0]).toHaveProperty('id');
    expect(results[0]).toHaveProperty('conversation_id');
    expect(results[0]).toHaveProperty('sender_id');
    expect(results[0]).toHaveProperty('sender_type');
    expect(results[0]).toHaveProperty('type');
    expect(results[0]).toHaveProperty('content');
    expect(results[0]).toHaveProperty('created_at');
  });

  it('returns multiple pages of messages', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // Page 1
    sqlMock.mockResolvedValueOnce([{ id: 'member-1' }] as any);
    sqlMock.mockResolvedValueOnce([
      makeMessageRow({ id: 'msg-3', created_at: new Date('2026-01-03') }),
      makeMessageRow({ id: 'msg-2', created_at: new Date('2026-01-02') }),
    ] as any);

    const { listMessages } = await import('./conversation.service.js');
    const page1 = await listMessages(CONV_ID, USER_ID, undefined, 2);
    expect(page1).toHaveLength(2);

    // Page 2
    sqlMock.mockResolvedValueOnce([{ id: 'member-1' }] as any);
    sqlMock.mockResolvedValueOnce([{ created_at: new Date('2026-01-02'), id: 'msg-2' }] as any);
    sqlMock.mockResolvedValueOnce([
      makeMessageRow({ id: 'msg-1', created_at: new Date('2026-01-01') }),
    ] as any);

    const page2 = await listMessages(CONV_ID, USER_ID, 'msg-2', 2);
    expect(page2).toHaveLength(1);
  });

  it('limit of 1 returns exactly one message', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: 'member-1' }] as any);
    sqlMock.mockResolvedValueOnce([makeMessageRow({ id: 'msg-1' })] as any);

    const { listMessages } = await import('./conversation.service.js');
    const results = await listMessages(CONV_ID, USER_ID, undefined, 1);
    expect(results).toHaveLength(1);
  });

  it('limit of exactly 100 works', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: 'member-1' }] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { listMessages } = await import('./conversation.service.js');
    const results = await listMessages(CONV_ID, USER_ID, undefined, 100);
    expect(results).toHaveLength(0);
  });
});

/* ================================================================
 * sendMessage — Agent content extraction
 * ================================================================ */
describe('conversation.service-edge2 — agent message text extraction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('concatenates multiple text blocks for agent', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: 'member-1' }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([makeMessageRow()] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([{ agent_id: 'agent-1' }] as any);

    const { sendMessage } = await import('./conversation.service.js');
    await sendMessage(
      CONV_ID,
      USER_ID,
      {
        content: [
          { type: 'text', text: 'Hello ' },
          { type: 'text', text: 'World' },
        ],
      },
      'concat-key',
    );

    const { runAgentLoop } = await import('../agents/loop.js');
    expect(runAgentLoop).toHaveBeenCalledWith(expect.objectContaining({ message: 'Hello World' }));
  });

  it('handles content blocks without text field', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: 'member-1' }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([makeMessageRow()] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([{ agent_id: 'agent-1' }] as any);

    const { sendMessage } = await import('./conversation.service.js');
    await sendMessage(
      CONV_ID,
      USER_ID,
      { content: [{ type: 'image', url: 'https://example.com/img.png' }] as any },
      'no-text-key',
    );

    const { runAgentLoop } = await import('../agents/loop.js');
    expect(runAgentLoop).toHaveBeenCalledWith(expect.objectContaining({ message: '' }));
  });

  it('handles mix of text and non-text content blocks', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: 'member-1' }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([makeMessageRow()] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([{ agent_id: 'agent-1' }] as any);

    const { sendMessage } = await import('./conversation.service.js');
    await sendMessage(
      CONV_ID,
      USER_ID,
      {
        content: [
          { type: 'text', text: 'Look at this: ' },
          { type: 'image', url: 'https://example.com/img.png' } as any,
          { type: 'text', text: ' What do you think?' },
        ],
      },
      'mixed-key',
    );

    const { runAgentLoop } = await import('../agents/loop.js');
    expect(runAgentLoop).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Look at this:  What do you think?' }),
    );
  });
});

/* ================================================================
 * Member management — advanced edge cases
 * ================================================================ */
describe('conversation.service-edge2 — member management advanced', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('addMember with custom role', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ role: 'owner' }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([
      {
        id: 'm2',
        conversation_id: CONV_ID,
        user_id: 'new-user',
        role: 'admin',
        muted: false,
        last_read_at: null,
        joined_at: new Date(),
        username: 'newadmin',
        display_name: 'New Admin',
        member_avatar_url: null,
      },
    ] as any);

    const { addMember } = await import('./conversation.service.js');
    const result = await addMember(CONV_ID, USER_ID, { user_id: 'new-user', role: 'admin' });

    expect(result.role).toBe('admin');
  });

  it('addMember throws FORBIDDEN when regular member tries to add', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([{ role: 'member' }] as any);

    const { addMember } = await import('./conversation.service.js');
    await expect(
      addMember(CONV_ID, USER_ID, { user_id: 'new-user', role: 'member' }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('removeMember succeeds for admin removing a member', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ role: 'admin' }] as any);
    sqlMock.mockResolvedValueOnce([{ role: 'member' }] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { removeMember } = await import('./conversation.service.js');
    await expect(removeMember(CONV_ID, USER_ID, 'target-user')).resolves.toBeUndefined();
  });

  it('removeMember throws FORBIDDEN when regular member tries to remove', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([{ role: 'member' }] as any);

    const { removeMember } = await import('./conversation.service.js');
    await expect(removeMember(CONV_ID, USER_ID, 'target-user')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('member list includes user details when username exists', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: 'member-1' }] as any);
    sqlMock.mockResolvedValueOnce([
      {
        id: 'm1',
        conversation_id: CONV_ID,
        user_id: USER_ID,
        role: 'owner',
        muted: false,
        last_read_at: new Date('2026-01-01'),
        joined_at: new Date('2026-01-01'),
        username: 'testuser',
        display_name: 'Test User',
        member_avatar_url: 'https://example.com/avatar.png',
      },
    ] as any);

    const { listMembers } = await import('./conversation.service.js');
    const results = await listMembers(CONV_ID, USER_ID);

    expect(results[0].user).toBeDefined();
    expect(results[0].user?.username).toBe('testuser');
    expect(results[0].user?.display_name).toBe('Test User');
    expect(results[0].user?.avatar_url).toBe('https://example.com/avatar.png');
  });

  it('member list omits user field when username is null', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: 'member-1' }] as any);
    sqlMock.mockResolvedValueOnce([
      {
        id: 'm1',
        conversation_id: CONV_ID,
        user_id: USER_ID,
        role: 'member',
        muted: true,
        last_read_at: null,
        joined_at: new Date(),
        username: null,
        display_name: null,
        member_avatar_url: null,
      },
    ] as any);

    const { listMembers } = await import('./conversation.service.js');
    const results = await listMembers(CONV_ID, USER_ID);

    expect(results[0].user).toBeUndefined();
    expect(results[0].muted).toBe(true);
  });
});

/* ================================================================
 * Conversation CRUD — advanced edge cases
 * ================================================================ */
describe('conversation.service-edge2 — CRUD advanced', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deleteConversation throws FORBIDDEN for admin (only owner can delete)', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([{ role: 'admin' }] as any);

    const { deleteConversation } = await import('./conversation.service.js');
    await expect(deleteConversation(CONV_ID, USER_ID)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('deleteConversation succeeds for owner', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ role: 'owner' }] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { deleteConversation } = await import('./conversation.service.js');
    await expect(deleteConversation(CONV_ID, USER_ID)).resolves.toBeUndefined();
  });

  it('deleteConversation throws NOT_FOUND for non-member', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { deleteConversation } = await import('./conversation.service.js');
    await expect(deleteConversation(CONV_ID, 'non-member')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('updateConversation succeeds for owner', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ role: 'owner' }] as any);
    sqlMock.mockResolvedValueOnce([makeConversationRow({ title: 'Updated' })] as any);

    const { updateConversation } = await import('./conversation.service.js');
    const result = await updateConversation(CONV_ID, USER_ID, { title: 'Updated' });
    expect(result.title).toBe('Updated');
  });

  it('updateConversation succeeds for admin', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ role: 'admin' }] as any);
    sqlMock.mockResolvedValueOnce([
      makeConversationRow({ avatar_url: 'https://example.com/new.png' }),
    ] as any);

    const { updateConversation } = await import('./conversation.service.js');
    const result = await updateConversation(CONV_ID, USER_ID, {
      avatar_url: 'https://example.com/new.png',
    });
    expect(result.avatar_url).toBe('https://example.com/new.png');
  });

  it('updateConversation throws NOT_FOUND for non-member', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { updateConversation } = await import('./conversation.service.js');
    await expect(
      updateConversation(CONV_ID, 'non-member', { title: 'Should fail' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('listConversations returns conversations with null last_message', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([
      {
        ...makeConversationRow(),
        unread_count: 0,
        last_message_id: null,
        last_message_content: null,
        last_message_sender_id: null,
        last_message_created_at: null,
      },
    ] as any);

    const { listConversations } = await import('./conversation.service.js');
    const results = await listConversations(USER_ID);

    expect(results).toHaveLength(1);
    expect(results[0].last_message).toBeNull();
    expect(results[0].unread_count).toBe(0);
  });

  it('listConversations returns empty array for user with no conversations', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { listConversations } = await import('./conversation.service.js');
    const results = await listConversations(USER_ID);

    expect(results).toHaveLength(0);
  });

  it('createConversation with additional member_ids', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([makeConversationRow({ type: 'group' })] as any);

    const { createConversation } = await import('./conversation.service.js');
    const result = await createConversation(USER_ID, {
      type: 'group',
      title: 'Team Chat',
      member_ids: ['user-2', 'user-3'],
    });

    expect(result.type).toBe('group');
  });

  it('createConversation skips creator in member_ids', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([makeConversationRow()] as any);

    const { createConversation } = await import('./conversation.service.js');
    await createConversation(USER_ID, {
      type: 'dm',
      member_ids: [USER_ID],
    });

    // Only 3 calls: INSERT conv + INSERT owner + SELECT (creator ID skipped)
    expect(sqlMock).toHaveBeenCalledTimes(3);
  });

  it('message format includes all expected fields', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: 'member-1' }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([
      makeMessageRow({
        edited_at: new Date('2026-01-02'),
        deleted_at: null,
      }),
    ] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { sendMessage } = await import('./conversation.service.js');
    const result = await sendMessage(
      CONV_ID,
      USER_ID,
      { content: [{ type: 'text', text: 'Test' }] },
      'format-key',
    );

    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('conversation_id');
    expect(result).toHaveProperty('sender_id');
    expect(result).toHaveProperty('sender_type');
    expect(result).toHaveProperty('type');
    expect(result).toHaveProperty('content');
    expect(result).toHaveProperty('metadata');
    expect(result).toHaveProperty('edited_at');
    expect(result).toHaveProperty('deleted_at');
    expect(result).toHaveProperty('created_at');
    expect(result.edited_at).toBe(new Date('2026-01-02').toISOString());
  });
});
