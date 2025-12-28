// @ts-check
const { test, expect } = require('@playwright/test');
const { setupAuthMockWithMasterData } = require('./test-helpers');

test.describe('Display Time Adjustment Tests', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMockWithMasterData(page, '/index.html', { isAuthenticated: true });
  });

  test('plus button increases display time', async ({ page }) => {
    const initialValue = await page.locator('#displayTime').inputValue();
    // Using the spin-btn class and the + character
    await page.click('.spin-btn:has-text("+")');
    const newValue = await page.locator('#displayTime').inputValue();
    expect(parseInt(newValue)).toBe(parseInt(initialValue) + 1);
  });

  test('minus button decreases display time', async ({ page }) => {
    await page.fill('#displayTime', '10');
    // Using the spin-btn class and the − character (not -)
    await page.click('.spin-btn:first-of-type');
    const newValue = await page.locator('#displayTime').inputValue();
    expect(newValue).toBe('9');
  });

  test('display time cannot go below 1', async ({ page }) => {
    await page.fill('#displayTime', '1');
    await page.click('.spin-btn:first-of-type');
    const newValue = await page.locator('#displayTime').inputValue();
    expect(parseInt(newValue)).toBeGreaterThanOrEqual(1);
  });

  test('display time cannot exceed 30', async ({ page }) => {
    await page.fill('#displayTime', '30');
    await page.click('.spin-btn:has-text("+")');
    const newValue = await page.locator('#displayTime').inputValue();
    expect(parseInt(newValue)).toBeLessThanOrEqual(30);
  });
});

test.describe('Preview Update Tests', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMockWithMasterData(page, '/index.html', { isAuthenticated: true });
  });

  test('preview updates when notice text changes', async ({ page }) => {
    await page.selectOption('#inspectionType', '0');
    const customText = 'カスタムテキスト';
    await page.fill('#noticeText', customText);

    const overlayText = await page.locator('.poster-notice-text').textContent();
    expect(overlayText).toBe(customText);
  });

  test('preview shows date when start date is set', async ({ page }) => {
    await page.selectOption('#inspectionType', '0');
    await page.fill('#startDate', '2025-12-15');

    const dateText = await page.locator('.poster-date-text').textContent();
    expect(dateText).toContain('12月15日');
  });

  test('preview shows date range when both dates are set', async ({ page }) => {
    await page.selectOption('#inspectionType', '0');
    await page.fill('#startDate', '2025-12-15');
    await page.fill('#endDate', '2025-12-20');

    const dateText = await page.locator('.poster-date-text').textContent();
    expect(dateText).toContain('12月15日');
    expect(dateText).toContain('12月20日');
  });

  test('preview shows remarks', async ({ page }) => {
    await page.selectOption('#inspectionType', '0');
    await page.fill('#remarks', '備考テスト');

    const remarksText = await page.locator('.poster-remarks-text').textContent();
    expect(remarksText).toBe('備考テスト');
  });
});

test.describe('Toast Notification Tests', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMockWithMasterData(page, '/index.html', { isAuthenticated: true });
  });

  test('success toast appears on successful add', async ({ page }) => {
    await page.selectOption('#property', '2010');
    await page.selectOption('#vendor', '0');
    await page.selectOption('#inspectionType', '0');
    await page.click('button:has-text("データを追加")');

    await expect(page.locator('.toast.success')).toBeVisible();
  });

  test('error toast appears on validation failure', async ({ page }) => {
    await page.click('button:has-text("データを追加")');
    await expect(page.locator('.toast.error')).toBeVisible();
  });

  test('toast disappears after timeout', async ({ page }) => {
    await page.selectOption('#property', '2010');
    await page.selectOption('#vendor', '0');
    await page.selectOption('#inspectionType', '0');
    await page.click('button:has-text("データを追加")');

    await expect(page.locator('.toast.success')).toBeVisible();
    // Wait for toast to disappear (2.5 seconds)
    await page.waitForTimeout(3000);
    await expect(page.locator('.toast')).not.toBeVisible();
  });
});

test.describe('Data List Display Tests', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMockWithMasterData(page, '/index.html', { isAuthenticated: true });
  });

  test('empty state shows message when no data', async ({ page }) => {
    await expect(page.locator('.empty-state')).toBeVisible();
  });

  test('empty state disappears when data is added', async ({ page }) => {
    await page.selectOption('#property', '2010');
    await page.selectOption('#vendor', '0');
    await page.selectOption('#inspectionType', '0');
    await page.click('button:has-text("データを追加")');

    await expect(page.locator('.empty-state')).not.toBeVisible();
  });

  test('data item shows inspection type', async ({ page }) => {
    await page.selectOption('#property', '2010');
    await page.selectOption('#vendor', '0');
    await page.selectOption('#inspectionType', '0');
    await page.click('button:has-text("データを追加")');

    await expect(page.locator('.data-item-title')).toBeVisible();
  });

  test('data item shows property code and date', async ({ page }) => {
    await page.selectOption('#property', '2010');
    await page.selectOption('#vendor', '0');
    await page.selectOption('#inspectionType', '0');
    await page.fill('#startDate', '2025-12-15');
    await page.click('button:has-text("データを追加")');

    const subText = await page.locator('.data-item-sub').textContent();
    expect(subText).toContain('2010');
  });

  test('data item shows visibility badge', async ({ page }) => {
    await page.selectOption('#property', '2010');
    await page.selectOption('#vendor', '0');
    await page.selectOption('#inspectionType', '0');
    await page.click('button:has-text("データを追加")');

    // Use more specific selector for the data item badge
    await expect(page.locator('.data-item .badge')).toBeVisible();
  });

  test('export section hidden when no data', async ({ page }) => {
    const exportSection = page.locator('#exportSection');
    const display = await exportSection.evaluate(el => getComputedStyle(el).display);
    expect(display).toBe('none');
  });

  test('export section visible when data exists', async ({ page }) => {
    await page.selectOption('#property', '2010');
    await page.selectOption('#vendor', '0');
    await page.selectOption('#inspectionType', '0');
    await page.click('button:has-text("データを追加")');

    const exportSection = page.locator('#exportSection');
    await expect(exportSection).toBeVisible();
  });
});
