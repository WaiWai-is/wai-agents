import { z } from 'zod';

const stripHtml = (v: string) => v.replace(/<[^>]*>/g, '');

export const CreateWorkflowSchema = z.object({
  name: z.string().min(1).max(64).transform(stripHtml),
  description: z.string().max(2000).transform(stripHtml).optional(),
  status: z.enum(['draft', 'active', 'paused', 'archived']).optional(),
  trigger_config: z.record(z.unknown()).optional(),
  max_concurrent_runs: z.number().int().min(1).max(100).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const UpdateWorkflowSchema = z.object({
  name: z.string().min(1).max(64).transform(stripHtml).optional(),
  description: z.string().max(2000).transform(stripHtml).nullable().optional(),
  status: z.enum(['draft', 'active', 'paused', 'archived']).optional(),
  trigger_config: z.record(z.unknown()).nullable().optional(),
  max_concurrent_runs: z.number().int().min(1).max(100).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const CreateStepSchema = z.object({
  name: z.string().min(1).max(64).transform(stripHtml),
  step_type: z.enum([
    'prompt',
    'tool_call',
    'condition',
    'transform',
    'wait',
    'sub_workflow',
    'human_input',
  ]),
  config: z.record(z.unknown()).optional(),
  position: z.number().int().min(0).optional(),
  timeout_ms: z.number().int().min(1000).max(3600000).optional(),
  retry_config: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const UpdateStepSchema = z.object({
  name: z.string().min(1).max(64).transform(stripHtml).optional(),
  step_type: z
    .enum(['prompt', 'tool_call', 'condition', 'transform', 'wait', 'sub_workflow', 'human_input'])
    .optional(),
  config: z.record(z.unknown()).optional(),
  position: z.number().int().min(0).optional(),
  timeout_ms: z.number().int().min(1000).max(3600000).optional(),
  retry_config: z.record(z.unknown()).nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const CreateEdgeSchema = z.object({
  source_step_id: z.string().uuid(),
  target_step_id: z.string().uuid(),
  condition: z.record(z.unknown()).optional(),
  label: z.string().max(32).transform(stripHtml).optional(),
});

export const RunWorkflowSchema = z.object({
  input: z.record(z.unknown()).optional(),
  conversation_id: z.string().uuid().optional(),
});

export type CreateWorkflowInput = z.infer<typeof CreateWorkflowSchema>;
export type UpdateWorkflowInput = z.infer<typeof UpdateWorkflowSchema>;
export type CreateStepInput = z.infer<typeof CreateStepSchema>;
export type UpdateStepInput = z.infer<typeof UpdateStepSchema>;
export type CreateEdgeInput = z.infer<typeof CreateEdgeSchema>;
export type RunWorkflowInput = z.infer<typeof RunWorkflowSchema>;
