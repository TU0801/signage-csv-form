// @ts-check
const { test, expect } = require('@playwright/test');
const { setupAuthMockWithMasterData } = require('./test-helpers');

/**
 * 一般ユーザー（業者）のE2Eテスト
 *
 * 実際のユーザー行動に基づいたテストケース:
 * - ログイン/ログアウト
 * - 一件入力での申請
 * - 一括入力での申請
 * - CSV出力
 */

// ============================================
// ログイン・認証テスト
// ============================================
test.describe('ログイン・認証', () => {
  test('未ログイン状態で一件入力画面にアクセスするとログイン画面にリダイレクトされる', async ({ page }) => {
    await page.route('https://cdn.jsdelivr.net/**', async route => {
      if (route.request().url().includes('@supabase/supabase-js')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/javascript',
          body: `
            export function createClient() {
              return {
                auth: {
                  getUser: async () => ({ data: { user: null } }),
                  signOut: async () => ({}),
                  onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } })
                },
                from: () => ({ select: () => ({ order: () => ({ data: [], error: null }) }) })
              };
            }
          `
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/');
    await page.waitForTimeout(500);

    expect(page.url()).toContain('login.html');
  });

  test('未ログイン状態で一括入力画面にアクセスするとログイン画面にリダイレクトされる', async ({ page }) => {
    await page.route('https://cdn.jsdelivr.net/**', async route => {
      if (route.request().url().includes('@supabase/supabase-js')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/javascript',
          body: `
            export function createClient() {
              return {
                auth: {
                  getUser: async () => ({ data: { user: null } }),
                  signOut: async () => ({}),
                  onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } })
                },
                from: () => ({ select: () => ({ order: () => ({ data: [], error: null }) }) })
              };
            }
          `
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/bulk.html');
    await page.waitForTimeout(500);

    expect(page.url()).toContain('login.html');
  });

  test('ログイン後はログアウトボタンが表示される', async ({ page }) => {
    await setupAuthMockWithMasterData(page, '/', {
      isAuthenticated: true,
      email: 'user@example.com'
    });

    await page.waitForLoadState('networkidle');

    await expect(page.locator('#logoutBtn')).toBeVisible();
  });
});

// ============================================
// 一件入力テスト
// ============================================
test.describe('一件入力', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMockWithMasterData(page, '/', {
      isAuthenticated: true,
      email: 'user@example.com'
    });
    await page.waitForLoadState('networkidle');
  });

  test('物件を選択すると端末が自動的に設定される', async ({ page }) => {
    await page.selectOption('#property', '2010');
    await page.waitForTimeout(100);

    const terminalValue = await page.locator('#terminal').inputValue();
    expect(terminalValue).toBeTruthy();
  });

  test('業者を選択すると緊急連絡先が自動入力される', async ({ page }) => {
    await page.selectOption('#vendor', { index: 1 });

    const emergencyContact = await page.locator('#emergencyContact').inputValue();
    expect(emergencyContact).toBeTruthy();
  });

  test('点検種別を選択すると案内文が自動入力される', async ({ page }) => {
    await page.selectOption('#inspectionType', { index: 1 });
    await page.waitForTimeout(100);

    // プレビュー画像が更新されることを確認
    const previewSrc = await page.locator('#posterPreview img').getAttribute('src');
    expect(previewSrc).toBeTruthy();
  });

  test('必須項目を入力してデータを追加できる', async ({ page }) => {
    // 物件選択
    await page.selectOption('#property', '2010');
    await page.waitForTimeout(100);

    // 業者選択
    await page.selectOption('#vendor', { index: 1 });

    // 点検種別選択
    await page.selectOption('#inspectionType', { index: 1 });

    // 日付入力
    await page.fill('#startDate', '2025-02-01');

    // データ追加
    await page.click('button:has-text("データを追加")');
    await page.waitForTimeout(200);

    // データ件数が1になることを確認
    await expect(page.locator('#dataCount')).toContainText('1');
  });

  test('複数件のデータを追加できる', async ({ page }) => {
    // 1件目
    await page.selectOption('#property', '2010');
    await page.waitForTimeout(100);
    await page.selectOption('#vendor', { index: 1 });
    await page.selectOption('#inspectionType', { index: 1 });
    await page.fill('#startDate', '2025-02-01');
    await page.click('button:has-text("データを追加")');
    await page.waitForTimeout(200);

    // 2件目
    await page.selectOption('#property', '120406');
    await page.waitForTimeout(100);
    await page.selectOption('#vendor', { index: 1 });
    await page.selectOption('#inspectionType', { index: 2 });
    await page.fill('#startDate', '2025-02-15');
    await page.click('button:has-text("データを追加")');
    await page.waitForTimeout(200);

    // データ件数が2になることを確認
    await expect(page.locator('#dataCount')).toContainText('2');
  });

  test('データを追加すると申請ボタンが有効になる', async ({ page }) => {
    await page.selectOption('#property', '2010');
    await page.waitForTimeout(100);
    await page.selectOption('#vendor', { index: 1 });
    await page.selectOption('#inspectionType', { index: 1 });
    await page.fill('#startDate', '2025-02-01');

    await page.click('button:has-text("データを追加")');
    await page.waitForTimeout(200);

    await expect(page.locator('#submitBtn')).toBeVisible();
  });

  test('申請ボタンを押すとデータがサーバーに送信される', async ({ page }) => {
    await page.selectOption('#property', '2010');
    await page.waitForTimeout(100);
    await page.selectOption('#vendor', { index: 1 });
    await page.selectOption('#inspectionType', { index: 1 });
    await page.fill('#startDate', '2025-02-01');

    await page.click('button:has-text("データを追加")');
    await page.waitForTimeout(200);

    await page.click('#submitBtn');
    await page.waitForTimeout(500);

    // 成功メッセージが表示される
    await expect(page.locator('.toast')).toContainText('申請');
  });

  test('CSVプレビューボタンでCSV形式を確認できる', async ({ page }) => {
    await page.selectOption('#property', '2010');
    await page.waitForTimeout(100);
    await page.selectOption('#vendor', { index: 1 });
    await page.selectOption('#inspectionType', { index: 1 });
    await page.fill('#startDate', '2025-02-01');

    await page.click('button:has-text("データを追加")');
    await page.waitForTimeout(200);

    // CSVプレビューを開く
    await page.click('button:has-text("CSV")');
    await expect(page.locator('#previewModal')).toBeVisible();

    // CSVに必要なカラムが含まれていることを確認
    const csvContent = await page.locator('#csvPreview').textContent();
    expect(csvContent).toContain('端末ID');
    expect(csvContent).toContain('2010');
  });

  test('備考欄に入力した内容がCSVに反映される', async ({ page }) => {
    await page.selectOption('#property', '2010');
    await page.waitForTimeout(100);
    await page.selectOption('#vendor', { index: 1 });
    await page.selectOption('#inspectionType', { index: 1 });
    await page.fill('#startDate', '2025-02-01');
    await page.fill('#remarks', 'テスト備考メッセージ');

    await page.click('button:has-text("データを追加")');
    await page.waitForTimeout(200);

    await page.click('button:has-text("CSV")');
    await expect(page.locator('#previewModal')).toBeVisible();

    const csvContent = await page.locator('#csvPreview').textContent();
    expect(csvContent).toContain('テスト備考メッセージ');
  });
});

// ============================================
// 一括入力テスト
// ============================================
test.describe('一括入力', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
    });

    await setupAuthMockWithMasterData(page, '/bulk.html', {
      isAuthenticated: true,
      email: 'user@example.com'
    });

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(300);
  });

  test('行追加ボタンで新しい行を追加できる', async ({ page }) => {
    await page.click('#addRowBtn');
    await page.waitForTimeout(200);

    const rows = page.locator('#tableBody tr');
    await expect(rows).toHaveCount(1);
  });

  test('必須項目を入力するとステータスがOKになる', async ({ page }) => {
    await page.click('#addRowBtn');
    await page.waitForTimeout(200);

    const row = page.locator('#tableBody tr:first-child');
    await row.locator('.property-select').selectOption({ index: 1 });
    await page.waitForTimeout(100);
    await row.locator('.vendor-select').selectOption({ index: 1 });
    await row.locator('.inspection-select').selectOption({ index: 1 });

    await expect(row.locator('.status-badge')).toHaveText('OK');
  });

  test('Excelからコピーしたデータを貼り付けて取り込める', async ({ page }) => {
    // 貼り付けモーダルを開く
    await page.click('#pasteBtn');
    await expect(page.locator('#pasteModal.active')).toBeVisible();

    // Excelデータを貼り付け
    const excelData = '2010\th0001A00\t山本クリーンシステム　有限会社\t092-934-0407\tエレベーター定期点検\t2025/02/01\t2025/02/01\tテスト備考';
    await page.fill('#pasteArea', excelData);

    // 取り込む
    await page.click('#importPasteBtn');
    await page.waitForTimeout(300);

    // データが取り込まれたことを確認
    const rows = page.locator('#tableBody tr');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
  });

  test('複数行を選択して一括削除できる', async ({ page }) => {
    // 2行追加
    await page.click('#addRowBtn');
    await page.click('#addRowBtn');
    await page.waitForTimeout(200);

    // 全選択
    await page.click('#selectAll');
    await page.waitForTimeout(100);

    // 削除ボタンをクリック（確認ダイアログを受け入れ）
    page.on('dialog', dialog => dialog.accept());
    await page.click('#deleteSelectedBtn');
    await page.waitForTimeout(200);

    // 行が削除されたことを確認
    const rows = page.locator('#tableBody tr');
    await expect(rows).toHaveCount(0);
  });

  test('有効なデータがある状態で保存ボタンが有効になる', async ({ page }) => {
    await page.click('#addRowBtn');
    await page.waitForTimeout(200);

    const row = page.locator('#tableBody tr:first-child');
    await row.locator('.property-select').selectOption({ index: 1 });
    await page.waitForTimeout(100);
    await row.locator('.vendor-select').selectOption({ index: 1 });
    await row.locator('.inspection-select').selectOption({ index: 1 });

    await expect(row.locator('.status-badge')).toHaveText('OK');
    await expect(page.locator('#saveBtn')).toBeEnabled({ timeout: 5000 });
  });

  test('保存ボタンを押すとデータがサーバーに送信される', async ({ page }) => {
    await page.click('#addRowBtn');
    await page.waitForTimeout(200);

    const row = page.locator('#tableBody tr:first-child');
    await row.locator('.property-select').selectOption({ index: 1 });
    await page.waitForTimeout(100);
    await row.locator('.vendor-select').selectOption({ index: 1 });
    await row.locator('.inspection-select').selectOption({ index: 1 });

    await expect(page.locator('#saveBtn')).toBeEnabled({ timeout: 5000 });
    await page.click('#saveBtn');
    await page.waitForTimeout(500);

    // 成功メッセージが表示される
    await expect(page.locator('.toast')).toBeVisible();
  });

  test('CSVコピーボタンでクリップボードにコピーできる', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await page.click('#addRowBtn');
    await page.waitForTimeout(200);

    const row = page.locator('#tableBody tr:first-child');
    await row.locator('.property-select').selectOption({ index: 1 });
    await page.waitForTimeout(100);
    await row.locator('.vendor-select').selectOption({ index: 1 });
    await row.locator('.inspection-select').selectOption({ index: 1 });

    await expect(page.locator('#copyCsvBtn')).toBeEnabled({ timeout: 5000 });
    await page.click('#copyCsvBtn');

    // 成功メッセージが表示される
    await expect(page.locator('.toast')).toContainText('コピー');
  });
});

// ============================================
// エラーケーステスト
// ============================================
test.describe('エラーケース', () => {
  test('一件入力で必須項目が未入力の場合はデータ追加できない', async ({ page }) => {
    await setupAuthMockWithMasterData(page, '/', {
      isAuthenticated: true,
      email: 'user@example.com'
    });

    await page.waitForLoadState('networkidle');

    // 何も入力せずにデータ追加を試みる
    await page.click('button:has-text("データを追加")');
    await page.waitForTimeout(200);

    // データ件数は0のまま
    await expect(page.locator('#dataCount')).toContainText('0');
  });

  test('一括入力で必須項目が未入力の行はエラーステータスになる', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
    });

    await setupAuthMockWithMasterData(page, '/bulk.html', {
      isAuthenticated: true,
      email: 'user@example.com'
    });

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(300);

    // 行を追加するが何も入力しない
    await page.click('#addRowBtn');
    await page.waitForTimeout(200);

    // ステータスがエラーであることを確認
    const row = page.locator('#tableBody tr:first-child');
    await expect(row.locator('.status-badge')).toHaveText('エラー');
  });
});
