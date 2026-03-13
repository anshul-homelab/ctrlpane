import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { TenantContext, makeTenantContextLayer } from './tenant-context.js';

describe('unit: makeTenantContextLayer', () => {
  it('provides correct tenantId, apiKeyId, and permissions', async () => {
    const layer = makeTenantContextLayer('tnt_01ABC', 'apk_01KEY', ['read', 'write']);

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* TenantContext;
      }).pipe(Effect.provide(layer)),
    );

    expect(result.tenantId).toBe('tnt_01ABC');
    expect(result.apiKeyId).toBe('apk_01KEY');
    expect(result.permissions).toEqual(['read', 'write']);
  });

  it('handles empty permissions array', async () => {
    const layer = makeTenantContextLayer('tnt_02DEF', 'apk_02KEY', []);

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* TenantContext;
      }).pipe(Effect.provide(layer)),
    );

    expect(result.tenantId).toBe('tnt_02DEF');
    expect(result.apiKeyId).toBe('apk_02KEY');
    expect(result.permissions).toEqual([]);
  });

  it('preserves readonly semantics on permissions', async () => {
    const perms = ['admin', 'read', 'write'] as const;
    const layer = makeTenantContextLayer('tnt_03GHI', 'apk_03KEY', perms);

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* TenantContext;
      }).pipe(Effect.provide(layer)),
    );

    expect(result.permissions).toEqual(['admin', 'read', 'write']);
    expect(result.permissions).toHaveLength(3);
  });
});
