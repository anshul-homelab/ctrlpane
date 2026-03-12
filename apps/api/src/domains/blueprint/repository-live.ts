import { DbClient } from '@ctrlpane/db';
import {
  blueprintActivity,
  blueprintComments,
  blueprintItemTags,
  blueprintItems,
  blueprintTags,
} from '@ctrlpane/db';
import { decodeCursor, encodeCursor } from '@ctrlpane/shared';
import { and, asc, desc, eq, ilike, isNull, sql } from 'drizzle-orm';
import { Effect, Layer } from 'effect';
import { BlueprintItemRepository } from './repository.js';

export const BlueprintItemRepositoryLive = Layer.effect(
  BlueprintItemRepository,
  Effect.gen(function* () {
    const { db } = yield* DbClient;

    return {
      // ── Items ──────────────────────────────────────────────

      findById: (id) =>
        Effect.tryPromise({
          try: async () => {
            const results = await db
              .select()
              .from(blueprintItems)
              .where(and(eq(blueprintItems.id, id), isNull(blueprintItems.deletedAt)))
              .limit(1);
            return results[0] ?? null;
          },
          catch: (error) => error as Error,
        }),

      findDetailById: (id) =>
        Effect.tryPromise({
          try: async () => {
            const [item] = await db
              .select()
              .from(blueprintItems)
              .where(and(eq(blueprintItems.id, id), isNull(blueprintItems.deletedAt)))
              .limit(1);

            if (!item) return null;

            // Parallel fetch sub-items, tags, comments
            const [subItems, tagRows, comments] = await Promise.all([
              db
                .select()
                .from(blueprintItems)
                .where(and(eq(blueprintItems.parentId, id), isNull(blueprintItems.deletedAt))),
              db
                .select({
                  id: blueprintTags.id,
                  name: blueprintTags.name,
                  color: blueprintTags.color,
                })
                .from(blueprintItemTags)
                .innerJoin(blueprintTags, eq(blueprintItemTags.tagId, blueprintTags.id))
                .where(eq(blueprintItemTags.itemId, id)),
              db
                .select()
                .from(blueprintComments)
                .where(eq(blueprintComments.itemId, id))
                .orderBy(desc(blueprintComments.createdAt)),
            ]);

            return { ...item, subItems, tags: tagRows, comments };
          },
          catch: (error) => error as Error,
        }),

      list: (filters) =>
        Effect.tryPromise({
          try: async () => {
            const limit = filters.limit ?? 25;
            const conditions = [isNull(blueprintItems.deletedAt)];

            if (filters.status) {
              conditions.push(eq(blueprintItems.status, filters.status));
            }
            if (filters.priority) {
              conditions.push(eq(blueprintItems.priority, filters.priority));
            }
            if (filters.search) {
              conditions.push(ilike(blueprintItems.title, `%${filters.search}%`));
            }

            // Cursor-based pagination
            if (filters.cursor) {
              const cursor = decodeCursor(filters.cursor);
              if (cursor) {
                conditions.push(
                  sql`(${blueprintItems.createdAt}, ${blueprintItems.id}) < (${cursor.sort_value}::timestamptz, ${cursor.id})`,
                );
              }
            }

            const orderFn = filters.order === 'asc' ? asc : desc;
            const results = await db
              .select()
              .from(blueprintItems)
              .where(and(...conditions))
              .orderBy(orderFn(blueprintItems.createdAt), desc(blueprintItems.id))
              .limit(limit + 1);

            const hasMore = results.length > limit;
            const items = hasMore ? results.slice(0, limit) : results;
            const lastItem = items[items.length - 1];
            const nextCursor =
              hasMore && lastItem
                ? encodeCursor({
                    sort_value: lastItem.createdAt.toISOString(),
                    id: lastItem.id,
                  })
                : null;

            return { items, nextCursor, hasMore };
          },
          catch: (error) => error as Error,
        }),

      create: (input) =>
        Effect.tryPromise({
          try: async () => {
            const [item] = await db
              .insert(blueprintItems)
              .values({
                id: input.id,
                tenantId: input.tenantId,
                title: input.title,
                body: input.description ?? null,
                status: input.status ?? 'pending',
                priority: input.priority ?? 'medium',
                parentId: input.parent_id ?? null,
                createdBy: input.createdBy,
                metadata: input.metadata ?? {},
              })
              .returning();
            // biome-ignore lint/style/noNonNullAssertion: Drizzle .returning() always yields a row on insert
            return item!;
          },
          catch: (error) => error as Error,
        }),

      update: (id, input) =>
        Effect.tryPromise({
          try: async () => {
            const values: Record<string, unknown> = {};
            if (input.title !== undefined) values.title = input.title;
            if (input.description !== undefined) values.body = input.description;
            if (input.status !== undefined) values.status = input.status;
            if (input.priority !== undefined) values.priority = input.priority;
            if (input.metadata !== undefined) values.metadata = input.metadata;

            const [updated] = await db
              .update(blueprintItems)
              .set(values)
              .where(and(eq(blueprintItems.id, id), isNull(blueprintItems.deletedAt)))
              .returning();
            return updated ?? null;
          },
          catch: (error) => error as Error,
        }),

      softDelete: (id) =>
        Effect.tryPromise({
          try: async () => {
            const [deleted] = await db
              .update(blueprintItems)
              .set({ deletedAt: new Date() })
              .where(and(eq(blueprintItems.id, id), isNull(blueprintItems.deletedAt)))
              .returning();
            return deleted ?? null;
          },
          catch: (error) => error as Error,
        }),

      listSubItems: (parentId) =>
        Effect.tryPromise({
          try: async () =>
            db
              .select()
              .from(blueprintItems)
              .where(and(eq(blueprintItems.parentId, parentId), isNull(blueprintItems.deletedAt))),
          catch: (error) => error as Error,
        }),

      // ── Tags ───────────────────────────────────────────────

      findTagById: (id) =>
        Effect.tryPromise({
          try: async () => {
            const results = await db
              .select()
              .from(blueprintTags)
              .where(eq(blueprintTags.id, id))
              .limit(1);
            return results[0] ?? null;
          },
          catch: (error) => error as Error,
        }),

      findTagByName: (tenantId, name) =>
        Effect.tryPromise({
          try: async () => {
            const results = await db
              .select()
              .from(blueprintTags)
              .where(and(eq(blueprintTags.tenantId, tenantId), eq(blueprintTags.name, name)))
              .limit(1);
            return results[0] ?? null;
          },
          catch: (error) => error as Error,
        }),

      listTags: (tenantId) =>
        Effect.tryPromise({
          try: async () =>
            db
              .select()
              .from(blueprintTags)
              .where(eq(blueprintTags.tenantId, tenantId))
              .orderBy(asc(blueprintTags.name)),
          catch: (error) => error as Error,
        }),

      createTag: (input) =>
        Effect.tryPromise({
          try: async () => {
            const [tag] = await db
              .insert(blueprintTags)
              .values({
                id: input.id,
                tenantId: input.tenantId,
                name: input.name,
                color: input.color,
              })
              .returning();
            // biome-ignore lint/style/noNonNullAssertion: Drizzle .returning() always yields a row on insert
            return tag!;
          },
          catch: (error) => error as Error,
        }),

      deleteTag: (id) =>
        Effect.tryPromise({
          try: async () => {
            const [deleted] = await db
              .delete(blueprintTags)
              .where(eq(blueprintTags.id, id))
              .returning();
            return deleted ?? null;
          },
          catch: (error) => error as Error,
        }),

      addTagToItem: (tenantId, itemId, tagId) =>
        Effect.tryPromise({
          try: async () => {
            await db.insert(blueprintItemTags).values({ tenantId, itemId, tagId });
          },
          catch: (error) => error as Error,
        }),

      removeTagFromItem: (itemId, tagId) =>
        Effect.tryPromise({
          try: async () => {
            await db
              .delete(blueprintItemTags)
              .where(and(eq(blueprintItemTags.itemId, itemId), eq(blueprintItemTags.tagId, tagId)));
          },
          catch: (error) => error as Error,
        }),

      listItemTags: (itemId) =>
        Effect.tryPromise({
          try: async () =>
            db
              .select({
                id: blueprintTags.id,
                name: blueprintTags.name,
                color: blueprintTags.color,
              })
              .from(blueprintItemTags)
              .innerJoin(blueprintTags, eq(blueprintItemTags.tagId, blueprintTags.id))
              .where(eq(blueprintItemTags.itemId, itemId)),
          catch: (error) => error as Error,
        }),

      // ── Comments ───────────────────────────────────────────

      findCommentById: (id) =>
        Effect.tryPromise({
          try: async () => {
            const results = await db
              .select()
              .from(blueprintComments)
              .where(eq(blueprintComments.id, id))
              .limit(1);
            return results[0] ?? null;
          },
          catch: (error) => error as Error,
        }),

      listComments: (itemId) =>
        Effect.tryPromise({
          try: async () =>
            db
              .select()
              .from(blueprintComments)
              .where(eq(blueprintComments.itemId, itemId))
              .orderBy(desc(blueprintComments.createdAt)),
          catch: (error) => error as Error,
        }),

      createComment: (input) =>
        Effect.tryPromise({
          try: async () => {
            const [comment] = await db
              .insert(blueprintComments)
              .values({
                id: input.id,
                tenantId: input.tenantId,
                itemId: input.itemId,
                authorId: input.authorId,
                authorType: input.author_type ?? 'user',
                body: input.content,
              })
              .returning();
            // biome-ignore lint/style/noNonNullAssertion: Drizzle .returning() always yields a row on insert
            return comment!;
          },
          catch: (error) => error as Error,
        }),

      deleteComment: (id) =>
        Effect.tryPromise({
          try: async () => {
            const [deleted] = await db
              .delete(blueprintComments)
              .where(eq(blueprintComments.id, id))
              .returning();
            return deleted ?? null;
          },
          catch: (error) => error as Error,
        }),

      // ── Activity ───────────────────────────────────────────

      listActivity: (itemId) =>
        Effect.tryPromise({
          try: async () =>
            db
              .select()
              .from(blueprintActivity)
              .where(eq(blueprintActivity.itemId, itemId))
              .orderBy(desc(blueprintActivity.createdAt)),
          catch: (error) => error as Error,
        }),

      createActivity: (input) =>
        Effect.tryPromise({
          try: async () => {
            const [activity] = await db
              .insert(blueprintActivity)
              .values({
                id: input.id,
                tenantId: input.tenantId,
                itemId: input.itemId,
                actorId: input.actorId,
                actorType: input.actorType,
                action: input.action,
                changes: input.changes,
              })
              .returning();
            // biome-ignore lint/style/noNonNullAssertion: Drizzle .returning() always yields a row on insert
            return activity!;
          },
          catch: (error) => error as Error,
        }),
    };
  }),
);
