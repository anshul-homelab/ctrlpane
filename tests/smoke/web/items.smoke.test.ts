import { expect, test } from './fixtures.js';

test.describe('smoke: web items', () => {
  test('items page loads and shows heading', async ({ authedPage: page }) => {
    await page.goto('/items');
    await expect(page.locator('h1')).toContainText('Items');
  });

  test('items page has a New Item button', async ({ authedPage: page }) => {
    await page.goto('/items');
    const newButton = page.getByRole('button', { name: /new item/i });
    await expect(newButton).toBeVisible();
  });

  test('clicking New Item reveals the create form', async ({ authedPage: page }) => {
    await page.goto('/items');

    const newButton = page.getByRole('button', { name: /new item/i });
    await newButton.click();

    // Form fields should appear
    await expect(page.getByPlaceholder('Item title')).toBeVisible();
    await expect(page.getByRole('button', { name: /create item/i })).toBeVisible();
  });

  test('creating an item via the form adds it to the list', async ({ authedPage: page }) => {
    await page.goto('/items');

    // Open create form
    await page.getByRole('button', { name: /new item/i }).click();

    // Fill in title
    await page.getByPlaceholder('Item title').fill('E2E smoke test item');

    // Submit
    await page.getByRole('button', { name: /create item/i }).click();

    // The new item should appear in the table
    await expect(page.getByText('E2E smoke test item')).toBeVisible({ timeout: 10_000 });
  });

  test('items page shows filter controls', async ({ authedPage: page }) => {
    await page.goto('/items');

    await expect(page.getByPlaceholder('Search items...')).toBeVisible();
  });
});
