// @ts-check
const { test, expect } = require('@playwright/test');
const { setupAuthMockWithMasterData } = require('./test-helpers');

test.describe('Debug Bulk Features', () => {
  test('select property and check terminals', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
    });
    await setupAuthMockWithMasterData(page, '/bulk.html', {
      isAuthenticated: true,
      email: 'test@example.com'
    });

    // Add a row
    await page.click('#addRowBtn');
    await page.waitForTimeout(200);

    // Get the first option value from property select
    const propertySelect = page.locator('#tableBody tr:first-child .property-select');
    const firstOption = await propertySelect.locator('option:nth-child(2)').getAttribute('value');
    console.log('First property option value:', firstOption);

    // Select property
    await propertySelect.selectOption({ index: 1 });
    await page.waitForTimeout(300);

    // Check terminal options
    const terminalSelect = page.locator('#tableBody tr:first-child .terminal-select');
    const terminalOptions = await terminalSelect.locator('option').allTextContents();
    console.log('Terminal options:', terminalOptions);

    // Take screenshot
    await page.screenshot({ path: 'screenshots/debug-after-property-select.png', fullPage: true });

    // Check if property value is set in the select
    const selectedPropertyValue = await propertySelect.inputValue();
    console.log('Selected property value:', selectedPropertyValue);

    // Check row status
    const statusBadge = page.locator('#tableBody tr:first-child .status-badge');
    const statusText = await statusBadge.textContent();
    console.log('Status after property select:', statusText);
  });

  test('select all required fields and check status', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
    });
    await setupAuthMockWithMasterData(page, '/bulk.html', {
      isAuthenticated: true,
      email: 'test@example.com'
    });

    await page.click('#addRowBtn');
    await page.waitForTimeout(200);

    // Select property
    await page.locator('#tableBody tr:first-child .property-select').selectOption({ index: 1 });
    await page.waitForTimeout(100);

    // Select vendor
    await page.locator('#tableBody tr:first-child .vendor-select').selectOption({ index: 1 });
    await page.waitForTimeout(100);

    // Select inspection
    await page.locator('#tableBody tr:first-child .inspection-select').selectOption({ index: 1 });
    await page.waitForTimeout(100);

    // Take screenshot
    await page.screenshot({ path: 'screenshots/debug-all-fields-selected.png', fullPage: true });

    // Check status
    const statusBadge = page.locator('#tableBody tr:first-child .status-badge');
    const statusText = await statusBadge.textContent();
    console.log('Status after all fields:', statusText);

    // Should be OK
    await expect(statusBadge).toHaveText('OK');
  });

  test('duplicate row copies values', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
    });
    await setupAuthMockWithMasterData(page, '/bulk.html', {
      isAuthenticated: true,
      email: 'test@example.com'
    });

    await page.click('#addRowBtn');
    await page.waitForTimeout(200);

    // Select property
    const propertySelect = page.locator('#tableBody tr:first-child .property-select');
    await propertySelect.selectOption({ index: 1 });
    const firstPropertyValue = await propertySelect.inputValue();
    console.log('First row property value:', firstPropertyValue);

    // Select the row
    await page.locator('#tableBody tr:first-child input[type="checkbox"]').check();
    await page.waitForTimeout(100);

    // Click duplicate
    await page.click('#duplicateBtn');
    await page.waitForTimeout(300);

    // Take screenshot
    await page.screenshot({ path: 'screenshots/debug-after-duplicate.png', fullPage: true });

    // Check second row property value
    const secondPropertySelect = page.locator('#tableBody tr:nth-child(2) .property-select');
    const secondPropertyValue = await secondPropertySelect.inputValue();
    console.log('Second row property value:', secondPropertyValue);

    expect(secondPropertyValue).toBe(firstPropertyValue);
  });
});
