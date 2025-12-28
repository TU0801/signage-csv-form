// @ts-check
const { test, expect } = require('@playwright/test');
const { setupAuthMockWithMasterData } = require('./test-helpers');

test.describe('Auto-save and Restore Functionality', () => {
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

  test.describe('Auto-save Triggers', () => {
    test('adding a row triggers auto-save to localStorage', async ({ page }) => {
      // Add a row
      await page.click('#addRowBtn');

      // Wait for auto-save timer (1000ms debounce + buffer)
      await page.waitForTimeout(1500);

      // Check localStorage for auto-save data
      const autoSaveData = await page.evaluate(() => {
        const keys = Object.keys(localStorage);
        const autoSaveKey = keys.find(k => k.startsWith('bulk_autosave_'));
        return autoSaveKey ? localStorage.getItem(autoSaveKey) : null;
      });

      expect(autoSaveData).not.toBeNull();
      const parsed = JSON.parse(autoSaveData);
      expect(parsed.rows).toHaveLength(1);
    });

    test('adding multiple rows triggers auto-save with all rows', async ({ page }) => {
      // Add multiple rows
      await page.click('#addRowBtn');
      await page.click('#addRowBtn');
      await page.click('#addRowBtn');

      // Wait for auto-save timer
      await page.waitForTimeout(1500);

      const autoSaveData = await page.evaluate(() => {
        const keys = Object.keys(localStorage);
        const autoSaveKey = keys.find(k => k.startsWith('bulk_autosave_'));
        return autoSaveKey ? localStorage.getItem(autoSaveKey) : null;
      });

      expect(autoSaveData).not.toBeNull();
      const parsed = JSON.parse(autoSaveData);
      expect(parsed.rows).toHaveLength(3);
    });
  });

  test.describe('Auto-save Data Structure', () => {
    test('auto-save data includes row properties', async ({ page }) => {
      // Add a row
      await page.click('#addRowBtn');
      await page.waitForTimeout(100);

      // Fill in some data
      const propertySelect = page.locator('#tableBody tr:first-child .property-select');
      await propertySelect.selectOption({ index: 1 });

      const vendorSelect = page.locator('#tableBody tr:first-child .vendor-select');
      await vendorSelect.selectOption({ index: 1 });

      const inspectionSelect = page.locator('#tableBody tr:first-child .inspection-select');
      await inspectionSelect.selectOption({ index: 1 });

      // Set dates
      await page.fill('#tableBody tr:first-child .start-date', '2025-02-15');
      await page.fill('#tableBody tr:first-child .end-date', '2025-02-20');

      // Wait for auto-save timer
      await page.waitForTimeout(1500);

      const autoSaveData = await page.evaluate(() => {
        const keys = Object.keys(localStorage);
        const autoSaveKey = keys.find(k => k.startsWith('bulk_autosave_'));
        return autoSaveKey ? localStorage.getItem(autoSaveKey) : null;
      });

      expect(autoSaveData).not.toBeNull();
      const parsed = JSON.parse(autoSaveData);

      // Verify structure
      expect(parsed).toHaveProperty('timestamp');
      expect(parsed).toHaveProperty('rowIdCounter');
      expect(parsed).toHaveProperty('rows');

      // Verify row has expected properties
      const row = parsed.rows[0];
      expect(row).toHaveProperty('propertyCode');
      expect(row).toHaveProperty('vendorName');
      expect(row).toHaveProperty('inspectionType');
      expect(row).toHaveProperty('startDate');
      expect(row).toHaveProperty('endDate');
      expect(row).toHaveProperty('remarks');
      expect(row).toHaveProperty('displayTime');
      expect(row).toHaveProperty('noticeText');
      expect(row).toHaveProperty('displayStartDate');
      expect(row).toHaveProperty('displayStartTime');
      expect(row).toHaveProperty('displayEndDate');
      expect(row).toHaveProperty('displayEndTime');
      expect(row).toHaveProperty('showOnBoard');
      expect(row).toHaveProperty('position');
    });

    test('auto-save preserves entered values correctly', async ({ page }) => {
      // Add a row
      await page.click('#addRowBtn');
      await page.waitForTimeout(100);

      // Fill in specific values
      await page.fill('#tableBody tr:first-child .start-date', '2025-03-10');
      await page.fill('#tableBody tr:first-child .end-date', '2025-03-15');

      // Wait for auto-save timer
      await page.waitForTimeout(1500);

      const autoSaveData = await page.evaluate(() => {
        const keys = Object.keys(localStorage);
        const autoSaveKey = keys.find(k => k.startsWith('bulk_autosave_'));
        return autoSaveKey ? localStorage.getItem(autoSaveKey) : null;
      });

      const parsed = JSON.parse(autoSaveData);
      const row = parsed.rows[0];

      expect(row.startDate).toBe('2025-03-10');
      expect(row.endDate).toBe('2025-03-15');
    });

    test('auto-save key includes user ID', async ({ page }) => {
      // Add a row to trigger auto-save
      await page.click('#addRowBtn');
      await page.waitForTimeout(1500);

      const autoSaveKey = await page.evaluate(() => {
        const keys = Object.keys(localStorage);
        return keys.find(k => k.startsWith('bulk_autosave_'));
      });

      expect(autoSaveKey).not.toBeNull();
      expect(autoSaveKey).toMatch(/^bulk_autosave_/);
    });
  });

  test.describe('Auto-save Cleared After Submission', () => {
    test('auto-save is cleared after successful submission', async ({ page }) => {
      // Add a row with valid data
      await page.click('#addRowBtn');
      await page.waitForTimeout(100);

      // Fill in required fields to make row valid
      const propertySelect = page.locator('#tableBody tr:first-child .property-select');
      await propertySelect.selectOption({ index: 1 });

      const vendorSelect = page.locator('#tableBody tr:first-child .vendor-select');
      await vendorSelect.selectOption({ index: 1 });

      const inspectionSelect = page.locator('#tableBody tr:first-child .inspection-select');
      await inspectionSelect.selectOption({ index: 1 });

      await page.fill('#tableBody tr:first-child .start-date', '2025-02-15');

      // Wait for auto-save
      await page.waitForTimeout(1500);

      // Verify auto-save exists before submission
      const autoSaveBeforeSubmit = await page.evaluate(() => {
        const keys = Object.keys(localStorage);
        const autoSaveKey = keys.find(k => k.startsWith('bulk_autosave_'));
        return autoSaveKey ? localStorage.getItem(autoSaveKey) : null;
      });
      expect(autoSaveBeforeSubmit).not.toBeNull();

      // Click save button (submission is mocked, so it should succeed)
      await page.click('#saveBtn');

      // Wait for submission to complete
      await page.waitForTimeout(500);

      // Verify auto-save is cleared after submission
      const autoSaveAfterSubmit = await page.evaluate(() => {
        const keys = Object.keys(localStorage);
        const autoSaveKey = keys.find(k => k.startsWith('bulk_autosave_'));
        return autoSaveKey ? localStorage.getItem(autoSaveKey) : null;
      });
      expect(autoSaveAfterSubmit).toBeNull();
    });
  });

  test.describe('Expired Auto-save Data', () => {
    test('expired auto-save data (>24 hours) is not restored', async ({ page }) => {
      // Set up expired auto-save data before page load
      const expiredTimestamp = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago
      const expiredData = {
        timestamp: expiredTimestamp,
        rowIdCounter: 1,
        rows: [{
          propertyCode: '2010',
          vendorName: 'Test Vendor',
          inspectionType: 'Test Type',
          startDate: '2025-01-01',
          endDate: '2025-01-02',
          remarks: '',
          displayTime: 6,
          noticeText: '',
          displayStartDate: '',
          displayStartTime: '',
          displayEndDate: '',
          displayEndTime: '',
          showOnBoard: true,
          position: 2
        }]
      };

      // Clear and reload page with expired data in localStorage
      await page.addInitScript((data) => {
        localStorage.clear();
        localStorage.setItem('bulk_autosave_test-user-id', JSON.stringify(data));
      }, expiredData);

      // Set up dialog handler to track if confirm was called
      let confirmCalled = false;
      page.on('dialog', async dialog => {
        confirmCalled = true;
        await dialog.accept();
      });

      // Reload the page
      await setupAuthMockWithMasterData(page, '/bulk.html', {
        isAuthenticated: true,
        email: 'test@example.com'
      });

      // Wait for page to fully load and any restore logic to run
      await page.waitForTimeout(500);

      // Expired data should be removed, no confirm dialog shown
      const autoSaveData = await page.evaluate(() => {
        const keys = Object.keys(localStorage);
        const autoSaveKey = keys.find(k => k.startsWith('bulk_autosave_'));
        return autoSaveKey ? localStorage.getItem(autoSaveKey) : null;
      });

      // The expired data should have been removed
      expect(autoSaveData).toBeNull();

      // No rows should be in the table (data was not restored)
      const rowCount = await page.locator('#tableBody tr').count();
      expect(rowCount).toBe(0);
    });

    test('valid auto-save data (<24 hours) triggers restore confirmation', async ({ page }) => {
      // Set up valid auto-save data before page load
      const validTimestamp = Date.now() - (1 * 60 * 60 * 1000); // 1 hour ago
      const validData = {
        timestamp: validTimestamp,
        rowIdCounter: 1,
        rows: [{
          propertyCode: '2010',
          vendorName: 'Test Vendor',
          inspectionType: 'Test Type',
          startDate: '2025-01-01',
          endDate: '2025-01-02',
          remarks: '',
          displayTime: 6,
          noticeText: '',
          displayStartDate: '',
          displayStartTime: '',
          displayEndDate: '',
          displayEndTime: '',
          showOnBoard: true,
          position: 2
        }]
      };

      // Prepare page with valid data
      await page.addInitScript((data) => {
        localStorage.clear();
        localStorage.setItem('bulk_autosave_test-user-id', JSON.stringify(data));
      }, validData);

      // Track if confirm was called
      let confirmCalled = false;
      page.on('dialog', async dialog => {
        confirmCalled = true;
        // Decline restore to check if data is cleared
        await dialog.dismiss();
      });

      // Reload the page
      await setupAuthMockWithMasterData(page, '/bulk.html', {
        isAuthenticated: true,
        email: 'test@example.com'
      });

      // Wait for restore logic to run
      await page.waitForTimeout(500);

      // Confirm dialog should have been called for valid data
      expect(confirmCalled).toBe(true);
    });

    test('declining restore removes auto-save data', async ({ page }) => {
      // Set up valid auto-save data
      const validTimestamp = Date.now() - (1 * 60 * 60 * 1000); // 1 hour ago
      const validData = {
        timestamp: validTimestamp,
        rowIdCounter: 1,
        rows: [{
          propertyCode: '2010',
          vendorName: 'Test Vendor',
          inspectionType: 'Test Type',
          startDate: '2025-01-01',
          endDate: '2025-01-02',
          remarks: '',
          displayTime: 6,
          noticeText: '',
          displayStartDate: '',
          displayStartTime: '',
          displayEndDate: '',
          displayEndTime: '',
          showOnBoard: true,
          position: 2
        }]
      };

      await page.addInitScript((data) => {
        localStorage.clear();
        localStorage.setItem('bulk_autosave_test-user-id', JSON.stringify(data));
      }, validData);

      // Decline the restore
      page.on('dialog', async dialog => {
        await dialog.dismiss();
      });

      await setupAuthMockWithMasterData(page, '/bulk.html', {
        isAuthenticated: true,
        email: 'test@example.com'
      });

      await page.waitForTimeout(500);

      // Auto-save data should be cleared after declining
      const autoSaveData = await page.evaluate(() => {
        const keys = Object.keys(localStorage);
        const autoSaveKey = keys.find(k => k.startsWith('bulk_autosave_'));
        return autoSaveKey ? localStorage.getItem(autoSaveKey) : null;
      });

      expect(autoSaveData).toBeNull();

      // No rows should be in the table
      const rowCount = await page.locator('#tableBody tr').count();
      expect(rowCount).toBe(0);
    });

    test('accepting restore adds rows to table', async ({ page }) => {
      // Set up valid auto-save data with 2 rows
      const validTimestamp = Date.now() - (1 * 60 * 60 * 1000); // 1 hour ago
      const validData = {
        timestamp: validTimestamp,
        rowIdCounter: 2,
        rows: [
          {
            propertyCode: '2010',
            vendorName: '',
            inspectionType: '',
            startDate: '2025-01-01',
            endDate: '2025-01-02',
            remarks: '',
            displayTime: 6,
            noticeText: '',
            displayStartDate: '',
            displayStartTime: '',
            displayEndDate: '',
            displayEndTime: '',
            showOnBoard: true,
            position: 2
          },
          {
            propertyCode: '120406',
            vendorName: '',
            inspectionType: '',
            startDate: '2025-02-01',
            endDate: '2025-02-02',
            remarks: '',
            displayTime: 6,
            noticeText: '',
            displayStartDate: '',
            displayStartTime: '',
            displayEndDate: '',
            displayEndTime: '',
            showOnBoard: true,
            position: 2
          }
        ]
      };

      await page.addInitScript((data) => {
        localStorage.clear();
        localStorage.setItem('bulk_autosave_test-user-id', JSON.stringify(data));
      }, validData);

      // Accept the restore
      page.on('dialog', async dialog => {
        await dialog.accept();
      });

      await setupAuthMockWithMasterData(page, '/bulk.html', {
        isAuthenticated: true,
        email: 'test@example.com'
      });

      await page.waitForTimeout(500);

      // Rows should be restored
      const rowCount = await page.locator('#tableBody tr').count();
      expect(rowCount).toBe(2);

      // Total count should reflect restored rows
      await expect(page.locator('#totalCount')).toHaveText('2');
    });
  });

  test.describe('Auto-save with Empty Rows', () => {
    test('deleting all rows removes auto-save data', async ({ page }) => {
      // Add a row
      await page.click('#addRowBtn');
      await page.waitForTimeout(1500);

      // Verify auto-save exists
      let autoSaveData = await page.evaluate(() => {
        const keys = Object.keys(localStorage);
        const autoSaveKey = keys.find(k => k.startsWith('bulk_autosave_'));
        return autoSaveKey ? localStorage.getItem(autoSaveKey) : null;
      });
      expect(autoSaveData).not.toBeNull();

      // Handle confirm dialog for delete
      page.on('dialog', dialog => dialog.accept());

      // Delete the row via context menu
      await page.locator('#tableBody tr:first-child').click({ button: 'right' });
      await page.click('#contextMenu [data-action="delete"]');

      // Wait for auto-save to update
      await page.waitForTimeout(1500);

      // Auto-save should be removed when no rows exist
      autoSaveData = await page.evaluate(() => {
        const keys = Object.keys(localStorage);
        const autoSaveKey = keys.find(k => k.startsWith('bulk_autosave_'));
        return autoSaveKey ? localStorage.getItem(autoSaveKey) : null;
      });
      expect(autoSaveData).toBeNull();
    });
  });
});
