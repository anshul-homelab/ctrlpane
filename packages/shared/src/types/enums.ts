export const ItemStatus = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  DONE: 'done',
} as const;

export type ItemStatus = (typeof ItemStatus)[keyof typeof ItemStatus];

export const ItemPriority = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
} as const;

export type ItemPriority = (typeof ItemPriority)[keyof typeof ItemPriority];

export const AuthorType = {
  USER: 'user',
  AGENT: 'agent',
  SYSTEM: 'system',
} as const;

export type AuthorType = (typeof AuthorType)[keyof typeof AuthorType];

export const ActivityAction = {
  CREATED: 'created',
  UPDATED: 'updated',
  DELETED: 'deleted',
  STATUS_CHANGED: 'status_changed',
  ASSIGNED: 'assigned',
  COMMENTED: 'commented',
} as const;

export type ActivityAction = (typeof ActivityAction)[keyof typeof ActivityAction];

/** Valid status transitions: Map<from_status, Set<to_status>> */
export const VALID_STATUS_TRANSITIONS: Record<ItemStatus, readonly ItemStatus[]> = {
  pending: ['in_progress'],
  in_progress: ['done', 'pending'],
  done: ['in_progress'],
} as const;
