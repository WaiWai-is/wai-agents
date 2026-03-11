import { z } from 'zod';

const stripHtml = (v: string) => v.replace(/<[^>]*>/g, '');

export const CreateCollaborationSchema = z.object({
  responder_agent_id: z.string().uuid(),
  task_description: z.string().min(1).max(10000).transform(stripHtml),
  metadata: z.record(z.unknown()).optional(),
});

export const CompleteCollaborationSchema = z.object({
  result: z.string().min(1).max(50000),
});

export const RejectCollaborationSchema = z.object({
  reason: z.string().min(1).max(1000).transform(stripHtml),
});

export type CreateCollaborationInput = z.infer<typeof CreateCollaborationSchema>;
export type CompleteCollaborationInput = z.infer<typeof CompleteCollaborationSchema>;
export type RejectCollaborationInput = z.infer<typeof RejectCollaborationSchema>;
