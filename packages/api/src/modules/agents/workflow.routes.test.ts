/* eslint-disable @typescript-eslint/no-explicit-any */
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { workflowRoutes } from './workflow.routes.js';

// Mock DB connection
vi.mock('../../db/connection.js', () => ({
  sql: Object.assign(vi.fn(), { unsafe: vi.fn() }),
  db: {},
}));

// Mock workflow service
vi.mock('./workflow.service.js', () => ({
  listWorkflows: vi.fn(),
  createWorkflow: vi.fn(),
  getWorkflow: vi.fn(),
  updateWorkflow: vi.fn(),
  deleteWorkflow: vi.fn(),
  listSteps: vi.fn(),
  createStep: vi.fn(),
  updateStep: vi.fn(),
  deleteStep: vi.fn(),
  listEdges: vi.fn(),
  createEdge: vi.fn(),
  deleteEdge: vi.fn(),
  executeWorkflow: vi.fn(),
  listRuns: vi.fn(),
  getRun: vi.fn(),
  cancelRun: vi.fn(),
}));

async function getTokenHeader(): Promise<Record<string, string>> {
  const { generateTokens } = await import('../auth/auth.service.js');
  const { access_token } = await generateTokens('user-uuid', 'user');
  return { Authorization: `Bearer ${access_token}` };
}

function buildApp() {
  const app = new Hono();
  app.route('/agents', workflowRoutes);
  return app;
}

async function request(
  app: ReturnType<typeof buildApp>,
  method: string,
  path: string,
  opts: { body?: unknown; headers?: Record<string, string> } = {},
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...opts.headers,
  };
  const req = new Request(`http://localhost${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const res = await app.fetch(req);
  const json = (await res.json().catch(() => null)) as any;
  return { status: res.status, body: json };
}

let app: ReturnType<typeof buildApp>;

beforeEach(() => {
  vi.clearAllMocks();
  app = buildApp();
});

const AGENT_ID = '880e8400-e29b-41d4-a716-446655440003';
const WORKFLOW_ID = '990e8400-e29b-41d4-a716-446655440004';
const STEP_ID = 'aa0e8400-e29b-41d4-a716-446655440005';
const STEP_ID_2 = 'ab0e8400-e29b-41d4-a716-446655440015';
const EDGE_ID = 'bb0e8400-e29b-41d4-a716-446655440006';
const RUN_ID = 'cc0e8400-e29b-41d4-a716-446655440007';

/* -------------------------------------------------------------------------- */
/*  Authentication                                                             */
/* -------------------------------------------------------------------------- */

describe('Workflow Routes — Authentication', () => {
  it('GET /agents/:agentId/workflows returns 401 without auth', async () => {
    const { status, body } = await request(app, 'GET', `/agents/${AGENT_ID}/workflows`);
    expect(status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('POST /agents/:agentId/workflows returns 401 without auth', async () => {
    const { status } = await request(app, 'POST', `/agents/${AGENT_ID}/workflows`, {
      body: { name: 'Test' },
    });
    expect(status).toBe(401);
  });

  it('GET /agents/:agentId/workflows/:workflowId returns 401 without auth', async () => {
    const { status } = await request(app, 'GET', `/agents/${AGENT_ID}/workflows/${WORKFLOW_ID}`);
    expect(status).toBe(401);
  });

  it('PATCH returns 401 without auth', async () => {
    const { status } = await request(app, 'PATCH', `/agents/${AGENT_ID}/workflows/${WORKFLOW_ID}`, {
      body: { name: 'Updated' },
    });
    expect(status).toBe(401);
  });

  it('DELETE returns 401 without auth', async () => {
    const { status } = await request(app, 'DELETE', `/agents/${AGENT_ID}/workflows/${WORKFLOW_ID}`);
    expect(status).toBe(401);
  });

  it('rejects invalid auth token with 401', async () => {
    const { status } = await request(app, 'GET', `/agents/${AGENT_ID}/workflows`, {
      headers: { Authorization: 'Bearer invalid.token.here' },
    });
    expect(status).toBe(401);
  });
});

/* -------------------------------------------------------------------------- */
/*  GET /agents/:agentId/workflows                                            */
/* -------------------------------------------------------------------------- */

describe('GET /agents/:agentId/workflows', () => {
  it('returns 200 with workflows list', async () => {
    const { listWorkflows } = await import('./workflow.service.js');
    vi.mocked(listWorkflows).mockResolvedValueOnce([
      { id: WORKFLOW_ID, name: 'Test', status: 'draft' },
    ] as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'GET', `/agents/${AGENT_ID}/workflows`, {
      headers: authHeaders,
    });

    expect(status).toBe(200);
    expect(body.workflows).toHaveLength(1);
  });

  it('returns 200 with empty list', async () => {
    const { listWorkflows } = await import('./workflow.service.js');
    vi.mocked(listWorkflows).mockResolvedValueOnce([]);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'GET', `/agents/${AGENT_ID}/workflows`, {
      headers: authHeaders,
    });

    expect(status).toBe(200);
    expect(body.workflows).toHaveLength(0);
  });

  it('returns 404 when agent not found', async () => {
    const { listWorkflows } = await import('./workflow.service.js');
    vi.mocked(listWorkflows).mockRejectedValueOnce(
      Object.assign(new Error('Agent not found'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'GET', `/agents/${AGENT_ID}/workflows`, {
      headers: authHeaders,
    });

    expect(status).toBe(404);
    expect(body.error).toBe('Not found');
  });
});

/* -------------------------------------------------------------------------- */
/*  POST /agents/:agentId/workflows                                           */
/* -------------------------------------------------------------------------- */

describe('POST /agents/:agentId/workflows', () => {
  it('returns 201 with created workflow', async () => {
    const { createWorkflow } = await import('./workflow.service.js');
    vi.mocked(createWorkflow).mockResolvedValueOnce({
      id: WORKFLOW_ID,
      name: 'My Workflow',
      status: 'draft',
    } as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'POST', `/agents/${AGENT_ID}/workflows`, {
      headers: authHeaders,
      body: { name: 'My Workflow' },
    });

    expect(status).toBe(201);
    expect(body.workflow.id).toBe(WORKFLOW_ID);
  });

  it('returns 422 for missing name', async () => {
    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'POST', `/agents/${AGENT_ID}/workflows`, {
      headers: authHeaders,
      body: {},
    });

    expect(status).toBe(422);
    expect(body.error).toBe('Validation error');
  });

  it('returns 422 for empty name', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'POST', `/agents/${AGENT_ID}/workflows`, {
      headers: authHeaders,
      body: { name: '' },
    });

    expect(status).toBe(422);
  });

  it('returns 404 when agent not found from service', async () => {
    const { createWorkflow } = await import('./workflow.service.js');
    vi.mocked(createWorkflow).mockRejectedValueOnce(
      Object.assign(new Error('Agent not found'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(app, 'POST', `/agents/${AGENT_ID}/workflows`, {
      headers: authHeaders,
      body: { name: 'Test' },
    });

    expect(status).toBe(404);
    expect(body.error).toBe('Not found');
  });

  it('strips HTML from name', async () => {
    const { createWorkflow } = await import('./workflow.service.js');
    vi.mocked(createWorkflow).mockResolvedValueOnce({
      id: WORKFLOW_ID,
      name: 'alert(1)',
    } as any);

    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'POST', `/agents/${AGENT_ID}/workflows`, {
      headers: authHeaders,
      body: { name: '<script>alert(1)</script>' },
    });

    expect(status).toBe(201);
    expect(vi.mocked(createWorkflow)).toHaveBeenCalledWith(
      AGENT_ID,
      expect.any(String),
      expect.objectContaining({ name: 'alert(1)' }),
    );
  });

  it('returns 422 for invalid JSON body', async () => {
    const authHeaders = await getTokenHeader();
    const res = await app.fetch(
      new Request(`http://localhost/agents/${AGENT_ID}/workflows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: 'not-json',
      }),
    );
    expect(res.status).toBe(422);
  });
});

/* -------------------------------------------------------------------------- */
/*  GET /agents/:agentId/workflows/:workflowId                                */
/* -------------------------------------------------------------------------- */

describe('GET /agents/:agentId/workflows/:workflowId', () => {
  it('returns 200 with workflow data including steps and edges', async () => {
    const { getWorkflow } = await import('./workflow.service.js');
    vi.mocked(getWorkflow).mockResolvedValueOnce({
      id: WORKFLOW_ID,
      name: 'Test',
      steps: [{ id: STEP_ID }],
      edges: [],
    } as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'GET',
      `/agents/${AGENT_ID}/workflows/${WORKFLOW_ID}`,
      { headers: authHeaders },
    );

    expect(status).toBe(200);
    expect(body.workflow.id).toBe(WORKFLOW_ID);
    expect(body.workflow.steps).toHaveLength(1);
  });

  it('returns 404 for non-existent workflow', async () => {
    const { getWorkflow } = await import('./workflow.service.js');
    vi.mocked(getWorkflow).mockRejectedValueOnce(
      Object.assign(new Error('Workflow not found'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'GET',
      `/agents/${AGENT_ID}/workflows/nonexistent`,
      { headers: authHeaders },
    );

    expect(status).toBe(404);
    expect(body.error).toBe('Not found');
  });
});

/* -------------------------------------------------------------------------- */
/*  PATCH /agents/:agentId/workflows/:workflowId                              */
/* -------------------------------------------------------------------------- */

describe('PATCH /agents/:agentId/workflows/:workflowId', () => {
  it('returns 200 with updated workflow', async () => {
    const { updateWorkflow } = await import('./workflow.service.js');
    vi.mocked(updateWorkflow).mockResolvedValueOnce({
      id: WORKFLOW_ID,
      name: 'Updated',
    } as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'PATCH',
      `/agents/${AGENT_ID}/workflows/${WORKFLOW_ID}`,
      {
        headers: authHeaders,
        body: { name: 'Updated' },
      },
    );

    expect(status).toBe(200);
    expect(body.workflow.name).toBe('Updated');
  });

  it('returns 400 for bad request from service', async () => {
    const { updateWorkflow } = await import('./workflow.service.js');
    vi.mocked(updateWorkflow).mockRejectedValueOnce(
      Object.assign(new Error('No steps'), { code: 'BAD_REQUEST' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'PATCH',
      `/agents/${AGENT_ID}/workflows/${WORKFLOW_ID}`,
      {
        headers: authHeaders,
        body: { status: 'active' },
      },
    );

    expect(status).toBe(400);
    expect(body.error).toBe('Bad request');
  });

  it('returns 422 for invalid status', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'PATCH', `/agents/${AGENT_ID}/workflows/${WORKFLOW_ID}`, {
      headers: authHeaders,
      body: { status: 'invalid' },
    });

    expect(status).toBe(422);
  });
});

/* -------------------------------------------------------------------------- */
/*  DELETE /agents/:agentId/workflows/:workflowId                              */
/* -------------------------------------------------------------------------- */

describe('DELETE /agents/:agentId/workflows/:workflowId', () => {
  it('returns 200 with ok: true', async () => {
    const { deleteWorkflow } = await import('./workflow.service.js');
    vi.mocked(deleteWorkflow).mockResolvedValueOnce(undefined);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'DELETE',
      `/agents/${AGENT_ID}/workflows/${WORKFLOW_ID}`,
      { headers: authHeaders },
    );

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it('returns 404 for non-existent workflow', async () => {
    const { deleteWorkflow } = await import('./workflow.service.js');
    vi.mocked(deleteWorkflow).mockRejectedValueOnce(
      Object.assign(new Error('Workflow not found'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status } = await request(app, 'DELETE', `/agents/${AGENT_ID}/workflows/nonexistent`, {
      headers: authHeaders,
    });

    expect(status).toBe(404);
  });
});

/* -------------------------------------------------------------------------- */
/*  POST /agents/:agentId/workflows/:workflowId/steps                         */
/* -------------------------------------------------------------------------- */

describe('POST /agents/:agentId/workflows/:workflowId/steps', () => {
  it('returns 201 with created step', async () => {
    const { createStep } = await import('./workflow.service.js');
    vi.mocked(createStep).mockResolvedValueOnce({
      id: STEP_ID,
      name: 'Step 1',
      step_type: 'prompt',
    } as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'POST',
      `/agents/${AGENT_ID}/workflows/${WORKFLOW_ID}/steps`,
      {
        headers: authHeaders,
        body: { name: 'Step 1', step_type: 'prompt' },
      },
    );

    expect(status).toBe(201);
    expect(body.step.id).toBe(STEP_ID);
  });

  it('returns 422 for missing step_type', async () => {
    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'POST',
      `/agents/${AGENT_ID}/workflows/${WORKFLOW_ID}/steps`,
      {
        headers: authHeaders,
        body: { name: 'Step 1' },
      },
    );

    expect(status).toBe(422);
    expect(body.error).toBe('Validation error');
  });

  it('returns 400 for duplicate step name', async () => {
    const { createStep } = await import('./workflow.service.js');
    vi.mocked(createStep).mockRejectedValueOnce(
      Object.assign(new Error('Step name must be unique'), { code: 'BAD_REQUEST' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'POST',
      `/agents/${AGENT_ID}/workflows/${WORKFLOW_ID}/steps`,
      {
        headers: authHeaders,
        body: { name: 'Step 1', step_type: 'prompt' },
      },
    );

    expect(status).toBe(400);
    expect(body.error).toBe('Bad request');
  });
});

/* -------------------------------------------------------------------------- */
/*  PATCH /agents/:agentId/workflows/:workflowId/steps/:stepId                */
/* -------------------------------------------------------------------------- */

describe('PATCH /agents/:agentId/workflows/:workflowId/steps/:stepId', () => {
  it('returns 200 with updated step', async () => {
    const { updateStep } = await import('./workflow.service.js');
    vi.mocked(updateStep).mockResolvedValueOnce({
      id: STEP_ID,
      name: 'Renamed',
    } as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'PATCH',
      `/agents/${AGENT_ID}/workflows/${WORKFLOW_ID}/steps/${STEP_ID}`,
      {
        headers: authHeaders,
        body: { name: 'Renamed' },
      },
    );

    expect(status).toBe(200);
    expect(body.step.name).toBe('Renamed');
  });

  it('returns 404 for non-existent step', async () => {
    const { updateStep } = await import('./workflow.service.js');
    vi.mocked(updateStep).mockRejectedValueOnce(
      Object.assign(new Error('Step not found'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status } = await request(
      app,
      'PATCH',
      `/agents/${AGENT_ID}/workflows/${WORKFLOW_ID}/steps/nonexistent`,
      {
        headers: authHeaders,
        body: { name: 'Test' },
      },
    );

    expect(status).toBe(404);
  });
});

/* -------------------------------------------------------------------------- */
/*  DELETE /agents/:agentId/workflows/:workflowId/steps/:stepId               */
/* -------------------------------------------------------------------------- */

describe('DELETE /agents/:agentId/workflows/:workflowId/steps/:stepId', () => {
  it('returns 200 with ok: true', async () => {
    const { deleteStep } = await import('./workflow.service.js');
    vi.mocked(deleteStep).mockResolvedValueOnce(undefined);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'DELETE',
      `/agents/${AGENT_ID}/workflows/${WORKFLOW_ID}/steps/${STEP_ID}`,
      { headers: authHeaders },
    );

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it('returns 404 for non-existent step', async () => {
    const { deleteStep } = await import('./workflow.service.js');
    vi.mocked(deleteStep).mockRejectedValueOnce(
      Object.assign(new Error('Step not found'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status } = await request(
      app,
      'DELETE',
      `/agents/${AGENT_ID}/workflows/${WORKFLOW_ID}/steps/nonexistent`,
      { headers: authHeaders },
    );

    expect(status).toBe(404);
  });
});

/* -------------------------------------------------------------------------- */
/*  POST /agents/:agentId/workflows/:workflowId/edges                         */
/* -------------------------------------------------------------------------- */

describe('POST /agents/:agentId/workflows/:workflowId/edges', () => {
  it('returns 201 with created edge', async () => {
    const { createEdge } = await import('./workflow.service.js');
    vi.mocked(createEdge).mockResolvedValueOnce({
      id: EDGE_ID,
      source_step_id: STEP_ID,
      target_step_id: STEP_ID_2,
    } as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'POST',
      `/agents/${AGENT_ID}/workflows/${WORKFLOW_ID}/edges`,
      {
        headers: authHeaders,
        body: { source_step_id: STEP_ID, target_step_id: STEP_ID_2 },
      },
    );

    expect(status).toBe(201);
    expect(body.edge.id).toBe(EDGE_ID);
  });

  it('returns 422 for non-UUID source_step_id', async () => {
    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'POST',
      `/agents/${AGENT_ID}/workflows/${WORKFLOW_ID}/edges`,
      {
        headers: authHeaders,
        body: { source_step_id: 'not-uuid', target_step_id: STEP_ID_2 },
      },
    );

    expect(status).toBe(422);
    expect(body.error).toBe('Validation error');
  });

  it('returns 400 for self-referencing edge', async () => {
    const { createEdge } = await import('./workflow.service.js');
    vi.mocked(createEdge).mockRejectedValueOnce(
      Object.assign(new Error('Source and target must differ'), { code: 'BAD_REQUEST' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'POST',
      `/agents/${AGENT_ID}/workflows/${WORKFLOW_ID}/edges`,
      {
        headers: authHeaders,
        body: { source_step_id: STEP_ID, target_step_id: STEP_ID },
      },
    );

    expect(status).toBe(400);
    expect(body.error).toBe('Bad request');
  });

  it('returns 404 when source step not found', async () => {
    const { createEdge } = await import('./workflow.service.js');
    vi.mocked(createEdge).mockRejectedValueOnce(
      Object.assign(new Error('Source step not found'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status } = await request(
      app,
      'POST',
      `/agents/${AGENT_ID}/workflows/${WORKFLOW_ID}/edges`,
      {
        headers: authHeaders,
        body: { source_step_id: STEP_ID, target_step_id: STEP_ID_2 },
      },
    );

    expect(status).toBe(404);
  });
});

/* -------------------------------------------------------------------------- */
/*  DELETE /agents/:agentId/workflows/:workflowId/edges/:edgeId               */
/* -------------------------------------------------------------------------- */

describe('DELETE /agents/:agentId/workflows/:workflowId/edges/:edgeId', () => {
  it('returns 200 with ok: true', async () => {
    const { deleteEdge } = await import('./workflow.service.js');
    vi.mocked(deleteEdge).mockResolvedValueOnce(undefined);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'DELETE',
      `/agents/${AGENT_ID}/workflows/${WORKFLOW_ID}/edges/${EDGE_ID}`,
      { headers: authHeaders },
    );

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it('returns 404 for non-existent edge', async () => {
    const { deleteEdge } = await import('./workflow.service.js');
    vi.mocked(deleteEdge).mockRejectedValueOnce(
      Object.assign(new Error('Edge not found'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status } = await request(
      app,
      'DELETE',
      `/agents/${AGENT_ID}/workflows/${WORKFLOW_ID}/edges/nonexistent`,
      { headers: authHeaders },
    );

    expect(status).toBe(404);
  });
});

/* -------------------------------------------------------------------------- */
/*  POST /agents/:agentId/workflows/:workflowId/run                           */
/* -------------------------------------------------------------------------- */

describe('POST /agents/:agentId/workflows/:workflowId/run', () => {
  it('returns 202 with created run', async () => {
    const { executeWorkflow } = await import('./workflow.service.js');
    vi.mocked(executeWorkflow).mockResolvedValueOnce({
      id: RUN_ID,
      status: 'pending',
      workflow_id: WORKFLOW_ID,
    } as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'POST',
      `/agents/${AGENT_ID}/workflows/${WORKFLOW_ID}/run`,
      {
        headers: authHeaders,
        body: { input: { key: 'value' } },
      },
    );

    expect(status).toBe(202);
    expect(body.run.id).toBe(RUN_ID);
  });

  it('returns 202 with empty body', async () => {
    const { executeWorkflow } = await import('./workflow.service.js');
    vi.mocked(executeWorkflow).mockResolvedValueOnce({
      id: RUN_ID,
      status: 'pending',
    } as any);

    const authHeaders = await getTokenHeader();
    const { status } = await request(
      app,
      'POST',
      `/agents/${AGENT_ID}/workflows/${WORKFLOW_ID}/run`,
      { headers: authHeaders },
    );

    expect(status).toBe(202);
  });

  it('returns 400 when workflow is not active', async () => {
    const { executeWorkflow } = await import('./workflow.service.js');
    vi.mocked(executeWorkflow).mockRejectedValueOnce(
      Object.assign(new Error('Workflow must be active'), { code: 'BAD_REQUEST' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'POST',
      `/agents/${AGENT_ID}/workflows/${WORKFLOW_ID}/run`,
      { headers: authHeaders, body: {} },
    );

    expect(status).toBe(400);
    expect(body.error).toBe('Bad request');
  });

  it('returns 422 for invalid conversation_id', async () => {
    const authHeaders = await getTokenHeader();
    const { status } = await request(
      app,
      'POST',
      `/agents/${AGENT_ID}/workflows/${WORKFLOW_ID}/run`,
      {
        headers: authHeaders,
        body: { conversation_id: 'not-a-uuid' },
      },
    );

    expect(status).toBe(422);
  });
});

/* -------------------------------------------------------------------------- */
/*  GET /agents/:agentId/workflows/:workflowId/runs                           */
/* -------------------------------------------------------------------------- */

describe('GET /agents/:agentId/workflows/:workflowId/runs', () => {
  it('returns 200 with runs list', async () => {
    const { listRuns } = await import('./workflow.service.js');
    vi.mocked(listRuns).mockResolvedValueOnce([{ id: RUN_ID, status: 'completed' }] as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'GET',
      `/agents/${AGENT_ID}/workflows/${WORKFLOW_ID}/runs`,
      { headers: authHeaders },
    );

    expect(status).toBe(200);
    expect(body.runs).toHaveLength(1);
  });

  it('returns 404 when workflow not found', async () => {
    const { listRuns } = await import('./workflow.service.js');
    vi.mocked(listRuns).mockRejectedValueOnce(
      Object.assign(new Error('Workflow not found'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status } = await request(
      app,
      'GET',
      `/agents/${AGENT_ID}/workflows/${WORKFLOW_ID}/runs`,
      { headers: authHeaders },
    );

    expect(status).toBe(404);
  });
});

/* -------------------------------------------------------------------------- */
/*  GET /agents/:agentId/workflows/:workflowId/runs/:runId                    */
/* -------------------------------------------------------------------------- */

describe('GET /agents/:agentId/workflows/:workflowId/runs/:runId', () => {
  it('returns 200 with run data', async () => {
    const { getRun } = await import('./workflow.service.js');
    vi.mocked(getRun).mockResolvedValueOnce({
      id: RUN_ID,
      status: 'completed',
      step_runs: [],
    } as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'GET',
      `/agents/${AGENT_ID}/workflows/${WORKFLOW_ID}/runs/${RUN_ID}`,
      { headers: authHeaders },
    );

    expect(status).toBe(200);
    expect(body.run.id).toBe(RUN_ID);
  });

  it('returns 404 for non-existent run', async () => {
    const { getRun } = await import('./workflow.service.js');
    vi.mocked(getRun).mockRejectedValueOnce(
      Object.assign(new Error('Run not found'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status } = await request(
      app,
      'GET',
      `/agents/${AGENT_ID}/workflows/${WORKFLOW_ID}/runs/nonexistent`,
      { headers: authHeaders },
    );

    expect(status).toBe(404);
  });
});

/* -------------------------------------------------------------------------- */
/*  POST /agents/:agentId/workflows/:workflowId/runs/:runId/cancel            */
/* -------------------------------------------------------------------------- */

describe('POST /agents/:agentId/workflows/:workflowId/runs/:runId/cancel', () => {
  it('returns 200 with cancelled run', async () => {
    const { cancelRun } = await import('./workflow.service.js');
    vi.mocked(cancelRun).mockResolvedValueOnce({
      id: RUN_ID,
      status: 'cancelled',
    } as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'POST',
      `/agents/${AGENT_ID}/workflows/${WORKFLOW_ID}/runs/${RUN_ID}/cancel`,
      { headers: authHeaders },
    );

    expect(status).toBe(200);
    expect(body.run.status).toBe('cancelled');
  });

  it('returns 404 for non-existent run', async () => {
    const { cancelRun } = await import('./workflow.service.js');
    vi.mocked(cancelRun).mockRejectedValueOnce(
      Object.assign(new Error('Run not found'), { code: 'NOT_FOUND' }),
    );

    const authHeaders = await getTokenHeader();
    const { status } = await request(
      app,
      'POST',
      `/agents/${AGENT_ID}/workflows/${WORKFLOW_ID}/runs/nonexistent/cancel`,
      { headers: authHeaders },
    );

    expect(status).toBe(404);
  });

  it('returns 400 for already completed run', async () => {
    const { cancelRun } = await import('./workflow.service.js');
    vi.mocked(cancelRun).mockRejectedValueOnce(
      Object.assign(new Error('Cannot cancel'), { code: 'BAD_REQUEST' }),
    );

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'POST',
      `/agents/${AGENT_ID}/workflows/${WORKFLOW_ID}/runs/${RUN_ID}/cancel`,
      { headers: authHeaders },
    );

    expect(status).toBe(400);
    expect(body.error).toBe('Bad request');
  });
});

/* -------------------------------------------------------------------------- */
/*  GET /agents/:agentId/workflows/:workflowId/steps                          */
/* -------------------------------------------------------------------------- */

describe('GET /agents/:agentId/workflows/:workflowId/steps', () => {
  it('returns 200 with steps list', async () => {
    const { listSteps } = await import('./workflow.service.js');
    vi.mocked(listSteps).mockResolvedValueOnce([{ id: STEP_ID, name: 'Step 1' }] as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'GET',
      `/agents/${AGENT_ID}/workflows/${WORKFLOW_ID}/steps`,
      { headers: authHeaders },
    );

    expect(status).toBe(200);
    expect(body.steps).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */
/*  GET /agents/:agentId/workflows/:workflowId/edges                          */
/* -------------------------------------------------------------------------- */

describe('GET /agents/:agentId/workflows/:workflowId/edges', () => {
  it('returns 200 with edges list', async () => {
    const { listEdges } = await import('./workflow.service.js');
    vi.mocked(listEdges).mockResolvedValueOnce([
      { id: EDGE_ID, source_step_id: STEP_ID, target_step_id: STEP_ID_2 },
    ] as any);

    const authHeaders = await getTokenHeader();
    const { status, body } = await request(
      app,
      'GET',
      `/agents/${AGENT_ID}/workflows/${WORKFLOW_ID}/edges`,
      { headers: authHeaders },
    );

    expect(status).toBe(200);
    expect(body.edges).toHaveLength(1);
  });
});
