import { z } from 'zod';

export const createBlueprintCommentSchema = z.object({
  content: z.string().min(1).max(10_000),
  author_type: z.enum(['user', 'agent', 'system']).optional().default('user'),
});

export type CreateBlueprintCommentInput = z.infer<typeof createBlueprintCommentSchema>;
