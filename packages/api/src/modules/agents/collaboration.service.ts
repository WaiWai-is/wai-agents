import { randomUUID } from 'node:crypto';
import { sql } from '../../db/connection.js';
import { toISO } from '../../lib/utils.js';
import type {
  CreateCollaborationInput,
  RegisterCapabilitiesInput,
  UpdateCollaborationProgressInput,
} from './collaboration.schema.js';

/* -------------------------------------------------------------------------- */
/*  Formatters                                                                */
/* -------------------------------------------------------------------------- */

function formatCollaboration(row: Record<string, unknown>) {
  return {
    id: row.id,
    requester_agent_id: row.requester_agent_id,
    responder_agent_id: row.responder_agent_id,
    requester_user_id: row.requester_user_id,
    conversation_id: row.conversation_id,
    status: row.status,
    priority: row.priority ?? 'normal',
    task_description: row.task_description,
    context: row.context ?? null,
    task_result: row.task_result ?? null,
    parent_request_id: row.parent_request_id ?? null,
    metadata: row.metadata ?? {},
    created_at: toISO(row.inserted_at),
    updated_at: toISO(row.updated_at),
    completed_at: toISO(row.completed_at),
  };
}

function formatCollaborationMessage(row: Record<string, unknown>) {
  return {
    id: row.id,
    request_id: row.request_id,
    from_agent_id: row.from_agent_id,
    content: row.content,
    message_type: row.message_type,
    created_at: toISO(row.inserted_at),
  };
}

function formatCapability(row: Record<string, unknown>) {
  return {
    id: row.id,
    agent_id: row.agent_id,
    capabilities: row.capabilities ?? [],
    max_concurrent_tasks: row.max_concurrent_tasks ?? 1,
    availability_status: row.availability_status ?? 'available',
    created_at: toISO(row.inserted_at),
    updated_at: toISO(row.updated_at),
  };
}

/* -------------------------------------------------------------------------- */
/*  Column constants                                                          */
/* -------------------------------------------------------------------------- */

const SELECT_COLS = `id, requester_agent_id, responder_agent_id, requester_user_id,
  conversation_id, status, priority, task_description, context, task_result,
  parent_request_id, metadata, inserted_at, updated_at, completed_at`;

const MESSAGE_COLS = `id, request_id, from_agent_id, content, message_type, inserted_at`;

const CAPABILITY_COLS = `id, agent_id, capabilities, max_concurrent_tasks,
  availability_status, inserted_at, updated_at`;

/* -------------------------------------------------------------------------- */
/*  Ownership Checks                                                          */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/*  Request Collaboration                                                     */
/* -------------------------------------------------------------------------- */

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

  // Verify parent request exists if provided
  if (input.parent_request_id) {
    const parentRows = await sql`
      SELECT id FROM agent_collaborations WHERE id = ${input.parent_request_id} LIMIT 1
    `;
    if (parentRows.length === 0) {
      throw Object.assign(new Error('Parent collaboration request not found'), {
        code: 'NOT_FOUND',
      });
    }
  }

  const collaborationId = randomUUID();
  const now = new Date().toISOString();
  const metadataJson = input.metadata ? JSON.stringify(input.metadata) : '{}';
  const contextJson = input.context ? JSON.stringify(input.context) : null;
  const priority = input.priority ?? 'normal';
  const parentRequestId = input.parent_request_id ?? null;

  await sql`
    INSERT INTO agent_collaborations (
      id, requester_agent_id, responder_agent_id, requester_user_id,
      conversation_id, status, priority, task_description, context,
      parent_request_id, metadata, inserted_at, updated_at
    ) VALUES (
      ${collaborationId}, ${requesterAgentId}, ${input.responder_agent_id},
      ${userId}, ${conversationId}, 'pending', ${priority},
      ${input.task_description}, ${contextJson}::jsonb,
      ${parentRequestId}, ${metadataJson}::jsonb, ${now}, ${now}
    )
  `;

  // Insert initial task message
  const messageId = randomUUID();
  await sql`
    INSERT INTO collaboration_messages (
      id, request_id, from_agent_id, content, message_type, inserted_at
    ) VALUES (
      ${messageId}, ${collaborationId}, ${requesterAgentId},
      ${input.task_description}, 'task', ${now}
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
        priority,
      });
    }
  } catch {
    // Socket.IO may not be initialized in tests
  }

  return collaboration;
}

/* -------------------------------------------------------------------------- */
/*  Accept Collaboration                                                      */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/*  Update Collaboration Progress                                             */
/* -------------------------------------------------------------------------- */

export async function updateCollaborationProgress(
  collaborationId: string,
  userId: string,
  input: UpdateCollaborationProgressInput,
) {
  const collab = await assertCollaborationAccess(collaborationId, userId);

  // Verify user owns the responder agent
  const responderOwner = await getAgentCreatorId(collab.responder_agent_id as string);
  if (responderOwner !== userId) {
    throw Object.assign(new Error('Only the responder agent owner can update progress'), {
      code: 'FORBIDDEN',
    });
  }

  const validStatuses = ['accepted', 'in_progress'];
  if (!validStatuses.includes(collab.status as string)) {
    throw Object.assign(
      new Error(`Cannot update progress on collaboration with status '${collab.status}'`),
      { code: 'BAD_REQUEST' },
    );
  }

  const now = new Date().toISOString();

  // Update collaboration status
  if (input.status === 'failed') {
    await sql`
      UPDATE agent_collaborations SET
        status = 'failed',
        completed_at = NOW(),
        updated_at = NOW()
      WHERE id = ${collaborationId}
    `;
  } else {
    await sql`
      UPDATE agent_collaborations SET
        status = ${input.status},
        updated_at = NOW()
      WHERE id = ${collaborationId}
    `;
  }

  // Insert progress message
  const messageId = randomUUID();
  await sql`
    INSERT INTO collaboration_messages (
      id, request_id, from_agent_id, content, message_type, inserted_at
    ) VALUES (
      ${messageId}, ${collaborationId}, ${collab.responder_agent_id as string},
      ${input.message}, 'status_update', ${now}
    )
  `;

  const rows = await sql.unsafe(`SELECT ${SELECT_COLS} FROM agent_collaborations WHERE id = $1`, [
    collaborationId,
  ]);
  const collaboration = formatCollaboration(rows[0] as Record<string, unknown>);

  // Emit Socket.IO event
  try {
    const { emitCollaborationEvent } = await import('../../ws/emitter.js');
    if (input.status === 'failed') {
      emitCollaborationEvent(collab.requester_user_id as string, {
        type: 'collaboration:failed',
        collaboration_id: collaborationId,
        agent_id: collab.responder_agent_id as string,
        message: input.message,
      });
    } else {
      emitCollaborationEvent(collab.requester_user_id as string, {
        type: 'collaboration:progress',
        collaboration_id: collaborationId,
        agent_id: collab.responder_agent_id as string,
        status: input.status,
        message: input.message,
      });
    }
  } catch {
    // Socket.IO may not be initialized in tests
  }

  return collaboration;
}

/* -------------------------------------------------------------------------- */
/*  Complete Collaboration                                                    */
/* -------------------------------------------------------------------------- */

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

  const now = new Date().toISOString();

  const rows = await sql`
    UPDATE agent_collaborations SET
      status = 'completed',
      task_result = ${result},
      completed_at = NOW(),
      updated_at = NOW()
    WHERE id = ${collaborationId}
    RETURNING ${sql.unsafe(SELECT_COLS)}
  `;

  // Insert result message
  const messageId = randomUUID();
  await sql`
    INSERT INTO collaboration_messages (
      id, request_id, from_agent_id, content, message_type, inserted_at
    ) VALUES (
      ${messageId}, ${collaborationId}, ${collab.responder_agent_id as string},
      ${result}, 'result', ${now}
    )
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

/* -------------------------------------------------------------------------- */
/*  Reject Collaboration                                                      */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/*  List Collaborations                                                       */
/* -------------------------------------------------------------------------- */

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
      LIMIT 200
    `) as unknown as Record<string, unknown>[];
  } else if (direction === 'received') {
    rows = (await sql`
      SELECT ${sql.unsafe(SELECT_COLS)}
      FROM agent_collaborations
      WHERE responder_agent_id = ${agentId}
        AND (${status} IS NULL OR status = ${status})
      ORDER BY inserted_at DESC
      LIMIT 200
    `) as unknown as Record<string, unknown>[];
  } else {
    rows = (await sql`
      SELECT ${sql.unsafe(SELECT_COLS)}
      FROM agent_collaborations
      WHERE (requester_agent_id = ${agentId} OR responder_agent_id = ${agentId})
        AND (${status} IS NULL OR status = ${status})
      ORDER BY inserted_at DESC
      LIMIT 200
    `) as unknown as Record<string, unknown>[];
  }

  return rows.map((row) => formatCollaboration(row));
}

/* -------------------------------------------------------------------------- */
/*  Get Single Collaboration                                                  */
/* -------------------------------------------------------------------------- */

export async function getCollaboration(collaborationId: string, userId: string) {
  const collab = await assertCollaborationAccess(collaborationId, userId);
  return formatCollaboration(collab);
}

/* -------------------------------------------------------------------------- */
/*  Get Collaboration Chain                                                   */
/* -------------------------------------------------------------------------- */

export async function getCollaborationChain(collaborationId: string, userId: string) {
  // First verify access to the starting collaboration
  await assertCollaborationAccess(collaborationId, userId);

  // Walk up to find the root request
  let rootId = collaborationId;
  const visited = new Set<string>();
  visited.add(rootId);

  for (;;) {
    const parentRows = await sql.unsafe(
      `SELECT parent_request_id FROM agent_collaborations WHERE id = $1 LIMIT 1`,
      [rootId],
    );
    if (parentRows.length === 0) break;
    const parentId = (parentRows[0] as Record<string, unknown>).parent_request_id as string | null;
    if (!parentId || visited.has(parentId)) break;
    visited.add(parentId);
    rootId = parentId;
  }

  // Now collect all collaborations in the chain by walking down from root
  const chain: Record<string, unknown>[] = [];
  const queue = [rootId];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const currentId = queue.shift() as string;
    if (seen.has(currentId)) continue;
    seen.add(currentId);

    const rows = await sql.unsafe(
      `SELECT ${SELECT_COLS} FROM agent_collaborations WHERE id = $1 LIMIT 1`,
      [currentId],
    );
    if (rows.length > 0) {
      chain.push(rows[0] as Record<string, unknown>);
    }

    // Find children
    const childRows = await sql`
      SELECT id FROM agent_collaborations WHERE parent_request_id = ${currentId}
      ORDER BY inserted_at ASC
    `;
    for (const child of childRows) {
      queue.push((child as Record<string, unknown>).id as string);
    }
  }

  return chain.map((row) => formatCollaboration(row));
}

/* -------------------------------------------------------------------------- */
/*  Get Collaboration Messages                                                */
/* -------------------------------------------------------------------------- */

export async function getCollaborationMessages(collaborationId: string, userId: string) {
  await assertCollaborationAccess(collaborationId, userId);

  const rows = await sql.unsafe(
    `SELECT ${MESSAGE_COLS} FROM collaboration_messages
     WHERE request_id = $1 ORDER BY inserted_at ASC LIMIT 500`,
    [collaborationId],
  );

  return rows.map((row) => formatCollaborationMessage(row as Record<string, unknown>));
}

/* -------------------------------------------------------------------------- */
/*  Discover Agents                                                           */
/* -------------------------------------------------------------------------- */

export async function discoverAgents(capability: string, userId: string, limit?: number) {
  const maxResults = Math.min(limit ?? 20, 100);
  // Escape SQL LIKE wildcards to prevent user-controlled pattern matching
  const escapedCapability = capability.replace(/[%_\\]/g, '\\$&');

  const rows = await sql`
    SELECT id, name, slug, description, category, visibility,
           usage_count, rating_sum, rating_count, inserted_at
    FROM agents
    WHERE visibility = 'public'
      AND (
        name ILIKE '%' || ${escapedCapability} || '%'
        OR description ILIKE '%' || ${escapedCapability} || '%'
        OR category ILIKE '%' || ${escapedCapability} || '%'
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

/* -------------------------------------------------------------------------- */
/*  Find Capable Agents                                                       */
/* -------------------------------------------------------------------------- */

export async function findCapableAgents(capability: string, userId: string, limit?: number) {
  const maxResults = Math.min(limit ?? 20, 100);
  const escapedCapability = capability.replace(/[%_\\]/g, '\\$&');

  // Search agents that have registered capabilities matching the query
  const rows = await sql`
    SELECT a.id, a.name, a.slug, a.description, a.category, a.visibility,
           a.usage_count, a.rating_sum, a.rating_count, a.inserted_at,
           ac.capabilities, ac.max_concurrent_tasks, ac.availability_status
    FROM agents a
    JOIN agent_capabilities ac ON ac.agent_id = a.id
    WHERE a.visibility = 'public'
      AND ac.availability_status = 'available'
      AND a.creator_id != ${userId}
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(ac.capabilities) cap
        WHERE cap ILIKE '%' || ${escapedCapability} || '%'
      )
    ORDER BY a.usage_count DESC, a.rating_sum DESC
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
      capabilities: r.capabilities ?? [],
      max_concurrent_tasks: r.max_concurrent_tasks ?? 1,
      availability_status: r.availability_status ?? 'available',
      created_at: toISO(r.inserted_at),
    };
  });
}

/* -------------------------------------------------------------------------- */
/*  Register Capabilities                                                     */
/* -------------------------------------------------------------------------- */

export async function registerCapabilities(
  agentId: string,
  userId: string,
  input: RegisterCapabilitiesInput,
) {
  await assertAgentCreator(agentId, userId);

  const now = new Date().toISOString();
  const capabilitiesJson = JSON.stringify(input.capabilities);
  const maxConcurrent = input.max_concurrent_tasks ?? 1;

  // Upsert agent capabilities
  const rows = await sql`
    INSERT INTO agent_capabilities (
      id, agent_id, capabilities, max_concurrent_tasks,
      availability_status, inserted_at, updated_at
    ) VALUES (
      ${randomUUID()}, ${agentId}, ${capabilitiesJson}::jsonb,
      ${maxConcurrent}, 'available', ${now}, ${now}
    )
    ON CONFLICT (agent_id) DO UPDATE SET
      capabilities = ${capabilitiesJson}::jsonb,
      max_concurrent_tasks = ${maxConcurrent},
      updated_at = ${now}
    RETURNING ${sql.unsafe(CAPABILITY_COLS)}
  `;

  return formatCapability(rows[0] as Record<string, unknown>);
}

/* -------------------------------------------------------------------------- */
/*  Get Agent Capabilities                                                    */
/* -------------------------------------------------------------------------- */

export async function getAgentCapabilities(agentId: string) {
  const rows = await sql.unsafe(
    `SELECT ${CAPABILITY_COLS} FROM agent_capabilities WHERE agent_id = $1 LIMIT 1`,
    [agentId],
  );

  if (rows.length === 0) return null;
  return formatCapability(rows[0] as Record<string, unknown>);
}
