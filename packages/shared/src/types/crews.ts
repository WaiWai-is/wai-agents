import { z } from 'zod';

export const CrewStepSchema = z.object({
  agentId: z.string().uuid(),
  role: z.string().min(1).max(64),
  parallelGroup: z.string().max(32).optional(),
});

export type CrewStep = z.infer<typeof CrewStepSchema>;

export interface CrewConfig {
  id: string;
  creator_id: string;
  name: string;
  slug: string | null;
  description: string | null;
  visibility: string;
  steps: CrewStep[];
  category: string | null;
  usage_count: number;
  rating_sum: number;
  rating_count: number;
  metadata: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
}

/* ---- Crew Socket.IO events ---- */

export const CrewStepStartedEventSchema = z.object({
  type: z.literal('crew:step_started'),
  crew_id: z.string(),
  step_index: z.number(),
  agent_id: z.string(),
  role: z.string(),
  parallel_group: z.string().optional(),
});

export const CrewStepCompletedEventSchema = z.object({
  type: z.literal('crew:step_completed'),
  crew_id: z.string(),
  step_index: z.number(),
  agent_id: z.string(),
  role: z.string(),
  response: z.string(),
});

export const CrewFinishedEventSchema = z.object({
  type: z.literal('crew:finished'),
  crew_id: z.string(),
  total_steps: z.number(),
  final_response: z.string(),
});

export const CrewErrorEventSchema = z.object({
  type: z.literal('crew:error'),
  crew_id: z.string(),
  error: z.string(),
  step_index: z.number().optional(),
});

export type CrewStepStartedEvent = z.infer<typeof CrewStepStartedEventSchema>;
export type CrewStepCompletedEvent = z.infer<typeof CrewStepCompletedEventSchema>;
export type CrewFinishedEvent = z.infer<typeof CrewFinishedEventSchema>;
export type CrewErrorEvent = z.infer<typeof CrewErrorEventSchema>;
export type CrewEvent =
  | CrewStepStartedEvent
  | CrewStepCompletedEvent
  | CrewFinishedEvent
  | CrewErrorEvent;
