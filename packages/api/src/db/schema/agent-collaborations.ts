import { jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
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
  taskDescription: text('task_description').notNull(),
  taskResult: text('task_result'),
  metadata: jsonb('metadata').default({}),
  insertedAt: timestamp('inserted_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export type AgentCollaboration = typeof agentCollaborations.$inferSelect;
export type NewAgentCollaboration = typeof agentCollaborations.$inferInsert;
