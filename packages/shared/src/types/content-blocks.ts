import { z } from 'zod';

export const ActionSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(['approve', 'reject', 'custom']),
  payload: z.record(z.unknown()).optional(),
});

export type Action = z.infer<typeof ActionSchema>;

export const StepSchema = z.object({
  label: z.string(),
  status: z.enum(['pending', 'running', 'done', 'error']),
});

export type Step = z.infer<typeof StepSchema>;

export const TextBlockSchema = z.object({
  type: z.literal('text'),
  text: z.string().max(100000),
});

export const ToolCallBlockSchema = z.object({
  type: z.literal('tool_call'),
  name: z.string(),
  input: z.unknown(),
  status: z.enum(['running', 'done', 'error']),
  call_id: z.string().optional(),
});

export const ToolResultBlockSchema = z.object({
  type: z.literal('tool_result'),
  name: z.string(),
  result: z.string(),
  duration_ms: z.number(),
  is_error: z.boolean().optional(),
});

export const CodeBlockSchema = z.object({
  type: z.literal('code_block'),
  language: z.string(),
  code: z.string(),
  output: z.string().optional(),
});

export const ProposalBlockSchema = z.object({
  type: z.literal('proposal'),
  id: z.string(),
  title: z.string(),
  status: z.string(),
  actions: z.array(ActionSchema),
});

export const ProgressBlockSchema = z.object({
  type: z.literal('progress'),
  steps: z.array(StepSchema),
  current: z.number(),
});

export const ThinkingBlockSchema = z.object({
  type: z.literal('thinking'),
  summary: z.string(),
  detail: z.string().optional(),
});

export const ImageBlockSchema = z.object({
  type: z.literal('image'),
  url: z.string(),
});

export const FileBlockSchema = z.object({
  type: z.literal('file'),
  url: z.string(),
  name: z.string(),
  size: z.number(),
});

export const TableBlockSchema = z.object({
  type: z.literal('table'),
  headers: z.array(z.string()),
  rows: z.array(z.array(z.string())),
});

export const ActionCardBlockSchema = z.object({
  type: z.literal('action_card'),
  title: z.string(),
  actions: z.array(ActionSchema),
});

export const ContentBlockSchema = z.discriminatedUnion('type', [
  TextBlockSchema,
  ToolCallBlockSchema,
  ToolResultBlockSchema,
  CodeBlockSchema,
  ProposalBlockSchema,
  ProgressBlockSchema,
  ThinkingBlockSchema,
  ImageBlockSchema,
  FileBlockSchema,
  TableBlockSchema,
  ActionCardBlockSchema,
]);

export type ContentBlock = z.infer<typeof ContentBlockSchema>;
export type TextBlock = z.infer<typeof TextBlockSchema>;
export type ToolCallBlock = z.infer<typeof ToolCallBlockSchema>;
export type ToolResultBlock = z.infer<typeof ToolResultBlockSchema>;
export type CodeBlock = z.infer<typeof CodeBlockSchema>;
export type ProposalBlock = z.infer<typeof ProposalBlockSchema>;
export type ProgressBlock = z.infer<typeof ProgressBlockSchema>;
export type ThinkingBlock = z.infer<typeof ThinkingBlockSchema>;
export type ImageBlock = z.infer<typeof ImageBlockSchema>;
export type FileBlock = z.infer<typeof FileBlockSchema>;
export type TableBlock = z.infer<typeof TableBlockSchema>;
export type ActionCardBlock = z.infer<typeof ActionCardBlockSchema>;
