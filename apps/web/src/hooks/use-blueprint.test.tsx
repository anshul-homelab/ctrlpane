import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — BEFORE imports of modules under test
// ---------------------------------------------------------------------------

vi.mock('@/lib/api-client.js', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

// Import AFTER mocks
import { api } from '@/lib/api-client.js';
import {
  blueprintKeys,
  useAddTagToItem,
  useApiKeys,
  useCreateApiKey,
  useCreateComment,
  useCreateItem,
  useCreateTag,
  useDashboardStats,
  useDeleteItem,
  useDeleteTag,
  useItem,
  useItemActivity,
  useItemComments,
  useItemTags,
  useItems,
  useRemoveTagFromItem,
  useRevokeApiKey,
  useTags,
  useUpdateItem,
  useUpdateItemStatus,
} from './use-blueprint.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let testQueryClient: QueryClient;

function createWrapper() {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={testQueryClient}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  testQueryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
});

afterEach(() => {
  testQueryClient.clear();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// blueprintKeys
// ---------------------------------------------------------------------------

describe('unit: use-blueprint — blueprintKeys', () => {
  it('all returns ["blueprint"]', () => {
    expect(blueprintKeys.all).toEqual(['blueprint']);
  });

  it('items(filters) returns ["blueprint", "items", filters]', () => {
    const filters = { status: 'done' };
    expect(blueprintKeys.items(filters)).toEqual(['blueprint', 'items', { status: 'done' }]);
  });

  it('item(id) returns ["blueprint", "item", id]', () => {
    expect(blueprintKeys.item('abc')).toEqual(['blueprint', 'item', 'abc']);
  });

  it('itemComments(id) returns correct key', () => {
    expect(blueprintKeys.itemComments('x')).toEqual(['blueprint', 'item', 'x', 'comments']);
  });

  it('itemActivity(id) returns correct key', () => {
    expect(blueprintKeys.itemActivity('x')).toEqual(['blueprint', 'item', 'x', 'activity']);
  });

  it('itemTags(id) returns correct key', () => {
    expect(blueprintKeys.itemTags('x')).toEqual(['blueprint', 'item', 'x', 'tags']);
  });

  it('tags() returns ["blueprint", "tags"]', () => {
    expect(blueprintKeys.tags()).toEqual(['blueprint', 'tags']);
  });

  it('dashboard() returns ["blueprint", "dashboard"]', () => {
    expect(blueprintKeys.dashboard()).toEqual(['blueprint', 'dashboard']);
  });

  it('apiKeys() returns ["blueprint", "api-keys"]', () => {
    expect(blueprintKeys.apiKeys()).toEqual(['blueprint', 'api-keys']);
  });
});

// ---------------------------------------------------------------------------
// Query hooks
// ---------------------------------------------------------------------------

describe('unit: use-blueprint — query hooks', () => {
  it('useDashboardStats fetches /dashboard/stats', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { total_items: 5 } });

    const { result } = renderHook(() => useDashboardStats(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.get).toHaveBeenCalledWith('/dashboard/stats');
  });

  it('useItems fetches /items with query params', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: [], pagination: {} });

    const { result } = renderHook(() => useItems({ status: 'pending' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.get).toHaveBeenCalledWith('/items?status=pending');
  });

  it('useItem fetches /items/:id', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { id: 'i1' } });

    const { result } = renderHook(() => useItem('i1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.get).toHaveBeenCalledWith('/items/i1');
  });

  it('useItem is disabled when id is empty', () => {
    const { result } = renderHook(() => useItem(''), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('useItemComments fetches /items/:id/comments', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: [] });

    const { result } = renderHook(() => useItemComments('i1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.get).toHaveBeenCalledWith('/items/i1/comments');
  });

  it('useItemComments is disabled when id is empty', () => {
    const { result } = renderHook(() => useItemComments(''), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('useItemActivity fetches /items/:id/activity', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: [] });

    const { result } = renderHook(() => useItemActivity('i1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.get).toHaveBeenCalledWith('/items/i1/activity');
  });

  it('useItemActivity is disabled when id is empty', () => {
    const { result } = renderHook(() => useItemActivity(''), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('useTags fetches /tags', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: [] });

    const { result } = renderHook(() => useTags(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.get).toHaveBeenCalledWith('/tags');
  });

  it('useItemTags fetches /items/:id/tags', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: [] });

    const { result } = renderHook(() => useItemTags('i1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.get).toHaveBeenCalledWith('/items/i1/tags');
  });

  it('useItemTags is disabled when id is empty', () => {
    const { result } = renderHook(() => useItemTags(''), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('useApiKeys fetches /api-keys', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: [] });

    const { result } = renderHook(() => useApiKeys(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.get).toHaveBeenCalledWith('/api-keys');
  });
});

// ---------------------------------------------------------------------------
// Mutation hooks
// ---------------------------------------------------------------------------

describe('unit: use-blueprint — mutation hooks', () => {
  it('useCreateItem posts to /items', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { id: 'new-1' } });

    const { result } = renderHook(() => useCreateItem(), { wrapper: createWrapper() });
    result.current.mutate({ title: 'New item' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.post).toHaveBeenCalledWith('/items', { title: 'New item' });
  });

  it('useUpdateItem patches /items/:id', async () => {
    vi.mocked(api.patch).mockResolvedValueOnce({ data: { id: 'i1' } });

    const { result } = renderHook(() => useUpdateItem(), { wrapper: createWrapper() });
    result.current.mutate({ id: 'i1', title: 'Updated' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.patch).toHaveBeenCalledWith('/items/i1', { title: 'Updated' });
  });

  it('useUpdateItemStatus patches /items/:id with status', async () => {
    vi.mocked(api.patch).mockResolvedValueOnce({ data: { id: 'i1', status: 'done' } });

    const { result } = renderHook(() => useUpdateItemStatus(), { wrapper: createWrapper() });
    result.current.mutate({ id: 'i1', status: 'done' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.patch).toHaveBeenCalledWith('/items/i1', { status: 'done' });
  });

  it('useDeleteItem deletes /items/:id', async () => {
    vi.mocked(api.delete).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useDeleteItem(), { wrapper: createWrapper() });
    result.current.mutate('i1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.delete).toHaveBeenCalledWith('/items/i1');
  });

  it('useCreateComment posts to /items/:id/comments', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { id: 'c1' } });

    const { result } = renderHook(() => useCreateComment('i1'), { wrapper: createWrapper() });
    result.current.mutate({ content: 'A comment' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.post).toHaveBeenCalledWith('/items/i1/comments', { content: 'A comment' });
  });

  it('useCreateTag posts to /tags', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { id: 't1' } });

    const { result } = renderHook(() => useCreateTag(), { wrapper: createWrapper() });
    result.current.mutate({ name: 'Bug', color: '#ff0000' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.post).toHaveBeenCalledWith('/tags', { name: 'Bug', color: '#ff0000' });
  });

  it('useDeleteTag deletes /tags/:id', async () => {
    vi.mocked(api.delete).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useDeleteTag(), { wrapper: createWrapper() });
    result.current.mutate('t1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.delete).toHaveBeenCalledWith('/tags/t1');
  });

  it('useAddTagToItem posts to /items/:id/tags', async () => {
    vi.mocked(api.post).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useAddTagToItem('i1'), { wrapper: createWrapper() });
    result.current.mutate('tag-1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.post).toHaveBeenCalledWith('/items/i1/tags', { tag_id: 'tag-1' });
  });

  it('useRemoveTagFromItem deletes /items/:id/tags/:tagId', async () => {
    vi.mocked(api.delete).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useRemoveTagFromItem('i1'), {
      wrapper: createWrapper(),
    });
    result.current.mutate('tag-1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.delete).toHaveBeenCalledWith('/items/i1/tags/tag-1');
  });

  it('useCreateApiKey posts to /api-keys', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { id: 'k1', key: 'sk_...' } });

    const { result } = renderHook(() => useCreateApiKey(), { wrapper: createWrapper() });
    result.current.mutate({ name: 'CI Key', permissions: ['read'] });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.post).toHaveBeenCalledWith('/api-keys', {
      name: 'CI Key',
      permissions: ['read'],
    });
  });

  it('useRevokeApiKey deletes /api-keys/:id', async () => {
    vi.mocked(api.delete).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useRevokeApiKey(), { wrapper: createWrapper() });
    result.current.mutate('k1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.delete).toHaveBeenCalledWith('/api-keys/k1');
  });
});
