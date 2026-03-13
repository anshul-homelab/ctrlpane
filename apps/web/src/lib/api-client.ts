/** Error shape returned by the API on non-2xx responses. */
export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

const API_BASE = '/api/v1/blueprint';

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error: ApiErrorResponse = await response.json();
    throw new ApiClientError(response.status, error.error.code, error.error.message);
  }

  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

// ---------------------------------------------------------------------------
// Auth API — session-based authentication endpoints
// ---------------------------------------------------------------------------

interface AuthMeResponse {
  data: {
    authenticated: true;
    tenant_id: string;
    auth_method: 'session' | 'api_key';
  };
}

interface DevSessionResponse {
  data: {
    tenant_id: string;
    expires_at: string;
  };
}

interface LogoutResponse {
  data: {
    success: true;
  };
}

async function handleAuthResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let code = 'UNKNOWN';
    let message = `Request failed with status ${response.status}`;
    try {
      const error: ApiErrorResponse = await response.json();
      code = error.error.code;
      message = error.error.message;
    } catch {
      // response body wasn't JSON — use defaults
    }
    throw new ApiClientError(response.status, code, message);
  }
  return response.json() as Promise<T>;
}

export const authApi = {
  devLogin: () =>
    fetch('/api/auth/dev-session', {
      method: 'POST',
      credentials: 'include',
    }).then((r) => handleAuthResponse<DevSessionResponse>(r)),

  me: () =>
    fetch('/api/auth/me', {
      credentials: 'include',
    }).then((r) => handleAuthResponse<AuthMeResponse>(r)),

  logout: () =>
    fetch('/api/auth/session', {
      method: 'DELETE',
      credentials: 'include',
    }).then((r) => handleAuthResponse<LogoutResponse>(r)),
};
