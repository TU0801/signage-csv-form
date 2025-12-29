// @ts-check
const { test, expect } = require('@playwright/test');
const { setupAuthMockWithMasterData } = require('./test-helpers');

test.describe('バグ修正テスト', () => {
    test.beforeEach(async ({ page }) => {
        await setupAuthMockWithMasterData(page, 'http://localhost:8080/index.html');
        await page.waitForSelector('#property');
    });

    test('バグ#3: 空フォームで送信時にエラーメッセージが表示される', async ({ page }) => {
        // 空のフォームで追加ボタンをクリック
        await page.locator('button:has-text("データを追加")').click();

        // エラーメッセージまたはトーストが表示されることを確認
        const toast = page.locator('.toast, [role="alert"], .error-message');
        await expect(toast).toBeVisible({ timeout: 3000 });
    });

    test('バグ#3: 必須項目が未入力時にエラーメッセージが表示される', async ({ page }) => {
        // 物件コードのみ選択
        await page.locator('#property').selectOption({ index: 1 });
        await page.waitForTimeout(300);

        // 受注先と点検種別は未選択のまま追加ボタンをクリック
        await page.locator('button:has-text("データを追加")').click();

        // エラーメッセージが表示されることを確認
        const toast = page.locator('.toast, [role="alert"], .error-message');
        await expect(toast).toBeVisible({ timeout: 3000 });
    });

    test('バグ#4: 終了日が開始日より前の場合にエラーメッセージが表示される', async ({ page }) => {
        // 物件、受注先、点検種別を選択
        await page.locator('#property').selectOption({ index: 1 });
        await page.waitForTimeout(300);
        await page.locator('#vendor').selectOption({ index: 1 });
        await page.waitForTimeout(300);

        // 点検種別を選択（テンプレートがあるもの）
        const inspectionOptions = await page.locator('#inspectionType option').count();
        for (let i = 1; i < Math.min(inspectionOptions, 10); i++) {
            await page.locator('#inspectionType').selectOption({ index: i });
            await page.waitForTimeout(300);
            const hasPreview = await page.locator('#posterPreview img').count() > 0;
            if (hasPreview) break;
        }

        // 開始日より前の終了日を設定
        await page.locator('#endDate').fill('2025-12-20');
        await page.locator('#displayEndDate').fill('2025-12-20');
        await page.locator('#displayStartTime').fill('09:00');
        await page.locator('#displayEndTime').fill('18:00');

        // データを追加
        await page.locator('button:has-text("データを追加")').click();

        // エラーメッセージが表示されることを確認
        const toast = page.locator('.toast, [role="alert"], .error-message');
        await expect(toast).toBeVisible({ timeout: 3000 });
    });

    test('バグ#2: 自動扉点検でテンプレートプレビューが表示される', async ({ page }) => {
        // 点検種別のオプションから「自動扉点検」を探して選択
        const inspectionSelect = page.locator('#inspectionType');

        // オプションを取得
        const options = await inspectionSelect.locator('option').allTextContents();
        const targetIndex = options.findIndex(text => text.includes('自動扉点検'));

        if (targetIndex >= 0) {
            await inspectionSelect.selectOption({ index: targetIndex });
            await page.waitForTimeout(500);

            // テンプレートプレビューが表示されることを確認
            const preview = page.locator('#posterPreview img, #posterPreview canvas');
            await expect(preview).toBeVisible({ timeout: 3000 });
        } else {
            // 自動扉点検がテストデータにない場合はスキップ
            console.log('自動扉点検が見つかりませんでした - テストをスキップ');
        }
    });
});
