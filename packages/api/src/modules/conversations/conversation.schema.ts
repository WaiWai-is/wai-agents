import { z } from 'zod';
import { ContentBlockSchema } from '@wai-agents/shared';

export const CreateConversationSchema = z.object({
  title: z.string().max(255).optional(),
  type: z.enum(['dm', 'group', 'agent']),
  member_ids: z.array(z.string().uuid()).optional(),
});

export const UpdateConversationSchema = z.object({
  title: z.string().max(255).optional(),
  avatar_url: z.string().url().optional(),
});

export const SendMessageSchema = z.object({
  content: z.array(ContentBlockSchema).min(1).refine(
    (blocks) => JSON.stringify(blocks).length <= 100000,
    { message: 'Message content too large (max 100KB)' }
  ),
});

export const AddMemberSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(['member', 'admin']).optional().default('member'),
});

export type CreateConversationInput = z.infer<typeof CreateConversationSchema>;
export type UpdateConversationInput = z.infer<typeof UpdateConversationSchema>;
export type SendMessageInput = z.infer<typeof SendMessageSchema>;
export type AddMemberInput = z.infer<typeof AddMemberSchema>;
