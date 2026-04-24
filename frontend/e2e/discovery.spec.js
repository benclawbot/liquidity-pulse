import { expect, test } from '@playwright/test';

test.describe('discovery page', () => {
  test('shows flow leaders and recommendations', async ({ page }) => {
    await page.goto('/');
    // Wait for data to load — sector ETF calls can take 6-10s, background prefetch
    // may still be running. Give it time to complete.
    await expect(page.locator('.theme-item').first()).toBeVisible({ timeout: 30000 });
    await expect(page.locator('text=Flow Leaders')).toBeVisible();
    await expect(page.locator('text=Top Recommendations')).toBeVisible();
    // Flow leaders are live-computed from sector ETFs — count varies by market
    const count = await page.locator('.theme-item').count();
    expect(count).toBeGreaterThanOrEqual(3);
    // Recommendations are theme-derived
    await expect(page.locator('.recommendation-table tbody tr').first()).toBeVisible({ timeout: 20000 });
    const recCount = await page.locator('.recommendation-table tbody tr').count();
    expect(recCount).toBeGreaterThanOrEqual(2);
  });
});
