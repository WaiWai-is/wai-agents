import { randomUUID } from 'node:crypto';
import { sql } from '../../db/connection.js';
import { toISO } from '../../lib/utils.js';
import type { MemoryConsolidateInput } from './memory.schema.js';

/* -------------------------------------------------------------------------- */
/*  Formatters                                                                */
/* -------------------------------------------------------------------------- */

function formatConsolidation(row: Record<string, unknown>) {
  return {
    id: row.id,
    agent_id: row.agent_id,
    source_memory_ids: row.source_memory_ids ?? [],
    result_memory_id: row.result_memory_id,
    consolidation_type: row.consolidation_type,
    created_at: toISO(row.created_at),
  };
}

function formatMemory(row: Record<string, unknown>) {
  return {
    id: row.id,
    agent_id: row.agent_id,
    user_id: row.user_id,
    memory_type: row.memory_type,
    content: row.content,
    embedding_key: row.embedding_key ?? null,
    embedding_text: row.embedding_text ?? null,
    importance: row.importance,
    access_count: row.access_count,
    last_accessed_at: toISO(row.last_accessed_at),
    source_conversation_id: row.source_conversation_id ?? null,
    source_message_id: row.source_message_id ?? null,
    expires_at: toISO(row.expires_at),
    metadata: row.metadata,
    created_at: toISO(row.inserted_at),
    updated_at: toISO(row.updated_at),
  };
}

const MEMORY_SELECT_COLS = `id, agent_id, user_id, memory_type, content, embedding_key,
  embedding_text, importance, access_count, last_accessed_at,
  source_conversation_id, source_message_id, expires_at,
  metadata, inserted_at, updated_at`;

const CONSOLIDATION_SELECT_COLS = `id, agent_id, source_memory_ids, result_memory_id,
  consolidation_type, created_at`;

/* -------------------------------------------------------------------------- */
/*  Ownership Checks                                                          */
/* -------------------------------------------------------------------------- */

async function assertAgentOwner(agentId: string, userId: string): Promise<void> {
  const rows = await sql`
    SELECT id FROM agents WHERE id = ${agentId} AND creator_id = ${userId} LIMIT 1
  `;
  if (rows.length === 0) {
    throw Object.assign(new Error('Agent not found or access denied'), { code: 'NOT_FOUND' });
  }
}

/* -------------------------------------------------------------------------- */
/*  Consolidate Memories                                                      */
/* -------------------------------------------------------------------------- */

export async function consolidateMemories(
  agentId: string,
  userId: string,
  input: MemoryConsolidateInput,
) {
  await assertAgentOwner(agentId, userId);

  // Verify all source memories exist and belong to this agent + user
  const sourceRows = await sql`
    SELECT id FROM agent_memories
    WHERE id = ANY(${input.memory_ids})
      AND agent_id = ${agentId}
      AND user_id = ${userId}
  `;
  if (sourceRows.length !== input.memory_ids.length) {
    throw Object.assign(
      new Error('One or more source memories not found or not owned by this agent'),
      { code: 'NOT_FOUND' },
    );
  }

  const resultMemoryId = randomUUID();
  const consolidationId = randomUUID();
  const now = new Date().toISOString();
  const resultMemoryType = input.result_memory_type ?? 'semantic';
  const resultImportance = input.result_importance ?? 0.7;

  // Create the consolidated result memory
  await sql`
    INSERT INTO agent_memories (
      id, agent_id, user_id, memory_type, content, embedding_text,
      importance, metadata, inserted_at, updated_at
    ) VALUES (
      ${resultMemoryId}, ${agentId}, ${userId}, ${resultMemoryType},
      ${input.result_content}, ${input.result_content},
      ${resultImportance},
      ${JSON.stringify({ consolidated_from: input.memory_ids, consolidation_type: input.consolidation_type })}::jsonb,
      ${now}, ${now}
    )
  `;

  // Create the consolidation record
  await sql`
    INSERT INTO memory_consolidations (
      id, agent_id, source_memory_ids, result_memory_id,
      consolidation_type, created_at
    ) VALUES (
      ${consolidationId}, ${agentId}, ${input.memory_ids},
      ${resultMemoryId}, ${input.consolidation_type}, ${now}
    )
  `;

  // For 'merge' consolidations, soft-delete the source memories (set expires_at to now)
  if (input.consolidation_type === 'merge') {
    await sql`
      UPDATE agent_memories SET
        expires_at = NOW(),
        updated_at = NOW()
      WHERE id = ANY(${input.memory_ids})
    `;
  }

  // For 'reinforce' consolidations, boost the importance of the source memories
  if (input.consolidation_type === 'reinforce') {
    await sql`
      UPDATE agent_memories SET
        importance = LEAST(importance * 1.2, 1.0),
        updated_at = NOW()
      WHERE id = ANY(${input.memory_ids})
    `;
  }

  // Fetch the consolidation record
  const consolidationRows = await sql`
    SELECT ${sql.unsafe(CONSOLIDATION_SELECT_COLS)}
    FROM memory_consolidations
    WHERE id = ${consolidationId}
  `;

  // Fetch the result memory
  const memoryRows = await sql`
    SELECT ${sql.unsafe(MEMORY_SELECT_COLS)}
    FROM agent_memories
    WHERE id = ${resultMemoryId}
  `;

  // Emit Socket.IO event
  try {
    const creatorRows = await sql`
      SELECT creator_id FROM agents WHERE id = ${agentId} LIMIT 1
    `;
    if (creatorRows.length > 0) {
      const creatorId = (creatorRows[0] as Record<string, unknown>).creator_id as string;
      const { emitMemoryEvent } = await import('../../ws/emitter.js');
      emitMemoryEvent(creatorId, {
        type: 'memory:consolidated',
        agent_id: agentId,
        consolidation_id: consolidationId,
        source_count: input.memory_ids.length,
        consolidation_type: input.consolidation_type,
      });
    }
  } catch {
    // Socket.IO may not be initialized in tests
  }

  return {
    consolidation: formatConsolidation(consolidationRows[0] as Record<string, unknown>),
    result_memory: formatMemory(memoryRows[0] as Record<string, unknown>),
  };
}

/* -------------------------------------------------------------------------- */
/*  Decay Memories (per-agent)                                                */
/* -------------------------------------------------------------------------- */

export async function decayAgentMemories(agentId: string, userId: string) {
  await assertAgentOwner(agentId, userId);

  // Reduce importance of memories that haven't been accessed in 7+ days
  // Decay rate: multiply importance by 0.95 per run
  const result = await sql`
    UPDATE agent_memories SET
      importance = importance * 0.95,
      updated_at = NOW()
    WHERE agent_id = ${agentId}
      AND user_id = ${userId}
      AND (last_accessed_at IS NULL OR last_accessed_at < NOW() - INTERVAL '7 days')
      AND importance > 0.01
      AND (expires_at IS NULL OR expires_at > NOW())
    RETURNING id
  `;

  return { decayed_count: result.length };
}

/* -------------------------------------------------------------------------- */
/*  Memory Stats                                                              */
/* -------------------------------------------------------------------------- */

export async function getMemoryStats(agentId: string, userId: string) {
  await assertAgentOwner(agentId, userId);

  // Get counts by type
  const typeRows = await sql`
    SELECT memory_type, COUNT(*)::int AS count
    FROM agent_memories
    WHERE agent_id = ${agentId} AND user_id = ${userId}
      AND (expires_at IS NULL OR expires_at > NOW())
    GROUP BY memory_type
  `;

  const byType: Record<string, number> = {};
  let total = 0;
  for (const row of typeRows) {
    const r = row as Record<string, unknown>;
    byType[r.memory_type as string] = r.count as number;
    total += r.count as number;
  }

  // Get average importance
  const avgRows = await sql`
    SELECT COALESCE(AVG(importance), 0)::double precision AS avg_importance
    FROM agent_memories
    WHERE agent_id = ${agentId} AND user_id = ${userId}
      AND (expires_at IS NULL OR expires_at > NOW())
  `;
  const avgImportance = (avgRows[0] as Record<string, unknown>).avg_importance as number;

  // Get total consolidations
  const consolidationRows = await sql`
    SELECT COUNT(*)::int AS total_consolidations
    FROM memory_consolidations
    WHERE agent_id = ${agentId}
  `;
  const totalConsolidations = (consolidationRows[0] as Record<string, unknown>)
    .total_consolidations as number;

  return {
    total,
    by_type: byType,
    avg_importance: Math.round(avgImportance * 1000) / 1000,
    total_consolidations: totalConsolidations,
  };
}

/* -------------------------------------------------------------------------- */
/*  Soft Delete Memory                                                        */
/* -------------------------------------------------------------------------- */

export async function softDeleteMemory(agentId: string, userId: string, memoryId: string) {
  await assertAgentOwner(agentId, userId);

  const rows = await sql`
    UPDATE agent_memories SET
      expires_at = NOW(),
      updated_at = NOW()
    WHERE id = ${memoryId}
      AND agent_id = ${agentId}
      AND user_id = ${userId}
    RETURNING id
  `;

  if (rows.length === 0) {
    throw Object.assign(new Error('Memory not found or access denied'), { code: 'NOT_FOUND' });
  }
}

/* -------------------------------------------------------------------------- */
/*  Recall Memories (with consolidation-aware scoring)                        */
/* -------------------------------------------------------------------------- */

export async function recallMemoriesAdvanced(
  agentId: string,
  userId: string,
  query: string,
  options?: { memory_type?: string; limit?: number; min_importance?: number },
) {
  await assertAgentOwner(agentId, userId);

  const maxResults = Math.min(options?.limit ?? 10, 50);
  // Escape SQL LIKE wildcards to prevent user-controlled pattern matching
  const search = query.replace(/[%_\\]/g, '\\$&');
  const memoryType = options?.memory_type ?? null;
  const minImportance = options?.min_importance ?? null;

  const rows = await sql`
    SELECT ${sql.unsafe(MEMORY_SELECT_COLS)},
      importance * (
        1.0 / (1.0 + EXTRACT(EPOCH FROM (NOW() - COALESCE(last_accessed_at, inserted_at))) / 86400.0)
      ) AS relevance_score
    FROM agent_memories
    WHERE agent_id = ${agentId} AND user_id = ${userId}
      AND (content ILIKE '%' || ${search} || '%'
           OR embedding_text ILIKE '%' || ${search} || '%')
      AND (${memoryType} IS NULL OR memory_type = ${memoryType})
      AND (${minImportance}::double precision IS NULL OR importance >= ${minImportance})
      AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY relevance_score DESC
    LIMIT ${maxResults}
  `;

  // Update access_count and last_accessed_at for recalled memories
  const ids = rows.map((r) => (r as Record<string, unknown>).id as string);
  if (ids.length > 0) {
    await sql`
      UPDATE agent_memories SET
        access_count = access_count + 1,
        last_accessed_at = NOW()
      WHERE id = ANY(${ids})
    `;
  }

  // Emit Socket.IO event
  try {
    const creatorRows = await sql`
      SELECT creator_id FROM agents WHERE id = ${agentId} LIMIT 1
    `;
    if (creatorRows.length > 0) {
      const creatorId = (creatorRows[0] as Record<string, unknown>).creator_id as string;
      const { emitMemoryEvent } = await import('../../ws/emitter.js');
      emitMemoryEvent(creatorId, {
        type: 'memory:recalled',
        agent_id: agentId,
        memory_count: rows.length,
        query,
      });
    }
  } catch {
    // Socket.IO may not be initialized in tests
  }

  return rows.map((row) => formatMemory(row as Record<string, unknown>));
}
