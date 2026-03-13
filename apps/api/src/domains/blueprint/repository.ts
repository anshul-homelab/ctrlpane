import type {
  BlueprintActivityRow,
  BlueprintCommentRow,
  BlueprintItemRow,
  BlueprintTagRow,
} from '@ctrlpane/db';
import type {
  BlueprintItemFilters,
  CreateBlueprintCommentInput,
  CreateBlueprintItemInput,
  CreateBlueprintTagInput,
  UpdateBlueprintItemInput,
} from '@ctrlpane/shared';
import { Context, type Effect } from 'effect';

// Re-export for convenience
export type { BlueprintItemRow, BlueprintTagRow, BlueprintCommentRow, BlueprintActivityRow };

export interface DashboardStats {
  readonly counts: Array<{ status: string; count: number }>;
  readonly recent_activity: BlueprintActivityRow[];
  readonly total_items: number;
}

export interface ItemDetail extends BlueprintItemRow {
  readonly subItems: BlueprintItemRow[];
  readonly tags: Array<{ id: string; name: string; color: string | null }>;
  readonly comments: Array<{
    id: string;
    body: string;
    authorId: string | null;
    authorType: string;
    createdAt: Date;
  }>;
}

export interface PaginatedItems {
  readonly items: BlueprintItemRow[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

export interface BlueprintItemRepositoryShape {
  // Items
  readonly findById: (id: string) => Effect.Effect<BlueprintItemRow | null, Error>;
  readonly findDetailById: (id: string) => Effect.Effect<ItemDetail | null, Error>;
  readonly list: (filters: BlueprintItemFilters) => Effect.Effect<PaginatedItems, Error>;
  readonly create: (
    input: CreateBlueprintItemInput & {
      id: string;
      tenantId: string;
      createdBy: string;
    },
  ) => Effect.Effect<BlueprintItemRow, Error>;
  readonly update: (
    id: string,
    input: UpdateBlueprintItemInput,
  ) => Effect.Effect<BlueprintItemRow | null, Error>;
  readonly softDelete: (id: string) => Effect.Effect<BlueprintItemRow | null, Error>;
  readonly listSubItems: (parentId: string) => Effect.Effect<BlueprintItemRow[], Error>;

  // Tags
  readonly findTagById: (id: string) => Effect.Effect<BlueprintTagRow | null, Error>;
  readonly findTagByName: (
    tenantId: string,
    name: string,
  ) => Effect.Effect<BlueprintTagRow | null, Error>;
  readonly listTags: (tenantId: string) => Effect.Effect<BlueprintTagRow[], Error>;
  readonly createTag: (
    input: CreateBlueprintTagInput & { id: string; tenantId: string },
  ) => Effect.Effect<BlueprintTagRow, Error>;
  readonly deleteTag: (id: string) => Effect.Effect<BlueprintTagRow | null, Error>;
  readonly addTagToItem: (
    tenantId: string,
    itemId: string,
    tagId: string,
  ) => Effect.Effect<void, Error>;
  readonly removeTagFromItem: (itemId: string, tagId: string) => Effect.Effect<void, Error>;
  readonly listItemTags: (
    itemId: string,
  ) => Effect.Effect<Array<{ id: string; name: string; color: string | null }>, Error>;

  // Comments
  readonly findCommentById: (id: string) => Effect.Effect<BlueprintCommentRow | null, Error>;
  readonly listComments: (itemId: string) => Effect.Effect<BlueprintCommentRow[], Error>;
  readonly createComment: (
    input: CreateBlueprintCommentInput & {
      id: string;
      tenantId: string;
      itemId: string;
      authorId: string;
    },
  ) => Effect.Effect<BlueprintCommentRow, Error>;
  readonly deleteComment: (id: string) => Effect.Effect<BlueprintCommentRow | null, Error>;

  // Activity
  readonly listActivity: (itemId: string) => Effect.Effect<BlueprintActivityRow[], Error>;
  readonly getDashboardStats: (tenantId: string) => Effect.Effect<DashboardStats, Error>;
  readonly createActivity: (input: {
    id: string;
    tenantId: string;
    itemId: string;
    actorId: string;
    actorType: string;
    action: string;
    changes: Record<string, unknown>;
  }) => Effect.Effect<BlueprintActivityRow, Error>;
}

export class BlueprintItemRepository extends Context.Tag('BlueprintItemRepository')<
  BlueprintItemRepository,
  BlueprintItemRepositoryShape
>() {}
