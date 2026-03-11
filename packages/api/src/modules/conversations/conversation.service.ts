import { randomUUID } from 'node:crypto';
import { sql } from '../../db/connection.js';
import { formatConversation, toISO } from '../../lib/utils.js';
import { emitMessage } from '../../ws/emitter.js';
import { runAgentLoop } from '../agents/loop.js';
import type {
  AddMemberInput,
  CreateConversationInput,
  SendMessageInput,
  UpdateConversationInput,
} from './conversation.schema.js';

function formatMessage(row: Record<string, unknown>) {
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    sender_id: row.sender_id,
    sender_type: row.sender_type,
    type: row.type,
    content: row.content,
    metadata: row.metadata,
    edited_at: toISO(row.edited_at),
    deleted_at: toISO(row.deleted_at),
    created_at: toISO(row.created_at),
  };
}

function formatMember(row: Record<string, unknown>) {
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    user_id: row.user_id,
    role: row.role,
    muted: row.muted,
    last_read_at: toISO(row.last_read_at),
    joined_at: toISO(row.joined_at),
    user: row.username
      ? {
          id: row.user_id,
          username: row.username,
          display_name: row.display_name,
          avatar_url: row.member_avatar_url,
        }
      : undefined,
  };
}

async function assertMember(conversationId: string, userId: string): Promise<void> {
  const rows = await sql`
    SELECT id FROM conversation_members
    WHERE conversation_id = ${conversationId} AND user_id = ${userId}
    LIMIT 1
  `;
  if (rows.length === 0) {
    throw Object.assign(new Error('Conversation not found or access denied'), {
      code: 'NOT_FOUND',
    });
  }
}

async function assertAdminOrOwner(conversationId: string, userId: string): Promise<void> {
  const rows = await sql`
    SELECT role FROM conversation_members
    WHERE conversation_id = ${conversationId} AND user_id = ${userId}
    LIMIT 1
  `;
  if (rows.length === 0) {
    throw Object.assign(new Error('Conversation not found or access denied'), {
      code: 'NOT_FOUND',
    });
  }
  const role = (rows[0] as Record<string, unknown>).role as string;
  if (role !== 'owner' && role !== 'admin') {
    throw Object.assign(new Error('Forbidden: must be owner or admin'), { code: 'FORBIDDEN' });
  }
}

async function assertOwner(conversationId: string, userId: string): Promise<void> {
  const rows = await sql`
    SELECT role FROM conversation_members
    WHERE conversation_id = ${conversationId} AND user_id = ${userId}
    LIMIT 1
  `;
  if (rows.length === 0) {
    throw Object.assign(new Error('Conversation not found or access denied'), {
      code: 'NOT_FOUND',
    });
  }
  const role = (rows[0] as Record<string, unknown>).role as string;
  if (role !== 'owner') {
    throw Object.assign(new Error('Forbidden: must be owner'), { code: 'FORBIDDEN' });
  }
}

export async function listConversations(userId: string) {
  const rows = await sql`
    SELECT
      c.id, c.type, c.title, c.avatar_url, c.creator_id, c.agent_id,
      c.metadata, c.last_message_at, c.inserted_at, c.updated_at,
      lm.id AS last_message_id,
      lm.content AS last_message_content,
      lm.sender_id AS last_message_sender_id,
      lm.created_at AS last_message_created_at,
      (
        SELECT COUNT(*)::int FROM messages msg
        WHERE msg.conversation_id = c.id
          AND msg.created_at > COALESCE(cm.last_read_at, '1970-01-01'::timestamptz)
          AND msg.sender_id != ${userId}
          AND msg.deleted_at IS NULL
      ) AS unread_count
    FROM conversations c
    JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = ${userId}
    LEFT JOIN LATERAL (
      SELECT id, content, sender_id, created_at
      FROM messages
      WHERE conversation_id = c.id AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    ) lm ON true
    ORDER BY COALESCE(c.last_message_at, c.inserted_at) DESC
  `;

  return rows.map((row) => {
    const r = row as Record<string, unknown>;
    const conv = formatConversation(r);
    return {
      ...conv,
      unread_count: r.unread_count ?? 0,
      last_message: r.last_message_id
        ? {
            id: r.last_message_id,
            content: r.last_message_content,
            sender_id: r.last_message_sender_id,
            created_at: r.last_message_created_at,
          }
        : null,
    };
  });
}

export async function createConversation(userId: string, input: CreateConversationInput) {
  const conversationId = randomUUID();
  const now = new Date().toISOString();

  await sql`
    INSERT INTO conversations (id, type, title, creator_id, metadata, inserted_at, updated_at)
    VALUES (${conversationId}, ${input.type}, ${input.title ?? null}, ${userId}, '{}', ${now}, ${now})
  `;

  // Add creator as owner
  await sql`
    INSERT INTO conversation_members (id, conversation_id, user_id, role, joined_at)
    VALUES (${randomUUID()}, ${conversationId}, ${userId}, 'owner', ${now})
  `;

  // Add additional members
  if (input.member_ids && input.member_ids.length > 0) {
    for (const memberId of input.member_ids) {
      if (memberId !== userId) {
        await sql`
          INSERT INTO conversation_members (id, conversation_id, user_id, role, joined_at)
          VALUES (${randomUUID()}, ${conversationId}, ${memberId}, 'member', ${now})
          ON CONFLICT DO NOTHING
        `;
      }
    }
  }

  const rows = await sql`
    SELECT id, type, title, avatar_url, creator_id, agent_id, metadata, last_message_at, inserted_at, updated_at
    FROM conversations WHERE id = ${conversationId}
  `;

  return formatConversation(rows[0] as Record<string, unknown>);
}

export async function getConversation(conversationId: string, userId: string) {
  await assertMember(conversationId, userId);

  const rows = await sql`
    SELECT id, type, title, avatar_url, creator_id, agent_id, metadata, last_message_at, inserted_at, updated_at
    FROM conversations WHERE id = ${conversationId}
  `;

  if (rows.length === 0) {
    throw Object.assign(new Error('Conversation not found'), { code: 'NOT_FOUND' });
  }

  return formatConversation(rows[0] as Record<string, unknown>);
}

export async function updateConversation(
  conversationId: string,
  userId: string,
  updates: UpdateConversationInput,
) {
  await assertAdminOrOwner(conversationId, userId);

  const title = updates.title !== undefined ? updates.title : null;
  const avatarUrl = updates.avatar_url !== undefined ? updates.avatar_url : null;

  const rows = await sql`
    UPDATE conversations SET
      title      = CASE WHEN ${title !== null} THEN ${title} ELSE title END,
      avatar_url = CASE WHEN ${avatarUrl !== null} THEN ${avatarUrl} ELSE avatar_url END,
      updated_at = NOW()
    WHERE id = ${conversationId}
    RETURNING id, type, title, avatar_url, creator_id, agent_id, metadata, last_message_at, inserted_at, updated_at
  `;

  if (rows.length === 0) {
    throw Object.assign(new Error('Conversation not found'), { code: 'NOT_FOUND' });
  }

  return formatConversation(rows[0] as Record<string, unknown>);
}

export async function deleteConversation(conversationId: string, userId: string) {
  await assertOwner(conversationId, userId);

  await sql`DELETE FROM conversations WHERE id = ${conversationId}`;
}

export async function listMessages(
  conversationId: string,
  userId: string,
  cursor?: string,
  limit: number = 50,
) {
  await assertMember(conversationId, userId);

  const clampedLimit = Math.min(Math.max(1, limit), 100);

  let rows: Record<string, unknown>[];
  if (cursor) {
    // Get created_at and id for cursor message to paginate with stable ordering
    const cursorRows = await sql`
      SELECT created_at, id FROM messages WHERE id = ${cursor} LIMIT 1
    `;
    if (cursorRows.length === 0) {
      throw Object.assign(new Error('Invalid cursor'), { code: 'BAD_REQUEST' });
    }
    const cursorRow = cursorRows[0] as Record<string, unknown>;
    const cursorAt = cursorRow.created_at as Date;
    const cursorId = cursorRow.id as string;

    rows = await sql`
      SELECT id, conversation_id, sender_id, sender_type, type, content, metadata, edited_at, deleted_at, created_at
      FROM messages
      WHERE conversation_id = ${conversationId}
        AND deleted_at IS NULL
        AND (created_at < ${cursorAt} OR (created_at = ${cursorAt} AND id < ${cursorId}))
      ORDER BY created_at DESC, id DESC
      LIMIT ${clampedLimit}
    `;
  } else {
    rows = await sql`
      SELECT id, conversation_id, sender_id, sender_type, type, content, metadata, edited_at, deleted_at, created_at
      FROM messages
      WHERE conversation_id = ${conversationId}
        AND deleted_at IS NULL
      ORDER BY created_at DESC, id DESC
      LIMIT ${clampedLimit}
    `;
  }

  return rows.map((row) => formatMessage(row as Record<string, unknown>));
}

export async function sendMessage(
  conversationId: string,
  userId: string,
  input: SendMessageInput,
  idempotencyKey: string,
) {
  await assertMember(conversationId, userId);

  const result: { message: ReturnType<typeof formatMessage>; isDuplicate: boolean } =
    // @ts-expect-error postgres.js TransactionSql type lacks call signatures but works at runtime
    await sql.begin(async (tx: typeof sql) => {
      // Check idempotency INSIDE the transaction to prevent race conditions
      const existingIdempotent = await tx`
      SELECT response_body FROM idempotency_keys
      WHERE key = ${idempotencyKey} AND user_id = ${userId}
      LIMIT 1
    `;
      if (existingIdempotent.length > 0) {
        // Return cached response without re-emitting events or re-triggering agent loop
        return {
          message: (existingIdempotent[0] as Record<string, unknown>).response_body as ReturnType<
            typeof formatMessage
          >,
          isDuplicate: true,
        };
      }

      const messageId = randomUUID();
      const now = new Date().toISOString();
      const contentJson = JSON.stringify(input.content);

      await tx`
      INSERT INTO messages (id, conversation_id, sender_id, sender_type, type, content, metadata, created_at)
      VALUES (${messageId}, ${conversationId}, ${userId}, 'human', 'text', ${contentJson}::jsonb, '{}', ${now})
    `;

      // Update conversation last_message_at
      await tx`
      UPDATE conversations SET last_message_at = ${now}, updated_at = NOW()
      WHERE id = ${conversationId}
    `;

      const rows = await tx`
      SELECT id, conversation_id, sender_id, sender_type, type, content, metadata, edited_at, deleted_at, created_at
      FROM messages WHERE id = ${messageId}
    `;

      const msg = formatMessage(rows[0] as Record<string, unknown>);

      // Save idempotency key
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await tx`
      INSERT INTO idempotency_keys (id, key, user_id, response_code, response_body, expires_at, inserted_at)
      VALUES (${randomUUID()}, ${idempotencyKey}, ${userId}, 201, ${JSON.stringify(msg)}::jsonb, ${expiresAt}, NOW())
      ON CONFLICT (key, user_id) DO NOTHING
    `;

      return { message: msg, isDuplicate: false };
    });

  // If this was a duplicate request, return cached response without side effects
  if (result.isDuplicate) {
    return result.message;
  }

  const message = result.message;

  // Emit WebSocket event (outside transaction)
  try {
    emitMessage(conversationId, message);
  } catch {
    // Socket.IO may not be initialized in tests
  }

  // Trigger agent loop if this is an agent conversation (outside transaction)
  const convRows = await sql`
    SELECT agent_id FROM conversations WHERE id = ${conversationId} AND type = 'agent' AND agent_id IS NOT NULL LIMIT 1
  `;
  if (convRows.length > 0) {
    const agentId = (convRows[0] as Record<string, unknown>).agent_id as string;
    const messageText = Array.isArray(input.content)
      ? (input.content as Array<{ type: string; text?: string }>).map((b) => b.text ?? '').join('')
      : String(input.content);

    // Run agent loop asynchronously — don't block the response
    runAgentLoop({
      agentId,
      conversationId,
      userId,
      message: messageText,
    }).catch((err) => {
      console.error(`Agent loop error for ${agentId}:`, (err as Error).message);
    });
  }

  return message;
}

export async function listMembers(conversationId: string, userId: string) {
  await assertMember(conversationId, userId);

  const rows = await sql`
    SELECT
      cm.id, cm.conversation_id, cm.user_id, cm.role, cm.muted, cm.last_read_at, cm.joined_at,
      u.username, u.display_name, u.avatar_url AS member_avatar_url
    FROM conversation_members cm
    JOIN users u ON u.id = cm.user_id
    WHERE cm.conversation_id = ${conversationId}
    ORDER BY cm.joined_at ASC
  `;

  return rows.map((row) => formatMember(row as Record<string, unknown>));
}

export async function addMember(conversationId: string, userId: string, input: AddMemberInput) {
  await assertAdminOrOwner(conversationId, userId);

  const now = new Date().toISOString();
  const role = input.role ?? 'member';

  await sql`
    INSERT INTO conversation_members (id, conversation_id, user_id, role, joined_at)
    VALUES (${randomUUID()}, ${conversationId}, ${input.user_id}, ${role}, ${now})
    ON CONFLICT (conversation_id, user_id) DO NOTHING
  `;

  const rows = await sql`
    SELECT
      cm.id, cm.conversation_id, cm.user_id, cm.role, cm.muted, cm.last_read_at, cm.joined_at,
      u.username, u.display_name, u.avatar_url AS member_avatar_url
    FROM conversation_members cm
    JOIN users u ON u.id = cm.user_id
    WHERE cm.conversation_id = ${conversationId} AND cm.user_id = ${input.user_id}
    LIMIT 1
  `;

  if (rows.length === 0) {
    throw Object.assign(new Error('Member not found after insert'), { code: 'NOT_FOUND' });
  }

  return formatMember(rows[0] as Record<string, unknown>);
}

export async function removeMember(conversationId: string, userId: string, targetUserId: string) {
  await assertAdminOrOwner(conversationId, userId);

  // Cannot remove the owner
  const targetRows = await sql`
    SELECT role FROM conversation_members
    WHERE conversation_id = ${conversationId} AND user_id = ${targetUserId}
    LIMIT 1
  `;

  if (targetRows.length === 0) {
    throw Object.assign(new Error('Member not found'), { code: 'NOT_FOUND' });
  }

  const targetRole = (targetRows[0] as Record<string, unknown>).role as string;
  if (targetRole === 'owner') {
    throw Object.assign(new Error('Cannot remove the owner'), { code: 'FORBIDDEN' });
  }

  await sql`
    DELETE FROM conversation_members
    WHERE conversation_id = ${conversationId} AND user_id = ${targetUserId}
  `;
}
