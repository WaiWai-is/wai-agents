import { z } from 'zod';

const stripHtml = (v: string) => v.replace(/<[^>]*>/g, '');

export const CreateCollaborationSchema = z.object({
  responder_agent_id: z.string().uuid(),
  task_description: z.string().min(1).max(10000).transform(stripHtml),
  conversation_id: z.string().uuid(),
  context: z.record(z.unknown()).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  parent_request_id: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const CompleteCollaborationSchema = z.object({
  result: z.string().min(1).max(50000),
});

export const RejectCollaborationSchema = z.object({
  reason: z.string().min(1).max(1000).transform(stripHtml),
});

export const UpdateCollaborationProgressSchema = z.object({
  status: z.enum(['in_progress', 'failed']),
  message: z.string().min(1).max(10000).transform(stripHtml),
});

export const RegisterCapabilitiesSchema = z.object({
  capabilities: z.array(z.string().min(1).max(128).transform(stripHtml)).min(1).max(50),
  max_concurrent_tasks: z.number().int().min(1).max(100).optional(),
});

export const SearchCapabilitiesSchema = z.object({
  capability: z.string().min(1).max(128),
  limit: z.number().int().min(1).max(100).optional(),
});

export type CreateCollaborationInput = z.infer<typeof CreateCollaborationSchema>;
export type CompleteCollaborationInput = z.infer<typeof CompleteCollaborationSchema>;
export type RejectCollaborationInput = z.infer<typeof RejectCollaborationSchema>;
export type UpdateCollaborationProgressInput = z.infer<typeof UpdateCollaborationProgressSchema>;
export type RegisterCapabilitiesInput = z.infer<typeof RegisterCapabilitiesSchema>;
export type SearchCapabilitiesInput = z.infer<typeof SearchCapabilitiesSchema>;
