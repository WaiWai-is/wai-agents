import { Hono } from 'hono';
import { authMiddleware } from '../auth/auth.middleware.js';
import { RateAgentSchema } from './social.schema.js';
import {
  listFeed,
  listTrending,
  listFollowing,
  listNew,
  likeFeedItem,
  unlikeFeedItem,
  forkAgent,
  listMarketplace,
  searchMarketplace,
  getMarketplaceAgent,
  listCategories,
  rateAgent,
  followUser,
  unfollowUser,
} from './social.service.js';

export const socialRoutes = new Hono();

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* -------------------------------------------------------------------------- */
/*  Feed                                                                      */
/* -------------------------------------------------------------------------- */

socialRoutes.get('/feed', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const cursor = c.req.query('cursor');
  const limitParam = c.req.query('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : undefined;
  const items = await listFeed(userId, cursor, limit);
  return c.json({ items }, 200);
});

socialRoutes.get('/feed/trending', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const cursor = c.req.query('cursor');
  const limitParam = c.req.query('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : undefined;
  const items = await listTrending(userId, cursor, limit);
  return c.json({ items }, 200);
});

socialRoutes.get('/feed/following', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const cursor = c.req.query('cursor');
  const limitParam = c.req.query('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : undefined;
  const items = await listFollowing(userId, cursor, limit);
  return c.json({ items }, 200);
});

socialRoutes.get('/feed/new', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const cursor = c.req.query('cursor');
  const limitParam = c.req.query('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : undefined;
  const items = await listNew(userId, cursor, limit);
  return c.json({ items }, 200);
});

socialRoutes.post('/feed/:id/like', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const feedItemId = c.req.param('id');
  if (!UUID_REGEX.test(feedItemId)) {
    return c.json({ error: 'Invalid ID format' }, 400);
  }
  try {
    const item = await likeFeedItem(feedItemId, userId);
    return c.json({ item }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    throw err;
  }
});

socialRoutes.delete('/feed/:id/like', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const feedItemId = c.req.param('id');
  if (!UUID_REGEX.test(feedItemId)) {
    return c.json({ error: 'Invalid ID format' }, 400);
  }
  try {
    await unlikeFeedItem(feedItemId, userId);
    return c.json({ ok: true }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    throw err;
  }
});

socialRoutes.post('/feed/:id/fork', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const agentId = c.req.param('id');
  if (!UUID_REGEX.test(agentId)) {
    return c.json({ error: 'Invalid ID format' }, 400);
  }
  try {
    const agent = await forkAgent(agentId, userId);
    return c.json({ agent }, 201);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    throw err;
  }
});

/* -------------------------------------------------------------------------- */
/*  Marketplace                                                               */
/* -------------------------------------------------------------------------- */

socialRoutes.get('/marketplace', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const cursor = c.req.query('cursor');
  const limitParam = c.req.query('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : undefined;
  const category = c.req.query('category');
  const agents = await listMarketplace(userId, cursor, limit, category);
  return c.json({ agents }, 200);
});

socialRoutes.get('/marketplace/search', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const query = c.req.query('q');
  if (!query) {
    return c.json({ error: 'Bad request', message: 'Query parameter "q" is required' }, 400);
  }
  const cursor = c.req.query('cursor');
  const limitParam = c.req.query('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : undefined;
  const agents = await searchMarketplace(query, userId, cursor, limit);
  return c.json({ agents }, 200);
});

socialRoutes.get('/marketplace/categories', authMiddleware, async (c) => {
  const categories = await listCategories();
  return c.json({ categories }, 200);
});

socialRoutes.get('/marketplace/agents/:slug', authMiddleware, async (c) => {
  const slug = c.req.param('slug');
  try {
    const agent = await getMarketplaceAgent(slug);
    return c.json({ agent }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    throw err;
  }
});

socialRoutes.post('/marketplace/agents/:id/rate', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const agentId = c.req.param('id');
  if (!UUID_REGEX.test(agentId)) {
    return c.json({ error: 'Invalid ID format' }, 400);
  }
  const body = await c.req.json().catch(() => null);
  const parsed = RateAgentSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation error', details: parsed.error.flatten() }, 422);
  }
  try {
    const result = await rateAgent(agentId, userId, parsed.data.rating, parsed.data.review, {
      accuracy_score: parsed.data.accuracy_score,
      helpfulness_score: parsed.data.helpfulness_score,
      speed_score: parsed.data.speed_score,
      conversation_id: parsed.data.conversation_id,
      message_id: parsed.data.message_id,
    });
    return c.json({ rating: result }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    throw err;
  }
});

/* -------------------------------------------------------------------------- */
/*  Follows                                                                   */
/* -------------------------------------------------------------------------- */

socialRoutes.post('/users/:id/follow', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const followingId = c.req.param('id');
  if (!UUID_REGEX.test(followingId)) {
    return c.json({ error: 'Invalid ID format' }, 400);
  }
  try {
    await followUser(userId, followingId);
    return c.json({ ok: true }, 201);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    if (e.code === 'BAD_REQUEST') return c.json({ error: 'Bad request', message: e.message }, 400);
    throw err;
  }
});

socialRoutes.delete('/users/:id/follow', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const followingId = c.req.param('id');
  if (!UUID_REGEX.test(followingId)) {
    return c.json({ error: 'Invalid ID format' }, 400);
  }
  await unfollowUser(userId, followingId);
  return c.json({ ok: true }, 200);
});
