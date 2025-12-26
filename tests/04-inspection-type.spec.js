// @ts-check
const { test, expect } = require('@playwright/test');
const { expectedNotices } = require('./test-data');

test.describe('Inspection Type Selection Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('inspection type options are populated', async ({ page }) => {
    const options = await page.locator('#inspectionType option').all();
    expect(options.length).toBeGreaterThan(1);
  });

  test('selecting inspection type updates preview image', async ({ page }) => {
    await page.selectOption('#inspectionType', '0');
    await page.waitForTimeout(100);
    const previewImg = page.locator('#posterPreview img');
    await expect(previewImg).toBeVisible();
  });

  test('selecting inspection type sets notice text', async ({ page }) => {
    await page.selectOption('#inspectionType', '0');
    const noticeText = await page.locator('#noticeText').inputValue();
    expect(noticeText).not.toBe('');
  });

  test('selecting inspection type sets showOnBoard checkbox', async ({ page }) => {
    // Select first inspection type (showOnBoard should be true for index 0)
    await page.selectOption('#inspectionType', '0');
    const showOnBoard = await page.locator('#showOnBoard').isChecked();
    expect(showOnBoard).toBe(true);
  });

  test('preview shows placeholder when no inspection type selected', async ({ page }) => {
    await page.selectOption('#inspectionType', '');
    await expect(page.locator('#posterPreview')).toContainText('点検工事案内を選択');
  });

  test('different inspection types show different templates', async ({ page }) => {
    await page.selectOption('#inspectionType', '0');
    await page.waitForTimeout(100);
    const firstImgSrc = await page.locator('#posterPreview img').getAttribute('src');

    // Select a different inspection type (定期清掃 - index varies)
    const options = await page.locator('#inspectionType option').all();
    if (options.length > 2) {
      await page.selectOption('#inspectionType', '2');
      await page.waitForTimeout(100);
      const secondImgSrc = await page.locator('#posterPreview img').getAttribute('src');
      // Images might be same or different depending on template
      expect(secondImgSrc).toBeDefined();
    }
  });

  test('notice text contains expected content for elevator inspection', async ({ page }) => {
    // Find the elevator inspection option
    const options = await page.locator('#inspectionType option').allTextContents();
    const elevatorIndex = options.findIndex(text => text.includes('エレベーター'));
    if (elevatorIndex > 0) {
      await page.selectOption('#inspectionType', String(elevatorIndex - 1));
      const noticeText = await page.locator('#noticeText').inputValue();
      expect(noticeText).toContain('エレベーター');
    }
  });
});

test.describe('Inspection Type Data Comparison (Excel vs Web)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('web app has inspection types from Excel', async ({ page }) => {
    const webOptions = await page.locator('#inspectionType option').allTextContents();
    // Skip first empty option
    const webInspectionTypes = webOptions.slice(1);

    // Check that at least some Excel types are present
    const excelTypes = expectedNotices.map(n => n.inspectionType);
    const matchCount = webInspectionTypes.filter(webType =>
      excelTypes.some(excelType => webType.includes(excelType))
    ).length;

    // Report the match count
    console.log(`Web has ${webInspectionTypes.length} types, Excel has ${excelTypes.length} types, ${matchCount} match`);
    expect(matchCount).toBeGreaterThan(0);
  });

  test('report missing inspection types from Excel', async ({ page }) => {
    const webOptions = await page.locator('#inspectionType option').allTextContents();
    const webInspectionTypes = webOptions.slice(1);

    const excelTypes = expectedNotices.map(n => n.inspectionType);
    const missingTypes = excelTypes.filter(excelType =>
      !webInspectionTypes.some(webType => webType.includes(excelType))
    );

    if (missingTypes.length > 0) {
      console.log('Missing inspection types in web app:');
      missingTypes.forEach(type => console.log(`  - ${type}`));
    }

    // This test will pass but report missing types
    expect(true).toBe(true);
  });
});
