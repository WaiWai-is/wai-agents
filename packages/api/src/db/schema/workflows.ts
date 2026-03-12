import { integer, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { agents } from './agents.js';
import { users } from './users.js';

export const agentWorkflows = pgTable('agent_workflows', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  creatorId: uuid('creator_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 64 }).notNull(),
  description: text('description'),
  status: varchar('status', { length: 16 }).notNull().default('draft'),
  triggerConfig: jsonb('trigger_config'),
  maxConcurrentRuns: integer('max_concurrent_runs').default(1),
  metadata: jsonb('metadata').default({}),
  insertedAt: timestamp('inserted_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export type AgentWorkflow = typeof agentWorkflows.$inferSelect;
export type NewAgentWorkflow = typeof agentWorkflows.$inferInsert;

export const workflowSteps = pgTable('workflow_steps', {
  id: uuid('id').primaryKey().defaultRandom(),
  workflowId: uuid('workflow_id')
    .notNull()
    .references(() => agentWorkflows.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 64 }).notNull(),
  stepType: varchar('step_type', { length: 20 }).notNull(),
  config: jsonb('config').notNull().default({}),
  position: integer('position').notNull().default(0),
  timeoutMs: integer('timeout_ms').default(300000),
  retryConfig: jsonb('retry_config'),
  metadata: jsonb('metadata').default({}),
  insertedAt: timestamp('inserted_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export type WorkflowStep = typeof workflowSteps.$inferSelect;
export type NewWorkflowStep = typeof workflowSteps.$inferInsert;

export const workflowEdges = pgTable('workflow_edges', {
  id: uuid('id').primaryKey().defaultRandom(),
  workflowId: uuid('workflow_id')
    .notNull()
    .references(() => agentWorkflows.id, { onDelete: 'cascade' }),
  sourceStepId: uuid('source_step_id')
    .notNull()
    .references(() => workflowSteps.id, { onDelete: 'cascade' }),
  targetStepId: uuid('target_step_id')
    .notNull()
    .references(() => workflowSteps.id, { onDelete: 'cascade' }),
  condition: jsonb('condition'),
  label: varchar('label', { length: 32 }),
  insertedAt: timestamp('inserted_at', { withTimezone: true }).defaultNow(),
});

export type WorkflowEdge = typeof workflowEdges.$inferSelect;
export type NewWorkflowEdge = typeof workflowEdges.$inferInsert;

export const workflowRuns = pgTable('workflow_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  workflowId: uuid('workflow_id')
    .notNull()
    .references(() => agentWorkflows.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id'),
  status: varchar('status', { length: 16 }).notNull().default('pending'),
  input: jsonb('input').default({}),
  result: jsonb('result'),
  errorMessage: text('error_message'),
  totalDurationMs: integer('total_duration_ms'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  insertedAt: timestamp('inserted_at', { withTimezone: true }).defaultNow(),
});

export type WorkflowRun = typeof workflowRuns.$inferSelect;
export type NewWorkflowRun = typeof workflowRuns.$inferInsert;

export const workflowStepRuns = pgTable('workflow_step_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  workflowRunId: uuid('workflow_run_id')
    .notNull()
    .references(() => workflowRuns.id, { onDelete: 'cascade' }),
  stepId: uuid('step_id')
    .notNull()
    .references(() => workflowSteps.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 16 }).notNull().default('pending'),
  input: jsonb('input'),
  output: jsonb('output'),
  errorMessage: text('error_message'),
  retryCount: integer('retry_count').default(0),
  durationMs: integer('duration_ms'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  insertedAt: timestamp('inserted_at', { withTimezone: true }).defaultNow(),
});

export type WorkflowStepRun = typeof workflowStepRuns.$inferSelect;
export type NewWorkflowStepRun = typeof workflowStepRuns.$inferInsert;
