import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock centrifuge BEFORE importing the module under test
// ---------------------------------------------------------------------------

const {
  mockSubscription,
  mockCentrifugeInstance,
  CentrifugeConstructorCalls,
  mockInvalidateQueries,
} = vi.hoisted(() => {
  const mockSubscription = {
    on: vi.fn(),
    subscribe: vi.fn(),
  };

  const mockCentrifugeInstance = {
    newSubscription: vi.fn(() => mockSubscription),
    connect: vi.fn(),
    disconnect: vi.fn(),
  };

  const CentrifugeConstructorCalls: unknown[][] = [];

  const mockInvalidateQueries = vi.fn();

  return {
    mockSubscription,
    mockCentrifugeInstance,
    CentrifugeConstructorCalls,
    mockInvalidateQueries,
  };
});

vi.mock('centrifuge', () => ({
  Centrifuge: class {
    constructor(...args: unknown[]) {
      CentrifugeConstructorCalls.push(args);
      Object.assign(this, mockCentrifugeInstance);
    }
  },
}));

vi.mock('./query-client.js', () => ({
  queryClient: {
    invalidateQueries: mockInvalidateQueries,
  },
}));

// Import AFTER mocks
import { connectWebSocket, disconnectWebSocket } from './ws-client.js';

beforeEach(() => {
  CentrifugeConstructorCalls.length = 0;
});

afterEach(() => {
  // Reset module state by disconnecting
  disconnectWebSocket();
  vi.restoreAllMocks();
  mockCentrifugeInstance.newSubscription.mockReturnValue(mockSubscription);
});

// ---------------------------------------------------------------------------
// connectWebSocket
// ---------------------------------------------------------------------------

describe('unit: ws-client — connectWebSocket', () => {
  it('creates Centrifuge instance with correct URL and token', () => {
    connectWebSocket('tok-123', 'tenant-1');

    expect(CentrifugeConstructorCalls).toHaveLength(1);
    expect(CentrifugeConstructorCalls[0]).toEqual([
      'ws://localhost:38000/connection/websocket',
      { token: 'tok-123' },
    ]);
  });

  it('subscribes to blueprint:items#tenantId channel', () => {
    connectWebSocket('tok', 'tenant-abc');

    expect(mockCentrifugeInstance.newSubscription).toHaveBeenCalledWith(
      'blueprint:items#tenant-abc',
    );
    expect(mockSubscription.subscribe).toHaveBeenCalled();
    expect(mockCentrifugeInstance.connect).toHaveBeenCalled();
  });

  it('publication handler invalidates items list query', () => {
    connectWebSocket('tok', 'tenant-1');

    // Get the publication callback registered via .on('publication', ...)
    const onCall = mockSubscription.on.mock.calls.find((c: unknown[]) => c[0] === 'publication');
    expect(onCall).toBeDefined();
    const handler = onCall?.[1] as (ctx: { data: unknown }) => void;

    handler({ data: { type: 'item.created' } });

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['blueprint', 'items'],
    });
  });

  it('publication handler invalidates specific item when item_id present', () => {
    connectWebSocket('tok', 'tenant-1');

    const onCall = mockSubscription.on.mock.calls.find((c: unknown[]) => c[0] === 'publication');
    const handler = onCall?.[1] as (ctx: { data: unknown }) => void;

    handler({ data: { type: 'item.updated', item_id: 'item-42' } });

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['blueprint', 'item', 'item-42'],
    });
  });

  it('disconnects previous connection when reconnecting', () => {
    connectWebSocket('tok-1', 'tenant-1');
    const firstDisconnect = mockCentrifugeInstance.disconnect;

    connectWebSocket('tok-2', 'tenant-2');

    // The first instance's disconnect should have been called
    expect(firstDisconnect).toHaveBeenCalled();
    expect(CentrifugeConstructorCalls).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// disconnectWebSocket
// ---------------------------------------------------------------------------

describe('unit: ws-client — disconnectWebSocket', () => {
  it('disconnects active connection', () => {
    connectWebSocket('tok', 'tenant-1');
    disconnectWebSocket();

    expect(mockCentrifugeInstance.disconnect).toHaveBeenCalled();
  });

  it('is safe when no connection exists', () => {
    // Should not throw
    expect(() => disconnectWebSocket()).not.toThrow();
  });
});
