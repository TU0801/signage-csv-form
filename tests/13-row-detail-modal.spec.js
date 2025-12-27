// @ts-check
const { test, expect } = require('@playwright/test');
const { setupAuthMockWithMasterData } = require('./test-helpers');

test.describe('Row Detail Modal Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
    });
    await setupAuthMockWithMasterData(page, '/bulk.html', {
      isAuthenticated: true,
      email: 'test@example.com'
    });
  });

  test.describe('Detail Button', () => {
    test('detail button exists in table row', async ({ page }) => {
      await page.click('#addRowBtn');
      await expect(page.locator('#tableBody tr:first-child .btn-detail')).toBeVisible();
    });

    test('detail button shows ellipsis initially', async ({ page }) => {
      await page.click('#addRowBtn');
      const detailBtn = page.locator('#tableBody tr:first-child .btn-detail');
      await expect(detailBtn).toHaveText('⋯');
    });

    test('clicking detail button opens modal', async ({ page }) => {
      await page.click('#addRowBtn');
      await page.click('#tableBody tr:first-child .btn-detail');
      await expect(page.locator('#rowDetailModal')).toHaveClass(/active/);
    });
  });

  test.describe('Modal Content', () => {
    test('modal has all required fields', async ({ page }) => {
      await page.click('#addRowBtn');
      await page.click('#tableBody tr:first-child .btn-detail');

      await expect(page.locator('#detailNoticeText')).toBeVisible();
      await expect(page.locator('#detailDisplayStartDate')).toBeVisible();
      await expect(page.locator('#detailDisplayStartTime')).toBeVisible();
      await expect(page.locator('#detailDisplayEndDate')).toBeVisible();
      await expect(page.locator('#detailDisplayEndTime')).toBeVisible();
      await expect(page.locator('#detailShowOnBoard')).toBeVisible();
    });

    test('modal shows row number', async ({ page }) => {
      await page.click('#addRowBtn');
      await page.click('#tableBody tr:first-child .btn-detail');

      await expect(page.locator('#detailRowNum')).toContainText('行 1');
    });

    test('showOnBoard is checked by default', async ({ page }) => {
      await page.click('#addRowBtn');
      await page.click('#tableBody tr:first-child .btn-detail');

      await expect(page.locator('#detailShowOnBoard')).toBeChecked();
    });
  });

  test.describe('Saving Detail Data', () => {
    test('can save notice text', async ({ page }) => {
      await page.click('#addRowBtn');
      await page.click('#tableBody tr:first-child .btn-detail');

      await page.fill('#detailNoticeText', 'テスト案内文');
      await page.click('#applyRowDetail');

      // Modal should close
      await expect(page.locator('#rowDetailModal')).not.toHaveClass(/active/);

      // Button should show checkmark
      const detailBtn = page.locator('#tableBody tr:first-child .btn-detail');
      await expect(detailBtn).toHaveText('✓');
      await expect(detailBtn).toHaveClass(/has-data/);
    });

    test('can save display start date/time', async ({ page }) => {
      await page.click('#addRowBtn');
      await page.click('#tableBody tr:first-child .btn-detail');

      await page.fill('#detailDisplayStartDate', '2025-01-15');
      await page.fill('#detailDisplayStartTime', '09:00');
      await page.click('#applyRowDetail');

      // Reopen and verify
      await page.click('#tableBody tr:first-child .btn-detail');
      await expect(page.locator('#detailDisplayStartDate')).toHaveValue('2025-01-15');
      await expect(page.locator('#detailDisplayStartTime')).toHaveValue('09:00');
    });

    test('can save display end date/time', async ({ page }) => {
      await page.click('#addRowBtn');
      await page.click('#tableBody tr:first-child .btn-detail');

      await page.fill('#detailDisplayEndDate', '2025-01-31');
      await page.fill('#detailDisplayEndTime', '18:00');
      await page.click('#applyRowDetail');

      // Reopen and verify
      await page.click('#tableBody tr:first-child .btn-detail');
      await expect(page.locator('#detailDisplayEndDate')).toHaveValue('2025-01-31');
      await expect(page.locator('#detailDisplayEndTime')).toHaveValue('18:00');
    });

    test('can toggle showOnBoard', async ({ page }) => {
      await page.click('#addRowBtn');
      await page.click('#tableBody tr:first-child .btn-detail');

      // Uncheck
      await page.locator('#detailShowOnBoard').uncheck();
      await page.click('#applyRowDetail');

      // Reopen and verify
      await page.click('#tableBody tr:first-child .btn-detail');
      await expect(page.locator('#detailShowOnBoard')).not.toBeChecked();
    });

    test('shows toast on save', async ({ page }) => {
      await page.click('#addRowBtn');
      await page.click('#tableBody tr:first-child .btn-detail');

      await page.fill('#detailNoticeText', 'テスト');
      await page.click('#applyRowDetail');

      await expect(page.locator('#toast')).toContainText('詳細設定を保存しました');
    });
  });

  test.describe('Modal Closing', () => {
    test('cancel button closes modal without saving', async ({ page }) => {
      await page.click('#addRowBtn');
      await page.click('#tableBody tr:first-child .btn-detail');

      await page.fill('#detailNoticeText', 'キャンセルテスト');
      await page.click('#cancelRowDetail');

      // Modal should close
      await expect(page.locator('#rowDetailModal')).not.toHaveClass(/active/);

      // Button should still show ellipsis (not saved)
      const detailBtn = page.locator('#tableBody tr:first-child .btn-detail');
      await expect(detailBtn).toHaveText('⋯');
    });

    test('close button closes modal', async ({ page }) => {
      await page.click('#addRowBtn');
      await page.click('#tableBody tr:first-child .btn-detail');

      await page.click('#closeRowDetailModal');
      await expect(page.locator('#rowDetailModal')).not.toHaveClass(/active/);
    });

    test('clicking overlay closes modal', async ({ page }) => {
      await page.click('#addRowBtn');
      await page.click('#tableBody tr:first-child .btn-detail');

      // Click the overlay (outside the modal content)
      await page.locator('#rowDetailModal').click({ position: { x: 10, y: 10 } });
      await expect(page.locator('#rowDetailModal')).not.toHaveClass(/active/);
    });

    test('Escape key closes modal', async ({ page }) => {
      await page.click('#addRowBtn');
      await page.click('#tableBody tr:first-child .btn-detail');

      await page.keyboard.press('Escape');
      await expect(page.locator('#rowDetailModal')).not.toHaveClass(/active/);
    });
  });

  test.describe('Multiple Rows', () => {
    test('detail data is saved per row', async ({ page }) => {
      // Add two rows
      await page.click('#addRowBtn');
      await page.click('#addRowBtn');

      // Set detail for first row
      await page.click('#tableBody tr:first-child .btn-detail');
      await page.fill('#detailNoticeText', '1行目の案内文');
      await page.click('#applyRowDetail');

      // Set detail for second row
      await page.click('#tableBody tr:nth-child(2) .btn-detail');
      await page.fill('#detailNoticeText', '2行目の案内文');
      await page.click('#applyRowDetail');

      // Verify first row
      await page.click('#tableBody tr:first-child .btn-detail');
      await expect(page.locator('#detailNoticeText')).toHaveValue('1行目の案内文');
      await page.click('#cancelRowDetail');

      // Verify second row
      await page.click('#tableBody tr:nth-child(2) .btn-detail');
      await expect(page.locator('#detailNoticeText')).toHaveValue('2行目の案内文');
    });

    test('modal shows correct row number for each row', async ({ page }) => {
      await page.click('#addRowBtn');
      await page.click('#addRowBtn');
      await page.click('#addRowBtn');

      // Check first row
      await page.click('#tableBody tr:first-child .btn-detail');
      await expect(page.locator('#detailRowNum')).toContainText('行 1');
      await page.click('#cancelRowDetail');

      // Check third row
      await page.click('#tableBody tr:nth-child(3) .btn-detail');
      await expect(page.locator('#detailRowNum')).toContainText('行 3');
    });
  });

  test.describe('CSV Output with Detail Fields', () => {
    test('detail fields are included in CSV', async ({ page }) => {
      await page.click('#addRowBtn');
      await page.waitForTimeout(200);

      const row = page.locator('#tableBody tr:first-child');

      // Fill required fields using native select
      await row.locator('.property-select').selectOption({ index: 1 });
      await page.waitForTimeout(200);

      await row.locator('.vendor-select').selectOption({ index: 1 });
      await page.waitForTimeout(200);

      await row.locator('.inspection-select').selectOption({ index: 1 });
      await page.waitForTimeout(200);

      // Add detail data
      await page.click('#tableBody tr:first-child .btn-detail');
      await page.fill('#detailNoticeText', 'CSV出力テスト案内文');
      await page.fill('#detailDisplayStartDate', '2025-02-01');
      await page.fill('#detailDisplayStartTime', '10:00');
      await page.fill('#detailDisplayEndDate', '2025-02-28');
      await page.fill('#detailDisplayEndTime', '17:00');
      await page.click('#applyRowDetail');

      // Wait for validation
      await page.waitForTimeout(500);

      // Verify detail data was saved
      await page.click('#tableBody tr:first-child .btn-detail');
      await expect(page.locator('#detailNoticeText')).toHaveValue('CSV出力テスト案内文');
      await expect(page.locator('#detailDisplayStartDate')).toHaveValue('2025-02-01');
    });
  });
});
