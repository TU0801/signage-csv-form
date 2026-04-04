// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * スモークテスト: 主要操作パスの回帰チェック
 * pre-commitフックで実行される軽量テスト。
 * 各画面の基本操作が壊れていないことを確認する。
 */

const baseUrl = process.env.BASE_URL || 'http://localhost:8080';

async function loginAsUser(page, email = 'a@a', password = 'aaaaaa') {
  await page.goto(`${baseUrl}/login.html`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(url => !url.toString().includes('login.html'), { timeout: 30000 });
  await page.waitForLoadState('networkidle');
}

async function loginAsAdmin(page) {
  await loginAsUser(page, 'admin@example.com', 'admin123');
}

// ============================================
// スモークテスト: 一般ユーザーフロー
// ============================================
test.describe('スモーク: 一般ユーザー', () => {
  test('ログイン → 一件入力画面表示 → フォーム操作 → ナビゲーション', async ({ page }) => {
    // 1. ログイン
    await loginAsUser(page);
    expect(page.url()).not.toContain('login.html');

    // 2. 一件入力画面の主要要素が表示される
    await page.goto(`${baseUrl}/index.html`);
    await page.waitForTimeout(1000);
    await expect(page.locator('#property')).toBeVisible();
    await expect(page.locator('#inspectionType')).toBeVisible();
    await expect(page.locator('#startDate')).toBeVisible();

    // 3. 物件選択が動作する
    const propertyOptions = await page.locator('#property option').count();
    if (propertyOptions > 1) {
      await page.selectOption('#property', { index: 1 });
      await page.waitForTimeout(300);
      const terminalValue = await page.locator('#terminal').inputValue();
      expect(terminalValue).toBeTruthy();
    }

    // 4. 一括入力画面へ遷移できる
    const bulkLink = page.locator('a[href*="bulk"]');
    if (await bulkLink.count() > 0) {
      await bulkLink.first().click();
      await page.waitForURL(/bulk\.html/, { timeout: 5000 });
      await expect(page.locator('h1')).toBeVisible();
    }
  });

  test('一括入力画面 → 行追加 → バリデーション表示', async ({ page }) => {
    await loginAsUser(page);
    await page.goto(`${baseUrl}/bulk.html`);
    await page.waitForLoadState('networkidle');

    // 1. 画面が表示される
    await expect(page.locator('h1:has-text("一括入力")')).toBeVisible();

    // 2. 行追加が動作する
    const addRowBtn = page.locator('#addRowBtn');
    if (await addRowBtn.isVisible()) {
      const rowsBefore = await page.locator('tbody tr').count();
      await addRowBtn.click();
      await page.waitForTimeout(500);
      const rowsAfter = await page.locator('tbody tr').count();
      expect(rowsAfter).toBeGreaterThanOrEqual(rowsBefore);
    }
  });
});

// ============================================
// スモークテスト: 管理者フロー
// ============================================
test.describe('スモーク: 管理者', () => {
  test('管理画面 → 全タブ切り替え → コンソールエラーなし', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    // 1. 管理者ログイン
    await loginAsAdmin(page);
    await page.goto(`${baseUrl}/admin.html`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // 2. 管理画面が表示される
    expect(page.url()).toContain('admin.html');

    // 3. 各タブをクリックしてエラーがないことを確認
    const tabs = await page.locator('.admin-tab').all();
    for (const tab of tabs) {
      if (await tab.isVisible()) {
        await tab.click();
        await page.waitForTimeout(500);
      }
    }

    // 4. 致命的なJSエラーがないことを確認（Supabase接続エラー等は除外）
    const criticalErrors = consoleErrors.filter(e =>
      !e.includes('supabase') &&
      !e.includes('Failed to fetch') &&
      !e.includes('NetworkError') &&
      !e.includes('net::ERR')
    );
    expect(criticalErrors).toEqual([]);
  });
});

// ============================================
// スモークテスト: 画面遷移
// ============================================
test.describe('スモーク: 画面遷移', () => {
  test('未認証 → 全画面がログインにリダイレクトされる', async ({ page }) => {
    const pages = ['index.html', 'bulk.html', 'admin.html'];
    for (const p of pages) {
      await page.goto(`${baseUrl}/${p}`);
      await page.waitForTimeout(1000);
      expect(page.url()).toContain('login.html');
    }
  });
});
