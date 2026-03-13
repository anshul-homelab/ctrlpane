import { Context, Effect, Layer } from 'effect';
import { type JetStreamClient, type NatsConnection, connect } from 'nats';

export interface NatsClientShape {
  readonly nc: NatsConnection;
  readonly js: JetStreamClient;
}

export class NatsClient extends Context.Tag('NatsClient')<NatsClient, NatsClientShape>() {}

export const NatsClientLive = Layer.scoped(
  NatsClient,
  Effect.gen(function* () {
    const natsUrl = process.env.NATS_URL ?? 'nats://localhost:34222';
    const nc = yield* Effect.promise(() => connect({ servers: natsUrl }));
    const js = nc.jetstream();

    yield* Effect.addFinalizer(() => Effect.promise(() => nc.drain()));

    return { nc, js };
  }),
);
