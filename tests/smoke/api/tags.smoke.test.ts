import { beforeAll, describe, expect, it } from 'vitest';
import { type ApiResponse, type BlueprintTag, createAuthenticatedFetch } from './setup.js';

describe('smoke: tag CRUD', () => {
  let authFetch: (path: string, init?: RequestInit) => Promise<Response>;
  let createdTagId: string;

  beforeAll(async () => {
    const auth = await createAuthenticatedFetch();
    authFetch = auth.authFetch;
  });

  it('POST /api/blueprint/tags creates a new tag', async () => {
    const res = await authFetch('/blueprint/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'smoke-test-tag',
        color: '#ef4444',
      }),
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as ApiResponse<BlueprintTag>;
    expect(body.data).toHaveProperty('id');
    expect(body.data.id).toMatch(/^bpt_/);
    expect(body.data.name).toBe('smoke-test-tag');
    expect(body.data.color).toBe('#ef4444');

    createdTagId = body.data.id;
  });

  it('GET /api/blueprint/tags lists all tags', async () => {
    const res = await authFetch('/blueprint/tags');
    expect(res.status).toBe(200);

    const body = (await res.json()) as ApiResponse<BlueprintTag[]>;
    expect(Array.isArray(body.data)).toBe(true);

    const found = body.data.find((tag) => tag.id === createdTagId);
    expect(found).toBeDefined();
    expect(found?.name).toBe('smoke-test-tag');
  });

  it('POST /api/blueprint/items/:id/tags assigns a tag to an item', async () => {
    // Create an item first
    const itemRes = await authFetch('/blueprint/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Tag assignment test item' }),
    });
    const itemBody = (await itemRes.json()) as ApiResponse<{ id: string }>;
    const itemId = itemBody.data.id;

    // Assign the tag
    const res = await authFetch(`/blueprint/items/${itemId}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag_id: createdTagId }),
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as ApiResponse<{ success: boolean }>;
    expect(body.data.success).toBe(true);

    // Clean up: remove tag from item and delete item
    await authFetch(`/blueprint/items/${itemId}/tags/${createdTagId}`, {
      method: 'DELETE',
    });
    await authFetch(`/blueprint/items/${itemId}`, { method: 'DELETE' });
  });

  it('DELETE /api/blueprint/tags/:id deletes the tag', async () => {
    const res = await authFetch(`/blueprint/tags/${createdTagId}`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(200);
  });
});
