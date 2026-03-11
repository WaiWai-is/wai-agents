import { Hono } from 'hono';
import { authMiddleware } from '../auth/auth.middleware.js';
import {
  CompleteCollaborationSchema,
  CreateCollaborationSchema,
  RejectCollaborationSchema,
} from './collaboration.schema.js';
import {
  acceptCollaboration,
  completeCollaboration,
  discoverAgents,
  getCollaboration,
  listCollaborations,
  rejectCollaboration,
  requestCollaboration,
} from './collaboration.service.js';

export const collaborationRoutes = new Hono();

// GET /agents/discover — discover agents by capability
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

// POST /agents/:agentId/collaborations — request collaboration
collaborationRoutes.post('/:agentId/collaborations', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const agentId = c.req.param('agentId');
  const body = await c.req.json().catch(() => null);
  const parsed = CreateCollaborationSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation error', details: parsed.error.flatten() }, 422);
  }

  // Use the conversation_id from metadata or generate a default conversation context
  const conversationId = (body as Record<string, unknown>)?.conversation_id;
  if (!conversationId || typeof conversationId !== 'string') {
    return c.json({ error: 'Validation error', message: 'conversation_id is required' }, 422);
  }

  try {
    const collaboration = await requestCollaboration(agentId, userId, conversationId, parsed.data);
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

// PATCH /agents/:agentId/collaborations/:id/complete — complete collaboration
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
