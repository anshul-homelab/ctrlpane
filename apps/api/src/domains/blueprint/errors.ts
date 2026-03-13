import { Data } from 'effect';

export class ItemNotFoundError extends Data.TaggedError('ItemNotFoundError')<{
  readonly itemId: string;
}> {
  get message() {
    return `Blueprint item ${this.itemId} not found`;
  }
}

export class InvalidStatusTransitionError extends Data.TaggedError('InvalidStatusTransitionError')<{
  readonly itemId: string;
  readonly from: string;
  readonly to: string;
}> {
  get message() {
    return `Cannot transition item ${this.itemId} from '${this.from}' to '${this.to}'`;
  }
}

export class DuplicateTagError extends Data.TaggedError('DuplicateTagError')<{
  readonly tagName: string;
  readonly tenantId: string;
}> {
  get message() {
    return `Tag '${this.tagName}' already exists for this tenant`;
  }
}

export class TagNotFoundError extends Data.TaggedError('TagNotFoundError')<{
  readonly tagId: string;
}> {
  get message() {
    return `Tag ${this.tagId} not found`;
  }
}

export class CommentNotFoundError extends Data.TaggedError('CommentNotFoundError')<{
  readonly commentId: string;
}> {
  get message() {
    return `Comment ${this.commentId} not found`;
  }
}

export class ParentItemNotFoundError extends Data.TaggedError('ParentItemNotFoundError')<{
  readonly parentId: string;
}> {
  get message() {
    return `Parent item ${this.parentId} not found`;
  }
}
