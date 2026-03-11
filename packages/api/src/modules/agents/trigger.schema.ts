import { TriggerConditionGroupSchema } from '@wai-agents/shared';
import { z } from 'zod';

const stripHtml = (v: string) => v.replace(/<[^>]*>/g, '');

export const CreateTriggerSchema = z.object({
  name: z.string().min(1).max(64).transform(stripHtml),
  trigger_type: z.enum(['webhook', 'schedule', 'condition']),
  hmac_secret: z.string().max(128).optional(),
  condition_filter: TriggerConditionGroupSchema.optional(),
  message_template: z.string().max(10000).optional(),
  cron_expression: z.string().max(32).optional(),
  enabled: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const UpdateTriggerSchema = z.object({
  name: z.string().min(1).max(64).transform(stripHtml).optional(),
  hmac_secret: z.string().max(128).nullable().optional(),
  condition_filter: TriggerConditionGroupSchema.nullable().optional(),
  message_template: z.string().max(10000).nullable().optional(),
  cron_expression: z.string().max(32).nullable().optional(),
  enabled: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type CreateTriggerInput = z.infer<typeof CreateTriggerSchema>;
export type UpdateTriggerInput = z.infer<typeof UpdateTriggerSchema>;
