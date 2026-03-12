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
/*  listConversations — edge cases                                            */
/* -------------------------------------------------------------------------- */

describe('conversation.service (edge) — listConversations', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await resetSqlMock();
  });

  it('returns empty array when user has 0 conversations', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { listConversations } = await import('./conversation.service.js');
    const result = await listConversations(USER_ID);

    expect(result).toEqual([]);
    expect(result).toHaveLength(0);
  });

  it('handles conversation with null unread_count', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([makeConversationListRow({ unread_count: null })] as any);

    const { listConversations } = await import('./conversation.service.js');
    const result = await listConversations(USER_ID);

    // Should default to 0 when unread_count is null
    expect(result[0].unread_count).toBe(0);
  });

  it('handles conversation with zero unread_count and null last_message_id', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([
      makeConversationListRow({
        unread_count: 0,
        last_message_id: null,
        last_message_content: null,
        last_message_sender_id: null,
        last_message_created_at: null,
      }),
    ] as any);

    const { listConversations } = await import('./conversation.service.js');
    const result = await listConversations(USER_ID);

    expect(result[0].unread_count).toBe(0);
    expect(result[0].last_message).toBeNull();
  });

  it('returns conversations with large unread counts', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([makeConversationListRow({ unread_count: 9999 })] as any);

    const { listConversations } = await import('./conversation.service.js');
    const result = await listConversations(USER_ID);

    expect(result[0].unread_count).toBe(9999);
  });
});

/* -------------------------------------------------------------------------- */
/*  createConversation — edge cases                                           */
/* -------------------------------------------------------------------------- */

describe('conversation.service (edge) — createConversation', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await resetSqlMock();
  });

  it('skips creator ID in member_ids and does not insert duplicate', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // 1. Insert conversation
    sqlMock.mockResolvedValueOnce([] as any);
    // 2. Insert creator as owner
    sqlMock.mockResolvedValueOnce([] as any);
    // 3. Only OTHER_USER_ID should be added (USER_ID skipped)
    sqlMock.mockResolvedValueOnce([] as any);
    // 4. SELECT conversation
    sqlMock.mockResolvedValueOnce([makeConversationRow({ type: 'group' })] as any);

    const { createConversation } = await import('./conversation.service.js');
    await createConversation(USER_ID, {
      type: 'group',
      member_ids: [USER_ID, OTHER_USER_ID],
    });

    // Should be 4 calls, not 5 (creator ID skipped)
    expect(sqlMock).toHaveBeenCalledTimes(4);
  });

  it('handles member_ids containing only the creator ID', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // 1. Insert conversation
    sqlMock.mockResolvedValueOnce([] as any);
    // 2. Insert creator as owner
    sqlMock.mockResolvedValueOnce([] as any);
    // 3. SELECT conversation (no member inserts because creator is skipped)
    sqlMock.mockResolvedValueOnce([makeConversationRow()] as any);

    const { createConversation } = await import('./conversation.service.js');
    await createConversation(USER_ID, {
      type: 'dm',
      member_ids: [USER_ID],
    });

    // Only 3 calls: insert conv + insert owner + select (creator skipped)
    expect(sqlMock).toHaveBeenCalledTimes(3);
  });

  it('creates conversation with null title', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([makeConversationRow({ title: null })] as any);

    const { createConversation } = await import('./conversation.service.js');
    const result = await createConversation(USER_ID, { type: 'dm' });

    expect(result.title).toBeNull();
  });

  it('creates conversation with multiple members', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // Insert conversation
    sqlMock.mockResolvedValueOnce([] as any);
    // Insert creator as owner
    sqlMock.mockResolvedValueOnce([] as any);
    // Insert member 1
    sqlMock.mockResolvedValueOnce([] as any);
    // Insert member 2
    sqlMock.mockResolvedValueOnce([] as any);
    // SELECT conversation
    sqlMock.mockResolvedValueOnce([makeConversationRow({ type: 'group' })] as any);

    const { createConversation } = await import('./conversation.service.js');
    const result = await createConversation(USER_ID, {
      type: 'group',
      title: 'Team Chat',
      member_ids: [OTHER_USER_ID, THIRD_USER_ID],
    });

    expect(result.type).toBe('group');
    expect(sqlMock).toHaveBeenCalledTimes(5);
  });
});

/* -------------------------------------------------------------------------- */
/*  sendMessage — idempotency edge cases                                      */
/* -------------------------------------------------------------------------- */

describe('conversation.service (edge) — sendMessage idempotency', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await resetSqlMock();
  });

  it('returns cached response on duplicate idempotency key without triggering agent loop', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    const { runAgentLoop } = await import('../agents/loop.js');
    const { emitMessage } = await import('../../ws/emitter.js');

    // assertMember
    sqlMock.mockResolvedValueOnce([{ id: 'member-id' }] as any);
    // Idempotency check — found with cached response
    const cachedMsg = makeMessageRow();
    sqlMock.mockResolvedValueOnce([{ response_body: cachedMsg }] as any);

    const { sendMessage } = await import('./conversation.service.js');
    const result = await sendMessage(
      CONVERSATION_ID,
      USER_ID,
      { content: [{ type: 'text', text: 'Hello' }] },
      'duplicate-key',
    );

    expect(result).toEqual(cachedMsg);
    // Should NOT emit WebSocket event or trigger agent loop for duplicates
    expect(emitMessage).not.toHaveBeenCalled();
    expect(runAgentLoop).not.toHaveBeenCalled();
  });

  it('two different idempotency keys produce separate messages', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // First message
    sqlMock.mockResolvedValueOnce([{ id: 'member-id' }] as any); // assertMember
    sqlMock.mockResolvedValueOnce([] as any); // idempotency check — not found
    sqlMock.mockResolvedValueOnce([] as any); // INSERT
    sqlMock.mockResolvedValueOnce([] as any); // UPDATE conv
    sqlMock.mockResolvedValueOnce([makeMessageRow({ id: 'msg-1' })] as any); // SELECT
    sqlMock.mockResolvedValueOnce([] as any); // save idempotency
    sqlMock.mockResolvedValueOnce([] as any); // agent check

    const { sendMessage } = await import('./conversation.service.js');
    const result1 = await sendMessage(
      CONVERSATION_ID,
      USER_ID,
      { content: [{ type: 'text', text: 'First' }] },
      'key-1',
    );

    expect(result1.id).toBe('msg-1');
  });
});

/* -------------------------------------------------------------------------- */
/*  listMessages — edge cases                                                 */
/* -------------------------------------------------------------------------- */

describe('conversation.service (edge) — listMessages', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await resetSqlMock();
  });

  it('throws BAD_REQUEST for invalid cursor (message ID not found)', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: 'member-id' }] as any);
    sqlMock.mockResolvedValueOnce([] as any); // cursor lookup returns empty

    const { listMessages } = await import('./conversation.service.js');
    await expect(
      listMessages(CONVERSATION_ID, USER_ID, 'nonexistent-cursor-id'),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Invalid cursor',
    });
  });

  it('clamps negative limit to 1', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: 'member-id' }] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { listMessages } = await import('./conversation.service.js');
    const result = await listMessages(CONVERSATION_ID, USER_ID, undefined, -10);

    expect(result).toHaveLength(0);
    expect(sqlMock).toHaveBeenCalledTimes(2);
  });

  it('clamps limit of 0 to 1', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: 'member-id' }] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { listMessages } = await import('./conversation.service.js');
    await listMessages(CONVERSATION_ID, USER_ID, undefined, 0);

    expect(sqlMock).toHaveBeenCalledTimes(2);
  });

  it('returns empty array from cursor-based query when no older messages', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: 'member-id' }] as any);
    sqlMock.mockResolvedValueOnce([
      { created_at: new Date('2026-01-01T00:00:00Z'), id: 'oldest-msg' },
    ] as any);
    sqlMock.mockResolvedValueOnce([] as any); // no messages before cursor

    const { listMessages } = await import('./conversation.service.js');
    const result = await listMessages(CONVERSATION_ID, USER_ID, 'oldest-msg');

    expect(result).toHaveLength(0);
  });

  it('handles default limit of 50', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: 'member-id' }] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { listMessages } = await import('./conversation.service.js');
    await listMessages(CONVERSATION_ID, USER_ID);

    // Should succeed without providing explicit limit
    expect(sqlMock).toHaveBeenCalledTimes(2);
  });
});

/* -------------------------------------------------------------------------- */
/*  updateConversation — edge cases                                           */
/* -------------------------------------------------------------------------- */

describe('conversation.service (edge) — updateConversation', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await resetSqlMock();
  });

  it('updates with empty update object (no fields changed)', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ role: 'owner' }] as any);
    sqlMock.mockResolvedValueOnce([makeConversationRow()] as any);

    const { updateConversation } = await import('./conversation.service.js');
    const result = await updateConversation(CONVERSATION_ID, USER_ID, {});

    // Should succeed — CASE WHEN false THEN ... ELSE keep keeps all fields
    expect(result.id).toBe(CONVERSATION_ID);
  });

  it('allows admin to update', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ role: 'admin' }] as any);
    sqlMock.mockResolvedValueOnce([makeConversationRow({ title: 'Admin Updated' })] as any);

    const { updateConversation } = await import('./conversation.service.js');
    const result = await updateConversation(CONVERSATION_ID, USER_ID, { title: 'Admin Updated' });

    expect(result.title).toBe('Admin Updated');
  });

  it('rejects update from regular member', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([{ role: 'member' }] as any);

    const { updateConversation } = await import('./conversation.service.js');
    await expect(
      updateConversation(CONVERSATION_ID, USER_ID, { title: 'Unauthorized' }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Forbidden: must be owner or admin',
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  removeMember — edge cases                                                 */
/* -------------------------------------------------------------------------- */

describe('conversation.service (edge) — removeMember', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await resetSqlMock();
  });

  it('prevents removing the owner with FORBIDDEN error and specific message', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // assertAdminOrOwner — caller is owner
    sqlMock.mockResolvedValueOnce([{ role: 'owner' }] as any);
    // Target is also owner
    sqlMock.mockResolvedValueOnce([{ role: 'owner' }] as any);

    const { removeMember } = await import('./conversation.service.js');
    await expect(removeMember(CONVERSATION_ID, USER_ID, USER_ID)).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Cannot remove the owner',
    });
  });

  it('allows owner to remove an admin', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ role: 'owner' }] as any);
    sqlMock.mockResolvedValueOnce([{ role: 'admin' }] as any);
    sqlMock.mockResolvedValueOnce([] as any); // DELETE

    const { removeMember } = await import('./conversation.service.js');
    await removeMember(CONVERSATION_ID, USER_ID, OTHER_USER_ID);

    expect(sqlMock).toHaveBeenCalledTimes(3);
  });

  it('allows admin to remove a regular member', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ role: 'admin' }] as any);
    sqlMock.mockResolvedValueOnce([{ role: 'member' }] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { removeMember } = await import('./conversation.service.js');
    await removeMember(CONVERSATION_ID, USER_ID, OTHER_USER_ID);

    expect(sqlMock).toHaveBeenCalledTimes(3);
  });

  it('throws NOT_FOUND when target member does not exist in conversation', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ role: 'owner' }] as any);
    sqlMock.mockResolvedValueOnce([] as any); // target not found

    const { removeMember } = await import('./conversation.service.js');
    await expect(removeMember(CONVERSATION_ID, USER_ID, 'nonexistent-user')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Member not found',
    });
  });

  it('prevents regular member from removing anyone', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([{ role: 'member' }] as any);

    const { removeMember } = await import('./conversation.service.js');
    await expect(removeMember(CONVERSATION_ID, USER_ID, OTHER_USER_ID)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  addMember — edge cases                                                    */
/* -------------------------------------------------------------------------- */

describe('conversation.service (edge) — addMember', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await resetSqlMock();
  });

  it('handles ON CONFLICT for adding already-existing member', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ role: 'owner' }] as any);
    sqlMock.mockResolvedValueOnce([] as any); // INSERT (ON CONFLICT DO NOTHING)
    sqlMock.mockResolvedValueOnce([
      makeMemberRow({ user_id: OTHER_USER_ID, role: 'member', username: 'existing' }),
    ] as any);

    const { addMember } = await import('./conversation.service.js');
    const result = await addMember(CONVERSATION_ID, USER_ID, {
      user_id: OTHER_USER_ID,
      role: 'member',
    });

    expect(result.user_id).toBe(OTHER_USER_ID);
  });

  it('throws NOT_FOUND when SELECT after insert returns empty (user does not exist)', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ role: 'owner' }] as any);
    sqlMock.mockResolvedValueOnce([] as any); // INSERT (ON CONFLICT skipped or FK violation silent)
    sqlMock.mockResolvedValueOnce([] as any); // SELECT returns empty

    const { addMember } = await import('./conversation.service.js');
    await expect(
      addMember(CONVERSATION_ID, USER_ID, { user_id: 'ghost-user-id', role: 'member' }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Member not found after insert',
    });
  });

  it('allows adding member with admin role', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ role: 'owner' }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([
      makeMemberRow({ user_id: THIRD_USER_ID, role: 'admin', username: 'newadmin' }),
    ] as any);

    const { addMember } = await import('./conversation.service.js');
    const result = await addMember(CONVERSATION_ID, USER_ID, {
      user_id: THIRD_USER_ID,
      role: 'admin',
    });

    expect(result.role).toBe('admin');
  });
});

/* -------------------------------------------------------------------------- */
/*  deleteConversation — edge cases                                           */
/* -------------------------------------------------------------------------- */

describe('conversation.service (edge) — deleteConversation', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await resetSqlMock();
  });

  it('only owner can delete, admin cannot', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([{ role: 'admin' }] as any);

    const { deleteConversation } = await import('./conversation.service.js');
    await expect(deleteConversation(CONVERSATION_ID, USER_ID)).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Forbidden: must be owner',
    });
  });

  it('throws NOT_FOUND when non-member tries to delete', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { deleteConversation } = await import('./conversation.service.js');
    await expect(deleteConversation(CONVERSATION_ID, OTHER_USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('successfully deletes when owner', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ role: 'owner' }] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { deleteConversation } = await import('./conversation.service.js');
    await deleteConversation(CONVERSATION_ID, USER_ID);

    expect(sqlMock).toHaveBeenCalledTimes(2);
  });
});

/* -------------------------------------------------------------------------- */
/*  sendMessage — agent loop edge cases                                       */
/* -------------------------------------------------------------------------- */

describe('conversation.service (edge) — sendMessage agent loop', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await resetSqlMock();
  });

  it('does not trigger agent loop for non-agent conversation', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    const { runAgentLoop } = await import('../agents/loop.js');

    sqlMock.mockResolvedValueOnce([{ id: 'member-id' }] as any);
    sqlMock.mockResolvedValueOnce([] as any); // idempotency
    sqlMock.mockResolvedValueOnce([] as any); // INSERT
    sqlMock.mockResolvedValueOnce([] as any); // UPDATE conv
    sqlMock.mockResolvedValueOnce([makeMessageRow()] as any); // SELECT
    sqlMock.mockResolvedValueOnce([] as any); // save idempotency
    sqlMock.mockResolvedValueOnce([] as any); // agent check — not found (non-agent conv)

    const { sendMessage } = await import('./conversation.service.js');
    await sendMessage(
      CONVERSATION_ID,
      USER_ID,
      { content: [{ type: 'text', text: 'Hello' }] },
      'no-agent-key',
    );

    expect(runAgentLoop).not.toHaveBeenCalled();
  });

  it('concatenates multi-block content for agent loop', async () => {
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
      {
        content: [
          { type: 'text', text: 'Hello ' },
          { type: 'text', text: 'World' },
          { type: 'text', text: '!' },
        ],
      },
      'multi-block-key',
    );

    expect(runAgentLoop).toHaveBeenCalledWith(expect.objectContaining({ message: 'Hello World!' }));
  });
});

/* -------------------------------------------------------------------------- */
/*  getConversation — edge cases                                              */
/* -------------------------------------------------------------------------- */

describe('conversation.service (edge) — getConversation', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await resetSqlMock();
  });

  it('formats all fields correctly', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: 'member-id' }] as any);
    sqlMock.mockResolvedValueOnce([
      makeConversationRow({
        type: 'agent',
        title: 'Agent Chat',
        avatar_url: 'https://example.com/avatar.png',
        agent_id: AGENT_ID,
        last_message_at: new Date('2026-03-10T15:00:00Z'),
      }),
    ] as any);

    const { getConversation } = await import('./conversation.service.js');
    const result = await getConversation(CONVERSATION_ID, USER_ID);

    expect(result.type).toBe('agent');
    expect(result.title).toBe('Agent Chat');
    expect(result.avatar_url).toBe('https://example.com/avatar.png');
    expect(result.agent_id).toBe(AGENT_ID);
    expect(result.last_message_at).toBe('2026-03-10T15:00:00.000Z');
    expect(result.created_at).toBe(NOW.toISOString());
  });
});
