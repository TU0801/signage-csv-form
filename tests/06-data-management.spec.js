// @ts-check
const { test, expect } = require('@playwright/test');
const { setupAuthMock } = require('./test-helpers');

test.describe('Edit Entry Tests', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMock(page, '/', { isAuthenticated: true });
    // Add an entry first
    await page.selectOption('#property', '2010');
    await page.selectOption('#vendor', '0');
    await page.selectOption('#inspectionType', '0');
    await page.fill('#remarks', 'Original remarks');
    await page.click('button:has-text("データを追加")');
    await page.waitForTimeout(100);
  });

  test('edit button populates form with entry data', async ({ page }) => {
    await page.click('.data-item button:has-text("編集")');

    // Verify form is populated
    const propertyValue = await page.locator('#property').inputValue();
    expect(propertyValue).toBe('2010');

    const remarksValue = await page.locator('#remarks').inputValue();
    expect(remarksValue).toBe('Original remarks');
  });

  test('can update entry and save', async ({ page }) => {
    await page.click('.data-item button:has-text("編集")');
    await page.fill('#remarks', 'Updated remarks');
    await page.click('button:has-text("データを追加")');

    // Verify update toast
    await expect(page.locator('.toast.success')).toContainText('更新');

    // Verify data count is still 1
    await expect(page.locator('#dataCount')).toContainText('1');

    // Verify update was saved
    await page.click('.data-item button:has-text("編集")');
    const remarksValue = await page.locator('#remarks').inputValue();
    expect(remarksValue).toBe('Updated remarks');
  });

  test('editing sets correct terminal', async ({ page }) => {
    await page.click('.data-item button:has-text("編集")');
    const terminalValue = await page.locator('#terminal').inputValue();
    expect(terminalValue).toBe('h0001A00');
  });

  test('editing sets correct vendor', async ({ page }) => {
    await page.click('.data-item button:has-text("編集")');
    const emergencyContact = await page.locator('#emergencyContact').inputValue();
    expect(emergencyContact).toBe('092-934-0407');
  });
});

test.describe('Delete Entry Tests', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMock(page, '/', { isAuthenticated: true });
    // Add an entry
    await page.selectOption('#property', '2010');
    await page.selectOption('#vendor', '0');
    await page.selectOption('#inspectionType', '0');
    await page.click('button:has-text("データを追加")');
    await page.waitForTimeout(100);
  });

  test('delete button shows confirmation', async ({ page }) => {
    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain('削除');
      await dialog.dismiss();
    });
    await page.click('.data-item button:has-text("削除")');
  });

  test('confirming delete removes entry', async ({ page }) => {
    page.on('dialog', dialog => dialog.accept());
    await page.click('.data-item button:has-text("削除")');

    // Wait for delete
    await page.waitForTimeout(100);

    // Verify count is 0
    await expect(page.locator('#dataCount')).toContainText('0');
  });

  test('canceling delete keeps entry', async ({ page }) => {
    page.on('dialog', dialog => dialog.dismiss());
    await page.click('.data-item button:has-text("削除")');

    await page.waitForTimeout(100);

    // Verify count is still 1
    await expect(page.locator('#dataCount')).toContainText('1');
  });

  test('delete shows success toast', async ({ page }) => {
    page.on('dialog', dialog => dialog.accept());
    await page.click('.data-item button:has-text("削除")');
    await expect(page.locator('.toast')).toContainText('削除');
  });
});

test.describe('Clear Form Tests', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMock(page, '/', { isAuthenticated: true });
  });

  test('clear button resets form', async ({ page }) => {
    // Fill form
    await page.selectOption('#property', '2010');
    await page.selectOption('#vendor', '0');
    await page.fill('#remarks', 'Some remarks');

    // Clear - button text contains emoji
    await page.click('button:has-text("クリア")');

    // Verify form is cleared
    const propertyValue = await page.locator('#property').inputValue();
    expect(propertyValue).toBe('');

    const vendorValue = await page.locator('#vendor').inputValue();
    expect(vendorValue).toBe('');

    const remarksValue = await page.locator('#remarks').inputValue();
    expect(remarksValue).toBe('');
  });

  test('clear resets position to default', async ({ page }) => {
    await page.click('.position-cell[data-pos="3"]');
    await page.click('button:has-text("クリア")');

    const activeCell = page.locator('.position-cell.active');
    await expect(activeCell).toHaveAttribute('data-pos', '2');
  });

  test('clear resets poster type to template', async ({ page }) => {
    await page.click('input[name="posterType"][value="custom"]');
    await page.click('button:has-text("クリア")');

    const templateRadio = page.locator('input[name="posterType"][value="template"]');
    await expect(templateRadio).toBeChecked();
  });

  test('clear resets display time to 6', async ({ page }) => {
    await page.fill('#displayTime', '15');
    await page.click('button:has-text("クリア")');

    const displayTime = await page.locator('#displayTime').inputValue();
    expect(displayTime).toBe('6');
  });

  test('clear sets start date to today', async ({ page }) => {
    await page.fill('#startDate', '2024-01-01');
    await page.click('button:has-text("クリア")');

    const today = new Date().toISOString().split('T')[0];
    const startDate = await page.locator('#startDate').inputValue();
    expect(startDate).toBe(today);
  });
});
