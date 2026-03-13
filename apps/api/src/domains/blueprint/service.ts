import type {
  BlueprintItemFilters,
  CreateBlueprintCommentInput,
  CreateBlueprintItemInput,
  CreateBlueprintTagInput,
  UpdateBlueprintItemInput,
} from '@ctrlpane/shared';
import { Context, type Effect } from 'effect';
import type {
  CommentNotFoundError,
  DuplicateTagError,
  InvalidStatusTransitionError,
  ItemNotFoundError,
  ParentItemNotFoundError,
  TagNotFoundError,
} from './errors.js';
import type {
  BlueprintActivityRow,
  BlueprintCommentRow,
  BlueprintItemRow,
  BlueprintTagRow,
  DashboardStats,
  ItemDetail,
  PaginatedItems,
} from './repository.js';

export interface BlueprintItemServiceShape {
  // Items
  readonly list: (filters: BlueprintItemFilters) => Effect.Effect<PaginatedItems, Error>;
  readonly getById: (id: string) => Effect.Effect<ItemDetail, ItemNotFoundError | Error>;
  readonly create: (input: CreateBlueprintItemInput) => Effect.Effect<BlueprintItemRow, Error>;
  readonly update: (
    id: string,
    input: UpdateBlueprintItemInput,
  ) => Effect.Effect<BlueprintItemRow, ItemNotFoundError | InvalidStatusTransitionError | Error>;
  readonly remove: (id: string) => Effect.Effect<BlueprintItemRow, ItemNotFoundError | Error>;
  readonly listSubItems: (
    parentId: string,
  ) => Effect.Effect<BlueprintItemRow[], ItemNotFoundError | Error>;
  readonly createSubItem: (
    parentId: string,
    input: CreateBlueprintItemInput,
  ) => Effect.Effect<BlueprintItemRow, ParentItemNotFoundError | Error>;

  // Tags
  readonly listTags: () => Effect.Effect<BlueprintTagRow[], Error>;
  readonly createTag: (
    input: CreateBlueprintTagInput,
  ) => Effect.Effect<BlueprintTagRow, DuplicateTagError | Error>;
  readonly deleteTag: (id: string) => Effect.Effect<BlueprintTagRow, TagNotFoundError | Error>;
  readonly addTagToItem: (
    itemId: string,
    tagId: string,
  ) => Effect.Effect<void, ItemNotFoundError | TagNotFoundError | Error>;
  readonly removeTagFromItem: (
    itemId: string,
    tagId: string,
  ) => Effect.Effect<void, ItemNotFoundError | TagNotFoundError | Error>;

  // Comments
  readonly listComments: (
    itemId: string,
  ) => Effect.Effect<BlueprintCommentRow[], ItemNotFoundError | Error>;
  readonly createComment: (
    itemId: string,
    input: CreateBlueprintCommentInput,
  ) => Effect.Effect<BlueprintCommentRow, ItemNotFoundError | Error>;
  readonly deleteComment: (
    commentId: string,
  ) => Effect.Effect<BlueprintCommentRow, CommentNotFoundError | Error>;

  // Activity
  readonly listActivity: (
    itemId: string,
  ) => Effect.Effect<BlueprintActivityRow[], ItemNotFoundError | Error>;

  // Dashboard
  readonly getDashboardStats: () => Effect.Effect<DashboardStats, Error>;
}

export class BlueprintItemService extends Context.Tag('BlueprintItemService')<
  BlueprintItemService,
  BlueprintItemServiceShape
>() {}
