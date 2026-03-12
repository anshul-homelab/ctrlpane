import { Context, Effect, Layer } from 'effect';

export interface CentrifugoClientShape {
  readonly publish: (channel: string, data: unknown) => Effect.Effect<void, Error>;
}

export class CentrifugoClient extends Context.Tag('CentrifugoClient')<
  CentrifugoClient,
  CentrifugoClientShape
>() {}

export const CentrifugoClientLive = Layer.succeed(CentrifugoClient, {
  publish: (channel: string, data: unknown) =>
    Effect.tryPromise({
      try: () =>
        fetch(`${process.env.CENTRIFUGO_URL ?? 'http://localhost:38000'}/api/publish`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `apikey ${process.env.CENTRIFUGO_API_KEY ?? 'ctrlpane_dev_api_key'}`,
          },
          body: JSON.stringify({ channel, data }),
        }).then((res) => {
          if (!res.ok) throw new Error(`Centrifugo publish failed: ${res.status}`);
        }),
      catch: (error) => new Error(`Centrifugo publish error: ${error}`),
    }),
});
