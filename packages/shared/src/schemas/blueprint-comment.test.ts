import { describe, expect, it } from 'vitest';
import { createBlueprintCommentSchema } from './blueprint-comment.js';

describe('createBlueprintCommentSchema [unit]', () => {
  it('accepts valid comment with default author_type', () => {
    const result = createBlueprintCommentSchema.safeParse({ content: 'Great work!' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.author_type).toBe('user');
    }
  });

  it('accepts comment with agent author_type', () => {
    const result = createBlueprintCommentSchema.safeParse({
      content: 'Automated comment',
      author_type: 'agent',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty content', () => {
    const result = createBlueprintCommentSchema.safeParse({ content: '' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid author_type', () => {
    const result = createBlueprintCommentSchema.safeParse({
      content: 'Test',
      author_type: 'robot',
    });
    expect(result.success).toBe(false);
  });
});
