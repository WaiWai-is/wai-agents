import { z } from 'zod';

/* ---- Condition Engine Types ---- */

export const TriggerConditionSchema = z.object({
  field: z.string().min(1),
  op: z.enum(['eq', 'neq', 'contains', 'exists']),
  value: z.string().optional(),
});

export type TriggerCondition = z.infer<typeof TriggerConditionSchema>;

export const TriggerConditionGroupSchema = z.object({
  all: z.array(TriggerConditionSchema).optional(),
  any: z.array(TriggerConditionSchema).optional(),
});

export type TriggerConditionGroup = z.infer<typeof TriggerConditionGroupSchema>;

/* ---- Agent Trigger Interface ---- */

export interface AgentTrigger {
  id: string;
  agent_id: string;
  creator_id: string;
  name: string;
  trigger_type: 'webhook' | 'schedule' | 'condition';
  token: string;
  hmac_secret: string | null;
  condition_filter: TriggerConditionGroup | null;
  message_template: string | null;
  cron_expression: string | null;
  enabled: boolean;
  last_fired_at: string | null;
  fire_count: number;
  metadata: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
}

/* ---- Payloads ---- */

export interface CreateTriggerPayload {
  name: string;
  trigger_type: 'webhook' | 'schedule' | 'condition';
  hmac_secret?: string;
  condition_filter?: TriggerConditionGroup;
  message_template?: string;
  cron_expression?: string;
  enabled?: boolean;
  metadata?: Record<string, unknown>;
}

export interface UpdateTriggerPayload {
  name?: string;
  hmac_secret?: string | null;
  condition_filter?: TriggerConditionGroup | null;
  message_template?: string | null;
  cron_expression?: string | null;
  enabled?: boolean;
  metadata?: Record<string, unknown>;
}

/* ---- Socket.IO Event ---- */

export const TriggerFiredEventSchema = z.object({
  type: z.literal('trigger:fired'),
  trigger_id: z.string(),
  agent_id: z.string(),
  trigger_type: z.string(),
  conversation_id: z.string(),
  fired_at: z.string(),
});

export type TriggerFiredEvent = z.infer<typeof TriggerFiredEventSchema>;
