// @ts-check
/**
 * 手動ブラウザテスト - ブラウザを表示して操作を確認
 */

const { test, expect } = require('@playwright/test');
const { setupAuthMockWithMasterData, waitForPageReady } = require('./test-helpers');
const path = require('path');

// テスト設定：遅延を入れて操作が見えるようにする
test.use({
  viewport: { width: 1280, height: 900 },
  actionTimeout: 10000
});

test.describe('ブラウザ手動テスト', () => {

  test('1. ページ表示確認 + 2. バリデーションエラー + 3. 正常送信 + 4. スクリーンショット', async ({ page }) => {
    // 認証モックをセットアップ
    await setupAuthMockWithMasterData(page, 'http://localhost:8080/index.html', {
      isAuthenticated: true,
      email: 'test@example.com'
    });
    await waitForPageReady(page);

    // ==============================
    // 1. ページが正しく表示されるか確認
    // ==============================
    console.log('\n=== 1. ページ表示確認 ===');

    // タイトル確認
    const title = await page.locator('h1').textContent();
    console.log('ページタイトル:', title);

    // 主要要素の確認
    const propertySelect = page.locator('#property');
    const vendorSelect = page.locator('#vendor');
    const addBtn = page.locator('button:has-text("データを追加")');

    await expect(propertySelect).toBeVisible();
    await expect(vendorSelect).toBeVisible();
    await expect(addBtn).toBeVisible();

    console.log('✓ 主要UI要素が表示されています');

    // スクリーンショット1: 初期表示
    await page.screenshot({
      path: 'screenshots/01-initial-page.png',
      fullPage: true
    });
    console.log('✓ スクリーンショット保存: screenshots/01-initial-page.png');

    // ==============================
    // 2. バリデーションエラーをテスト
    // ==============================
    console.log('\n=== 2. バリデーションエラーテスト ===');

    // 何も入力せずにデータ追加ボタンをクリック
    await addBtn.click();
    await page.waitForTimeout(500);

    // エラー確認（トースト通知やアラート）
    const toast = page.locator('.toast, [class*="toast"], [class*="error"]');
    const hasToast = await toast.count() > 0;

    if (hasToast) {
      const toastText = await toast.first().textContent();
      console.log('バリデーションエラー表示:', toastText);
    }

    // データが追加されていないことを確認
    const dataCount = page.locator('#dataCount');
    const count = await dataCount.textContent();
    console.log('データ件数:', count);
    expect(count).toBe('0');
    console.log('✓ 空欄送信でデータが追加されませんでした（正常）');

    // スクリーンショット2: バリデーションエラー後
    await page.screenshot({
      path: 'screenshots/02-validation-error.png',
      fullPage: true
    });
    console.log('✓ スクリーンショット保存: screenshots/02-validation-error.png');

    // ==============================
    // 3. 正常に送信できるか確認
    // ==============================
    console.log('\n=== 3. 正常送信テスト ===');

    // 必須項目を入力
    // 物件選択
    await propertySelect.selectOption({ index: 1 });
    await page.waitForTimeout(300);
    console.log('✓ 物件を選択');

    // 端末選択（物件選択後に表示される）
    const terminalSelect = page.locator('#terminal');
    await page.waitForTimeout(300);
    if (await terminalSelect.locator('option').count() > 1) {
      await terminalSelect.selectOption({ index: 1 });
      console.log('✓ 端末を選択');
    }

    // 受注先選択
    await vendorSelect.selectOption({ index: 1 });
    await page.waitForTimeout(300);
    console.log('✓ 受注先を選択');

    // 案内カテゴリ選択
    const categorySelect = page.locator('#inspectionCategory');
    await categorySelect.selectOption({ index: 1 });
    await page.waitForTimeout(500);
    console.log('✓ 案内カテゴリを選択');

    // 点検種別選択（カテゴリ選択後に表示される）
    const inspectionSelect = page.locator('#inspectionType');
    if (await inspectionSelect.locator('option').count() > 1) {
      await inspectionSelect.selectOption({ index: 1 });
      console.log('✓ 点検種別を選択');
    }
    await page.waitForTimeout(300);

    // スクリーンショット3: 入力後
    await page.screenshot({
      path: 'screenshots/03-form-filled.png',
      fullPage: true
    });
    console.log('✓ スクリーンショット保存: screenshots/03-form-filled.png');

    // データ追加ボタンをクリック
    await addBtn.click();
    await page.waitForTimeout(1000);

    // データが追加されたか確認
    const newCount = await dataCount.textContent();
    console.log('追加後のデータ件数:', newCount);

    // スクリーンショット4: データ追加後
    await page.screenshot({
      path: 'screenshots/04-data-added.png',
      fullPage: true
    });
    console.log('✓ スクリーンショット保存: screenshots/04-data-added.png');

    // ==============================
    // 4. 結果サマリー
    // ==============================
    console.log('\n=== テスト結果サマリー ===');
    console.log('1. ページ表示: ✓ 正常');
    console.log('2. バリデーション: ✓ 空欄送信で追加されない');
    console.log('3. 正常送信: データ件数 =', newCount);
    console.log('4. スクリーンショット: 4枚保存済み');
    console.log('\nスクリーンショット保存先: ./screenshots/');
  });
});
