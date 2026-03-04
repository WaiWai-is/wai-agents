import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

import { authRoutes } from './modules/auth/auth.routes.js';
import { conversationRoutes } from './modules/conversations/conversation.routes.js';
import { agentRoutes } from './modules/agents/agent.routes.js';
import { socialRoutes } from './modules/social/social.routes.js';
import { uploadRoutes } from './modules/uploads/upload.routes.js';
import { userRoutes } from './modules/auth/user.routes.js';
import { createSocketServer } from './ws/index.js';
import { initWorkers } from './jobs/index.js';
import { runAgentLoop } from './modules/agents/loop.js';
import type { CallerContext } from './modules/agents/soul.js';

const app = new Hono();

app.use('*', logger());
app.use(
  '*',
  cors({
    origin: ['http://localhost:3000', 'https://openraccoon.com'],
    credentials: true,
  }),
);

app.get('/api/v1/health', (c) => {
  return c.json({ status: 'ok', service: 'open-raccoon-api', timestamp: new Date().toISOString() });
});

app.route('/api/v1/auth', authRoutes);
app.route('/api/v1/users', userRoutes);
app.route('/api/v1/conversations', conversationRoutes);
app.route('/api/v1/agents', agentRoutes);
app.route('/api/v1', socialRoutes);
app.route('/api/v1', uploadRoutes);

// Internal API for agent-to-agent communication
app.post('/api/v1/internal/agent/execute', async (c) => {
  const internalKey = c.req.header('X-Internal-Key');
  const expectedKey = process.env.INTERNAL_API_KEY;
  if (!expectedKey) {
    return c.json({ error: 'Internal API key not configured' }, 500);
  }
  if (internalKey !== expectedKey) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { agentId, conversationId, message, a2aDepth, callerContext } = body as {
    agentId: unknown; conversationId: unknown; message: unknown;
    a2aDepth: unknown; callerContext: CallerContext | undefined;
  };

  // Validate required fields
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (typeof agentId !== 'string' || !uuidRe.test(agentId)) {
    return c.json({ error: 'Invalid agentId' }, 400);
  }
  if (typeof message !== 'string' || message.length === 0) {
    return c.json({ error: 'Invalid message' }, 400);
  }
  const depth = typeof a2aDepth === 'number' ? a2aDepth : 0;
  if (depth >= 3) {
    return c.json({ error: 'Maximum A2A depth exceeded' }, 400);
  }

  try {
    const result = await runAgentLoop({
      agentId,
      conversationId: typeof conversationId === 'string' ? conversationId : agentId,
      userId: callerContext?.caller_agent_id ?? agentId,
      message,
      a2aDepth: depth,
      callerContext,
    });

    return c.json({ response: result.response, usage: result.usage });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: errMsg }, 500);
  }
});

const port = Number(process.env.PORT) || 4000;

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Open Raccoon API running on port ${info.port}`);
});

const io = createSocketServer(server as any);

// Initialize BullMQ workers (non-blocking — logs on failure)
initWorkers().catch((err) => {
  console.error('Failed to initialize BullMQ workers:', (err as Error).message);
  console.error('Background jobs will not run. Ensure Redis is available.');
});

export { app, server, io };
