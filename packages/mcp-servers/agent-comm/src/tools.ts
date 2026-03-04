import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { sql } from './db.js';

// ─── Circuit Breaker ──────────────────────────────────────────────────────────

const circuitBreaker = new Map<string, { failures: number; openUntil: number }>();

function checkCircuitBreaker(agentId: string): void {
  const state = circuitBreaker.get(agentId);
  if (state && state.openUntil > Date.now()) {
    throw new Error(`Circuit breaker open for agent ${agentId}: too many failures. Retry after ${new Date(state.openUntil).toISOString()}`);
  }
}

function recordSuccess(agentId: string): void {
  circuitBreaker.delete(agentId);
}

function recordFailure(agentId: string): void {
  const state = circuitBreaker.get(agentId) ?? { failures: 0, openUntil: 0 };
  state.failures += 1;
  if (state.failures >= 3) {
    state.openUntil = Date.now() + 5 * 60 * 1000; // 5 minutes
    state.failures = 0;
  }
  circuitBreaker.set(agentId, state);
}

// ─── Input Schemas ────────────────────────────────────────────────────────────

export const SendToAgentInput = z.object({
  from_agent_id: z.string().uuid(),
  to_agent_id: z.string().uuid(),
  message: z.string().min(1),
  a2a_depth: z.number().int().min(0).default(0),
  expected_output: z.string().optional(),
});

export const CreateAgentConversationInput = z.object({
  agent_ids: z.array(z.string().uuid()).min(2),
  title: z.string().optional(),
});

export const ReadConversationInput = z.object({
  conversation_id: z.string().uuid(),
  limit: z.number().int().positive().max(100).default(20),
});

export const ListAgentConversationsInput = z.object({
  agent_id: z.string().uuid(),
});

export const GetAgentInfoInput = z.object({
  agent_id: z.string().uuid(),
});

export const DiscoverAgentsInput = z.object({
  category: z.string().optional(),
  query: z.string().optional(),
  limit: z.number().int().positive().max(50).default(10),
});

// ─── Handlers ─────────────────────────────────────────────────────────────────

export async function handleSendToAgent(
  input: z.infer<typeof SendToAgentInput>,
): Promise<{ response: string; conversation_id: string; task_id: string }> {
  if (input.a2a_depth >= 3) {
    throw new Error('Maximum A2A depth exceeded');
  }

  checkCircuitBreaker(input.to_agent_id);

  // Get caller agent name for context forwarding
  const callerRows = await sql<Array<{ name: string }>>`
    SELECT name FROM agents WHERE id = ${input.from_agent_id}::uuid LIMIT 1
  `;
  const callerName = callerRows.length > 0 ? callerRows[0].name : 'Unknown Agent';

  // Find existing conversation between agents
  const existing = await sql<Array<{ id: string }>>`
    SELECT c.id FROM conversations c
    JOIN conversation_members cm1 ON cm1.conversation_id = c.id AND cm1.user_id = ${input.from_agent_id}::uuid
    JOIN conversation_members cm2 ON cm2.conversation_id = c.id AND cm2.user_id = ${input.to_agent_id}::uuid
    WHERE c.type = 'agent'
    LIMIT 1
  `;

  let conversationId: string;

  if (existing.length > 0) {
    conversationId = existing[0].id;
  } else {
    conversationId = randomUUID();
    const now = new Date();
    await sql`
      INSERT INTO conversations (id, type, inserted_at, updated_at)
      VALUES (${conversationId}::uuid, 'agent', ${now}, ${now})
    `;
    const member1Id = randomUUID();
    const member2Id = randomUUID();
    await sql`
      INSERT INTO conversation_members (id, conversation_id, user_id, participant_type, role, inserted_at, updated_at)
      VALUES
        (${member1Id}::uuid, ${conversationId}::uuid, ${input.from_agent_id}::uuid, 'agent', 'member', ${now}, ${now}),
        (${member2Id}::uuid, ${conversationId}::uuid, ${input.to_agent_id}::uuid, 'agent', 'member', ${now}, ${now})
    `;
  }

  // Save sender's message
  const messageId = randomUUID();
  const now = new Date();
  await sql`
    INSERT INTO messages (id, conversation_id, sender_id, sender_type, type, content, inserted_at, updated_at)
    VALUES (
      ${messageId}::uuid,
      ${conversationId}::uuid,
      ${input.from_agent_id}::uuid,
      'agent',
      'text',
      ${input.message},
      ${now},
      ${now}
    )
  `;

  // Create task tracking record
  const taskId = randomUUID();
  await sql`
    INSERT INTO agent_tasks (id, caller_agent_id, callee_agent_id, conversation_id, status, message, a2a_depth, inserted_at)
    VALUES (${taskId}::uuid, ${input.from_agent_id}::uuid, ${input.to_agent_id}::uuid, ${conversationId}::uuid, 'submitted', ${input.message}, ${input.a2a_depth}, ${now})
  `;

  // Trigger target agent execution via main API with timeout
  const apiPort = process.env.API_PORT || 4000;
  const internalKey = process.env.INTERNAL_API_KEY;
  if (!internalKey) throw new Error('INTERNAL_API_KEY environment variable must be set');
  const startTime = Date.now();

  // 60-second timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    // Mark task as working
    await sql`UPDATE agent_tasks SET status = 'working', started_at = NOW() WHERE id = ${taskId}::uuid`;

    const apiResponse = await fetch(
      `http://localhost:${apiPort}/api/v1/internal/agent/execute`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Key': internalKey,
        },
        body: JSON.stringify({
          agentId: input.to_agent_id,
          conversationId,
          message: input.message,
          a2aDepth: input.a2a_depth + 1,
          callerContext: {
            caller_agent_id: input.from_agent_id,
            caller_agent_name: callerName,
            caller_conversation_id: conversationId,
            task_summary: input.message,
            expected_output: input.expected_output ?? 'analysis',
          },
        }),
        signal: controller.signal,
      },
    );

    clearTimeout(timeout);

    if (!apiResponse.ok) {
      const errText = await apiResponse.text().catch(() => 'unknown');
      recordFailure(input.to_agent_id);
      const durationMs = Date.now() - startTime;
      await sql`
        UPDATE agent_tasks SET status = 'failed', error_message = ${errText}, completed_at = NOW(), duration_ms = ${durationMs}
        WHERE id = ${taskId}::uuid
      `;
      throw new Error(`Agent execution failed: ${apiResponse.status} ${apiResponse.statusText}`);
    }

    const data = (await apiResponse.json()) as { response?: string; usage?: { input_tokens?: number; output_tokens?: number } };
    const durationMs = Date.now() - startTime;

    recordSuccess(input.to_agent_id);

    // Mark task as completed
    await sql`
      UPDATE agent_tasks SET
        status = 'completed',
        result = ${data.response ?? ''},
        completed_at = NOW(),
        duration_ms = ${durationMs},
        input_tokens = ${data.usage?.input_tokens ?? null},
        output_tokens = ${data.usage?.output_tokens ?? null}
      WHERE id = ${taskId}::uuid
    `;

    return {
      response: data.response ?? '',
      conversation_id: conversationId,
      task_id: taskId,
    };
  } catch (error) {
    clearTimeout(timeout);
    const durationMs = Date.now() - startTime;
    const errorMsg = (error as Error).message;

    if ((error as Error).name === 'AbortError') {
      recordFailure(input.to_agent_id);
      await sql`
        UPDATE agent_tasks SET status = 'failed', error_message = 'Timeout after 60s', completed_at = NOW(), duration_ms = ${durationMs}
        WHERE id = ${taskId}::uuid
      `;
      throw new Error(`Agent execution timed out after 60 seconds`);
    }

    await sql`
      UPDATE agent_tasks SET status = 'failed', error_message = ${errorMsg}, completed_at = NOW(), duration_ms = ${durationMs}
      WHERE id = ${taskId}::uuid
    `.catch(() => {});

    throw error;
  }
}

export async function handleCreateAgentConversation(
  input: z.infer<typeof CreateAgentConversationInput>,
): Promise<{ conversation_id: string }> {
  const conversationId = randomUUID();
  const now = new Date();

  await sql`
    INSERT INTO conversations (id, type, title, inserted_at, updated_at)
    VALUES (
      ${conversationId}::uuid,
      'agent',
      ${input.title ?? null},
      ${now},
      ${now}
    )
  `;

  for (const agentId of input.agent_ids) {
    const memberId = randomUUID();
    await sql`
      INSERT INTO conversation_members (id, conversation_id, user_id, participant_type, role, inserted_at, updated_at)
      VALUES (
        ${memberId}::uuid,
        ${conversationId}::uuid,
        ${agentId}::uuid,
        'agent',
        'member',
        ${now},
        ${now}
      )
    `;
  }

  return { conversation_id: conversationId };
}

export async function handleReadConversation(
  input: z.infer<typeof ReadConversationInput>,
): Promise<{
  messages: Array<{
    sender_id: string;
    sender_type: string;
    content: string;
    created_at: string;
  }>;
}> {
  const rows = await sql<
    Array<{
      sender_id: string;
      sender_type: string;
      content: string;
      created_at: string;
    }>
  >`
    SELECT sender_id, sender_type, content, inserted_at AS created_at
    FROM messages
    WHERE conversation_id = ${input.conversation_id}::uuid
    ORDER BY inserted_at DESC
    LIMIT ${input.limit}
  `;

  return { messages: rows };
}

export async function handleListAgentConversations(
  input: z.infer<typeof ListAgentConversationsInput>,
): Promise<{
  conversations: Array<{
    id: string;
    title: string | null;
    type: string;
    last_message_at: string | null;
  }>;
}> {
  const rows = await sql<
    Array<{
      id: string;
      title: string | null;
      type: string;
      last_message_at: string | null;
    }>
  >`
    SELECT c.id, c.title, c.type, c.last_message_at
    FROM conversations c
    JOIN conversation_members cm ON cm.conversation_id = c.id
    WHERE cm.user_id = ${input.agent_id}::uuid
    ORDER BY c.last_message_at DESC NULLS LAST
  `;

  return { conversations: rows };
}

export async function handleGetAgentInfo(
  input: z.infer<typeof GetAgentInfoInput>,
): Promise<{
  id: string;
  name: string;
  description: string | null;
  capabilities: string[];
  model: string;
  category: string | null;
  rating_avg: number;
  available: boolean;
  max_a2a_depth: number;
}> {
  const rows = await sql<
    Array<{
      id: string;
      name: string;
      description: string | null;
      model: string;
      tools: unknown;
      mcp_servers: unknown;
      category: string | null;
      rating_sum: number;
      rating_count: number;
    }>
  >`
    SELECT id, name, description, model, tools, mcp_servers, category, rating_sum, rating_count
    FROM agents
    WHERE id = ${input.agent_id}::uuid
    LIMIT 1
  `;

  if (rows.length === 0) {
    throw new Error(`Agent not found: ${input.agent_id}`);
  }

  const row = rows[0];
  const tools = (row.tools as unknown[]) ?? [];
  const mcpServers = (row.mcp_servers as unknown[]) ?? [];
  const capabilities: string[] = [];
  if (tools.length > 0) capabilities.push('custom_tools');
  if (mcpServers.length > 0) {
    for (const s of mcpServers as Array<{ name?: string }>) {
      if (s.name) capabilities.push(s.name);
    }
  }

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    capabilities,
    model: row.model,
    category: row.category,
    rating_avg: row.rating_count > 0 ? row.rating_sum / row.rating_count : 0,
    available: true,
    max_a2a_depth: 3,
  };
}

export async function handleDiscoverAgents(
  input: z.infer<typeof DiscoverAgentsInput>,
): Promise<{
  agents: Array<{
    id: string;
    name: string;
    description: string | null;
    capabilities: string[];
    model: string;
    category: string | null;
    rating_avg: number;
  }>;
}> {
  const limit = Math.min(input.limit, 50);

  let rows: Array<Record<string, unknown>>;

  if (input.query) {
    const pattern = `%${input.query}%`;
    rows = await sql`
      SELECT id, name, description, model, tools, mcp_servers, category,
             rating_sum, rating_count
      FROM agents
      WHERE visibility = 'public'
        AND (name ILIKE ${pattern} OR description ILIKE ${pattern})
      ORDER BY usage_count DESC
      LIMIT ${limit}
    `;
  } else if (input.category) {
    rows = await sql`
      SELECT id, name, description, model, tools, mcp_servers, category,
             rating_sum, rating_count
      FROM agents
      WHERE visibility = 'public' AND category = ${input.category}
      ORDER BY usage_count DESC
      LIMIT ${limit}
    `;
  } else {
    rows = await sql`
      SELECT id, name, description, model, tools, mcp_servers, category,
             rating_sum, rating_count
      FROM agents
      WHERE visibility = 'public'
      ORDER BY usage_count DESC
      LIMIT ${limit}
    `;
  }

  const agents = (rows as Array<Record<string, unknown>>).map((row) => {
    const tools = (row['tools'] as unknown[]) ?? [];
    const mcpServers = (row['mcp_servers'] as unknown[]) ?? [];
    const capabilities: string[] = [];
    if (tools.length > 0) capabilities.push('custom_tools');
    if (mcpServers.length > 0) {
      for (const s of mcpServers as Array<{ name?: string }>) {
        if (s.name) capabilities.push(s.name);
      }
    }
    const ratingCount = row['rating_count'] as number;
    const ratingSum = row['rating_sum'] as number;
    return {
      id: row['id'] as string,
      name: row['name'] as string,
      description: row['description'] as string | null,
      capabilities,
      model: row['model'] as string,
      category: row['category'] as string | null,
      rating_avg: ratingCount > 0 ? ratingSum / ratingCount : 0,
    };
  });

  return { agents };
}
