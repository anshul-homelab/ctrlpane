import { z } from 'zod';
import { MAX_LENGTHS } from '../constants.js';

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(MAX_LENGTHS.API_KEY_NAME),
  permissions: z.array(z.enum(['read', 'write', 'admin'])).min(1),
  expires_at: z.string().datetime().optional(),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
