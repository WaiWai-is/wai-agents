import { Hono } from 'hono';
import { authMiddleware } from '../auth/auth.middleware.js';
import {
  CreateConversationSchema,
  UpdateConversationSchema,
  SendMessageSchema,
  AddMemberSchema,
} from './conversation.schema.js';
import {
  listConversations,
  createConversation,
  getConversation,
  updateConversation,
  deleteConversation,
  listMessages,
  sendMessage,
  listMembers,
  addMember,
  removeMember,
} from './conversation.service.js';
import { sql } from '../../db/connection.js';
import { MessageFeedbackSchema } from '../social/social.schema.js';
import { submitMessageFeedback, shouldPromptFeedback } from '../social/social.service.js';

export const conversationRoutes = new Hono();

// GET / — list user's conversations
conversationRoutes.get('/', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const conversations = await listConversations(userId);
  return c.json({ conversations }, 200);
});

// POST / — create conversation
conversationRoutes.post('/', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json().catch(() => null);
  const parsed = CreateConversationSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation error', details: parsed.error.flatten() }, 422);
  }
  const conversation = await createConversation(userId, parsed.data);
  return c.json({ conversation }, 201);
});

// GET /:id — get conversation
conversationRoutes.get('/:id', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const conversationId = c.req.param('id');
  try {
    const conversation = await getConversation(conversationId, userId);
    return c.json({ conversation }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    throw err;
  }
});

// PATCH /:id — update conversation
conversationRoutes.patch('/:id', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const conversationId = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const parsed = UpdateConversationSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation error', details: parsed.error.flatten() }, 422);
  }
  try {
    const conversation = await updateConversation(conversationId, userId, parsed.data);
    return c.json({ conversation }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    if (e.code === 'FORBIDDEN') return c.json({ error: 'Forbidden', message: e.message }, 403);
    throw err;
  }
});

// DELETE /:id — delete conversation
conversationRoutes.delete('/:id', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const conversationId = c.req.param('id');
  try {
    await deleteConversation(conversationId, userId);
    return c.json({ ok: true }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    if (e.code === 'FORBIDDEN') return c.json({ error: 'Forbidden', message: e.message }, 403);
    throw err;
  }
});

// GET /:id/messages — list messages with cursor pagination
conversationRoutes.get('/:id/messages', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const conversationId = c.req.param('id');
  const cursor = c.req.query('cursor');
  const limitParam = c.req.query('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : 50;
  try {
    const messages = await listMessages(conversationId, userId, cursor, limit);
    return c.json({ messages }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    if (e.code === 'BAD_REQUEST') return c.json({ error: 'Bad request', message: e.message }, 400);
    throw err;
  }
});

// POST /:id/messages — send message
conversationRoutes.post('/:id/messages', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const conversationId = c.req.param('id');
  const idempotencyKey = c.req.header('Idempotency-Key');
  if (!idempotencyKey) {
    return c.json({ error: 'Bad request', message: 'Idempotency-Key header is required' }, 400);
  }
  const body = await c.req.json().catch(() => null);
  const parsed = SendMessageSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation error', details: parsed.error.flatten() }, 422);
  }
  try {
    const message = await sendMessage(conversationId, userId, parsed.data, idempotencyKey);
    return c.json({ message }, 201);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    throw err;
  }
});

// GET /:id/members — list members
conversationRoutes.get('/:id/members', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const conversationId = c.req.param('id');
  try {
    const members = await listMembers(conversationId, userId);
    return c.json({ members }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    throw err;
  }
});

// POST /:id/members — add member
conversationRoutes.post('/:id/members', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const conversationId = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const parsed = AddMemberSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation error', details: parsed.error.flatten() }, 422);
  }
  try {
    const member = await addMember(conversationId, userId, parsed.data);
    return c.json({ member }, 201);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    if (e.code === 'FORBIDDEN') return c.json({ error: 'Forbidden', message: e.message }, 403);
    throw err;
  }
});

// DELETE /:id/members/:userId — remove member
conversationRoutes.delete('/:id/members/:userId', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const conversationId = c.req.param('id');
  const targetUserId = c.req.param('userId');
  try {
    await removeMember(conversationId, userId, targetUserId);
    return c.json({ ok: true }, 200);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'NOT_FOUND') return c.json({ error: 'Not found', message: e.message }, 404);
    if (e.code === 'FORBIDDEN') return c.json({ error: 'Forbidden', message: e.message }, 403);
    throw err;
  }
});

// POST /:id/messages/:messageId/feedback — submit feedback on an agent message
conversationRoutes.post('/:id/messages/:messageId/feedback', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const conversationId = c.req.param('id');
  const messageId = c.req.param('messageId');
  const body = await c.req.json().catch(() => null);
  const parsed = MessageFeedbackSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation error', details: parsed.error.flatten() }, 422);
  }

  // Verify user is a member of this conversation
  const memberRows = await sql`
    SELECT id FROM conversation_members
    WHERE conversation_id = ${conversationId} AND user_id = ${userId}
    LIMIT 1
  `;
  if (memberRows.length === 0) {
    return c.json({ error: 'Not found', message: 'Conversation not found or access denied' }, 404);
  }

  // Get the agent_id from the conversation and verify message exists in it
  const convRows = await sql`
    SELECT c.agent_id FROM conversations c
    WHERE c.id = ${conversationId} AND c.agent_id IS NOT NULL
    LIMIT 1
  `;
  if (convRows.length === 0) {
    return c.json({ error: 'Not found', message: 'Agent conversation not found' }, 404);
  }

  const msgRows = await sql`
    SELECT id FROM messages
    WHERE id = ${messageId} AND conversation_id = ${conversationId} AND sender_type = 'agent'
    LIMIT 1
  `;
  if (msgRows.length === 0) {
    return c.json({ error: 'Not found', message: 'Agent message not found in this conversation' }, 404);
  }

  const agentId = (convRows[0] as Record<string, unknown>)['agent_id'] as string;

  const result = await submitMessageFeedback(
    conversationId, messageId, userId, agentId,
    parsed.data.feedback, parsed.data.reason,
  );
  return c.json({ feedback: result }, 201);
});

// GET /:id/should-prompt-feedback — check if we should ask for feedback
conversationRoutes.get('/:id/should-prompt-feedback', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const conversationId = c.req.param('id');

  // Verify user is a member of this conversation
  const memberRows = await sql`
    SELECT id FROM conversation_members
    WHERE conversation_id = ${conversationId} AND user_id = ${userId}
    LIMIT 1
  `;
  if (memberRows.length === 0) {
    return c.json({ error: 'Not found', message: 'Conversation not found or access denied' }, 404);
  }

  const shouldPrompt = await shouldPromptFeedback(conversationId);
  return c.json({ should_prompt: shouldPrompt }, 200);
});
