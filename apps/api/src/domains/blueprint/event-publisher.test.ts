import { DbClient } from '@ctrlpane/db';
import { Effect, Layer } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import { type EventPayload, makeBlueprintEventPublisher } from './event-publisher.js';

function createMockDbLayer(insertFn: ReturnType<typeof vi.fn>) {
  const mockDb = {
    insert: () => ({
      values: insertFn,
    }),
  };
  // biome-ignore lint/suspicious/noExplicitAny: mock DB for testing
  return Layer.succeed(DbClient, { db: mockDb, withTenant: vi.fn(), transaction: vi.fn() } as any);
}

describe('unit: BlueprintEventPublisher', () => {
  const sampleEvent: EventPayload = {
    eventType: 'blueprint.created',
    aggregateType: 'blueprint',
    aggregateId: 'bpr_01ABC',
    tenantId: 'tnt_01TENANT',
    payload: { name: 'Test Blueprint' },
  };

  it('publish inserts correct fields with id prefix "obx_"', async () => {
    const insertValues = vi.fn().mockResolvedValue(undefined);
    const layer = createMockDbLayer(insertValues);

    await Effect.runPromise(
      Effect.gen(function* () {
        const publisher = yield* makeBlueprintEventPublisher;
        yield* publisher.publish(sampleEvent);
      }).pipe(Effect.provide(layer)),
    );

    expect(insertValues).toHaveBeenCalledOnce();
    const inserted = insertValues.mock.calls[0]![0];
    expect(inserted.id).toMatch(/^obx_/);
    expect(inserted.tenantId).toBe('tnt_01TENANT');
    expect(inserted.eventType).toBe('blueprint.created');
    expect(inserted.aggregateType).toBe('blueprint');
    expect(inserted.aggregateId).toBe('bpr_01ABC');
    expect(inserted.payload).toEqual({ name: 'Test Blueprint' });
  });

  it('publish wraps DB errors', async () => {
    const insertValues = vi.fn().mockRejectedValue(new Error('DB connection lost'));
    const layer = createMockDbLayer(insertValues);

    const error = await Effect.runPromise(
      Effect.gen(function* () {
        const publisher = yield* makeBlueprintEventPublisher;
        yield* publisher.publish(sampleEvent);
      }).pipe(Effect.provide(layer), Effect.flip),
    );

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('DB connection lost');
  });
});
