import { describe, expect, it } from 'vitest';
import { NatsClient, NatsClientLive } from './nats.js';

describe('unit: NatsClient', () => {
  it('NatsClient tag is defined with correct key', () => {
    expect(NatsClient).toBeDefined();
    expect(NatsClient.key).toBe('NatsClient');
  });

  it('NatsClientLive is a valid Layer', () => {
    expect(NatsClientLive).toBeDefined();
    expect(typeof NatsClientLive.pipe).toBe('function');
  });
});
