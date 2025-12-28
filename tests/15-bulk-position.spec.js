// Tests for position selection in index.html
// Based on VBA macro: ○入力_23_貼紙表示位置.bas

const { test, expect } = require('@playwright/test');
const { setupAuthMockWithMasterData } = require('./test-helpers');

// Position values based on VBA OptionButton4-8
const positions = [
  { value: '1', label: '①上左' },
  { value: '2', label: '②上中' },
  { value: '3', label: '③上右' },
  { value: '4', label: '④中央' },
  { value: '0', label: '⓪全体' }
];

test.describe('Position Selection - index.html', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMockWithMasterData(page, '/index.html', {
      isAuthenticated: true,
      email: 'test@example.com'
    });
  });

  test('should have position grid', async ({ page }) => {
    const positionGrid = page.locator('.position-grid');
    await expect(positionGrid).toBeVisible();

    // Check all position cells
    for (const pos of positions) {
      const cell = page.locator(`.position-cell[data-pos="${pos.value}"]`);
      await expect(cell).toBeVisible();
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
