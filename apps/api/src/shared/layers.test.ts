import { describe, expect, it } from 'vitest';
import { InfraLive } from './layers.js';

describe('unit: InfraLive layer composition', () => {
  it('is defined as a Layer', () => {
    expect(InfraLive).toBeDefined();
  });

  it('has the pipe method expected of an Effect Layer', () => {
    expect(typeof InfraLive.pipe).toBe('function');
  });
});
