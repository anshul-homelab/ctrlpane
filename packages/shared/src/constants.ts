/** ID prefix registry for blueprint domain entities */
export const ID_PREFIX = {
  TENANT: 'tnt_',
  API_KEY: 'apk_',
  BLUEPRINT_ITEM: 'bpi_',
  BLUEPRINT_TAG: 'bpt_',
  BLUEPRINT_COMMENT: 'bpc_',
  BLUEPRINT_ACTIVITY: 'bpa_',
  OUTBOX_EVENT: 'obx_',
} as const;

/** PascalCase alias for ID_PREFIX — used by @ctrlpane/db seed and tests */
export const IdPrefix = {
  Tenant: ID_PREFIX.TENANT,
  ApiKey: ID_PREFIX.API_KEY,
  BlueprintItem: ID_PREFIX.BLUEPRINT_ITEM,
  BlueprintTag: ID_PREFIX.BLUEPRINT_TAG,
  BlueprintComment: ID_PREFIX.BLUEPRINT_COMMENT,
  BlueprintActivity: ID_PREFIX.BLUEPRINT_ACTIVITY,
  OutboxEvent: ID_PREFIX.OUTBOX_EVENT,
} as const;

/** Max lengths for text fields */
export const MAX_LENGTHS = {
  ITEM_TITLE: 500,
  TAG_NAME: 100,
  API_KEY_NAME: 100,
  TENANT_NAME: 200,
  TENANT_SLUG: 50,
} as const;

/** API versioning */
export const API_VERSION = 'v1';
export const API_BASE_PATH = `/api/${API_VERSION}`;
