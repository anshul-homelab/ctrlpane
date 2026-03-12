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
import { Effect, Exit, Layer } from 'effect';
import { describe, expect, it, vi } from 'vitest';
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
import type { BlueprintItemRepositoryShape, ItemDetail, PaginatedItems } from './repository.js';
import { BlueprintItemRepository } from './repository.js';
import { BlueprintItemServiceLive } from './service-live.js';
import { BlueprintItemService } from './service.js';

/** Extract the first argument from a mock call (avoids biome noExplicitAny / noNonNullAssertion). */
// biome-ignore lint/suspicious/noExplicitAny: test helper for extracting mock args
function mockArg(fn: ReturnType<typeof vi.fn>, callIndex = -1): any {
  const idx = callIndex < 0 ? fn.mock.calls.length + callIndex : callIndex;
  // biome-ignore lint/style/noNonNullAssertion: mock call verified by expect() before this
  return fn.mock.calls[idx]![0];
}

// ── Fixtures ────────────────────────────────────────────────────────

const TENANT_ID = 'tnt_test123';
const API_KEY_ID = 'key_test456';
const ITEM_ID = 'bpi_item001';
const TAG_ID = 'bpt_tag001';
const COMMENT_ID = 'bpc_comment001';
const now = new Date('2026-03-01T00:00:00Z');

const makeItem = (overrides: Partial<BlueprintItemRow> = {}): BlueprintItemRow => ({
  id: ITEM_ID,
  tenantId: TENANT_ID,
  title: 'Test Item',
  body: 'Test body',
  status: 'pending',
  priority: 'medium',
  kind: 'task',
  parentId: null,
  sortOrder: 0,
  metadata: {},
  createdBy: API_KEY_ID,
  deletedAt: null,
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const makeItemDetail = (overrides: Partial<ItemDetail> = {}): ItemDetail => ({
  ...makeItem(),
  subItems: [],
  tags: [],
  comments: [],
  ...overrides,
});

const makeTag = (overrides: Partial<BlueprintTagRow> = {}): BlueprintTagRow => ({
  id: TAG_ID,
  tenantId: TENANT_ID,
  name: 'urgent',
  color: '#FF0000',
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const makeComment = (overrides: Partial<BlueprintCommentRow> = {}): BlueprintCommentRow => ({
  id: COMMENT_ID,
  tenantId: TENANT_ID,
  itemId: ITEM_ID,
  authorId: API_KEY_ID,
  authorType: 'agent',
  body: 'Test comment',
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const makeActivity = (overrides: Partial<BlueprintActivityRow> = {}): BlueprintActivityRow => ({
  id: 'bpa_act001',
  tenantId: TENANT_ID,
  itemId: ITEM_ID,
  actorId: API_KEY_ID,
  actorType: 'agent',
  action: 'created',
  changes: {},
  createdAt: now,
  ...overrides,
});

// ── Mock Layer Builder ──────────────────────────────────────────────

const defaultRepo: BlueprintItemRepositoryShape = {
  findById: () => Effect.succeed(null),
  findDetailById: () => Effect.succeed(null),
  list: () => Effect.succeed({ items: [], nextCursor: null, hasMore: false }),
  create: () => Effect.succeed(makeItem()),
  update: () => Effect.succeed(null),
  softDelete: () => Effect.succeed(null),
  listSubItems: () => Effect.succeed([]),
  findTagById: () => Effect.succeed(null),
  findTagByName: () => Effect.succeed(null),
  listTags: () => Effect.succeed([]),
  createTag: () => Effect.succeed(makeTag()),
  deleteTag: () => Effect.succeed(null),
  addTagToItem: () => Effect.succeed(undefined),
  removeTagFromItem: () => Effect.succeed(undefined),
  listItemTags: () => Effect.succeed([]),
  findCommentById: () => Effect.succeed(null),
  listComments: () => Effect.succeed([]),
  createComment: () => Effect.succeed(makeComment()),
  deleteComment: () => Effect.succeed(null),
  listActivity: () => Effect.succeed([]),
  createActivity: () => Effect.succeed(makeActivity()),
};

const publishMock = vi.fn(() => Effect.void);

const makeTestLayer = (repoOverrides: Partial<BlueprintItemRepositoryShape> = {}) => {
  const repo = { ...defaultRepo, ...repoOverrides };

  const RepoLayer = Layer.succeed(BlueprintItemRepository, repo);
  const EventLayer = Layer.succeed(BlueprintEventPublisher, { publish: publishMock });
  const TenantLayer = Layer.succeed(TenantContext, {
    tenantId: TENANT_ID,
    apiKeyId: API_KEY_ID,
    permissions: ['read', 'write'],
  });
  const RedisLayer = Layer.succeed(RedisClient, {
    redis: {
      keys: vi.fn(async () => []),
      del: vi.fn(async () => 0),
    } as never,
  });

  return BlueprintItemServiceLive.pipe(
    Layer.provide(Layer.mergeAll(RepoLayer, EventLayer, TenantLayer, RedisLayer)),
  );
};

/** Run a service effect against the test layer and return the Exit */
const runService = <A, E>(
  effect: (svc: BlueprintItemService['Type']) => Effect.Effect<A, E>,
  repoOverrides: Partial<BlueprintItemRepositoryShape> = {},
) => {
  const program = Effect.gen(function* () {
    const svc = yield* BlueprintItemService;
    return yield* effect(svc);
  });
  return Effect.runPromiseExit(program.pipe(Effect.provide(makeTestLayer(repoOverrides))));
};

// ── Tests ───────────────────────────────────────────────────────────

describe('BlueprintItemServiceLive [unit]', () => {
  // ── Items ─────────────────────────────────────────────────────

  describe('list', () => {
    it('[unit] delegates to repo.list with filters', async () => {
      const filters: BlueprintItemFilters = {
        status: 'pending',
        limit: 10,
        sort: 'created_at',
        order: 'desc',
      };
      const expected: PaginatedItems = { items: [makeItem()], nextCursor: null, hasMore: false };
      const listFn = vi.fn(() => Effect.succeed(expected));

      const exit = await runService((svc) => svc.list(filters), { list: listFn });

      expect(Exit.isSuccess(exit)).toBe(true);
      if (Exit.isSuccess(exit)) expect(exit.value).toEqual(expected);
      expect(listFn).toHaveBeenCalledWith(filters);
    });
  });

  describe('getById', () => {
    it('[unit] returns item detail when found', async () => {
      const detail = makeItemDetail({ title: 'Found Item' });
      const exit = await runService((svc) => svc.getById(ITEM_ID), {
        findDetailById: () => Effect.succeed(detail),
      });

      expect(Exit.isSuccess(exit)).toBe(true);
      if (Exit.isSuccess(exit)) expect(exit.value).toEqual(detail);
    });

    it('[unit] fails with ItemNotFoundError when not found', async () => {
      const exit = await runService((svc) => svc.getById('bpi_missing'), {
        findDetailById: () => Effect.succeed(null),
      });

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const error = exit.cause.pipe((c) => (c._tag === 'Fail' ? c.error : null));
        expect(error).toBeInstanceOf(ItemNotFoundError);
      }
    });
  });

  describe('create', () => {
    it('[unit] generates id, calls repo.create, records activity, publishes event, and invalidates cache', async () => {
      const createFn = vi.fn(() => Effect.succeed(makeItem()));
      const activityFn = vi.fn(() => Effect.succeed(makeActivity()));
      publishMock.mockReturnValue(Effect.void);

      const input: CreateBlueprintItemInput = {
        title: 'New Item',
        status: 'pending',
        priority: 'medium',
        metadata: {},
      };

      const exit = await runService((svc) => svc.create(input), {
        create: createFn,
        createActivity: activityFn,
      });

      expect(Exit.isSuccess(exit)).toBe(true);
      // Verify repo.create was called with generated id + tenant info
      expect(createFn).toHaveBeenCalledOnce();
      const createArg = mockArg(createFn, 0);
      expect(createArg.id).toMatch(/^bpi_/);
      expect(createArg.tenantId).toBe(TENANT_ID);
      expect(createArg.createdBy).toBe(API_KEY_ID);
      // Verify activity recorded
      expect(activityFn).toHaveBeenCalledOnce();
      const actArg = mockArg(activityFn, 0);
      expect(actArg.action).toBe('created');
      expect(actArg.tenantId).toBe(TENANT_ID);
      // Verify event published
      expect(publishMock).toHaveBeenCalled();
      const eventArg = mockArg(publishMock);
      expect(eventArg.eventType).toBe('blueprint.item.created');
    });
  });

  describe('update', () => {
    it('[unit] updates item without status change', async () => {
      const updated = makeItem({ title: 'Updated Title' });
      const updateFn = vi.fn(() => Effect.succeed(updated));
      const activityFn = vi.fn(() => Effect.succeed(makeActivity()));
      publishMock.mockReturnValue(Effect.void);

      const input: UpdateBlueprintItemInput = { title: 'Updated Title' };

      const exit = await runService((svc) => svc.update(ITEM_ID, input), {
        update: updateFn,
        createActivity: activityFn,
      });

      expect(Exit.isSuccess(exit)).toBe(true);
      if (Exit.isSuccess(exit)) expect(exit.value.title).toBe('Updated Title');
      // No status change -> action should be 'updated'
      const actArg = mockArg(activityFn, 0);
      expect(actArg.action).toBe('updated');
      // Event type should be 'blueprint.item.updated'
      const eventArg = mockArg(publishMock);
      expect(eventArg.eventType).toBe('blueprint.item.updated');
    });

    it('[unit] validates valid status transition (pending -> in_progress)', async () => {
      const existing = makeItem({ status: 'pending' });
      const updated = makeItem({ status: 'in_progress' });
      const updateFn = vi.fn(() => Effect.succeed(updated));
      const activityFn = vi.fn(() => Effect.succeed(makeActivity()));
      publishMock.mockReturnValue(Effect.void);

      const exit = await runService((svc) => svc.update(ITEM_ID, { status: 'in_progress' }), {
        findById: () => Effect.succeed(existing),
        update: updateFn,
        createActivity: activityFn,
      });

      expect(Exit.isSuccess(exit)).toBe(true);
      const actArg = mockArg(activityFn, 0);
      expect(actArg.action).toBe('status_changed');
    });

    it('[unit] publishes blueprint.item.completed when status becomes done', async () => {
      const existing = makeItem({ status: 'in_progress' });
      const updated = makeItem({ status: 'done' });
      publishMock.mockReturnValue(Effect.void);

      const exit = await runService((svc) => svc.update(ITEM_ID, { status: 'done' }), {
        findById: () => Effect.succeed(existing),
        update: () => Effect.succeed(updated),
        createActivity: () => Effect.succeed(makeActivity()),
      });

      expect(Exit.isSuccess(exit)).toBe(true);
      const eventArg = mockArg(publishMock);
      expect(eventArg.eventType).toBe('blueprint.item.completed');
    });

    it('[unit] fails with InvalidStatusTransitionError on invalid transition (pending -> done)', async () => {
      const existing = makeItem({ status: 'pending' });

      const exit = await runService((svc) => svc.update(ITEM_ID, { status: 'done' }), {
        findById: () => Effect.succeed(existing),
      });

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const error = exit.cause.pipe((c) => (c._tag === 'Fail' ? c.error : null));
        expect(error).toBeInstanceOf(InvalidStatusTransitionError);
      }
    });

    it('[unit] fails with InvalidStatusTransitionError on done -> pending', async () => {
      const existing = makeItem({ status: 'done' });

      const exit = await runService((svc) => svc.update(ITEM_ID, { status: 'pending' }), {
        findById: () => Effect.succeed(existing),
      });

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const error = exit.cause.pipe((c) => (c._tag === 'Fail' ? c.error : null));
        expect(error).toBeInstanceOf(InvalidStatusTransitionError);
      }
    });

    it('[unit] fails with ItemNotFoundError when item does not exist (status change)', async () => {
      const exit = await runService((svc) => svc.update('bpi_missing', { status: 'in_progress' }), {
        findById: () => Effect.succeed(null),
      });

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const error = exit.cause.pipe((c) => (c._tag === 'Fail' ? c.error : null));
        expect(error).toBeInstanceOf(ItemNotFoundError);
      }
    });

    it('[unit] fails with ItemNotFoundError when repo.update returns null', async () => {
      const exit = await runService((svc) => svc.update(ITEM_ID, { title: 'New title' }), {
        update: () => Effect.succeed(null),
      });

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const error = exit.cause.pipe((c) => (c._tag === 'Fail' ? c.error : null));
        expect(error).toBeInstanceOf(ItemNotFoundError);
      }
    });
  });

  describe('remove', () => {
    it('[unit] soft-deletes, records activity, publishes event, and invalidates cache', async () => {
      const deleted = makeItem({ deletedAt: now });
      const softDeleteFn = vi.fn(() => Effect.succeed(deleted));
      const activityFn = vi.fn(() => Effect.succeed(makeActivity()));
      publishMock.mockReturnValue(Effect.void);

      const exit = await runService((svc) => svc.remove(ITEM_ID), {
        softDelete: softDeleteFn,
        createActivity: activityFn,
      });

      expect(Exit.isSuccess(exit)).toBe(true);
      expect(softDeleteFn).toHaveBeenCalledWith(ITEM_ID);
      // Activity
      const actArg = mockArg(activityFn, 0);
      expect(actArg.action).toBe('deleted');
      // Event
      const eventArg = mockArg(publishMock);
      expect(eventArg.eventType).toBe('blueprint.item.deleted');
    });

    it('[unit] fails with ItemNotFoundError when item not found', async () => {
      const exit = await runService((svc) => svc.remove('bpi_missing'), {
        softDelete: () => Effect.succeed(null),
      });

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const error = exit.cause.pipe((c) => (c._tag === 'Fail' ? c.error : null));
        expect(error).toBeInstanceOf(ItemNotFoundError);
      }
    });
  });

  // ── Sub-items ─────────────────────────────────────────────────

  describe('listSubItems', () => {
    it('[unit] returns sub-items when parent exists', async () => {
      const subItems = [makeItem({ id: 'bpi_sub1', parentId: ITEM_ID })];

      const exit = await runService((svc) => svc.listSubItems(ITEM_ID), {
        findById: () => Effect.succeed(makeItem()),
        listSubItems: () => Effect.succeed(subItems),
      });

      expect(Exit.isSuccess(exit)).toBe(true);
      if (Exit.isSuccess(exit)) expect(exit.value).toEqual(subItems);
    });

    it('[unit] fails with ItemNotFoundError when parent does not exist', async () => {
      const exit = await runService((svc) => svc.listSubItems('bpi_missing'), {
        findById: () => Effect.succeed(null),
      });

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const error = exit.cause.pipe((c) => (c._tag === 'Fail' ? c.error : null));
        expect(error).toBeInstanceOf(ItemNotFoundError);
      }
    });
  });

  describe('createSubItem', () => {
    it('[unit] creates sub-item when parent exists', async () => {
      const createFn = vi.fn(() => Effect.succeed(makeItem({ parentId: ITEM_ID })));
      const activityFn = vi.fn(() => Effect.succeed(makeActivity()));
      publishMock.mockReturnValue(Effect.void);

      const input: CreateBlueprintItemInput = {
        title: 'Sub Item',
        status: 'pending',
        priority: 'low',
        metadata: {},
      };

      const exit = await runService((svc) => svc.createSubItem(ITEM_ID, input), {
        findById: () => Effect.succeed(makeItem()),
        create: createFn,
        createActivity: activityFn,
      });

      expect(Exit.isSuccess(exit)).toBe(true);
      // Verify parent_id is set
      const createArg = mockArg(createFn, 0);
      expect(createArg.parent_id).toBe(ITEM_ID);
      expect(createArg.id).toMatch(/^bpi_/);
    });

    it('[unit] fails with ParentItemNotFoundError when parent does not exist', async () => {
      const input: CreateBlueprintItemInput = {
        title: 'Orphan',
        status: 'pending',
        priority: 'low',
        metadata: {},
      };

      const exit = await runService((svc) => svc.createSubItem('bpi_missing', input), {
        findById: () => Effect.succeed(null),
      });

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const error = exit.cause.pipe((c) => (c._tag === 'Fail' ? c.error : null));
        expect(error).toBeInstanceOf(ParentItemNotFoundError);
      }
    });
  });

  // ── Tags ──────────────────────────────────────────────────────

  describe('listTags', () => {
    it('[unit] delegates to repo.listTags with tenant id', async () => {
      const tags = [makeTag()];
      const listTagsFn = vi.fn(() => Effect.succeed(tags));

      const exit = await runService((svc) => svc.listTags(), { listTags: listTagsFn });

      expect(Exit.isSuccess(exit)).toBe(true);
      expect(listTagsFn).toHaveBeenCalledWith(TENANT_ID);
    });
  });

  describe('createTag', () => {
    it('[unit] creates tag when name is unique', async () => {
      const tag = makeTag({ name: 'new-tag' });
      const createTagFn = vi.fn(() => Effect.succeed(tag));
      publishMock.mockReturnValue(Effect.void);

      const input: CreateBlueprintTagInput = { name: 'new-tag', color: '#00FF00' };

      const exit = await runService((svc) => svc.createTag(input), {
        findTagByName: () => Effect.succeed(null),
        createTag: createTagFn,
      });

      expect(Exit.isSuccess(exit)).toBe(true);
      const createArg = mockArg(createTagFn, 0);
      expect(createArg.id).toMatch(/^bpt_/);
      expect(createArg.tenantId).toBe(TENANT_ID);
    });

    it('[unit] fails with DuplicateTagError when tag name already exists', async () => {
      const input: CreateBlueprintTagInput = { name: 'urgent', color: '#FF0000' };

      const exit = await runService((svc) => svc.createTag(input), {
        findTagByName: () => Effect.succeed(makeTag()),
      });

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const error = exit.cause.pipe((c) => (c._tag === 'Fail' ? c.error : null));
        expect(error).toBeInstanceOf(DuplicateTagError);
      }
    });
  });

  describe('deleteTag', () => {
    it('[unit] deletes tag and publishes event', async () => {
      const deleted = makeTag();
      publishMock.mockReturnValue(Effect.void);

      const exit = await runService((svc) => svc.deleteTag(TAG_ID), {
        deleteTag: () => Effect.succeed(deleted),
      });

      expect(Exit.isSuccess(exit)).toBe(true);
      const eventArg = mockArg(publishMock);
      expect(eventArg.eventType).toBe('blueprint.tag.deleted');
    });

    it('[unit] fails with TagNotFoundError when tag does not exist', async () => {
      const exit = await runService((svc) => svc.deleteTag('bpt_missing'), {
        deleteTag: () => Effect.succeed(null),
      });

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const error = exit.cause.pipe((c) => (c._tag === 'Fail' ? c.error : null));
        expect(error).toBeInstanceOf(TagNotFoundError);
      }
    });
  });

  describe('addTagToItem', () => {
    it('[unit] adds tag when both item and tag exist', async () => {
      const item = makeItem();
      const tag = makeTag();
      const addTagFn = vi.fn(() => Effect.void);
      const activityFn = vi.fn(() => Effect.succeed(makeActivity()));
      publishMock.mockReturnValue(Effect.void);

      const exit = await runService((svc) => svc.addTagToItem(ITEM_ID, TAG_ID), {
        findById: () => Effect.succeed(item),
        findTagById: () => Effect.succeed(tag),
        addTagToItem: addTagFn,
        createActivity: activityFn,
      });

      expect(Exit.isSuccess(exit)).toBe(true);
      expect(addTagFn).toHaveBeenCalledWith(TENANT_ID, ITEM_ID, TAG_ID);
      const actArg = mockArg(activityFn, 0);
      expect(actArg.action).toBe('tagged');
    });

    it('[unit] fails with ItemNotFoundError when item does not exist', async () => {
      const exit = await runService((svc) => svc.addTagToItem('bpi_missing', TAG_ID), {
        findById: () => Effect.succeed(null),
      });

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const error = exit.cause.pipe((c) => (c._tag === 'Fail' ? c.error : null));
        expect(error).toBeInstanceOf(ItemNotFoundError);
      }
    });

    it('[unit] fails with TagNotFoundError when tag does not exist', async () => {
      const exit = await runService((svc) => svc.addTagToItem(ITEM_ID, 'bpt_missing'), {
        findById: () => Effect.succeed(makeItem()),
        findTagById: () => Effect.succeed(null),
      });

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const error = exit.cause.pipe((c) => (c._tag === 'Fail' ? c.error : null));
        expect(error).toBeInstanceOf(TagNotFoundError);
      }
    });
  });

  describe('removeTagFromItem', () => {
    it('[unit] removes tag when both item and tag exist', async () => {
      const tag = makeTag();
      const removeTagFn = vi.fn(() => Effect.void);
      const activityFn = vi.fn(() => Effect.succeed(makeActivity()));

      const exit = await runService((svc) => svc.removeTagFromItem(ITEM_ID, TAG_ID), {
        findById: () => Effect.succeed(makeItem()),
        findTagById: () => Effect.succeed(tag),
        removeTagFromItem: removeTagFn,
        createActivity: activityFn,
      });

      expect(Exit.isSuccess(exit)).toBe(true);
      expect(removeTagFn).toHaveBeenCalledWith(ITEM_ID, TAG_ID);
      const actArg = mockArg(activityFn, 0);
      expect(actArg.action).toBe('untagged');
    });

    it('[unit] fails with ItemNotFoundError when item does not exist', async () => {
      const exit = await runService((svc) => svc.removeTagFromItem('bpi_missing', TAG_ID), {
        findById: () => Effect.succeed(null),
      });

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const error = exit.cause.pipe((c) => (c._tag === 'Fail' ? c.error : null));
        expect(error).toBeInstanceOf(ItemNotFoundError);
      }
    });

    it('[unit] fails with TagNotFoundError when tag does not exist', async () => {
      const exit = await runService((svc) => svc.removeTagFromItem(ITEM_ID, 'bpt_missing'), {
        findById: () => Effect.succeed(makeItem()),
        findTagById: () => Effect.succeed(null),
      });

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const error = exit.cause.pipe((c) => (c._tag === 'Fail' ? c.error : null));
        expect(error).toBeInstanceOf(TagNotFoundError);
      }
    });
  });

  // ── Comments ──────────────────────────────────────────────────

  describe('listComments', () => {
    it('[unit] returns comments when item exists', async () => {
      const comments = [makeComment()];

      const exit = await runService((svc) => svc.listComments(ITEM_ID), {
        findById: () => Effect.succeed(makeItem()),
        listComments: () => Effect.succeed(comments),
      });

      expect(Exit.isSuccess(exit)).toBe(true);
      if (Exit.isSuccess(exit)) expect(exit.value).toEqual(comments);
    });

    it('[unit] fails with ItemNotFoundError when item does not exist', async () => {
      const exit = await runService((svc) => svc.listComments('bpi_missing'), {
        findById: () => Effect.succeed(null),
      });

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const error = exit.cause.pipe((c) => (c._tag === 'Fail' ? c.error : null));
        expect(error).toBeInstanceOf(ItemNotFoundError);
      }
    });
  });

  describe('createComment', () => {
    it('[unit] creates comment when item exists, records activity, publishes event', async () => {
      const comment = makeComment();
      const createCommentFn = vi.fn(() => Effect.succeed(comment));
      const activityFn = vi.fn(() => Effect.succeed(makeActivity()));
      publishMock.mockReturnValue(Effect.void);

      const input: CreateBlueprintCommentInput = { content: 'Test comment', author_type: 'agent' };

      const exit = await runService((svc) => svc.createComment(ITEM_ID, input), {
        findById: () => Effect.succeed(makeItem()),
        createComment: createCommentFn,
        createActivity: activityFn,
      });

      expect(Exit.isSuccess(exit)).toBe(true);
      // Verify createComment args
      const createArg = mockArg(createCommentFn, 0);
      expect(createArg.id).toMatch(/^bpc_/);
      expect(createArg.tenantId).toBe(TENANT_ID);
      expect(createArg.itemId).toBe(ITEM_ID);
      expect(createArg.authorId).toBe(API_KEY_ID);
      // Activity
      const actArg = mockArg(activityFn, 0);
      expect(actArg.action).toBe('commented');
      // Event
      const eventArg = mockArg(publishMock);
      expect(eventArg.eventType).toBe('blueprint.comment.created');
    });

    it('[unit] fails with ItemNotFoundError when item does not exist', async () => {
      const input: CreateBlueprintCommentInput = { content: 'Orphan comment', author_type: 'user' };

      const exit = await runService((svc) => svc.createComment('bpi_missing', input), {
        findById: () => Effect.succeed(null),
      });

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const error = exit.cause.pipe((c) => (c._tag === 'Fail' ? c.error : null));
        expect(error).toBeInstanceOf(ItemNotFoundError);
      }
    });
  });

  describe('deleteComment', () => {
    it('[unit] deletes comment and publishes event', async () => {
      const deleted = makeComment();
      publishMock.mockReturnValue(Effect.void);

      const exit = await runService((svc) => svc.deleteComment(COMMENT_ID), {
        deleteComment: () => Effect.succeed(deleted),
      });

      expect(Exit.isSuccess(exit)).toBe(true);
      const eventArg = mockArg(publishMock);
      expect(eventArg.eventType).toBe('blueprint.comment.deleted');
    });

    it('[unit] fails with CommentNotFoundError when comment does not exist', async () => {
      const exit = await runService((svc) => svc.deleteComment('bpc_missing'), {
        deleteComment: () => Effect.succeed(null),
      });

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const error = exit.cause.pipe((c) => (c._tag === 'Fail' ? c.error : null));
        expect(error).toBeInstanceOf(CommentNotFoundError);
      }
    });
  });

  // ── Activity ──────────────────────────────────────────────────

  describe('listActivity', () => {
    it('[unit] returns activity when item exists', async () => {
      const activities = [makeActivity()];

      const exit = await runService((svc) => svc.listActivity(ITEM_ID), {
        findById: () => Effect.succeed(makeItem()),
        listActivity: () => Effect.succeed(activities),
      });

      expect(Exit.isSuccess(exit)).toBe(true);
      if (Exit.isSuccess(exit)) expect(exit.value).toEqual(activities);
    });

    it('[unit] fails with ItemNotFoundError when item does not exist', async () => {
      const exit = await runService((svc) => svc.listActivity('bpi_missing'), {
        findById: () => Effect.succeed(null),
      });

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const error = exit.cause.pipe((c) => (c._tag === 'Fail' ? c.error : null));
        expect(error).toBeInstanceOf(ItemNotFoundError);
      }
    });
  });
});
