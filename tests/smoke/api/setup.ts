/**
 * Shared helpers for API smoke tests.
 *
 * - `API_BASE` — base URL for API requests (e.g. http://127.0.0.1:33001/api)
 * - `WEB_BASE` — base URL for web server (e.g. http://127.0.0.1:33000)
 * - `ensureServersRunning()` — pre-flight check that both servers respond
 * - `createAuthenticatedFetch()` — creates a dev session and returns a fetch
 *    wrapper that includes the session cookie on every request
 */

const API_PORT = process.env.API_PORT ?? '33001';
const WEB_PORT = process.env.WEB_PORT ?? '33000';

export const API_BASE = `http://127.0.0.1:${API_PORT}/api`;
export const HEALTH_BASE = `http://127.0.0.1:${API_PORT}`;
export const WEB_BASE = `http://127.0.0.1:${WEB_PORT}`;

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export interface ApiResponse<T = unknown> {
  data: T;
}

export interface PaginatedResponse<T = unknown> {
  data: T[];
  pagination: {
    next_cursor: string | null;
    prev_cursor: string | null;
    has_more: boolean;
    limit: number;
  };
}

export interface BlueprintItem {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  parent_id: string | null;
  assigned_to: string | null;
  due_date: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface BlueprintTag {
  id: string;
  name: string;
  color: string;
  tenant_id: string;
  created_at: string;
}

export interface BlueprintComment {
  id: string;
  item_id: string;
  content: string;
  author_type: string;
  created_at: string;
}

export interface DashboardStats {
  total_items: number;
  counts: Array<{ status: string; count: number }>;
  recent_activity: Array<{
    id: string;
    action: string;
    actor: string | null;
    created_at: string;
  }>;
}

export interface AuthMe {
  authenticated: boolean;
  tenant_id: string;
  auth_method: string;
}

export interface DevSession {
  tenant_id: string;
  expires_at: string;
}

// ---------------------------------------------------------------------------
// Pre-flight check
// ---------------------------------------------------------------------------

export async function ensureServersRunning(): Promise<void> {
  try {
    const healthRes = await fetch(`${HEALTH_BASE}/health/live`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!healthRes.ok) {
      throw new Error(`API health check returned ${healthRes.status}`);
    }
  } catch (err) {
    throw new Error(`API server is not running at ${HEALTH_BASE}. Start with: bun run dev\n${err}`);
  }

  try {
    const webRes = await fetch(`${WEB_BASE}/`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!webRes.ok) {
      throw new Error(`Web server health check returned ${webRes.status}`);
    }
  } catch (err) {
    throw new Error(`Web server is not running at ${WEB_BASE}. Start with: bun run dev\n${err}`);
  }
}

// ---------------------------------------------------------------------------
// Authenticated fetch helper
// ---------------------------------------------------------------------------

/**
 * Creates a dev session via POST /api/auth/dev-session and returns a fetch
 * wrapper that automatically includes the session cookie.
 */
export async function createAuthenticatedFetch(): Promise<{
  /** fetch wrapper with session cookie */
  authFetch: (path: string, init?: RequestInit) => Promise<Response>;
  /** The session cookie value */
  cookie: string;
  /** Tenant ID from the dev session */
  tenantId: string;
}> {
  const res = await fetch(`${API_BASE}/auth/dev-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create dev session: ${res.status} ${text}`);
  }

  // Extract Set-Cookie header
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) {
    throw new Error('Dev session response did not include Set-Cookie header');
  }

  // Parse cookie name=value from Set-Cookie header
  const cookiePair = setCookie.split(';')[0];
  if (!cookiePair) {
    throw new Error('Could not parse cookie from Set-Cookie header');
  }

  const body = (await res.json()) as ApiResponse<DevSession>;

  const authFetch = (path: string, init?: RequestInit): Promise<Response> => {
    const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
    return fetch(url, {
      ...init,
      headers: {
        ...init?.headers,
        Cookie: cookiePair,
      },
    });
  };

  return {
    authFetch,
    cookie: cookiePair,
    tenantId: body.data.tenant_id,
  };
}
