export interface CursorPayload {
  readonly sort_value: string;
  readonly id: string;
}

export const encodeCursor = (payload: CursorPayload): string => {
  return btoa(JSON.stringify(payload));
};

export const decodeCursor = (cursor: string): CursorPayload | null => {
  try {
    const decoded = JSON.parse(atob(cursor));
    if (typeof decoded.sort_value === 'string' && typeof decoded.id === 'string') {
      return decoded as CursorPayload;
    }
    return null;
  } catch {
    return null;
  }
};
