// @ts-check
const { test, expect } = require('@playwright/test');
const { setupAuthMockWithMasterData } = require('./test-helpers');

test.describe('Custom Poster Mode - Image Upload Tests', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMockWithMasterData(page, '/index.html', { isAuthenticated: true });
  });

  test('clicking custom radio button shows image upload area', async ({ page }) => {
    // Initially, the custom image group should be hidden
    const customImageGroup = page.locator('#customImageGroup');
    await expect(customImageGroup).not.toBeVisible();

    // Click custom radio button
    await page.click('input[name="posterType"][value="custom"]');

    // Image upload area should now be visible
    await expect(customImageGroup).toBeVisible();
  });

  test('clicking custom radio button hides inspection type, start date, end date fields', async ({ page }) => {
    // Initially, these fields should be visible
    const inspectionTypeGroup = page.locator('#inspectionTypeGroup');
    const startDateGroup = page.locator('#startDateGroup');
    const endDateGroup = page.locator('#endDateGroup');
    await expect(inspectionTypeGroup).toBeVisible();
    await expect(startDateGroup).toBeVisible();
    await expect(endDateGroup).toBeVisible();

    // Click custom radio button
    await page.click('input[name="posterType"][value="custom"]');

    // These fields should now be hidden
    await expect(inspectionTypeGroup).not.toBeVisible();
    await expect(startDateGroup).not.toBeVisible();
    await expect(endDateGroup).not.toBeVisible();
  });

  test('switching back to template mode hides image upload and shows fields again', async ({ page }) => {
    const customImageGroup = page.locator('#customImageGroup');
    const inspectionTypeGroup = page.locator('#inspectionTypeGroup');
    const startDateGroup = page.locator('#startDateGroup');
    const endDateGroup = page.locator('#endDateGroup');

    // Switch to custom mode first
    await page.click('input[name="posterType"][value="custom"]');
    await expect(customImageGroup).toBeVisible();
    await expect(inspectionTypeGroup).not.toBeVisible();
    await expect(startDateGroup).not.toBeVisible();
    await expect(endDateGroup).not.toBeVisible();

    // Switch back to template mode
    await page.click('input[name="posterType"][value="template"]');

    // Image upload should be hidden
    await expect(customImageGroup).not.toBeVisible();

    // Fields should be visible again
    await expect(inspectionTypeGroup).toBeVisible();
    await expect(startDateGroup).toBeVisible();
    await expect(endDateGroup).toBeVisible();
  });

  test('cannot add entry in custom mode without selecting an image (validation)', async ({ page }) => {
    // Fill in required fields (except image)
    await page.selectOption('#property', '2010');
    await page.selectOption('#vendor', '0');

    // Switch to custom mode
    await page.click('input[name="posterType"][value="custom"]');

    // Try to add entry without selecting an image
    await page.click('button:has-text("データを追加")');

    // Should show error toast for missing image
    await expect(page.locator('.toast.error')).toBeVisible();
  });

  test('image file input accepts only jpg, jpeg, png formats (check accept attribute)', async ({ page }) => {
    // Switch to custom mode to make the file input visible in DOM
    await page.click('input[name="posterType"][value="custom"]');

    // Check the accept attribute of the file input
    const fileInput = page.locator('#customImage');
    await expect(fileInput).toHaveAttribute('accept', '.jpg,.jpeg,.png');
  });

  test('upload preview area is initially hidden', async ({ page }) => {
    // Switch to custom mode
    await page.click('input[name="posterType"][value="custom"]');

    // The upload preview should be hidden initially
    const uploadPreview = page.locator('#uploadPreview');
    await expect(uploadPreview).not.toBeVisible();

    // But the upload placeholder should be visible
    const uploadPlaceholder = page.locator('.upload-placeholder');
    await expect(uploadPlaceholder).toBeVisible();
  });

  test('clicking the upload placeholder should trigger file input click', async ({ page }) => {
    // Switch to custom mode
    await page.click('input[name="posterType"][value="custom"]');

    // Set up a listener to detect if file chooser is triggered
    const fileChooserPromise = page.waitForEvent('filechooser');

    // Click the upload placeholder
    await page.click('.upload-placeholder');

    // Wait for file chooser to be triggered (with a timeout)
    const fileChooser = await fileChooserPromise;

    // Verify file chooser was opened
    expect(fileChooser).toBeTruthy();
  });
});
