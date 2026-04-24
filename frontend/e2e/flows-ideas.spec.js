import { expect, test } from '@playwright/test';

test.describe('flows and ideas pages', () => {
  test('flows page restores key mockup parity blocks', async ({ page }) => {
    await page.goto('/#/flows');
    // Wait for background prefetch to complete — first load with no cache takes time
    await expect(page.locator('.page-title')).toContainText('Liquidity Flows');
    await expect(page.getByRole('heading', { name: 'Funding Rates' })).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole('heading', { name: 'TVL by Chain' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Cross-Venue Net Flows' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'On-Chain Bridge Flows' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Top Asset Pairs — Liquidity Snapshot' })).toBeVisible();
    await expect(page.locator('.recommendation-table tbody tr')).toHaveCount(5);
    await expect(page.locator('.chain-table tbody tr')).toHaveCount(5);
  });

  test('ideas page renders idea cards and watchlist', async ({ page }) => {
    await page.goto('/#/ideas');
    await expect(page.locator('.page-title')).toContainText('Ideas');
    // Wait for API data to load — idea cards appear after fetch
    await expect(page.locator('.idea-card').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.idea-card')).toHaveCount(4);
    await expect(page.getByRole('heading', { name: 'Watchlist' })).toBeVisible();
  });
});
