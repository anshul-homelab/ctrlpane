import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CentrifugoClient, CentrifugoClientLive } from './centrifugo.js';

describe('unit: CentrifugoClient', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubEnv('CENTRIFUGO_URL', 'http://localhost:38000');
    vi.stubEnv('CENTRIFUGO_API_KEY', 'test_api_key');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it('publish sends correct POST to /api/publish with Authorization header and JSON body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;

    await Effect.runPromise(
      CentrifugoClient.pipe(
        Effect.flatMap((client) => client.publish('test:channel', { msg: 'hello' })),
        Effect.provide(CentrifugoClientLive),
      ),
    );

    expect(globalThis.fetch).toHaveBeenCalledWith('http://localhost:38000/api/publish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'apikey test_api_key',
      },
      body: JSON.stringify({ channel: 'test:channel', data: { msg: 'hello' } }),
    });
  });

  it('publish succeeds on ok response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;

    const result = await Effect.runPromise(
      CentrifugoClient.pipe(
        Effect.flatMap((client) => client.publish('ch', { x: 1 })),
        Effect.provide(CentrifugoClientLive),
      ),
    );

    expect(result).toBeUndefined();
  });

  it('publish throws on non-ok response with status code', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 503 }) as unknown as typeof fetch;

    const error = await Effect.runPromise(
      CentrifugoClient.pipe(
        Effect.flatMap((client) => client.publish('ch', {})),
        Effect.provide(CentrifugoClientLive),
        Effect.flip,
      ),
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('Centrifugo publish failed: 503');
  });

  it('publish wraps fetch errors', async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new TypeError('Network failure')) as unknown as typeof fetch;

    const error = await Effect.runPromise(
      CentrifugoClient.pipe(
        Effect.flatMap((client) => client.publish('ch', {})),
        Effect.provide(CentrifugoClientLive),
        Effect.flip,
      ),
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('Centrifugo publish error');
    expect(error.message).toContain('Network failure');
  });
});
