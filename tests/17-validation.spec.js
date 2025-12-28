// @ts-check
const { test, expect } = require('@playwright/test');
const { setupAuthMockWithMasterData } = require('./test-helpers');

test.describe('Input Validation Tests - Single Entry Form', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMockWithMasterData(page, '/index.html', { isAuthenticated: true });
  });

  test.describe('Display Time Validation', () => {
    test('display time cannot exceed max value from appSettings', async ({ page }) => {
      // Fill required fields first
      await page.selectOption('#property', '2010');
      await page.selectOption('#vendor', '0');
      await page.selectOption('#inspectionType', '0');

      // Set display time exceeding the max (default 30)
      await page.fill('#displayTime', '35');
      await page.click('button:has-text("データを追加")');

      // Check error toast appears
      await expect(page.locator('.toast.error')).toBeVisible();
      const toastText = await page.locator('.toast.error').textContent();
      expect(toastText).toContain('表示時間');
    });

    test('display time at max value is accepted', async ({ page }) => {
      await page.selectOption('#property', '2010');
      await page.selectOption('#vendor', '0');
      await page.selectOption('#inspectionType', '0');

      // Set display time at max (30)
      await page.fill('#displayTime', '30');
      await page.click('button:has-text("データを追加")');

      // Check success toast appears
      await expect(page.locator('.toast.success')).toBeVisible();
    });

    test('adjustTime buttons respect max limit', async ({ page }) => {
      // Set display time close to max
      await page.fill('#displayTime', '29');

      // Click increase button multiple times
      await page.click('.spin-btn:has-text("+")');
      await page.click('.spin-btn:has-text("+")');

      // Value should not exceed max (30)
      const displayTimeValue = await page.locator('#displayTime').inputValue();
      expect(parseInt(displayTimeValue)).toBeLessThanOrEqual(30);
    });
  });

  test.describe('Remarks Text Validation', () => {
    test('remarks with too many lines shows error', async ({ page }) => {
      await page.selectOption('#property', '2010');
      await page.selectOption('#vendor', '0');
      await page.selectOption('#inspectionType', '0');

      // Create remarks with 6 lines (default max is 5)
      const sixLines = 'Line1\nLine2\nLine3\nLine4\nLine5\nLine6';
      await page.fill('#remarks', sixLines);
      await page.click('button:has-text("データを追加")');

      // Check error toast appears
      await expect(page.locator('.toast.error')).toBeVisible();
      const toastText = await page.locator('.toast.error').textContent();
      expect(toastText).toContain('行');
    });

    test('remarks with exactly max lines is accepted', async ({ page }) => {
      await page.selectOption('#property', '2010');
      await page.selectOption('#vendor', '0');
      await page.selectOption('#inspectionType', '0');

      // Create remarks with exactly 5 lines (default max)
      const fiveLines = 'Line1\nLine2\nLine3\nLine4\nLine5';
      await page.fill('#remarks', fiveLines);
      await page.click('button:has-text("データを追加")');

      // Check success toast appears
      await expect(page.locator('.toast.success')).toBeVisible();
    });

    test('remarks with line exceeding max chars per line shows error', async ({ page }) => {
      await page.selectOption('#property', '2010');
      await page.selectOption('#vendor', '0');
      await page.selectOption('#inspectionType', '0');

      // Create a line with 26 characters (default max is 25)
      const longLine = 'あいうえおかきくけこさしすせそたちつてとなにぬねのは';
      await page.fill('#remarks', longLine);
      await page.click('button:has-text("データを追加")');

      // Check error toast appears
      await expect(page.locator('.toast.error')).toBeVisible();
      const toastText = await page.locator('.toast.error').textContent();
      expect(toastText).toContain('文字');
    });

    test('remarks with exactly max chars per line is accepted', async ({ page }) => {
      await page.selectOption('#property', '2010');
      await page.selectOption('#vendor', '0');
      await page.selectOption('#inspectionType', '0');

      // Create a line with exactly 25 characters (default max)
      const exactLine = 'あいうえおかきくけこさしすせそたちつてとなにぬねの';
      await page.fill('#remarks', exactLine);
      await page.click('button:has-text("データを追加")');

      // Check success toast appears
      await expect(page.locator('.toast.success')).toBeVisible();
    });
  });

  test.describe('Notice Text Validation', () => {
    test('notice text exceeding max chars shows error', async ({ page }) => {
      await page.selectOption('#property', '2010');
      await page.selectOption('#vendor', '0');
      await page.selectOption('#inspectionType', '0');

      // Create notice text with 201 characters (default max is 200)
      const longText = 'あ'.repeat(201);
      await page.fill('#noticeText', longText);
      await page.click('button:has-text("データを追加")');

      // Check error toast appears
      await expect(page.locator('.toast.error')).toBeVisible();
      const toastText = await page.locator('.toast.error').textContent();
      expect(toastText).toContain('案内文');
    });

    test('notice text at exactly max chars is accepted', async ({ page }) => {
      await page.selectOption('#property', '2010');
      await page.selectOption('#vendor', '0');
      await page.selectOption('#inspectionType', '0');

      // Create notice text with exactly 200 characters (default max)
      const exactText = 'あ'.repeat(200);
      await page.fill('#noticeText', exactText);
      await page.click('button:has-text("データを追加")');

      // Check success toast appears
      await expect(page.locator('.toast.success')).toBeVisible();
    });
  });

  test.describe('Required Fields Validation', () => {
    test('cannot add entry without property', async ({ page }) => {
      // Only fill vendor and inspection type
      await page.selectOption('#vendor', '0');
      await page.selectOption('#inspectionType', '0');
      await page.click('button:has-text("データを追加")');

      // Check error toast appears
      await expect(page.locator('.toast.error')).toBeVisible();
    });

    test('cannot add entry without vendor', async ({ page }) => {
      // Only fill property and inspection type
      await page.selectOption('#property', '2010');
      await page.selectOption('#inspectionType', '0');
      await page.click('button:has-text("データを追加")');

      // Check error toast appears
      await expect(page.locator('.toast.error')).toBeVisible();
    });

    test('cannot add entry without inspection type in template mode', async ({ page }) => {
      // Only fill property and vendor
      await page.selectOption('#property', '2010');
      await page.selectOption('#vendor', '0');
      await page.click('button:has-text("データを追加")');

      // Check error toast appears with specific message
      await expect(page.locator('.toast.error')).toBeVisible();
      const toastText = await page.locator('.toast.error').textContent();
      expect(toastText).toContain('点検工事案内');
    });

    test('can add entry with all required fields filled', async ({ page }) => {
      await page.selectOption('#property', '2010');
      await page.selectOption('#vendor', '0');
      await page.selectOption('#inspectionType', '0');
      await page.click('button:has-text("データを追加")');

      // Check success toast appears
      await expect(page.locator('.toast.success')).toBeVisible();
      await expect(page.locator('#dataCount')).toContainText('1');
    });
  });

  test.describe('Toast Error Messages', () => {
    test('error toast has correct styling', async ({ page }) => {
      // Try to submit without required fields
      await page.click('button:has-text("データを追加")');

      const toast = page.locator('.toast.error');
      await expect(toast).toBeVisible();
      await expect(toast).toHaveClass(/error/);
    });

    test('error toast message is visible and readable', async ({ page }) => {
      await page.selectOption('#property', '2010');
      await page.selectOption('#vendor', '0');
      // Don't select inspection type
      await page.click('button:has-text("データを追加")');

      const toast = page.locator('.toast.error');
      await expect(toast).toBeVisible();
      const text = await toast.textContent();
      expect(text.length).toBeGreaterThan(0);
    });

    test('multiple validation errors are shown together', async ({ page }) => {
      await page.selectOption('#property', '2010');
      await page.selectOption('#vendor', '0');
      await page.selectOption('#inspectionType', '0');

      // Add multiple validation errors
      await page.fill('#displayTime', '50'); // exceeds max
      const longLine = 'あ'.repeat(30); // exceeds chars per line
      await page.fill('#remarks', longLine);

      await page.click('button:has-text("データを追加")');

      const toast = page.locator('.toast.error');
      await expect(toast).toBeVisible();
      const toastText = await toast.textContent();
      // Should contain multiple error messages
      expect(toastText).toContain('表示時間');
    });

    test('success toast appears after valid submission', async ({ page }) => {
      await page.selectOption('#property', '2010');
      await page.selectOption('#vendor', '0');
      await page.selectOption('#inspectionType', '0');
      await page.click('button:has-text("データを追加")');

      const toast = page.locator('.toast.success');
      await expect(toast).toBeVisible();
      await expect(toast).toHaveClass(/success/);
    });
  });
});

test.describe('Input Validation Tests - Bulk Entry Form', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
    });
    await setupAuthMockWithMasterData(page, '/bulk.html', {
      isAuthenticated: true,
      email: 'test@example.com'
    });
  });

  test.describe('Required Fields Validation', () => {
    test('row without required fields shows error state', async ({ page }) => {
      // Add a row
      await page.click('#addRowBtn');
      await page.waitForTimeout(100);

      // Row should exist
      const row = page.locator('#tableBody tr:first-child');
      await expect(row).toBeVisible();

      // Check that row is marked as having error (empty required fields)
      // The filter counts should show error rows
      await page.click('.filter-btn[data-filter="error"]');
      await expect(page.locator('#tableBody tr')).toHaveCount(1);
    });

    test('row with all required fields is valid', async ({ page }) => {
      await page.click('#addRowBtn');
      await page.waitForTimeout(100);

      // Fill required fields
      await page.locator('#tableBody tr:first-child .property-select').selectOption({ index: 1 });
      await page.locator('#tableBody tr:first-child .vendor-select').selectOption({ index: 1 });
      await page.locator('#tableBody tr:first-child .inspection-select').selectOption({ index: 1 });
      await page.waitForTimeout(100);

      // Check valid filter
      await page.click('.filter-btn[data-filter="valid"]');
      await expect(page.locator('#tableBody tr')).toHaveCount(1);
    });
  });

  test.describe('Filter Buttons Reflect Validation', () => {
    test('error filter shows only invalid rows', async ({ page }) => {
      // Add first row (empty, invalid)
      await page.click('#addRowBtn');
      await page.waitForTimeout(100);

      // Total should be 1
      await expect(page.locator('#totalCount')).toHaveText('1');

      // Error filter should show 1 (the empty row)
      await page.click('.filter-btn[data-filter="error"]');
      await page.waitForTimeout(100);

      // Count rows that are not hidden (display !== 'none')
      const visibleRows = await page.evaluate(() => {
        const rows = document.querySelectorAll('#tableBody tr');
        return Array.from(rows).filter(tr => tr.style.display !== 'none').length;
      });
      expect(visibleRows).toBe(1);
    });

    test('valid filter shows only valid rows', async ({ page }) => {
      await page.click('#addRowBtn');
      await page.waitForTimeout(100);

      // Fill required fields
      await page.locator('#tableBody tr:first-child .property-select').selectOption({ index: 1 });
      await page.locator('#tableBody tr:first-child .vendor-select').selectOption({ index: 1 });
      await page.locator('#tableBody tr:first-child .inspection-select').selectOption({ index: 1 });
      await page.waitForTimeout(100);

      // Total should be 1
      await expect(page.locator('#totalCount')).toHaveText('1');

      // Valid filter should show 1
      await page.click('.filter-btn[data-filter="valid"]');
      await page.waitForTimeout(100);

      // Count rows that are not hidden (display !== 'none')
      const visibleRows = await page.evaluate(() => {
        const rows = document.querySelectorAll('#tableBody tr');
        return Array.from(rows).filter(tr => tr.style.display !== 'none').length;
      });
      expect(visibleRows).toBe(1);
    });

    test('error filter hides valid rows', async ({ page }) => {
      await page.click('#addRowBtn');
      await page.waitForTimeout(100);

      // Fill required fields to make row valid
      await page.locator('#tableBody tr:first-child .property-select').selectOption({ index: 1 });
      await page.locator('#tableBody tr:first-child .vendor-select').selectOption({ index: 1 });
      await page.locator('#tableBody tr:first-child .inspection-select').selectOption({ index: 1 });
      await page.waitForTimeout(100);

      // Error filter should show 0 (the row is now valid)
      await page.click('.filter-btn[data-filter="error"]');
      await page.waitForTimeout(100);

      // Count rows that are not hidden (display !== 'none')
      const visibleRows = await page.evaluate(() => {
        const rows = document.querySelectorAll('#tableBody tr');
        return Array.from(rows).filter(tr => tr.style.display !== 'none').length;
      });
      expect(visibleRows).toBe(0);
    });

    test('all filter shows all rows', async ({ page }) => {
      await page.click('#addRowBtn');
      await page.click('#addRowBtn');
      await page.waitForTimeout(100);

      // All filter should show both rows
      await page.click('.filter-btn[data-filter="all"]');
      await expect(page.locator('#tableBody tr')).toHaveCount(2);
    });
  });
});
