import { describe, expect, it } from 'vitest';
import {
  CommentNotFoundError,
  DuplicateTagError,
  InvalidStatusTransitionError,
  ItemNotFoundError,
  ParentItemNotFoundError,
  TagNotFoundError,
} from './errors.js';

describe('Blueprint Domain Errors [unit]', () => {
  it('ItemNotFoundError has correct _tag and message', () => {
    const error = new ItemNotFoundError({ itemId: 'bpi_123' });
    expect(error._tag).toBe('ItemNotFoundError');
    expect(error.message).toBe('Blueprint item bpi_123 not found');
    expect(error.itemId).toBe('bpi_123');
  });

  it('InvalidStatusTransitionError has correct _tag and message', () => {
    const error = new InvalidStatusTransitionError({
      itemId: 'bpi_123',
      from: 'pending',
      to: 'done',
    });
    expect(error._tag).toBe('InvalidStatusTransitionError');
    expect(error.message).toBe("Cannot transition item bpi_123 from 'pending' to 'done'");
    expect(error.from).toBe('pending');
    expect(error.to).toBe('done');
  });

  it('DuplicateTagError has correct _tag and message', () => {
    const error = new DuplicateTagError({ tagName: 'urgent', tenantId: 'tnt_123' });
    expect(error._tag).toBe('DuplicateTagError');
    expect(error.message).toBe("Tag 'urgent' already exists for this tenant");
    expect(error.tagName).toBe('urgent');
    expect(error.tenantId).toBe('tnt_123');
  });

  it('TagNotFoundError has correct _tag and message', () => {
    const error = new TagNotFoundError({ tagId: 'bpt_123' });
    expect(error._tag).toBe('TagNotFoundError');
    expect(error.message).toBe('Tag bpt_123 not found');
  });

  it('CommentNotFoundError has correct _tag and message', () => {
    const error = new CommentNotFoundError({ commentId: 'bpc_123' });
    expect(error._tag).toBe('CommentNotFoundError');
    expect(error.message).toBe('Comment bpc_123 not found');
  });

  it('ParentItemNotFoundError has correct _tag and message', () => {
    const error = new ParentItemNotFoundError({ parentId: 'bpi_parent' });
    expect(error._tag).toBe('ParentItemNotFoundError');
    expect(error.message).toBe('Parent item bpi_parent not found');
  });

  it('all errors are instances of Error', () => {
    const errors = [
      new ItemNotFoundError({ itemId: 'x' }),
      new InvalidStatusTransitionError({ itemId: 'x', from: 'a', to: 'b' }),
      new DuplicateTagError({ tagName: 'x', tenantId: 'y' }),
      new TagNotFoundError({ tagId: 'x' }),
      new CommentNotFoundError({ commentId: 'x' }),
      new ParentItemNotFoundError({ parentId: 'x' }),
    ];

    for (const error of errors) {
      expect(error).toBeInstanceOf(Error);
    }
  });
});
