import { z } from 'zod';
import { MAX_LENGTHS } from '../constants.js';

export const createBlueprintItemSchema = z.object({
  title: z.string().min(1).max(MAX_LENGTHS.ITEM_TITLE),
  description: z.string().optional(),
  status: z.enum(['pending', 'in_progress', 'done']).optional().default('pending'),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional().default('medium'),
  parent_id: z.string().startsWith('bpi_').optional(),
  assigned_to: z.string().optional(),
  due_date: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional().default({}),
  tag_ids: z.array(z.string().startsWith('bpt_')).optional(),
});

export type CreateBlueprintItemInput = z.infer<typeof createBlueprintItemSchema>;

export const updateBlueprintItemSchema = z.object({
  title: z.string().min(1).max(MAX_LENGTHS.ITEM_TITLE).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(['pending', 'in_progress', 'done']).optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  assigned_to: z.string().nullable().optional(),
  due_date: z.string().datetime().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type UpdateBlueprintItemInput = z.infer<typeof updateBlueprintItemSchema>;

export const blueprintItemFiltersSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'done']).optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  tag: z.string().optional(),
  search: z.string().optional(),
  assigned_to: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).optional().default(25),
  sort: z
    .enum(['created_at', 'updated_at', 'title', 'priority', 'status'])
    .optional()
    .default('created_at'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
});

export type BlueprintItemFilters = z.infer<typeof blueprintItemFiltersSchema>;
