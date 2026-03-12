import { api } from '@/lib/api-client.js';
import type { ApiResponse, PaginatedResponse } from '@ctrlpane/shared';
/**
 * TanStack Query hooks for the Blueprint domain.
 *
 * Every API call flows through the typed api-client. Hooks provide:
 *  - Caching / deduplication via query keys
 *  - Optimistic updates for mutations
 *  - WebSocket-triggered invalidation (handled in ws-client.ts)
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Domain row types — mirror the API response shapes.
// These live here rather than in @ctrlpane/shared because they represent the
// *response* (server-controlled), not the request (client-controlled).
// ---------------------------------------------------------------------------

export interface BlueprintItemRow {
  id: string;
  tenant_id: string;
  title: string;
  description: string | null;
  status: 'pending' | 'in_progress' | 'done';
  priority: 'critical' | 'high' | 'medium' | 'low';
  parent_id: string | null;
  assigned_to: string | null;
  due_date: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface BlueprintTagRow {
  id: string;
  tenant_id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface BlueprintCommentRow {
  id: string;
  item_id: string;
  content: string;
  author_type: 'user' | 'agent' | 'system';
  created_at: string;
}

export interface BlueprintActivityRow {
  id: string;
  item_id: string;
  action: string;
  actor: string | null;
  changes: Record<string, unknown>;
  created_at: string;
}

export interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  permissions: string[];
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface DashboardStats {
  counts: { status: string; count: number }[];
  recent_activity: BlueprintActivityRow[];
  total_items: number;
}

// ---------------------------------------------------------------------------
// Query-key factory — keeps keys consistent across hooks & invalidations.
// ---------------------------------------------------------------------------

export const blueprintKeys = {
  all: ['blueprint'] as const,
  items: (filters: Record<string, string>) => ['blueprint', 'items', filters] as const,
  item: (id: string) => ['blueprint', 'item', id] as const,
  itemComments: (id: string) => ['blueprint', 'item', id, 'comments'] as const,
  itemActivity: (id: string) => ['blueprint', 'item', id, 'activity'] as const,
  itemTags: (id: string) => ['blueprint', 'item', id, 'tags'] as const,
  tags: () => ['blueprint', 'tags'] as const,
  dashboard: () => ['blueprint', 'dashboard'] as const,
  apiKeys: () => ['blueprint', 'api-keys'] as const,
};

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export const useDashboardStats = () =>
  useQuery({
    queryKey: blueprintKeys.dashboard(),
    queryFn: () => api.get<ApiResponse<DashboardStats>>('/dashboard/stats'),
  });

// ---------------------------------------------------------------------------
// Items — list & CRUD
// ---------------------------------------------------------------------------

export const useItems = (filters: Record<string, string>) =>
  useQuery({
    queryKey: blueprintKeys.items(filters),
    queryFn: () =>
      api.get<PaginatedResponse<BlueprintItemRow>>(
        `/items?${new URLSearchParams(filters).toString()}`,
      ),
  });

export const useItem = (id: string) =>
  useQuery({
    queryKey: blueprintKeys.item(id),
    queryFn: () => api.get<ApiResponse<BlueprintItemRow>>(`/items/${id}`),
    enabled: !!id,
  });

export const useCreateItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      title: string;
      description?: string;
      status?: string;
      priority?: string;
      parent_id?: string;
      tag_ids?: string[];
    }) => api.post<ApiResponse<BlueprintItemRow>>('/items', body),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['blueprint', 'items'] });
      qc.invalidateQueries({ queryKey: blueprintKeys.dashboard() });
    },
  });
};

export const useUpdateItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; [key: string]: unknown }) =>
      api.patch<ApiResponse<BlueprintItemRow>>(`/items/${id}`, body),
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: ['blueprint', 'items'] });
      qc.invalidateQueries({ queryKey: blueprintKeys.item(vars.id) });
      qc.invalidateQueries({ queryKey: blueprintKeys.dashboard() });
    },
  });
};

export const useUpdateItemStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch<ApiResponse<BlueprintItemRow>>(`/items/${id}`, { status }),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ['blueprint', 'items'] });
      qc.setQueriesData<PaginatedResponse<BlueprintItemRow>>(
        { queryKey: ['blueprint', 'items'] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            data: old.data.map((item) =>
              item.id === id ? { ...item, status: status as BlueprintItemRow['status'] } : item,
            ),
          };
        },
      );
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: ['blueprint', 'items'] });
      qc.invalidateQueries({ queryKey: blueprintKeys.item(vars.id) });
      qc.invalidateQueries({ queryKey: blueprintKeys.dashboard() });
    },
  });
};

export const useDeleteItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/items/${id}`),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['blueprint', 'items'] });
      qc.invalidateQueries({ queryKey: blueprintKeys.dashboard() });
    },
  });
};

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export const useItemComments = (itemId: string) =>
  useQuery({
    queryKey: blueprintKeys.itemComments(itemId),
    queryFn: () => api.get<ApiResponse<BlueprintCommentRow[]>>(`/items/${itemId}/comments`),
    enabled: !!itemId,
  });

export const useCreateComment = (itemId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { content: string; author_type?: string }) =>
      api.post<ApiResponse<BlueprintCommentRow>>(`/items/${itemId}/comments`, body),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: blueprintKeys.itemComments(itemId) });
      qc.invalidateQueries({ queryKey: blueprintKeys.itemActivity(itemId) });
    },
  });
};

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

export const useItemActivity = (itemId: string) =>
  useQuery({
    queryKey: blueprintKeys.itemActivity(itemId),
    queryFn: () => api.get<ApiResponse<BlueprintActivityRow[]>>(`/items/${itemId}/activity`),
    enabled: !!itemId,
  });

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export const useTags = () =>
  useQuery({
    queryKey: blueprintKeys.tags(),
    queryFn: () => api.get<ApiResponse<BlueprintTagRow[]>>('/tags'),
  });

export const useCreateTag = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; color: string }) =>
      api.post<ApiResponse<BlueprintTagRow>>('/tags', body),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: blueprintKeys.tags() });
    },
  });
};

export const useDeleteTag = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/tags/${id}`),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: blueprintKeys.tags() });
    },
  });
};

// ---------------------------------------------------------------------------
// Item ↔ Tag association
// ---------------------------------------------------------------------------

export const useItemTags = (itemId: string) =>
  useQuery({
    queryKey: blueprintKeys.itemTags(itemId),
    queryFn: () => api.get<ApiResponse<BlueprintTagRow[]>>(`/items/${itemId}/tags`),
    enabled: !!itemId,
  });

export const useAddTagToItem = (itemId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tagId: string) => api.post<void>(`/items/${itemId}/tags`, { tag_id: tagId }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: blueprintKeys.itemTags(itemId) });
    },
  });
};

export const useRemoveTagFromItem = (itemId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tagId: string) => api.delete<void>(`/items/${itemId}/tags/${tagId}`),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: blueprintKeys.itemTags(itemId) });
    },
  });
};

// ---------------------------------------------------------------------------
// API Keys (Settings)
// ---------------------------------------------------------------------------

export const useApiKeys = () =>
  useQuery({
    queryKey: blueprintKeys.apiKeys(),
    queryFn: () => api.get<ApiResponse<ApiKeyRow[]>>('/api-keys'),
  });

export const useCreateApiKey = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; permissions: string[]; expires_at?: string }) =>
      api.post<ApiResponse<ApiKeyRow & { key: string }>>('/api-keys', body),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: blueprintKeys.apiKeys() });
    },
  });
};

export const useRevokeApiKey = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/api-keys/${id}`),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: blueprintKeys.apiKeys() });
    },
  });
};
