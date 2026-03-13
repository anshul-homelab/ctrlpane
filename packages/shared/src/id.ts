import { ulid } from 'ulid';

export const createId = (prefix: string): string => `${prefix}${ulid()}`;
