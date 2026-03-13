import { z } from 'zod';
import { MAX_LENGTHS } from '../constants.js';

export const createBlueprintTagSchema = z.object({
  name: z.string().min(1).max(MAX_LENGTHS.TAG_NAME),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a hex color code (#RRGGBB)'),
});

export type CreateBlueprintTagInput = z.infer<typeof createBlueprintTagSchema>;

export const addTagToItemSchema = z.object({
  tag_id: z.string().startsWith('bpt_'),
});

export type AddTagToItemInput = z.infer<typeof addTagToItemSchema>;
