// @ts-check
const { test, expect } = require('@playwright/test');
const { setupAuthMock } = require('./test-helpers');

test.describe('CSV Generation Tests', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMock(page, '/', { isAuthenticated: true });
    // Add an entry
    await page.selectOption('#property', '2010');
    await page.selectOption('#vendor', '0');
    await page.selectOption('#inspectionType', '0');
    await page.fill('#remarks', '10:00〜12:00');
    await page.fill('#startDate', '2025-12-01');
    await page.fill('#endDate', '2025-12-01');
    await page.click('button:has-text("データを追加")');
    await page.waitForTimeout(100);
  });

  test('export section appears when data exists', async ({ page }) => {
    await expect(page.locator('#exportSection')).toBeVisible();
  });

  test('preview CSV button shows modal', async ({ page }) => {
    await page.click('button:has-text("CSV")');
    await expect(page.locator('#previewModal')).toHaveClass(/active/);
  });

  test('CSV preview contains expected headers', async ({ page }) => {
    await page.click('button:has-text("CSV")');
    const csvContent = await page.locator('#csvPreview').textContent();

    // Check for required headers
    expect(csvContent).toContain('点検CO');
    expect(csvContent).toContain('端末ID');
    expect(csvContent).toContain('物件コード');
    expect(csvContent).toContain('受注先名');
    expect(csvContent).toContain('緊急連絡先番号');
    expect(csvContent).toContain('点検工事案内');
    expect(csvContent).toContain('掲示板に表示する');
    expect(csvContent).toContain('点検案内TPLNo');
    expect(csvContent).toContain('点検開始日');
    expect(csvContent).toContain('点検完了日');
    expect(csvContent).toContain('掲示備考');
    expect(csvContent).toContain('掲示板用案内文');
    expect(csvContent).toContain('frame_No');
    expect(csvContent).toContain('表示開始日');
    expect(csvContent).toContain('表示終了日');
    expect(csvContent).toContain('貼紙区分');
  });

  test('CSV contains entry data', async ({ page }) => {
    await page.click('button:has-text("CSV")');
    const csvContent = await page.locator('#csvPreview').textContent();

    expect(csvContent).toContain('h0001A00');
    expect(csvContent).toContain('2010');
    expect(csvContent).toContain('山本クリーンシステム');
    expect(csvContent).toContain('092-934-0407');
    expect(csvContent).toContain('2025/12/01');
  });

  test('CSV contains showOnBoard as TRUE/False', async ({ page }) => {
    await page.click('button:has-text("CSV")');
    const csvContent = await page.locator('#csvPreview').textContent();
    expect(csvContent).toMatch(/TRUE|False/);
  });

  test('CSV contains poster type', async ({ page }) => {
    await page.click('button:has-text("CSV")');
    const csvContent = await page.locator('#csvPreview').textContent();
    expect(csvContent).toContain('テンプレート');
  });

  test('closing modal works', async ({ page }) => {
    await page.click('button:has-text("CSV")');
    await expect(page.locator('#previewModal')).toHaveClass(/active/);

    // Click close button
    await page.click('.modal-close');
    await expect(page.locator('#previewModal')).not.toHaveClass(/active/);
  });

  test('escape key closes modal', async ({ page }) => {
    await page.click('button:has-text("CSV")');
    await page.keyboard.press('Escape');
    await expect(page.locator('#previewModal')).not.toHaveClass(/active/);
  });

  test('copy button works', async ({ page }) => {
    // Grant clipboard permissions
    await page.context().grantPermissions(['clipboard-write', 'clipboard-read']);

    await page.click('button:has-text("コピー")');
    await expect(page.locator('.toast.success')).toContainText('コピー');
  });
});

test.describe('CSV Format Validation', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMock(page, '/', { isAuthenticated: true });
  });

  test('CSV has exactly 28 columns', async ({ page }) => {
    await page.selectOption('#property', '2010');
    await page.selectOption('#vendor', '0');
    await page.selectOption('#inspectionType', '0');
    await page.click('button:has-text("データを追加")');

    await page.click('button:has-text("CSV")');
    const csvContent = await page.locator('#csvPreview').textContent();

    const lines = csvContent.split('\n');
    const headerLine = lines[0];
    const headerColumns = headerLine.split(',');

    expect(headerColumns.length).toBe(28);
  });

  test('date format is YYYY/MM/DD', async ({ page }) => {
    await page.selectOption('#property', '2010');
    await page.selectOption('#vendor', '0');
    await page.selectOption('#inspectionType', '0');
    await page.fill('#startDate', '2025-12-15');
    await page.click('button:has-text("データを追加")');

    await page.click('button:has-text("CSV")');
    const csvContent = await page.locator('#csvPreview').textContent();

    expect(csvContent).toContain('2025/12/15');
  });

  test('display time format is 0:00:XX', async ({ page }) => {
    await page.selectOption('#property', '2010');
    await page.selectOption('#vendor', '0');
    await page.selectOption('#inspectionType', '0');
    await page.fill('#displayTime', '8');
    await page.click('button:has-text("データを追加")');

    await page.click('button:has-text("CSV")');
    const csvContent = await page.locator('#csvPreview').textContent();

    expect(csvContent).toContain('0:00:08');
  });

  test('multiple entries generate multiple rows', async ({ page }) => {
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

    await page.click('button:has-text("CSV")');
    const csvContent = await page.locator('#csvPreview').textContent();

    // Filter out empty lines
    const lines = csvContent.trim().split('\n').filter(line => line.trim() !== '');
    // 1 header + 2 data rows (at minimum)
    expect(lines.length).toBeGreaterThanOrEqual(3);
  });
});

test.describe('CSV Download Tests', () => {
  test('download button triggers file download', async ({ page }) => {
    await setupAuthMock(page, '/', { isAuthenticated: true });
    await page.selectOption('#property', '2010');
    await page.selectOption('#vendor', '0');
    await page.selectOption('#inspectionType', '0');
    await page.click('button:has-text("データを追加")');

    // Listen for download
    const downloadPromise = page.waitForEvent('download');
    await page.click('button:has-text("DL")');
    const download = await downloadPromise;

    // Verify filename format
    const filename = download.suggestedFilename();
    expect(filename).toMatch(/2010-全端末-\d{8}T\d{6}\.csv/);
  });
});
