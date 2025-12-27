// @ts-check
const { test, expect } = require('@playwright/test');
const { setupAuthMock } = require('./test-helpers');
const { expectedProperties, expectedVendors, expectedNotices, getUniquePropertyCodes } = require('./test-data');

test.describe('Initialization Tests', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMock(page, '/', { isAuthenticated: true });
  });

  test('page loads successfully', async ({ page }) => {
    await expect(page).toHaveTitle(/点検CSV作成/);
  });

  test('form elements are present', async ({ page }) => {
    await expect(page.locator('#property')).toBeVisible();
    await expect(page.locator('#terminal')).toBeVisible();
    await expect(page.locator('#vendor')).toBeVisible();
    await expect(page.locator('#emergencyContact')).toBeVisible();
    await expect(page.locator('#inspectionType')).toBeVisible();
    await expect(page.locator('#showOnBoard')).toBeVisible();
    await expect(page.locator('#startDate')).toBeVisible();
    await expect(page.locator('#endDate')).toBeVisible();
    await expect(page.locator('#remarks')).toBeVisible();
    await expect(page.locator('#noticeText')).toBeVisible();
  });

  test('start date is set to today', async ({ page }) => {
    const today = new Date().toISOString().split('T')[0];
    const startDateValue = await page.locator('#startDate').inputValue();
    expect(startDateValue).toBe(today);
  });

  test('display start date is set to today', async ({ page }) => {
    const today = new Date().toISOString().split('T')[0];
    const displayStartDateValue = await page.locator('#displayStartDate').inputValue();
    expect(displayStartDateValue).toBe(today);
  });

  test('property select has correct number of unique property codes', async ({ page }) => {
    const options = await page.locator('#property option').all();
    const uniquePropertyCodes = getUniquePropertyCodes();
    // +1 for the default empty option
    expect(options.length).toBe(uniquePropertyCodes.length + 1);
  });

  test('vendor select has correct number of vendors', async ({ page }) => {
    const options = await page.locator('#vendor option').all();
    // +1 for the default empty option
    expect(options.length).toBe(expectedVendors.length + 1);
  });

  test('inspection type select is populated', async ({ page }) => {
    const options = await page.locator('#inspectionType option').all();
    // Should have at least some options (web app may have fewer than Excel)
    expect(options.length).toBeGreaterThan(1);
  });

  test('preview area shows placeholder initially', async ({ page }) => {
    await expect(page.locator('#posterPreview')).toContainText('点検工事案内を選択');
  });

  test('data count is 0 initially', async ({ page }) => {
    await expect(page.locator('#dataCount')).toContainText('0');
  });

  test('position grid is visible', async ({ page }) => {
    const positionCells = await page.locator('.position-cell').all();
    expect(positionCells.length).toBe(5);
  });

  test('default position is 2 (upper center)', async ({ page }) => {
    const activeCell = page.locator('.position-cell.active');
    await expect(activeCell).toHaveAttribute('data-pos', '2');
  });

  test('template radio is selected by default', async ({ page }) => {
    const templateRadio = page.locator('input[name="posterType"][value="template"]');
    await expect(templateRadio).toBeChecked();
  });

  test('display time default is 6', async ({ page }) => {
    const displayTime = await page.locator('#displayTime').inputValue();
    expect(displayTime).toBe('6');
  });
});
