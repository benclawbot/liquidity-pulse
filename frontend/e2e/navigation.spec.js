import { expect, test } from '@playwright/test';

test.describe('navigation', () => {
  test('moves between major pages through sidebar navigation', async ({ page }) => {
    await page.goto('/');

    await page.locator('.side-link', { hasText: 'Liquidity Flows' }).click();
    await expect(page).toHaveURL(/#\/flows/);
    await expect(page.locator('.page-title')).toContainText('Liquidity Flows');

    await page.locator('.side-link', { hasText: 'Market Impacts' }).click();
    await expect(page).toHaveURL(/#\/impacts/);
    await expect(page.locator('.page-title')).toContainText('Market Impacts');

    await page.locator('.side-link', { hasText: 'Hidden Trends' }).click();
    await expect(page.locator('.page-title')).toContainText('Hidden Trends');

    await page.locator('.side-link', { hasText: 'Ideas' }).click();
    await expect(page.locator('.page-title')).toContainText('Ideas');

    await page.locator('.side-link', { hasText: 'Discovery' }).click();
    await expect(page.locator('.page-title')).toContainText('Market Discovery');
  });
});
