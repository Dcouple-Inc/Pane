import { test, expect, Page } from '@playwright/test';

async function dismissStartupDialogs(page: Page) {
  // Dismiss analytics consent dialog if present (shows before welcome)
  const analyticsDecline = page.locator('button:has-text("No thanks")');
  if (await analyticsDecline.isVisible({ timeout: 3000 }).catch(() => false)) {
    await analyticsDecline.click();
    await page.waitForTimeout(500);
  }

  // Dismiss welcome dialog if present (shows after analytics consent)
  const getStartedButton = page.locator('button:has-text("Get Started")');
  if (await getStartedButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    await getStartedButton.click();
    await page.waitForTimeout(500);
  }
}

test.describe('Smoke Tests', () => {
  test('Application should start successfully', async ({ page }) => {
    // Navigate to the app
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait for any content to appear
    await page.waitForSelector('body', { timeout: 10000 });

    // Check that the page has loaded
    const title = await page.title();
    expect(title).toBe('Pane');

    // Take a screenshot for debugging
    await page.screenshot({ path: 'test-results/smoke-test.png' });
  });

  test('Main UI elements should be visible', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 });

    await dismissStartupDialogs(page);

    // Sidebar should be visible
    const sidebar = page.locator('[data-testid="sidebar"]').first();
    await expect(sidebar).toBeVisible({ timeout: 10000 });

    // Settings button should exist (even if not immediately visible)
    const settingsButton = page.locator('[data-testid="settings-button"]');
    await expect(settingsButton).toHaveCount(1);
  });

  test('Settings button is clickable', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 });

    await dismissStartupDialogs(page);

    // Wait for the settings button to be visible
    const settingsButton = page.locator('[data-testid="settings-button"]');
    await expect(settingsButton).toBeVisible({ timeout: 5000 });

    // Verify the button is enabled and clickable
    await expect(settingsButton).toBeEnabled();

    // Try to click it
    await settingsButton.click();

    // Small wait to ensure no errors are thrown
    await page.waitForTimeout(500);
  });
});