import { Hono } from 'hono';
import { authMiddleware } from '../auth/auth.middleware.js';
import {
  CreateEdgeSchema,
  CreateStepSchema,
  CreateWorkflowSchema,
  RunWorkflowSchema,
  UpdateStepSchema,
  UpdateWorkflowSchema,
} from './workflow.schema.js';
import {
  cancelRun,
  createEdge,
  createStep,
  createWorkflow,
  deleteEdge,
  deleteStep,
  deleteWorkflow,
  executeWorkflow,
  getRun,
  getWorkflow,
  listEdges,
  listRuns,
  listSteps,
  listWorkflows,
  updateStep,
  updateWorkflow,
} from './workflow.service.js';

export const workflowRoutes = new Hono();

// ---------- Workflow CRUD ----------

// GET /agents/:agentId/workflows — list workflows for an agent
workflowRoutes.get('/:agentId/workflows', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const agentId = c.req.param('agentId');
  try {
    const workflows = await listWorkflows(agentId, userId);
    return c.json({ workflows }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    throw err;
  }
});

// POST /agents/:agentId/workflows — create workflow
workflowRoutes.post('/:agentId/workflows', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const agentId = c.req.param('agentId');
  const body = await c.req.json().catch(() => null);
  const parsed = CreateWorkflowSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation error', details: parsed.error.flatten() }, 422);
  }
  try {
    const workflow = await createWorkflow(agentId, userId, parsed.data);
    return c.json({ workflow }, 201);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    if (e.code === 'BAD_REQUEST') return c.json({ error: 'Bad request', message: e.message }, 400);
    throw err;
  }
});

// GET /agents/:agentId/workflows/:workflowId — get workflow (includes steps and edges)
workflowRoutes.get('/:agentId/workflows/:workflowId', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const workflowId = c.req.param('workflowId');
  try {
    const workflow = await getWorkflow(workflowId, userId);
    return c.json({ workflow }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    throw err;
  }
});

// PATCH /agents/:agentId/workflows/:workflowId — update workflow
workflowRoutes.patch('/:agentId/workflows/:workflowId', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const workflowId = c.req.param('workflowId');
  const body = await c.req.json().catch(() => null);
  const parsed = UpdateWorkflowSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation error', details: parsed.error.flatten() }, 422);
  }
  try {
    const workflow = await updateWorkflow(workflowId, userId, parsed.data);
    return c.json({ workflow }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    if (e.code === 'BAD_REQUEST') return c.json({ error: 'Bad request', message: e.message }, 400);
    throw err;
  }
});

// DELETE /agents/:agentId/workflows/:workflowId — delete workflow
workflowRoutes.delete('/:agentId/workflows/:workflowId', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const workflowId = c.req.param('workflowId');
  try {
    await deleteWorkflow(workflowId, userId);
    return c.json({ ok: true }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    throw err;
  }
});

// ---------- Step CRUD ----------

// GET /agents/:agentId/workflows/:workflowId/steps — list steps
workflowRoutes.get('/:agentId/workflows/:workflowId/steps', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const workflowId = c.req.param('workflowId');
  try {
    const steps = await listSteps(workflowId, userId);
    return c.json({ steps }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    throw err;
  }
});

// POST /agents/:agentId/workflows/:workflowId/steps — create step
workflowRoutes.post('/:agentId/workflows/:workflowId/steps', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const workflowId = c.req.param('workflowId');
  const body = await c.req.json().catch(() => null);
  const parsed = CreateStepSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation error', details: parsed.error.flatten() }, 422);
  }
  try {
    const step = await createStep(workflowId, userId, parsed.data);
    return c.json({ step }, 201);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    if (e.code === 'BAD_REQUEST') return c.json({ error: 'Bad request', message: e.message }, 400);
    throw err;
  }
});

// PATCH /agents/:agentId/workflows/:workflowId/steps/:stepId — update step
workflowRoutes.patch('/:agentId/workflows/:workflowId/steps/:stepId', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const stepId = c.req.param('stepId');
  const body = await c.req.json().catch(() => null);
  const parsed = UpdateStepSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation error', details: parsed.error.flatten() }, 422);
  }
  try {
    const step = await updateStep(stepId, userId, parsed.data);
    return c.json({ step }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    if (e.code === 'BAD_REQUEST') return c.json({ error: 'Bad request', message: e.message }, 400);
    throw err;
  }
});

// DELETE /agents/:agentId/workflows/:workflowId/steps/:stepId — delete step
workflowRoutes.delete(
  '/:agentId/workflows/:workflowId/steps/:stepId',
  authMiddleware,
  async (c) => {
    const userId = c.get('userId');
    const stepId = c.req.param('stepId');
    try {
      await deleteStep(stepId, userId);
      return c.json({ ok: true }, 200);
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
      throw err;
    }
  },
);

// ---------- Edge CRUD ----------

// GET /agents/:agentId/workflows/:workflowId/edges — list edges
workflowRoutes.get('/:agentId/workflows/:workflowId/edges', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const workflowId = c.req.param('workflowId');
  try {
    const edges = await listEdges(workflowId, userId);
    return c.json({ edges }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    throw err;
  }
});

// POST /agents/:agentId/workflows/:workflowId/edges — create edge
workflowRoutes.post('/:agentId/workflows/:workflowId/edges', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const workflowId = c.req.param('workflowId');
  const body = await c.req.json().catch(() => null);
  const parsed = CreateEdgeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation error', details: parsed.error.flatten() }, 422);
  }
  try {
    const edge = await createEdge(workflowId, userId, parsed.data);
    return c.json({ edge }, 201);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    if (e.code === 'BAD_REQUEST') return c.json({ error: 'Bad request', message: e.message }, 400);
    throw err;
  }
});

// DELETE /agents/:agentId/workflows/:workflowId/edges/:edgeId — delete edge
workflowRoutes.delete(
  '/:agentId/workflows/:workflowId/edges/:edgeId',
  authMiddleware,
  async (c) => {
    const userId = c.get('userId');
    const edgeId = c.req.param('edgeId');
    try {
      await deleteEdge(edgeId, userId);
      return c.json({ ok: true }, 200);
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
      throw err;
    }
  },
);

// ---------- Run Operations ----------

// POST /agents/:agentId/workflows/:workflowId/run — execute workflow
workflowRoutes.post('/:agentId/workflows/:workflowId/run', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const agentId = c.req.param('agentId');
  const workflowId = c.req.param('workflowId');
  const body = await c.req.json().catch(() => null);
  const parsed = RunWorkflowSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return c.json({ error: 'Validation error', details: parsed.error.flatten() }, 422);
  }
  try {
    const run = await executeWorkflow(workflowId, agentId, userId, parsed.data);
    return c.json({ run }, 202);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    if (e.code === 'BAD_REQUEST') return c.json({ error: 'Bad request', message: e.message }, 400);
    throw err;
  }
});

// GET /agents/:agentId/workflows/:workflowId/runs — list runs
workflowRoutes.get('/:agentId/workflows/:workflowId/runs', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const workflowId = c.req.param('workflowId');
  try {
    const runs = await listRuns(workflowId, userId);
    return c.json({ runs }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    throw err;
  }
});

// GET /agents/:agentId/workflows/:workflowId/runs/:runId — get run
workflowRoutes.get('/:agentId/workflows/:workflowId/runs/:runId', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const runId = c.req.param('runId');
  try {
    const run = await getRun(runId, userId);
    return c.json({ run }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    throw err;
  }
});

// POST /agents/:agentId/workflows/:workflowId/runs/:runId/cancel — cancel run
workflowRoutes.post(
  '/:agentId/workflows/:workflowId/runs/:runId/cancel',
  authMiddleware,
  async (c) => {
    const userId = c.get('userId');
    const runId = c.req.param('runId');
    try {
      const run = await cancelRun(runId, userId);
      return c.json({ run }, 200);
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
      if (e.code === 'BAD_REQUEST')
        return c.json({ error: 'Bad request', message: e.message }, 400);
      throw err;
    }
  },
);
