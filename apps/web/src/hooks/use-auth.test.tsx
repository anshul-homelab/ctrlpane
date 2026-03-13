import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — BEFORE imports of modules under test
// ---------------------------------------------------------------------------

const { mockAuthApi, mockClear, mockInvalidateQueries } = vi.hoisted(() => ({
  mockAuthApi: {
    me: vi.fn(),
    devLogin: vi.fn(),
    logout: vi.fn(),
  },
  mockClear: vi.fn(),
  mockInvalidateQueries: vi.fn(),
}));

vi.mock('@/lib/api-client.js', () => ({
  authApi: mockAuthApi,
}));

vi.mock('@/lib/query-client.js', () => ({
  queryClient: {
    clear: mockClear,
    invalidateQueries: mockInvalidateQueries,
  },
}));

// Import AFTER mocks
import { authKeys, useAuth, useDevLogin, useLogout } from './use-auth.js';

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
// authKeys
// ---------------------------------------------------------------------------

describe('unit: use-auth — authKeys', () => {
  it('authKeys.all returns ["auth"]', () => {
    expect(authKeys.all).toEqual(['auth']);
  });

  it('authKeys.me() returns ["auth", "me"]', () => {
    expect(authKeys.me()).toEqual(['auth', 'me']);
  });
});

// ---------------------------------------------------------------------------
// useAuth
// ---------------------------------------------------------------------------

describe('unit: use-auth — useAuth', () => {
  it('returns loading then success', async () => {
    mockAuthApi.me.mockResolvedValueOnce({
      data: { authenticated: true as const, tenant_id: 't1', auth_method: 'session' as const },
    });

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

    // Initially loading
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({
      data: { authenticated: true, tenant_id: 't1', auth_method: 'session' },
    });
  });

  it('returns error state on rejection', async () => {
    mockAuthApi.me.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeInstanceOf(Error);
  });
});

// ---------------------------------------------------------------------------
// useDevLogin
// ---------------------------------------------------------------------------

describe('unit: use-auth — useDevLogin', () => {
  it('calls devLogin and invalidates auth queries', async () => {
    mockAuthApi.devLogin.mockResolvedValueOnce({
      data: { tenant_id: 't1', expires_at: '2026-12-31' },
    });

    const { result } = renderHook(() => useDevLogin(), { wrapper: createWrapper() });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockAuthApi.devLogin).toHaveBeenCalled();
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['auth'] });
  });
});

// ---------------------------------------------------------------------------
// useLogout
// ---------------------------------------------------------------------------

describe('unit: use-auth — useLogout', () => {
  it('calls logout, clears cache, and redirects to /login', async () => {
    mockAuthApi.logout.mockResolvedValueOnce({
      data: { success: true as const },
    });

    // Mock window.location.href setter
    const originalLocation = window.location;
    const hrefSetter = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window.location, 'href', {
      set: hrefSetter,
      get: () => originalLocation.href,
      configurable: true,
    });

    const { result } = renderHook(() => useLogout(), { wrapper: createWrapper() });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockAuthApi.logout).toHaveBeenCalled();
    expect(mockClear).toHaveBeenCalled();
    expect(hrefSetter).toHaveBeenCalledWith('/login');

    // Restore window.location
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });
});
