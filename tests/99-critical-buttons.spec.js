// @ts-check
const { test, expect } = require('@playwright/test');
const { setupAuthMockWithMasterData } = require('./test-helpers');

test.describe('Critical Button Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMockWithMasterData(page, '/bulk.html', {
      isAuthenticated: true,
      email: 'test@example.com'
    });
  });

  test('save button is disabled when no valid rows', async ({ page }) => {
    const saveBtn = page.locator('#saveBtn');
    await expect(saveBtn).toBeVisible();
    await expect(saveBtn).toBeDisabled();
  });

  test('CSV download button is disabled when no valid rows', async ({ page }) => {
    const downloadBtn = page.locator('#downloadCsvBtn');
    await expect(downloadBtn).toBeVisible();
    await expect(downloadBtn).toBeDisabled();
  });

  test('CSV copy button is disabled when no valid rows', async ({ page }) => {
    const copyBtn = page.locator('#copyCsvBtn');
    await expect(copyBtn).toBeVisible();
    await expect(copyBtn).toBeDisabled();
  });

  test('add row button works', async ({ page }) => {
    await page.click('#addRowBtn');
    const rows = page.locator('#tableBody tr');
    await expect(rows).toHaveCount(1);
  });

  test('buttons become enabled when valid row exists', async ({ page }) => {
    // Add row
    await page.click('#addRowBtn');
    await page.waitForSelector('#tableBody tr');

    // Fill required fields - use direct class selectors
    const propertySelect = page.locator('#tableBody tr:first-child .property-select');
    await propertySelect.selectOption({ index: 1 });

    // Wait for terminal to auto-populate
    await page.waitForTimeout(300);

    // Select vendor using class selector
    const vendorSelect = page.locator('#tableBody tr:first-child .vendor-select');
    await vendorSelect.selectOption({ index: 1 });

    // Select inspection type using class selector
    const inspectionSelect = page.locator('#tableBody tr:first-child .inspection-select');
    await inspectionSelect.selectOption({ index: 1 });

    // Wait for validation and buttons update
    await page.waitForTimeout(800);

    // Check buttons are enabled
    const downloadBtn = page.locator('#downloadCsvBtn');
    const copyBtn = page.locator('#copyCsvBtn');

    await expect(downloadBtn).toBeEnabled();
    await expect(copyBtn).toBeEnabled();
  });

  test('CSV copy button copies data to clipboard', async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    // Add and fill row
    await page.click('#addRowBtn');
    await page.waitForSelector('#tableBody tr');

    const propertySelect = page.locator('#tableBody tr:first-child .property-select');
    await propertySelect.selectOption({ index: 1 });
    await page.waitForTimeout(300);

    const vendorSelect = page.locator('#tableBody tr:first-child .vendor-select');
    await vendorSelect.selectOption({ index: 1 });

    const inspectionSelect = page.locator('#tableBody tr:first-child .inspection-select');
    await inspectionSelect.selectOption({ index: 1 });

    await page.waitForTimeout(800);

    // Click copy button
    const copyBtn = page.locator('#copyCsvBtn');
    await copyBtn.click();

    // Check toast message
    const toast = page.locator('.toast.show');
    await expect(toast).toBeVisible();
    await expect(toast).toContainText('コピー');
  });

  test('duplicate button works', async ({ page }) => {
    await page.click('#addRowBtn');
    await page.waitForSelector('#tableBody tr');

    // Select the row
    await page.click('#tableBody tr:first-child input[type="checkbox"]');

    // Click duplicate
    await page.click('#duplicateBtn');

    // Should have 2 rows
    const rows = page.locator('#tableBody tr');
    await expect(rows).toHaveCount(2);
  });

  test('delete selected button works', async ({ page }) => {
    // Add 2 rows
    await page.click('#addRowBtn');
    await page.click('#addRowBtn');
    await page.waitForSelector('#tableBody tr:nth-child(2)');

    // Select first row
    await page.click('#tableBody tr:first-child input[type="checkbox"]');

    // Click delete
    page.on('dialog', dialog => dialog.accept());
    await page.click('#deleteSelectedBtn');

    // Should have 1 row
    const rows = page.locator('#tableBody tr');
    await expect(rows).toHaveCount(1);
  });

  test('paste button opens modal', async ({ page }) => {
    await page.click('#pasteBtn');
    const modal = page.locator('#pasteModal.active');
    await expect(modal).toBeVisible();
  });
});
