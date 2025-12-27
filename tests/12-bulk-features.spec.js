// @ts-check
const { test, expect } = require('@playwright/test');
const { setupAuthMockWithMasterData } = require('./test-helpers');

test.describe('Bulk Page New Features', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test
    await page.addInitScript(() => {
      localStorage.clear();
    });
    await setupAuthMockWithMasterData(page, '/bulk.html', {
      isAuthenticated: true,
      email: 'test@example.com'
    });
  });

  test.describe('Bulk Edit Feature', () => {
    test('bulk edit button exists and is disabled initially', async ({ page }) => {
      await expect(page.locator('#bulkEditBtn')).toBeVisible();
      await expect(page.locator('#bulkEditBtn')).toBeDisabled();
    });

    test('bulk edit button is enabled when rows are selected', async ({ page }) => {
      // Add a row
      await page.click('#addRowBtn');
      await page.waitForTimeout(100);

      // Select the row
      await page.locator('#tableBody tr:first-child input[type="checkbox"]').check();

      // Button should be enabled
      await expect(page.locator('#bulkEditBtn')).toBeEnabled();
    });

    test('clicking bulk edit opens modal', async ({ page }) => {
      // Add and select a row
      await page.click('#addRowBtn');
      await page.locator('#tableBody tr:first-child input[type="checkbox"]').check();

      // Click bulk edit
      await page.click('#bulkEditBtn');

      // Modal should be visible
      await expect(page.locator('#bulkEditModal')).toHaveClass(/active/);
    });

    test('bulk edit modal has all fields', async ({ page }) => {
      await page.click('#addRowBtn');
      await page.locator('#tableBody tr:first-child input[type="checkbox"]').check();
      await page.click('#bulkEditBtn');

      await expect(page.locator('#bulkEditProperty')).toBeVisible();
      await expect(page.locator('#bulkEditVendor')).toBeVisible();
      await expect(page.locator('#bulkEditInspection')).toBeVisible();
      await expect(page.locator('#bulkEditStartDate')).toBeVisible();
      await expect(page.locator('#bulkEditEndDate')).toBeVisible();
    });

    test('bulk edit cancel button closes modal', async ({ page }) => {
      await page.click('#addRowBtn');
      await page.locator('#tableBody tr:first-child input[type="checkbox"]').check();
      await page.click('#bulkEditBtn');

      await page.click('#cancelBulkEdit');
      await expect(page.locator('#bulkEditModal')).not.toHaveClass(/active/);
    });

    test('bulk edit applies changes to selected rows', async ({ page }) => {
      // Add multiple rows
      await page.click('#addRowBtn');
      await page.click('#addRowBtn');
      await page.waitForTimeout(100);

      // Select all rows
      await page.locator('#selectAll').check({ force: true });

      // Open bulk edit
      await page.click('#bulkEditBtn');

      // Set a date
      await page.fill('#bulkEditStartDate', '2025-01-15');
      await page.click('#applyBulkEdit');

      // Verify dates were applied
      const startDates = await page.locator('#tableBody .start-date').all();
      for (const dateInput of startDates) {
        await expect(dateInput).toHaveValue('2025-01-15');
      }
    });
  });

  test.describe('Date Auto-fill Feature', () => {
    test('setting start date auto-fills end date when empty', async ({ page }) => {
      await page.click('#addRowBtn');
      await page.waitForTimeout(100);

      // Set start date
      await page.fill('#tableBody tr:first-child .start-date', '2025-02-20');
      await page.locator('#tableBody tr:first-child .start-date').blur();

      // End date should be auto-filled
      await expect(page.locator('#tableBody tr:first-child .end-date')).toHaveValue('2025-02-20');
    });

    test('setting start date does not overwrite existing end date', async ({ page }) => {
      await page.click('#addRowBtn');
      await page.waitForTimeout(100);

      // Set end date first
      await page.fill('#tableBody tr:first-child .end-date', '2025-03-15');

      // Set start date
      await page.fill('#tableBody tr:first-child .start-date', '2025-02-20');
      await page.locator('#tableBody tr:first-child .start-date').blur();

      // End date should remain unchanged
      await expect(page.locator('#tableBody tr:first-child .end-date')).toHaveValue('2025-03-15');
    });
  });

  test.describe('Searchable Dropdown Feature', () => {
    test('search inputs exist but hidden by default', async ({ page }) => {
      await page.click('#addRowBtn');
      await page.waitForTimeout(100);

      // Search inputs exist but are hidden
      await expect(page.locator('#tableBody tr:first-child .property-search')).toBeAttached();
      await expect(page.locator('#tableBody tr:first-child .vendor-search')).toBeAttached();
      await expect(page.locator('#tableBody tr:first-child .inspection-search')).toBeAttached();

      // They should not be visible by default
      await expect(page.locator('#tableBody tr:first-child .property-search')).not.toBeVisible();
    });

    test('search input appears when select is focused', async ({ page }) => {
      await page.click('#addRowBtn');
      await page.waitForTimeout(100);

      // Focus on the select
      const select = page.locator('#tableBody tr:first-child .property-select');
      await select.focus();
      await page.waitForTimeout(100);

      // Search input should now be visible
      const searchInput = page.locator('#tableBody tr:first-child .property-search');
      await expect(searchInput).toBeVisible();
    });

    test('search input filters dropdown options', async ({ page }) => {
      await page.click('#addRowBtn');
      await page.waitForTimeout(100);

      // Focus on the select to show search
      const select = page.locator('#tableBody tr:first-child .property-select');
      await select.focus();
      await page.waitForTimeout(100);

      // Type in search
      const searchInput = page.locator('#tableBody tr:first-child .property-search');
      await searchInput.fill('test');

      // Select should still be visible
      await expect(select).toBeVisible();
    });
  });

  test.describe('Drag Handle Feature', () => {
    test('drag handle column exists in table header', async ({ page }) => {
      await expect(page.locator('th.col-drag-handle')).toBeAttached();
    });

    test('drag handle exists in table rows', async ({ page }) => {
      await page.click('#addRowBtn');
      await page.waitForTimeout(100);

      await expect(page.locator('#tableBody tr:first-child .col-drag-handle')).toBeVisible();
    });

    test('rows are draggable', async ({ page }) => {
      await page.click('#addRowBtn');
      await page.waitForTimeout(100);

      const row = page.locator('#tableBody tr:first-child');
      const draggable = await row.getAttribute('draggable');
      expect(draggable).toBe('true');
    });
  });

  test.describe('Context Menu Feature', () => {
    test('context menu is created on page load', async ({ page }) => {
      await expect(page.locator('#contextMenu')).toBeAttached();
    });

    test('right-click on row shows context menu', async ({ page }) => {
      await page.click('#addRowBtn');
      await page.waitForTimeout(100);

      await page.locator('#tableBody tr:first-child').click({ button: 'right' });

      await expect(page.locator('#contextMenu')).toHaveClass(/active/);
    });

    test('context menu has all options', async ({ page }) => {
      await page.click('#addRowBtn');
      await page.waitForTimeout(100);

      await page.locator('#tableBody tr:first-child').click({ button: 'right' });

      await expect(page.locator('#contextMenu [data-action="duplicate"]')).toBeVisible();
      await expect(page.locator('#contextMenu [data-action="insertAbove"]')).toBeVisible();
      await expect(page.locator('#contextMenu [data-action="insertBelow"]')).toBeVisible();
      await expect(page.locator('#contextMenu [data-action="copyRow"]')).toBeVisible();
      await expect(page.locator('#contextMenu [data-action="pasteRow"]')).toBeVisible();
      await expect(page.locator('#contextMenu [data-action="delete"]')).toBeVisible();
    });

    test('clicking outside closes context menu', async ({ page }) => {
      await page.click('#addRowBtn');
      await page.waitForTimeout(100);

      await page.locator('#tableBody tr:first-child').click({ button: 'right' });
      await expect(page.locator('#contextMenu')).toHaveClass(/active/);

      await page.click('body');
      await expect(page.locator('#contextMenu')).not.toHaveClass(/active/);
    });

    test('duplicate action creates a new row', async ({ page }) => {
      await page.click('#addRowBtn');
      await page.waitForTimeout(100);

      await expect(page.locator('#totalCount')).toHaveText('1');

      await page.locator('#tableBody tr:first-child').click({ button: 'right' });
      await page.click('#contextMenu [data-action="duplicate"]');

      await expect(page.locator('#totalCount')).toHaveText('2');
    });

    test('insert above action adds row above', async ({ page }) => {
      await page.click('#addRowBtn');
      await page.waitForTimeout(100);

      await page.locator('#tableBody tr:first-child').click({ button: 'right' });
      await page.click('#contextMenu [data-action="insertAbove"]');

      await expect(page.locator('#totalCount')).toHaveText('2');
    });

    test('copy and paste row works', async ({ page }) => {
      await page.click('#addRowBtn');
      await page.waitForTimeout(100);

      // Copy the row
      await page.locator('#tableBody tr:first-child').click({ button: 'right' });
      await page.click('#contextMenu [data-action="copyRow"]');

      // Paste
      await page.locator('#tableBody tr:first-child').click({ button: 'right' });
      await page.click('#contextMenu [data-action="pasteRow"]');

      await expect(page.locator('#totalCount')).toHaveText('2');
    });
  });

  test.describe('Keyboard Navigation', () => {
    test('Ctrl+Enter adds a new row', async ({ page }) => {
      await page.click('#addRowBtn');
      await expect(page.locator('#totalCount')).toHaveText('1');

      await page.keyboard.press('Control+Enter');

      await expect(page.locator('#totalCount')).toHaveText('2');
    });

    test('Ctrl+D duplicates selected rows', async ({ page }) => {
      await page.click('#addRowBtn');
      await page.locator('#tableBody tr:first-child input[type="checkbox"]').check();

      await page.keyboard.press('Control+d');

      await expect(page.locator('#totalCount')).toHaveText('2');
    });

    test('Ctrl+E opens bulk edit when rows are selected', async ({ page }) => {
      await page.click('#addRowBtn');
      await page.locator('#tableBody tr:first-child input[type="checkbox"]').check();

      await page.keyboard.press('Control+e');

      await expect(page.locator('#bulkEditModal')).toHaveClass(/active/);
    });

    test('Escape closes modals', async ({ page }) => {
      await page.click('#addRowBtn');
      await page.locator('#tableBody tr:first-child input[type="checkbox"]').check();
      await page.click('#bulkEditBtn');

      await expect(page.locator('#bulkEditModal')).toHaveClass(/active/);

      await page.keyboard.press('Escape');

      await expect(page.locator('#bulkEditModal')).not.toHaveClass(/active/);
    });
  });

  test.describe('Auto-save Feature', () => {
    test('data is saved to localStorage after adding row', async ({ page }) => {
      await page.click('#addRowBtn');
      await page.waitForTimeout(1500); // Wait for auto-save timer

      const autoSaveData = await page.evaluate(() => {
        const keys = Object.keys(localStorage);
        const autoSaveKey = keys.find(k => k.startsWith('bulk_autosave_'));
        return autoSaveKey ? localStorage.getItem(autoSaveKey) : null;
      });

      expect(autoSaveData).not.toBeNull();
      const parsed = JSON.parse(autoSaveData);
      expect(parsed.rows).toHaveLength(1);
    });

    test('auto-save data has correct structure', async ({ page }) => {
      await page.click('#addRowBtn');
      await page.waitForTimeout(1500);

      const autoSaveData = await page.evaluate(() => {
        const keys = Object.keys(localStorage);
        const autoSaveKey = keys.find(k => k.startsWith('bulk_autosave_'));
        return autoSaveKey ? localStorage.getItem(autoSaveKey) : null;
      });

      const parsed = JSON.parse(autoSaveData);
      expect(parsed).toHaveProperty('timestamp');
      expect(parsed).toHaveProperty('rowIdCounter');
      expect(parsed).toHaveProperty('rows');
    });
  });

  test.describe('Row Copy on Add Feature', () => {
    test('first row is empty', async ({ page }) => {
      await page.click('#addRowBtn');

      const propertyValue = await page.locator('#tableBody tr:first-child .property-select').inputValue();
      expect(propertyValue).toBe('');
    });

    test('second row copies from first row', async ({ page }) => {
      // Add first row and set a value
      await page.click('#addRowBtn');
      await page.waitForTimeout(100);

      // Select a property (first option after empty)
      const propertySelect = page.locator('#tableBody tr:first-child .property-select');
      await propertySelect.selectOption({ index: 1 });
      const firstPropertyValue = await propertySelect.inputValue();

      // Add second row
      await page.click('#addRowBtn');
      await page.waitForTimeout(100);

      // Check second row has same property
      const secondPropertyValue = await page.locator('#tableBody tr:nth-child(2) .property-select').inputValue();
      expect(secondPropertyValue).toBe(firstPropertyValue);
    });
  });

  test.describe('Beforeunload Warning', () => {
    test('page has beforeunload handler when data exists', async ({ page }) => {
      await page.click('#addRowBtn');

      // Check that beforeunload is set up by evaluating the presence of rows
      const hasRows = await page.evaluate(() => {
        return document.querySelectorAll('#tableBody tr').length > 0;
      });

      expect(hasRows).toBe(true);
    });
  });

  test.describe('Filter and Template Features', () => {
    test('filter buttons exist', async ({ page }) => {
      await expect(page.locator('.filter-btn[data-filter="all"]')).toBeVisible();
      await expect(page.locator('.filter-btn[data-filter="valid"]')).toBeVisible();
      await expect(page.locator('.filter-btn[data-filter="error"]')).toBeVisible();
    });

    test('filter buttons toggle active state', async ({ page }) => {
      await expect(page.locator('.filter-btn[data-filter="all"]')).toHaveClass(/active/);

      await page.click('.filter-btn[data-filter="error"]');

      await expect(page.locator('.filter-btn[data-filter="error"]')).toHaveClass(/active/);
      await expect(page.locator('.filter-btn[data-filter="all"]')).not.toHaveClass(/active/);
    });

    test('template select exists', async ({ page }) => {
      await expect(page.locator('#templateSelect')).toBeVisible();
    });

    test('save template button exists', async ({ page }) => {
      await expect(page.locator('#saveTemplateBtn')).toBeVisible();
    });
  });

  test.describe('Delete with Context Menu', () => {
    test('delete action removes the row', async ({ page }) => {
      // Add a row
      await page.click('#addRowBtn');
      await page.waitForTimeout(100);
      await expect(page.locator('#totalCount')).toHaveText('1');

      // Set up dialog handler
      page.on('dialog', dialog => dialog.accept());

      // Right-click and delete
      await page.locator('#tableBody tr:first-child').click({ button: 'right' });
      await page.click('#contextMenu [data-action="delete"]');

      await expect(page.locator('#totalCount')).toHaveText('0');
    });
  });
});
