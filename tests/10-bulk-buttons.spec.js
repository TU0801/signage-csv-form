// @ts-check
const { test, expect } = require('@playwright/test');
const { setupAuthMockWithMasterData } = require('./test-helpers');

test.describe('Bulk Page Button Tests', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMockWithMasterData(page, '/bulk.html', {
      isAuthenticated: true,
      email: 'test@example.com'
    });
  });

  test.describe('Logout Button', () => {
    test('logout button is visible', async ({ page }) => {
      await expect(page.locator('#logoutBtn')).toBeVisible();
    });

    test('logout button has correct text', async ({ page }) => {
      await expect(page.locator('#logoutBtn')).toHaveText('ログアウト');
    });
  });

  test.describe('Add Row Button', () => {
    test('add row button is visible', async ({ page }) => {
      await expect(page.locator('#addRowBtn')).toBeVisible();
    });

    test('add row button has correct text', async ({ page }) => {
      await expect(page.locator('#addRowBtn')).toContainText('行追加');
    });

    test('clicking add row button adds a new row', async ({ page }) => {
      await page.click('#addRowBtn');

      // Empty state should disappear
      await expect(page.locator('#emptyState')).not.toBeVisible();

      // Table should have a row
      const rows = await page.locator('#tableBody tr').count();
      expect(rows).toBe(1);

      // Total count should update
      await expect(page.locator('#totalCount')).toHaveText('1');
    });

    test('clicking add row multiple times adds multiple rows', async ({ page }) => {
      await page.click('#addRowBtn');
      await page.click('#addRowBtn');
      await page.click('#addRowBtn');

      const rows = await page.locator('#tableBody tr').count();
      expect(rows).toBe(3);
      await expect(page.locator('#totalCount')).toHaveText('3');
    });
  });

  test.describe('Delete Selected Button', () => {
    test('delete selected button is visible', async ({ page }) => {
      await expect(page.locator('#deleteSelectedBtn')).toBeVisible();
    });

    test('delete selected button is disabled initially', async ({ page }) => {
      await expect(page.locator('#deleteSelectedBtn')).toBeDisabled();
    });

    test('delete selected button is enabled when rows are selected', async ({ page }) => {
      // Add a row first
      await page.click('#addRowBtn');

      // Select the row
      await page.locator('#tableBody tr:first-child input[type="checkbox"]').check();

      // Button should be enabled
      await expect(page.locator('#deleteSelectedBtn')).toBeEnabled();
    });

    test('clicking delete selected removes selected rows', async ({ page }) => {
      // Add multiple rows
      await page.click('#addRowBtn');
      await page.click('#addRowBtn');
      await page.click('#addRowBtn');

      // Wait for rows to be added
      await page.waitForTimeout(100);

      // Verify 3 rows exist
      await expect(page.locator('#totalCount')).toHaveText('3');

      // Select first row
      await page.locator('#tableBody tr:first-child input[type="checkbox"]').check();

      // Wait for selection to register
      await page.waitForTimeout(100);

      // Handle confirm dialog
      page.on('dialog', dialog => dialog.accept());

      // Delete
      await page.click('#deleteSelectedBtn');

      // Wait for deletion
      await page.waitForTimeout(200);

      // Should have 2 rows left
      await expect(page.locator('#totalCount')).toHaveText('2');
    });
  });

  test.describe('Select All Checkbox', () => {
    test('select all checkbox exists in table header', async ({ page }) => {
      // The checkbox is in the table header, should exist even if hidden
      await expect(page.locator('#selectAll')).toBeAttached();
    });

    test('select all selects all rows', async ({ page }) => {
      // Add multiple rows
      await page.click('#addRowBtn');
      await page.click('#addRowBtn');

      // Wait for rows to be added
      await page.waitForTimeout(100);

      // Select all
      await page.locator('#selectAll').check({ force: true });

      // All checkboxes should be checked
      const checkboxes = page.locator('#tableBody input[type="checkbox"]');
      const count = await checkboxes.count();
      for (let i = 0; i < count; i++) {
        await expect(checkboxes.nth(i)).toBeChecked();
      }
    });
  });

  test.describe('Paste from Excel Button', () => {
    test('paste button is visible', async ({ page }) => {
      await expect(page.locator('#pasteBtn')).toBeVisible();
    });

    test('paste button has correct text', async ({ page }) => {
      await expect(page.locator('#pasteBtn')).toContainText('Excelから貼り付け');
    });

    test('clicking paste button opens paste modal', async ({ page }) => {
      await page.click('#pasteBtn');
      await expect(page.locator('#pasteModal')).toBeVisible();
    });
  });

  test.describe('Paste Modal Buttons', () => {
    test.beforeEach(async ({ page }) => {
      await page.click('#pasteBtn');
    });

    test('close modal button is visible', async ({ page }) => {
      await expect(page.locator('#closePasteModal')).toBeVisible();
    });

    test('close button closes the modal', async ({ page }) => {
      await page.click('#closePasteModal');
      await expect(page.locator('#pasteModal')).not.toBeVisible();
    });

    test('cancel button is visible', async ({ page }) => {
      await expect(page.locator('#cancelPasteBtn')).toBeVisible();
    });

    test('cancel button closes the modal', async ({ page }) => {
      await page.click('#cancelPasteBtn');
      await expect(page.locator('#pasteModal')).not.toBeVisible();
    });

    test('import button is visible', async ({ page }) => {
      await expect(page.locator('#importPasteBtn')).toBeVisible();
    });

    test('import button has correct text', async ({ page }) => {
      await expect(page.locator('#importPasteBtn')).toHaveText('インポート');
    });

    test('paste textarea is visible', async ({ page }) => {
      await expect(page.locator('#pasteArea')).toBeVisible();
    });
  });

  test.describe('Save Button', () => {
    test('save button is visible', async ({ page }) => {
      await expect(page.locator('#saveBtn')).toBeVisible();
    });

    test('save button is disabled when no data', async ({ page }) => {
      await expect(page.locator('#saveBtn')).toBeDisabled();
    });

    test('save button has correct text', async ({ page }) => {
      await expect(page.locator('#saveBtn')).toContainText('一括保存');
    });
  });

  test.describe('CSV Download Button', () => {
    test('download csv button is visible', async ({ page }) => {
      await expect(page.locator('#downloadCsvBtn')).toBeVisible();
    });

    test('download csv button is disabled when no data', async ({ page }) => {
      await expect(page.locator('#downloadCsvBtn')).toBeDisabled();
    });

    test('download csv button has correct text', async ({ page }) => {
      await expect(page.locator('#downloadCsvBtn')).toContainText('CSVダウンロード');
    });
  });

  test.describe('CSV Copy Button', () => {
    test('copy csv button is visible', async ({ page }) => {
      await expect(page.locator('#copyCsvBtn')).toBeVisible();
    });

    test('copy csv button is disabled when no data', async ({ page }) => {
      await expect(page.locator('#copyCsvBtn')).toBeDisabled();
    });

    test('copy csv button has correct text', async ({ page }) => {
      await expect(page.locator('#copyCsvBtn')).toContainText('CSVコピー');
    });
  });

  test.describe('Authentication Required', () => {
    test('redirects to login when not authenticated', async ({ page }) => {
      await setupAuthMockWithMasterData(page, '/bulk.html', { isAuthenticated: false });
      await page.waitForURL(/login\.html/);
      expect(page.url()).toContain('login.html');
    });
  });
});
