// Tests for position selection in bulk.html
// Based on VBA macro: ○入力_23_貼紙表示位置.bas

const { test, expect } = require('@playwright/test');
const { baseUrl } = require('./test-helpers');

// Position values based on VBA OptionButton4-8
const positions = [
  { value: '1', label: '①上左' },
  { value: '2', label: '②上中' },
  { value: '3', label: '③上右' },
  { value: '4', label: '④中央' },
  { value: '0', label: '⓪全体' }
];

test.describe('Position Selection - bulk.html row detail modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${baseUrl}/bulk.html`, { waitUntil: 'networkidle' });
    if (page.url().includes('login.html')) {
      await page.goto(`${baseUrl}/bulk.html?local=true`, { waitUntil: 'networkidle' });
    }
  });

  test('should have position selection in row detail modal', async ({ page }) => {
    // Add a row
    await page.click('#addRowBtn');
    await page.waitForSelector('#tableBody tr');

    // Open row detail modal
    await page.click('#tableBody tr:first-child .btn-detail');
    await page.waitForSelector('#rowDetailModal.active');

    // Check for position selection grid
    const positionGrid = page.locator('.position-select-grid');
    await expect(positionGrid).toBeVisible();

    // Check all position options
    for (const pos of positions) {
      const radio = page.locator(`input[name="detailPosition"][value="${pos.value}"]`);
      await expect(radio).toBeVisible();
    }
  });

  test('should default to position 2 (②上中)', async ({ page }) => {
    // Add a row
    await page.click('#addRowBtn');
    await page.waitForSelector('#tableBody tr');

    // Open row detail modal
    await page.click('#tableBody tr:first-child .btn-detail');
    await page.waitForSelector('#rowDetailModal.active');

    // Check default position is 2
    const radio2 = page.locator('input[name="detailPosition"][value="2"]');
    await expect(radio2).toBeChecked();
  });

  test('should save selected position when applying row detail', async ({ page }) => {
    // Add a row
    await page.click('#addRowBtn');
    await page.waitForSelector('#tableBody tr');

    // Open row detail modal
    await page.click('#tableBody tr:first-child .btn-detail');
    await page.waitForSelector('#rowDetailModal.active');

    // Select position 4 (④中央)
    await page.click('input[name="detailPosition"][value="4"]');

    // Apply changes
    await page.click('#applyRowDetail');
    await page.waitForSelector('#rowDetailModal:not(.active)');

    // Reopen modal to verify position was saved
    await page.click('#tableBody tr:first-child .btn-detail');
    await page.waitForSelector('#rowDetailModal.active');

    const radio4 = page.locator('input[name="detailPosition"][value="4"]');
    await expect(radio4).toBeChecked();
  });

  test('should include position in duplicated rows', async ({ page }) => {
    // Add a row and set position
    await page.click('#addRowBtn');
    await page.waitForSelector('#tableBody tr');

    await page.click('#tableBody tr:first-child .btn-detail');
    await page.waitForSelector('#rowDetailModal.active');
    await page.click('input[name="detailPosition"][value="1"]');
    await page.click('#applyRowDetail');
    await page.waitForSelector('#rowDetailModal:not(.active)');

    // Select the row
    await page.click('#tableBody tr:first-child input[type="checkbox"]');

    // Duplicate
    await page.click('#duplicateBtn');

    // Check duplicated row has same position
    const rowCount = await page.locator('#tableBody tr').count();
    expect(rowCount).toBe(2);

    // Open second row's detail modal
    await page.click('#tableBody tr:nth-child(2) .btn-detail');
    await page.waitForSelector('#rowDetailModal.active');

    const radio1 = page.locator('input[name="detailPosition"][value="1"]');
    await expect(radio1).toBeChecked();
  });

  test('should include position in CSV output', async ({ page }) => {
    // Add and configure a row with all required fields
    await page.click('#addRowBtn');
    await page.waitForSelector('#tableBody tr');

    // Set required fields
    const propertySelect = page.locator('#tableBody tr:first-child select').first();
    await propertySelect.selectOption({ index: 1 });

    const vendorCell = page.locator('#tableBody tr:first-child td:nth-child(4)');
    await vendorCell.click();
    const vendorSelect = vendorCell.locator('select');
    await vendorSelect.selectOption({ index: 1 });

    const inspectionCell = page.locator('#tableBody tr:first-child td:nth-child(5)');
    await inspectionCell.click();
    const inspectionSelect = inspectionCell.locator('select');
    await inspectionSelect.selectOption({ index: 1 });

    // Set position to 3
    await page.click('#tableBody tr:first-child .btn-detail');
    await page.waitForSelector('#rowDetailModal.active');
    await page.click('input[name="detailPosition"][value="3"]');
    await page.click('#applyRowDetail');

    // Check CSV output contains position value
    // Note: The actual CSV check depends on how the app generates CSV
    // This is a placeholder for the actual test
  });
});

test.describe('Position Selection - index.html', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'networkidle' });
    if (page.url().includes('login.html')) {
      await page.goto(`${baseUrl}/index.html?local=true`, { waitUntil: 'networkidle' });
    }
  });

  test('should have position grid', async ({ page }) => {
    const positionGrid = page.locator('.position-grid');
    await expect(positionGrid).toBeVisible();

    // Check all position cells
    for (const pos of positions) {
      const cell = page.locator(`.position-cell[data-pos="${pos.value}"]`);
      await expect(cell).toBeVisible();
      await expect(cell).toContainText(pos.label);
    }
  });

  test('should default to position 2 (②上中)', async ({ page }) => {
    const activeCell = page.locator('.position-cell.active');
    await expect(activeCell).toHaveAttribute('data-pos', '2');
  });

  test('should change active position on click', async ({ page }) => {
    // Click position 4
    await page.click('.position-cell[data-pos="4"]');

    const activeCell = page.locator('.position-cell.active');
    await expect(activeCell).toHaveAttribute('data-pos', '4');
  });
});
