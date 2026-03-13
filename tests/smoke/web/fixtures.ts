import { type Page, test as base, expect } from '@playwright/test';

const API_PORT = process.env.API_PORT ?? '33001';
const API_BASE = `http://127.0.0.1:${API_PORT}/api`;

/**
 * Extended Playwright test fixture that provides an `authedPage` — a Page
 * instance that has already authenticated via the dev-session endpoint.
 *
 * The session cookie is set on the browser context so all subsequent
 * navigations carry it automatically.
 */
export const test = base.extend<{ authedPage: Page }>({
  authedPage: async ({ page }, use) => {
    // Create a dev session via the API
    const res = await page.request.post(`${API_BASE}/auth/dev-session`, {
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.ok()).toBeTruthy();

    await use(page);
  },
});

export { expect };
