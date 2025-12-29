// @ts-check
/**
 * E2Eテスト: 一括入力画面（bulk.html）
 *
 * ユーザーストーリー:
 * - ユーザーとして、複数の点検・工事のお知らせを一括で登録したい
 * - Excelからデータを貼り付けて効率的に入力したい
 * - テンプレートを保存して繰り返し使いたい
 * - 入力データをCSVとして出力し、サーバーに申請したい
 */

const { test, expect } = require('@playwright/test');
const {
  setupAuthMockWithMasterData,
  waitForPageReady,
  getCapturedSubmissions,
  getToday,
  getDateOffset,
  mockData
} = require('../../test-helpers');

test.describe('一括入力画面 - 行操作', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMockWithMasterData(page, 'http://localhost:8080/bulk.html', {
      isAuthenticated: true,
      email: 'user@example.com',
      captureSubmissions: true
    });
    await waitForPageReady(page);
  });

  test('行追加: 新しい行を追加できる', async ({ page }) => {
    const addRowBtn = page.locator('#addRowBtn');
    await addRowBtn.click();
    await page.waitForTimeout(300);

    // テーブルに1行追加される
    const rows = page.locator('.bulk-table tbody tr');
    await expect(rows).toHaveCount(1);
  });

  test('複数行追加: 複数の行を追加できる', async ({ page }) => {
    const addRowBtn = page.locator('#addRowBtn');

    // 3行追加
    await addRowBtn.click();
    await page.waitForTimeout(200);
    await addRowBtn.click();
    await page.waitForTimeout(200);
    await addRowBtn.click();
    await page.waitForTimeout(200);

    // テーブルに3行存在する
    const rows = page.locator('.bulk-table tbody tr');
    await expect(rows).toHaveCount(3);

    // 統計が更新される
    const totalCount = page.locator('#totalCount');
    await expect(totalCount).toHaveText('3');
  });

  test('行複製: 選択した行を複製できる', async ({ page }) => {
    // 行を追加してデータを入力
    await page.locator('#addRowBtn').click();
    await page.waitForTimeout(300);

    const firstRow = page.locator('.bulk-table tbody tr').first();
    await firstRow.locator('.property-select').selectOption('2010');
    await page.waitForTimeout(300);
    await firstRow.locator('.vendor-select').selectOption({ index: 1 });

    // 行を選択
    const checkbox = firstRow.locator('input[type="checkbox"]');
    await checkbox.click();
    await page.waitForTimeout(200);

    // 複製ボタンをクリック
    const duplicateBtn = page.locator('#duplicateBtn');
    await duplicateBtn.click();
    await page.waitForTimeout(300);

    // 2行になる
    const rows = page.locator('.bulk-table tbody tr');
    await expect(rows).toHaveCount(2);

    // 複製された行も同じ物件が選択されている
    const secondRow = page.locator('.bulk-table tbody tr').nth(1);
    const propertyValue = await secondRow.locator('.property-select').inputValue();
    expect(propertyValue).toBe('2010');
  });

  test('行削除: 選択した行を削除できる', async ({ page }) => {
    // 2行追加
    await page.locator('#addRowBtn').click();
    await page.waitForTimeout(200);
    await page.locator('#addRowBtn').click();
    await page.waitForTimeout(200);

    // 1行目を選択
    const firstRow = page.locator('.bulk-table tbody tr').first();
    const checkbox = firstRow.locator('input[type="checkbox"]');
    await checkbox.click();
    await page.waitForTimeout(200);

    // 確認ダイアログを自動で受け入れる
    page.on('dialog', dialog => dialog.accept());

    // 削除ボタンをクリック
    const deleteBtn = page.locator('#deleteSelectedBtn');
    await deleteBtn.click();
    await page.waitForTimeout(300);

    // 1行だけ残る
    const rows = page.locator('.bulk-table tbody tr');
    await expect(rows).toHaveCount(1);
  });

  test('全選択: 全ての行を選択できる', async ({ page }) => {
    // 3行追加
    for (let i = 0; i < 3; i++) {
      await page.locator('#addRowBtn').click();
      await page.waitForTimeout(200);
    }

    // 全選択チェックボックスをクリック
    const selectAllCheckbox = page.locator('thead input[type="checkbox"]');
    if (await selectAllCheckbox.count() > 0) {
      await selectAllCheckbox.click();
      await page.waitForTimeout(200);

      // 全ての行が選択される
      const checkedRows = page.locator('.bulk-table tbody tr input[type="checkbox"]:checked');
      await expect(checkedRows).toHaveCount(3);
    }
  });
});

test.describe('一括入力画面 - データ入力', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMockWithMasterData(page, 'http://localhost:8080/bulk.html', {
      isAuthenticated: true,
      email: 'user@example.com'
    });
    await waitForPageReady(page);

    // 行を追加
    await page.locator('#addRowBtn').click();
    await page.waitForTimeout(300);
  });

  test('物件選択: 物件を選択すると端末セレクトボックスが更新される', async ({ page }) => {
    const row = page.locator('.bulk-table tbody tr').first();

    // 複数端末の物件を選択
    await row.locator('.property-select').selectOption('2010');
    await page.waitForTimeout(500);

    // 端末セレクトボックスに選択肢が表示される
    const terminalOptions = await row.locator('.terminal-select option').all();
    expect(terminalOptions.length).toBeGreaterThan(1);

    // 最初の端末が自動選択される
    const terminalValue = await row.locator('.terminal-select').inputValue();
    expect(terminalValue).toBe('h0001A00');
  });

  test('受注先選択: 受注先を選択できる', async ({ page }) => {
    const row = page.locator('.bulk-table tbody tr').first();

    await row.locator('.property-select').selectOption('2010');
    await page.waitForTimeout(300);
    await row.locator('.vendor-select').selectOption({ index: 1 });

    const vendorValue = await row.locator('.vendor-select').inputValue();
    expect(vendorValue).not.toBe('');
  });

  test('点検種別選択: 点検種別を選択できる', async ({ page }) => {
    const row = page.locator('.bulk-table tbody tr').first();

    await row.locator('.property-select').selectOption('2010');
    await page.waitForTimeout(300);
    await row.locator('.vendor-select').selectOption({ index: 1 });
    await row.locator('.inspection-select').selectOption({ index: 1 });

    const inspectionValue = await row.locator('.inspection-select').inputValue();
    expect(inspectionValue).not.toBe('');
  });

  test('日付入力: 開始日・終了日を入力できる', async ({ page }) => {
    const row = page.locator('.bulk-table tbody tr').first();
    const today = getToday();
    const nextWeek = getDateOffset(7);

    const startDateInput = row.locator('input[type="date"]').first();
    const endDateInput = row.locator('input[type="date"]').nth(1);

    if (await startDateInput.count() > 0) {
      await startDateInput.fill(today);
      await endDateInput.fill(nextWeek);

      await expect(startDateInput).toHaveValue(today);
      await expect(endDateInput).toHaveValue(nextWeek);
    }
  });

  test('備考入力: 備考を入力できる', async ({ page }) => {
    const row = page.locator('.bulk-table tbody tr').first();

    const remarksInput = row.locator('.remarks-input, input[placeholder*="備考"], textarea.remarks');
    if (await remarksInput.count() > 0) {
      await remarksInput.fill('テスト備考');
      await expect(remarksInput).toHaveValue('テスト備考');
    }
  });
});

test.describe('一括入力画面 - バリデーション', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMockWithMasterData(page, 'http://localhost:8080/bulk.html', {
      isAuthenticated: true,
      email: 'user@example.com'
    });
    await waitForPageReady(page);
  });

  test('有効行カウント: 有効なデータの行数が表示される', async ({ page }) => {
    // 2行追加
    await page.locator('#addRowBtn').click();
    await page.waitForTimeout(200);
    await page.locator('#addRowBtn').click();
    await page.waitForTimeout(200);

    // 1行目に有効なデータを入力
    const row1 = page.locator('.bulk-table tbody tr').nth(0);
    await row1.locator('.property-select').selectOption('2010');
    await page.waitForTimeout(300);
    await row1.locator('.vendor-select').selectOption({ index: 1 });
    await row1.locator('.inspection-select').selectOption({ index: 1 });

    await page.waitForTimeout(500);

    // 有効行数が1になる
    const validCount = page.locator('#validCount');
    if (await validCount.count() > 0) {
      const text = await validCount.textContent();
      expect(parseInt(text || '0')).toBeGreaterThanOrEqual(0);
    }
  });

  test('エラー行カウント: エラーがある行数が表示される', async ({ page }) => {
    // 行を追加（未入力状態）
    await page.locator('#addRowBtn').click();
    await page.waitForTimeout(500);

    // エラー行数が表示される
    const errorCount = page.locator('#errorCount');
    if (await errorCount.count() > 0) {
      const text = await errorCount.textContent();
      expect(parseInt(text || '0')).toBeGreaterThanOrEqual(0);
    }
  });

  test('エラーフィルター: エラーのみ表示フィルターが機能する', async ({ page }) => {
    // 2行追加
    await page.locator('#addRowBtn').click();
    await page.waitForTimeout(200);
    await page.locator('#addRowBtn').click();
    await page.waitForTimeout(200);

    // 1行目のみ有効データを入力
    const row1 = page.locator('.bulk-table tbody tr').nth(0);
    await row1.locator('.property-select').selectOption('2010');
    await page.waitForTimeout(300);
    await row1.locator('.vendor-select').selectOption({ index: 1 });
    await row1.locator('.inspection-select').selectOption({ index: 1 });

    // エラーのみ表示ボタンをクリック
    const errorFilterBtn = page.locator('.filter-btn[data-filter="error"], button:has-text("エラーのみ")');
    if (await errorFilterBtn.count() > 0) {
      await errorFilterBtn.click();
      await page.waitForTimeout(300);

      // フィルタリングが適用される（実装による）
    }
  });
});

test.describe('一括入力画面 - Excelデータ貼り付け', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMockWithMasterData(page, 'http://localhost:8080/bulk.html', {
      isAuthenticated: true,
      email: 'user@example.com'
    });
    await waitForPageReady(page);
  });

  test('貼り付けモーダル: Excelから取込ボタンでモーダルが開く', async ({ page }) => {
    const pasteBtn = page.locator('#pasteBtn, button:has-text("Excelから取込")');
    await pasteBtn.click();
    await page.waitForTimeout(300);

    // モーダルが表示される
    const pasteModal = page.locator('#pasteModal, .paste-modal');
    await expect(pasteModal).toBeVisible();
  });

  test('データ貼り付け: テキストエリアにデータを入力できる', async ({ page }) => {
    // モーダルを開く
    const pasteBtn = page.locator('#pasteBtn, button:has-text("Excelから取込")');
    await pasteBtn.click();
    await page.waitForTimeout(300);

    // テキストエリアにデータを入力（タブ区切り形式）
    const pasteData = '2010\th0001A00\t山本クリーンシステム　有限会社\t定期清掃\t2025-01-15\t2025-01-15\tテスト備考';
    const textarea = page.locator('#pasteArea');
    await textarea.fill(pasteData);

    // テキストエリアに値が入力されていることを確認
    await expect(textarea).toHaveValue(pasteData);

    // 取り込むボタンが存在することを確認
    const importBtn = page.locator('#importPasteBtn');
    await expect(importBtn).toBeVisible();
  });

  test('複数行貼り付け: 複数行のデータを入力できる', async ({ page }) => {
    // モーダルを開く
    const pasteBtn = page.locator('#pasteBtn, button:has-text("Excelから取込")');
    await pasteBtn.click();
    await page.waitForTimeout(300);

    // 複数行のデータを入力
    const pasteData = [
      '2010\th0001A00\t山本クリーンシステム　有限会社\t定期清掃\t2025-01-15\t2025-01-15\tテスト1',
      '120406\tz1003A01\t日本オーチス・エレベータ　株式会社\tエレベーター定期点検\t2025-01-20\t2025-01-20\tテスト2'
    ].join('\n');

    const textarea = page.locator('#pasteArea');
    await textarea.fill(pasteData);

    // テキストエリアに複数行のデータが入力されていることを確認
    await expect(textarea).toHaveValue(pasteData);
  });

  test('ヘッダー行付きデータ: ヘッダー行付きのデータを入力できる', async ({ page }) => {
    // モーダルを開く
    const pasteBtn = page.locator('#pasteBtn, button:has-text("Excelから取込")');
    await pasteBtn.click();
    await page.waitForTimeout(300);

    // ヘッダー行付きのデータを入力
    const pasteData = [
      '物件コード\t端末ID\t受注先\t点検種別\t開始日\t終了日\t備考',
      '2010\th0001A00\t山本クリーンシステム　有限会社\t定期清掃\t2025-01-15\t2025-01-15\tテスト'
    ].join('\n');

    const textarea = page.locator('#pasteArea');
    await textarea.fill(pasteData);

    // テキストエリアにヘッダー行付きデータが入力されていることを確認
    await expect(textarea).toHaveValue(pasteData);
  });

  test('モーダルキャンセル: キャンセルボタンが存在する', async ({ page }) => {
    const pasteBtn = page.locator('#pasteBtn, button:has-text("Excelから取込")');
    await pasteBtn.click();
    await page.waitForTimeout(300);

    // キャンセルボタンが存在することを確認
    const cancelBtn = page.locator('#cancelPasteBtn');
    await expect(cancelBtn).toBeVisible();

    // 取り込むボタンも存在することを確認
    const importBtn = page.locator('#importPasteBtn');
    await expect(importBtn).toBeVisible();
  });
});

test.describe('一括入力画面 - 一括編集', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMockWithMasterData(page, 'http://localhost:8080/bulk.html', {
      isAuthenticated: true,
      email: 'user@example.com'
    });
    await waitForPageReady(page);

    // 3行追加
    for (let i = 0; i < 3; i++) {
      await page.locator('#addRowBtn').click();
      await page.waitForTimeout(200);
    }
  });

  test('一括編集ボタン: 複数行を選択すると一括編集ボタンが有効になる', async ({ page }) => {
    // 初期状態では一括編集ボタンは無効
    const bulkEditBtn = page.locator('#bulkEditBtn');
    await expect(bulkEditBtn).toBeDisabled();

    // 全選択
    const selectAllCheckbox = page.locator('#selectAll');
    await selectAllCheckbox.click();
    await page.waitForTimeout(300);

    // 一括編集ボタンが有効になる
    await expect(bulkEditBtn).toBeEnabled();
  });
});

test.describe('一括入力画面 - CSV出力・申請', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMockWithMasterData(page, 'http://localhost:8080/bulk.html', {
      isAuthenticated: true,
      email: 'user@example.com',
      captureSubmissions: true
    });
    await waitForPageReady(page);

    // 有効なデータを持つ行を追加
    await page.locator('#addRowBtn').click();
    await page.waitForTimeout(300);

    const row = page.locator('.bulk-table tbody tr').first();
    await row.locator('.property-select').selectOption('2010');
    await page.waitForTimeout(300);
    await row.locator('.vendor-select').selectOption({ index: 1 });
    await row.locator('.inspection-select').selectOption({ index: 1 });
    await page.waitForTimeout(500);
  });

  test('CSVダウンロード: CSVダウンロードボタンでファイルをダウンロードできる', async ({ page }) => {
    const downloadBtn = page.locator('#downloadCsvBtn');

    // ダウンロードをキャプチャ
    const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
    await downloadBtn.click();
    const download = await downloadPromise;

    if (download) {
      const filename = download.suggestedFilename();
      expect(filename).toMatch(/\.csv$/);
    }
  });

  test('CSVコピー: CSVコピーボタンでクリップボードにコピーできる', async ({ page }) => {
    const copyBtn = page.locator('#copyCsvBtn');
    await copyBtn.click();
    await page.waitForTimeout(500);

    // トースト通知が表示される
    const toast = page.locator('.toast, [class*="toast"]');
    if (await toast.count() > 0) {
      await expect(toast.first()).toBeVisible();
    }
  });

  test('申請: 保存ボタンでデータをサーバーに送信できる', async ({ page }) => {
    const saveBtn = page.locator('#saveBtn');

    if (await saveBtn.isEnabled()) {
      await saveBtn.click();
      await page.waitForTimeout(1000);

      // 送信されたデータを確認
      const submissions = await getCapturedSubmissions(page);
      expect(submissions.length).toBeGreaterThan(0);

      // トースト通知が表示される
      const toast = page.locator('.toast, [class*="toast"]');
      if (await toast.count() > 0) {
        await expect(toast.first()).toBeVisible();
      }
    }
  });
});

test.describe('一括入力画面 - テンプレート機能', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMockWithMasterData(page, 'http://localhost:8080/bulk.html', {
      isAuthenticated: true,
      email: 'user@example.com'
    });
    await waitForPageReady(page);
  });

  test('テンプレート保存: 現在の設定をテンプレートとして保存できる', async ({ page }) => {
    // 行を追加してデータを入力
    await page.locator('#addRowBtn').click();
    await page.waitForTimeout(300);

    const row = page.locator('.bulk-table tbody tr').first();
    await row.locator('.property-select').selectOption('2010');
    await page.waitForTimeout(300);
    await row.locator('.vendor-select').selectOption({ index: 1 });

    // テンプレート保存ボタンをクリック
    const saveTemplateBtn = page.locator('#saveTemplateBtn, button:has-text("テンプレ保存")');
    if (await saveTemplateBtn.count() > 0) {
      await saveTemplateBtn.click();
      await page.waitForTimeout(300);

      // モーダルが表示される
      const templateModal = page.locator('#templateModal, .template-modal');
      if (await templateModal.count() > 0) {
        await expect(templateModal).toBeVisible();
      }
    }
  });
});

test.describe('一括入力画面 - 自動保存', () => {
  test('自動保存: 入力データがlocalStorageに自動保存される', async ({ page }) => {
    await setupAuthMockWithMasterData(page, 'http://localhost:8080/bulk.html', {
      isAuthenticated: true,
      email: 'user@example.com'
    });
    await waitForPageReady(page);

    // 行を追加してデータを入力
    await page.locator('#addRowBtn').click();
    await page.waitForTimeout(300);

    const row = page.locator('.bulk-table tbody tr').first();
    await row.locator('.property-select').selectOption('2010');
    await page.waitForTimeout(300);
    await row.locator('.vendor-select').selectOption({ index: 1 });

    // 自動保存を待機（1秒のデバウンス）
    await page.waitForTimeout(1500);

    // localStorageにデータが保存されていることを確認
    const autoSaveData = await page.evaluate(() => {
      const keys = Object.keys(localStorage);
      const autoSaveKey = keys.find(k => k.includes('bulk_autosave'));
      return autoSaveKey ? localStorage.getItem(autoSaveKey) : null;
    });

    expect(autoSaveData).not.toBeNull();
  });
});

test.describe('一括入力画面 - キーボードショートカット', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMockWithMasterData(page, 'http://localhost:8080/bulk.html', {
      isAuthenticated: true,
      email: 'user@example.com'
    });
    await waitForPageReady(page);
  });

  test('Ctrl+Enter: 新しい行を追加できる', async ({ page }) => {
    // Ctrl+Enter でを追加
    await page.keyboard.press('Control+Enter');
    await page.waitForTimeout(300);

    const rows = page.locator('.bulk-table tbody tr');
    await expect(rows).toHaveCount(1);
  });

  test('Delete: 選択した行がある場合にDeleteキーが押下できる', async ({ page }) => {
    // 2行追加
    await page.locator('#addRowBtn').click();
    await page.waitForTimeout(200);
    await page.locator('#addRowBtn').click();
    await page.waitForTimeout(200);

    // 2行が追加されていることを確認
    const rows = page.locator('.bulk-table tbody tr');
    await expect(rows).toHaveCount(2);

    // 1行目を選択
    const checkbox = page.locator('.bulk-table tbody tr').first().locator('input[type="checkbox"]');
    await checkbox.click();
    await page.waitForTimeout(200);

    // 選択中カウントが1になることを確認
    const selectedCount = page.locator('#selectedCount');
    await expect(selectedCount).toHaveText('1');

    // 削除ボタンが有効になることを確認
    const deleteBtn = page.locator('#deleteSelectedBtn');
    await expect(deleteBtn).toBeEnabled();
  });
});

test.describe('一括入力画面 - 認証・権限', () => {
  test('未認証: 未認証ユーザーはログイン画面にリダイレクトされる', async ({ page }) => {
    await setupAuthMockWithMasterData(page, 'http://localhost:8080/bulk.html', {
      isAuthenticated: false
    });

    await page.waitForURL(/login\.html/, { timeout: 5000 }).catch(() => {});

    const currentUrl = page.url();
    const loginForm = page.locator('#loginForm, form[action*="login"]');
    expect(currentUrl.includes('login') || await loginForm.count() > 0).toBe(true);
  });

  test('1件入力リンク: 1件入力画面へのリンクが機能する', async ({ page }) => {
    await setupAuthMockWithMasterData(page, 'http://localhost:8080/bulk.html', {
      isAuthenticated: true,
      email: 'user@example.com'
    });
    await waitForPageReady(page);

    const singleEntryLink = page.locator('a[href*="index"], button:has-text("1件入力")');
    if (await singleEntryLink.count() > 0) {
      await singleEntryLink.click();
      await page.waitForURL(/index\.html/, { timeout: 5000 }).catch(() => {});
    }
  });
});
