import { describe, expect, it } from 'vitest';
import { createBlueprintTagSchema } from './blueprint-tag.js';

describe('createBlueprintTagSchema [unit]', () => {
  it('accepts valid tag', () => {
    const result = createBlueprintTagSchema.safeParse({ name: 'frontend', color: '#3B82F6' });
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = createBlueprintTagSchema.safeParse({ name: '', color: '#3B82F6' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid hex color', () => {
    const result = createBlueprintTagSchema.safeParse({ name: 'test', color: 'red' });
    expect(result.success).toBe(false);
  });

  it('rejects color without hash', () => {
    const result = createBlueprintTagSchema.safeParse({ name: 'test', color: '3B82F6' });
    expect(result.success).toBe(false);
  });
});
