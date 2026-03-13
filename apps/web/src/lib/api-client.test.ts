import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError, api, authApi } from './api-client.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// api object
// ---------------------------------------------------------------------------

describe('unit: api-client — api object', () => {
  function okJson(data: unknown) {
    return Promise.resolve(
      new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }

  it('api.get sends GET to /api/v1/blueprint + path with credentials', async () => {
    mockFetch.mockReturnValueOnce(okJson({ data: [] }));
    await api.get('/items');

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/blueprint/items');
    expect(init.method).toBeUndefined(); // GET is default
    expect(init.credentials).toBe('include');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('api.post sends POST with JSON-serialized body', async () => {
    mockFetch.mockReturnValueOnce(okJson({ data: { id: '1' } }));
    await api.post('/items', { title: 'Test' });

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/blueprint/items');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ title: 'Test' }));
    expect(init.credentials).toBe('include');
  });

  it('api.patch sends PATCH with JSON-serialized body', async () => {
    mockFetch.mockReturnValueOnce(okJson({ data: { id: '1' } }));
    await api.patch('/items/1', { title: 'Updated' });

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/blueprint/items/1');
    expect(init.method).toBe('PATCH');
    expect(init.body).toBe(JSON.stringify({ title: 'Updated' }));
  });

  it('api.delete sends DELETE', async () => {
    mockFetch.mockReturnValueOnce(okJson({ data: null }));
    await api.delete('/items/1');

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/blueprint/items/1');
    expect(init.method).toBe('DELETE');
    expect(init.credentials).toBe('include');
  });
});

// ---------------------------------------------------------------------------
// ApiClientError
// ---------------------------------------------------------------------------

describe('unit: api-client — ApiClientError', () => {
  it('throws ApiClientError on non-ok response', async () => {
    mockFetch.mockReturnValueOnce(
      Promise.resolve(
        new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Item not found' } }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const err = (await api.get('/items/999').catch((e: unknown) => e)) as ApiClientError;
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err.status).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('Item not found');
    expect(err.name).toBe('ApiClientError');
  });
});

// ---------------------------------------------------------------------------
// authApi
// ---------------------------------------------------------------------------

describe('unit: api-client — authApi', () => {
  function okJson(data: unknown) {
    return Promise.resolve(
      new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }

  it('authApi.me calls /api/auth/me with credentials', async () => {
    mockFetch.mockReturnValueOnce(
      okJson({ data: { authenticated: true, tenant_id: 't1', auth_method: 'session' } }),
    );
    await authApi.me();

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/auth/me');
    expect(init.credentials).toBe('include');
  });

  it('authApi.devLogin POSTs to /api/auth/dev-session', async () => {
    mockFetch.mockReturnValueOnce(okJson({ data: { tenant_id: 't1', expires_at: '2026-01-01' } }));
    await authApi.devLogin();

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/auth/dev-session');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
  });

  it('authApi.logout DELETEs /api/auth/session', async () => {
    mockFetch.mockReturnValueOnce(okJson({ data: { success: true } }));
    await authApi.logout();

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/auth/session');
    expect(init.method).toBe('DELETE');
    expect(init.credentials).toBe('include');
  });

  it('handles non-JSON error responses gracefully with UNKNOWN code', async () => {
    mockFetch.mockReturnValueOnce(
      Promise.resolve(new Response('Internal Server Error', { status: 500 })),
    );

    const err = await authApi.me().catch((e) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err.status).toBe(500);
    expect(err.code).toBe('UNKNOWN');
    expect(err.message).toBe('Request failed with status 500');
  });

  it('handles JSON error responses with code and message', async () => {
    mockFetch.mockReturnValueOnce(
      Promise.resolve(
        new Response(
          JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Not logged in' } }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    const err = await authApi.me().catch((e) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err.status).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
    expect(err.message).toBe('Not logged in');
  });
});
