// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Form Submission Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('cannot submit without required fields', async ({ page }) => {
    await page.click('button:has-text("データを追加")');
    await expect(page.locator('.toast.error')).toBeVisible();
  });

  test('can add entry with all required fields', async ({ page }) => {
    // Fill required fields
    await page.selectOption('#property', '2010');
    await page.selectOption('#vendor', '0');
    await page.selectOption('#inspectionType', '0');

    // Submit
    await page.click('button:has-text("データを追加")');

    // Check success toast
    await expect(page.locator('.toast.success')).toBeVisible();

    // Check data count increased
    await expect(page.locator('#dataCount')).toContainText('1');
  });

  test('data item appears in list after adding', async ({ page }) => {
    await page.selectOption('#property', '2010');
    await page.selectOption('#vendor', '0');
    await page.selectOption('#inspectionType', '0');
    await page.click('button:has-text("データを追加")');

    // Check data item is visible
    await expect(page.locator('.data-item')).toBeVisible();
  });

  test('can add multiple entries', async ({ page }) => {
    // Add first entry
    await page.selectOption('#property', '2010');
    await page.selectOption('#vendor', '0');
    await page.selectOption('#inspectionType', '0');
    await page.click('button:has-text("データを追加")');

    // Add second entry
    await page.selectOption('#property', '120406');
    await page.selectOption('#vendor', '1');
    await page.selectOption('#inspectionType', '1');
    await page.click('button:has-text("データを追加")');

    // Check data count
    await expect(page.locator('#dataCount')).toContainText('2');
  });

  test('remarks field is included in entry', async ({ page }) => {
    await page.selectOption('#property', '2010');
    await page.selectOption('#vendor', '0');
    await page.selectOption('#inspectionType', '0');
    await page.fill('#remarks', '10:00〜12:00');
    await page.click('button:has-text("データを追加")');

    await expect(page.locator('.toast.success')).toBeVisible();
  });

  test('custom notice text is preserved', async ({ page }) => {
    await page.selectOption('#property', '2010');
    await page.selectOption('#vendor', '0');
    await page.selectOption('#inspectionType', '0');

    const customText = 'カスタム案内文テスト';
    await page.fill('#noticeText', customText);
    await page.click('button:has-text("データを追加")');

    // Edit the entry to verify
    await page.click('.data-item button:has-text("編集")');
    const noticeTextValue = await page.locator('#noticeText').inputValue();
    expect(noticeTextValue).toBe(customText);
  });

  test('display time is included in entry', async ({ page }) => {
    await page.selectOption('#property', '2010');
    await page.selectOption('#vendor', '0');
    await page.selectOption('#inspectionType', '0');
    await page.fill('#displayTime', '10');
    await page.click('button:has-text("データを追加")');

    await page.click('.data-item button:has-text("編集")');
    const displayTime = await page.locator('#displayTime').inputValue();
    expect(displayTime).toBe('10');
  });
});

test.describe('Position Selection Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('clicking position cell changes active state', async ({ page }) => {
    const cell = page.locator('.position-cell[data-pos="1"]');
    await cell.click();
    await expect(cell).toHaveClass(/active/);
  });

  test('selected position is saved in entry', async ({ page }) => {
    // Select position 3 (upper right)
    await page.click('.position-cell[data-pos="3"]');

    await page.selectOption('#property', '2010');
    await page.selectOption('#vendor', '0');
    await page.selectOption('#inspectionType', '0');
    await page.click('button:has-text("データを追加")');

    // Edit to verify position
    await page.click('.data-item button:has-text("編集")');
    const activeCell = page.locator('.position-cell.active');
    await expect(activeCell).toHaveAttribute('data-pos', '3');
  });

  test('position 0 (全体) can be selected', async ({ page }) => {
    const cell = page.locator('.position-cell[data-pos="0"]');
    await cell.click();
    await expect(cell).toHaveClass(/active/);
  });
});

test.describe('Poster Type Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('can select custom poster type', async ({ page }) => {
    await page.click('input[name="posterType"][value="custom"]');
    const customRadio = page.locator('input[name="posterType"][value="custom"]');
    await expect(customRadio).toBeChecked();
  });

  test('poster type is saved in entry', async ({ page }) => {
    await page.click('input[name="posterType"][value="custom"]');

    await page.selectOption('#property', '2010');
    await page.selectOption('#vendor', '0');
    await page.selectOption('#inspectionType', '0');
    await page.click('button:has-text("データを追加")');

    // Edit to verify
    await page.click('.data-item button:has-text("編集")');
    const customRadio = page.locator('input[name="posterType"][value="custom"]');
    await expect(customRadio).toBeChecked();
  });
});
