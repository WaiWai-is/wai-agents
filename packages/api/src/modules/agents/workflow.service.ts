import { randomUUID } from 'node:crypto';
import { sql } from '../../db/connection.js';
import { toISO } from '../../lib/utils.js';
import type {
  CreateEdgeInput,
  CreateStepInput,
  CreateWorkflowInput,
  RunWorkflowInput,
  UpdateStepInput,
  UpdateWorkflowInput,
} from './workflow.schema.js';

/* -------------------------------------------------------------------------- */
/*  Formatters                                                                */
/* -------------------------------------------------------------------------- */

function formatWorkflow(row: Record<string, unknown>) {
  return {
    id: row.id,
    agent_id: row.agent_id,
    creator_id: row.creator_id,
    name: row.name,
    description: row.description ?? null,
    status: row.status,
    trigger_config: row.trigger_config ?? null,
    max_concurrent_runs: row.max_concurrent_runs,
    metadata: row.metadata ?? {},
    created_at: toISO(row.inserted_at),
    updated_at: toISO(row.updated_at),
  };
}

function formatStep(row: Record<string, unknown>) {
  return {
    id: row.id,
    workflow_id: row.workflow_id,
    name: row.name,
    step_type: row.step_type,
    config: row.config ?? {},
    position: row.position,
    timeout_ms: row.timeout_ms,
    retry_config: row.retry_config ?? null,
    metadata: row.metadata ?? {},
    created_at: toISO(row.inserted_at),
    updated_at: toISO(row.updated_at),
  };
}

function formatEdge(row: Record<string, unknown>) {
  return {
    id: row.id,
    workflow_id: row.workflow_id,
    source_step_id: row.source_step_id,
    target_step_id: row.target_step_id,
    condition: row.condition ?? null,
    label: row.label ?? null,
    created_at: toISO(row.inserted_at),
  };
}

function formatRun(row: Record<string, unknown>) {
  return {
    id: row.id,
    workflow_id: row.workflow_id,
    agent_id: row.agent_id,
    user_id: row.user_id,
    conversation_id: row.conversation_id ?? null,
    status: row.status,
    input: row.input ?? {},
    result: row.result ?? null,
    error_message: row.error_message ?? null,
    total_duration_ms: row.total_duration_ms ?? null,
    started_at: toISO(row.started_at),
    completed_at: toISO(row.completed_at),
    created_at: toISO(row.inserted_at),
  };
}

function formatStepRun(row: Record<string, unknown>) {
  return {
    id: row.id,
    workflow_run_id: row.workflow_run_id,
    step_id: row.step_id,
    status: row.status,
    input: row.input ?? null,
    output: row.output ?? null,
    error_message: row.error_message ?? null,
    retry_count: row.retry_count,
    duration_ms: row.duration_ms ?? null,
    started_at: toISO(row.started_at),
    completed_at: toISO(row.completed_at),
    created_at: toISO(row.inserted_at),
  };
}

/* -------------------------------------------------------------------------- */
/*  Column constants                                                          */
/* -------------------------------------------------------------------------- */

const WORKFLOW_COLS = `id, agent_id, creator_id, name, description, status,
  trigger_config, max_concurrent_runs, metadata, inserted_at, updated_at`;

const STEP_COLS = `id, workflow_id, name, step_type, config, position,
  timeout_ms, retry_config, metadata, inserted_at, updated_at`;

const EDGE_COLS = `id, workflow_id, source_step_id, target_step_id,
  condition, label, inserted_at`;

const RUN_COLS = `id, workflow_id, agent_id, user_id, conversation_id,
  status, input, result, error_message, total_duration_ms,
  started_at, completed_at, inserted_at`;

const STEP_RUN_COLS = `id, workflow_run_id, step_id, status, input, output,
  error_message, retry_count, duration_ms, started_at, completed_at, inserted_at`;

/* -------------------------------------------------------------------------- */
/*  Ownership Checks                                                          */
/* -------------------------------------------------------------------------- */

async function assertWorkflowCreator(workflowId: string, userId: string): Promise<void> {
  const rows = await sql`
    SELECT w.id FROM agent_workflows w
    JOIN agents a ON a.id = w.agent_id
    WHERE w.id = ${workflowId} AND a.creator_id = ${userId}
    LIMIT 1
  `;
  if (rows.length === 0) {
    throw Object.assign(new Error('Workflow not found or access denied'), { code: 'NOT_FOUND' });
  }
}

async function assertAgentCreator(agentId: string, userId: string): Promise<void> {
  const rows = await sql`
    SELECT id FROM agents WHERE id = ${agentId} AND creator_id = ${userId} LIMIT 1
  `;
  if (rows.length === 0) {
    throw Object.assign(new Error('Agent not found or access denied'), { code: 'NOT_FOUND' });
  }
}

/* -------------------------------------------------------------------------- */
/*  Workflow CRUD                                                             */
/* -------------------------------------------------------------------------- */

export async function listWorkflows(agentId: string, userId: string) {
  await assertAgentCreator(agentId, userId);

  const rows = await sql`
    SELECT ${sql.unsafe(WORKFLOW_COLS)}
    FROM agent_workflows
    WHERE agent_id = ${agentId} AND creator_id = ${userId}
    ORDER BY inserted_at DESC
    LIMIT 200
  `;

  return rows.map((row) => formatWorkflow(row as Record<string, unknown>));
}

export async function createWorkflow(agentId: string, userId: string, input: CreateWorkflowInput) {
  await assertAgentCreator(agentId, userId);

  const workflowId = randomUUID();
  const now = new Date().toISOString();
  const triggerConfigJson = input.trigger_config ? JSON.stringify(input.trigger_config) : null;
  const metadataJson = input.metadata ? JSON.stringify(input.metadata) : '{}';
  const maxConcurrentRuns = input.max_concurrent_runs ?? 1;
  const status = input.status ?? 'draft';

  await sql`
    INSERT INTO agent_workflows (
      id, agent_id, creator_id, name, description, status,
      trigger_config, max_concurrent_runs, metadata,
      inserted_at, updated_at
    ) VALUES (
      ${workflowId}, ${agentId}, ${userId}, ${input.name},
      ${input.description ?? null}, ${status},
      ${triggerConfigJson}::jsonb, ${maxConcurrentRuns}, ${metadataJson}::jsonb,
      ${now}, ${now}
    )
  `;

  const rows = await sql.unsafe(`SELECT ${WORKFLOW_COLS} FROM agent_workflows WHERE id = $1`, [
    workflowId,
  ]);
  return formatWorkflow(rows[0] as Record<string, unknown>);
}

export async function getWorkflow(workflowId: string, userId: string) {
  await assertWorkflowCreator(workflowId, userId);

  const workflowRows = await sql.unsafe(
    `SELECT ${WORKFLOW_COLS} FROM agent_workflows WHERE id = $1`,
    [workflowId],
  );
  if (workflowRows.length === 0) {
    throw Object.assign(new Error('Workflow not found'), { code: 'NOT_FOUND' });
  }

  const stepRows = await sql.unsafe(
    `SELECT ${STEP_COLS} FROM workflow_steps WHERE workflow_id = $1 ORDER BY position ASC`,
    [workflowId],
  );

  const edgeRows = await sql.unsafe(
    `SELECT ${EDGE_COLS} FROM workflow_edges WHERE workflow_id = $1 ORDER BY inserted_at ASC`,
    [workflowId],
  );

  const workflow = formatWorkflow(workflowRows[0] as Record<string, unknown>);
  return {
    ...workflow,
    steps: stepRows.map((row) => formatStep(row as Record<string, unknown>)),
    edges: edgeRows.map((row) => formatEdge(row as Record<string, unknown>)),
  };
}

export async function updateWorkflow(
  workflowId: string,
  userId: string,
  updates: UpdateWorkflowInput,
) {
  await assertWorkflowCreator(workflowId, userId);

  // If activating, validate the workflow has at least 1 step and no cycles
  if (updates.status === 'active') {
    const stepRows = await sql`
      SELECT id FROM workflow_steps WHERE workflow_id = ${workflowId} LIMIT 1
    `;
    if (stepRows.length === 0) {
      throw Object.assign(new Error('Workflow must have at least one step to activate'), {
        code: 'BAD_REQUEST',
      });
    }
    await validateDAG(workflowId);
  }

  const hasName = updates.name !== undefined;
  const hasDescription = updates.description !== undefined;
  const hasStatus = updates.status !== undefined;
  const hasTriggerConfig = updates.trigger_config !== undefined;
  const hasMaxConcurrentRuns = updates.max_concurrent_runs !== undefined;
  const hasMetadata = updates.metadata !== undefined;

  const name: string | null = hasName ? (updates.name as string) : null;
  const description: string | null = hasDescription ? (updates.description ?? null) : null;
  const status: string | null = hasStatus ? (updates.status as string) : null;
  const triggerConfigJson: string | null = hasTriggerConfig
    ? updates.trigger_config
      ? JSON.stringify(updates.trigger_config)
      : null
    : null;
  const maxConcurrentRuns: number | null = hasMaxConcurrentRuns
    ? (updates.max_concurrent_runs as number)
    : null;
  const metadataJson: string | null = hasMetadata ? JSON.stringify(updates.metadata) : null;

  const rows = await sql`
    UPDATE agent_workflows SET
      name                = CASE WHEN ${hasName} THEN ${name} ELSE name END,
      description         = CASE WHEN ${hasDescription} THEN ${description} ELSE description END,
      status              = CASE WHEN ${hasStatus} THEN ${status} ELSE status END,
      trigger_config      = CASE WHEN ${hasTriggerConfig} THEN ${triggerConfigJson}::jsonb ELSE trigger_config END,
      max_concurrent_runs = CASE WHEN ${hasMaxConcurrentRuns} THEN ${maxConcurrentRuns} ELSE max_concurrent_runs END,
      metadata            = CASE WHEN ${hasMetadata} THEN ${metadataJson}::jsonb ELSE metadata END,
      updated_at          = NOW()
    WHERE id = ${workflowId}
    RETURNING ${sql.unsafe(WORKFLOW_COLS)}
  `;

  if (rows.length === 0) {
    throw Object.assign(new Error('Workflow not found'), { code: 'NOT_FOUND' });
  }

  return formatWorkflow(rows[0] as Record<string, unknown>);
}

export async function deleteWorkflow(workflowId: string, userId: string) {
  await assertWorkflowCreator(workflowId, userId);
  await sql`DELETE FROM agent_workflows WHERE id = ${workflowId}`;
}

/* -------------------------------------------------------------------------- */
/*  Step CRUD                                                                 */
/* -------------------------------------------------------------------------- */

export async function listSteps(workflowId: string, userId: string) {
  await assertWorkflowCreator(workflowId, userId);

  const rows = await sql.unsafe(
    `SELECT ${STEP_COLS} FROM workflow_steps WHERE workflow_id = $1 ORDER BY position ASC`,
    [workflowId],
  );

  return rows.map((row) => formatStep(row as Record<string, unknown>));
}

export async function createStep(workflowId: string, userId: string, input: CreateStepInput) {
  await assertWorkflowCreator(workflowId, userId);

  // Enforce unique step names within a workflow
  const existing = await sql`
    SELECT id FROM workflow_steps
    WHERE workflow_id = ${workflowId} AND name = ${input.name}
    LIMIT 1
  `;
  if (existing.length > 0) {
    throw Object.assign(new Error('Step name must be unique within the workflow'), {
      code: 'BAD_REQUEST',
    });
  }

  const stepId = randomUUID();
  const now = new Date().toISOString();
  const configJson = input.config ? JSON.stringify(input.config) : '{}';
  const retryConfigJson = input.retry_config ? JSON.stringify(input.retry_config) : null;
  const metadataJson = input.metadata ? JSON.stringify(input.metadata) : '{}';
  const position = input.position ?? 0;
  const timeoutMs = input.timeout_ms ?? 300000;

  await sql`
    INSERT INTO workflow_steps (
      id, workflow_id, name, step_type, config, position,
      timeout_ms, retry_config, metadata, inserted_at, updated_at
    ) VALUES (
      ${stepId}, ${workflowId}, ${input.name}, ${input.step_type},
      ${configJson}::jsonb, ${position}, ${timeoutMs},
      ${retryConfigJson}::jsonb, ${metadataJson}::jsonb,
      ${now}, ${now}
    )
  `;

  const rows = await sql.unsafe(`SELECT ${STEP_COLS} FROM workflow_steps WHERE id = $1`, [stepId]);
  return formatStep(rows[0] as Record<string, unknown>);
}

export async function updateStep(stepId: string, userId: string, updates: UpdateStepInput) {
  // Verify ownership via workflow
  const stepRows = await sql`
    SELECT ws.workflow_id FROM workflow_steps ws
    JOIN agent_workflows w ON w.id = ws.workflow_id
    JOIN agents a ON a.id = w.agent_id
    WHERE ws.id = ${stepId} AND a.creator_id = ${userId}
    LIMIT 1
  `;
  if (stepRows.length === 0) {
    throw Object.assign(new Error('Step not found or access denied'), { code: 'NOT_FOUND' });
  }

  const workflowId = (stepRows[0] as Record<string, unknown>).workflow_id as string;

  // Check unique name if updating name
  if (updates.name !== undefined) {
    const existing = await sql`
      SELECT id FROM workflow_steps
      WHERE workflow_id = ${workflowId} AND name = ${updates.name} AND id != ${stepId}
      LIMIT 1
    `;
    if (existing.length > 0) {
      throw Object.assign(new Error('Step name must be unique within the workflow'), {
        code: 'BAD_REQUEST',
      });
    }
  }

  const hasName = updates.name !== undefined;
  const hasStepType = updates.step_type !== undefined;
  const hasConfig = updates.config !== undefined;
  const hasPosition = updates.position !== undefined;
  const hasTimeoutMs = updates.timeout_ms !== undefined;
  const hasRetryConfig = updates.retry_config !== undefined;
  const hasMetadata = updates.metadata !== undefined;

  const name: string | null = hasName ? (updates.name as string) : null;
  const stepType: string | null = hasStepType ? (updates.step_type as string) : null;
  const configJson: string | null = hasConfig ? JSON.stringify(updates.config) : null;
  const position: number | null = hasPosition ? (updates.position as number) : null;
  const timeoutMs: number | null = hasTimeoutMs ? (updates.timeout_ms as number) : null;
  const retryConfigJson: string | null = hasRetryConfig
    ? updates.retry_config
      ? JSON.stringify(updates.retry_config)
      : null
    : null;
  const metadataJson: string | null = hasMetadata ? JSON.stringify(updates.metadata) : null;

  const rows = await sql`
    UPDATE workflow_steps SET
      name         = CASE WHEN ${hasName} THEN ${name} ELSE name END,
      step_type    = CASE WHEN ${hasStepType} THEN ${stepType} ELSE step_type END,
      config       = CASE WHEN ${hasConfig} THEN ${configJson}::jsonb ELSE config END,
      position     = CASE WHEN ${hasPosition} THEN ${position} ELSE position END,
      timeout_ms   = CASE WHEN ${hasTimeoutMs} THEN ${timeoutMs} ELSE timeout_ms END,
      retry_config = CASE WHEN ${hasRetryConfig} THEN ${retryConfigJson}::jsonb ELSE retry_config END,
      metadata     = CASE WHEN ${hasMetadata} THEN ${metadataJson}::jsonb ELSE metadata END,
      updated_at   = NOW()
    WHERE id = ${stepId}
    RETURNING ${sql.unsafe(STEP_COLS)}
  `;

  if (rows.length === 0) {
    throw Object.assign(new Error('Step not found'), { code: 'NOT_FOUND' });
  }

  return formatStep(rows[0] as Record<string, unknown>);
}

export async function deleteStep(stepId: string, userId: string) {
  const stepRows = await sql`
    SELECT ws.id FROM workflow_steps ws
    JOIN agent_workflows w ON w.id = ws.workflow_id
    JOIN agents a ON a.id = w.agent_id
    WHERE ws.id = ${stepId} AND a.creator_id = ${userId}
    LIMIT 1
  `;
  if (stepRows.length === 0) {
    throw Object.assign(new Error('Step not found or access denied'), { code: 'NOT_FOUND' });
  }

  await sql`DELETE FROM workflow_steps WHERE id = ${stepId}`;
}

/* -------------------------------------------------------------------------- */
/*  Edge CRUD                                                                 */
/* -------------------------------------------------------------------------- */

export async function listEdges(workflowId: string, userId: string) {
  await assertWorkflowCreator(workflowId, userId);

  const rows = await sql.unsafe(
    `SELECT ${EDGE_COLS} FROM workflow_edges WHERE workflow_id = $1 ORDER BY inserted_at ASC`,
    [workflowId],
  );

  return rows.map((row) => formatEdge(row as Record<string, unknown>));
}

export async function createEdge(workflowId: string, userId: string, input: CreateEdgeInput) {
  await assertWorkflowCreator(workflowId, userId);

  // Validate source step belongs to this workflow
  const sourceRows = await sql`
    SELECT id FROM workflow_steps
    WHERE id = ${input.source_step_id} AND workflow_id = ${workflowId}
    LIMIT 1
  `;
  if (sourceRows.length === 0) {
    throw Object.assign(new Error('Source step not found in this workflow'), {
      code: 'NOT_FOUND',
    });
  }

  // Validate target step belongs to this workflow
  const targetRows = await sql`
    SELECT id FROM workflow_steps
    WHERE id = ${input.target_step_id} AND workflow_id = ${workflowId}
    LIMIT 1
  `;
  if (targetRows.length === 0) {
    throw Object.assign(new Error('Target step not found in this workflow'), {
      code: 'NOT_FOUND',
    });
  }

  // Cannot create edge to self
  if (input.source_step_id === input.target_step_id) {
    throw Object.assign(new Error('Source and target steps must be different'), {
      code: 'BAD_REQUEST',
    });
  }

  const edgeId = randomUUID();
  const now = new Date().toISOString();
  const conditionJson = input.condition ? JSON.stringify(input.condition) : null;

  await sql`
    INSERT INTO workflow_edges (
      id, workflow_id, source_step_id, target_step_id,
      condition, label, inserted_at
    ) VALUES (
      ${edgeId}, ${workflowId}, ${input.source_step_id}, ${input.target_step_id},
      ${conditionJson}::jsonb, ${input.label ?? null}, ${now}
    )
  `;

  const rows = await sql.unsafe(`SELECT ${EDGE_COLS} FROM workflow_edges WHERE id = $1`, [edgeId]);
  return formatEdge(rows[0] as Record<string, unknown>);
}

export async function deleteEdge(edgeId: string, userId: string) {
  const edgeRows = await sql`
    SELECT we.id FROM workflow_edges we
    JOIN agent_workflows w ON w.id = we.workflow_id
    JOIN agents a ON a.id = w.agent_id
    WHERE we.id = ${edgeId} AND a.creator_id = ${userId}
    LIMIT 1
  `;
  if (edgeRows.length === 0) {
    throw Object.assign(new Error('Edge not found or access denied'), { code: 'NOT_FOUND' });
  }

  await sql`DELETE FROM workflow_edges WHERE id = ${edgeId}`;
}

/* -------------------------------------------------------------------------- */
/*  DAG Validation (Kahn's Algorithm)                                         */
/* -------------------------------------------------------------------------- */

export async function validateDAG(workflowId: string): Promise<void> {
  const stepRows = await sql`
    SELECT id FROM workflow_steps WHERE workflow_id = ${workflowId}
  `;
  const edgeRows = await sql`
    SELECT source_step_id, target_step_id FROM workflow_edges WHERE workflow_id = ${workflowId}
  `;

  const stepIds = new Set(stepRows.map((r) => (r as Record<string, unknown>).id as string));
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const id of stepIds) {
    inDegree.set(id, 0);
    adjacency.set(id, []);
  }

  for (const row of edgeRows) {
    const r = row as Record<string, unknown>;
    const src = r.source_step_id as string;
    const tgt = r.target_step_id as string;
    adjacency.get(src)?.push(tgt);
    inDegree.set(tgt, (inDegree.get(tgt) ?? 0) + 1);
  }

  // Find all nodes with in-degree 0 (entry points)
  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  if (queue.length === 0 && stepIds.size > 0) {
    throw Object.assign(new Error('Workflow has no entry point (all steps have incoming edges)'), {
      code: 'BAD_REQUEST',
    });
  }

  let visited = 0;
  while (queue.length > 0) {
    const node = queue.shift() as string;
    visited++;
    for (const neighbor of adjacency.get(node) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  if (visited !== stepIds.size) {
    throw Object.assign(new Error('Workflow contains a cycle'), { code: 'BAD_REQUEST' });
  }
}

/* -------------------------------------------------------------------------- */
/*  Run Operations                                                            */
/* -------------------------------------------------------------------------- */

export async function executeWorkflow(
  workflowId: string,
  agentId: string,
  userId: string,
  input: RunWorkflowInput,
) {
  await assertWorkflowCreator(workflowId, userId);

  // Verify workflow is active
  const workflowRows = await sql`
    SELECT status, max_concurrent_runs FROM agent_workflows WHERE id = ${workflowId} LIMIT 1
  `;
  if (workflowRows.length === 0) {
    throw Object.assign(new Error('Workflow not found'), { code: 'NOT_FOUND' });
  }

  const workflow = workflowRows[0] as Record<string, unknown>;
  if (workflow.status !== 'active') {
    throw Object.assign(new Error('Workflow must be active to run'), { code: 'BAD_REQUEST' });
  }

  // Check concurrent run limit
  const maxRuns = (workflow.max_concurrent_runs as number) ?? 1;
  const activeRuns = await sql`
    SELECT COUNT(*)::int AS count FROM workflow_runs
    WHERE workflow_id = ${workflowId} AND status IN ('pending', 'running')
  `;
  const activeCount = (activeRuns[0] as Record<string, unknown>).count as number;
  if (activeCount >= maxRuns) {
    throw Object.assign(new Error('Maximum concurrent runs reached'), { code: 'BAD_REQUEST' });
  }

  const runId = randomUUID();
  const now = new Date().toISOString();
  const inputJson = input.input ? JSON.stringify(input.input) : '{}';

  await sql`
    INSERT INTO workflow_runs (
      id, workflow_id, agent_id, user_id, conversation_id,
      status, input, started_at, inserted_at
    ) VALUES (
      ${runId}, ${workflowId}, ${agentId}, ${userId},
      ${input.conversation_id ?? null},
      'pending', ${inputJson}::jsonb, ${now}, ${now}
    )
  `;

  const rows = await sql.unsafe(`SELECT ${RUN_COLS} FROM workflow_runs WHERE id = $1`, [runId]);

  // Emit Socket.IO event
  try {
    const { emitWorkflowEvent } = await import('../../ws/emitter.js');
    emitWorkflowEvent(userId, {
      type: 'workflow:run_started',
      workflow_id: workflowId,
      run_id: runId,
      agent_id: agentId,
    });
  } catch {
    // Socket.IO may not be initialized in tests
  }

  return formatRun(rows[0] as Record<string, unknown>);
}

export async function listRuns(workflowId: string, userId: string) {
  await assertWorkflowCreator(workflowId, userId);

  const rows = await sql.unsafe(
    `SELECT ${RUN_COLS} FROM workflow_runs WHERE workflow_id = $1 ORDER BY inserted_at DESC LIMIT 200`,
    [workflowId],
  );

  return rows.map((row) => formatRun(row as Record<string, unknown>));
}

export async function getRun(runId: string, userId: string) {
  const rows = await sql.unsafe(`SELECT ${RUN_COLS} FROM workflow_runs WHERE id = $1`, [runId]);
  if (rows.length === 0) {
    throw Object.assign(new Error('Run not found'), { code: 'NOT_FOUND' });
  }

  const run = rows[0] as Record<string, unknown>;

  // Verify ownership
  const workflowId = run.workflow_id as string;
  await assertWorkflowCreator(workflowId, userId);

  // Get step runs
  const stepRunRows = await sql.unsafe(
    `SELECT ${STEP_RUN_COLS} FROM workflow_step_runs WHERE workflow_run_id = $1 ORDER BY inserted_at ASC`,
    [runId],
  );

  return {
    ...formatRun(run),
    step_runs: stepRunRows.map((row) => formatStepRun(row as Record<string, unknown>)),
  };
}

export async function cancelRun(runId: string, userId: string) {
  const rows = await sql.unsafe(`SELECT ${RUN_COLS} FROM workflow_runs WHERE id = $1`, [runId]);
  if (rows.length === 0) {
    throw Object.assign(new Error('Run not found'), { code: 'NOT_FOUND' });
  }

  const run = rows[0] as Record<string, unknown>;
  await assertWorkflowCreator(run.workflow_id as string, userId);

  if (run.status !== 'pending' && run.status !== 'running') {
    throw Object.assign(new Error(`Cannot cancel run with status '${run.status}'`), {
      code: 'BAD_REQUEST',
    });
  }

  const updated = await sql`
    UPDATE workflow_runs SET
      status = 'cancelled',
      completed_at = NOW()
    WHERE id = ${runId}
    RETURNING ${sql.unsafe(RUN_COLS)}
  `;

  return formatRun(updated[0] as Record<string, unknown>);
}
