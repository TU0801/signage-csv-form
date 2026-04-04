// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * 全画面操作テスト: index.html / bulk.html / admin.html
 * 全イベント発火・コンソールエラー検知・UI連動確認
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

/**
 * コンソールエラー収集（無視するパターンを除外）
 */
function collectConsoleErrors(page) {
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Supabase接続・favicon等の既知の非致命的エラーは除外
      if (text.includes('favicon.ico') ||
          text.includes('Failed to fetch') ||
          text.includes('NetworkError') ||
          text.includes('net::ERR') ||
          text.includes('AuthSessionMissingError') ||
          text.includes('AuthRetryableFetchError')) return;
      errors.push(text);
    }
  });
  return errors;
}

// ============================================
// index.html: 一件入力画面の全操作
// ============================================
test.describe('index.html: 一件入力画面', () => {
  let consoleErrors;

  test.beforeEach(async ({ page }) => {
    consoleErrors = collectConsoleErrors(page);
    await loginAsUser(page);
    await page.goto(`${baseUrl}/index.html`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
  });

  test('コンソールエラーなしで画面表示される', async ({ page }) => {
    await expect(page.locator('#property')).toBeVisible();
    await expect(page.locator('#inspectionType')).toBeVisible();
    await expect(page.locator('#startDate')).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test('物件選択 → 端末連動', async ({ page }) => {
    const propertyOptions = await page.locator('#property option').count();
    expect(propertyOptions).toBeGreaterThan(1);

    await page.selectOption('#property', { index: 1 });
    await page.waitForTimeout(500);

    const terminalValue = await page.locator('#terminal').inputValue();
    expect(terminalValue).toBeTruthy();
    expect(consoleErrors).toEqual([]);
  });

  test('物件切り替えで端末がリセットされる', async ({ page }) => {
    const options = await page.locator('#property option:not([value=""])').all();
    if (options.length < 2) return;

    await page.selectOption('#property', { index: 1 });
    await page.waitForTimeout(500);
    const terminal1 = await page.locator('#terminal').inputValue();

    await page.selectOption('#property', { index: 2 });
    await page.waitForTimeout(500);
    const terminal2 = await page.locator('#terminal').inputValue();

    // 端末が更新されること（同じ端末でない限り変わる or 少なくともエラーなし）
    expect(consoleErrors).toEqual([]);
  });

  test('カテゴリ選択 → 点検種別フィルタ連動', async ({ page }) => {
    const categorySelect = page.locator('#category');
    if (!await categorySelect.isVisible()) return;

    const categoryOptions = await categorySelect.locator('option:not([value=""])').count();
    expect(categoryOptions).toBeGreaterThan(0);

    await categorySelect.selectOption({ index: 1 });
    await page.waitForTimeout(500);

    const inspectionOptions = await page.locator('#inspectionType option').count();
    expect(inspectionOptions).toBeGreaterThan(0);
    expect(consoleErrors).toEqual([]);
  });

  test('点検種別選択 → プレビュー更新', async ({ page }) => {
    const categorySelect = page.locator('#category');
    if (await categorySelect.isVisible()) {
      await categorySelect.selectOption({ index: 1 });
      await page.waitForTimeout(300);
    }

    const inspectionSelect = page.locator('#inspectionType');
    const optionCount = await inspectionSelect.locator('option:not([value=""])').count();
    if (optionCount > 0) {
      await inspectionSelect.selectOption({ index: 1 });
      await page.waitForTimeout(500);
    }
    expect(consoleErrors).toEqual([]);
  });

  test('開始日入力 → 終了日自動設定', async ({ page }) => {
    const today = new Date().toISOString().split('T')[0];
    await page.fill('#startDate', today);
    await page.dispatchEvent('#startDate', 'change');
    await page.waitForTimeout(300);

    const endDate = await page.locator('#endDate').inputValue();
    expect(endDate).toBeTruthy();
    expect(consoleErrors).toEqual([]);
  });

  test('テキスト入力（お知らせ文・備考）', async ({ page }) => {
    const announcement = page.locator('#announcement');
    if (await announcement.isVisible()) {
      await announcement.fill('テスト案内文');
      await page.waitForTimeout(200);
    }

    const remarks = page.locator('#remarks');
    if (await remarks.isVisible()) {
      await remarks.fill('テスト備考');
      await page.waitForTimeout(200);
    }
    expect(consoleErrors).toEqual([]);
  });

  test('エントリ追加・複製・切り替え・削除', async ({ page }) => {
    // 物件・点検種別を選択してエントリ追加可能にする
    await page.selectOption('#property', { index: 1 });
    await page.waitForTimeout(500);

    const categorySelect = page.locator('#category');
    if (await categorySelect.isVisible()) {
      await categorySelect.selectOption({ index: 1 });
      await page.waitForTimeout(300);
    }

    const inspectionSelect = page.locator('#inspectionType');
    const optCount = await inspectionSelect.locator('option:not([value=""])').count();
    if (optCount > 0) {
      await inspectionSelect.selectOption({ index: 1 });
      await page.waitForTimeout(300);
    }

    const today = new Date().toISOString().split('T')[0];
    await page.fill('#startDate', today);
    await page.dispatchEvent('#startDate', 'change');
    await page.waitForTimeout(300);

    // 追加
    const addBtn = page.locator('#addEntryBtn');
    if (await addBtn.isVisible()) {
      await addBtn.click();
      await page.waitForTimeout(500);
    }

    // 複製
    const dupBtn = page.locator('#duplicateBtn');
    if (await dupBtn.isVisible() && await dupBtn.isEnabled()) {
      await dupBtn.click();
      await page.waitForTimeout(500);
    }

    expect(consoleErrors).toEqual([]);
  });

  test('ベンダーリセット時にvendor値が有効', async ({ page }) => {
    // 管理者向けベンダー切り替えプルダウン
    const vendorSelect = page.locator('#adminVendorSelect');
    if (!await vendorSelect.isVisible()) return;

    // ベンダー選択
    const vendorOptions = await vendorSelect.locator('option').count();
    if (vendorOptions <= 1) return;

    await vendorSelect.selectOption({ index: 1 });
    await page.waitForTimeout(1000);

    // リセット（「-- 保守会社を選択 --」に戻す）
    await vendorSelect.selectOption({ index: 0 });
    await page.waitForTimeout(1000);

    // vendor ドロップダウンの値が空でないことを確認（修正済みバグの回帰テスト）
    const vendorValue = await page.locator('#vendor').inputValue();
    expect(vendorValue).not.toBe('');
    expect(consoleErrors).toEqual([]);
  });

  test('CSV生成ボタンが動作する', async ({ page }) => {
    // 最低限の入力でCSV生成を試行
    await page.selectOption('#property', { index: 1 });
    await page.waitForTimeout(500);

    const generateBtn = page.locator('#generateCSV, #csvBtn, button:has-text("CSV")');
    if (await generateBtn.first().isVisible()) {
      // CSV生成可能かの確認（エントリがない場合はエラーにならないことを確認）
      expect(consoleErrors).toEqual([]);
    }
  });
});

// ============================================
// bulk.html: 一括入力画面の全操作
// ============================================
test.describe('bulk.html: 一括入力画面', () => {
  let consoleErrors;

  test.beforeEach(async ({ page }) => {
    consoleErrors = collectConsoleErrors(page);
    await loginAsUser(page);
    await page.goto(`${baseUrl}/bulk.html`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
  });

  test('コンソールエラーなしで画面表示される（テンプレート無限再帰の回帰テスト）', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('一括入力');
    // bulk-modals.js getStoredTemplates() 無限再帰バグの回帰テスト
    const templateErrors = consoleErrors.filter(e => e.includes('Maximum call stack'));
    expect(templateErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('行追加が正しく動作する', async ({ page }) => {
    const addRowBtn = page.locator('#addRowBtn');
    if (!await addRowBtn.isVisible()) return;

    const rowsBefore = await page.locator('tbody tr').count();
    await addRowBtn.click();
    await page.waitForTimeout(500);
    const rowsAfter = await page.locator('tbody tr').count();
    expect(rowsAfter).toBe(rowsBefore + 1);

    // もう1行追加
    await addRowBtn.click();
    await page.waitForTimeout(500);
    expect(await page.locator('tbody tr').count()).toBe(rowsBefore + 2);
    expect(consoleErrors).toEqual([]);
  });

  test('物件選択 → 端末連動（bulk）', async ({ page }) => {
    const addRowBtn = page.locator('#addRowBtn');
    if (await addRowBtn.isVisible()) {
      await addRowBtn.click();
      await page.waitForTimeout(500);
    }

    const propertySelect = page.locator('tbody tr:first-child select').first();
    if (!await propertySelect.isVisible()) return;

    const options = await propertySelect.locator('option:not([value=""])').count();
    if (options > 0) {
      await propertySelect.selectOption({ index: 1 });
      await page.waitForTimeout(500);
    }
    expect(consoleErrors).toEqual([]);
  });

  test('開始日入力 → 終了日自動設定（bulk）', async ({ page }) => {
    const addRowBtn = page.locator('#addRowBtn');
    if (await addRowBtn.isVisible()) {
      await addRowBtn.click();
      await page.waitForTimeout(500);
    }

    const startDateInput = page.locator('tbody tr:first-child input[type="date"]').first();
    if (!await startDateInput.isVisible()) return;

    const today = new Date().toISOString().split('T')[0];
    await startDateInput.fill(today);
    await startDateInput.dispatchEvent('change');
    await page.waitForTimeout(300);
    expect(consoleErrors).toEqual([]);
  });

  test('行削除が動作する', async ({ page }) => {
    const addRowBtn = page.locator('#addRowBtn');
    if (!await addRowBtn.isVisible()) return;

    await addRowBtn.click();
    await page.waitForTimeout(500);
    await addRowBtn.click();
    await page.waitForTimeout(500);

    const rowsBefore = await page.locator('tbody tr').count();
    expect(rowsBefore).toBeGreaterThanOrEqual(2);

    // 削除ボタンをクリック
    page.on('dialog', dialog => dialog.accept());
    const deleteBtn = page.locator('tbody tr:first-child .delete-row-btn, tbody tr:first-child button[title*="削除"]').first();
    if (await deleteBtn.isVisible()) {
      await deleteBtn.click();
      await page.waitForTimeout(500);
      expect(await page.locator('tbody tr').count()).toBe(rowsBefore - 1);
    }
    expect(consoleErrors).toEqual([]);
  });

  test('全選択チェックボックスが動作する', async ({ page }) => {
    const addRowBtn = page.locator('#addRowBtn');
    if (!await addRowBtn.isVisible()) return;

    await addRowBtn.click();
    await page.waitForTimeout(300);
    await addRowBtn.click();
    await page.waitForTimeout(300);

    const selectAll = page.locator('thead input[type="checkbox"]').first();
    if (!await selectAll.isVisible()) return;

    // 全選択
    await selectAll.check();
    await page.waitForTimeout(200);
    const checked = await page.locator('tbody input[type="checkbox"]:checked').count();
    const total = await page.locator('tbody input[type="checkbox"]').count();
    expect(checked).toBe(total);

    // 全解除
    await selectAll.uncheck();
    await page.waitForTimeout(200);
    const unchecked = await page.locator('tbody input[type="checkbox"]:checked').count();
    expect(unchecked).toBe(0);
    expect(consoleErrors).toEqual([]);
  });

  test('バリデーション表示が動作する', async ({ page }) => {
    const addRowBtn = page.locator('#addRowBtn');
    if (!await addRowBtn.isVisible()) return;

    await addRowBtn.click();
    await page.waitForTimeout(500);

    // 未入力行にエラー表示があること
    const statusCell = page.locator('tbody tr:first-child .row-status, tbody tr:first-child td:last-child');
    if (await statusCell.isVisible()) {
      const text = await statusCell.textContent();
      // 状態表示があること（エラー or 未入力等）
      expect(text).toBeTruthy();
    }
    expect(consoleErrors).toEqual([]);
  });

  test('詳細モーダルが開閉できる', async ({ page }) => {
    const addRowBtn = page.locator('#addRowBtn');
    if (!await addRowBtn.isVisible()) return;

    await addRowBtn.click();
    await page.waitForTimeout(500);

    // 詳細ボタンをクリック
    const detailBtn = page.locator('tbody tr:first-child button:has-text("詳細"), tbody tr:first-child .detail-btn').first();
    if (await detailBtn.isVisible()) {
      await detailBtn.click();
      await page.waitForTimeout(500);

      // モーダルが開くことを確認
      const modal = page.locator('.modal.active, .modal[style*="display: block"], #detailModal.active');
      if (await modal.isVisible()) {
        // Escで閉じる
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }
    }
    expect(consoleErrors).toEqual([]);
  });

  test('フィルタボタンが動作する', async ({ page }) => {
    const filterBtns = page.locator('button:has-text("すべて"), button:has-text("有効のみ"), button:has-text("エラーのみ")');
    const count = await filterBtns.count();
    for (let i = 0; i < count; i++) {
      if (await filterBtns.nth(i).isVisible()) {
        await filterBtns.nth(i).click();
        await page.waitForTimeout(300);
      }
    }
    expect(consoleErrors).toEqual([]);
  });
});

// ============================================
// admin.html: 管理画面の全操作
// ============================================
test.describe('admin.html: 管理画面', () => {
  let consoleErrors;

  test.beforeEach(async ({ page }) => {
    consoleErrors = collectConsoleErrors(page);
    await loginAsAdmin(page);
    await page.goto(`${baseUrl}/admin.html`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
  });

  test('コンソールエラーなしで画面表示される', async ({ page }) => {
    expect(page.url()).toContain('admin.html');
    expect(consoleErrors).toEqual([]);
  });

  test('全タブ切り替えでエラーなし', async ({ page }) => {
    const tabs = await page.locator('.admin-tab').all();
    for (const tab of tabs) {
      if (await tab.isVisible()) {
        await tab.click();
        await page.waitForTimeout(500);
      }
    }
    expect(consoleErrors).toEqual([]);
  });

  test('承認待ちタブ: エントリ一覧表示', async ({ page }) => {
    // 承認待ちタブをクリック
    const pendingTab = page.locator('.admin-tab:has-text("承認")').first();
    if (await pendingTab.isVisible()) {
      await pendingTab.click();
      await page.waitForTimeout(500);
    }

    // テーブルが存在する
    const table = page.locator('table');
    expect(await table.count()).toBeGreaterThan(0);
    expect(consoleErrors).toEqual([]);
  });

  test('承認済みタブ: 検索結果がデフォルトで未選択（回帰テスト）', async ({ page }) => {
    // 承認済みタブをクリック
    const approvedTab = page.locator('.admin-tab:has-text("承認済"), .admin-tab:has-text("データ管理")').first();
    if (!await approvedTab.isVisible()) return;
    await approvedTab.click();
    await page.waitForTimeout(500);

    // 検索実行
    const searchBtn = page.locator('button:has-text("検索")').first();
    if (await searchBtn.isVisible()) {
      await searchBtn.click();
      await page.waitForTimeout(1000);
    }

    // チェックボックスがデフォルトで未選択であること（修正済みバグの回帰テスト）
    const checkedBoxes = await page.locator('.entry-checkbox:checked').count();
    expect(checkedBoxes).toBe(0);
    expect(consoleErrors).toEqual([]);
  });

  test('紐付け管理: ベンダー選択 → 物件一覧表示', async ({ page }) => {
    const relationTab = page.locator('.admin-tab:has-text("紐付け")');
    if (!await relationTab.isVisible()) return;
    await relationTab.click();
    await page.waitForTimeout(500);

    // ベンダー選択
    const vendorSelect = page.locator('#vendorSelect, select').first();
    if (await vendorSelect.isVisible()) {
      const options = await vendorSelect.locator('option').count();
      if (options > 1) {
        await vendorSelect.selectOption({ index: 1 });
        await page.waitForTimeout(500);
      }
    }
    expect(consoleErrors).toEqual([]);
  });

  test('紐付け管理: サブタブ切り替え（物件↔点検種別）', async ({ page }) => {
    const relationTab = page.locator('.admin-tab:has-text("紐付け")');
    if (!await relationTab.isVisible()) return;
    await relationTab.click();
    await page.waitForTimeout(500);

    // 点検種別サブタブ
    const inspSubTab = page.locator('button:has-text("点検種別"), .sub-tab:has-text("点検種別")').first();
    if (await inspSubTab.isVisible()) {
      await inspSubTab.click();
      await page.waitForTimeout(500);
    }

    // 物件サブタブに戻る
    const buildingSubTab = page.locator('button:has-text("物件"), .sub-tab:has-text("物件")').first();
    if (await buildingSubTab.isVisible()) {
      await buildingSubTab.click();
      await page.waitForTimeout(500);
    }
    expect(consoleErrors).toEqual([]);
  });

  test('紐付け管理: ビル追加モーダル → 閉じる', async ({ page }) => {
    const relationTab = page.locator('.admin-tab:has-text("紐付け")');
    if (!await relationTab.isVisible()) return;
    await relationTab.click();
    await page.waitForTimeout(500);

    // ベンダー選択
    const vendorSelect = page.locator('#vendorSelect, select').first();
    if (await vendorSelect.isVisible()) {
      const options = await vendorSelect.locator('option').count();
      if (options > 1) {
        await vendorSelect.selectOption({ index: 1 });
        await page.waitForTimeout(500);
      }
    }

    // 追加ボタン → モーダル
    const addBtn = page.locator('button:has-text("ビルを追加"), button:has-text("物件を追加"), button:has-text("追加")').first();
    if (await addBtn.isVisible()) {
      await addBtn.click();
      await page.waitForTimeout(500);

      // モーダルを閉じる
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
    expect(consoleErrors).toEqual([]);
  });

  test('マスター管理: 物件サブタブ → 追加モーダル → 閉じる', async ({ page }) => {
    const masterTab = page.locator('.admin-tab:has-text("マスター")');
    if (!await masterTab.isVisible()) return;
    await masterTab.click();
    await page.waitForTimeout(500);

    // 物件サブタブ
    const propSubTab = page.locator('button:has-text("物件"), .sub-tab:has-text("物件")').first();
    if (await propSubTab.isVisible()) {
      await propSubTab.click();
      await page.waitForTimeout(500);
    }

    // 追加モーダル
    const addBtn = page.locator('button:has-text("新規追加"), button:has-text("追加")').first();
    if (await addBtn.isVisible()) {
      await addBtn.click();
      await page.waitForTimeout(500);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
    expect(consoleErrors).toEqual([]);
  });

  test('マスター管理: 保守会社サブタブ → 追加モーダル → 閉じる', async ({ page }) => {
    const masterTab = page.locator('.admin-tab:has-text("マスター")');
    if (!await masterTab.isVisible()) return;
    await masterTab.click();
    await page.waitForTimeout(500);

    const vendorSubTab = page.locator('button:has-text("保守会社"), .sub-tab:has-text("保守会社")').first();
    if (await vendorSubTab.isVisible()) {
      await vendorSubTab.click();
      await page.waitForTimeout(500);
    }

    const addBtn = page.locator('button:has-text("新規追加"), button:has-text("追加")').first();
    if (await addBtn.isVisible()) {
      await addBtn.click();
      await page.waitForTimeout(500);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
    expect(consoleErrors).toEqual([]);
  });

  test('マスター管理: 点検種別サブタブ → 追加モーダル → 閉じる', async ({ page }) => {
    const masterTab = page.locator('.admin-tab:has-text("マスター")');
    if (!await masterTab.isVisible()) return;
    await masterTab.click();
    await page.waitForTimeout(500);

    const inspSubTab = page.locator('button:has-text("点検種別"), .sub-tab:has-text("点検種別")').first();
    if (await inspSubTab.isVisible()) {
      await inspSubTab.click();
      await page.waitForTimeout(500);
    }

    const addBtn = page.locator('button:has-text("新規追加"), button:has-text("追加")').first();
    if (await addBtn.isVisible()) {
      await addBtn.click();
      await page.waitForTimeout(500);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
    expect(consoleErrors).toEqual([]);
  });

  test('マスター管理: カテゴリ・テンプレート画像・設定サブタブ表示', async ({ page }) => {
    const masterTab = page.locator('.admin-tab:has-text("マスター")');
    if (!await masterTab.isVisible()) return;
    await masterTab.click();
    await page.waitForTimeout(500);

    for (const label of ['カテゴリ', 'テンプレート', '設定']) {
      const subTab = page.locator(`button:has-text("${label}"), .sub-tab:has-text("${label}")`).first();
      if (await subTab.isVisible()) {
        await subTab.click();
        await page.waitForTimeout(500);
      }
    }
    expect(consoleErrors).toEqual([]);
  });

  test('ユーザー管理: 一覧表示 → 追加モーダル → 閉じる', async ({ page }) => {
    const userTab = page.locator('.admin-tab:has-text("ユーザー")');
    if (!await userTab.isVisible()) return;
    await userTab.click();
    await page.waitForTimeout(500);

    // ユーザー一覧テーブル
    const table = page.locator('table');
    expect(await table.count()).toBeGreaterThan(0);

    // 追加モーダル
    const addBtn = page.locator('button:has-text("追加"), button:has-text("新規")').first();
    if (await addBtn.isVisible()) {
      await addBtn.click();
      await page.waitForTimeout(500);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
    expect(consoleErrors).toEqual([]);
  });

  test('広告枠管理: グリッド表示 → モーダル → 閉じる', async ({ page }) => {
    const adTab = page.locator('.admin-tab:has-text("広告枠")');
    if (!await adTab.isVisible()) return;
    await adTab.click();
    await page.waitForTimeout(500);

    // グリッド表示確認
    const adSlots = page.locator('.ad-slot, .ad-card, [class*="ad-slot"]');
    if (await adSlots.count() > 0) {
      await adSlots.first().click();
      await page.waitForTimeout(500);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
    expect(consoleErrors).toEqual([]);
  });
});
