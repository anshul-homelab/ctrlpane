import { expect, test } from './fixtures.js';

test.describe('smoke: web auth', () => {
  test('login page loads and shows dev login button', async ({ page }) => {
    await page.goto('/login');

    // Page should show the ctrlpane brand
    await expect(page.locator('h1')).toContainText('ctrlpane');

    // Dev Login button should be visible
    const devLoginButton = page.getByRole('button', { name: /dev login/i });
    await expect(devLoginButton).toBeVisible();
  });

  test('login page shows "Development Mode" label', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText('Development Mode')).toBeVisible();
  });

  test('dev login redirects to dashboard', async ({ page }) => {
    await page.goto('/login');

    const devLoginButton = page.getByRole('button', { name: /dev login/i });
    await devLoginButton.click();

    // Should redirect to dashboard (root path)
    await page.waitForURL('/');
    await expect(page.locator('h1')).toContainText('Dashboard');
  });

  test('unauthenticated visit to / redirects to /login', async ({ page }) => {
    // Clear any existing cookies to ensure no session
    await page.context().clearCookies();

    await page.goto('/');
    // The auth guard redirects to /login
    await page.waitForURL('/login');
    await expect(page.locator('h1')).toContainText('ctrlpane');
  });
});
