import { describe, expect, it } from 'vitest';
import { createApiKeySchema } from './auth.js';

describe('createApiKeySchema [unit]', () => {
  it('accepts valid API key input', () => {
    const result = createApiKeySchema.safeParse({
      name: 'My API Key',
      permissions: ['read', 'write'],
    });
    expect(result.success).toBe(true);
  });

  it('accepts API key with expiry', () => {
    const result = createApiKeySchema.safeParse({
      name: 'Temp Key',
      permissions: ['read'],
      expires_at: '2026-12-31T23:59:59.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = createApiKeySchema.safeParse({
      name: '',
      permissions: ['read'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty permissions array', () => {
    const result = createApiKeySchema.safeParse({
      name: 'Key',
      permissions: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid permission', () => {
    const result = createApiKeySchema.safeParse({
      name: 'Key',
      permissions: ['delete'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects name exceeding max length', () => {
    const result = createApiKeySchema.safeParse({
      name: 'a'.repeat(101),
      permissions: ['read'],
    });
    expect(result.success).toBe(false);
  });
});
