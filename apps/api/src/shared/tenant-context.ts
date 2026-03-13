import { Context, Layer } from 'effect';

export interface TenantContextShape {
  readonly tenantId: string;
  readonly apiKeyId: string;
  readonly permissions: readonly string[];
}

export class TenantContext extends Context.Tag('TenantContext')<
  TenantContext,
  TenantContextShape
>() {}

/**
 * Creates a TenantContext Layer from Hono request context.
 * Called per-request in the route handler after auth middleware runs.
 */
export const makeTenantContextLayer = (
  tenantId: string,
  apiKeyId: string,
  permissions: readonly string[],
): Layer.Layer<TenantContext> => Layer.succeed(TenantContext, { tenantId, apiKeyId, permissions });
