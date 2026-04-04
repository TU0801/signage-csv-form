// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Visual Regression Testing
 * CSS変更時のレイアウト崩れを自動検出する
 * ベースライン更新: npx playwright test tests/visual-regression.spec.js --update-snapshots
 */

const baseUrl = process.env.BASE_URL || 'http://localhost:8080';

async function loginAndGoToIndex(page) {
  await page.goto(`${baseUrl}/login.html`);
  await page.fill('input[type="email"]', 'a@a');
  await page.fill('input[type="password"]', 'aaaaaa');
  await page.click('button[type="submit"]');
  await page.waitForURL(url => !url.toString().includes('login.html'), { timeout: 30000 });
  await page.goto(`${baseUrl}/index.html`);
  await page.waitForLoadState('networkidle');
}

test.describe('張紙プレビュー Visual Regression', () => {

  test('プレビュー未選択時はプレースホルダが表示される', async ({ page }) => {
    await loginAndGoToIndex(page);

    const preview = page.locator('#posterPreview');
    await expect(preview).toHaveScreenshot('preview-placeholder.png', {
      maxDiffPixelRatio: 0.01,
    });
  });

  test('張紙プレビューのレイアウトが正しい', async ({ page }) => {
    await loginAndGoToIndex(page);

    // vendor・inspectionType は hidden input のカスタムコンポーネントなので JS で設定
    await page.evaluate(() => {
      const vendor = document.getElementById('vendor');
      if (vendor) {
        vendor.value = '0';
        vendor.dispatchEvent(new Event('change'));
      }
    });
    await page.waitForTimeout(1500);

    await page.evaluate(() => {
      const el = document.getElementById('inspectionType');
      if (el) {
        el.value = '0';
        el.dispatchEvent(new Event('change'));
      }
    });
    await page.waitForTimeout(2000);

    await page.evaluate(() => {
      const start = document.getElementById('startDate');
      const end = document.getElementById('endDate');
      if (start) start.value = '2026-04-01';
      if (end) end.value = '2026-04-03';
      if (typeof window.updatePreview === 'function') window.updatePreview();
    });
    await page.waitForTimeout(2000);

    const preview = page.locator('#posterPreview');
    const box = await preview.boundingBox();

    // プレビューが表示されていること（幅・高さが0でない）
    expect(box).toBeTruthy();
    expect(box.width).toBeGreaterThan(100);
    expect(box.height).toBeGreaterThan(100);

    // 画像とオーバーレイのサイズが一致すること
    const sizes = await page.evaluate(() => {
      const img = document.querySelector('#posterPreview img');
      const overlay = document.querySelector('.poster-overlay');
      if (!img || !overlay) return null;
      const imgRect = img.getBoundingClientRect();
      const overlayRect = overlay.getBoundingClientRect();
      return {
        imgW: imgRect.width, imgH: imgRect.height,
        overlayW: overlayRect.width, overlayH: overlayRect.height,
      };
    });

    if (sizes) {
      expect(Math.abs(sizes.imgW - sizes.overlayW)).toBeLessThan(2);
      expect(Math.abs(sizes.imgH - sizes.overlayH)).toBeLessThan(2);
    }

    // スクリーンショット比較
    await expect(preview).toHaveScreenshot('preview-with-data.png', {
      maxDiffPixelRatio: 0.02,
    });
  });
});
