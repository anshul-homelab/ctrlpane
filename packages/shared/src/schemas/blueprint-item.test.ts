import { describe, expect, it } from 'vitest';
import {
  blueprintItemFiltersSchema,
  createBlueprintItemSchema,
  updateBlueprintItemSchema,
} from './blueprint-item.js';

describe('createBlueprintItemSchema [unit]', () => {
  it('accepts valid input with required fields only', () => {
    const result = createBlueprintItemSchema.safeParse({ title: 'Test Item' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('pending');
      expect(result.data.priority).toBe('medium');
    }
  });

  it('accepts valid input with all fields', () => {
    const result = createBlueprintItemSchema.safeParse({
      title: 'Full Item',
      description: 'Description here',
      status: 'in_progress',
      priority: 'high',
      parent_id: 'bpi_01HQ7Z3K4W',
      assigned_to: 'apk_01HQ7Z3K4X',
      due_date: '2026-04-01T00:00:00.000Z',
      tag_ids: ['bpt_01HQ7Z3K4Y'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty title', () => {
    const result = createBlueprintItemSchema.safeParse({ title: '' });
    expect(result.success).toBe(false);
  });

  it('rejects title exceeding max length', () => {
    const result = createBlueprintItemSchema.safeParse({ title: 'a'.repeat(501) });
    expect(result.success).toBe(false);
  });

  it('rejects invalid status', () => {
    const result = createBlueprintItemSchema.safeParse({
      title: 'Test',
      status: 'invalid_status',
    });
    expect(result.success).toBe(false);
  });

  it('rejects parent_id without bpi_ prefix', () => {
    const result = createBlueprintItemSchema.safeParse({
      title: 'Test',
      parent_id: 'invalid_id',
    });
    expect(result.success).toBe(false);
  });
});

describe('updateBlueprintItemSchema [unit]', () => {
  it('accepts partial updates', () => {
    const result = updateBlueprintItemSchema.safeParse({ title: 'Updated' });
    expect(result.success).toBe(true);
  });

  it('accepts empty object (no changes)', () => {
    const result = updateBlueprintItemSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects invalid priority', () => {
    const result = updateBlueprintItemSchema.safeParse({ priority: 'super_high' });
    expect(result.success).toBe(false);
  });
});

describe('blueprintItemFiltersSchema [unit]', () => {
  it('applies defaults for limit, sort, order', () => {
    const result = blueprintItemFiltersSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(25);
      expect(result.data.sort).toBe('created_at');
      expect(result.data.order).toBe('desc');
    }
  });

  it('coerces limit from string (query param)', () => {
    const result = blueprintItemFiltersSchema.safeParse({ limit: '50' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(50);
    }
  });

  it('rejects limit over 100', () => {
    const result = blueprintItemFiltersSchema.safeParse({ limit: 101 });
    expect(result.success).toBe(false);
  });
});
