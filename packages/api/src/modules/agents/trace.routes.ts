import { Hono } from 'hono';
import { authMiddleware } from '../auth/auth.middleware.js';
import { getTrace, listTraces } from './trace.service.js';

export const traceRoutes = new Hono();

// GET /agents/:agentId/traces — list traces for an agent
traceRoutes.get('/:agentId/traces', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const agentId = c.req.param('agentId');
  const status = c.req.query('status') ?? undefined;
  const rawLimit = c.req.query('limit') ? Number(c.req.query('limit')) : undefined;
  const rawOffset = c.req.query('offset') ? Number(c.req.query('offset')) : undefined;
  const limit = rawLimit !== undefined && !Number.isNaN(rawLimit) ? rawLimit : undefined;
  const offset = rawOffset !== undefined && !Number.isNaN(rawOffset) ? rawOffset : undefined;

  try {
    const traces = await listTraces(agentId, userId, { status, limit, offset });
    return c.json({ traces }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    throw err;
  }
});

// GET /agents/:agentId/traces/:traceId — get full trace with spans
traceRoutes.get('/:agentId/traces/:traceId', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const traceId = c.req.param('traceId');

  try {
    const trace = await getTrace(traceId, userId);
    return c.json({ trace }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    throw err;
  }
});
