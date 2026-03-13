import { Effect } from 'effect';
import { StringCodec, consumerOpts } from 'nats';
import { CentrifugoClient } from './centrifugo.js';
import { NatsClient } from './nats.js';

const sc = StringCodec();

export const startCentrifugoPublisher = Effect.gen(function* () {
  const { js } = yield* NatsClient;
  const centrifugo = yield* CentrifugoClient;

  // Build consumer options with durable name
  const opts = consumerOpts();
  opts.durable('centrifugo-publisher');
  opts.deliverAll();

  // Subscribe to all blueprint events
  const sub = yield* Effect.promise(() => js.subscribe('blueprint.>', opts));

  const processMessages = async () => {
    for await (const msg of sub) {
      try {
        const event = JSON.parse(sc.decode(msg.data));
        const tenantId = event.tenantid;
        const eventType = event.type;

        // Publish to tenant-level channel
        await Effect.runPromise(
          centrifugo.publish(`blueprint:items#${tenantId}`, {
            type: eventType,
            data: event.data,
            item_id: event.data?.id,
          }),
        );

        // Publish to item-level channel if applicable
        if (event.data?.id) {
          await Effect.runPromise(
            centrifugo.publish(`blueprint:item#${event.data.id}`, {
              type: eventType,
              data: event.data,
            }),
          );
        }

        msg.ack();
      } catch {
        // Redeliver on failure
        msg.nak();
      }
    }
  };

  // Start processing in background
  processMessages();

  yield* Effect.addFinalizer(() => Effect.promise(() => sub.drain()));
});
