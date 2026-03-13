import { describe, expect, it } from 'bun:test';
import { createId } from './id.js';

describe('createId [unit]', () => {
  it('generates ID with correct prefix', () => {
    const id = createId('bpi_');
    expect(id.startsWith('bpi_')).toBe(true);
    expect(id.length).toBeGreaterThan(4);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => createId('tnt_')));
    expect(ids.size).toBe(100);
  });

  it('fails with wrong prefix check', () => {
    const id = createId('bpi_');
    expect(id.startsWith('bpt_')).toBe(false);
  });
});
