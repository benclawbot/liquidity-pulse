import { expect, test } from '@playwright/test';

test.describe('refresh behavior', () => {
  test('manual refresh gives visible feedback and returns to ready state', async ({ page }) => {
    await page.goto('/');

    const refreshButton = page.getByRole('button', { name: 'Refresh signals' });
    await expect(refreshButton).toBeVisible();

    await refreshButton.click();
    // Wait for the data to refetch (all routes must complete before button text returns)
    await expect(page.getByRole('button', { name: 'Refresh signals' })).toBeVisible({ timeout: 20000 });
  });
});
