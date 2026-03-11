import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { TriggerConditionGroup } from '@wai-agents/shared';
import { sql } from '../../db/connection.js';
import { toISO } from '../../lib/utils.js';
import type { CreateTriggerInput, UpdateTriggerInput } from './trigger.schema.js';
import { evaluateCondition } from './trigger-condition.js';

function formatTrigger(row: Record<string, unknown>) {
  return {
    id: row.id,
    agent_id: row.agent_id,
    creator_id: row.creator_id,
    name: row.name,
    trigger_type: row.trigger_type,
    token: row.token,
    hmac_secret: row.hmac_secret,
    condition_filter: row.condition_filter,
    message_template: row.message_template,
    cron_expression: row.cron_expression,
    enabled: row.enabled,
    last_fired_at: toISO(row.last_fired_at),
    fire_count: row.fire_count,
    metadata: row.metadata,
    created_at: toISO(row.inserted_at),
    updated_at: toISO(row.updated_at),
  };
}

const SELECT_COLS = `id, agent_id, creator_id, name, trigger_type, token, hmac_secret,
  condition_filter, message_template, cron_expression, enabled,
  last_fired_at, fire_count, metadata, inserted_at, updated_at`;

async function assertAgentCreator(agentId: string, userId: string): Promise<void> {
  const rows = await sql`
    SELECT id FROM agents WHERE id = ${agentId} AND creator_id = ${userId} LIMIT 1
  `;
  if (rows.length === 0) {
    throw Object.assign(new Error('Agent not found or access denied'), { code: 'NOT_FOUND' });
  }
}

async function assertTriggerOwner(triggerId: string, userId: string): Promise<void> {
  const rows = await sql`
    SELECT id FROM agent_triggers WHERE id = ${triggerId} AND creator_id = ${userId} LIMIT 1
  `;
  if (rows.length === 0) {
    throw Object.assign(new Error('Trigger not found or access denied'), { code: 'NOT_FOUND' });
  }
}

export async function listTriggers(agentId: string, userId: string) {
  await assertAgentCreator(agentId, userId);

  const rows = await sql.unsafe(
    `SELECT ${SELECT_COLS} FROM agent_triggers
     WHERE agent_id = $1 AND creator_id = $2
     ORDER BY inserted_at DESC`,
    [agentId, userId],
  );
  return rows.map((row) => formatTrigger(row as Record<string, unknown>));
}

export async function createTrigger(agentId: string, userId: string, input: CreateTriggerInput) {
  await assertAgentCreator(agentId, userId);

  const triggerId = randomUUID();
  const token = randomBytes(32).toString('hex');
  const now = new Date().toISOString();
  const conditionFilterJson = input.condition_filter
    ? JSON.stringify(input.condition_filter)
    : null;
  const metadataJson = input.metadata ? JSON.stringify(input.metadata) : '{}';

  await sql`
    INSERT INTO agent_triggers (
      id, agent_id, creator_id, name, trigger_type, token, hmac_secret,
      condition_filter, message_template, cron_expression, enabled,
      metadata, inserted_at, updated_at
    ) VALUES (
      ${triggerId}, ${agentId}, ${userId}, ${input.name}, ${input.trigger_type},
      ${token}, ${input.hmac_secret ?? null},
      ${conditionFilterJson}::jsonb, ${input.message_template ?? null},
      ${input.cron_expression ?? null}, ${input.enabled ?? true},
      ${metadataJson}::jsonb, ${now}, ${now}
    )
  `;

  const rows = await sql.unsafe(`SELECT ${SELECT_COLS} FROM agent_triggers WHERE id = $1`, [
    triggerId,
  ]);
  return formatTrigger(rows[0] as Record<string, unknown>);
}

export async function getTrigger(triggerId: string, userId: string) {
  const rows = await sql.unsafe(
    `SELECT ${SELECT_COLS} FROM agent_triggers
     WHERE id = $1 AND creator_id = $2 LIMIT 1`,
    [triggerId, userId],
  );
  if (rows.length === 0) {
    throw Object.assign(new Error('Trigger not found'), { code: 'NOT_FOUND' });
  }
  return formatTrigger(rows[0] as Record<string, unknown>);
}

export async function updateTrigger(
  triggerId: string,
  userId: string,
  updates: UpdateTriggerInput,
) {
  await assertTriggerOwner(triggerId, userId);

  const hasName = updates.name !== undefined;
  const hasHmac = updates.hmac_secret !== undefined;
  const hasCondition = updates.condition_filter !== undefined;
  const hasTemplate = updates.message_template !== undefined;
  const hasCron = updates.cron_expression !== undefined;
  const hasEnabled = updates.enabled !== undefined;
  const hasMeta = updates.metadata !== undefined;

  const name: string | null = hasName ? (updates.name as string) : null;
  const hmacSecret: string | null = hasHmac ? (updates.hmac_secret ?? null) : null;
  const conditionFilter: string | null = hasCondition
    ? updates.condition_filter === null
      ? null
      : JSON.stringify(updates.condition_filter)
    : null;
  const messageTemplate: string | null = hasTemplate ? (updates.message_template ?? null) : null;
  const cronExpression: string | null = hasCron ? (updates.cron_expression ?? null) : null;
  const enabled: boolean = hasEnabled ? (updates.enabled ?? true) : true;
  const metadataJson: string | null = hasMeta ? JSON.stringify(updates.metadata) : null;

  const rows = await sql`
    UPDATE agent_triggers SET
      name             = CASE WHEN ${hasName} THEN ${name} ELSE name END,
      hmac_secret      = CASE WHEN ${hasHmac} THEN ${hmacSecret} ELSE hmac_secret END,
      condition_filter = CASE WHEN ${hasCondition} THEN ${conditionFilter}::jsonb ELSE condition_filter END,
      message_template = CASE WHEN ${hasTemplate} THEN ${messageTemplate} ELSE message_template END,
      cron_expression  = CASE WHEN ${hasCron} THEN ${cronExpression} ELSE cron_expression END,
      enabled          = CASE WHEN ${hasEnabled} THEN ${enabled} ELSE enabled END,
      metadata         = CASE WHEN ${hasMeta} THEN ${metadataJson}::jsonb ELSE metadata END,
      updated_at       = NOW()
    WHERE id = ${triggerId}
    RETURNING ${sql.unsafe(SELECT_COLS)}
  `;

  if (rows.length === 0) {
    throw Object.assign(new Error('Trigger not found'), { code: 'NOT_FOUND' });
  }

  return formatTrigger(rows[0] as Record<string, unknown>);
}

export async function deleteTrigger(triggerId: string, userId: string) {
  await assertTriggerOwner(triggerId, userId);
  await sql`DELETE FROM agent_triggers WHERE id = ${triggerId}`;
}

export interface FireTriggerResult {
  fired: boolean;
  conversation_id: string | null;
  reason?: string;
}

export async function fireTrigger(
  token: string,
  payload: Record<string, unknown>,
  hmacSignature?: string,
): Promise<FireTriggerResult> {
  // 1. Look up trigger by token
  const rows = await sql.unsafe(
    `SELECT ${SELECT_COLS}, agent_id FROM agent_triggers WHERE token = $1 LIMIT 1`,
    [token],
  );
  if (rows.length === 0) {
    throw Object.assign(new Error('Trigger not found'), { code: 'NOT_FOUND' });
  }

  const trigger = rows[0] as Record<string, unknown>;

  if (!trigger.enabled) {
    return { fired: false, conversation_id: null, reason: 'Trigger is disabled' };
  }

  // 2. Verify HMAC if configured
  if (trigger.hmac_secret) {
    if (!hmacSignature) {
      throw Object.assign(new Error('HMAC signature required'), { code: 'UNAUTHORIZED' });
    }

    const expected = createHmac('sha256', trigger.hmac_secret as string)
      .update(JSON.stringify(payload))
      .digest('hex');

    const expectedBuf = Buffer.from(expected, 'hex');
    const receivedBuf = Buffer.from(hmacSignature, 'hex');

    if (expectedBuf.length !== receivedBuf.length || !timingSafeEqual(expectedBuf, receivedBuf)) {
      throw Object.assign(new Error('Invalid HMAC signature'), { code: 'UNAUTHORIZED' });
    }
  }

  // 3. Evaluate condition filter if present
  if (trigger.condition_filter) {
    const conditionGroup = trigger.condition_filter as TriggerConditionGroup;
    if (!evaluateCondition(payload, conditionGroup)) {
      return { fired: false, conversation_id: null, reason: 'Condition filter did not match' };
    }
  }

  // 4. Create a conversation and run the agent loop
  const triggerId = trigger.id as string;
  const agentId = trigger.agent_id as string;
  const creatorId = trigger.creator_id as string;
  const triggerName = trigger.name as string;
  const conversationId = randomUUID();
  const now = new Date().toISOString();

  await sql`
    INSERT INTO conversations (id, type, title, creator_id, agent_id, metadata, inserted_at, updated_at)
    VALUES (${conversationId}, 'agent', ${`Trigger: ${triggerName}`}, ${creatorId}, ${agentId}, '{}', ${now}, ${now})
  `;

  await sql`
    INSERT INTO conversation_members (id, conversation_id, user_id, role, joined_at)
    VALUES (${randomUUID()}, ${conversationId}, ${creatorId}, 'owner', ${now})
  `;

  // Build message from template or fallback to payload dump
  let message: string;
  if (trigger.message_template) {
    message = (trigger.message_template as string).replace(
      /\{\{(\w+(?:\.\w+)*)\}\}/g,
      (_match, path: string) => {
        let current: unknown = payload;
        for (const key of path.split('.')) {
          if (current === null || current === undefined || typeof current !== 'object') {
            return '';
          }
          current = (current as Record<string, unknown>)[key];
        }
        return current !== undefined && current !== null ? String(current) : '';
      },
    );
  } else {
    message = JSON.stringify(payload);
  }

  // Save the user message
  const messageId = randomUUID();
  const contentJson = JSON.stringify([{ type: 'text', text: message }]);
  await sql`
    INSERT INTO messages (id, conversation_id, sender_id, sender_type, type, content, metadata, created_at)
    VALUES (${messageId}, ${conversationId}, ${creatorId}, 'human', 'text', ${contentJson}::jsonb, '{}', ${now})
  `;

  // Run agent loop asynchronously (fire-and-forget)
  const { runAgentLoop } = await import('./loop.js');
  runAgentLoop({
    agentId,
    conversationId,
    userId: creatorId,
    message,
  }).catch((err) => {
    console.error(`Trigger ${triggerId} agent loop failed:`, (err as Error).message);
  });

  // 5. Update lastFiredAt and fireCount
  await sql`
    UPDATE agent_triggers SET
      last_fired_at = ${now},
      fire_count = fire_count + 1,
      updated_at = NOW()
    WHERE id = ${triggerId}
  `;

  // 6. Emit trigger:fired via Socket.IO (best-effort)
  try {
    const { emitAgentEvent } = await import('../../ws/emitter.js');
    emitAgentEvent(conversationId, {
      type: 'run_started',
      run_id: triggerId,
      agent_id: agentId,
    });
  } catch {
    // Socket.IO may not be initialized in tests or worker contexts
  }

  return { fired: true, conversation_id: conversationId };
}
