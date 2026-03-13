import { describe, expect, it } from 'bun:test';
import { decodeCursor, encodeCursor } from './cursor.js';

describe('cursor encoding [unit]', () => {
  it('round-trips a cursor payload', () => {
    const payload = { sort_value: '2026-03-01T00:00:00Z', id: 'bpi_01HQ7Z3K4W' };
    const encoded = encodeCursor(payload);
    const decoded = decodeCursor(encoded);
    expect(decoded).toEqual(payload);
  });

  it('returns null for invalid base64', () => {
    expect(decodeCursor('not-valid-base64!!!')).toBeNull();
  });

  it('returns null for valid base64 but invalid JSON', () => {
    expect(decodeCursor(btoa('not json'))).toBeNull();
  });

  it('returns null for JSON missing required fields', () => {
    expect(decodeCursor(btoa(JSON.stringify({ foo: 'bar' })))).toBeNull();
  });

  it('returns null for JSON with wrong field types', () => {
    expect(decodeCursor(btoa(JSON.stringify({ sort_value: 123, id: 'test' })))).toBeNull();
  });
});
