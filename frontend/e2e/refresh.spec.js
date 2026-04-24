import { expect, test } from '@playwright/test';

test.describe('refresh behavior', () => {
  test('manual refresh gives visible feedback and returns to ready state', async ({ page }) => {
    await page.goto('/');

    const refreshButton = page.getByRole('button', { name: 'Refresh signals' });
    await expect(refreshButton).toBeVisible();

    await refreshButton.click();
    await expect(page.getByRole('button', { name: 'Refreshing…' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Refresh signals' })).toBeVisible({ timeout: 15000 });
  });
});
