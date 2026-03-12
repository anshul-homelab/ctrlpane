import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import { RedisClient, RedisClientLive } from './redis.js';

describe('unit: RedisClient', () => {
  it('RedisClient tag is defined', () => {
    expect(RedisClient).toBeDefined();
    expect(RedisClient.key).toBe('RedisClient');
  });

  it('RedisClientLive is a valid Layer', () => {
    expect(RedisClientLive).toBeDefined();
    expect(typeof RedisClientLive.pipe).toBe('function');
  });

  it('provides a redis instance via the Layer', async () => {
    vi.stubEnv('REDIS_URL', 'redis://localhost:36379');

    const result = await Effect.runPromise(
      RedisClient.pipe(
        Effect.map((client) => {
          expect(client.redis).toBeDefined();
          expect(typeof client.redis.disconnect).toBe('function');
          return true;
        }),
        Effect.provide(RedisClientLive),
        Effect.scoped,
      ),
    );

    expect(result).toBe(true);
    vi.unstubAllEnvs();
  });
});
