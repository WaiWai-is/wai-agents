import { z } from 'zod';

export const RunStartedEventSchema = z.object({
  type: z.literal('run_started'),
  run_id: z.string(),
  agent_id: z.string(),
});

export const TextDeltaEventSchema = z.object({
  type: z.literal('text_delta'),
  text: z.string(),
});

export const ToolCallStartEventSchema = z.object({
  type: z.literal('tool_call_start'),
  name: z.string(),
  call_id: z.string(),
  input: z.unknown().optional(),
});

export const ToolCallEndEventSchema = z.object({
  type: z.literal('tool_call_end'),
  name: z.string(),
  call_id: z.string(),
  result: z.string(),
  duration_ms: z.number(),
});

export const StepStartedEventSchema = z.object({
  type: z.literal('step_started'),
  step: z.string(),
  index: z.number(),
});

export const ThinkingEventSchema = z.object({
  type: z.literal('thinking'),
  summary: z.string(),
});

export const RunFinishedEventSchema = z.object({
  type: z.literal('run_finished'),
  usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
  }),
});

export const RunErrorEventSchema = z.object({
  type: z.literal('run_error'),
  error: z.string(),
});

export const AgentEventSchema = z.discriminatedUnion('type', [
  RunStartedEventSchema,
  TextDeltaEventSchema,
  ToolCallStartEventSchema,
  ToolCallEndEventSchema,
  StepStartedEventSchema,
  ThinkingEventSchema,
  RunFinishedEventSchema,
  RunErrorEventSchema,
]);

export type AgentEvent = z.infer<typeof AgentEventSchema>;
export type RunStartedEvent = z.infer<typeof RunStartedEventSchema>;
export type TextDeltaEvent = z.infer<typeof TextDeltaEventSchema>;
export type ToolCallStartEvent = z.infer<typeof ToolCallStartEventSchema>;
export type ToolCallEndEvent = z.infer<typeof ToolCallEndEventSchema>;
export type StepStartedEvent = z.infer<typeof StepStartedEventSchema>;
export type ThinkingEvent = z.infer<typeof ThinkingEventSchema>;
export type RunFinishedEvent = z.infer<typeof RunFinishedEventSchema>;
export type RunErrorEvent = z.infer<typeof RunErrorEventSchema>;
