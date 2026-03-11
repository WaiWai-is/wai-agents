import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  bigint,
  doublePrecision,
  jsonb,
  timestamp,
  customType,
} from 'drizzle-orm/pg-core';
import { users } from './users.js';

// pgvector custom type for vector(1536)
const vector = customType<{ data: number[]; driverData: string; config: { dimensions: number } }>({
  dataType(config) {
    return config?.dimensions ? `vector(${config.dimensions})` : 'vector';
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    return value
      .slice(1, -1)
      .split(',')
      .map(Number);
  },
});

export const agents = pgTable('agents', {
  id: uuid('id').primaryKey().defaultRandom(),
  creatorId: uuid('creator_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 64 }),
  slug: varchar('slug', { length: 64 }).unique(),
  description: text('description'),
  avatarUrl: text('avatar_url'),
  systemPrompt: text('system_prompt').notNull(),
  model: varchar('model', { length: 64 }).default('claude-sonnet-4-6'),
  temperature: doublePrecision('temperature').default(0.7),
  maxTokens: integer('max_tokens').default(4096),
  tools: jsonb('tools').default([]),
  mcpServers: jsonb('mcp_servers').default([]),
  visibility: varchar('visibility', { length: 16 }).default('private'),
  category: varchar('category', { length: 32 }),
  usageCount: bigint('usage_count', { mode: 'number' }).default(0),
  ratingSum: integer('rating_sum').default(0),
  ratingCount: integer('rating_count').default(0),
  executionMode: varchar('execution_mode', { length: 20 }).default('raw'),
  metadata: jsonb('metadata').default({}),
  insertedAt: timestamp('inserted_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;

export const agentUsageLogs = pgTable('agent_usage_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  model: text('model'),
  inputTokens: integer('input_tokens').default(0),
  outputTokens: integer('output_tokens').default(0),
  insertedAt: timestamp('inserted_at', { withTimezone: true }).defaultNow(),
});

export type AgentUsageLog = typeof agentUsageLogs.$inferSelect;
export type NewAgentUsageLog = typeof agentUsageLogs.$inferInsert;

export const agentSchedules = pgTable('agent_schedules', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  scheduleType: varchar('schedule_type', { length: 20 }),
  cronExpression: varchar('cron_expression', { length: 100 }),
  intervalSeconds: integer('interval_seconds'),
  runAt: timestamp('run_at', { withTimezone: true }),
  enabled: boolean('enabled').default(true),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }),
  runCount: integer('run_count').default(0),
  maxRuns: integer('max_runs'),
  payload: jsonb('payload').default({}),
  metadata: jsonb('metadata').default({}),
  insertedAt: timestamp('inserted_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export type AgentSchedule = typeof agentSchedules.$inferSelect;
export type NewAgentSchedule = typeof agentSchedules.$inferInsert;

export const agentMemories = pgTable('agent_memories', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  content: text('content'),
  embedding: vector('embedding', { dimensions: 1536 }),
  importance: doublePrecision('importance').default(0.5),
  memoryType: varchar('memory_type', { length: 20 }).default('observation'),
  tags: text('tags').array().default([]),
  accessCount: integer('access_count').default(0),
  lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }),
  decayFactor: doublePrecision('decay_factor').default(1.0),
  metadata: jsonb('metadata').default({}),
  insertedAt: timestamp('inserted_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export type AgentMemory = typeof agentMemories.$inferSelect;
export type NewAgentMemory = typeof agentMemories.$inferInsert;

export const agentEvents = pgTable('agent_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id'),
  eventType: varchar('event_type', { length: 30 }),
  triggerType: varchar('trigger_type', { length: 20 }),
  durationMs: integer('duration_ms'),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  model: varchar('model', { length: 64 }),
  status: varchar('status', { length: 20 }),
  errorCode: varchar('error_code', { length: 50 }),
  errorMessage: text('error_message'),
  metadata: jsonb('metadata').default({}),
  insertedAt: timestamp('inserted_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export type AgentEvent = typeof agentEvents.$inferSelect;
export type NewAgentEvent = typeof agentEvents.$inferInsert;

export const agentCoreMemories = pgTable('agent_core_memories', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  blockLabel: varchar('block_label', { length: 20 }).notNull(),
  content: text('content').notNull(),
  insertedAt: timestamp('inserted_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export type AgentCoreMemory = typeof agentCoreMemories.$inferSelect;
export type NewAgentCoreMemory = typeof agentCoreMemories.$inferInsert;

export const agentTasks = pgTable('agent_tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  callerAgentId: uuid('caller_agent_id').references(() => agents.id, { onDelete: 'set null' }),
  calleeAgentId: uuid('callee_agent_id').notNull().references(() => agents.id, { onDelete: 'set null' }),
  conversationId: uuid('conversation_id'),
  status: varchar('status', { length: 20 }).default('submitted'),
  message: text('message'),
  result: text('result'),
  errorMessage: text('error_message'),
  a2aDepth: integer('a2a_depth').default(0),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  durationMs: integer('duration_ms'),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  insertedAt: timestamp('inserted_at', { withTimezone: true }).defaultNow(),
});

export type AgentTask = typeof agentTasks.$inferSelect;
export type NewAgentTask = typeof agentTasks.$inferInsert;
