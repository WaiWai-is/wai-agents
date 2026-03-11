import { z } from 'zod';

const stripHtml = (v: string) => v.replace(/<[^>]*>/g, '');

/* ---- Node Schemas ---- */

export const CreateNodeSchema = z.object({
  label: z.string().min(1).max(100).transform(stripHtml),
  name: z.string().min(1).max(200).transform(stripHtml),
  description: z.string().max(2000).transform(stripHtml).optional(),
  properties: z.record(z.unknown()).optional(),
});

export const UpdateNodeSchema = z.object({
  label: z.string().min(1).max(100).transform(stripHtml).optional(),
  name: z.string().min(1).max(200).transform(stripHtml).optional(),
  description: z.string().max(2000).transform(stripHtml).nullable().optional(),
  properties: z.record(z.unknown()).optional(),
});

/* ---- Edge Schemas ---- */

export const CreateEdgeSchema = z.object({
  source_node_id: z.string().uuid(),
  target_node_id: z.string().uuid(),
  relationship: z.string().min(1).max(100).transform(stripHtml),
  weight: z.number().min(0).max(10).optional(),
  properties: z.record(z.unknown()).optional(),
});

export const UpdateEdgeSchema = z.object({
  weight: z.number().min(0).max(10).optional(),
  properties: z.record(z.unknown()).optional(),
});

/* ---- Query Schemas ---- */

export const NeighborQuerySchema = z.object({
  depth: z.coerce.number().int().min(1).max(5).default(1),
  direction: z.enum(['in', 'out', 'both']).default('both'),
});

export const PathQuerySchema = z.object({
  source: z.string().uuid(),
  target: z.string().uuid(),
  max_depth: z.coerce.number().int().min(1).max(10).default(3),
});

/* ---- Inferred Types ---- */

export type CreateNodeInput = z.infer<typeof CreateNodeSchema>;
export type UpdateNodeInput = z.infer<typeof UpdateNodeSchema>;
export type CreateEdgeInput = z.infer<typeof CreateEdgeSchema>;
export type UpdateEdgeInput = z.infer<typeof UpdateEdgeSchema>;
