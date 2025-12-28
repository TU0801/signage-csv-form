// @ts-check
const { test, expect } = require('@playwright/test');
const { setupAuthMockWithMasterData } = require('./test-helpers');

test.describe('Date Validation - Single Entry (index.html)', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMockWithMasterData(page, '/', {
      isAuthenticated: true,
      email: 'test@example.com'
    });
  });

  test('start date defaults to today', async ({ page }) => {
    const today = new Date().toISOString().split('T')[0];
    const startDateValue = await page.locator('#startDate').inputValue();
    expect(startDateValue).toBe(today);
  });

  test('display start date defaults to today', async ({ page }) => {
    const today = new Date().toISOString().split('T')[0];
    const displayStartDateValue = await page.locator('#displayStartDate').inputValue();
    expect(displayStartDateValue).toBe(today);
  });

  test('end date can be empty (optional)', async ({ page }) => {
    const endDateValue = await page.locator('#endDate').inputValue();
    // End date should be empty by default
    expect(endDateValue).toBe('');
  });

  test('display end date can be empty', async ({ page }) => {
    const displayEndDateValue = await page.locator('#displayEndDate').inputValue();
    // Display end date should be empty by default
    expect(displayEndDateValue).toBe('');
  });

  test('start date and display start date can be set independently', async ({ page }) => {
    const startDate = '2025-02-15';
    const displayStartDate = '2025-02-20';

    // Set start date
    await page.locator('#startDate').fill(startDate);
    await page.locator('#startDate').blur();

    // Set display start date to a different value
    await page.locator('#displayStartDate').fill(displayStartDate);
    await page.locator('#displayStartDate').blur();

    // Wait for any changes to propagate
    await page.waitForTimeout(100);

    // Verify both dates maintain their independent values
    const startDateValue = await page.locator('#startDate').inputValue();
    const displayStartDateValue = await page.locator('#displayStartDate').inputValue();

    expect(startDateValue).toBe(startDate);
    expect(displayStartDateValue).toBe(displayStartDate);
  });
});

test.describe('Date Validation - Bulk Entry (bulk.html)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
    });
    await setupAuthMockWithMasterData(page, '/bulk.html', {
      isAuthenticated: true,
      email: 'test@example.com'
    });
  });

  test('new row has startDate defaulted to today', async ({ page }) => {
    const today = new Date().toISOString().split('T')[0];

    // Add a new row
    await page.click('#addRowBtn');
    await page.waitForTimeout(100);

    // Check the start date in the new row
    const startDateValue = await page.locator('#tableBody tr:first-child .start-date').inputValue();
    expect(startDateValue).toBe(today);
  });

  test('date fields accept valid date format (YYYY-MM-DD)', async ({ page }) => {
    const validDate = '2025-03-20';

    // Add a new row
    await page.click('#addRowBtn');
    await page.waitForTimeout(100);

    // Set start date
    await page.fill('#tableBody tr:first-child .start-date', validDate);
    await page.locator('#tableBody tr:first-child .start-date').blur();

    // Verify the date was accepted
    const startDateValue = await page.locator('#tableBody tr:first-child .start-date').inputValue();
    expect(startDateValue).toBe(validDate);

    // Set end date
    await page.fill('#tableBody tr:first-child .end-date', validDate);
    await page.locator('#tableBody tr:first-child .end-date').blur();

    // Verify the end date was accepted
    const endDateValue = await page.locator('#tableBody tr:first-child .end-date').inputValue();
    expect(endDateValue).toBe(validDate);
  });

  test('empty dates are handled gracefully', async ({ page }) => {
    // Add a new row
    await page.click('#addRowBtn');
    await page.waitForTimeout(100);

    // Clear the start date (which was set to today by default)
    await page.fill('#tableBody tr:first-child .start-date', '');
    await page.locator('#tableBody tr:first-child .start-date').blur();

    // Verify start date is empty
    const startDateValue = await page.locator('#tableBody tr:first-child .start-date').inputValue();
    expect(startDateValue).toBe('');

    // Verify end date is empty (it should be empty by default or auto-filled)
    // First clear it to ensure we test empty handling
    await page.fill('#tableBody tr:first-child .end-date', '');
    await page.locator('#tableBody tr:first-child .end-date').blur();

    const endDateValue = await page.locator('#tableBody tr:first-child .end-date').inputValue();
    expect(endDateValue).toBe('');

    // The row should still exist and be functional (no errors thrown)
    await expect(page.locator('#tableBody tr:first-child')).toBeVisible();
    await expect(page.locator('#totalCount')).toHaveText('1');
  });
});
