import { z } from 'zod';

const stripHtml = (v: string) => v.replace(/<[^>]*>/g, '');

export const MemoryTypeEnum = z.enum([
  'fact',
  'preference',
  'context',
  'relationship',
  'episodic',
  'semantic',
  'procedural',
]);

export const ConsolidationTypeEnum = z.enum(['merge', 'abstract', 'reinforce']);

export const CreateMemorySchema = z.object({
  memory_type: MemoryTypeEnum,
  content: z.string().min(1).max(10000).transform(stripHtml),
  embedding_key: z.string().max(256).optional(),
  embedding_text: z.string().max(10000).transform(stripHtml).optional(),
  importance: z.number().min(0).max(1).optional(),
  source_conversation_id: z.string().uuid().optional(),
  source_message_id: z.string().uuid().optional(),
  expires_at: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const UpdateMemorySchema = z.object({
  content: z.string().min(1).max(10000).transform(stripHtml).optional(),
  memory_type: MemoryTypeEnum.optional(),
  importance: z.number().min(0).max(1).optional(),
  embedding_key: z.string().max(256).nullable().optional(),
  embedding_text: z.string().max(10000).nullable().optional(),
  expires_at: z.string().datetime().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const MemorySearchSchema = z.object({
  query: z.string().min(1).max(1000).transform(stripHtml),
  memory_type: MemoryTypeEnum.optional(),
  limit: z.number().int().min(1).max(100).optional(),
  min_importance: z.number().min(0).max(1).optional(),
});

export const MemoryConsolidateSchema = z.object({
  memory_ids: z.array(z.string().uuid()).min(2).max(50),
  consolidation_type: ConsolidationTypeEnum,
  result_content: z.string().min(1).max(20000).transform(stripHtml),
  result_memory_type: MemoryTypeEnum.optional(),
  result_importance: z.number().min(0).max(1).optional(),
});

export type CreateMemoryInput = z.infer<typeof CreateMemorySchema>;
export type UpdateMemoryInput = z.infer<typeof UpdateMemorySchema>;
export type MemorySearchInput = z.infer<typeof MemorySearchSchema>;
export type MemoryConsolidateInput = z.infer<typeof MemoryConsolidateSchema>;
