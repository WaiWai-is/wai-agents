import { pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { agents } from './agents.js';

export const memoryConsolidations = pgTable('memory_consolidations', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  sourceMemoryIds: uuid('source_memory_ids').array().notNull(),
  resultMemoryId: uuid('result_memory_id').notNull(),
  consolidationType: varchar('consolidation_type', { length: 20 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export type MemoryConsolidation = typeof memoryConsolidations.$inferSelect;
export type NewMemoryConsolidation = typeof memoryConsolidations.$inferInsert;
