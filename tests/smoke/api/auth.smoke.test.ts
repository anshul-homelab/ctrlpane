import { describe, expect, it } from 'vitest';
import { API_BASE, type ApiResponse, type AuthMe, type DevSession } from './setup.js';

describe('smoke: auth endpoints', () => {
  let sessionCookie: string;

  it('POST /api/auth/dev-session creates a session and returns Set-Cookie', async () => {
    const res = await fetch(`${API_BASE}/auth/dev-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(200);

    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain('ctrlpane_sid=');

    sessionCookie = setCookie?.split(';')[0] ?? '';

    const body = (await res.json()) as ApiResponse<DevSession>;
    expect(body.data).toHaveProperty('tenant_id');
    expect(body.data.tenant_id).toMatch(/^tnt_/);
    expect(body.data).toHaveProperty('expires_at');
    expect(new Date(body.data.expires_at).getTime()).toBeGreaterThan(Date.now());
  });

  it('GET /api/auth/me returns authenticated user with session cookie', async () => {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Cookie: sessionCookie },
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as ApiResponse<AuthMe>;
    expect(body.data.authenticated).toBe(true);
    expect(body.data.tenant_id).toMatch(/^tnt_/);
    expect(body.data.auth_method).toBe('session');
  });

  it('GET /api/auth/me returns 401 without credentials', async () => {
    const res = await fetch(`${API_BASE}/auth/me`);
    expect(res.status).toBe(401);
  });

  it('DELETE /api/auth/session logs out and clears cookie', async () => {
    // Create a disposable session for this test
    const loginRes = await fetch(`${API_BASE}/auth/dev-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const disposableCookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? '';

    const res = await fetch(`${API_BASE}/auth/session`, {
      method: 'DELETE',
      headers: { Cookie: disposableCookie },
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as ApiResponse<{ success: boolean }>;
    expect(body.data.success).toBe(true);

    // Verify the session is actually invalidated
    const meRes = await fetch(`${API_BASE}/auth/me`, {
      headers: { Cookie: disposableCookie },
    });
    expect(meRes.status).toBe(401);
  });
});
