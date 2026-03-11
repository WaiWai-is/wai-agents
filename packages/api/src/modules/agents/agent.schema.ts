import { z } from 'zod';

const stripHtml = (v: string) => v.replace(/<[^>]*>/g, '');

const supportedModels = [
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
  'gpt-4o',
  'gpt-4o-mini',
  'o1',
  'o3',
  'o3-mini',
  'o4-mini',
] as const;

const toolSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  parameters: z.record(z.unknown()).optional(),
});

const mcpServerSchema = z.object({
  url: z.string().url(),
  name: z.string(),
});

export const CreateAgentSchema = z.object({
  name: z.string().min(1).max(64).transform(stripHtml),
  template: z.string().optional(),
  description: z.string().optional().transform((v) => (v !== undefined ? stripHtml(v) : v)),
  system_prompt: z.string().max(50000).optional(),
  model: z.enum(supportedModels).optional(),
  tools: z.array(toolSchema).optional(),
  mcp_servers: z.array(mcpServerSchema).optional(),
  visibility: z.enum(['public', 'private', 'unlisted']).optional(),
  category: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().min(1).max(200000).optional(),
});

export const UpdateAgentSchema = z.object({
  name: z.string().min(1).max(64).transform(stripHtml).optional(),
  description: z.string().optional().transform((v) => (v !== undefined ? stripHtml(v) : v)),
  system_prompt: z.string().max(50000).optional(),
  model: z.enum(supportedModels).optional(),
  tools: z.array(toolSchema).optional(),
  mcp_servers: z.array(mcpServerSchema).optional(),
  visibility: z.enum(['public', 'private', 'unlisted']).optional(),
  category: z.string().optional(),
  avatar_url: z.string().url().optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().min(1).max(200000).optional(),
});

export type CreateAgentInput = z.infer<typeof CreateAgentSchema>;
export type UpdateAgentInput = z.infer<typeof UpdateAgentSchema>;
