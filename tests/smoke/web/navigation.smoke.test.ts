import { expect, test } from './fixtures.js';

test.describe('smoke: web navigation', () => {
  test('sidebar contains all navigation links', async ({ authedPage: page }) => {
    await page.goto('/');

    const nav = page.locator('nav');
    await expect(nav.getByText('Dashboard')).toBeVisible();
    await expect(nav.getByText('Items')).toBeVisible();
    await expect(nav.getByText('Tags')).toBeVisible();
    await expect(nav.getByText('Settings')).toBeVisible();
  });

  test('clicking Items navigates to /items', async ({ authedPage: page }) => {
    await page.goto('/');

    await page.locator('nav').getByText('Items').click();
    await page.waitForURL('/items');
    await expect(page.locator('h1')).toContainText('Items');
  });

  test('clicking Tags navigates to /tags', async ({ authedPage: page }) => {
    await page.goto('/');

    await page.locator('nav').getByText('Tags').click();
    await page.waitForURL('/tags');
    await expect(page.locator('h1')).toContainText('Tags');
  });

  test('clicking Settings navigates to /settings', async ({ authedPage: page }) => {
    await page.goto('/');

    await page.locator('nav').getByText('Settings').click();
    await page.waitForURL('/settings');
    await expect(page.locator('h1')).toContainText('Settings');
  });

  test('clicking Dashboard returns to /', async ({ authedPage: page }) => {
    // Start on items page
    await page.goto('/items');
    await expect(page.locator('h1')).toContainText('Items');

    await page.locator('nav').getByText('Dashboard').click();
    await page.waitForURL('/');
    await expect(page.locator('h1')).toContainText('Dashboard');
  });

  test('tags page loads with heading and new tag button', async ({ authedPage: page }) => {
    await page.goto('/tags');
    await expect(page.locator('h1')).toContainText('Tags');
    await expect(page.getByRole('button', { name: /new tag/i })).toBeVisible();
  });

  test('settings page loads with session section', async ({ authedPage: page }) => {
    await page.goto('/settings');
    await expect(page.locator('h1')).toContainText('Settings');
    await expect(page.getByText('Session')).toBeVisible();
    await expect(page.getByText('API Keys')).toBeVisible();
  });
});
