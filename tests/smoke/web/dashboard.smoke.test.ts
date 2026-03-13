import { expect, test } from './fixtures.js';

test.describe('smoke: web dashboard', () => {
  test('dashboard loads after authentication', async ({ authedPage: page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Dashboard');
  });

  test('dashboard shows summary cards', async ({ authedPage: page }) => {
    await page.goto('/');

    // Dashboard should have summary stat cards
    await expect(page.getByText('Total Items')).toBeVisible();
    await expect(page.getByText('Pending')).toBeVisible();
    await expect(page.getByText('In Progress')).toBeVisible();
    await expect(page.getByText('Done')).toBeVisible();
  });

  test('dashboard shows recently updated items section', async ({ authedPage: page }) => {
    await page.goto('/');
    await expect(page.getByText('Recently Updated Items')).toBeVisible();
  });

  test('dashboard shows recent activity section', async ({ authedPage: page }) => {
    await page.goto('/');
    await expect(page.getByText('Recent Activity')).toBeVisible();
  });
});
