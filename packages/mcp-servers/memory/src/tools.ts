import { z } from 'zod';
import { sql } from './db.js';
import { generateEmbedding, embeddingToString } from './embeddings.js';
import { randomUUID } from 'node:crypto';

// ─── Input Schemas ────────────────────────────────────────────────────────────

export const SaveMemoryInput = z.object({
  agent_id: z.string().uuid(),
  user_id: z.string().uuid(),
  content: z.string().min(1),
  importance: z.number().min(0).max(1).default(0.5),
  memory_type: z.string().default('observation'),
  tags: z.array(z.string()).default([]),
});

export const SearchMemoriesInput = z.object({
  agent_id: z.string().uuid(),
  user_id: z.string().uuid(),
  query: z.string().min(1),
  limit: z.number().int().positive().max(100).default(10),
});

export const ForgetMemoryInput = z.object({
  memory_id: z.string().uuid(),
  agent_id: z.string().uuid(),
  user_id: z.string().uuid(),
});

export const UpdateMemoryInput = z.object({
  memory_id: z.string().uuid(),
  agent_id: z.string().uuid(),
  user_id: z.string().uuid(),
  content: z.string().min(1).optional(),
  importance: z.number().min(0).max(1).optional(),
});

export const GetMemoriesInput = z.object({
  agent_id: z.string().uuid(),
  user_id: z.string().uuid(),
  memory_type: z.string().optional(),
  limit: z.number().int().positive().max(100).default(20),
});

// ─── Handlers ─────────────────────────────────────────────────────────────────

export async function handleSaveMemory(
  input: z.infer<typeof SaveMemoryInput>,
): Promise<{ memory_id: string }> {
  const embedding = await generateEmbedding(input.content);
  const embeddingStr = embeddingToString(embedding);
  const id = randomUUID();
  const now = new Date();

  await sql`
    INSERT INTO agent_memories
      (id, agent_id, user_id, content, embedding, importance, memory_type, tags,
       access_count, decay_factor, inserted_at, updated_at)
    VALUES
      (${id}::uuid, ${input.agent_id}::uuid, ${input.user_id}::uuid,
       ${input.content}, ${embeddingStr}::vector, ${input.importance},
       ${input.memory_type}, ${input.tags},
       0, 1.0, ${now}, ${now})
  `;

  return { memory_id: id };
}

export async function handleSearchMemories(
  input: z.infer<typeof SearchMemoriesInput>,
): Promise<{
  memories: Array<{
    id: string;
    content: string;
    importance: number;
    memory_type: string;
    similarity: number;
  }>;
}> {
  const queryEmbedding = await generateEmbedding(input.query);
  const embeddingStr = embeddingToString(queryEmbedding);

  const rows = await sql<
    Array<{
      id: string;
      content: string;
      importance: number;
      memory_type: string;
      similarity: number;
    }>
  >`
    SELECT
      id,
      content,
      importance,
      memory_type,
      1 - (embedding <=> ${embeddingStr}::vector) AS similarity
    FROM agent_memories
    WHERE agent_id = ${input.agent_id}::uuid
      AND user_id = ${input.user_id}::uuid
    ORDER BY embedding <=> ${embeddingStr}::vector
    LIMIT ${input.limit}
  `;

  return { memories: rows };
}

export async function handleForgetMemory(
  input: z.infer<typeof ForgetMemoryInput>,
): Promise<{ deleted: boolean }> {
  const result = await sql`
    DELETE FROM agent_memories
    WHERE id = ${input.memory_id}::uuid
      AND agent_id = ${input.agent_id}::uuid
      AND user_id = ${input.user_id}::uuid
  `;

  return { deleted: result.count > 0 };
}

export async function handleUpdateMemory(
  input: z.infer<typeof UpdateMemoryInput>,
): Promise<{ updated: boolean }> {
  if (input.content === undefined && input.importance === undefined) {
    return { updated: false };
  }

  const now = new Date();

  if (input.content !== undefined && input.importance !== undefined) {
    const embedding = await generateEmbedding(input.content);
    const embeddingStr = embeddingToString(embedding);
    const result = await sql`
      UPDATE agent_memories
      SET content = ${input.content},
          embedding = ${embeddingStr}::vector,
          importance = ${input.importance},
          updated_at = ${now}
      WHERE id = ${input.memory_id}::uuid
        AND agent_id = ${input.agent_id}::uuid
        AND user_id = ${input.user_id}::uuid
    `;
    return { updated: result.count > 0 };
  }

  if (input.content !== undefined) {
    const embedding = await generateEmbedding(input.content);
    const embeddingStr = embeddingToString(embedding);
    const result = await sql`
      UPDATE agent_memories
      SET content = ${input.content},
          embedding = ${embeddingStr}::vector,
          updated_at = ${now}
      WHERE id = ${input.memory_id}::uuid
        AND agent_id = ${input.agent_id}::uuid
        AND user_id = ${input.user_id}::uuid
    `;
    return { updated: result.count > 0 };
  }

  // importance only
  const result = await sql`
    UPDATE agent_memories
    SET importance = ${input.importance!},
        updated_at = ${now}
    WHERE id = ${input.memory_id}::uuid
      AND agent_id = ${input.agent_id}::uuid
      AND user_id = ${input.user_id}::uuid
  `;
  return { updated: result.count > 0 };
}

export async function handleGetMemories(input: z.infer<typeof GetMemoriesInput>): Promise<{
  memories: Array<{
    id: string;
    agent_id: string;
    user_id: string;
    content: string;
    importance: number;
    memory_type: string;
    tags: string[];
    access_count: number;
    inserted_at: string;
    updated_at: string;
  }>;
}> {
  const rows =
    input.memory_type !== undefined
      ? await sql`
          SELECT id, agent_id, user_id, content, importance, memory_type, tags,
                 access_count, inserted_at, updated_at
          FROM agent_memories
          WHERE agent_id = ${input.agent_id}::uuid
            AND user_id = ${input.user_id}::uuid
            AND memory_type = ${input.memory_type}
          ORDER BY inserted_at DESC
          LIMIT ${input.limit}
        `
      : await sql`
          SELECT id, agent_id, user_id, content, importance, memory_type, tags,
                 access_count, inserted_at, updated_at
          FROM agent_memories
          WHERE agent_id = ${input.agent_id}::uuid
            AND user_id = ${input.user_id}::uuid
          ORDER BY inserted_at DESC
          LIMIT ${input.limit}
        `;

  return { memories: rows as unknown as Awaited<ReturnType<typeof handleGetMemories>>['memories'] };
}
