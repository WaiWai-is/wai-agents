/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock DB connection
vi.mock('../../db/connection.js', () => {
  const sqlFn = Object.assign(vi.fn(), {
    unsafe: vi.fn(),
    begin: vi.fn(async (cb: (tx: any) => Promise<any>) => {
      return cb(sqlFn);
    }),
  });
  return { sql: sqlFn, db: {} };
});

// Mock emitter
vi.mock('../../ws/emitter.js', () => ({
  emitWorkflowEvent: vi.fn(),
}));

const USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const AGENT_ID = '660e8400-e29b-41d4-a716-446655440001';
const WORKFLOW_ID = '770e8400-e29b-41d4-a716-446655440002';
const STEP_ID_1 = '880e8400-e29b-41d4-a716-446655440003';
const STEP_ID_2 = '990e8400-e29b-41d4-a716-446655440004';
const EDGE_ID = 'aa0e8400-e29b-41d4-a716-446655440005';
const RUN_ID = 'bb0e8400-e29b-41d4-a716-446655440006';

function makeWorkflowRow(overrides: Record<string, unknown> = {}) {
  return {
    id: WORKFLOW_ID,
    agent_id: AGENT_ID,
    creator_id: USER_ID,
    name: 'Test Workflow',
    description: null,
    status: 'draft',
    trigger_config: null,
    max_concurrent_runs: 1,
    metadata: {},
    inserted_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeStepRow(overrides: Record<string, unknown> = {}) {
  return {
    id: STEP_ID_1,
    workflow_id: WORKFLOW_ID,
    name: 'Step 1',
    step_type: 'prompt',
    config: {},
    position: 0,
    timeout_ms: 300000,
    retry_config: null,
    metadata: {},
    inserted_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeEdgeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: EDGE_ID,
    workflow_id: WORKFLOW_ID,
    source_step_id: STEP_ID_1,
    target_step_id: STEP_ID_2,
    condition: null,
    label: null,
    inserted_at: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeRunRow(overrides: Record<string, unknown> = {}) {
  return {
    id: RUN_ID,
    workflow_id: WORKFLOW_ID,
    agent_id: AGENT_ID,
    user_id: USER_ID,
    conversation_id: null,
    status: 'pending',
    input: {},
    result: null,
    error_message: null,
    total_duration_ms: null,
    started_at: new Date('2026-01-01'),
    completed_at: null,
    inserted_at: new Date('2026-01-01'),
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/*  Workflow CRUD                                                             */
/* -------------------------------------------------------------------------- */

describe('workflow.service — listWorkflows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns workflows for an agent', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // assertAgentCreator
    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    // list query
    sqlMock.mockResolvedValueOnce([makeWorkflowRow()] as any);

    const { listWorkflows } = await import('./workflow.service.js');
    const results = await listWorkflows(AGENT_ID, USER_ID);

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Test Workflow');
    expect(results[0].created_at).toBe(new Date('2026-01-01').toISOString());
  });

  it('returns empty array when no workflows exist', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { listWorkflows } = await import('./workflow.service.js');
    const results = await listWorkflows(AGENT_ID, USER_ID);

    expect(results).toHaveLength(0);
  });

  it('throws NOT_FOUND when user does not own the agent', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { listWorkflows } = await import('./workflow.service.js');
    await expect(listWorkflows(AGENT_ID, 'other-user')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('workflow.service — createWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a workflow with valid input', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // assertAgentCreator
    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    // INSERT
    sqlMock.mockResolvedValueOnce([] as any);
    // SELECT (via sql.unsafe)
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeWorkflowRow()] as any);

    const { createWorkflow } = await import('./workflow.service.js');
    const result = await createWorkflow(AGENT_ID, USER_ID, { name: 'Test Workflow' });

    expect(result.name).toBe('Test Workflow');
    expect(result.status).toBe('draft');
  });

  it('throws NOT_FOUND when agent does not exist', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { createWorkflow } = await import('./workflow.service.js');
    await expect(createWorkflow('nonexistent', USER_ID, { name: 'Test' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('creates a workflow with metadata', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      makeWorkflowRow({ metadata: { version: 2 } }),
    ] as any);

    const { createWorkflow } = await import('./workflow.service.js');
    const result = await createWorkflow(AGENT_ID, USER_ID, {
      name: 'Test',
      metadata: { version: 2 },
    });

    expect(result.metadata).toEqual({ version: 2 });
  });
});

describe('workflow.service — getWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns workflow with steps and edges', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // assertWorkflowCreator
    sqlMock.mockResolvedValueOnce([{ id: WORKFLOW_ID }] as any);
    // SELECT workflow
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeWorkflowRow()] as any);
    // SELECT steps
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeStepRow()] as any);
    // SELECT edges
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeEdgeRow()] as any);

    const { getWorkflow } = await import('./workflow.service.js');
    const result = await getWorkflow(WORKFLOW_ID, USER_ID);

    expect(result.name).toBe('Test Workflow');
    expect(result.steps).toHaveLength(1);
    expect(result.edges).toHaveLength(1);
  });

  it('throws NOT_FOUND when workflow does not exist', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { getWorkflow } = await import('./workflow.service.js');
    await expect(getWorkflow('nonexistent', USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('workflow.service — updateWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates a workflow', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // assertWorkflowCreator
    sqlMock.mockResolvedValueOnce([{ id: WORKFLOW_ID }] as any);
    // UPDATE
    sqlMock.mockResolvedValueOnce([makeWorkflowRow({ name: 'Updated' })] as any);

    const { updateWorkflow } = await import('./workflow.service.js');
    const result = await updateWorkflow(WORKFLOW_ID, USER_ID, { name: 'Updated' });

    expect(result.name).toBe('Updated');
  });

  it('throws NOT_FOUND when workflow does not exist', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { updateWorkflow } = await import('./workflow.service.js');
    await expect(updateWorkflow('nonexistent', USER_ID, { name: 'Test' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws BAD_REQUEST when activating workflow with no steps', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // assertWorkflowCreator
    sqlMock.mockResolvedValueOnce([{ id: WORKFLOW_ID }] as any);
    // check steps — empty
    sqlMock.mockResolvedValueOnce([] as any);

    const { updateWorkflow } = await import('./workflow.service.js');
    await expect(updateWorkflow(WORKFLOW_ID, USER_ID, { status: 'active' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });
});

describe('workflow.service — deleteWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes a workflow', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // assertWorkflowCreator
    sqlMock.mockResolvedValueOnce([{ id: WORKFLOW_ID }] as any);
    // DELETE
    sqlMock.mockResolvedValueOnce([] as any);

    const { deleteWorkflow } = await import('./workflow.service.js');
    await expect(deleteWorkflow(WORKFLOW_ID, USER_ID)).resolves.toBeUndefined();
  });

  it('throws NOT_FOUND for non-existent workflow', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { deleteWorkflow } = await import('./workflow.service.js');
    await expect(deleteWorkflow('nonexistent', USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  Step CRUD                                                                 */
/* -------------------------------------------------------------------------- */

describe('workflow.service — createStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a step with valid input', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // assertWorkflowCreator
    sqlMock.mockResolvedValueOnce([{ id: WORKFLOW_ID }] as any);
    // check unique name
    sqlMock.mockResolvedValueOnce([] as any);
    // INSERT
    sqlMock.mockResolvedValueOnce([] as any);
    // SELECT (via sql.unsafe)
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeStepRow()] as any);

    const { createStep } = await import('./workflow.service.js');
    const result = await createStep(WORKFLOW_ID, USER_ID, {
      name: 'Step 1',
      step_type: 'prompt',
    });

    expect(result.name).toBe('Step 1');
    expect(result.step_type).toBe('prompt');
  });

  it('throws BAD_REQUEST when step name is not unique', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // assertWorkflowCreator
    sqlMock.mockResolvedValueOnce([{ id: WORKFLOW_ID }] as any);
    // check unique name — exists
    sqlMock.mockResolvedValueOnce([{ id: STEP_ID_1 }] as any);

    const { createStep } = await import('./workflow.service.js');
    await expect(
      createStep(WORKFLOW_ID, USER_ID, { name: 'Step 1', step_type: 'prompt' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('throws NOT_FOUND when workflow does not exist', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { createStep } = await import('./workflow.service.js');
    await expect(
      createStep('nonexistent', USER_ID, { name: 'Step 1', step_type: 'prompt' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('workflow.service — updateStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates a step', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // verify ownership
    sqlMock.mockResolvedValueOnce([{ workflow_id: WORKFLOW_ID }] as any);
    // check unique name — no conflict
    sqlMock.mockResolvedValueOnce([] as any);
    // UPDATE
    sqlMock.mockResolvedValueOnce([makeStepRow({ name: 'Renamed' })] as any);

    const { updateStep } = await import('./workflow.service.js');
    const result = await updateStep(STEP_ID_1, USER_ID, { name: 'Renamed' });

    expect(result.name).toBe('Renamed');
  });

  it('throws NOT_FOUND when step does not exist', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { updateStep } = await import('./workflow.service.js');
    await expect(updateStep('nonexistent', USER_ID, { name: 'Renamed' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws BAD_REQUEST for duplicate name on update', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // verify ownership
    sqlMock.mockResolvedValueOnce([{ workflow_id: WORKFLOW_ID }] as any);
    // check unique name — exists
    sqlMock.mockResolvedValueOnce([{ id: STEP_ID_2 }] as any);

    const { updateStep } = await import('./workflow.service.js');
    await expect(updateStep(STEP_ID_1, USER_ID, { name: 'Duplicate' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });
});

describe('workflow.service — deleteStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes a step', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // verify ownership
    sqlMock.mockResolvedValueOnce([{ id: STEP_ID_1 }] as any);
    // DELETE
    sqlMock.mockResolvedValueOnce([] as any);

    const { deleteStep } = await import('./workflow.service.js');
    await expect(deleteStep(STEP_ID_1, USER_ID)).resolves.toBeUndefined();
  });

  it('throws NOT_FOUND when step does not exist', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { deleteStep } = await import('./workflow.service.js');
    await expect(deleteStep('nonexistent', USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  Edge CRUD                                                                 */
/* -------------------------------------------------------------------------- */

describe('workflow.service — createEdge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates an edge with valid input', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // assertWorkflowCreator
    sqlMock.mockResolvedValueOnce([{ id: WORKFLOW_ID }] as any);
    // validate source step
    sqlMock.mockResolvedValueOnce([{ id: STEP_ID_1 }] as any);
    // validate target step
    sqlMock.mockResolvedValueOnce([{ id: STEP_ID_2 }] as any);
    // INSERT
    sqlMock.mockResolvedValueOnce([] as any);
    // SELECT (via sql.unsafe)
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeEdgeRow()] as any);

    const { createEdge } = await import('./workflow.service.js');
    const result = await createEdge(WORKFLOW_ID, USER_ID, {
      source_step_id: STEP_ID_1,
      target_step_id: STEP_ID_2,
    });

    expect(result.source_step_id).toBe(STEP_ID_1);
    expect(result.target_step_id).toBe(STEP_ID_2);
  });

  it('throws NOT_FOUND when source step does not exist', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // assertWorkflowCreator
    sqlMock.mockResolvedValueOnce([{ id: WORKFLOW_ID }] as any);
    // source step not found
    sqlMock.mockResolvedValueOnce([] as any);

    const { createEdge } = await import('./workflow.service.js');
    await expect(
      createEdge(WORKFLOW_ID, USER_ID, {
        source_step_id: 'nonexistent',
        target_step_id: STEP_ID_2,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws NOT_FOUND when target step does not exist', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // assertWorkflowCreator
    sqlMock.mockResolvedValueOnce([{ id: WORKFLOW_ID }] as any);
    // source step found
    sqlMock.mockResolvedValueOnce([{ id: STEP_ID_1 }] as any);
    // target step not found
    sqlMock.mockResolvedValueOnce([] as any);

    const { createEdge } = await import('./workflow.service.js');
    await expect(
      createEdge(WORKFLOW_ID, USER_ID, {
        source_step_id: STEP_ID_1,
        target_step_id: 'nonexistent',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws BAD_REQUEST for self-referencing edge', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // assertWorkflowCreator
    sqlMock.mockResolvedValueOnce([{ id: WORKFLOW_ID }] as any);
    // source step
    sqlMock.mockResolvedValueOnce([{ id: STEP_ID_1 }] as any);
    // target step
    sqlMock.mockResolvedValueOnce([{ id: STEP_ID_1 }] as any);

    const { createEdge } = await import('./workflow.service.js');
    await expect(
      createEdge(WORKFLOW_ID, USER_ID, {
        source_step_id: STEP_ID_1,
        target_step_id: STEP_ID_1,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('workflow.service — deleteEdge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes an edge', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // verify ownership
    sqlMock.mockResolvedValueOnce([{ id: EDGE_ID }] as any);
    // DELETE
    sqlMock.mockResolvedValueOnce([] as any);

    const { deleteEdge } = await import('./workflow.service.js');
    await expect(deleteEdge(EDGE_ID, USER_ID)).resolves.toBeUndefined();
  });

  it('throws NOT_FOUND when edge does not exist', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { deleteEdge } = await import('./workflow.service.js');
    await expect(deleteEdge('nonexistent', USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  DAG Validation                                                            */
/* -------------------------------------------------------------------------- */

describe('workflow.service — validateDAG', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates a simple linear DAG', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // steps
    sqlMock.mockResolvedValueOnce([{ id: STEP_ID_1 }, { id: STEP_ID_2 }] as any);
    // edges
    sqlMock.mockResolvedValueOnce([
      { source_step_id: STEP_ID_1, target_step_id: STEP_ID_2 },
    ] as any);

    const { validateDAG } = await import('./workflow.service.js');
    await expect(validateDAG(WORKFLOW_ID)).resolves.toBeUndefined();
  });

  it('throws BAD_REQUEST for a cycle', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // steps
    sqlMock.mockResolvedValueOnce([{ id: STEP_ID_1 }, { id: STEP_ID_2 }] as any);
    // edges: cycle A -> B -> A
    sqlMock.mockResolvedValueOnce([
      { source_step_id: STEP_ID_1, target_step_id: STEP_ID_2 },
      { source_step_id: STEP_ID_2, target_step_id: STEP_ID_1 },
    ] as any);

    const { validateDAG } = await import('./workflow.service.js');
    await expect(validateDAG(WORKFLOW_ID)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('throws BAD_REQUEST when no entry point exists', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    const stepC = 'cc0e8400-e29b-41d4-a716-446655440007';
    // steps: 3-node cycle
    sqlMock.mockResolvedValueOnce([{ id: STEP_ID_1 }, { id: STEP_ID_2 }, { id: stepC }] as any);
    // edges: cycle A -> B -> C -> A
    sqlMock.mockResolvedValueOnce([
      { source_step_id: STEP_ID_1, target_step_id: STEP_ID_2 },
      { source_step_id: STEP_ID_2, target_step_id: stepC },
      { source_step_id: stepC, target_step_id: STEP_ID_1 },
    ] as any);

    const { validateDAG } = await import('./workflow.service.js');
    await expect(validateDAG(WORKFLOW_ID)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('validates a DAG with no edges (isolated nodes)', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // steps
    sqlMock.mockResolvedValueOnce([{ id: STEP_ID_1 }, { id: STEP_ID_2 }] as any);
    // no edges
    sqlMock.mockResolvedValueOnce([] as any);

    const { validateDAG } = await import('./workflow.service.js');
    await expect(validateDAG(WORKFLOW_ID)).resolves.toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/*  Run Operations                                                            */
/* -------------------------------------------------------------------------- */

describe('workflow.service — executeWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a workflow run', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // assertWorkflowCreator
    sqlMock.mockResolvedValueOnce([{ id: WORKFLOW_ID }] as any);
    // get workflow status
    sqlMock.mockResolvedValueOnce([{ status: 'active', max_concurrent_runs: 1 }] as any);
    // check active runs count
    sqlMock.mockResolvedValueOnce([{ count: 0 }] as any);
    // INSERT
    sqlMock.mockResolvedValueOnce([] as any);
    // SELECT (via sql.unsafe)
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeRunRow()] as any);

    const { executeWorkflow } = await import('./workflow.service.js');
    const result = await executeWorkflow(WORKFLOW_ID, AGENT_ID, USER_ID, {});

    expect(result.status).toBe('pending');
    expect(result.workflow_id).toBe(WORKFLOW_ID);
  });

  it('throws BAD_REQUEST when workflow is not active', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: WORKFLOW_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ status: 'draft', max_concurrent_runs: 1 }] as any);

    const { executeWorkflow } = await import('./workflow.service.js');
    await expect(executeWorkflow(WORKFLOW_ID, AGENT_ID, USER_ID, {})).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('throws BAD_REQUEST when max concurrent runs reached', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: WORKFLOW_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ status: 'active', max_concurrent_runs: 1 }] as any);
    sqlMock.mockResolvedValueOnce([{ count: 1 }] as any);

    const { executeWorkflow } = await import('./workflow.service.js');
    await expect(executeWorkflow(WORKFLOW_ID, AGENT_ID, USER_ID, {})).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('emits workflow:run_started event', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: WORKFLOW_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ status: 'active', max_concurrent_runs: 5 }] as any);
    sqlMock.mockResolvedValueOnce([{ count: 0 }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeRunRow()] as any);

    const { executeWorkflow } = await import('./workflow.service.js');
    await executeWorkflow(WORKFLOW_ID, AGENT_ID, USER_ID, {});

    const { emitWorkflowEvent } = await import('../../ws/emitter.js');
    expect(emitWorkflowEvent).toHaveBeenCalledWith(USER_ID, {
      type: 'workflow:run_started',
      workflow_id: WORKFLOW_ID,
      run_id: expect.any(String),
      agent_id: AGENT_ID,
    });
  });
});

describe('workflow.service — cancelRun', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cancels a pending run', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // SELECT run
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeRunRow({ status: 'pending' })] as any);
    // assertWorkflowCreator
    sqlMock.mockResolvedValueOnce([{ id: WORKFLOW_ID }] as any);
    // UPDATE
    sqlMock.mockResolvedValueOnce([makeRunRow({ status: 'cancelled' })] as any);

    const { cancelRun } = await import('./workflow.service.js');
    const result = await cancelRun(RUN_ID, USER_ID);

    expect(result.status).toBe('cancelled');
  });

  it('throws NOT_FOUND for non-existent run', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql.unsafe).mockResolvedValueOnce([] as any);

    const { cancelRun } = await import('./workflow.service.js');
    await expect(cancelRun('nonexistent', USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws BAD_REQUEST when run is already completed', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeRunRow({ status: 'completed' })] as any);
    // assertWorkflowCreator
    sqlMock.mockResolvedValueOnce([{ id: WORKFLOW_ID }] as any);

    const { cancelRun } = await import('./workflow.service.js');
    await expect(cancelRun(RUN_ID, USER_ID)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });
});

describe('workflow.service — getRun', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a run with step_runs', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // SELECT run
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeRunRow()] as any);
    // assertWorkflowCreator
    sqlMock.mockResolvedValueOnce([{ id: WORKFLOW_ID }] as any);
    // SELECT step_runs
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      {
        id: 'sr-1',
        workflow_run_id: RUN_ID,
        step_id: STEP_ID_1,
        status: 'completed',
        input: null,
        output: { result: 'ok' },
        error_message: null,
        retry_count: 0,
        duration_ms: 150,
        started_at: new Date('2026-01-01'),
        completed_at: new Date('2026-01-01'),
        inserted_at: new Date('2026-01-01'),
      },
    ] as any);

    const { getRun } = await import('./workflow.service.js');
    const result = await getRun(RUN_ID, USER_ID);

    expect(result.id).toBe(RUN_ID);
    expect(result.step_runs).toHaveLength(1);
    expect(result.step_runs[0].status).toBe('completed');
  });

  it('throws NOT_FOUND for non-existent run', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql.unsafe).mockResolvedValueOnce([] as any);

    const { getRun } = await import('./workflow.service.js');
    await expect(getRun('nonexistent', USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
