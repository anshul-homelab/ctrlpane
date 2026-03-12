import { DbClientLive } from '@ctrlpane/db';
import { Layer } from 'effect';
import { CentrifugoClientLive } from '../infra/centrifugo.js';
import { NatsClientLive } from '../infra/nats.js';
import { RedisClientLive } from '../infra/redis.js';

/**
 * Composes all infrastructure layers into a single live layer.
 * Domain layers depend on this.
 *
 * DbClientLive requires no arguments (reads from env / defaults).
 * RedisClientLive and NatsClientLive are scoped (clean up on shutdown).
 * CentrifugoClientLive is a simple HTTP client (no persistent connection).
 */
export const InfraLive = Layer.mergeAll(
  DbClientLive(),
  RedisClientLive,
  NatsClientLive,
  CentrifugoClientLive,
);
