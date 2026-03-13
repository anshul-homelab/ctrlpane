import { Context, Effect, Layer } from 'effect';
import Redis from 'ioredis';

export interface RedisClientShape {
  readonly redis: Redis;
}

export class RedisClient extends Context.Tag('RedisClient')<RedisClient, RedisClientShape>() {}

export const RedisClientLive = Layer.scoped(
  RedisClient,
  Effect.gen(function* () {
    const redisUrl = process.env.REDIS_URL ?? 'redis://:ctrlpane_dev@localhost:36379';
    const redis = new Redis(redisUrl);

    yield* Effect.addFinalizer(() => Effect.sync(() => redis.disconnect()));

    return { redis };
  }),
);
