import { Layer } from 'effect';
import { BlueprintEventPublisher, makeBlueprintEventPublisher } from './event-publisher.js';
import { BlueprintItemRepositoryLive } from './repository-live.js';
import { BlueprintItemServiceLive } from './service-live.js';

/**
 * Foundation layer: repository + event publisher.
 * Requires: DbClient
 */
const FoundationLive = Layer.mergeAll(
  BlueprintItemRepositoryLive,
  Layer.effect(BlueprintEventPublisher, makeBlueprintEventPublisher),
);

/**
 * Complete blueprint domain layer.
 * Requires: DbClient, RedisClient, TenantContext (provided per-request)
 */
export const BlueprintLive = BlueprintItemServiceLive.pipe(Layer.provide(FoundationLive));
