import { z } from 'zod';

/* ---- Memory Types ---- */

export const MemoryTypeSchema = z.enum([
  'fact',
  'preference',
  'context',
  'relationship',
  'episodic',
  'semantic',
  'procedural',
]);

export type AgentMemoryType = z.infer<typeof MemoryTypeSchema>;

/* ---- Consolidation Types ---- */

export const ConsolidationTypeSchema = z.enum(['merge', 'abstract', 'reinforce']);

export type ConsolidationType = z.infer<typeof ConsolidationTypeSchema>;

/* ---- Agent Memory Interface ---- */

export interface AgentMemory {
  id: string;
  agent_id: string;
  user_id: string;
  memory_type: AgentMemoryType;
  content: string;
  embedding_key: string | null;
  embedding_text: string | null;
  importance: number;
  access_count: number;
  last_accessed_at: string | null;
  source_conversation_id: string | null;
  source_message_id: string | null;
  expires_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
}

/* ---- Memory Consolidation Interface ---- */

export interface MemoryConsolidation {
  id: string;
  agent_id: string;
  source_memory_ids: string[];
  result_memory_id: string;
  consolidation_type: ConsolidationType;
  created_at: string | null;
}

/* ---- Memory Stats Interface ---- */

export interface MemoryStats {
  total: number;
  by_type: Record<string, number>;
  avg_importance: number;
  total_consolidations: number;
}

/* ---- Input Interfaces ---- */

export interface CreateMemoryInput {
  memory_type: AgentMemoryType;
  content: string;
  embedding_key?: string;
  embedding_text?: string;
  importance?: number;
  source_conversation_id?: string;
  source_message_id?: string;
  expires_at?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateMemoryInput {
  content?: string;
  memory_type?: AgentMemoryType;
  importance?: number;
  embedding_key?: string | null;
  embedding_text?: string | null;
  expires_at?: string | null;
  metadata?: Record<string, unknown>;
}

/* ---- Zod Schemas ---- */

export const AgentMemorySchema = z.object({
  id: z.string().uuid(),
  agent_id: z.string().uuid(),
  user_id: z.string().uuid(),
  memory_type: MemoryTypeSchema,
  content: z.string(),
  embedding_key: z.string().nullable(),
  embedding_text: z.string().nullable(),
  importance: z.number(),
  access_count: z.number(),
  last_accessed_at: z.string().nullable(),
  source_conversation_id: z.string().uuid().nullable(),
  source_message_id: z.string().uuid().nullable(),
  expires_at: z.string().nullable(),
  metadata: z.record(z.unknown()),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export const CreateMemorySchema = z.object({
  memory_type: MemoryTypeSchema,
  content: z.string().min(1).max(10000),
  embedding_key: z.string().max(256).optional(),
  embedding_text: z.string().max(10000).optional(),
  importance: z.number().min(0).max(1).optional(),
  source_conversation_id: z.string().uuid().optional(),
  source_message_id: z.string().uuid().optional(),
  expires_at: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const MemorySearchSchema = z.object({
  query: z.string().min(1).max(1000),
  memory_type: MemoryTypeSchema.optional(),
  limit: z.number().int().min(1).max(100).optional(),
  min_importance: z.number().min(0).max(1).optional(),
});

export const MemoryConsolidateSchema = z.object({
  memory_ids: z.array(z.string().uuid()).min(2).max(50),
  consolidation_type: ConsolidationTypeSchema,
  result_content: z.string().min(1).max(20000),
  result_memory_type: MemoryTypeSchema.optional(),
  result_importance: z.number().min(0).max(1).optional(),
});

export const MemoryConsolidationSchema = z.object({
  id: z.string().uuid(),
  agent_id: z.string().uuid(),
  source_memory_ids: z.array(z.string().uuid()),
  result_memory_id: z.string().uuid(),
  consolidation_type: ConsolidationTypeSchema,
  created_at: z.string().nullable(),
});

/* ---- Socket Events ---- */

export const MemoryCreatedEventSchema = z.object({
  type: z.literal('memory:created'),
  agent_id: z.string(),
  memory_id: z.string(),
  memory_type: MemoryTypeSchema,
  content_preview: z.string(),
});

export const MemoryConsolidatedEventSchema = z.object({
  type: z.literal('memory:consolidated'),
  agent_id: z.string(),
  consolidation_id: z.string(),
  source_count: z.number(),
  consolidation_type: ConsolidationTypeSchema,
});

export const MemoryRecalledEventSchema = z.object({
  type: z.literal('memory:recalled'),
  agent_id: z.string(),
  memory_count: z.number(),
  query: z.string(),
});

export type MemoryCreatedEvent = z.infer<typeof MemoryCreatedEventSchema>;
export type MemoryConsolidatedEvent = z.infer<typeof MemoryConsolidatedEventSchema>;
export type MemoryRecalledEvent = z.infer<typeof MemoryRecalledEventSchema>;
export type MemoryEvent = MemoryCreatedEvent | MemoryConsolidatedEvent | MemoryRecalledEvent;
