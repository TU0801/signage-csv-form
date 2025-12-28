// Tests for category filtering functionality (案内カテゴリ)
// Based on VBA macro: ○入力_20_案内文カテゴリ選択.bas

const { test, expect } = require('@playwright/test');
const { setupAuthMockWithMasterData } = require('./test-helpers');

// Category test data
const categories = ['点検', '工事', '清掃', 'アンケート'];

test.describe('Category Filter - index.html', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMockWithMasterData(page, '/index.html', {
      isAuthenticated: true,
      email: 'test@example.com'
    });
  });

  test('should have category select element', async ({ page }) => {
    const categorySelect = page.locator('#inspectionCategory');
    await expect(categorySelect).toBeVisible();
  });

  test('should have all category options', async ({ page }) => {
    const categorySelect = page.locator('#inspectionCategory');
    const options = categorySelect.locator('option');

    // First option should be "全て"
    await expect(options.nth(0)).toHaveText('全て');

    // Check for all categories (use count check since options are hidden when select is closed)
    for (const category of categories) {
      const opt = categorySelect.locator(`option[value="${category}"]`);
      await expect(opt).toHaveCount(1);
    }
  });

  test('should filter inspection types when category is selected', async ({ page }) => {
    const categorySelect = page.locator('#inspectionCategory');
    const inspectionSelect = page.locator('#inspectionType');

    // Select "点検" category
    await categorySelect.selectOption('点検');

    // Get all options from inspection type select
    const optionTexts = await inspectionSelect.locator('option').allTextContents();

    // All visible options should contain "点検"
    const filteredOptions = optionTexts.filter(text => text !== '選択してください');
    expect(filteredOptions.length).toBeGreaterThan(0);

    for (const text of filteredOptions) {
      expect(text).toContain('点検');
    }
  });

  test('should show all inspection types when "全て" is selected', async ({ page }) => {
    const categorySelect = page.locator('#inspectionCategory');
    const inspectionSelect = page.locator('#inspectionType');

    // First select a category to filter
    await categorySelect.selectOption('点検');
    const filteredCount = await inspectionSelect.locator('option').count();

    // Then select "全て" to show all
    await categorySelect.selectOption('');
    const allCount = await inspectionSelect.locator('option').count();

    // All count should be greater than filtered count
    expect(allCount).toBeGreaterThan(filteredCount);
  });

  test('should reset inspection type when category changes', async ({ page }) => {
    const categorySelect = page.locator('#inspectionCategory');
    const inspectionSelect = page.locator('#inspectionType');

    // Select an inspection type
    await inspectionSelect.selectOption({ index: 1 });
    const selectedBefore = await inspectionSelect.inputValue();
    expect(selectedBefore).not.toBe('');

    // Change category
    await categorySelect.selectOption('工事');

    // Inspection type should be reset
    const selectedAfter = await inspectionSelect.inputValue();
    expect(selectedAfter).toBe('');
  });
});

test.describe('Category Filter - bulk.html bulk edit modal', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMockWithMasterData(page, '/bulk.html', {
      isAuthenticated: true,
      email: 'test@example.com'
    });
  });

  test('should have category select in bulk edit modal', async ({ page }) => {
    // Add a row first
    await page.click('#addRowBtn');
    await page.waitForSelector('#tableBody tr');

    // Select the row
    await page.click('#tableBody tr:first-child input[type="checkbox"]');

    // Open bulk edit modal
    await page.click('#bulkEditBtn');
    await page.waitForSelector('#bulkEditModal.active');

    // Check for category select
    const categorySelect = page.locator('#bulkEditCategory');
    await expect(categorySelect).toBeVisible();

    // Verify options
    const options = categorySelect.locator('option');
    await expect(options).toHaveCount(5); // 全て + 4 categories
  });

  test('should filter inspection types in bulk edit modal', async ({ page }) => {
    // Add and select a row
    await page.click('#addRowBtn');
    await page.waitForSelector('#tableBody tr');
    await page.click('#tableBody tr:first-child input[type="checkbox"]');

    // Open bulk edit modal
    await page.click('#bulkEditBtn');
    await page.waitForSelector('#bulkEditModal.active');

    const categorySelect = page.locator('#bulkEditCategory');
    const inspectionSelect = page.locator('#bulkEditInspection');

    // Get initial count
    const initialCount = await inspectionSelect.locator('option').count();

    // Select "清掃" category
    await categorySelect.selectOption('清掃');

    // Get filtered count
    const filteredCount = await inspectionSelect.locator('option').count();

    // Filtered count should be less than initial
    expect(filteredCount).toBeLessThan(initialCount);

    // All options should contain "清掃"
    const optionTexts = await inspectionSelect.locator('option').allTextContents();
    const filtered = optionTexts.filter(t => t !== '変更しない');
    for (const text of filtered) {
      expect(text).toContain('清掃');
    }
  });
});
