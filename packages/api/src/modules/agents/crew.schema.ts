import { z } from 'zod';

const stripHtml = (v: string) => v.replace(/<[^>]*>/g, '');

const crewStepSchema = z.object({
  agentId: z.string().uuid(),
  role: z.string().min(1).max(64),
  parallelGroup: z.string().max(32).optional(),
});

export const CreateCrewSchema = z.object({
  name: z.string().min(1).max(64).transform(stripHtml),
  description: z
    .string()
    .optional()
    .transform((v) => (v !== undefined ? stripHtml(v) : v)),
  steps: z.array(crewStepSchema).min(1).max(5),
  visibility: z.enum(['public', 'private', 'unlisted']).optional(),
  category: z.string().max(32).optional(),
});

export const UpdateCrewSchema = z.object({
  name: z.string().min(1).max(64).transform(stripHtml).optional(),
  description: z
    .string()
    .optional()
    .transform((v) => (v !== undefined ? stripHtml(v) : v)),
  steps: z.array(crewStepSchema).min(1).max(5).optional(),
  visibility: z.enum(['public', 'private', 'unlisted']).optional(),
  category: z.string().max(32).optional(),
});

export const RunCrewSchema = z.object({
  conversation_id: z.string().uuid(),
  message: z.string().min(1).max(100000),
});

export type CreateCrewInput = z.infer<typeof CreateCrewSchema>;
export type UpdateCrewInput = z.infer<typeof UpdateCrewSchema>;
export type RunCrewInput = z.infer<typeof RunCrewSchema>;
