import { DbClient } from '@ctrlpane/db';
import { Effect, Exit, Layer, Scope } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NatsClient } from './nats.js';
import { startOutboxPoller } from './outbox-poller.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'obx_01TEST',
    tenantId: 'tnt_01',
    eventType: 'blueprint.item.created.v1',
    aggregateType: 'blueprint_item',
    aggregateId: 'bpi_01',
    payload: { title: 'Test' },
    traceId: 'trace-123',
    status: 'pending',
    attempts: 0,
    publishedAt: null,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function createMockDbChain(pendingEvents: unknown[]) {
  const limitFn = vi.fn().mockResolvedValue(pendingEvents);
  const orderByFn = vi.fn().mockReturnValue({ limit: limitFn });
  const whereFn = vi.fn().mockReturnValue({ orderBy: orderByFn });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  const updateWhereFn = vi.fn().mockResolvedValue(undefined);
  const setFn = vi.fn().mockReturnValue({ where: updateWhereFn });

  return {
    from: fromFn,
    where: whereFn,
    orderBy: orderByFn,
    limit: limitFn,
    set: setFn,
    updateWhere: updateWhereFn,
  };
}

function createMockDb(chain: ReturnType<typeof createMockDbChain>) {
  return {
    select: vi.fn().mockReturnValue({ from: chain.from }),
    update: vi.fn().mockReturnValue({ set: chain.set }),
  };
}

function createMockJs() {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
  };
}

function buildLayers(
  mockDb: ReturnType<typeof createMockDb>,
  mockJs: ReturnType<typeof createMockJs>,
) {
  const dbLayer = Layer.succeed(DbClient, {
    // biome-ignore lint/suspicious/noExplicitAny: mock DB for testing
    db: mockDb as any,
    // biome-ignore lint/suspicious/noExplicitAny: mock DB for testing
  } as any);

  const natsLayer = Layer.succeed(NatsClient, {
    // biome-ignore lint/suspicious/noExplicitAny: mock nats for testing
    nc: {} as any,
    // biome-ignore lint/suspicious/noExplicitAny: mock nats for testing
    js: mockJs as any,
  });

  return Layer.merge(dbLayer, natsLayer);
}

/**
 * Run the poller with a manually-managed scope so the interval is NOT
 * immediately cleared. Returns a close function to tear down later.
 */
async function startPollerWithScope(
  mockDb: ReturnType<typeof createMockDb>,
  mockJs: ReturnType<typeof createMockJs>,
) {
  const layers = buildLayers(mockDb, mockJs);
  const scope = Effect.runSync(Scope.make());

  await Effect.runPromise(
    startOutboxPoller.pipe(Effect.provide(layers), Effect.provideService(Scope.Scope, scope)),
  );

  return {
    close: () => Effect.runPromise(Scope.close(scope, Exit.void)),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('unit: OutboxPoller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('polls pending events ordered by createdAt', async () => {
    const events = [makeEvent()];
    const chain = createMockDbChain(events);
    const mockDb = createMockDb(chain);
    const mockJs = createMockJs();

    const handle = await startPollerWithScope(mockDb, mockJs);

    await vi.advanceTimersByTimeAsync(1_100);

    expect(mockDb.select).toHaveBeenCalled();
    expect(chain.from).toHaveBeenCalled();

    await handle.close();
  });

  it('publishes CloudEvents with correct schema to NATS JetStream', async () => {
    const event = makeEvent();
    const chain = createMockDbChain([event]);
    const mockDb = createMockDb(chain);
    const mockJs = createMockJs();

    const handle = await startPollerWithScope(mockDb, mockJs);

    await vi.advanceTimersByTimeAsync(1_100);

    expect(mockJs.publish).toHaveBeenCalledTimes(1);
    const [subject, data] = mockJs.publish.mock.calls[0]!;
    expect(subject).toBe('blueprint.item.created.v1');

    const decoded = JSON.parse(new TextDecoder().decode(data));
    expect(decoded.specversion).toBe('1.0');
    expect(decoded.id).toBe('obx_01TEST');
    expect(decoded.source).toBe('ctrlpane.blueprint');
    expect(decoded.type).toBe('ctrlpane.blueprint.item.created.v1.v1');
    expect(decoded.tenantid).toBe('tnt_01');
    expect(decoded.traceid).toBe('trace-123');
    expect(decoded.data).toEqual({ title: 'Test' });

    await handle.close();
  });

  it('marks event as published on success', async () => {
    const event = makeEvent();
    const chain = createMockDbChain([event]);
    const mockDb = createMockDb(chain);
    const mockJs = createMockJs();

    const handle = await startPollerWithScope(mockDb, mockJs);

    await vi.advanceTimersByTimeAsync(1_100);

    expect(mockDb.update).toHaveBeenCalled();
    expect(chain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'published',
        publishedAt: expect.any(Date),
      }),
    );

    await handle.close();
  });

  it('increments attempts on failure', async () => {
    const event = makeEvent({ attempts: 2 });
    const chain = createMockDbChain([event]);
    const mockDb = createMockDb(chain);
    const mockJs = createMockJs();
    mockJs.publish.mockRejectedValue(new Error('NATS unavailable'));

    const handle = await startPollerWithScope(mockDb, mockJs);

    await vi.advanceTimersByTimeAsync(1_100);

    expect(mockDb.update).toHaveBeenCalled();
    expect(chain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        attempts: 3,
        status: 'pending',
      }),
    );

    await handle.close();
  });

  it('sets dead_letter status when attempts reach max (10)', async () => {
    const event = makeEvent({ attempts: 9 });
    const chain = createMockDbChain([event]);
    const mockDb = createMockDb(chain);
    const mockJs = createMockJs();
    mockJs.publish.mockRejectedValue(new Error('NATS unavailable'));

    const handle = await startPollerWithScope(mockDb, mockJs);

    await vi.advanceTimersByTimeAsync(1_100);

    expect(chain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        attempts: 10,
        status: 'dead_letter',
      }),
    );

    await handle.close();
  });
});
