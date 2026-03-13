import { authApi } from '@/lib/api-client.js';
import { queryClient } from '@/lib/query-client.js';
/**
 * TanStack Query hooks for session-based authentication.
 *
 * Uses httpOnly cookie auth — the browser sends the session cookie
 * automatically via `credentials: 'include'` on every request.
 */
import { useMutation, useQuery } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const authKeys = {
  all: ['auth'] as const,
  me: () => ['auth', 'me'] as const,
};

// ---------------------------------------------------------------------------
// Check current authentication status
// ---------------------------------------------------------------------------

export const useAuth = () =>
  useQuery({
    queryKey: authKeys.me(),
    queryFn: () => authApi.me(),
    retry: false, // Don't retry 401s
    staleTime: 5 * 60 * 1000, // 5 min
  });

// ---------------------------------------------------------------------------
// Dev login (development mode only)
// ---------------------------------------------------------------------------

export const useDevLogin = () =>
  useMutation({
    mutationFn: () => authApi.devLogin(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: authKeys.all });
    },
  });

// ---------------------------------------------------------------------------
// Logout — clears session cookie and all cached data
// ---------------------------------------------------------------------------

export const useLogout = () =>
  useMutation({
    mutationFn: () => authApi.logout(),
    onSuccess: () => {
      queryClient.clear(); // Clear all cached data
      window.location.href = '/login';
    },
  });
