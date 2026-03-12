import { integer, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { agents } from './agents.js';
import { conversations } from './conversations.js';
import { users } from './users.js';

export const agentCollaborations = pgTable('agent_collaborations', {
  id: uuid('id').primaryKey().defaultRandom(),
  requesterAgentId: uuid('requester_agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  responderAgentId: uuid('responder_agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  requesterUserId: uuid('requester_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  priority: varchar('priority', { length: 10 }).notNull().default('normal'),
  taskDescription: text('task_description').notNull(),
  context: jsonb('context'),
  taskResult: text('task_result'),
  parentRequestId: uuid('parent_request_id'),
  metadata: jsonb('metadata').default({}),
  insertedAt: timestamp('inserted_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export type AgentCollaboration = typeof agentCollaborations.$inferSelect;
export type NewAgentCollaboration = typeof agentCollaborations.$inferInsert;

export const collaborationMessages = pgTable('collaboration_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  requestId: uuid('request_id')
    .notNull()
    .references(() => agentCollaborations.id, { onDelete: 'cascade' }),
  fromAgentId: uuid('from_agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  messageType: varchar('message_type', { length: 20 }).notNull().default('status_update'),
  insertedAt: timestamp('inserted_at', { withTimezone: true }).defaultNow(),
});

export type CollaborationMessage = typeof collaborationMessages.$inferSelect;
export type NewCollaborationMessage = typeof collaborationMessages.$inferInsert;

export const agentCapabilities = pgTable('agent_capabilities', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' })
    .unique(),
  capabilities: jsonb('capabilities').notNull().default([]),
  maxConcurrentTasks: integer('max_concurrent_tasks').notNull().default(1),
  availabilityStatus: varchar('availability_status', { length: 10 }).notNull().default('available'),
  insertedAt: timestamp('inserted_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export type AgentCapabilityRow = typeof agentCapabilities.$inferSelect;
export type NewAgentCapabilityRow = typeof agentCapabilities.$inferInsert;
