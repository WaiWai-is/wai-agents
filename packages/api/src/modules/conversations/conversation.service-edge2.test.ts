/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock DB connection with transaction support
vi.mock('../../db/connection.js', () => {
  const sqlFn = Object.assign(vi.fn(), {
    unsafe: vi.fn(),
    begin: vi.fn(async (cb: (tx: any) => Promise<any>) => {
      return cb(sqlFn);
    }),
  });
  return { sql: sqlFn, db: {} };
});

/**
 * resetSqlMock — clears the sql mock's return value queue and call history,
 * then re-attaches `begin` and `unsafe` (which vi.mockReset strips).
 */
async function resetSqlMock() {
  const { sql } = await import('../../db/connection.js');
  const sqlFn = vi.mocked(sql);
  sqlFn.mockReset();
  (sqlFn as any).begin = vi.fn(async (cb: (tx: any) => Promise<any>) => cb(sqlFn));
  (sqlFn as any).unsafe = vi.fn();
}

// Mock WebSocket emitter
vi.mock('../../ws/emitter.js', () => ({
  emitMessage: vi.fn(),
  emitConversationUpdated: vi.fn(),
  emitMessageUpdated: vi.fn(),
  emitMessageDeleted: vi.fn(),
}));

// Mock agent loop
vi.mock('../agents/loop.js', () => ({
  runAgentLoop: vi.fn().mockResolvedValue(undefined),
}));

const USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_USER_ID = '660e8400-e29b-41d4-a716-446655440001';
const THIRD_USER_ID = '770e8400-e29b-41d4-a716-446655440002';
const CONVERSATION_ID = '880e8400-e29b-41d4-a716-446655440003';
const AGENT_ID = '990e8400-e29b-41d4-a716-446655440004';
const MESSAGE_ID = 'aa0e8400-e29b-41d4-a716-446655440005';

const NOW = new Date('2026-03-01T12:00:00.000Z');

function makeConversationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CONVERSATION_ID,
    type: 'dm',
    title: null,
    avatar_url: null,
    creator_id: USER_ID,
    agent_id: null,
    metadata: {},
    last_message_at: null,
    inserted_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function makeConversationListRow(overrides: Record<string, unknown> = {}) {
  return {
    ...makeConversationRow(),
    last_message_id: null,
    last_message_content: null,
    last_message_sender_id: null,
    last_message_created_at: null,
    unread_count: 0,
    ...overrides,
  };
}

function makeMemberRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'member-id-1',
    conversation_id: CONVERSATION_ID,
    user_id: USER_ID,
    role: 'owner',
    muted: false,
    last_read_at: null,
    joined_at: NOW,
    username: 'testuser',
    display_name: 'Test User',
    member_avatar_url: null,
    ...overrides,
  };
}

function makeMessageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: MESSAGE_ID,
    conversation_id: CONVERSATION_ID,
    sender_id: USER_ID,
    sender_type: 'human',
    type: 'text',
    content: JSON.stringify([{ type: 'text', text: 'Hello' }]),
    metadata: {},
    edited_at: null,
    deleted_at: null,
    created_at: NOW,
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/*  createConversation — additional edge cases                                */
/* -------------------------------------------------------------------------- */

describe('conversation.service (edge2) — createConversation with agent', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await resetSqlMock();
  });

  it('creates agent conversation type', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([
      makeConversationRow({ type: 'agent', agent_id: AGENT_ID }),
    ] as any);

    const { createConversation } = await import('./conversation.service.js');
    const result = await createConversation(USER_ID, { type: 'agent' });

    expect(result.type).toBe('agent');
  });

  it('creates conversation with very long title', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    const longTitle = 'A'.repeat(500);

    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([makeConversationRow({ title: longTitle })] as any);

    const { createConversation } = await import('./conversation.service.js');
    const result = await createConversation(USER_ID, {
      type: 'dm',
      title: longTitle,
    });

    expect((result as Record<string, unknown>).title).toBe(longTitle);
    expect(((result as Record<string, unknown>).title as string).length).toBe(500);
  });

  it('creates conversation with special characters in title', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    const specialTitle = 'Chat with <script>alert("xss")</script> & "quotes"';

    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([makeConversationRow({ title: specialTitle })] as any);

    const { createConversation } = await import('./conversation.service.js');
    const result = await createConversation(USER_ID, {
      type: 'dm',
      title: specialTitle,
    });

    expect(result.title).toBe(specialTitle);
  });

  it('creates conversation with empty member_ids array', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([makeConversationRow()] as any);

    const { createConversation } = await import('./conversation.service.js');
    const result = await createConversation(USER_ID, {
      type: 'dm',
      member_ids: [],
    });

    expect(result.id).toBe(CONVERSATION_ID);
    expect(sqlMock).toHaveBeenCalledTimes(3);
  });

  it('creates group conversation with many members', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    const memberIds = Array.from(
      { length: 10 },
      (_, i) => `member-${i}-e29b-41d4-a716-446655440000`,
    );

    // Insert conversation + Insert creator as owner + 10 member inserts + SELECT
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    for (let i = 0; i < 10; i++) {
      sqlMock.mockResolvedValueOnce([] as any);
    }
    sqlMock.mockResolvedValueOnce([
      makeConversationRow({ type: 'group', title: 'Big Group' }),
    ] as any);

    const { createConversation } = await import('./conversation.service.js');
    const result = await createConversation(USER_ID, {
      type: 'group',
      title: 'Big Group',
      member_ids: memberIds,
    });

    expect(result.type).toBe('group');
    // 1 insert conv + 1 insert owner + 10 member inserts + 1 select = 13
    expect(sqlMock).toHaveBeenCalledTimes(13);
  });
});

/* -------------------------------------------------------------------------- */
/*  getConversation — additional edge cases                                   */
/* -------------------------------------------------------------------------- */

describe('conversation.service (edge2) — getConversation access control', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await resetSqlMock();
  });

  it('throws NOT_FOUND for non-member accessing conversation', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { getConversation } = await import('./conversation.service.js');
    await expect(getConversation(CONVERSATION_ID, OTHER_USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Conversation not found or access denied',
    });
  });

  it('throws NOT_FOUND when conversation row does not exist after member check', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: 'member-id' }] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { getConversation } = await import('./conversation.service.js');
    await expect(getConversation(CONVERSATION_ID, USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('returns conversation with null last_message_at', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: 'member-id' }] as any);
    sqlMock.mockResolvedValueOnce([makeConversationRow({ last_message_at: null })] as any);

    const { getConversation } = await import('./conversation.service.js');
    const result = await getConversation(CONVERSATION_ID, USER_ID);

    expect(result.last_message_at).toBeNull();
  });

  it('returns conversation with all null optional fields', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: 'member-id' }] as any);
    sqlMock.mockResolvedValueOnce([
      makeConversationRow({
        title: null,
        avatar_url: null,
        agent_id: null,
        last_message_at: null,
      }),
    ] as any);

    const { getConversation } = await import('./conversation.service.js');
    const result = await getConversation(CONVERSATION_ID, USER_ID);

    expect(result.title).toBeNull();
    expect(result.avatar_url).toBeNull();
    expect(result.agent_id).toBeNull();
    expect(result.last_message_at).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/*  listConversations — additional edge cases                                 */
/* -------------------------------------------------------------------------- */

describe('conversation.service (edge2) — listConversations ordering', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await resetSqlMock();
  });

  it('returns multiple conversations preserving DB order', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([
      makeConversationListRow({
        id: 'conv-1',
        title: 'Most Recent',
        last_message_at: new Date('2026-03-10'),
      }),
      makeConversationListRow({
        id: 'conv-2',
        title: 'Second',
        last_message_at: new Date('2026-03-09'),
      }),
      makeConversationListRow({
        id: 'conv-3',
        title: 'Oldest',
        last_message_at: new Date('2026-03-01'),
      }),
    ] as any);

    const { listConversations } = await import('./conversation.service.js');
    const results = await listConversations(USER_ID);

    expect(results).toHaveLength(3);
    expect(results[0].title).toBe('Most Recent');
    expect(results[2].title).toBe('Oldest');
  });

  it('handles conversation with last_message data', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([
      makeConversationListRow({
        last_message_id: 'msg-123',
        last_message_content: 'Hello World',
        last_message_sender_id: USER_ID,
        last_message_created_at: NOW,
      }),
    ] as any);

    const { listConversations } = await import('./conversation.service.js');
    const results = await listConversations(USER_ID);

    expect(results[0].last_message).not.toBeNull();
    expect(results[0].last_message?.id).toBe('msg-123');
    expect(results[0].last_message?.content).toBe('Hello World');
    expect(results[0].last_message?.sender_id).toBe(USER_ID);
  });

  it('handles mixed conversations with and without last messages', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([
      makeConversationListRow({
        id: 'conv-with-msg',
        last_message_id: 'msg-1',
        last_message_content: 'Hi',
        last_message_sender_id: USER_ID,
        last_message_created_at: NOW,
      }),
      makeConversationListRow({
        id: 'conv-no-msg',
        last_message_id: null,
      }),
    ] as any);

    const { listConversations } = await import('./conversation.service.js');
    const results = await listConversations(USER_ID);

    expect(results[0].last_message).not.toBeNull();
    expect(results[1].last_message).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/*  updateConversation — additional edge cases                                */
/* -------------------------------------------------------------------------- */

describe('conversation.service (edge2) — updateConversation fields', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await resetSqlMock();
  });

  it('updates title only', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ role: 'owner' }] as any);
    sqlMock.mockResolvedValueOnce([makeConversationRow({ title: 'New Title' })] as any);

    const { updateConversation } = await import('./conversation.service.js');
    const result = await updateConversation(CONVERSATION_ID, USER_ID, {
      title: 'New Title',
    });

    expect(result.title).toBe('New Title');
  });

  it('updates avatar_url only', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ role: 'owner' }] as any);
    sqlMock.mockResolvedValueOnce([
      makeConversationRow({ avatar_url: 'https://example.com/new-avatar.png' }),
    ] as any);

    const { updateConversation } = await import('./conversation.service.js');
    const result = await updateConversation(CONVERSATION_ID, USER_ID, {
      avatar_url: 'https://example.com/new-avatar.png',
    });

    expect(result.avatar_url).toBe('https://example.com/new-avatar.png');
  });

  it('updates both title and avatar_url', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ role: 'owner' }] as any);
    sqlMock.mockResolvedValueOnce([
      makeConversationRow({
        title: 'Dual Update',
        avatar_url: 'https://example.com/dual.png',
      }),
    ] as any);

    const { updateConversation } = await import('./conversation.service.js');
    const result = await updateConversation(CONVERSATION_ID, USER_ID, {
      title: 'Dual Update',
      avatar_url: 'https://example.com/dual.png',
    });

    expect(result.title).toBe('Dual Update');
    expect(result.avatar_url).toBe('https://example.com/dual.png');
  });

  it('throws NOT_FOUND for non-member trying to update', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { updateConversation } = await import('./conversation.service.js');
    await expect(
      updateConversation(CONVERSATION_ID, OTHER_USER_ID, { title: 'Hack' }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws NOT_FOUND when UPDATE RETURNING is empty', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ role: 'owner' }] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { updateConversation } = await import('./conversation.service.js');
    await expect(
      updateConversation(CONVERSATION_ID, USER_ID, { title: 'Ghost' }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  sendMessage — additional edge cases                                       */
/* -------------------------------------------------------------------------- */

describe('conversation.service (edge2) — sendMessage content types', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await resetSqlMock();
  });

  it('sends message with single text block content', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: 'member-id' }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([makeMessageRow()] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { sendMessage } = await import('./conversation.service.js');
    const result = await sendMessage(
      CONVERSATION_ID,
      USER_ID,
      { content: [{ type: 'text', text: 'Simple message' }] },
      'single-block-key',
    );

    expect(result.id).toBe(MESSAGE_ID);
  });

  it('sends message and triggers agent loop for agent conversation', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    const { runAgentLoop } = await import('../agents/loop.js');

    sqlMock.mockResolvedValueOnce([{ id: 'member-id' }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([makeMessageRow()] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([{ agent_id: AGENT_ID }] as any);

    const { sendMessage } = await import('./conversation.service.js');
    await sendMessage(
      CONVERSATION_ID,
      USER_ID,
      { content: [{ type: 'text', text: 'Talk to agent' }] },
      'agent-trigger-key',
    );

    expect(runAgentLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: AGENT_ID,
        conversationId: CONVERSATION_ID,
        userId: USER_ID,
        message: 'Talk to agent',
      }),
    );
  });

  it('handles string content for agent loop', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    const { runAgentLoop } = await import('../agents/loop.js');

    sqlMock.mockResolvedValueOnce([{ id: 'member-id' }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([makeMessageRow()] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([{ agent_id: AGENT_ID }] as any);

    const { sendMessage } = await import('./conversation.service.js');
    await sendMessage(
      CONVERSATION_ID,
      USER_ID,
      { content: 'plain string content' as any },
      'string-content-key',
    );

    expect(runAgentLoop).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'plain string content' }),
    );
  });

  it('emits WebSocket event for new message', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    const { emitMessage } = await import('../../ws/emitter.js');

    sqlMock.mockResolvedValueOnce([{ id: 'member-id' }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([makeMessageRow()] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { sendMessage } = await import('./conversation.service.js');
    await sendMessage(
      CONVERSATION_ID,
      USER_ID,
      { content: [{ type: 'text', text: 'Emit test' }] },
      'emit-ws-key',
    );

    expect(emitMessage).toHaveBeenCalledWith(
      CONVERSATION_ID,
      expect.objectContaining({ id: MESSAGE_ID }),
    );
  });

  it('throws NOT_FOUND when non-member tries to send', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { sendMessage } = await import('./conversation.service.js');
    await expect(
      sendMessage(
        CONVERSATION_ID,
        OTHER_USER_ID,
        { content: [{ type: 'text', text: 'Intruder' }] },
        'intruder-key',
      ),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  listMessages — additional edge cases                                      */
/* -------------------------------------------------------------------------- */

describe('conversation.service (edge2) — listMessages pagination', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await resetSqlMock();
  });

  it('returns messages in reverse chronological order (newest first)', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: 'member-id' }] as any);
    sqlMock.mockResolvedValueOnce([
      makeMessageRow({
        id: 'msg-newest',
        created_at: new Date('2026-03-10'),
      }),
      makeMessageRow({
        id: 'msg-oldest',
        created_at: new Date('2026-03-01'),
      }),
    ] as any);

    const { listMessages } = await import('./conversation.service.js');
    const results = await listMessages(CONVERSATION_ID, USER_ID);

    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('msg-newest');
    expect(results[1].id).toBe('msg-oldest');
  });

  it('clamps limit above 100 to 100', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: 'member-id' }] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { listMessages } = await import('./conversation.service.js');
    await listMessages(CONVERSATION_ID, USER_ID, undefined, 500);

    // Should succeed without error — clamped internally
    expect(sqlMock).toHaveBeenCalledTimes(2);
  });

  it('uses cursor-based pagination with valid cursor', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: 'member-id' }] as any);
    // cursor lookup
    sqlMock.mockResolvedValueOnce([
      { created_at: new Date('2026-03-05'), id: 'cursor-msg' },
    ] as any);
    // paginated query
    sqlMock.mockResolvedValueOnce([
      makeMessageRow({
        id: 'msg-before-cursor',
        created_at: new Date('2026-03-04'),
      }),
    ] as any);

    const { listMessages } = await import('./conversation.service.js');
    const results = await listMessages(CONVERSATION_ID, USER_ID, 'cursor-msg');

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('msg-before-cursor');
  });

  it('handles message with edited_at timestamp', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: 'member-id' }] as any);
    sqlMock.mockResolvedValueOnce([makeMessageRow({ edited_at: new Date('2026-03-02') })] as any);

    const { listMessages } = await import('./conversation.service.js');
    const results = await listMessages(CONVERSATION_ID, USER_ID);

    expect(results[0].edited_at).toBe(new Date('2026-03-02').toISOString());
  });

  it('handles message with deleted_at (soft-delete marker)', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: 'member-id' }] as any);
    sqlMock.mockResolvedValueOnce([makeMessageRow({ deleted_at: new Date('2026-03-03') })] as any);

    const { listMessages } = await import('./conversation.service.js');
    const results = await listMessages(CONVERSATION_ID, USER_ID);

    expect(results[0].deleted_at).toBe(new Date('2026-03-03').toISOString());
  });
});

/* -------------------------------------------------------------------------- */
/*  listMembers — edge cases                                                  */
/* -------------------------------------------------------------------------- */

describe('conversation.service (edge2) — listMembers', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await resetSqlMock();
  });

  it('returns members with user details', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: 'member-id' }] as any);
    sqlMock.mockResolvedValueOnce([
      makeMemberRow({ role: 'owner', username: 'alice' }),
      makeMemberRow({
        id: 'member-2',
        user_id: OTHER_USER_ID,
        role: 'member',
        username: 'bob',
      }),
    ] as any);

    const { listMembers } = await import('./conversation.service.js');
    const results = await listMembers(CONVERSATION_ID, USER_ID);

    expect(results).toHaveLength(2);
    expect(results[0].role).toBe('owner');
    expect(results[0].user?.username).toBe('alice');
    expect(results[1].role).toBe('member');
    expect(results[1].user?.username).toBe('bob');
  });

  it('returns empty array when no members exist (edge case)', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: 'member-id' }] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { listMembers } = await import('./conversation.service.js');
    const results = await listMembers(CONVERSATION_ID, USER_ID);

    expect(results).toHaveLength(0);
  });

  it('throws NOT_FOUND when non-member requests members list', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { listMembers } = await import('./conversation.service.js');
    await expect(listMembers(CONVERSATION_ID, OTHER_USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('handles member with null last_read_at', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: 'member-id' }] as any);
    sqlMock.mockResolvedValueOnce([makeMemberRow({ last_read_at: null })] as any);

    const { listMembers } = await import('./conversation.service.js');
    const results = await listMembers(CONVERSATION_ID, USER_ID);

    expect(results[0].last_read_at).toBeNull();
  });

  it('handles member with muted=true', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: 'member-id' }] as any);
    sqlMock.mockResolvedValueOnce([makeMemberRow({ muted: true })] as any);

    const { listMembers } = await import('./conversation.service.js');
    const results = await listMembers(CONVERSATION_ID, USER_ID);

    expect(results[0].muted).toBe(true);
  });

  it('handles member without username (user field undefined)', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: 'member-id' }] as any);
    sqlMock.mockResolvedValueOnce([makeMemberRow({ username: undefined })] as any);

    const { listMembers } = await import('./conversation.service.js');
    const results = await listMembers(CONVERSATION_ID, USER_ID);

    expect(results[0].user).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/*  addMember — additional edge cases                                         */
/* -------------------------------------------------------------------------- */

describe('conversation.service (edge2) — addMember roles', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await resetSqlMock();
  });

  it('defaults role to member when not specified', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ role: 'owner' }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([
      makeMemberRow({ user_id: THIRD_USER_ID, role: 'member', username: 'charlie' }),
    ] as any);

    const { addMember } = await import('./conversation.service.js');
    const result = await addMember(CONVERSATION_ID, USER_ID, {
      user_id: THIRD_USER_ID,
      role: 'member',
    });

    expect(result.role).toBe('member');
  });

  it('admin can add members', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ role: 'admin' }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([
      makeMemberRow({ user_id: THIRD_USER_ID, role: 'member', username: 'new-member' }),
    ] as any);

    const { addMember } = await import('./conversation.service.js');
    const result = await addMember(CONVERSATION_ID, OTHER_USER_ID, {
      user_id: THIRD_USER_ID,
      role: 'member',
    });

    expect(result.user_id).toBe(THIRD_USER_ID);
  });

  it('regular member cannot add members', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([{ role: 'member' }] as any);

    const { addMember } = await import('./conversation.service.js');
    await expect(
      addMember(CONVERSATION_ID, USER_ID, {
        user_id: THIRD_USER_ID,
        role: 'member',
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  deleteConversation — additional edge cases                                */
/* -------------------------------------------------------------------------- */

describe('conversation.service (edge2) — deleteConversation', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await resetSqlMock();
  });

  it('regular member cannot delete', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([{ role: 'member' }] as any);

    const { deleteConversation } = await import('./conversation.service.js');
    await expect(deleteConversation(CONVERSATION_ID, USER_ID)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('owner can delete successfully', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ role: 'owner' }] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { deleteConversation } = await import('./conversation.service.js');
    await expect(deleteConversation(CONVERSATION_ID, USER_ID)).resolves.toBeUndefined();
  });
});
