import { expect, test } from '@playwright/test';

test.describe('shell', () => {
  test('loads the dashboard shell with brand and navigation', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/');
    await expect(page).toHaveTitle(/Liquidity Pulse/i);
    await expect(page.locator('.sidebar')).toBeVisible();
    await expect(page.locator('.brand')).toContainText('LIQUIDITY PULSE');
    await expect(page.locator('.side-link')).toHaveCount(6);
    // Wait for first metric card to appear (data-driven, may take a moment)
    await expect(page.locator('.metric-card').first()).toBeVisible({ timeout: 20000 });
    await expect(page.locator('.metric-card')).toHaveCount(6);
    await expect(page.locator('.nav-tabs')).toHaveCount(0);
    await expect(page.locator('.mini-note')).toHaveCount(0);
    await expect(page.locator('.data-source-badge')).toBeVisible();
    await expect(page.locator('.data-source-badge')).toContainText('Data:');
    expect(consoleErrors).toHaveLength(0);
  });
});
