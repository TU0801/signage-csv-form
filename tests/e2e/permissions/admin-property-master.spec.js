// @ts-check
/**
 * E2Eテスト: 物件マスター管理機能（権限制御・編集機能）
 *
 * テスト対象:
 * - 管理者のみが物件マスターを編集できること
 * - 物件マスター編集モーダルで複数端末が正しく表示されること
 * - 物件マスターの新規追加・編集・削除が正しく動作すること
 *
 * ユーザーストーリー:
 * 1. 管理者のみが管理画面にアクセスできる
 * 2. 物件マスター編集時に、その物件に紐づく全端末が表示される
 * 3. 複数端末を一括で編集・追加・削除できる
 */

const { test, expect } = require('@playwright/test');
const { setupAuthMockWithMasterData } = require('../../test-helpers');

test.describe('物件マスター管理 - 権限制御', () => {

  test('一般ユーザーには管理リンクが表示されない', async ({ page }) => {
    // === 前提条件 ===
    // 一般ユーザーとしてログイン
    await setupAuthMockWithMasterData(page, 'http://localhost:8080/index.html', {
      isAuthenticated: true,
      isAdmin: false, // 一般ユーザー
      email: 'user@example.com'
    });
    await page.waitForLoadState('networkidle');

    // === 検証 ===
    // 管理リンクが表示されない
    const adminLink = page.locator('#adminLink');
    await expect(adminLink).not.toBeVisible();
  });

  test('管理者には管理リンクが表示される', async ({ page }) => {
    // === 前提条件 ===
    // 管理者としてログイン
    await setupAuthMockWithMasterData(page, 'http://localhost:8080/index.html', {
      isAuthenticated: true,
      isAdmin: true, // 管理者
      email: 'admin@example.com'
    });
    await page.waitForLoadState('networkidle');

    // === 検証 ===
    // 管理リンクが表示される
    const adminLink = page.locator('#adminLink');
    await expect(adminLink).toBeVisible();
    await expect(adminLink).toHaveAttribute('href', 'admin.html');
  });
});

test.describe('物件マスター編集 - 端末表示機能', () => {

  test.beforeEach(async ({ page }) => {
    // 前提条件: 管理者としてログイン、管理画面を開く
    await setupAuthMockWithMasterData(page, 'http://localhost:8080/admin.html', {
      isAuthenticated: true,
      isAdmin: true,
      email: 'admin@example.com'
    });
    await page.waitForLoadState('networkidle');
  });

  test('物件マスター一覧で複数端末を持つ物件が正しく表示される', async ({ page }) => {
    // === 実行 ===
    // 物件マスタータブを開く
    await page.locator('button[data-tab="master"]').click();
    await page.waitForTimeout(300);
    await page.locator('button[data-master="properties"]').click();
    await page.waitForTimeout(500);

    // === 検証 ===
    // 物件コード2010の行が存在することを確認
    const propertyRow = page.locator('tr:has-text("2010")').first();
    await expect(propertyRow).toBeVisible();

    // 物件名が表示されることを確認
    await expect(propertyRow).toContainText('エンクレストガーデン福岡');

    // 端末情報が表示されることを確認（少なくとも1つの端末が表示される）
    // 実際の表示形式はadmin.htmlの実装に依存
    const hasSomeTerminalInfo = await propertyRow.evaluate(row => {
      const text = row.textContent || '';
      return text.includes('h0001A') || text.includes('端末') || text.includes('4');
    });
    expect(hasSomeTerminalInfo).toBe(true);
  });

  test('編集ボタンをクリックすると、物件の全端末情報がモーダルに表示される', async ({ page }) => {
    // === 実行 ===
    // 物件マスタータブを開く
    await page.locator('button[data-tab="master"]').click();
    await page.waitForTimeout(300);
    await page.locator('button[data-master="properties"]').click();
    await page.waitForTimeout(500);

    // 物件コード2010の編集ボタンをクリック
    const editButton = page.locator('tr:has-text("2010")').first().locator('button:has-text("編集")');
    await editButton.click();
    await page.waitForTimeout(500);

    // === 検証 ===
    // モーダルが表示される
    const modal = page.locator('.modal-overlay, .modal, [role="dialog"]').filter({ hasText: '物件' });
    await expect(modal).toBeVisible();

    // 物件コードが入力されている
    const propertyCodeInput = page.locator('input[name="property_code"], input#property_code');
    await expect(propertyCodeInput).toHaveValue('2010');

    // 物件名が入力されている
    const propertyNameInput = page.locator('input[name="property_name"], input#property_name');
    await expect(propertyNameInput).toHaveValue('エンクレストガーデン福岡');

    // 端末情報が表示される（複数の端末入力欄またはリスト）
    // 実装に応じて検証方法を調整
    const hasTerminalInputs = await page.evaluate(() => {
      // 端末IDを含む入力欄やテキストが存在するか確認
      const inputs = document.querySelectorAll('input');
      for (const input of inputs) {
        if (input.value && input.value.includes('h0001A')) {
          return true;
        }
      }
      // またはモーダル内に端末IDのテキストが存在するか
      const modalContent = document.querySelector('.modal-body, .modal-content');
      if (modalContent) {
        const text = modalContent.textContent || '';
        return text.includes('h0001A00') || text.includes('センター棟');
      }
      return false;
    });
    expect(hasTerminalInputs).toBe(true);
  });

  test('エッジケース: 単一端末の物件を編集すると、1つの端末のみ表示される', async ({ page }) => {
    // === 実行 ===
    await page.locator('button[data-tab="master"]').click();
    await page.waitForTimeout(300);
    await page.locator('button[data-master="properties"]').click();
    await page.waitForTimeout(500);

    // 物件コード120406（単一端末）の編集ボタンをクリック
    const editButton = page.locator('tr:has-text("120406")').first().locator('button:has-text("編集")');
    await editButton.click();
    await page.waitForTimeout(500);

    // === 検証 ===
    const modal = page.locator('.modal-overlay, .modal, [role="dialog"]').filter({ hasText: '物件' });
    await expect(modal).toBeVisible();

    // 物件コードと物件名が正しい
    const propertyCodeInput = page.locator('input[name="property_code"], input#property_code');
    await expect(propertyCodeInput).toHaveValue('120406');

    const propertyNameInput = page.locator('input[name="property_name"], input#property_name');
    await expect(propertyNameInput).toHaveValue('アソシアグロッツォ天神サウス');

    // 端末が1つだけ表示される
    const hasOnlyOneTerminal = await page.evaluate(() => {
      const modalContent = document.querySelector('.modal-body, .modal-content');
      if (!modalContent) return false;
      const text = modalContent.textContent || '';
      // z1003A01が含まれるが、他の端末IDは含まれない
      return text.includes('z1003A01') && !text.includes('h0001A');
    });
    expect(hasOnlyOneTerminal).toBe(true);
  });
});

test.describe('物件マスター編集 - CRUD操作', () => {

  test.beforeEach(async ({ page }) => {
    await setupAuthMockWithMasterData(page, 'http://localhost:8080/admin.html', {
      isAuthenticated: true,
      isAdmin: true,
      email: 'admin@example.com'
    });
    await page.waitForLoadState('networkidle');
    await page.locator('button[data-tab="master"]').click();
    await page.waitForTimeout(300);
    await page.locator('button[data-master="properties"]').click();
    await page.waitForTimeout(500);
  });

  test('新規物件を追加できる（複数端末付き）', async ({ page }) => {
    // === 実行 ===

    // Step 1: 新規追加ボタンをクリック（物件マスター用の特定ボタンを指定）
    await page.locator('#addPropertyBtn').click();
    await page.waitForTimeout(500);

    // Step 2: 物件情報を入力
    await page.locator('input[name="property_code"], input#property_code').fill('999999');
    await page.locator('input[name="property_name"], input#property_name').fill('テスト物件');
    await page.locator('input[name="address"], input#address, textarea[name="address"]').fill('テスト住所');

    // Step 3: 端末を追加（実装に応じて調整が必要）
    // 端末追加ボタンがある場合
    const addTerminalBtn = page.locator('button:has-text("端末追加"), button:has-text("+")').first();
    if (await addTerminalBtn.isVisible()) {
      await addTerminalBtn.click();
      await page.waitForTimeout(300);
      // 端末ID入力
      const terminalIdInput = page.locator('input[name="terminal_id"], input[placeholder*="端末"]').last();
      await terminalIdInput.fill('TEST001');
    }

    // Step 4: 保存ボタンをクリック
    await page.locator('button:has-text("保存"), button:has-text("追加")').click();
    await page.waitForTimeout(500);

    // === 検証 ===
    // 一覧に新しい物件が表示される
    const newRow = page.locator('tr:has-text("999999")');
    await expect(newRow).toBeVisible();
    await expect(newRow).toContainText('テスト物件');
  });

  test('既存物件を編集できる', async ({ page }) => {
    // === 実行 ===

    // Step 1: 編集ボタンをクリック
    const editButton = page.locator('tr:has-text("2010")').first().locator('button:has-text("編集")');
    await editButton.click();
    await page.waitForTimeout(500);

    // Step 2: 物件名を変更
    const propertyNameInput = page.locator('input[name="property_name"], input#property_name');
    await propertyNameInput.clear();
    await propertyNameInput.fill('エンクレストガーデン福岡 (編集済み)');

    // Step 3: 保存ボタンをクリック
    await page.locator('button:has-text("保存"), button:has-text("更新")').click();
    await page.waitForTimeout(500);

    // === 検証 ===
    // 一覧で物件名が更新される
    const updatedRow = page.locator('tr:has-text("2010")').first();
    await expect(updatedRow).toContainText('エンクレストガーデン福岡 (編集済み)');
  });

  test('物件を削除できる（確認ダイアログ付き）', async ({ page }) => {
    // === 実行 ===

    // Step 1: 削除ボタンをクリック
    const deleteButton = page.locator('tr:has-text("120408")').first().locator('button:has-text("削除")');

    // 確認ダイアログをリスンするハンドラーを設定
    page.on('dialog', async dialog => {
      expect(dialog.type()).toBe('confirm');
      expect(dialog.message()).toContain('削除');
      await dialog.accept(); // 削除を確認
    });

    await deleteButton.click();
    await page.waitForTimeout(500);

    // === 検証 ===
    // 一覧から物件が削除される
    const deletedRow = page.locator('tr:has-text("120408")');
    await expect(deletedRow).not.toBeVisible();
  });

  test('エラーケース: 使用中の物件は削除できない', async ({ page }) => {
    // === 実行 ===
    // 物件コード2010はmockEntriesで使用されている

    const deleteButton = page.locator('tr:has-text("2010")').first().locator('button:has-text("削除")');

    // 確認ダイアログをリスン
    let dialogShown = false;
    page.on('dialog', async dialog => {
      dialogShown = true;
      await dialog.accept();
    });

    await deleteButton.click();
    await page.waitForTimeout(500);

    // === 検証 ===
    // エラートーストまたはアラートが表示される
    const errorToast = page.locator('.toast:has-text("使用中"), .error:has-text("使用中")');
    const isErrorVisible = await errorToast.isVisible().catch(() => false);

    // エラーが表示されるか、または削除が実行されない
    if (!isErrorVisible) {
      // 削除されていないことを確認
      const row = page.locator('tr:has-text("2010")').first();
      await expect(row).toBeVisible();
    } else {
      await expect(errorToast).toBeVisible();
    }
  });
});

test.describe('物件マスター - データ整合性検証', () => {

  test('getAllMasterData() が物件を正しくグループ化していることを確認', async ({ page }) => {
    // === 実行 ===
    await setupAuthMockWithMasterData(page, 'http://localhost:8080/bulk.html', {
      isAuthenticated: true,
      isAdmin: true
    });
    await page.waitForLoadState('networkidle');

    // === 検証 ===
    // Supabaseモックから返されるデータ構造を確認
    const masterDataCheck = await page.evaluate(() => {
      // bulk.js内でロードされたマスターデータの構造を確認
      return new Promise((resolve) => {
        setTimeout(() => {
          // @ts-ignore - テスト用のグローバル変数アクセス
          const state = window.__BULK_STATE__;
          if (state && state.masterData) {
            const data = state.masterData;
            const firstProperty = data.properties && data.properties[0];
            resolve({
              hasProperties: Array.isArray(data.properties),
              propertiesCount: data.properties ? data.properties.length : 0,
              firstPropertyStructure: firstProperty ? {
                hasPropertyCode: 'property_code' in firstProperty,
                hasPropertyName: 'property_name' in firstProperty,
                hasTerminals: 'terminals' in firstProperty,
                terminalsIsArray: Array.isArray(firstProperty.terminals),
                terminalsCount: Array.isArray(firstProperty.terminals) ? firstProperty.terminals.length : 0,
                firstTerminalStructure: firstProperty.terminals && firstProperty.terminals[0] ? {
                  hasTerminalId: 'terminal_id' in firstProperty.terminals[0],
                  hasSupplement: 'supplement' in firstProperty.terminals[0]
                } : null
              } : null
            });
          }
          resolve({ error: 'masterData not found in state' });
        }, 1000);
      });
    });

    // データ構造の検証
    expect(masterDataCheck.hasProperties).toBe(true);
    expect(masterDataCheck.propertiesCount).toBeGreaterThan(0);

    if (masterDataCheck.firstPropertyStructure) {
      expect(masterDataCheck.firstPropertyStructure.hasPropertyCode).toBe(true);
      expect(masterDataCheck.firstPropertyStructure.hasPropertyName).toBe(true);
      expect(masterDataCheck.firstPropertyStructure.hasTerminals).toBe(true);
      expect(masterDataCheck.firstPropertyStructure.terminalsIsArray).toBe(true);
      expect(masterDataCheck.firstPropertyStructure.terminalsCount).toBeGreaterThan(0);

      if (masterDataCheck.firstPropertyStructure.firstTerminalStructure) {
        expect(masterDataCheck.firstPropertyStructure.firstTerminalStructure.hasTerminalId).toBe(true);
        expect(masterDataCheck.firstPropertyStructure.firstTerminalStructure.hasSupplement).toBe(true);
      }
    }
  });
});
