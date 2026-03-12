import { randomUUID } from 'node:crypto';
import { sql } from '../../db/connection.js';
import { formatConversation, toISO } from '../../lib/utils.js';
import type { CreateAgentInput, UpdateAgentInput } from './agent.schema.js';
import { getTemplate } from './templates.js';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function formatAgent(row: Record<string, unknown>) {
  return {
    id: row.id,
    creator_id: row.creator_id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    avatar_url: row.avatar_url,
    system_prompt: row.system_prompt,
    model: row.model,
    temperature: row.temperature,
    max_tokens: row.max_tokens,
    tools: row.tools,
    mcp_servers: row.mcp_servers,
    visibility: row.visibility,
    category: row.category,
    usage_count: row.usage_count,
    rating_sum: row.rating_sum,
    rating_count: row.rating_count,
    execution_mode: row.execution_mode,
    metadata: row.metadata,
    created_at: toISO(row.inserted_at),
    updated_at: toISO(row.updated_at),
  };
}

function formatCoreMemory(row: Record<string, unknown>) {
  return {
    id: row.id,
    agent_id: row.agent_id,
    block_label: row.block_label,
    content: row.content,
    created_at: toISO(row.inserted_at),
    updated_at: toISO(row.updated_at),
  };
}

async function assertCreator(agentId: string, userId: string): Promise<void> {
  const rows = await sql`
    SELECT id FROM agents WHERE id = ${agentId} AND creator_id = ${userId} LIMIT 1
  `;
  if (rows.length === 0) {
    throw Object.assign(new Error('Agent not found or access denied'), { code: 'NOT_FOUND' });
  }
}

export async function listAgents(userId: string) {
  const rows = await sql`
    SELECT id, creator_id, name, slug, description, avatar_url, system_prompt, model,
           temperature, max_tokens, tools, mcp_servers, visibility, category,
           usage_count, rating_sum, rating_count, execution_mode, metadata, inserted_at, updated_at
    FROM agents
    WHERE creator_id = ${userId}
    ORDER BY inserted_at DESC
    LIMIT 200
  `;
  return rows.map((row) => formatAgent(row as Record<string, unknown>));
}

export async function createAgent(userId: string, input: CreateAgentInput) {
  let systemPrompt = input.system_prompt ?? '';
  let model = input.model ?? 'claude-sonnet-4-6';
  let tools = input.tools ?? [];
  let mcpServers = input.mcp_servers ?? [];
  let coreMemories: Array<{ blockLabel: string; content: string }> = [
    { blockLabel: 'identity', content: `I am ${input.name}.` },
    { blockLabel: 'rules', content: '- Be helpful and honest.\n- Stay on topic.' },
    { blockLabel: 'priorities', content: '1. Helpfulness\n2. Accuracy\n3. Safety' },
    { blockLabel: 'preferences', content: 'Respond clearly and concisely.' },
  ];

  if (input.template) {
    try {
      const template = getTemplate(input.template);
      systemPrompt = input.system_prompt ?? template.systemPrompt;
      model = input.model ?? (template.model as unknown as typeof model);
      tools = input.tools ?? (template.tools as unknown as typeof tools);
      mcpServers = input.mcp_servers ?? (template.mcpServers as unknown as typeof mcpServers);
      coreMemories = template.coreMemories;
    } catch {
      throw Object.assign(new Error(`Template '${input.template}' not found`), {
        code: 'BAD_REQUEST',
      });
    }
  }

  const baseSlug = slugify(input.name);
  let slug = baseSlug;

  // Escape SQL LIKE wildcards to prevent user-controlled pattern matching
  const escapedSlug = baseSlug.replace(/[%_\\]/g, '\\$&');

  // Ensure slug uniqueness (cap at 10000 to prevent unbounded loops)
  const existing =
    await sql`SELECT slug FROM agents WHERE slug LIKE ${`${escapedSlug}%`} ORDER BY slug`;
  if (existing.length > 0) {
    const existingSlugs = new Set(
      (existing as Array<Record<string, unknown>>).map((r) => r.slug as string),
    );
    if (existingSlugs.has(slug)) {
      let counter = 2;
      while (existingSlugs.has(`${baseSlug}-${counter}`) && counter < 10000) {
        counter++;
      }
      slug = `${baseSlug}-${counter}`;
    }
  }

  const agentId = randomUUID();
  const now = new Date().toISOString();
  const toolsJson = JSON.stringify(tools);
  const mcpServersJson = JSON.stringify(mcpServers);

  await sql`
    INSERT INTO agents (
      id, creator_id, name, slug, description, system_prompt, model,
      tools, mcp_servers, visibility, category, metadata, inserted_at, updated_at
    ) VALUES (
      ${agentId}, ${userId}, ${input.name}, ${slug},
      ${input.description ?? null}, ${systemPrompt}, ${model},
      ${toolsJson}::jsonb, ${mcpServersJson}::jsonb,
      ${input.visibility ?? 'private'}, ${input.category ?? null},
      '{}', ${now}, ${now}
    )
  `;

  // Create default SOUL core memories
  for (const memory of coreMemories) {
    await sql`
      INSERT INTO agent_core_memories (id, agent_id, block_label, content, inserted_at, updated_at)
      VALUES (${randomUUID()}, ${agentId}, ${memory.blockLabel}, ${memory.content}, ${now}, ${now})
    `;
  }

  const rows = await sql`
    SELECT id, creator_id, name, slug, description, avatar_url, system_prompt, model,
           temperature, max_tokens, tools, mcp_servers, visibility, category,
           usage_count, rating_sum, rating_count, execution_mode, metadata, inserted_at, updated_at
    FROM agents WHERE id = ${agentId}
  `;

  const agent = formatAgent(rows[0] as Record<string, unknown>);

  const memRows = await sql`
    SELECT id, agent_id, block_label, content, inserted_at, updated_at
    FROM agent_core_memories WHERE agent_id = ${agentId}
    ORDER BY inserted_at ASC
  `;

  return {
    ...agent,
    core_memories: memRows.map((r) => formatCoreMemory(r as Record<string, unknown>)),
  };
}

export async function getAgent(agentId: string, userId: string) {
  // Allow access if user is the creator OR the agent is public/unlisted
  const rows = await sql`
    SELECT id, creator_id, name, slug, description, avatar_url, system_prompt, model,
           temperature, max_tokens, tools, mcp_servers, visibility, category,
           usage_count, rating_sum, rating_count, execution_mode, metadata, inserted_at, updated_at
    FROM agents
    WHERE id = ${agentId}
      AND (creator_id = ${userId} OR visibility IN ('public', 'unlisted'))
    LIMIT 1
  `;

  if (rows.length === 0) {
    throw Object.assign(new Error('Agent not found'), { code: 'NOT_FOUND' });
  }

  const row = rows[0] as Record<string, unknown>;
  const agent = formatAgent(row);
  const isOwner = row.creator_id === userId;

  const memRows = await sql`
    SELECT id, agent_id, block_label, content, inserted_at, updated_at
    FROM agent_core_memories WHERE agent_id = ${agentId}
    ORDER BY inserted_at ASC
  `;

  const result = {
    ...agent,
    core_memories: memRows.map((r) => formatCoreMemory(r as Record<string, unknown>)),
  };

  // Strip system_prompt from non-owners — it's proprietary content
  if (!isOwner) {
    const { system_prompt: _, ...withoutPrompt } = result;
    return withoutPrompt;
  }

  return result;
}

export async function updateAgent(agentId: string, userId: string, updates: UpdateAgentInput) {
  await assertCreator(agentId, userId);

  const name = updates.name !== undefined ? updates.name : null;
  const description = updates.description !== undefined ? updates.description : null;
  const systemPrompt = updates.system_prompt !== undefined ? updates.system_prompt : null;
  const model = updates.model !== undefined ? updates.model : null;
  const toolsJson = updates.tools !== undefined ? JSON.stringify(updates.tools) : null;
  const mcpServersJson =
    updates.mcp_servers !== undefined ? JSON.stringify(updates.mcp_servers) : null;
  const visibility = updates.visibility !== undefined ? updates.visibility : null;
  const category = updates.category !== undefined ? updates.category : null;
  const avatarUrl = updates.avatar_url !== undefined ? updates.avatar_url : null;

  const rows = await sql`
    UPDATE agents SET
      name          = CASE WHEN ${name !== null} THEN ${name} ELSE name END,
      description   = CASE WHEN ${description !== null} THEN ${description} ELSE description END,
      system_prompt = CASE WHEN ${systemPrompt !== null} THEN ${systemPrompt} ELSE system_prompt END,
      model         = CASE WHEN ${model !== null} THEN ${model} ELSE model END,
      tools         = CASE WHEN ${toolsJson !== null} THEN ${toolsJson}::jsonb ELSE tools END,
      mcp_servers   = CASE WHEN ${mcpServersJson !== null} THEN ${mcpServersJson}::jsonb ELSE mcp_servers END,
      visibility    = CASE WHEN ${visibility !== null} THEN ${visibility} ELSE visibility END,
      category      = CASE WHEN ${category !== null} THEN ${category} ELSE category END,
      avatar_url    = CASE WHEN ${avatarUrl !== null} THEN ${avatarUrl} ELSE avatar_url END,
      updated_at    = NOW()
    WHERE id = ${agentId}
    RETURNING id, creator_id, name, slug, description, avatar_url, system_prompt, model,
              temperature, max_tokens, tools, mcp_servers, visibility, category,
              usage_count, rating_sum, rating_count, execution_mode, metadata, inserted_at, updated_at
  `;

  if (rows.length === 0) {
    throw Object.assign(new Error('Agent not found'), { code: 'NOT_FOUND' });
  }

  return formatAgent(rows[0] as Record<string, unknown>);
}

export async function deleteAgent(agentId: string, userId: string) {
  await assertCreator(agentId, userId);
  await sql`UPDATE conversations SET agent_id = NULL WHERE agent_id = ${agentId}`;
  await sql`DELETE FROM agents WHERE id = ${agentId}`;
}

export async function startConversation(agentId: string, userId: string) {
  // Verify agent exists
  const agentRows = await sql`
    SELECT id, visibility, creator_id FROM agents WHERE id = ${agentId} LIMIT 1
  `;
  if (agentRows.length === 0) {
    throw Object.assign(new Error('Agent not found'), { code: 'NOT_FOUND' });
  }

  // Block access to private agents the user doesn't own
  const agentRow = agentRows[0] as Record<string, unknown>;
  if (agentRow.visibility === 'private' && agentRow.creator_id !== userId) {
    throw Object.assign(new Error('Agent not found'), { code: 'NOT_FOUND' });
  }

  // Find existing agent conversation where user is a member
  const existing = await sql`
    SELECT c.id, c.type, c.title, c.avatar_url, c.creator_id, c.agent_id,
           c.metadata, c.last_message_at, c.inserted_at, c.updated_at
    FROM conversations c
    JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = ${userId}
    WHERE c.type = 'agent' AND c.agent_id = ${agentId}
    ORDER BY c.inserted_at DESC
    LIMIT 1
  `;

  if (existing.length > 0) {
    return {
      conversation: formatConversation(existing[0] as Record<string, unknown>),
      created: false,
    };
  }

  // Create new agent conversation
  const conversationId = randomUUID();
  const now = new Date().toISOString();

  await sql`
    INSERT INTO conversations (id, type, title, creator_id, agent_id, metadata, inserted_at, updated_at)
    VALUES (${conversationId}, 'agent', null, ${userId}, ${agentId}, '{}', ${now}, ${now})
  `;

  await sql`
    INSERT INTO conversation_members (id, conversation_id, user_id, role, joined_at)
    VALUES (${randomUUID()}, ${conversationId}, ${userId}, 'owner', ${now})
  `;

  const rows = await sql`
    SELECT id, type, title, avatar_url, creator_id, agent_id, metadata, last_message_at, inserted_at, updated_at
    FROM conversations WHERE id = ${conversationId}
  `;

  return { conversation: formatConversation(rows[0] as Record<string, unknown>), created: true };
}

function formatAgentCard(row: Record<string, unknown>) {
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
    rating_avg: row.rating_avg,
    available: true,
    max_a2a_depth: 3,
  };
}

export async function getAgentCard(agentId: string) {
  const rows = await sql`
    SELECT id, name, description, model, tools, mcp_servers, category, visibility,
           rating_sum, rating_count,
           CASE WHEN rating_count > 0 THEN rating_sum::float / rating_count ELSE 0 END AS rating_avg
    FROM agents WHERE id = ${agentId} LIMIT 1
  `;
  if (rows.length === 0) {
    throw Object.assign(new Error('Agent not found'), { code: 'NOT_FOUND' });
  }
  return formatAgentCard(rows[0] as Record<string, unknown>);
}

export async function discoverAgents(opts: { category?: string; query?: string; limit?: number }) {
  const limit = Math.min(opts.limit ?? 10, 50);
  if (opts.query) {
    // Escape SQL LIKE wildcards to prevent user-controlled pattern matching
    const escaped = opts.query.replace(/[%_\\]/g, '\\$&');
    const pattern = `%${escaped}%`;
    const rows = await sql`
      SELECT id, name, description, model, tools, mcp_servers, category, visibility,
             rating_sum, rating_count,
             CASE WHEN rating_count > 0 THEN rating_sum::float / rating_count ELSE 0 END AS rating_avg
      FROM agents
      WHERE visibility = 'public'
        AND (name ILIKE ${pattern} OR description ILIKE ${pattern})
      ORDER BY usage_count DESC
      LIMIT ${limit}
    `;
    return rows.map((r) => formatAgentCard(r as Record<string, unknown>));
  }
  if (opts.category) {
    const rows = await sql`
      SELECT id, name, description, model, tools, mcp_servers, category, visibility,
             rating_sum, rating_count,
             CASE WHEN rating_count > 0 THEN rating_sum::float / rating_count ELSE 0 END AS rating_avg
      FROM agents
      WHERE visibility = 'public' AND category = ${opts.category}
      ORDER BY usage_count DESC
      LIMIT ${limit}
    `;
    return rows.map((r) => formatAgentCard(r as Record<string, unknown>));
  }
  const rows = await sql`
    SELECT id, name, description, model, tools, mcp_servers, category, visibility,
           rating_sum, rating_count,
           CASE WHEN rating_count > 0 THEN rating_sum::float / rating_count ELSE 0 END AS rating_avg
    FROM agents
    WHERE visibility = 'public'
    ORDER BY usage_count DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => formatAgentCard(r as Record<string, unknown>));
}

/* -------------------------------------------------------------------------- */
/*  Agent Performance                                                         */
/* -------------------------------------------------------------------------- */

export async function getAgentPerformance(agentId: string, userId: string) {
  // Verify ownership
  const ownerRows = await sql`
    SELECT id FROM agents WHERE id = ${agentId} AND creator_id = ${userId} LIMIT 1
  `;
  if (ownerRows.length === 0) {
    throw Object.assign(new Error('Agent not found or access denied'), { code: 'NOT_FOUND' });
  }

  // Overall rating
  const ratingRows = await sql`
    SELECT rating_sum, rating_count,
           CASE WHEN rating_count > 0 THEN rating_sum::float / rating_count ELSE 0 END AS rating_avg
    FROM agents WHERE id = ${agentId}
  `;
  const rRow = ratingRows[0] as Record<string, unknown>;

  // Rating trend: compare last 30d average vs prior 30d
  const recentRatings = await sql`
    SELECT AVG(rating)::float AS avg_rating FROM agent_ratings
    WHERE agent_id = ${agentId} AND inserted_at > NOW() - INTERVAL '30 days'
  `;
  const priorRatings = await sql`
    SELECT AVG(rating)::float AS avg_rating FROM agent_ratings
    WHERE agent_id = ${agentId}
      AND inserted_at > NOW() - INTERVAL '60 days'
      AND inserted_at <= NOW() - INTERVAL '30 days'
  `;
  const recentAvg = (recentRatings[0] as Record<string, unknown>).avg_rating as number | null;
  const priorAvg = (priorRatings[0] as Record<string, unknown>).avg_rating as number | null;
  let ratingTrend: 'improving' | 'declining' | 'stable' = 'stable';
  if (recentAvg != null && priorAvg != null) {
    if (recentAvg - priorAvg > 0.3) ratingTrend = 'improving';
    else if (priorAvg - recentAvg > 0.3) ratingTrend = 'declining';
  }

  // Dimensional scores
  const dimRows = await sql`
    SELECT
      AVG(accuracy_score)::float AS accuracy,
      AVG(helpfulness_score)::float AS helpfulness,
      AVG(speed_score)::float AS speed
    FROM agent_ratings
    WHERE agent_id = ${agentId}
      AND (accuracy_score IS NOT NULL OR helpfulness_score IS NOT NULL OR speed_score IS NOT NULL)
  `;
  const dim = dimRows[0] as Record<string, unknown>;

  // Feedback summary
  const feedbackRows = await sql`
    SELECT feedback, reason, COUNT(*)::int AS cnt
    FROM message_feedback
    WHERE agent_id = ${agentId}
    GROUP BY feedback, reason
    ORDER BY cnt DESC
  `;
  let positiveCount = 0;
  let negativeCount = 0;
  const positiveReasons: string[] = [];
  const negativeReasons: string[] = [];
  for (const row of feedbackRows as Array<Record<string, unknown>>) {
    const cnt = row.cnt as number;
    if (row.feedback === 'positive') {
      positiveCount += cnt;
      if (row.reason) positiveReasons.push(row.reason as string);
    } else {
      negativeCount += cnt;
      if (row.reason) negativeReasons.push(row.reason as string);
    }
  }

  // Usage stats
  const usageRows = await sql`
    SELECT
      COUNT(*)::int AS total_conversations,
      AVG(input_tokens + output_tokens)::int AS avg_tokens_per_run,
      AVG(duration_ms)::int AS avg_duration_ms
    FROM agent_events
    WHERE agent_id = ${agentId} AND event_type = 'run'
  `;
  const usage = usageRows[0] as Record<string, unknown>;

  const successRows = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'success')::int AS successes,
      COUNT(*)::int AS total
    FROM agent_events
    WHERE agent_id = ${agentId} AND event_type = 'run'
  `;
  const sr = successRows[0] as Record<string, unknown>;
  const total = (sr.total as number) || 1;
  const successRate = ((sr.successes as number) || 0) / total;

  return {
    overall_rating: rRow.rating_avg,
    rating_count: rRow.rating_count,
    rating_trend: ratingTrend,
    dimensional_scores: {
      accuracy: dim.accuracy ?? null,
      helpfulness: dim.helpfulness ?? null,
      speed: dim.speed ?? null,
    },
    feedback_summary: {
      positive_count: positiveCount,
      negative_count: negativeCount,
      top_positive_reasons: positiveReasons.slice(0, 3),
      top_negative_reasons: negativeReasons.slice(0, 3),
    },
    usage_stats: {
      total_conversations: usage.total_conversations ?? 0,
      avg_tokens_per_run: usage.avg_tokens_per_run ?? 0,
      avg_duration_ms: usage.avg_duration_ms ?? 0,
      success_rate: successRate,
    },
  };
}

export async function getCompactPerformanceInsight(agentId: string): Promise<string | null> {
  const rows = await sql`
    SELECT rating_sum, rating_count FROM agents WHERE id = ${agentId} LIMIT 1
  `;
  if (rows.length === 0) return null;
  const row = rows[0] as Record<string, unknown>;
  const ratingCount = row.rating_count as number;
  if (ratingCount === 0) return null;

  const ratingAvg = (row.rating_sum as number) / ratingCount;

  // Get top positive and negative feedback reasons
  const feedbackRows = await sql`
    SELECT feedback, reason, COUNT(*)::int AS cnt
    FROM message_feedback
    WHERE agent_id = ${agentId}
    GROUP BY feedback, reason
    ORDER BY cnt DESC
    LIMIT 4
  `;

  let topStrength = '';
  let topWeakness = '';
  for (const r of feedbackRows as Array<Record<string, unknown>>) {
    if (r.feedback === 'positive' && !topStrength && r.reason) {
      topStrength = r.reason as string;
    }
    if (r.feedback === 'negative' && !topWeakness && r.reason) {
      topWeakness = r.reason as string;
    }
  }

  let insight = `Rating: ${ratingAvg.toFixed(1)}/5.`;
  if (topStrength) insight += ` Users value: ${topStrength.replace(/_/g, ' ')}.`;
  if (topWeakness) insight += ` Improve: ${topWeakness.replace(/_/g, ' ')}.`;

  // Check for declining trend
  const recentRows = await sql`
    SELECT AVG(rating)::float AS recent_avg FROM agent_ratings
    WHERE agent_id = ${agentId} AND inserted_at > NOW() - INTERVAL '7 days'
  `;
  const priorRows = await sql`
    SELECT AVG(rating)::float AS prior_avg FROM agent_ratings
    WHERE agent_id = ${agentId}
      AND inserted_at > NOW() - INTERVAL '14 days'
      AND inserted_at <= NOW() - INTERVAL '7 days'
  `;
  const recentAvg = (recentRows[0] as Record<string, unknown>).recent_avg as number | null;
  const priorAvg = (priorRows[0] as Record<string, unknown>).prior_avg as number | null;

  if (recentAvg != null && priorAvg != null && priorAvg - recentAvg > 0.3) {
    // Find most common negative reason in last 7 days
    const recentNeg = await sql`
      SELECT reason, COUNT(*)::int AS cnt FROM message_feedback
      WHERE agent_id = ${agentId} AND feedback = 'negative' AND inserted_at > NOW() - INTERVAL '7 days'
      GROUP BY reason ORDER BY cnt DESC LIMIT 1
    `;
    if (recentNeg.length > 0) {
      const reason = (((recentNeg[0] as Record<string, unknown>).reason as string) ?? '').replace(
        /_/g,
        ' ',
      );
      insight += `\nRecent feedback trend: users report ${reason}. Address this.`;
    }
  }

  return insight;
}
