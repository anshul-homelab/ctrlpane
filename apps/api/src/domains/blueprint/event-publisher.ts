import { DbClient, outboxEvents } from '@ctrlpane/db';
import { createId } from '@ctrlpane/shared';
import { Context, Effect } from 'effect';

export interface EventPayload {
  readonly eventType: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly tenantId: string;
  readonly payload: unknown;
}

export interface BlueprintEventPublisherShape {
  readonly publish: (event: EventPayload) => Effect.Effect<void, Error>;
}

export class BlueprintEventPublisher extends Context.Tag('BlueprintEventPublisher')<
  BlueprintEventPublisher,
  BlueprintEventPublisherShape
>() {}

/** Writes event to the outbox table within the current transaction */
export const makeBlueprintEventPublisher = Effect.gen(function* () {
  const { db } = yield* DbClient;

  return {
    publish: (event: EventPayload) =>
      Effect.tryPromise({
        try: () =>
          db.insert(outboxEvents).values({
            id: createId('obx_'),
            tenantId: event.tenantId,
            eventType: event.eventType,
            aggregateType: event.aggregateType,
            aggregateId: event.aggregateId,
            payload: event.payload,
          }),
        catch: (error) => error as Error,
      }).pipe(Effect.asVoid),
  };
});
