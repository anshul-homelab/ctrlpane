import { beforeAll, describe, expect, it } from 'vitest';
import {
  type ApiResponse,
  type BlueprintItem,
  type DashboardStats,
  type PaginatedResponse,
  createAuthenticatedFetch,
} from './setup.js';

describe('smoke: item CRUD', () => {
  let authFetch: (path: string, init?: RequestInit) => Promise<Response>;
  let createdItemId: string;

  beforeAll(async () => {
    const auth = await createAuthenticatedFetch();
    authFetch = auth.authFetch;
  });

  it('POST /api/blueprint/items creates a new item', async () => {
    const res = await authFetch('/blueprint/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Smoke test item',
        description: 'Created by smoke tests',
        priority: 'high',
      }),
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as ApiResponse<BlueprintItem>;
    expect(body.data).toHaveProperty('id');
    expect(body.data.id).toMatch(/^bpi_/);
    expect(body.data.title).toBe('Smoke test item');
    expect(body.data.description).toBe('Created by smoke tests');
    expect(body.data.priority).toBe('high');
    expect(body.data.status).toBe('pending');
    expect(body.data).toHaveProperty('created_at');
    expect(body.data).toHaveProperty('updated_at');

    createdItemId = body.data.id;
  });

  it('GET /api/blueprint/items/:id returns the created item', async () => {
    const res = await authFetch(`/blueprint/items/${createdItemId}`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as ApiResponse<BlueprintItem>;
    expect(body.data.id).toBe(createdItemId);
    expect(body.data.title).toBe('Smoke test item');
  });

  it('GET /api/blueprint/items lists items with pagination', async () => {
    const res = await authFetch('/blueprint/items?limit=10');
    expect(res.status).toBe(200);

    const body = (await res.json()) as PaginatedResponse<BlueprintItem>;
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.pagination).toHaveProperty('has_more');
    expect(body.pagination).toHaveProperty('limit');

    // Our created item should be in the list
    const found = body.data.find((item) => item.id === createdItemId);
    expect(found).toBeDefined();
  });

  it('PATCH /api/blueprint/items/:id updates the item', async () => {
    const res = await authFetch(`/blueprint/items/${createdItemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Updated smoke test item',
        status: 'in_progress',
      }),
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as ApiResponse<BlueprintItem>;
    expect(body.data.title).toBe('Updated smoke test item');
    expect(body.data.status).toBe('in_progress');
  });

  it('GET /api/blueprint/items with status filter returns filtered results', async () => {
    const res = await authFetch('/blueprint/items?status=in_progress');
    expect(res.status).toBe(200);

    const body = (await res.json()) as PaginatedResponse<BlueprintItem>;
    expect(Array.isArray(body.data)).toBe(true);
    for (const item of body.data) {
      expect(item.status).toBe('in_progress');
    }
  });

  it('GET /api/blueprint/dashboard/stats returns dashboard statistics', async () => {
    const res = await authFetch('/blueprint/dashboard/stats');
    expect(res.status).toBe(200);

    const body = (await res.json()) as ApiResponse<DashboardStats>;
    expect(body.data).toHaveProperty('total_items');
    expect(typeof body.data.total_items).toBe('number');
    expect(body.data).toHaveProperty('counts');
    expect(Array.isArray(body.data.counts)).toBe(true);
    expect(body.data).toHaveProperty('recent_activity');
  });

  it('DELETE /api/blueprint/items/:id soft-deletes the item', async () => {
    const res = await authFetch(`/blueprint/items/${createdItemId}`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as ApiResponse<BlueprintItem>;
    expect(body.data.id).toBe(createdItemId);
  });
});
