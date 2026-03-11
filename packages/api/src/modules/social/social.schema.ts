import { z } from 'zod';

export const RateAgentSchema = z.object({
  rating: z.number().int().min(1).max(5),
  review: z.string().max(2000).optional(),
  accuracy_score: z.number().int().min(1).max(5).optional(),
  helpfulness_score: z.number().int().min(1).max(5).optional(),
  speed_score: z.number().int().min(1).max(5).optional(),
  conversation_id: z.string().uuid().optional(),
  message_id: z.string().uuid().optional(),
});

export const MessageFeedbackSchema = z.object({
  feedback: z.enum(['positive', 'negative']),
  reason: z.string().max(30).optional(),
});

export type RateAgentInput = z.infer<typeof RateAgentSchema>;
export type MessageFeedbackInput = z.infer<typeof MessageFeedbackSchema>;
