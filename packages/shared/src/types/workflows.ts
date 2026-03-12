import { z } from 'zod';

/* ---- Status Types ---- */

export type WorkflowStatus = 'draft' | 'active' | 'paused' | 'archived';

export type WorkflowStepType =
  | 'prompt'
  | 'tool_call'
  | 'condition'
  | 'transform'
  | 'wait'
  | 'sub_workflow'
  | 'human_input';

export type WorkflowRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export type WorkflowStepRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

/* ---- Interfaces ---- */

export interface AgentWorkflow {
  id: string;
  agent_id: string;
  creator_id: string;
  name: string;
  description: string | null;
  status: WorkflowStatus;
  trigger_config: Record<string, unknown> | null;
  max_concurrent_runs: number;
  metadata: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
}

export interface WorkflowStep {
  id: string;
  workflow_id: string;
  name: string;
  step_type: WorkflowStepType;
  config: Record<string, unknown>;
  position: number;
  timeout_ms: number;
  retry_config: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
}

export interface WorkflowEdge {
  id: string;
  workflow_id: string;
  source_step_id: string;
  target_step_id: string;
  condition: Record<string, unknown> | null;
  label: string | null;
  created_at: string | null;
}

export interface WorkflowRun {
  id: string;
  workflow_id: string;
  agent_id: string;
  user_id: string;
  conversation_id: string | null;
  status: WorkflowRunStatus;
  input: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error_message: string | null;
  total_duration_ms: number | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string | null;
}

export interface WorkflowStepRun {
  id: string;
  workflow_run_id: string;
  step_id: string;
  status: WorkflowStepRunStatus;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error_message: string | null;
  retry_count: number;
  duration_ms: number | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string | null;
}

export interface WorkflowRunWithSteps extends WorkflowRun {
  step_runs: WorkflowStepRun[];
}

/* ---- Socket.IO Event Schemas ---- */

export const WorkflowRunStartedEventSchema = z.object({
  type: z.literal('workflow:run_started'),
  workflow_id: z.string(),
  run_id: z.string(),
  agent_id: z.string(),
});

export const WorkflowStepStartedEventSchema = z.object({
  type: z.literal('workflow:step_started'),
  workflow_id: z.string(),
  run_id: z.string(),
  step_id: z.string(),
  step_name: z.string(),
});

export const WorkflowStepCompletedEventSchema = z.object({
  type: z.literal('workflow:step_completed'),
  workflow_id: z.string(),
  run_id: z.string(),
  step_id: z.string(),
  step_name: z.string(),
  status: z.string(),
});

export const WorkflowRunCompletedEventSchema = z.object({
  type: z.literal('workflow:run_completed'),
  workflow_id: z.string(),
  run_id: z.string(),
  total_duration_ms: z.number(),
});

export const WorkflowRunFailedEventSchema = z.object({
  type: z.literal('workflow:run_failed'),
  workflow_id: z.string(),
  run_id: z.string(),
  error: z.string(),
});

export type WorkflowRunStartedEvent = z.infer<typeof WorkflowRunStartedEventSchema>;
export type WorkflowStepStartedEvent = z.infer<typeof WorkflowStepStartedEventSchema>;
export type WorkflowStepCompletedEvent = z.infer<typeof WorkflowStepCompletedEventSchema>;
export type WorkflowRunCompletedEvent = z.infer<typeof WorkflowRunCompletedEventSchema>;
export type WorkflowRunFailedEvent = z.infer<typeof WorkflowRunFailedEventSchema>;
export type WorkflowEvent =
  | WorkflowRunStartedEvent
  | WorkflowStepStartedEvent
  | WorkflowStepCompletedEvent
  | WorkflowRunCompletedEvent
  | WorkflowRunFailedEvent;
