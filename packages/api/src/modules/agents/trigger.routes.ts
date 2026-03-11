import { Hono } from 'hono';
import { authMiddleware } from '../auth/auth.middleware.js';
import { CreateTriggerSchema, UpdateTriggerSchema } from './trigger.schema.js';
import {
  createTrigger,
  deleteTrigger,
  fireTrigger,
  getTrigger,
  listTriggers,
  updateTrigger,
} from './trigger.service.js';

export const triggerRoutes = new Hono();

// ---------- Authenticated CRUD ----------

// GET /agents/:agentId/triggers — list triggers for an agent
triggerRoutes.get('/:agentId/triggers', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const agentId = c.req.param('agentId');
  try {
    const triggers = await listTriggers(agentId, userId);
    return c.json({ triggers }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    throw err;
  }
});

// POST /agents/:agentId/triggers — create trigger
triggerRoutes.post('/:agentId/triggers', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const agentId = c.req.param('agentId');
  const body = await c.req.json().catch(() => null);
  const parsed = CreateTriggerSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation error', details: parsed.error.flatten() }, 422);
  }
  try {
    const trigger = await createTrigger(agentId, userId, parsed.data);
    return c.json({ trigger }, 201);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    if (e.code === 'BAD_REQUEST') return c.json({ error: 'Bad request', message: e.message }, 400);
    throw err;
  }
});

// GET /agents/:agentId/triggers/:id — get trigger
triggerRoutes.get('/:agentId/triggers/:id', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const triggerId = c.req.param('id');
  try {
    const trigger = await getTrigger(triggerId, userId);
    return c.json({ trigger }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    throw err;
  }
});

// PATCH /agents/:agentId/triggers/:id — update trigger
triggerRoutes.patch('/:agentId/triggers/:id', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const triggerId = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const parsed = UpdateTriggerSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation error', details: parsed.error.flatten() }, 422);
  }
  try {
    const trigger = await updateTrigger(triggerId, userId, parsed.data);
    return c.json({ trigger }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    if (e.code === 'BAD_REQUEST') return c.json({ error: 'Bad request', message: e.message }, 400);
    throw err;
  }
});

// DELETE /agents/:agentId/triggers/:id — delete trigger
triggerRoutes.delete('/:agentId/triggers/:id', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const triggerId = c.req.param('id');
  try {
    await deleteTrigger(triggerId, userId);
    return c.json({ ok: true }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    throw err;
  }
});

// ---------- Public Webhook Endpoint ----------

export const hookRoutes = new Hono();

// POST /hooks/:token — fire trigger via webhook (NO auth)
hookRoutes.post('/:token', async (c) => {
  const token = c.req.param('token');
  const body = await c.req.json().catch(() => ({}));
  const hmacSignature = c.req.header('X-Hub-Signature-256') ?? c.req.header('X-Signature');

  try {
    const result = await fireTrigger(token, body as Record<string, unknown>, hmacSignature);
    if (!result.fired) {
      return c.json({ fired: false, reason: result.reason }, 200);
    }
    return c.json({ fired: true, conversation_id: result.conversation_id }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found' }, 404);
    if (e.code === 'UNAUTHORIZED') return c.json({ error: e.message }, 401);
    throw err;
  }
});
