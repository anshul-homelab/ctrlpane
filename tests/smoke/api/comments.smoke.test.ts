import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type ApiResponse,
  type BlueprintComment,
  type BlueprintItem,
  createAuthenticatedFetch,
} from './setup.js';

describe('smoke: comments', () => {
  let authFetch: (path: string, init?: RequestInit) => Promise<Response>;
  let itemId: string;
  let commentId: string;

  beforeAll(async () => {
    const auth = await createAuthenticatedFetch();
    authFetch = auth.authFetch;

    // Create a test item to add comments to
    const res = await authFetch('/blueprint/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Comment test item' }),
    });
    const body = (await res.json()) as ApiResponse<BlueprintItem>;
    itemId = body.data.id;
  });

  afterAll(async () => {
    // Clean up the test item
    if (itemId) {
      await authFetch(`/blueprint/items/${itemId}`, { method: 'DELETE' });
    }
  });

  it('POST /api/blueprint/items/:id/comments creates a comment', async () => {
    const res = await authFetch(`/blueprint/items/${itemId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: 'This is a smoke test comment',
        author_type: 'user',
      }),
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as ApiResponse<BlueprintComment>;
    expect(body.data).toHaveProperty('id');
    expect(body.data.content).toBe('This is a smoke test comment');
    expect(body.data.author_type).toBe('user');
    expect(body.data).toHaveProperty('created_at');

    commentId = body.data.id;
  });

  it('POST /api/blueprint/items/:id/comments creates an agent comment', async () => {
    const res = await authFetch(`/blueprint/items/${itemId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: 'Agent-authored smoke test comment',
        author_type: 'agent',
      }),
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as ApiResponse<BlueprintComment>;
    expect(body.data.author_type).toBe('agent');
  });

  it('GET /api/blueprint/items/:id/comments lists comments for the item', async () => {
    const res = await authFetch(`/blueprint/items/${itemId}/comments`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as ApiResponse<BlueprintComment[]>;
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(2);

    const found = body.data.find((c) => c.id === commentId);
    expect(found).toBeDefined();
    expect(found?.content).toBe('This is a smoke test comment');
  });

  it('DELETE /api/blueprint/comments/:id deletes the comment', async () => {
    const res = await authFetch(`/blueprint/comments/${commentId}`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(200);
  });
});
