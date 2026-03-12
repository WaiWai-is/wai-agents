import { Hono } from 'hono';
import { authMiddleware } from '../auth/auth.middleware.js';
import {
  CreateMemorySchema,
  MemoryConsolidateSchema,
  MemorySearchSchema,
  UpdateMemorySchema,
} from './memory.schema.js';
import {
  bulkDeleteMemories,
  createMemory,
  getMemory,
  listMemories,
  recallMemories,
  updateMemory,
} from './memory.service.js';
import {
  consolidateMemories,
  decayAgentMemories,
  getMemoryStats,
  recallMemoriesAdvanced,
  softDeleteMemory,
} from './memory-consolidation.service.js';

export const memoryRoutes = new Hono();

// GET /agents/:agentId/memories — list memories with optional filters
memoryRoutes.get('/:agentId/memories', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const agentId = c.req.param('agentId');
  const type = c.req.query('type') ?? undefined;
  const search = c.req.query('search') ?? undefined;
  const rawMinImportance = c.req.query('minImportance')
    ? Number(c.req.query('minImportance'))
    : undefined;
  const rawLimit = c.req.query('limit') ? Number(c.req.query('limit')) : undefined;
  const rawOffset = c.req.query('offset') ? Number(c.req.query('offset')) : undefined;
  const minImportance =
    rawMinImportance !== undefined && !Number.isNaN(rawMinImportance)
      ? rawMinImportance
      : undefined;
  const limit = rawLimit !== undefined && !Number.isNaN(rawLimit) ? rawLimit : undefined;
  const offset = rawOffset !== undefined && !Number.isNaN(rawOffset) ? rawOffset : undefined;

  try {
    const memories = await listMemories(agentId, userId, {
      type,
      search,
      minImportance,
      limit,
      offset,
    });
    return c.json({ memories }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    throw err;
  }
});

// POST /agents/:agentId/memories — create a memory
memoryRoutes.post('/:agentId/memories', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const agentId = c.req.param('agentId');
  const body = await c.req.json().catch(() => null);
  const parsed = CreateMemorySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation error', details: parsed.error.flatten() }, 422);
  }
  try {
    const memory = await createMemory(agentId, userId, parsed.data);

    // Emit Socket.IO event
    try {
      const { emitMemoryEvent } = await import('../../ws/emitter.js');
      emitMemoryEvent(userId, {
        type: 'memory:created',
        agent_id: agentId,
        memory_id: memory.id as string,
        memory_type: parsed.data.memory_type,
        content_preview: parsed.data.content.slice(0, 100),
      });
    } catch {
      // Socket.IO may not be initialized in tests
    }

    return c.json({ memory }, 201);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    throw err;
  }
});

// POST /agents/:agentId/memories/recall — search/recall memories (advanced)
memoryRoutes.post('/:agentId/memories/recall', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const agentId = c.req.param('agentId');
  const body = await c.req.json().catch(() => null);
  const parsed = MemorySearchSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation error', details: parsed.error.flatten() }, 422);
  }

  try {
    const memories = await recallMemoriesAdvanced(agentId, userId, parsed.data.query, {
      memory_type: parsed.data.memory_type,
      limit: parsed.data.limit,
      min_importance: parsed.data.min_importance,
    });
    return c.json({ memories }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    throw err;
  }
});

// POST /agents/:agentId/memories/consolidate — consolidate memories
memoryRoutes.post('/:agentId/memories/consolidate', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const agentId = c.req.param('agentId');
  const body = await c.req.json().catch(() => null);
  const parsed = MemoryConsolidateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation error', details: parsed.error.flatten() }, 422);
  }

  try {
    const result = await consolidateMemories(agentId, userId, parsed.data);
    return c.json(result, 201);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    throw err;
  }
});

// POST /agents/:agentId/memories/decay — trigger memory decay
memoryRoutes.post('/:agentId/memories/decay', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const agentId = c.req.param('agentId');

  try {
    const result = await decayAgentMemories(agentId, userId);
    return c.json(result, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    throw err;
  }
});

// GET /agents/:agentId/memories/stats — get memory stats
memoryRoutes.get('/:agentId/memories/stats', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const agentId = c.req.param('agentId');

  try {
    const stats = await getMemoryStats(agentId, userId);
    return c.json({ stats }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    throw err;
  }
});

// GET /agents/:agentId/memories/recall — recall relevant memories (legacy GET)
memoryRoutes.get('/:agentId/memories/recall', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const agentId = c.req.param('agentId');
  const query = c.req.query('query') ?? undefined;
  const rawRecallLimit = c.req.query('limit') ? Number(c.req.query('limit')) : undefined;
  const recallLimit =
    rawRecallLimit !== undefined && !Number.isNaN(rawRecallLimit) ? rawRecallLimit : undefined;

  try {
    const memories = await recallMemories(agentId, userId, query, recallLimit);
    return c.json({ memories }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    throw err;
  }
});

// GET /agents/:agentId/memories/:id — get a single memory
memoryRoutes.get('/:agentId/memories/:id', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const memoryId = c.req.param('id');
  try {
    const memory = await getMemory(memoryId, userId);
    return c.json({ memory }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    throw err;
  }
});

// PATCH /agents/:agentId/memories/:id — update a memory
memoryRoutes.patch('/:agentId/memories/:id', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const memoryId = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const parsed = UpdateMemorySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation error', details: parsed.error.flatten() }, 422);
  }
  try {
    const memory = await updateMemory(memoryId, userId, parsed.data);
    return c.json({ memory }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    throw err;
  }
});

// DELETE /agents/:agentId/memories/:id — soft delete a single memory
memoryRoutes.delete('/:agentId/memories/:id', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const agentId = c.req.param('agentId');
  const memoryId = c.req.param('id');
  try {
    await softDeleteMemory(agentId, userId, memoryId);
    return c.json({ ok: true }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    throw err;
  }
});

// DELETE /agents/:agentId/memories — bulk delete memories
memoryRoutes.delete('/:agentId/memories', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const agentId = c.req.param('agentId');
  const type = c.req.query('type') ?? undefined;

  try {
    await bulkDeleteMemories(agentId, userId, type);
    return c.json({ ok: true }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    throw err;
  }
});
