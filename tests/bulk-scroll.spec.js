// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * 回帰テスト: 一括入力画面のスクロール
 *
 * バグ: 行数が増える（14件前後）と共通の .container (height:calc(100vh-44px);
 *       overflow:hidden) にクリップされ、テーブル下部の行とフッター（申請ボタン）が
 *       画面外に押し出されてスクロールも効かなくなっていた。
 * 修正: css/bulk.css で .card を高さいっぱいに広げ、.bulk-table-container を
 *       flex:1 / overflow-y:auto にしてテーブル領域だけ内部スクロールさせる。
 */

const base = process.env.BASE_URL || 'http://localhost:8080';

async function loginAndOpenBulk(page) {
  await page.goto(`${base}/login.html`);
  await page.fill('input[type="email"]', 'a@a');
  await page.fill('input[type="password"]', 'aaaaaa');
  await page.click('button[type="submit"]');
  await page.waitForURL(u => !u.toString().includes('login.html'), { timeout: 30000 });
  await page.goto(`${base}/bulk.html`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1200);
  // 管理者ログインの場合は保守会社を選択しないと行追加できない
  const hasVendorSel = await page.evaluate(() => {
    const g = document.getElementById('adminVendorSelectGroup');
    return !!(g && getComputedStyle(g).display !== 'none');
  });
  if (hasVendorSel) {
    await page.evaluate(() => {
      const sel = document.getElementById('adminVendorSelect');
      if (sel && sel.options.length > 1) { sel.selectedIndex = 1; sel.dispatchEvent(new Event('change')); }
    });
    await page.waitForTimeout(1000);
  }
}

async function addRows(page, n) {
  for (let i = 0; i < n; i++) {
    await page.evaluate(() => {
      const empty = document.getElementById('emptyAddBtn');
      if (empty && empty.offsetParent !== null) { empty.click(); return; }
      const add = document.getElementById('addRowBtn');
      if (add) add.click();
    });
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(500);
}

test('デスクトップ: 14行でもフッターが固定表示されテーブルが内部スクロールする', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAndOpenBulk(page);
  await addRows(page, 14);

  const m = await page.evaluate(() => {
    const tc = document.querySelector('.bulk-table-container');
    const footer = document.querySelector('.bulk-footer');
    const saveBtn = document.getElementById('saveBtn');
    const fr = footer.getBoundingClientRect();
    const sb = saveBtn.getBoundingClientRect();
    // フッターはスクロール無しで画面内に固定されている
    const footerVisibleNoScroll = fr.bottom <= window.innerHeight + 1 && fr.top >= 0;
    // テーブル領域が内部スクロール可能
    const tcCanScroll = tc.scrollHeight > tc.clientHeight + 1;
    // 申請ボタンが画面内に完全に収まり、外部オーバーレイに覆われていない
    // （disabled時は pointer-events:none なので祖先が返るのは正常）
    const fullyInViewport = sb.top >= 0 && sb.bottom <= window.innerHeight + 1 && sb.height > 0;
    const el = document.elementFromPoint(Math.round(sb.left + sb.width / 2), Math.round(sb.top + sb.height / 2));
    const noForeignOverlay = !!el && (el === saveBtn || saveBtn.contains(el) || el.contains(saveBtn));
    return { footerVisibleNoScroll, tcCanScroll, fullyInViewport, noForeignOverlay };
  });

  expect(m.footerVisibleNoScroll).toBe(true);
  expect(m.tcCanScroll).toBe(true);
  expect(m.fullyInViewport).toBe(true);
  expect(m.noForeignOverlay).toBe(true);
});

test('モバイル: 14行でページスクロールにより申請ボタンへ到達できる', async ({ page }) => {
  await page.setViewportSize({ width: 414, height: 800 });
  await loginAndOpenBulk(page);
  await addRows(page, 14);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(150);

  const m = await page.evaluate(() => {
    const saveBtn = document.getElementById('saveBtn');
    const sb = saveBtn.getBoundingClientRect();
    const fullyInViewport = sb.top >= 0 && sb.bottom <= window.innerHeight + 1 && sb.height > 0;
    const el = fullyInViewport ? document.elementFromPoint(Math.round(sb.left + sb.width / 2), Math.round(sb.top + sb.height / 2)) : null;
    const noForeignOverlay = !!el && (el === saveBtn || saveBtn.contains(el) || el.contains(saveBtn));
    return { fullyInViewport, noForeignOverlay };
  });

  expect(m.fullyInViewport).toBe(true);
  expect(m.noForeignOverlay).toBe(true);
});
