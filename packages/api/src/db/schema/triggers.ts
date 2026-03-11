import {
  bigint,
  boolean,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { agents } from './agents.js';
import { users } from './users.js';

export const agentTriggers = pgTable('agent_triggers', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  creatorId: uuid('creator_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 64 }).notNull(),
  triggerType: varchar('trigger_type', { length: 16 }).notNull(),
  token: varchar('token', { length: 64 }).unique().notNull(),
  hmacSecret: varchar('hmac_secret', { length: 128 }),
  conditionFilter: jsonb('condition_filter'),
  messageTemplate: text('message_template'),
  cronExpression: varchar('cron_expression', { length: 32 }),
  enabled: boolean('enabled').default(true),
  lastFiredAt: timestamp('last_fired_at', { withTimezone: true }),
  fireCount: bigint('fire_count', { mode: 'number' }).default(0),
  metadata: jsonb('metadata').default({}),
  insertedAt: timestamp('inserted_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export type AgentTrigger = typeof agentTriggers.$inferSelect;
export type NewAgentTrigger = typeof agentTriggers.$inferInsert;
