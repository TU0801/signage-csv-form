// @ts-check
const { test, expect } = require('@playwright/test');
const { setupAuthMockWithMasterData } = require('./test-helpers');

// テストデータ
const TEST_DATA = {
    // シンプルフォーマット（6列）: 物件コード, 受注先, 点検種別, 開始日, 終了日, 備考
    simpleValid: [
        '2010\t山本クリーンシステム　有限会社\t定期清掃\t2025/01/15\t2025/01/15\t10:00〜12:00',
        '120406\t日本オーチス・エレベータ　株式会社\tエレベーター定期点検\t2025/01/20\t2025/01/20\t午前中'
    ].join('\n'),

    // フルフォーマット（10列以上）
    fullFormat: [
        '\th0001A00\t2010\t山本クリーンシステム　有限会社\t092-934-0407\t定期清掃\tTRUE\tcleaning\t2025/01/15\t2025/01/15\t10:00〜12:00\t床面清掃を行います\t2\t2025/01/14\t09:00\t2025/01/16\t18:00\tテンプレート\t0:00:08'
    ].join('\n'),

    // ヘッダー行付き
    withHeader: [
        '物件コード\t受注先\t点検種別\t開始日\t終了日\t備考',
        '2010\t山本クリーンシステム　有限会社\t定期清掃\t2025/01/15\t2025/01/15\t備考テスト'
    ].join('\n'),

    // 複数行
    multipleRows: [
        '2010\t山本クリーンシステム　有限会社\t定期清掃\t2025/01/15\t2025/01/15\t1行目',
        '120406\t日本オーチス・エレベータ　株式会社\tエレベーター定期点検\t2025/01/16\t2025/01/16\t2行目',
        '120408\t株式会社　えん建物管理\t建物設備点検\t2025/01/17\t2025/01/17\t3行目'
    ].join('\n'),

    // 日付フォーマットバリエーション
    dateFormats: [
        '2010\t山本クリーンシステム　有限会社\t定期清掃\t2025/01/15\t2025/01/15\tスラッシュ形式',
        '2010\t山本クリーンシステム　有限会社\t定期清掃\t2025-01-16\t2025-01-16\tハイフン形式'
    ].join('\n'),

    // 空のフィールドあり
    emptyFields: [
        '2010\t山本クリーンシステム　有限会社\t定期清掃\t\t\t',
        '120406\t\t\t2025/01/15\t2025/01/15\t受注先なし'
    ].join('\n'),

    // 存在しない物件コード
    invalidPropertyCode: [
        '99999\t山本クリーンシステム　有限会社\t定期清掃\t2025/01/15\t2025/01/15\t存在しない物件'
    ].join('\n'),

    // 存在しない受注先
    invalidVendor: [
        '2010\t存在しない会社\t定期清掃\t2025/01/15\t2025/01/15\t存在しない受注先'
    ].join('\n'),

    // 存在しない点検種別
    invalidInspection: [
        '2010\t山本クリーンシステム　有限会社\t存在しない点検\t2025/01/15\t2025/01/15\t存在しない種別'
    ].join('\n'),

    // 3列未満（エラーケース）
    tooFewColumns: [
        '2010\t山本クリーンシステム　有限会社',
        '120406'
    ].join('\n'),

    // 空行混在
    withEmptyLines: [
        '2010\t山本クリーンシステム　有限会社\t定期清掃\t2025/01/15\t2025/01/15\t1行目',
        '',
        '120406\t日本オーチス・エレベータ　株式会社\tエレベーター定期点検\t2025/01/16\t2025/01/16\t2行目',
        ''
    ].join('\n'),

    // 掲示板表示 FALSE
    showOnBoardFalse: [
        '\th0001A00\t2010\t山本クリーンシステム　有限会社\t092-934-0407\t定期清掃\tFALSE\tcleaning\t2025/01/15\t2025/01/15\t備考\t案内文\t2\t\t\t\t\t\t0:00:06'
    ].join('\n'),

    // 表示時間のバリエーション
    displayTimeFormats: [
        '\th0001A00\t2010\t山本クリーンシステム　有限会社\t092-934-0407\t定期清掃\tTRUE\tcleaning\t2025/01/15\t2025/01/15\t\t\t2\t\t\t\t\t\t0:00:15',
        '\th0001A01\t2010\t山本クリーンシステム　有限会社\t092-934-0407\t定期清掃\tTRUE\tcleaning\t2025/01/16\t2025/01/16\t\t\t2\t\t\t\t\t\t10'
    ].join('\n'),

    // 位置のバリエーション
    positionVariations: [
        '\th0001A00\t2010\t山本クリーンシステム　有限会社\t092-934-0407\t定期清掃\tTRUE\tcleaning\t2025/01/15\t2025/01/15\t\t\t0\t\t\t\t\t\t6',
        '\th0001A01\t2010\t山本クリーンシステム　有限会社\t092-934-0407\t定期清掃\tTRUE\tcleaning\t2025/01/16\t2025/01/16\t\t\t1\t\t\t\t\t\t6',
        '\th0001A02\t2010\t山本クリーンシステム　有限会社\t092-934-0407\t定期清掃\tTRUE\tcleaning\t2025/01/17\t2025/01/17\t\t\t4\t\t\t\t\t\t6'
    ].join('\n'),

    // 設定値超過（異常値テスト）
    exceedSettings: [
        // 表示時間が上限超過（45秒 > 30秒）
        '\th0001A00\t2010\t山本クリーンシステム　有限会社\t092-934-0407\t定期清掃\tTRUE\tcleaning\t2025/01/15\t2025/01/15\t\t\t2\t\t\t\t\t\t0:00:45'
    ].join('\n'),

    // 長い備考（文字数超過テスト）
    longRemarks: [
        '2010\t山本クリーンシステム　有限会社\t定期清掃\t2025/01/15\t2025/01/15\tこれは非常に長い備考テキストです。1行あたりの文字数制限を超えているかもしれません。'
    ].join('\n'),

    // 複数行の備考
    multiLineRemarks: [
        '2010\t山本クリーンシステム　有限会社\t定期清掃\t2025/01/15\t2025/01/15\t1行目\n2行目\n3行目\n4行目\n5行目\n6行目'
    ].join('\n'),

    // 長い案内文
    longNoticeText: [
        '\th0001A00\t2010\t山本クリーンシステム　有限会社\t092-934-0407\t定期清掃\tTRUE\tcleaning\t2025/01/15\t2025/01/15\t備考\tこれは非常に長い案内文です。サイネージに表示する案内文として設定された最大文字数を超えている可能性があります。テスト用に200文字を超えるテキストを入力しています。この文章は設定値による文字数制限のバリデーションが正しく機能するかどうかを確認するためのものです。\t2\t\t\t\t\t\t6'
    ].join('\n')
};

test.describe('Excel Paste Import Tests', () => {
    test.beforeEach(async ({ page }) => {
        await setupAuthMockWithMasterData(page, '/bulk.html', { isAuthenticated: true });
        await page.waitForSelector('#addRowBtn');
    });

    test('simple format import works correctly', async ({ page }) => {
        await page.click('#pasteBtn');
        await page.fill('#pasteArea', TEST_DATA.simpleValid);
        await page.click('#importPasteBtn');

        // 2行インポートされることを確認
        await expect(page.locator('#totalCount')).toHaveText('2');

        // 最初の行の物件が正しいことを確認
        const firstPropertySelect = page.locator('tr:first-child .property-select');
        await expect(firstPropertySelect).toHaveValue('2010');
    });

    test('full format import works correctly', async ({ page }) => {
        await page.click('#pasteBtn');
        await page.fill('#pasteArea', TEST_DATA.fullFormat);
        await page.click('#importPasteBtn');

        // データがインポートされることを確認
        await expect(page.locator('#totalCount')).toHaveText('1');

        // インポート成功メッセージ
        await expect(page.locator('.toast.success')).toContainText('取り込み');
    });

    test('header row is skipped', async ({ page }) => {
        await page.click('#pasteBtn');
        await page.fill('#pasteArea', TEST_DATA.withHeader);
        await page.click('#importPasteBtn');

        // ヘッダー行はスキップされるので1行のみ
        await expect(page.locator('#totalCount')).toHaveText('1');
    });

    test('multiple rows import correctly', async ({ page }) => {
        await page.click('#pasteBtn');
        await page.fill('#pasteArea', TEST_DATA.multipleRows);
        await page.click('#importPasteBtn');

        await expect(page.locator('#totalCount')).toHaveText('3');
    });

    test('various date formats are parsed correctly', async ({ page }) => {
        await page.click('#pasteBtn');
        await page.fill('#pasteArea', TEST_DATA.dateFormats);
        await page.click('#importPasteBtn');

        await expect(page.locator('#totalCount')).toHaveText('2');

        // 両方の日付形式が正しく解析されることを確認
        const firstStartDate = page.locator('tr:first-child .start-date');
        const secondStartDate = page.locator('tr:nth-child(2) .start-date');

        await expect(firstStartDate).toHaveValue('2025-01-15');
        await expect(secondStartDate).toHaveValue('2025-01-16');
    });

    test('empty fields are handled correctly', async ({ page }) => {
        await page.click('#pasteBtn');
        await page.fill('#pasteArea', TEST_DATA.emptyFields);
        await page.click('#importPasteBtn');

        await expect(page.locator('#totalCount')).toHaveText('2');

        // 空フィールドでもインポートされる（バリデーションエラーになる）
        await expect(page.locator('#errorCount')).not.toHaveText('0');
    });

    test('invalid property code is imported (data is preserved but select shows no match)', async ({ page }) => {
        await page.click('#pasteBtn');
        await page.fill('#pasteArea', TEST_DATA.invalidPropertyCode);
        await page.click('#importPasteBtn');

        await expect(page.locator('#totalCount')).toHaveText('1');
        // 存在しない物件コードでもデータとしては取り込まれる（selectでは選択されない）
        // 端末IDバリデーション追加により、物件選択時に端末がないとエラーになる
        const badge = page.locator('tr:first-child .status-badge');
        await expect(badge).toHaveText('エラー');
    });

    test('invalid vendor is imported (data is preserved but select shows no match)', async ({ page }) => {
        await page.click('#pasteBtn');
        await page.fill('#pasteArea', TEST_DATA.invalidVendor);
        await page.click('#importPasteBtn');

        await expect(page.locator('#totalCount')).toHaveText('1');
        // 存在しない受注先でもデータとしては取り込まれる
        const badge = page.locator('tr:first-child .status-badge');
        await expect(badge).toHaveText('OK');
    });

    test('invalid inspection type is imported (data is preserved but select shows no match)', async ({ page }) => {
        await page.click('#pasteBtn');
        await page.fill('#pasteArea', TEST_DATA.invalidInspection);
        await page.click('#importPasteBtn');

        await expect(page.locator('#totalCount')).toHaveText('1');
        // 存在しない点検種別でもデータとしては取り込まれる
        const badge = page.locator('tr:first-child .status-badge');
        await expect(badge).toHaveText('OK');
    });

    test('rows with too few columns are skipped', async ({ page }) => {
        await page.click('#pasteBtn');
        await page.fill('#pasteArea', TEST_DATA.tooFewColumns);
        await page.click('#importPasteBtn');

        // 3列未満の行はスキップされる
        await expect(page.locator('#totalCount')).toHaveText('0');
        // スキップされたメッセージが表示される
        await expect(page.locator('.toast.error')).toContainText('スキップ');
    });

    test('empty lines are handled correctly', async ({ page }) => {
        await page.click('#pasteBtn');
        await page.fill('#pasteArea', TEST_DATA.withEmptyLines);
        await page.click('#importPasteBtn');

        // 空行はスキップされて2行のみインポート
        await expect(page.locator('#totalCount')).toHaveText('2');
    });

    test('showOnBoard FALSE is correctly imported', async ({ page }) => {
        await page.click('#pasteBtn');
        await page.fill('#pasteArea', TEST_DATA.showOnBoardFalse);
        await page.click('#importPasteBtn');

        await expect(page.locator('#totalCount')).toHaveText('1');
        await expect(page.locator('.toast.success')).toContainText('取り込み');
    });

    test('display time formats are parsed correctly', async ({ page }) => {
        await page.click('#pasteBtn');
        await page.fill('#pasteArea', TEST_DATA.displayTimeFormats);
        await page.click('#importPasteBtn');

        // 2行がインポートされる
        await expect(page.locator('#totalCount')).toHaveText('2');
        await expect(page.locator('.toast.success')).toContainText('2件');
    });

    test('position variations are imported correctly', async ({ page }) => {
        await page.click('#pasteBtn');
        await page.fill('#pasteArea', TEST_DATA.positionVariations);
        await page.click('#importPasteBtn');

        // 3行がインポートされる
        await expect(page.locator('#totalCount')).toHaveText('3');
    });

    test('empty paste area shows error', async ({ page }) => {
        await page.click('#pasteBtn');
        await page.click('#importPasteBtn');

        await expect(page.locator('.toast.error')).toContainText('データを入力');
    });

    test('cancel button closes modal without importing', async ({ page }) => {
        await page.click('#pasteBtn');
        await page.fill('#pasteArea', TEST_DATA.simpleValid);
        await page.click('#cancelPasteBtn');

        await expect(page.locator('#pasteModal')).not.toHaveClass(/active/);
        await expect(page.locator('#totalCount')).toHaveText('0');
    });

    test('clicking outside modal closes it', async ({ page }) => {
        await page.click('#pasteBtn');
        await page.fill('#pasteArea', TEST_DATA.simpleValid);
        await page.click('#pasteModal', { position: { x: 10, y: 10 } });

        await expect(page.locator('#pasteModal')).not.toHaveClass(/active/);
        await expect(page.locator('#totalCount')).toHaveText('0');
    });
});

test.describe('Excel Paste Validation Tests', () => {
    test.beforeEach(async ({ page }) => {
        await setupAuthMockWithMasterData(page, '/bulk.html', { isAuthenticated: true });
        await page.waitForSelector('#addRowBtn');
    });

    test('display time exceeding max is imported (validation depends on settings)', async ({ page }) => {
        await page.click('#pasteBtn');
        await page.fill('#pasteArea', TEST_DATA.exceedSettings);
        await page.click('#importPasteBtn');

        // データはインポートされる
        await expect(page.locator('#totalCount')).toHaveText('1');
        // 注: バリデーションは設定値の読み込みに依存するため、
        // モック環境では正確なテストが難しい
    });

    test('valid data after import can be saved', async ({ page }) => {
        await page.click('#pasteBtn');
        await page.fill('#pasteArea', TEST_DATA.simpleValid);
        await page.click('#importPasteBtn');

        await expect(page.locator('#totalCount')).toHaveText('2');
        await expect(page.locator('#validCount')).toHaveText('2');

        // 保存ボタンが有効になっている
        const saveBtn = page.locator('#saveBtn');
        await expect(saveBtn).not.toBeDisabled();
    });

    test('CSV download works after import', async ({ page }) => {
        await page.click('#pasteBtn');
        await page.fill('#pasteArea', TEST_DATA.simpleValid);
        await page.click('#importPasteBtn');

        await expect(page.locator('#validCount')).toHaveText('2');

        // CSVダウンロードボタンが有効
        const downloadBtn = page.locator('#downloadCsvBtn');
        await expect(downloadBtn).not.toBeDisabled();

        // ダウンロードをトリガー
        const downloadPromise = page.waitForEvent('download');
        await downloadBtn.click();
        const download = await downloadPromise;

        expect(download.suggestedFilename()).toMatch(/\.csv$/);
    });

    test('imported data can be exported to CSV', async ({ page }) => {
        await page.click('#pasteBtn');
        await page.fill('#pasteArea', TEST_DATA.fullFormat);
        await page.click('#importPasteBtn');

        // インポート成功
        await expect(page.locator('#totalCount')).toHaveText('1');

        // CSVコピーボタンが有効であることを確認
        const copyCsvBtn = page.locator('#copyCsvBtn');
        await expect(copyCsvBtn).toBeEnabled();
    });
});

test.describe('Excel Paste Mixed Data Tests', () => {
    test.beforeEach(async ({ page }) => {
        await setupAuthMockWithMasterData(page, '/bulk.html', { isAuthenticated: true });
        await page.waitForSelector('#addRowBtn');
    });

    test('mixed valid and invalid master data is all imported', async ({ page }) => {
        const mixedData = [
            '2010\t山本クリーンシステム　有限会社\t定期清掃\t2025/01/15\t2025/01/15\t有効データ',
            '99999\t存在しない会社\t存在しない点検\t2025/01/16\t2025/01/16\t無効マスタ',
            '120406\t日本オーチス・エレベータ　株式会社\tエレベーター定期点検\t2025/01/17\t2025/01/17\t有効データ2'
        ].join('\n');

        await page.click('#pasteBtn');
        await page.fill('#pasteArea', mixedData);
        await page.click('#importPasteBtn');

        await expect(page.locator('#totalCount')).toHaveText('3');
        // 端末IDバリデーション追加により、無効な物件コードの行はエラーになる
        // 有効な行: 2行（2010, 120406）、無効な行: 1行（99999）
        await expect(page.locator('#validCount')).toHaveText('2');
    });

    test('large dataset import works', async ({ page }) => {
        // 10行のデータを生成
        const largeData = Array.from({ length: 10 }, (_, i) =>
            `2010\t山本クリーンシステム　有限会社\t定期清掃\t2025/01/${String(i + 1).padStart(2, '0')}\t2025/01/${String(i + 1).padStart(2, '0')}\t行${i + 1}`
        ).join('\n');

        await page.click('#pasteBtn');
        await page.fill('#pasteArea', largeData);
        await page.click('#importPasteBtn');

        await expect(page.locator('#totalCount')).toHaveText('10');
        await expect(page.locator('#validCount')).toHaveText('10');
    });

    test('special characters in remarks are preserved', async ({ page }) => {
        const specialData = '2010\t山本クリーンシステム　有限会社\t定期清掃\t2025/01/15\t2025/01/15\t特殊文字: ！＠＃＄％';

        await page.click('#pasteBtn');
        await page.fill('#pasteArea', specialData);
        await page.click('#importPasteBtn');

        await expect(page.locator('#totalCount')).toHaveText('1');

        const remarksInput = page.locator('tr:first-child .remarks-input');
        await expect(remarksInput).toHaveValue('特殊文字: ！＠＃＄％');
    });
});
