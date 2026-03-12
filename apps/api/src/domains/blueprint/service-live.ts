import { type ItemStatus, VALID_STATUS_TRANSITIONS, createId } from '@ctrlpane/shared';
import { Effect, Layer } from 'effect';
import { RedisClient } from '../../infra/redis.js';
import { TenantContext } from '../../shared/tenant-context.js';
import {
  CommentNotFoundError,
  DuplicateTagError,
  InvalidStatusTransitionError,
  ItemNotFoundError,
  ParentItemNotFoundError,
  TagNotFoundError,
} from './errors.js';
import { BlueprintEventPublisher } from './event-publisher.js';
import { BlueprintItemRepository } from './repository.js';
import { BlueprintItemService } from './service.js';

export const BlueprintItemServiceLive = Layer.effect(
  BlueprintItemService,
  Effect.gen(function* () {
    const repo = yield* BlueprintItemRepository;
    const eventPublisher = yield* BlueprintEventPublisher;
    const tenant = yield* TenantContext;
    const { redis } = yield* RedisClient;

    const invalidateListCache = async () => {
      const keys = await redis.keys(`bp:${tenant.tenantId}:items:list:*`);
      if (keys.length > 0) await redis.del(...keys);
    };

    const invalidateItemCache = async (itemId: string) => {
      await redis.del(`bp:${tenant.tenantId}:item:${itemId}`);
      await invalidateListCache();
    };

    return {
      // ── Items ──────────────────────────────────────────────

      list: (filters) => repo.list(filters),

      getById: (id) =>
        Effect.gen(function* () {
          const detail = yield* repo.findDetailById(id);
          if (!detail) return yield* new ItemNotFoundError({ itemId: id });
          return detail;
        }),

      create: (input) =>
        Effect.gen(function* () {
          const itemId = createId('bpi_');
          const item = yield* repo.create({
            ...input,
            id: itemId,
            tenantId: tenant.tenantId,
            createdBy: tenant.apiKeyId,
          });

          yield* repo.createActivity({
            id: createId('bpa_'),
            tenantId: tenant.tenantId,
            itemId: itemId,
            actorId: tenant.apiKeyId,
            actorType: 'agent',
            action: 'created',
            changes: {},
          });

          yield* eventPublisher.publish({
            eventType: 'blueprint.item.created',
            aggregateType: 'blueprint_item',
            aggregateId: itemId,
            tenantId: tenant.tenantId,
            payload: item,
          });

          yield* Effect.promise(() => invalidateListCache());

          return item;
        }),

      update: (id, input) =>
        Effect.gen(function* () {
          // Validate status transition if status is changing
          if (input.status) {
            const existing = yield* repo.findById(id);
            if (!existing) return yield* new ItemNotFoundError({ itemId: id });

            const validTransitions = VALID_STATUS_TRANSITIONS[existing.status as ItemStatus];
            if (!validTransitions?.includes(input.status as ItemStatus)) {
              return yield* new InvalidStatusTransitionError({
                itemId: id,
                from: existing.status,
                to: input.status,
              });
            }
          }

          const updated = yield* repo.update(id, input);
          if (!updated) return yield* new ItemNotFoundError({ itemId: id });

          yield* repo.createActivity({
            id: createId('bpa_'),
            tenantId: tenant.tenantId,
            itemId: id,
            actorId: tenant.apiKeyId,
            actorType: 'agent',
            action: input.status ? 'status_changed' : 'updated',
            changes: input as Record<string, unknown>,
          });

          yield* eventPublisher.publish({
            eventType: input.status
              ? input.status === 'done'
                ? 'blueprint.item.completed'
                : 'blueprint.item.updated'
              : 'blueprint.item.updated',
            aggregateType: 'blueprint_item',
            aggregateId: id,
            tenantId: tenant.tenantId,
            payload: updated,
          });

          yield* Effect.promise(() => invalidateItemCache(id));

          return updated;
        }),

      remove: (id) =>
        Effect.gen(function* () {
          const deleted = yield* repo.softDelete(id);
          if (!deleted) return yield* new ItemNotFoundError({ itemId: id });

          yield* repo.createActivity({
            id: createId('bpa_'),
            tenantId: tenant.tenantId,
            itemId: id,
            actorId: tenant.apiKeyId,
            actorType: 'agent',
            action: 'deleted',
            changes: {},
          });

          yield* eventPublisher.publish({
            eventType: 'blueprint.item.deleted',
            aggregateType: 'blueprint_item',
            aggregateId: id,
            tenantId: tenant.tenantId,
            payload: { id },
          });

          yield* Effect.promise(() => invalidateItemCache(id));

          return deleted;
        }),

      listSubItems: (parentId) =>
        Effect.gen(function* () {
          const parent = yield* repo.findById(parentId);
          if (!parent) return yield* new ItemNotFoundError({ itemId: parentId });
          return yield* repo.listSubItems(parentId);
        }),

      createSubItem: (parentId, input) =>
        Effect.gen(function* () {
          const parent = yield* repo.findById(parentId);
          if (!parent) return yield* new ParentItemNotFoundError({ parentId });

          const itemId = createId('bpi_');
          const item = yield* repo.create({
            ...input,
            parent_id: parentId,
            id: itemId,
            tenantId: tenant.tenantId,
            createdBy: tenant.apiKeyId,
          });

          yield* repo.createActivity({
            id: createId('bpa_'),
            tenantId: tenant.tenantId,
            itemId: itemId,
            actorId: tenant.apiKeyId,
            actorType: 'agent',
            action: 'created',
            changes: { parentId },
          });

          yield* eventPublisher.publish({
            eventType: 'blueprint.item.created',
            aggregateType: 'blueprint_item',
            aggregateId: itemId,
            tenantId: tenant.tenantId,
            payload: item,
          });

          return item;
        }),

      // ── Tags ───────────────────────────────────────────────

      listTags: () => repo.listTags(tenant.tenantId),

      createTag: (input) =>
        Effect.gen(function* () {
          const existing = yield* repo.findTagByName(tenant.tenantId, input.name);
          if (existing) {
            return yield* new DuplicateTagError({
              tagName: input.name,
              tenantId: tenant.tenantId,
            });
          }

          const tagId = createId('bpt_');
          const tag = yield* repo.createTag({
            ...input,
            id: tagId,
            tenantId: tenant.tenantId,
          });

          yield* eventPublisher.publish({
            eventType: 'blueprint.tag.created',
            aggregateType: 'blueprint_tag',
            aggregateId: tagId,
            tenantId: tenant.tenantId,
            payload: tag,
          });

          return tag;
        }),

      deleteTag: (id) =>
        Effect.gen(function* () {
          const deleted = yield* repo.deleteTag(id);
          if (!deleted) return yield* new TagNotFoundError({ tagId: id });

          yield* eventPublisher.publish({
            eventType: 'blueprint.tag.deleted',
            aggregateType: 'blueprint_tag',
            aggregateId: id,
            tenantId: tenant.tenantId,
            payload: { id },
          });

          return deleted;
        }),

      addTagToItem: (itemId, tagId) =>
        Effect.gen(function* () {
          const item = yield* repo.findById(itemId);
          if (!item) return yield* new ItemNotFoundError({ itemId });

          const tag = yield* repo.findTagById(tagId);
          if (!tag) return yield* new TagNotFoundError({ tagId });

          yield* repo.addTagToItem(tenant.tenantId, itemId, tagId);

          yield* repo.createActivity({
            id: createId('bpa_'),
            tenantId: tenant.tenantId,
            itemId,
            actorId: tenant.apiKeyId,
            actorType: 'agent',
            action: 'tagged',
            changes: { tag_id: tagId, tag_name: tag.name },
          });

          yield* eventPublisher.publish({
            eventType: 'blueprint.item.tagged',
            aggregateType: 'blueprint_item',
            aggregateId: itemId,
            tenantId: tenant.tenantId,
            payload: { itemId, tagId, tagName: tag.name },
          });

          yield* Effect.promise(() => invalidateItemCache(itemId));
        }),

      removeTagFromItem: (itemId, tagId) =>
        Effect.gen(function* () {
          const item = yield* repo.findById(itemId);
          if (!item) return yield* new ItemNotFoundError({ itemId });

          const tag = yield* repo.findTagById(tagId);
          if (!tag) return yield* new TagNotFoundError({ tagId });

          yield* repo.removeTagFromItem(itemId, tagId);

          yield* repo.createActivity({
            id: createId('bpa_'),
            tenantId: tenant.tenantId,
            itemId,
            actorId: tenant.apiKeyId,
            actorType: 'agent',
            action: 'untagged',
            changes: { tag_id: tagId, tag_name: tag.name },
          });

          yield* Effect.promise(() => invalidateItemCache(itemId));
        }),

      // ── Comments ───────────────────────────────────────────

      listComments: (itemId) =>
        Effect.gen(function* () {
          const item = yield* repo.findById(itemId);
          if (!item) return yield* new ItemNotFoundError({ itemId });
          return yield* repo.listComments(itemId);
        }),

      createComment: (itemId, input) =>
        Effect.gen(function* () {
          const item = yield* repo.findById(itemId);
          if (!item) return yield* new ItemNotFoundError({ itemId });

          const commentId = createId('bpc_');
          const comment = yield* repo.createComment({
            ...input,
            id: commentId,
            tenantId: tenant.tenantId,
            itemId,
            authorId: tenant.apiKeyId,
          });

          yield* repo.createActivity({
            id: createId('bpa_'),
            tenantId: tenant.tenantId,
            itemId,
            actorId: tenant.apiKeyId,
            actorType: 'agent',
            action: 'commented',
            changes: { comment_id: commentId },
          });

          yield* eventPublisher.publish({
            eventType: 'blueprint.comment.created',
            aggregateType: 'blueprint_comment',
            aggregateId: commentId,
            tenantId: tenant.tenantId,
            payload: comment,
          });

          yield* Effect.promise(() => invalidateItemCache(itemId));

          return comment;
        }),

      deleteComment: (commentId) =>
        Effect.gen(function* () {
          const deleted = yield* repo.deleteComment(commentId);
          if (!deleted) return yield* new CommentNotFoundError({ commentId });

          yield* eventPublisher.publish({
            eventType: 'blueprint.comment.deleted',
            aggregateType: 'blueprint_comment',
            aggregateId: commentId,
            tenantId: tenant.tenantId,
            payload: { id: commentId },
          });

          return deleted;
        }),

      // ── Activity ───────────────────────────────────────────

      listActivity: (itemId) =>
        Effect.gen(function* () {
          const item = yield* repo.findById(itemId);
          if (!item) return yield* new ItemNotFoundError({ itemId });
          return yield* repo.listActivity(itemId);
        }),
    };
  }),
);
