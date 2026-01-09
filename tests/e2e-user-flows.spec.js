// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * 実際のSupabaseを使用したE2Eテスト
 * モックではなく実際のデータベースと認証を使用
 */

const baseUrl = 'http://localhost:8080';

/**
 * 一般ユーザーでログイン
 */
async function loginAsUser(page, email = 'a@a', password = 'aaaaaa') {
  await page.goto(`${baseUrl}/login.html`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');

  // ログイン成功を待機
  await page.waitForURL('**/index.html', { timeout: 10000 });

  // マスターデータの読み込みを待機
  await page.waitForTimeout(2000);
}

/**
 * 管理者でログイン
 */
async function loginAsAdmin(page) {
  await loginAsUser(page, 'admin@example.com', 'admin123');
}

// ============================================
// ログイン・認証テスト
// ============================================
test.describe('ログイン・認証', () => {
  test('未ログイン状態で一件入力画面にアクセスするとログイン画面にリダイレクトされる', async ({ page }) => {
    await page.goto(`${baseUrl}/index.html`);
    await page.waitForTimeout(1000);
    expect(page.url()).toContain('login.html');
  });

  test('未ログイン状態で一括入力画面にアクセスするとログイン画面にリダイレクトされる', async ({ page }) => {
    await page.goto(`${baseUrl}/bulk.html`);
    await page.waitForTimeout(1000);
    expect(page.url()).toContain('login.html');
  });

  test('正しい認証情報でログインできる', async ({ page }) => {
    await loginAsUser(page);
    expect(page.url()).toContain('index.html');
  });

  test('ログイン後はログアウトボタンが表示される', async ({ page }) => {
    await loginAsUser(page);
    await page.goto(`${baseUrl}/index.html`);

    const logoutBtn = page.locator('button:has-text("ログアウト")');
    await expect(logoutBtn).toBeVisible();
  });
});

// ============================================
// 一件入力テスト
// ============================================
test.describe('一件入力', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page);
    await page.goto(`${baseUrl}/index.html`);
  });

  test('物件を選択すると端末が自動的に設定される', async ({ page }) => {
    // 物件オプションを確認
    const propertyOptions = await page.locator('#property option').count();

    if (propertyOptions > 1) {
      // 最初のオプション（空白以外）を選択
      await page.selectOption('#property', { index: 1 });
      await page.waitForTimeout(300);

      // 端末が自動的に設定されることを確認
      const terminalValue = await page.locator('#terminal').inputValue();
      expect(terminalValue).toBeTruthy();
    } else {
      test.skip();
    }
  });

  test('点検種別を選択すると案内文が自動入力される', async ({ page }) => {
    // 点検種別を選択
    const inspectionOptions = await page.locator('#inspectionType option').count();

    if (inspectionOptions > 1) {
      await page.selectOption('#inspectionType', { index: 1 });
      await page.waitForTimeout(100);

      // プレビュー画像が更新されることを確認
      const previewSrc = await page.locator('#posterPreview img').getAttribute('src');
      expect(previewSrc).toBeTruthy();
    } else {
      test.skip();
    }
  });

  test('必須項目を入力してデータを追加できる', async ({ page }) => {
    // 物件選択
    const propertyOptions = await page.locator('#property option').count();
    if (propertyOptions <= 1) {
      test.skip();
      return;
    }

    await page.selectOption('#property', { index: 1 });
    await page.waitForTimeout(300);

    // 点検種別選択
    const inspectionOptions = await page.locator('#inspectionType option').count();
    if (inspectionOptions > 1) {
      await page.selectOption('#inspectionType', { index: 1 });
    }

    // 日付入力
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    await page.fill('#startDate', dateStr);

    // データ追加ボタンをクリック
    const addBtn = page.locator('button:has-text("データを追加")');
    if (await addBtn.isEnabled()) {
      await addBtn.click();
      await page.waitForTimeout(500);

      // データ件数が増えることを確認
      const dataCount = await page.locator('#dataCount').textContent();
      expect(parseInt(dataCount || '0')).toBeGreaterThan(0);
    }
  });

  test('クリアボタンでフォームがリセットされる', async ({ page }) => {
    // まずデータを入力
    const propertyOptions = await page.locator('#property option').count();
    if (propertyOptions > 1) {
      await page.selectOption('#property', { index: 1 });
    }

    // クリアボタンをクリック
    await page.click('button:has-text("クリア")');
    await page.waitForTimeout(300);

    // フォームがリセットされることを確認
    const propertyValue = await page.locator('#property').inputValue();
    expect(propertyValue).toBe('');
  });
});

// ============================================
// 一括入力テスト
// ============================================
test.describe('一括入力', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page);
    await page.goto(`${baseUrl}/bulk.html`);
    await page.waitForTimeout(2000); // データ読み込み待機
  });

  test('一括入力画面が表示される', async ({ page }) => {
    await expect(page.locator('h1:has-text("一括入力")')).toBeVisible();
  });

  test('行追加ボタンで新しい行を追加できる', async ({ page }) => {
    const addRowBtn = page.locator('#addRowBtn');
    await addRowBtn.click();
    await page.waitForTimeout(500);

    // テーブルに行が追加されることを確認
    const rows = await page.locator('tbody tr').count();
    expect(rows).toBeGreaterThan(0);
  });

  test('Excelペーストモーダルが表示される', async ({ page }) => {
    const pasteBtn = page.locator('button:has-text("Excelペースト")');
    if (await pasteBtn.isVisible()) {
      await pasteBtn.click();
      await page.waitForTimeout(300);

      // モーダルが表示されることを確認
      const modal = page.locator('.modal:visible, [role="dialog"]:visible');
      await expect(modal).toBeVisible();

      // モーダルを閉じる
      await page.keyboard.press('Escape');
    }
  });
});

// ============================================
// エラーケーステスト
// ============================================
test.describe('エラーケース', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page);
    await page.goto(`${baseUrl}/index.html`);
  });

  test('一件入力で必須項目が未入力の場合はデータ追加できない', async ({ page }) => {
    // 何も入力せずにデータ追加ボタンをクリック
    const addBtn = page.locator('#addBtn');

    // 初期状態ではボタンが有効だが、クリック時にバリデーションエラーが出ることを期待
    // または、データ件数が0のままであることを確認
    const initialCount = await page.locator('#dataCount').textContent();
    const initialCountNum = parseInt(initialCount || '0');

    if (await addBtn.isVisible() && await addBtn.isEnabled()) {
      await addBtn.click();
      await page.waitForTimeout(300);

      // データ件数が変わらないことを確認
      const afterCount = await page.locator('#dataCount').textContent();
      const afterCountNum = parseInt(afterCount || '0');
      expect(afterCountNum).toBe(initialCountNum);
    }
  });
});
