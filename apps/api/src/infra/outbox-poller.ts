import { DbClient, outboxEvents } from '@ctrlpane/db';
import { asc, eq } from 'drizzle-orm';
import { Effect } from 'effect';
import { StringCodec } from 'nats';
import { NatsClient } from './nats.js';

const sc = StringCodec();
const MAX_ATTEMPTS = 10;
const POLL_INTERVAL_MS = 1_000;
const BATCH_SIZE = 100;

export const startOutboxPoller = Effect.gen(function* () {
  const { db } = yield* DbClient;
  const { js } = yield* NatsClient;

  const poll = async () => {
    const pendingEvents = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.status, 'pending'))
      .orderBy(asc(outboxEvents.createdAt))
      .limit(BATCH_SIZE);

    for (const event of pendingEvents) {
      try {
        // Publish to NATS JetStream
        await js.publish(
          event.eventType,
          sc.encode(
            JSON.stringify({
              specversion: '1.0',
              id: event.id,
              source: 'ctrlpane.blueprint',
              type: `ctrlpane.${event.eventType}.v1`,
              tenantid: event.tenantId,
              traceid: event.traceId,
              data: event.payload,
            }),
          ),
        );

        // Mark as published
        await db
          .update(outboxEvents)
          .set({ status: 'published', publishedAt: new Date() })
          .where(eq(outboxEvents.id, event.id));
      } catch {
        const newAttempts = event.attempts + 1;
        const newStatus = newAttempts >= MAX_ATTEMPTS ? 'dead_letter' : 'pending';

        await db
          .update(outboxEvents)
          .set({ attempts: newAttempts, status: newStatus })
          .where(eq(outboxEvents.id, event.id));
      }
    }
  };

  // Start polling loop
  const interval = setInterval(poll, POLL_INTERVAL_MS);

  yield* Effect.addFinalizer(() => Effect.sync(() => clearInterval(interval)));
});
