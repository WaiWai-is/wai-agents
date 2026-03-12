import { Hono } from 'hono';
import { authMiddleware } from '../auth/auth.middleware.js';
import {
  CompleteCollaborationSchema,
  CreateCollaborationSchema,
  RegisterCapabilitiesSchema,
  RejectCollaborationSchema,
  UpdateCollaborationProgressSchema,
} from './collaboration.schema.js';
import {
  acceptCollaboration,
  completeCollaboration,
  discoverAgents,
  findCapableAgents,
  getAgentCapabilities,
  getCollaboration,
  getCollaborationChain,
  getCollaborationMessages,
  listCollaborations,
  registerCapabilities,
  rejectCollaboration,
  requestCollaboration,
  updateCollaborationProgress,
} from './collaboration.service.js';

export const collaborationRoutes = new Hono();

// ---------- Discovery ----------

// GET /agents/discover — discover agents by keyword (name/description/category)
collaborationRoutes.get('/discover', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const capability = c.req.query('capability');
  const limit = c.req.query('limit') ? Number(c.req.query('limit')) : undefined;

  if (!capability || capability.trim().length === 0) {
    return c.json(
      { error: 'Validation error', message: 'capability query param is required' },
      422,
    );
  }

  try {
    const agents = await discoverAgents(capability, userId, limit);
    return c.json({ agents }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    throw err;
  }
});

// GET /agents/capabilities/search — find agents by registered capability
collaborationRoutes.get('/capabilities/search', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const capability = c.req.query('capability');
  const limit = c.req.query('limit') ? Number(c.req.query('limit')) : undefined;

  if (!capability || capability.trim().length === 0) {
    return c.json(
      { error: 'Validation error', message: 'capability query param is required' },
      422,
    );
  }

  try {
    const agents = await findCapableAgents(capability, userId, limit);
    return c.json({ agents }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    throw err;
  }
});

// ---------- Collaboration CRUD ----------

// POST /agents/:agentId/collaborate — request collaboration from another agent
collaborationRoutes.post('/:agentId/collaborate', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const agentId = c.req.param('agentId');
  const body = await c.req.json().catch(() => null);
  const parsed = CreateCollaborationSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation error', details: parsed.error.flatten() }, 422);
  }

  try {
    const collaboration = await requestCollaboration(
      agentId,
      userId,
      parsed.data.conversation_id,
      parsed.data,
    );
    return c.json({ collaboration }, 201);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    if (e.code === 'BAD_REQUEST') return c.json({ error: 'Bad request', message: e.message }, 400);
    throw err;
  }
});

// POST /agents/:agentId/collaborations — request collaboration (legacy alias)
collaborationRoutes.post('/:agentId/collaborations', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const agentId = c.req.param('agentId');
  const body = await c.req.json().catch(() => null);
  const parsed = CreateCollaborationSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation error', details: parsed.error.flatten() }, 422);
  }

  try {
    const collaboration = await requestCollaboration(
      agentId,
      userId,
      parsed.data.conversation_id,
      parsed.data,
    );
    return c.json({ collaboration }, 201);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    if (e.code === 'BAD_REQUEST') return c.json({ error: 'Bad request', message: e.message }, 400);
    throw err;
  }
});

// GET /agents/:agentId/collaborations — list collaborations
collaborationRoutes.get('/:agentId/collaborations', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const agentId = c.req.param('agentId');
  const status = c.req.query('status') ?? undefined;
  const direction = c.req.query('direction') as 'sent' | 'received' | undefined;

  try {
    const collaborations = await listCollaborations(agentId, userId, { status, direction });
    return c.json({ collaborations }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    throw err;
  }
});

// GET /agents/:agentId/collaborations/:id — get single collaboration
collaborationRoutes.get('/:agentId/collaborations/:id', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const collaborationId = c.req.param('id');

  try {
    const collaboration = await getCollaboration(collaborationId, userId);
    return c.json({ collaboration }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    throw err;
  }
});

// ---------- Collaboration State Transitions ----------

// PATCH /agents/:agentId/collaborations/:id/accept — accept collaboration
collaborationRoutes.patch('/:agentId/collaborations/:id/accept', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const collaborationId = c.req.param('id');

  try {
    const collaboration = await acceptCollaboration(collaborationId, userId);
    return c.json({ collaboration }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    if (e.code === 'BAD_REQUEST') return c.json({ error: 'Bad request', message: e.message }, 400);
    if (e.code === 'FORBIDDEN') return c.json({ error: 'Forbidden', message: e.message }, 403);
    throw err;
  }
});

// POST /agents/collaborations/:requestId/respond — accept/reject collaboration
collaborationRoutes.post('/collaborations/:requestId/respond', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const requestId = c.req.param('requestId');
  const body = await c.req.json().catch(() => null);

  if (!body || typeof body !== 'object') {
    return c.json({ error: 'Validation error', message: 'Request body is required' }, 422);
  }

  const accept = (body as Record<string, unknown>).accept;
  if (typeof accept !== 'boolean') {
    return c.json({ error: 'Validation error', message: 'accept (boolean) is required' }, 422);
  }

  try {
    if (accept) {
      const collaboration = await acceptCollaboration(requestId, userId);
      return c.json({ collaboration }, 200);
    }
    const reason =
      typeof (body as Record<string, unknown>).reason === 'string'
        ? ((body as Record<string, unknown>).reason as string)
        : 'No reason provided';
    const collaboration = await rejectCollaboration(requestId, userId, reason);
    return c.json({ collaboration }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    if (e.code === 'BAD_REQUEST') return c.json({ error: 'Bad request', message: e.message }, 400);
    if (e.code === 'FORBIDDEN') return c.json({ error: 'Forbidden', message: e.message }, 403);
    throw err;
  }
});

// POST /agents/collaborations/:requestId/progress — update progress
collaborationRoutes.post('/collaborations/:requestId/progress', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const requestId = c.req.param('requestId');
  const body = await c.req.json().catch(() => null);
  const parsed = UpdateCollaborationProgressSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation error', details: parsed.error.flatten() }, 422);
  }

  try {
    const collaboration = await updateCollaborationProgress(requestId, userId, parsed.data);
    return c.json({ collaboration }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    if (e.code === 'BAD_REQUEST') return c.json({ error: 'Bad request', message: e.message }, 400);
    if (e.code === 'FORBIDDEN') return c.json({ error: 'Forbidden', message: e.message }, 403);
    throw err;
  }
});

// POST /agents/collaborations/:requestId/complete — mark complete
collaborationRoutes.post('/collaborations/:requestId/complete', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const requestId = c.req.param('requestId');
  const body = await c.req.json().catch(() => null);
  const parsed = CompleteCollaborationSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation error', details: parsed.error.flatten() }, 422);
  }

  try {
    const collaboration = await completeCollaboration(requestId, userId, parsed.data.result);
    return c.json({ collaboration }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    if (e.code === 'BAD_REQUEST') return c.json({ error: 'Bad request', message: e.message }, 400);
    if (e.code === 'FORBIDDEN') return c.json({ error: 'Forbidden', message: e.message }, 403);
    throw err;
  }
});

// PATCH /agents/:agentId/collaborations/:id/complete — complete collaboration (legacy)
collaborationRoutes.patch('/:agentId/collaborations/:id/complete', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const collaborationId = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const parsed = CompleteCollaborationSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation error', details: parsed.error.flatten() }, 422);
  }

  try {
    const collaboration = await completeCollaboration(collaborationId, userId, parsed.data.result);
    return c.json({ collaboration }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    if (e.code === 'BAD_REQUEST') return c.json({ error: 'Bad request', message: e.message }, 400);
    if (e.code === 'FORBIDDEN') return c.json({ error: 'Forbidden', message: e.message }, 403);
    throw err;
  }
});

// PATCH /agents/:agentId/collaborations/:id/reject — reject collaboration
collaborationRoutes.patch('/:agentId/collaborations/:id/reject', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const collaborationId = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const parsed = RejectCollaborationSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation error', details: parsed.error.flatten() }, 422);
  }

  try {
    const collaboration = await rejectCollaboration(collaborationId, userId, parsed.data.reason);
    return c.json({ collaboration }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    if (e.code === 'BAD_REQUEST') return c.json({ error: 'Bad request', message: e.message }, 400);
    if (e.code === 'FORBIDDEN') return c.json({ error: 'Forbidden', message: e.message }, 403);
    throw err;
  }
});

// ---------- Chain & Messages ----------

// GET /agents/collaborations/:requestId/chain — get full delegation chain
collaborationRoutes.get('/collaborations/:requestId/chain', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const requestId = c.req.param('requestId');

  try {
    const chain = await getCollaborationChain(requestId, userId);
    return c.json({ chain }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    throw err;
  }
});

// GET /agents/collaborations/:requestId/messages — get collaboration messages
collaborationRoutes.get('/collaborations/:requestId/messages', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const requestId = c.req.param('requestId');

  try {
    const messages = await getCollaborationMessages(requestId, userId);
    return c.json({ messages }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    throw err;
  }
});

// ---------- Capabilities ----------

// POST /agents/:id/capabilities — register capabilities
collaborationRoutes.post('/:agentId/capabilities', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const agentId = c.req.param('agentId');
  const body = await c.req.json().catch(() => null);
  const parsed = RegisterCapabilitiesSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation error', details: parsed.error.flatten() }, 422);
  }

  try {
    const capability = await registerCapabilities(agentId, userId, parsed.data);
    return c.json({ capability }, 201);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    throw err;
  }
});

// GET /agents/:id/capabilities — get agent capabilities
collaborationRoutes.get('/:agentId/capabilities', authMiddleware, async (c) => {
  const agentId = c.req.param('agentId');

  try {
    const capability = await getAgentCapabilities(agentId);
    if (!capability) {
      return c.json({ capability: null }, 200);
    }
    return c.json({ capability }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    throw err;
  }
});
