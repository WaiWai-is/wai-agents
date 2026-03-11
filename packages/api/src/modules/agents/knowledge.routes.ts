import { Hono } from 'hono';
import { authMiddleware } from '../auth/auth.middleware.js';
import {
  CreateEdgeSchema,
  CreateNodeSchema,
  NeighborQuerySchema,
  PathQuerySchema,
  UpdateNodeSchema,
} from './knowledge.schema.js';
import {
  createEdge,
  createNode,
  deleteEdge,
  deleteNode,
  findPaths,
  getNeighbors,
  getNode,
  listEdges,
  listNodes,
  updateNode,
} from './knowledge.service.js';

export const knowledgeRoutes = new Hono();

/* -------------------------------------------------------------------------- */
/*  Node Routes                                                               */
/* -------------------------------------------------------------------------- */

// POST /agents/:agentId/knowledge/nodes — create a node
knowledgeRoutes.post('/:agentId/knowledge/nodes', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const agentId = c.req.param('agentId');
  const body = await c.req.json().catch(() => null);
  const parsed = CreateNodeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation error', details: parsed.error.flatten() }, 422);
  }
  try {
    const node = await createNode(agentId, userId, parsed.data);
    return c.json({ node }, 201);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    throw err;
  }
});

// GET /agents/:agentId/knowledge/nodes — list nodes
knowledgeRoutes.get('/:agentId/knowledge/nodes', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const agentId = c.req.param('agentId');
  const label = c.req.query('label') ?? undefined;
  const search = c.req.query('search') ?? undefined;
  const rawLimit = c.req.query('limit') ? Number(c.req.query('limit')) : undefined;
  const rawOffset = c.req.query('offset') ? Number(c.req.query('offset')) : undefined;
  const limit = rawLimit !== undefined && !Number.isNaN(rawLimit) ? rawLimit : undefined;
  const offset = rawOffset !== undefined && !Number.isNaN(rawOffset) ? rawOffset : undefined;

  try {
    const nodes = await listNodes(agentId, userId, { label, search, limit, offset });
    return c.json({ nodes }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    throw err;
  }
});

// GET /agents/:agentId/knowledge/nodes/:nodeId — get a single node
knowledgeRoutes.get('/:agentId/knowledge/nodes/:nodeId', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const nodeId = c.req.param('nodeId');
  try {
    const node = await getNode(nodeId, userId);
    return c.json({ node }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    throw err;
  }
});

// PATCH /agents/:agentId/knowledge/nodes/:nodeId — update a node
knowledgeRoutes.patch('/:agentId/knowledge/nodes/:nodeId', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const nodeId = c.req.param('nodeId');
  const body = await c.req.json().catch(() => null);
  const parsed = UpdateNodeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation error', details: parsed.error.flatten() }, 422);
  }
  try {
    const node = await updateNode(nodeId, userId, parsed.data);
    return c.json({ node }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    throw err;
  }
});

// DELETE /agents/:agentId/knowledge/nodes/:nodeId — delete a node (cascades edges)
knowledgeRoutes.delete('/:agentId/knowledge/nodes/:nodeId', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const nodeId = c.req.param('nodeId');
  try {
    await deleteNode(nodeId, userId);
    return c.json({ ok: true }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    throw err;
  }
});

/* -------------------------------------------------------------------------- */
/*  Edge Routes                                                               */
/* -------------------------------------------------------------------------- */

// POST /agents/:agentId/knowledge/edges — create an edge
knowledgeRoutes.post('/:agentId/knowledge/edges', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const agentId = c.req.param('agentId');
  const body = await c.req.json().catch(() => null);
  const parsed = CreateEdgeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation error', details: parsed.error.flatten() }, 422);
  }
  try {
    const edge = await createEdge(agentId, userId, parsed.data);
    return c.json({ edge }, 201);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    throw err;
  }
});

// GET /agents/:agentId/knowledge/edges — list edges
knowledgeRoutes.get('/:agentId/knowledge/edges', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const agentId = c.req.param('agentId');
  const relationship = c.req.query('relationship') ?? undefined;
  const nodeId = c.req.query('node_id') ?? undefined;
  const rawLimit = c.req.query('limit') ? Number(c.req.query('limit')) : undefined;
  const rawOffset = c.req.query('offset') ? Number(c.req.query('offset')) : undefined;
  const limit = rawLimit !== undefined && !Number.isNaN(rawLimit) ? rawLimit : undefined;
  const offset = rawOffset !== undefined && !Number.isNaN(rawOffset) ? rawOffset : undefined;

  try {
    const edges = await listEdges(agentId, userId, { relationship, nodeId, limit, offset });
    return c.json({ edges }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    throw err;
  }
});

// DELETE /agents/:agentId/knowledge/edges/:edgeId — delete an edge
knowledgeRoutes.delete('/:agentId/knowledge/edges/:edgeId', authMiddleware, async (c) => {
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
});

/* -------------------------------------------------------------------------- */
/*  Graph Query Routes                                                        */
/* -------------------------------------------------------------------------- */

// GET /agents/:agentId/knowledge/nodes/:nodeId/neighbors — get neighbor nodes
knowledgeRoutes.get('/:agentId/knowledge/nodes/:nodeId/neighbors', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const nodeId = c.req.param('nodeId');
  const query = {
    depth: c.req.query('depth'),
    direction: c.req.query('direction'),
  };
  const parsed = NeighborQuerySchema.safeParse(query);
  if (!parsed.success) {
    return c.json({ error: 'Validation error', details: parsed.error.flatten() }, 422);
  }
  try {
    const neighbors = await getNeighbors(nodeId, userId, parsed.data);
    return c.json({ neighbors }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    throw err;
  }
});

// GET /agents/:agentId/knowledge/paths — find paths between two nodes
knowledgeRoutes.get('/:agentId/knowledge/paths', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const query = {
    source: c.req.query('source'),
    target: c.req.query('target'),
    max_depth: c.req.query('max_depth'),
  };
  const parsed = PathQuerySchema.safeParse(query);
  if (!parsed.success) {
    return c.json({ error: 'Validation error', details: parsed.error.flatten() }, 422);
  }
  try {
    const paths = await findPaths(
      parsed.data.source,
      parsed.data.target,
      userId,
      parsed.data.max_depth,
    );
    return c.json({ paths }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    throw err;
  }
});
