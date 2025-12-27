// @ts-check
const { test, expect } = require('@playwright/test');
const { setupAuthMockWithMasterData } = require('./test-helpers');

test.describe('Debug Search Select', () => {
  test('select via search box and verify value is captured', async ({ page }) => {
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

    // Focus on property select to show search
    const propertySelect = page.locator('#tableBody tr:first-child .property-select');
    await propertySelect.focus();
    await page.waitForTimeout(100);

    // Type in search box
    const searchInput = page.locator('#tableBody tr:first-child .property-search');
    await searchInput.fill('テスト');
    await page.waitForTimeout(100);

    // Click on the first visible option
    await propertySelect.selectOption({ index: 1 });
    await page.waitForTimeout(200);

    // Check the selected value
    const selectedValue = await propertySelect.inputValue();
    console.log('Property selected value:', selectedValue);

    // Check if row data is updated - get from page context
    const rowData = await page.evaluate(() => {
      // @ts-ignore
      return window.rows?.[0];
    });
    console.log('Row data after property select:', rowData);

    // Now select vendor via search
    const vendorSelect = page.locator('#tableBody tr:first-child .vendor-select');
    await vendorSelect.focus();
    await page.waitForTimeout(100);

    const vendorSearch = page.locator('#tableBody tr:first-child .vendor-search');
    await vendorSearch.fill('山本');
    await page.waitForTimeout(100);

    await vendorSelect.selectOption({ index: 1 });
    await page.waitForTimeout(200);

    // Check vendor value
    const vendorValue = await vendorSelect.inputValue();
    console.log('Vendor selected value:', vendorValue);

    // Select inspection
    const inspectionSelect = page.locator('#tableBody tr:first-child .inspection-select');
    await inspectionSelect.focus();
    await page.waitForTimeout(100);

    const inspectionSearch = page.locator('#tableBody tr:first-child .inspection-search');
    await inspectionSearch.fill('清掃');
    await page.waitForTimeout(100);

    await inspectionSelect.selectOption({ index: 1 });
    await page.waitForTimeout(200);

    const inspectionValue = await inspectionSelect.inputValue();
    console.log('Inspection selected value:', inspectionValue);

    // Check final row data
    const finalRowData = await page.evaluate(() => {
      // @ts-ignore
      return window.rows?.[0];
    });
    console.log('Final row data:', JSON.stringify(finalRowData, null, 2));

    // Check status
    const statusBadge = page.locator('#tableBody tr:first-child .status-badge');
    const statusText = await statusBadge.textContent();
    console.log('Final status:', statusText);

    // Take screenshot
    await page.screenshot({ path: 'screenshots/debug-search-select.png', fullPage: true });

    // Verify status is OK
    await expect(statusBadge).toHaveText('OK');
  });

  test('verify rows array is exposed globally', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
    });
    await setupAuthMockWithMasterData(page, '/bulk.html', {
      isAuthenticated: true,
      email: 'test@example.com'
    });

    await page.click('#addRowBtn');
    await page.waitForTimeout(200);

    // Check if rows is accessible
    const rowsExists = await page.evaluate(() => {
      // @ts-ignore
      return typeof window.rows !== 'undefined';
    });
    console.log('rows exists globally:', rowsExists);

    // If rows is not global, we need to expose it
    if (!rowsExists) {
      console.log('WARNING: rows array is not globally accessible!');
    }
  });
});
