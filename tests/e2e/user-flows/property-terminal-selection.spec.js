// @ts-check
/**
 * E2Eテスト: 物件端末選択機能
 *
 * テスト対象:
 * - 1件入力画面での端末選択（複数端末・単一端末）
 * - 一括入力画面での端末選択（複数端末・単一端末）
 * - マスターデータの動的読み込みと表示
 *
 * ユーザーストーリー:
 * 1. ユーザーが物件を選択すると、その物件に紐づく全端末が表示される
 * 2. 複数端末がある場合は全て選択肢に表示される
 * 3. 単一端末の場合は1つだけ表示され自動選択される
 * 4. 端末情報（補足）も正しく表示される
 */

const { test, expect } = require('@playwright/test');
const { setupAuthMockWithMasterData } = require('../../test-helpers');

test.describe('物件端末選択機能 - 1件入力画面', () => {

  test.beforeEach(async ({ page }) => {
    // 前提条件: 認証済みユーザーとしてログイン、マスターデータをロード
    await setupAuthMockWithMasterData(page, 'http://localhost:8080/index.html', {
      isAuthenticated: true,
      email: 'test@example.com'
    });
    // ページの完全読み込みを待機
    await page.waitForLoadState('networkidle');
  });

  test('複数端末を持つ物件を選択すると、全端末が表示される', async ({ page }) => {
    // === 実行 ===
    // 物件セレクトボックスを取得
    const propertySelect = page.locator('#property');

    // 物件「エンクレストガーデン福岡」(2010) を選択
    // この物件は4つの端末を持つ: h0001A00, h0001A01, h0001A02, h0001A03
    await propertySelect.selectOption('2010');

    // 端末セレクトボックスの変更を待機
    await page.waitForTimeout(500); // DOM更新を待つ

    // === 検証 ===
    const terminalSelect = page.locator('#terminal');

    // 1. 端末セレクトボックスが有効になっていることを確認
    await expect(terminalSelect).toBeEnabled();

    // 2. 正しい数のオプションが表示されることを確認（デフォルトの「選択してください」 + 4端末 = 5）
    const options = await terminalSelect.locator('option').all();
    expect(options.length).toBe(5); // 1つのプレースホルダー + 4つの端末

    // 3. 各端末オプションの存在を確認
    await expect(terminalSelect.locator('option[value="h0001A00"]')).toHaveText('h0001A00 (センター棟)');
    await expect(terminalSelect.locator('option[value="h0001A01"]')).toHaveText('h0001A01 (A棟)');
    await expect(terminalSelect.locator('option[value="h0001A02"]')).toHaveText('h0001A02 (B棟)');
    await expect(terminalSelect.locator('option[value="h0001A03"]')).toHaveText('h0001A03 (C棟)');

    // 4. 最初の端末が自動選択されることを確認
    const selectedValue = await terminalSelect.inputValue();
    expect(selectedValue).toBe('h0001A00');
  });

  test('単一端末を持つ物件を選択すると、1つだけ表示され自動選択される', async ({ page }) => {
    // === 実行 ===
    const propertySelect = page.locator('#property');

    // 物件「アソシアグロッツォ天神サウス」(120406) を選択
    // この物件は1つの端末のみ: z1003A01
    await propertySelect.selectOption('120406');
    await page.waitForTimeout(500);

    // === 検証 ===
    const terminalSelect = page.locator('#terminal');

    // 1. 端末セレクトボックスが有効
    await expect(terminalSelect).toBeEnabled();

    // 2. 正しい数のオプション（デフォルト + 1端末 = 2）
    const options = await terminalSelect.locator('option').all();
    expect(options.length).toBe(2);

    // 3. 端末オプションの存在を確認
    await expect(terminalSelect.locator('option[value="z1003A01"]')).toHaveText('z1003A01');

    // 4. 自動的に選択されることを確認
    const selectedValue = await terminalSelect.inputValue();
    expect(selectedValue).toBe('z1003A01');
  });

  test('物件を変更すると、端末リストが正しく更新される', async ({ page }) => {
    // === 実行 ===
    const propertySelect = page.locator('#property');
    const terminalSelect = page.locator('#terminal');

    // Step 1: 最初の物件を選択（複数端末）
    await propertySelect.selectOption('2010');
    await page.waitForTimeout(500);

    // Step 2: 検証 - 4つの端末オプションが存在
    let options = await terminalSelect.locator('option').all();
    expect(options.length).toBe(5);

    // Step 3: 別の物件に変更（単一端末）
    await propertySelect.selectOption('120406');
    await page.waitForTimeout(500);

    // Step 4: 検証 - 端末リストが更新され、1つの端末のみ
    options = await terminalSelect.locator('option').all();
    expect(options.length).toBe(2);
    // option要素の存在を確認（toBeVisibleはselectのoptionには不適切）
    await expect(terminalSelect.locator('option[value="z1003A01"]')).toHaveCount(1);

    // Step 5: 元の物件に戻す
    await propertySelect.selectOption('2010');
    await page.waitForTimeout(500);

    // Step 6: 検証 - 再び4つの端末が表示される
    options = await terminalSelect.locator('option').all();
    expect(options.length).toBe(5);
  });

  test('エッジケース: 物件未選択時は端末セレクトボックスが空', async ({ page }) => {
    // === 検証 ===
    const terminalSelect = page.locator('#terminal');

    // 初期状態では「選択してください」のみ
    const options = await terminalSelect.locator('option').all();
    expect(options.length).toBe(1);
    await expect(terminalSelect.locator('option').first()).toHaveText('選択してください');
  });

  test('複数の端末から特定の端末を選択できる', async ({ page }) => {
    // === 実行 ===
    // Step 1: 物件を選択
    await page.locator('#property').selectOption('2010');
    await page.waitForTimeout(500);

    // Step 2: 端末を選択（B棟を選択）
    await page.locator('#terminal').selectOption('h0001A02');

    // === 検証 ===
    // 選択した端末の値が正しくセットされている
    const terminalValue = await page.locator('#terminal').inputValue();
    expect(terminalValue).toBe('h0001A02');

    // 他の端末に変更可能であることを確認
    await page.locator('#terminal').selectOption('h0001A00');
    const newTerminalValue = await page.locator('#terminal').inputValue();
    expect(newTerminalValue).toBe('h0001A00');
  });
});

test.describe('物件端末選択機能 - 一括入力画面', () => {

  test.beforeEach(async ({ page }) => {
    // 前提条件: 認証済みユーザーとしてログイン
    await setupAuthMockWithMasterData(page, 'http://localhost:8080/bulk.html', {
      isAuthenticated: true,
      email: 'test@example.com'
    });
    await page.waitForLoadState('networkidle');
  });

  test('一括入力: 複数端末を持つ物件の行を追加すると、端末セレクトボックスに全端末が表示される', async ({ page }) => {
    // === 実行 ===

    // Step 1: 新しい行を追加
    await page.locator('#addRowBtn').click();
    await page.waitForTimeout(500);

    // Step 2: 最初の行の物件セレクトボックスを取得
    const firstRow = page.locator('.bulk-table tbody tr').first();
    const propertySelect = firstRow.locator('.property-select');

    // Step 3: 物件「エンクレストガーデン福岡」(2010) を選択
    await propertySelect.selectOption('2010');
    await page.waitForTimeout(500);

    // === 検証 ===
    const terminalSelect = firstRow.locator('.terminal-select');

    // 1. 端末セレクトボックスが更新された
    const options = await terminalSelect.locator('option').all();
    expect(options.length).toBeGreaterThan(1); // 少なくともデフォルト + 複数端末

    // 2. 各端末が存在することを確認（toHaveCountでDOM内の存在を確認）
    await expect(terminalSelect.locator('option[value="h0001A00"]')).toHaveCount(1);
    await expect(terminalSelect.locator('option[value="h0001A01"]')).toHaveCount(1);
    await expect(terminalSelect.locator('option[value="h0001A02"]')).toHaveCount(1);
    await expect(terminalSelect.locator('option[value="h0001A03"]')).toHaveCount(1);

    // 3. 最初の端末が自動選択される
    const selectedValue = await terminalSelect.inputValue();
    expect(selectedValue).toBe('h0001A00');
  });

  test('一括入力: 単一端末を持つ物件の行を追加すると、端末が自動選択される', async ({ page }) => {
    // === 実行 ===
    await page.locator('#addRowBtn').click();
    await page.waitForTimeout(500);

    const firstRow = page.locator('.bulk-table tbody tr').first();
    const propertySelect = firstRow.locator('.property-select');

    // 単一端末の物件を選択
    await propertySelect.selectOption('120406');
    await page.waitForTimeout(500);

    // === 検証 ===
    const terminalSelect = firstRow.locator('.terminal-select');

    // 1. 端末オプションが2つ（デフォルト + 1端末）
    const options = await terminalSelect.locator('option').all();
    expect(options.length).toBe(2);

    // 2. 端末が存在（toHaveCountでDOM内の存在を確認）
    await expect(terminalSelect.locator('option[value="z1003A01"]')).toHaveCount(1);

    // 3. 自動選択される
    const selectedValue = await terminalSelect.inputValue();
    expect(selectedValue).toBe('z1003A01');
  });

  test('一括入力: 複数行で異なる物件を選択し、各行の端末リストが独立していることを確認', async ({ page }) => {
    // === 実行 ===

    // Step 1: 2行追加
    await page.locator('#addRowBtn').click();
    await page.waitForTimeout(300);
    await page.locator('#addRowBtn').click();
    await page.waitForTimeout(300);

    // Step 2: 1行目に複数端末の物件を選択
    const row1 = page.locator('.bulk-table tbody tr').nth(0);
    await row1.locator('.property-select').selectOption('2010');
    await page.waitForTimeout(500);

    // Step 3: 2行目に単一端末の物件を選択
    const row2 = page.locator('.bulk-table tbody tr').nth(1);
    await row2.locator('.property-select').selectOption('120406');
    await page.waitForTimeout(500);

    // === 検証 ===

    // 1. 1行目の端末セレクトボックスには複数端末
    const terminal1 = row1.locator('.terminal-select');
    const options1 = await terminal1.locator('option').all();
    expect(options1.length).toBe(5); // デフォルト + 4端末

    // 2. 2行目の端末セレクトボックスには単一端末
    const terminal2 = row2.locator('.terminal-select');
    const options2 = await terminal2.locator('option').all();
    expect(options2.length).toBe(2); // デフォルト + 1端末

    // 3. それぞれが正しい端末を持つ（toHaveCountでDOM内の存在を確認）
    await expect(terminal1.locator('option[value="h0001A00"]')).toHaveCount(1);
    await expect(terminal2.locator('option[value="z1003A01"]')).toHaveCount(1);

    // 4. それぞれが異なる値を持つ
    const value1 = await terminal1.inputValue();
    const value2 = await terminal2.inputValue();
    expect(value1).not.toBe(value2);
  });

  test('エラーケース: 一括入力で物件未選択時に端末セレクトボックスが空', async ({ page }) => {
    // === 実行 ===
    await page.locator('#addRowBtn').click();
    await page.waitForTimeout(500);

    // === 検証 ===
    const firstRow = page.locator('.bulk-table tbody tr').first();
    const terminalSelect = firstRow.locator('.terminal-select');

    // 初期状態では「-- 端末 --」のみ
    const options = await terminalSelect.locator('option').all();
    expect(options.length).toBe(1);
    await expect(terminalSelect.locator('option').first()).toHaveText('-- 端末 --');
  });

  test('一括入力: 各行で異なる端末を選択できる', async ({ page }) => {
    // === 実行 ===

    // Step 1: 2行追加
    await page.locator('#addRowBtn').click();
    await page.waitForTimeout(300);
    await page.locator('#addRowBtn').click();
    await page.waitForTimeout(300);

    // Step 2: 1行目の物件・端末を選択（複数端末の物件）
    const row1 = page.locator('.bulk-table tbody tr').nth(0);
    await row1.locator('.property-select').selectOption('2010');
    await page.waitForTimeout(300);
    await row1.locator('.terminal-select').selectOption('h0001A01'); // A棟を選択

    // Step 3: 2行目の物件・端末を選択（単一端末の物件）
    const row2 = page.locator('.bulk-table tbody tr').nth(1);
    await row2.locator('.property-select').selectOption('120406');
    await page.waitForTimeout(300);
    // 単一端末なので自動選択される

    // === 検証 ===

    // 1. 1行目に選択した端末が正しく設定されている
    const terminal1Value = await row1.locator('.terminal-select').inputValue();
    expect(terminal1Value).toBe('h0001A01');

    // 2. 2行目に自動選択された端末が正しい
    const terminal2Value = await row2.locator('.terminal-select').inputValue();
    expect(terminal2Value).toBe('z1003A01');

    // 3. 1行目で別の端末を選び直せることを確認
    await row1.locator('.terminal-select').selectOption('h0001A03'); // C棟に変更
    const terminal1NewValue = await row1.locator('.terminal-select').inputValue();
    expect(terminal1NewValue).toBe('h0001A03');

    // 4. 行数が正しく表示されている
    await expect(page.locator('#totalCount')).toHaveText('2');
  });
});

test.describe('データ構造の整合性検証', () => {

  test('getAllMasterData() の出力形式が正しいことを確認', async ({ page }) => {
    // === 実行 ===
    await setupAuthMockWithMasterData(page, 'http://localhost:8080/index.html', {
      isAuthenticated: true
    });
    await page.waitForLoadState('networkidle');

    // === 検証 ===
    // ページ内で masterData の構造を確認
    const masterDataStructure = await page.evaluate(() => {
      // @ts-ignore
      const data = window.masterData;
      if (!data) return { error: 'masterData not found' };

      // properties が配列であることを確認
      if (!Array.isArray(data.properties)) {
        return { error: 'properties is not an array' };
      }

      // 最初の物件を確認
      const firstProperty = data.properties[0];
      return {
        hasPropertyCode: 'propertyCode' in firstProperty,
        hasPropertyName: 'propertyName' in firstProperty,
        hasTerminalId: 'terminalId' in firstProperty,
        hasAddress: 'address' in firstProperty,
        firstPropertyCode: firstProperty.propertyCode,
        firstTerminalId: firstProperty.terminalId
      };
    });

    // getAllMasterDataCamelCase() の出力形式（フラット化されたレコード）
    expect(masterDataStructure.hasPropertyCode).toBe(true);
    expect(masterDataStructure.hasPropertyName).toBe(true);
    expect(masterDataStructure.hasTerminalId).toBe(true);
    expect(masterDataStructure.hasAddress).toBe(true);
  });
});
