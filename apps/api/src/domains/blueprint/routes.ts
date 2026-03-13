import { DbClientLive } from '@ctrlpane/db';
import {
  addTagToItemSchema,
  blueprintItemFiltersSchema,
  createBlueprintCommentSchema,
  createBlueprintItemSchema,
  createBlueprintTagSchema,
  updateBlueprintItemSchema,
} from '@ctrlpane/shared';
import { zValidator } from '@hono/zod-validator';
import { Effect, Layer } from 'effect';
import { Hono } from 'hono';
import { z } from 'zod';
import { RedisClientLive } from '../../infra/redis.js';
import type { AppEnv } from '../../shared/hono-env.js';
import { runEffect } from '../../shared/run-effect.js';
import { makeTenantContextLayer } from '../../shared/tenant-context.js';
import { BlueprintLive } from './layer.js';
import { BlueprintItemService } from './service.js';

/**
 * Builds the full layer needed for blueprint routes.
 * TenantContext is built per-request from the Hono context variables.
 */
const makeBlueprintLayer = (tenantId: string, apiKeyId: string) =>
  BlueprintLive.pipe(
    Layer.provide(makeTenantContextLayer(tenantId, apiKeyId, [])),
    Layer.provide(DbClientLive()),
    Layer.provide(RedisClientLive),
  );

/** Helper: wrap an effect with the blueprint layer from the request context */
const withBlueprint = <A, E>(
  c: { get: (key: string) => string },
  effect: Effect.Effect<A, E, BlueprintItemService>,
): Effect.Effect<A, E, never> => {
  const tenantId = c.get('tenantId') as string;
  const apiKeyId = c.get('apiKeyId') as string;
  return Effect.provide(effect, makeBlueprintLayer(tenantId, apiKeyId));
};

export const blueprintRoutes = new Hono<AppEnv>()

  // ── Dashboard ────────────────────────────────────────────────

  // GET /dashboard/stats — Dashboard summary stats
  .get('/dashboard/stats', (c) =>
    runEffect(
      c,
      withBlueprint(
        c,
        Effect.gen(function* () {
          const svc = yield* BlueprintItemService;
          const stats = yield* svc.getDashboardStats();
          return { data: stats };
        }),
      ),
    ),
  )

  // ── Items ──────────────────────────────────────────────────

  // GET /items — List items with cursor pagination and filters
  .get('/items', zValidator('query', blueprintItemFiltersSchema), (c) =>
    runEffect(
      c,
      withBlueprint(
        c,
        Effect.gen(function* () {
          const svc = yield* BlueprintItemService;
          const filters = c.req.valid('query');
          const result = yield* svc.list(filters);
          return {
            data: result.items,
            pagination: {
              next_cursor: result.nextCursor,
              prev_cursor: null,
              has_more: result.hasMore,
              limit: filters.limit ?? 25,
            },
          };
        }),
      ),
    ),
  )

  // POST /items — Create a new item
  .post('/items', zValidator('json', createBlueprintItemSchema), (c) =>
    runEffect(
      c,
      withBlueprint(
        c,
        Effect.gen(function* () {
          const svc = yield* BlueprintItemService;
          const input = c.req.valid('json');
          const item = yield* svc.create(input);
          return { data: item };
        }),
      ),
    ),
  )

  // GET /items/:id — Get item detail with sub-items, tags, comments
  .get('/items/:id', (c) =>
    runEffect(
      c,
      withBlueprint(
        c,
        Effect.gen(function* () {
          const svc = yield* BlueprintItemService;
          const detail = yield* svc.getById(c.req.param('id'));
          return { data: detail };
        }),
      ),
    ),
  )

  // PATCH /items/:id — Update an item
  .patch('/items/:id', zValidator('json', updateBlueprintItemSchema), (c) =>
    runEffect(
      c,
      withBlueprint(
        c,
        Effect.gen(function* () {
          const svc = yield* BlueprintItemService;
          const updated = yield* svc.update(c.req.param('id'), c.req.valid('json'));
          return { data: updated };
        }),
      ),
    ),
  )

  // DELETE /items/:id — Soft delete an item
  .delete('/items/:id', (c) =>
    runEffect(
      c,
      withBlueprint(
        c,
        Effect.gen(function* () {
          const svc = yield* BlueprintItemService;
          const deleted = yield* svc.remove(c.req.param('id'));
          return { data: deleted };
        }),
      ),
    ),
  )

  // ── Sub-items ──────────────────────────────────────────────

  // GET /items/:id/sub-items — List sub-items
  .get('/items/:id/sub-items', (c) =>
    runEffect(
      c,
      withBlueprint(
        c,
        Effect.gen(function* () {
          const svc = yield* BlueprintItemService;
          const subItems = yield* svc.listSubItems(c.req.param('id'));
          return { data: subItems };
        }),
      ),
    ),
  )

  // POST /items/:id/sub-items — Create a sub-item
  .post('/items/:id/sub-items', zValidator('json', createBlueprintItemSchema), (c) =>
    runEffect(
      c,
      withBlueprint(
        c,
        Effect.gen(function* () {
          const svc = yield* BlueprintItemService;
          const subItem = yield* svc.createSubItem(c.req.param('id'), c.req.valid('json'));
          return { data: subItem };
        }),
      ),
    ),
  )

  // ── Tags (tenant-level) ────────────────────────────────────

  // GET /tags — List all tags for tenant
  .get('/tags', (c) =>
    runEffect(
      c,
      withBlueprint(
        c,
        Effect.gen(function* () {
          const svc = yield* BlueprintItemService;
          const tags = yield* svc.listTags();
          return { data: tags };
        }),
      ),
    ),
  )

  // POST /tags — Create a new tag
  .post('/tags', zValidator('json', createBlueprintTagSchema), (c) =>
    runEffect(
      c,
      withBlueprint(
        c,
        Effect.gen(function* () {
          const svc = yield* BlueprintItemService;
          const tag = yield* svc.createTag(c.req.valid('json'));
          return { data: tag };
        }),
      ),
    ),
  )

  // DELETE /tags/:id — Delete a tag
  .delete('/tags/:id', (c) =>
    runEffect(
      c,
      withBlueprint(
        c,
        Effect.gen(function* () {
          const svc = yield* BlueprintItemService;
          const deleted = yield* svc.deleteTag(c.req.param('id'));
          return { data: deleted };
        }),
      ),
    ),
  )

  // ── Tag assignment (item-level) ────────────────────────────

  // POST /items/:id/tags — Add a tag to an item
  .post('/items/:id/tags', zValidator('json', addTagToItemSchema), (c) =>
    runEffect(
      c,
      withBlueprint(
        c,
        Effect.gen(function* () {
          const svc = yield* BlueprintItemService;
          const { tag_id } = c.req.valid('json');
          yield* svc.addTagToItem(c.req.param('id'), tag_id);
          return { data: { success: true } };
        }),
      ),
    ),
  )

  // DELETE /items/:id/tags/:tagId — Remove a tag from an item
  .delete('/items/:id/tags/:tagId', (c) =>
    runEffect(
      c,
      withBlueprint(
        c,
        Effect.gen(function* () {
          const svc = yield* BlueprintItemService;
          yield* svc.removeTagFromItem(c.req.param('id'), c.req.param('tagId'));
          return { data: { success: true } };
        }),
      ),
    ),
  )

  // ── Comments ───────────────────────────────────────────────

  // GET /items/:id/comments — List comments for an item
  .get('/items/:id/comments', (c) =>
    runEffect(
      c,
      withBlueprint(
        c,
        Effect.gen(function* () {
          const svc = yield* BlueprintItemService;
          const comments = yield* svc.listComments(c.req.param('id'));
          return { data: comments };
        }),
      ),
    ),
  )

  // POST /items/:id/comments — Create a comment on an item
  .post('/items/:id/comments', zValidator('json', createBlueprintCommentSchema), (c) =>
    runEffect(
      c,
      withBlueprint(
        c,
        Effect.gen(function* () {
          const svc = yield* BlueprintItemService;
          const comment = yield* svc.createComment(c.req.param('id'), c.req.valid('json'));
          return { data: comment };
        }),
      ),
    ),
  )

  // DELETE /comments/:id — Delete a comment
  .delete('/comments/:id', (c) =>
    runEffect(
      c,
      withBlueprint(
        c,
        Effect.gen(function* () {
          const svc = yield* BlueprintItemService;
          const deleted = yield* svc.deleteComment(c.req.param('id'));
          return { data: deleted };
        }),
      ),
    ),
  )

  // ── Activity ───────────────────────────────────────────────

  // GET /items/:id/activity — List activity log for an item
  .get('/items/:id/activity', (c) =>
    runEffect(
      c,
      withBlueprint(
        c,
        Effect.gen(function* () {
          const svc = yield* BlueprintItemService;
          const activity = yield* svc.listActivity(c.req.param('id'));
          return { data: activity };
        }),
      ),
    ),
  )

  // ── Search ─────────────────────────────────────────────────

  // GET /search — Search items (alias for GET /items with search param)
  .get(
    '/search',
    zValidator(
      'query',
      z.object({
        q: z.string().min(1),
        status: z.enum(['pending', 'in_progress', 'done']).optional(),
        priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
        limit: z.coerce.number().min(1).max(100).optional().default(25),
        cursor: z.string().optional(),
      }),
    ),
    (c) =>
      runEffect(
        c,
        withBlueprint(
          c,
          Effect.gen(function* () {
            const svc = yield* BlueprintItemService;
            const query = c.req.valid('query');
            const result = yield* svc.list({
              search: query.q,
              status: query.status,
              priority: query.priority,
              limit: query.limit,
              cursor: query.cursor,
              sort: 'created_at',
              order: 'desc',
            });
            return {
              data: result.items,
              pagination: {
                next_cursor: result.nextCursor,
                prev_cursor: null,
                has_more: result.hasMore,
                limit: query.limit,
              },
            };
          }),
        ),
      ),
  )

  // ── Bulk operations ────────────────────────────────────────

  // POST /items/bulk/status — Bulk update status
  .post(
    '/items/bulk/status',
    zValidator(
      'json',
      z.object({
        item_ids: z.array(z.string().startsWith('bpi_')).min(1).max(100),
        status: z.enum(['pending', 'in_progress', 'done']),
      }),
    ),
    (c) =>
      runEffect(
        c,
        withBlueprint(
          c,
          Effect.gen(function* () {
            const svc = yield* BlueprintItemService;
            const { item_ids, status } = c.req.valid('json');
            const results: Array<{
              id: string;
              success: boolean;
              error?: string;
            }> = [];

            for (const id of item_ids) {
              const result = yield* svc.update(id, { status }).pipe(
                Effect.map((item) => ({ id: item.id, success: true as const })),
                Effect.catchAll((e) =>
                  Effect.succeed({
                    id,
                    success: false as const,
                    error: e.message,
                  }),
                ),
              );
              results.push(result);
            }

            return { data: results };
          }),
        ),
      ),
  )

  // POST /items/bulk/delete — Bulk soft delete
  .post(
    '/items/bulk/delete',
    zValidator(
      'json',
      z.object({
        item_ids: z.array(z.string().startsWith('bpi_')).min(1).max(100),
      }),
    ),
    (c) =>
      runEffect(
        c,
        withBlueprint(
          c,
          Effect.gen(function* () {
            const svc = yield* BlueprintItemService;
            const { item_ids } = c.req.valid('json');
            const results: Array<{
              id: string;
              success: boolean;
              error?: string;
            }> = [];

            for (const id of item_ids) {
              const result = yield* svc.remove(id).pipe(
                Effect.map((item) => ({ id: item.id, success: true as const })),
                Effect.catchAll((e) =>
                  Effect.succeed({
                    id,
                    success: false as const,
                    error: e.message,
                  }),
                ),
              );
              results.push(result);
            }

            return { data: results };
          }),
        ),
      ),
  );
