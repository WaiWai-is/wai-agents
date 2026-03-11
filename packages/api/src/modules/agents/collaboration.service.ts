import { randomUUID } from 'node:crypto';
import { sql } from '../../db/connection.js';
import { toISO } from '../../lib/utils.js';
import type { CreateCollaborationInput } from './collaboration.schema.js';

function formatCollaboration(row: Record<string, unknown>) {
  return {
    id: row.id,
    requester_agent_id: row.requester_agent_id,
    responder_agent_id: row.responder_agent_id,
    requester_user_id: row.requester_user_id,
    conversation_id: row.conversation_id,
    status: row.status,
    task_description: row.task_description,
    task_result: row.task_result ?? null,
    metadata: row.metadata,
    created_at: toISO(row.inserted_at),
    updated_at: toISO(row.updated_at),
    completed_at: toISO(row.completed_at),
  };
}

const SELECT_COLS = `id, requester_agent_id, responder_agent_id, requester_user_id,
  conversation_id, status, task_description, task_result,
  metadata, inserted_at, updated_at, completed_at`;

async function assertAgentCreator(agentId: string, userId: string): Promise<void> {
  const rows = await sql`
    SELECT id FROM agents WHERE id = ${agentId} AND creator_id = ${userId} LIMIT 1
  `;
  if (rows.length === 0) {
    throw Object.assign(new Error('Agent not found or access denied'), { code: 'NOT_FOUND' });
  }
}

async function getAgentCreatorId(agentId: string): Promise<string | null> {
  const rows = await sql`
    SELECT creator_id FROM agents WHERE id = ${agentId} LIMIT 1
  `;
  if (rows.length === 0) return null;
  return (rows[0] as Record<string, unknown>).creator_id as string;
}

async function assertCollaborationAccess(
  collaborationId: string,
  userId: string,
): Promise<Record<string, unknown>> {
  const rows = await sql.unsafe(
    `SELECT ${SELECT_COLS} FROM agent_collaborations WHERE id = $1 LIMIT 1`,
    [collaborationId],
  );
  if (rows.length === 0) {
    throw Object.assign(new Error('Collaboration not found'), { code: 'NOT_FOUND' });
  }
  const collab = rows[0] as Record<string, unknown>;

  // Check if user owns either the requester or responder agent
  const requesterOwner = await getAgentCreatorId(collab.requester_agent_id as string);
  const responderOwner = await getAgentCreatorId(collab.responder_agent_id as string);

  if (requesterOwner !== userId && responderOwner !== userId) {
    throw Object.assign(new Error('Collaboration not found or access denied'), {
      code: 'NOT_FOUND',
    });
  }

  return collab;
}

export async function requestCollaboration(
  requesterAgentId: string,
  userId: string,
  conversationId: string,
  input: CreateCollaborationInput,
) {
  // Verify user owns the requester agent
  await assertAgentCreator(requesterAgentId, userId);

  // Verify responder agent exists
  const responderRows = await sql`
    SELECT id FROM agents WHERE id = ${input.responder_agent_id} LIMIT 1
  `;
  if (responderRows.length === 0) {
    throw Object.assign(new Error('Responder agent not found'), { code: 'NOT_FOUND' });
  }

  // Verify conversation exists
  const convRows = await sql`
    SELECT id FROM conversations WHERE id = ${conversationId} LIMIT 1
  `;
  if (convRows.length === 0) {
    throw Object.assign(new Error('Conversation not found'), { code: 'NOT_FOUND' });
  }

  // Cannot collaborate with self
  if (requesterAgentId === input.responder_agent_id) {
    throw Object.assign(new Error('Agent cannot collaborate with itself'), {
      code: 'BAD_REQUEST',
    });
  }

  const collaborationId = randomUUID();
  const now = new Date().toISOString();
  const metadataJson = input.metadata ? JSON.stringify(input.metadata) : '{}';

  await sql`
    INSERT INTO agent_collaborations (
      id, requester_agent_id, responder_agent_id, requester_user_id,
      conversation_id, status, task_description, metadata,
      inserted_at, updated_at
    ) VALUES (
      ${collaborationId}, ${requesterAgentId}, ${input.responder_agent_id},
      ${userId}, ${conversationId}, 'pending', ${input.task_description},
      ${metadataJson}::jsonb, ${now}, ${now}
    )
  `;

  const rows = await sql.unsafe(`SELECT ${SELECT_COLS} FROM agent_collaborations WHERE id = $1`, [
    collaborationId,
  ]);

  const collaboration = formatCollaboration(rows[0] as Record<string, unknown>);

  // Emit Socket.IO event to notify responder's owner
  try {
    const responderCreatorId = await getAgentCreatorId(input.responder_agent_id);
    if (responderCreatorId) {
      const { emitCollaborationEvent } = await import('../../ws/emitter.js');
      emitCollaborationEvent(responderCreatorId, {
        type: 'collaboration:requested',
        collaboration_id: collaborationId,
        requester_agent_id: requesterAgentId,
        responder_agent_id: input.responder_agent_id,
        task_description: input.task_description,
      });
    }
  } catch {
    // Socket.IO may not be initialized in tests
  }

  return collaboration;
}

export async function acceptCollaboration(collaborationId: string, userId: string) {
  const collab = await assertCollaborationAccess(collaborationId, userId);

  // Verify user owns the responder agent
  const responderOwner = await getAgentCreatorId(collab.responder_agent_id as string);
  if (responderOwner !== userId) {
    throw Object.assign(new Error('Only the responder agent owner can accept'), {
      code: 'FORBIDDEN',
    });
  }

  if (collab.status !== 'pending') {
    throw Object.assign(new Error(`Cannot accept collaboration with status '${collab.status}'`), {
      code: 'BAD_REQUEST',
    });
  }

  const rows = await sql`
    UPDATE agent_collaborations SET
      status = 'accepted',
      updated_at = NOW()
    WHERE id = ${collaborationId}
    RETURNING ${sql.unsafe(SELECT_COLS)}
  `;

  const collaboration = formatCollaboration(rows[0] as Record<string, unknown>);

  // Emit Socket.IO event to notify requester
  try {
    const { emitCollaborationEvent } = await import('../../ws/emitter.js');
    emitCollaborationEvent(collab.requester_user_id as string, {
      type: 'collaboration:accepted',
      collaboration_id: collaborationId,
      responder_agent_id: collab.responder_agent_id as string,
    });
  } catch {
    // Socket.IO may not be initialized in tests
  }

  return collaboration;
}

export async function completeCollaboration(
  collaborationId: string,
  userId: string,
  result: string,
) {
  const collab = await assertCollaborationAccess(collaborationId, userId);

  // Verify user owns the responder agent
  const responderOwner = await getAgentCreatorId(collab.responder_agent_id as string);
  if (responderOwner !== userId) {
    throw Object.assign(new Error('Only the responder agent owner can complete'), {
      code: 'FORBIDDEN',
    });
  }

  if (collab.status !== 'accepted' && collab.status !== 'in_progress') {
    throw Object.assign(new Error(`Cannot complete collaboration with status '${collab.status}'`), {
      code: 'BAD_REQUEST',
    });
  }

  const rows = await sql`
    UPDATE agent_collaborations SET
      status = 'completed',
      task_result = ${result},
      completed_at = NOW(),
      updated_at = NOW()
    WHERE id = ${collaborationId}
    RETURNING ${sql.unsafe(SELECT_COLS)}
  `;

  const collaboration = formatCollaboration(rows[0] as Record<string, unknown>);

  // Emit Socket.IO event to notify requester with result
  try {
    const { emitCollaborationEvent } = await import('../../ws/emitter.js');
    emitCollaborationEvent(collab.requester_user_id as string, {
      type: 'collaboration:completed',
      collaboration_id: collaborationId,
      responder_agent_id: collab.responder_agent_id as string,
      result,
    });
  } catch {
    // Socket.IO may not be initialized in tests
  }

  return collaboration;
}

export async function rejectCollaboration(collaborationId: string, userId: string, reason: string) {
  const collab = await assertCollaborationAccess(collaborationId, userId);

  // Verify user owns the responder agent
  const responderOwner = await getAgentCreatorId(collab.responder_agent_id as string);
  if (responderOwner !== userId) {
    throw Object.assign(new Error('Only the responder agent owner can reject'), {
      code: 'FORBIDDEN',
    });
  }

  if (collab.status !== 'pending') {
    throw Object.assign(new Error(`Cannot reject collaboration with status '${collab.status}'`), {
      code: 'BAD_REQUEST',
    });
  }

  const rows = await sql`
    UPDATE agent_collaborations SET
      status = 'rejected',
      task_result = ${reason},
      completed_at = NOW(),
      updated_at = NOW()
    WHERE id = ${collaborationId}
    RETURNING ${sql.unsafe(SELECT_COLS)}
  `;

  const collaboration = formatCollaboration(rows[0] as Record<string, unknown>);

  // Emit Socket.IO event to notify requester with reason
  try {
    const { emitCollaborationEvent } = await import('../../ws/emitter.js');
    emitCollaborationEvent(collab.requester_user_id as string, {
      type: 'collaboration:rejected',
      collaboration_id: collaborationId,
      responder_agent_id: collab.responder_agent_id as string,
      reason,
    });
  } catch {
    // Socket.IO may not be initialized in tests
  }

  return collaboration;
}

export interface ListCollaborationsOptions {
  status?: string;
  direction?: 'sent' | 'received';
}

export async function listCollaborations(
  agentId: string,
  userId: string,
  options?: ListCollaborationsOptions,
) {
  await assertAgentCreator(agentId, userId);

  const status = options?.status ?? null;
  const direction = options?.direction ?? null;

  let rows: Record<string, unknown>[];

  if (direction === 'sent') {
    rows = (await sql`
      SELECT ${sql.unsafe(SELECT_COLS)}
      FROM agent_collaborations
      WHERE requester_agent_id = ${agentId}
        AND requester_user_id = ${userId}
        AND (${status} IS NULL OR status = ${status})
      ORDER BY inserted_at DESC
    `) as unknown as Record<string, unknown>[];
  } else if (direction === 'received') {
    rows = (await sql`
      SELECT ${sql.unsafe(SELECT_COLS)}
      FROM agent_collaborations
      WHERE responder_agent_id = ${agentId}
        AND (${status} IS NULL OR status = ${status})
      ORDER BY inserted_at DESC
    `) as unknown as Record<string, unknown>[];
  } else {
    rows = (await sql`
      SELECT ${sql.unsafe(SELECT_COLS)}
      FROM agent_collaborations
      WHERE (requester_agent_id = ${agentId} OR responder_agent_id = ${agentId})
        AND (${status} IS NULL OR status = ${status})
      ORDER BY inserted_at DESC
    `) as unknown as Record<string, unknown>[];
  }

  return rows.map((row) => formatCollaboration(row));
}

export async function getCollaboration(collaborationId: string, userId: string) {
  const collab = await assertCollaborationAccess(collaborationId, userId);
  return formatCollaboration(collab);
}

export async function discoverAgents(capability: string, userId: string, limit?: number) {
  const maxResults = Math.min(limit ?? 20, 100);

  const rows = await sql`
    SELECT id, name, slug, description, category, visibility,
           usage_count, rating_sum, rating_count, inserted_at
    FROM agents
    WHERE visibility = 'public'
      AND (
        name ILIKE '%' || ${capability} || '%'
        OR description ILIKE '%' || ${capability} || '%'
        OR category ILIKE '%' || ${capability} || '%'
      )
      AND creator_id != ${userId}
    ORDER BY usage_count DESC, rating_sum DESC
    LIMIT ${maxResults}
  `;

  return rows.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      description: r.description,
      category: r.category,
      visibility: r.visibility,
      usage_count: r.usage_count,
      rating_sum: r.rating_sum,
      rating_count: r.rating_count,
      created_at: toISO(r.inserted_at),
    };
  });
}
