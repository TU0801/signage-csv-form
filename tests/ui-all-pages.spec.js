// @ts-check
const { test, expect } = require('@playwright/test');
const { setupAuthMockWithMasterData } = require('./test-helpers');

test.describe('All Pages Header Screenshot', () => {
  test('index page header', async ({ page }) => {
    await setupAuthMockWithMasterData(page, '/index.html', {
      isAuthenticated: true,
      email: 'test@example.com',
      isAdmin: true
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'screenshots/index-page.png', fullPage: true });
  });

  test('admin page header', async ({ page }) => {
    await setupAuthMockWithMasterData(page, '/admin.html', {
      isAuthenticated: true,
      email: 'admin@example.com',
      isAdmin: true
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'screenshots/admin-page.png', fullPage: true });
  });

  test('bulk page header', async ({ page }) => {
    await setupAuthMockWithMasterData(page, '/bulk.html', {
      isAuthenticated: true,
      email: 'test@example.com'
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'screenshots/bulk-page.png', fullPage: true });
  });
});
