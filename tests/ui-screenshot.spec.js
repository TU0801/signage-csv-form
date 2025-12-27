// @ts-check
const { test, expect } = require('@playwright/test');
const { setupAuthMockWithMasterData } = require('./test-helpers');

test.describe('UI Screenshot Tests', () => {
  test('bulk page initial state', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
    });
    await setupAuthMockWithMasterData(page, '/bulk.html', {
      isAuthenticated: true,
      email: 'test@example.com'
    });

    // Wait for page to fully load
    await page.waitForTimeout(500);

    // Take screenshot of initial state
    await page.screenshot({ path: 'screenshots/bulk-initial.png', fullPage: true });
  });

  test('bulk page with rows added', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
    });
    await setupAuthMockWithMasterData(page, '/bulk.html', {
      isAuthenticated: true,
      email: 'test@example.com'
    });

    // Add 3 rows
    await page.click('#addRowBtn');
    await page.click('#addRowBtn');
    await page.click('#addRowBtn');
    await page.waitForTimeout(300);

    // Take screenshot with rows
    await page.screenshot({ path: 'screenshots/bulk-with-rows.png', fullPage: true });
  });

  test('bulk page with select focused', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
    });
    await setupAuthMockWithMasterData(page, '/bulk.html', {
      isAuthenticated: true,
      email: 'test@example.com'
    });

    await page.click('#addRowBtn');
    await page.waitForTimeout(200);

    // Focus on the property select
    const select = page.locator('#tableBody tr:first-child .property-select');
    await select.focus();
    await page.waitForTimeout(200);

    // Take screenshot with dropdown focused
    await page.screenshot({ path: 'screenshots/bulk-select-focused.png', fullPage: true });
  });

  test('bulk page context menu', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
    });
    await setupAuthMockWithMasterData(page, '/bulk.html', {
      isAuthenticated: true,
      email: 'test@example.com'
    });

    await page.click('#addRowBtn');
    await page.waitForTimeout(200);

    // Right-click to show context menu
    await page.locator('#tableBody tr:first-child').click({ button: 'right' });
    await page.waitForTimeout(100);

    // Take screenshot with context menu
    await page.screenshot({ path: 'screenshots/bulk-context-menu.png', fullPage: true });
  });

  test('bulk page bulk edit modal', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
    });
    await setupAuthMockWithMasterData(page, '/bulk.html', {
      isAuthenticated: true,
      email: 'test@example.com'
    });

    await page.click('#addRowBtn');
    await page.waitForTimeout(200);

    // Select row and open bulk edit
    await page.locator('#tableBody tr:first-child input[type="checkbox"]').check();
    await page.click('#bulkEditBtn');
    await page.waitForTimeout(200);

    // Take screenshot with bulk edit modal
    await page.screenshot({ path: 'screenshots/bulk-edit-modal.png', fullPage: true });
  });

  test('bulk page filter buttons', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
    });
    await setupAuthMockWithMasterData(page, '/bulk.html', {
      isAuthenticated: true,
      email: 'test@example.com'
    });

    // Add rows with different states
    await page.click('#addRowBtn');
    await page.click('#addRowBtn');
    await page.waitForTimeout(300);

    // Click error filter
    await page.click('.filter-btn[data-filter="error"]');
    await page.waitForTimeout(100);

    // Take screenshot with filter active
    await page.screenshot({ path: 'screenshots/bulk-filter-error.png', fullPage: true });
  });
});
