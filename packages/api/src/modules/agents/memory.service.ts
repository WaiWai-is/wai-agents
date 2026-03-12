import { randomUUID } from 'node:crypto';
import { sql } from '../../db/connection.js';
import { toISO } from '../../lib/utils.js';
import type { CreateMemoryInput, UpdateMemoryInput } from './memory.schema.js';

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

const SELECT_COLS = `id, agent_id, user_id, memory_type, content, embedding_key,
  embedding_text, importance, access_count, last_accessed_at,
  source_conversation_id, source_message_id, expires_at,
  metadata, inserted_at, updated_at`;

async function assertAgentOwner(agentId: string, userId: string): Promise<void> {
  const rows = await sql`
    SELECT id FROM agents WHERE id = ${agentId} AND creator_id = ${userId} LIMIT 1
  `;
  if (rows.length === 0) {
    throw Object.assign(new Error('Agent not found or access denied'), { code: 'NOT_FOUND' });
  }
}

async function assertMemoryOwner(memoryId: string, userId: string): Promise<void> {
  const rows = await sql`
    SELECT id FROM agent_memories WHERE id = ${memoryId} AND user_id = ${userId} LIMIT 1
  `;
  if (rows.length === 0) {
    throw Object.assign(new Error('Memory not found or access denied'), { code: 'NOT_FOUND' });
  }
}

export interface ListMemoriesOptions {
  type?: string;
  search?: string;
  minImportance?: number;
  limit?: number;
  offset?: number;
}

export async function listMemories(agentId: string, userId: string, options?: ListMemoriesOptions) {
  await assertAgentOwner(agentId, userId);

  const limit = Math.min(options?.limit ?? 50, 200);
  const offset = Math.max(options?.offset ?? 0, 0);
  const memoryType = options?.type ?? null;
  const rawSearch = options?.search ?? null;
  // Escape SQL LIKE wildcards to prevent user-controlled pattern matching
  const search = rawSearch ? rawSearch.replace(/[%_\\]/g, '\\$&') : null;
  const minImportance = options?.minImportance ?? null;

  const rows = await sql`
    SELECT ${sql.unsafe(SELECT_COLS)}
    FROM agent_memories
    WHERE agent_id = ${agentId} AND user_id = ${userId}
      AND (${memoryType} IS NULL OR memory_type = ${memoryType})
      AND (${search} IS NULL OR content ILIKE '%' || ${search} || '%')
      AND (${minImportance}::double precision IS NULL OR importance >= ${minImportance})
      AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY importance DESC, inserted_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  return rows.map((row) => formatMemory(row as Record<string, unknown>));
}

export async function createMemory(agentId: string, userId: string, input: CreateMemoryInput) {
  await assertAgentOwner(agentId, userId);

  const memoryId = randomUUID();
  const now = new Date().toISOString();
  const metadataJson = input.metadata ? JSON.stringify(input.metadata) : '{}';

  await sql`
    INSERT INTO agent_memories (
      id, agent_id, user_id, memory_type, content, embedding_key,
      embedding_text, importance, source_conversation_id, source_message_id,
      expires_at, metadata, inserted_at, updated_at
    ) VALUES (
      ${memoryId}, ${agentId}, ${userId}, ${input.memory_type}, ${input.content},
      ${input.embedding_key ?? null}, ${input.embedding_text ?? null},
      ${input.importance ?? 0.5}, ${input.source_conversation_id ?? null},
      ${input.source_message_id ?? null}, ${input.expires_at ?? null},
      ${metadataJson}::jsonb, ${now}, ${now}
    )
  `;

  const rows = await sql`
    SELECT ${sql.unsafe(SELECT_COLS)} FROM agent_memories WHERE id = ${memoryId}
  `;
  return formatMemory(rows[0] as Record<string, unknown>);
}

export async function getMemory(memoryId: string, userId: string) {
  const rows = await sql`
    SELECT ${sql.unsafe(SELECT_COLS)}
    FROM agent_memories
    WHERE id = ${memoryId} AND user_id = ${userId}
    LIMIT 1
  `;
  if (rows.length === 0) {
    throw Object.assign(new Error('Memory not found'), { code: 'NOT_FOUND' });
  }
  return formatMemory(rows[0] as Record<string, unknown>);
}

export async function updateMemory(memoryId: string, userId: string, updates: UpdateMemoryInput) {
  await assertMemoryOwner(memoryId, userId);

  const hasContent = updates.content !== undefined;
  const hasType = updates.memory_type !== undefined;
  const hasImportance = updates.importance !== undefined;
  const hasEmbeddingKey = updates.embedding_key !== undefined;
  const hasEmbeddingText = updates.embedding_text !== undefined;
  const hasExpiresAt = updates.expires_at !== undefined;
  const hasMeta = updates.metadata !== undefined;

  const content: string | null = hasContent ? (updates.content as string) : null;
  const memoryType: string | null = hasType ? (updates.memory_type as string) : null;
  const importance: number = hasImportance ? (updates.importance as number) : 0.5;
  const embeddingKey: string | null = hasEmbeddingKey ? (updates.embedding_key ?? null) : null;
  const embeddingText: string | null = hasEmbeddingText ? (updates.embedding_text ?? null) : null;
  const expiresAt: string | null = hasExpiresAt ? (updates.expires_at ?? null) : null;
  const metadataJson: string | null = hasMeta ? JSON.stringify(updates.metadata) : null;

  const rows = await sql`
    UPDATE agent_memories SET
      content        = CASE WHEN ${hasContent} THEN ${content} ELSE content END,
      memory_type    = CASE WHEN ${hasType} THEN ${memoryType} ELSE memory_type END,
      importance     = CASE WHEN ${hasImportance} THEN ${importance} ELSE importance END,
      embedding_key  = CASE WHEN ${hasEmbeddingKey} THEN ${embeddingKey} ELSE embedding_key END,
      embedding_text = CASE WHEN ${hasEmbeddingText} THEN ${embeddingText} ELSE embedding_text END,
      expires_at     = CASE WHEN ${hasExpiresAt} THEN ${expiresAt}::timestamptz ELSE expires_at END,
      metadata       = CASE WHEN ${hasMeta} THEN ${metadataJson}::jsonb ELSE metadata END,
      updated_at     = NOW()
    WHERE id = ${memoryId}
    RETURNING ${sql.unsafe(SELECT_COLS)}
  `;

  if (rows.length === 0) {
    throw Object.assign(new Error('Memory not found'), { code: 'NOT_FOUND' });
  }

  return formatMemory(rows[0] as Record<string, unknown>);
}

export async function deleteMemory(memoryId: string, userId: string) {
  await assertMemoryOwner(memoryId, userId);
  await sql`DELETE FROM agent_memories WHERE id = ${memoryId}`;
}

export async function bulkDeleteMemories(agentId: string, userId: string, type?: string) {
  await assertAgentOwner(agentId, userId);

  if (type) {
    await sql`
      DELETE FROM agent_memories
      WHERE agent_id = ${agentId} AND user_id = ${userId} AND memory_type = ${type}
    `;
  } else {
    await sql`
      DELETE FROM agent_memories
      WHERE agent_id = ${agentId} AND user_id = ${userId}
    `;
  }
}

export async function recallMemories(
  agentId: string,
  userId: string,
  query: string | undefined,
  limit?: number,
) {
  await assertAgentOwner(agentId, userId);

  const maxResults = Math.min(limit ?? 10, 50);
  const rawSearch = query ?? null;
  // Escape SQL LIKE wildcards to prevent user-controlled pattern matching
  const search = rawSearch ? rawSearch.replace(/[%_\\]/g, '\\$&') : null;

  // Recall memories ranked by importance * recency, filtered by search if provided
  // Recency is computed as a decay factor based on time since last access or creation
  const rows = await sql`
    SELECT ${sql.unsafe(SELECT_COLS)},
      importance * (
        1.0 / (1.0 + EXTRACT(EPOCH FROM (NOW() - COALESCE(last_accessed_at, inserted_at))) / 86400.0)
      ) AS relevance_score
    FROM agent_memories
    WHERE agent_id = ${agentId} AND user_id = ${userId}
      AND (${search} IS NULL OR content ILIKE '%' || ${search} || '%')
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

  return rows.map((row) => formatMemory(row as Record<string, unknown>));
}

export async function decayMemories() {
  // Reduce importance of memories that haven't been accessed in 7+ days
  // Decay rate: multiply importance by 0.95 per run
  await sql`
    UPDATE agent_memories SET
      importance = importance * 0.95,
      updated_at = NOW()
    WHERE last_accessed_at < NOW() - INTERVAL '7 days'
      AND importance > 0.01
  `;
}

export async function deleteExpiredMemories() {
  await sql`
    DELETE FROM agent_memories WHERE expires_at IS NOT NULL AND expires_at <= NOW()
  `;
}
