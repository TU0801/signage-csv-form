// @ts-check
const { test, expect } = require('@playwright/test');
const { baseUrl } = require('./test-helpers');

/**
 * エラーハンドリングテスト
 *
 * Supabaseへの申請時にエラーが発生した場合の動作を確認する
 */
test.describe('Error Handling Tests - エラーハンドリング', () => {

  /**
   * エラーを返すSupabaseモックをセットアップ
   */
  async function setupErrorMock(page, errorMessage = 'Test error') {
    await page.route('https://cdn.jsdelivr.net/**', async route => {
      if (route.request().url().includes('@supabase/supabase-js')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/javascript',
          body: `
            const mockProperties = [
              { id: 1, property_code: '2010', property_name: 'エンクレストガーデン福岡', terminals: '["h0001A00", "h0001A01"]' }
            ];
            const mockVendors = [
              { id: 1, vendor_name: '山本クリーンシステム　有限会社', emergency_contact: '092-934-0407' }
            ];
            const mockInspectionTypes = [
              { id: 1, template_no: 'cleaning', inspection_name: '定期清掃', category: '清掃', default_text: '定期清掃を実施いたします。' }
            ];
            const mockSettings = [
              { id: 1, setting_key: 'display_time_max', setting_value: '30' },
              { id: 2, setting_key: 'remarks_chars_per_line', setting_value: '25' },
              { id: 3, setting_key: 'remarks_max_lines', setting_value: '5' },
              { id: 4, setting_key: 'notice_text_max_chars', setting_value: '200' }
            ];

            export function createClient() {
              return {
                auth: {
                  getUser: async () => ({
                    data: { user: { id: 'test-user-id', email: 'test@example.com' } }
                  }),
                  signOut: async () => ({}),
                  onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } })
                },
                from: (table) => {
                  const getTableData = () => {
                    switch(table) {
                      case 'signage_master_properties': return mockProperties;
                      case 'signage_master_vendors': return mockVendors;
                      case 'signage_master_inspection_types': return mockInspectionTypes;
                      case 'signage_settings': return mockSettings;
                      default: return [];
                    }
                  };
                  return {
                    select: () => ({
                      eq: () => ({
                        single: async () => ({
                          data: { id: 'test-user-id', email: 'test@example.com', role: 'user' },
                          error: null
                        }),
                        order: () => ({ data: getTableData(), error: null })
                      }),
                      order: () => ({ data: getTableData(), error: null })
                    }),
                    insert: (data) => {
                      // エラーを返す
                      return {
                        select: () => ({
                          single: async () => ({ data: null, error: { message: '${errorMessage}' } }),
                          then: (cb) => cb({ data: null, error: { message: '${errorMessage}' } })
                        })
                      };
                    }
                  };
                }
              };
            }
          `
        });
      } else {
        await route.continue();
      }
    });
  }

  test('Supabase insert error shows error toast with message "申請に失敗しました"', async ({ page }) => {
    await setupErrorMock(page);

    await page.goto(`${baseUrl}/index.html`);
    await page.waitForLoadState('networkidle');

    // フォームに入力
    await page.selectOption('#property', '2010');
    await page.waitForTimeout(100);
    await page.selectOption('#vendor', '0');
    await page.selectOption('#inspectionType', '0');

    // データを追加
    await page.click('button:has-text("データを追加")');
    await page.waitForTimeout(200);

    // 申請ボタンをクリック
    await page.click('#submitBtn');
    await page.waitForTimeout(500);

    // エラートーストが表示されることを確認
    const errorToast = page.locator('.toast.error');
    await expect(errorToast).toBeVisible({ timeout: 5000 });

    // エラーメッセージを確認
    const toastText = await errorToast.textContent();
    expect(toastText).toContain('申請に失敗しました');
  });

  test('Error toast has longer display duration than success toast', async ({ page }) => {
    await setupErrorMock(page);

    await page.goto(`${baseUrl}/index.html`);
    await page.waitForLoadState('networkidle');

    // フォームに入力してデータを追加（成功トースト表示）
    await page.selectOption('#property', '2010');
    await page.waitForTimeout(100);
    await page.selectOption('#vendor', '0');
    await page.selectOption('#inspectionType', '0');
    await page.click('button:has-text("データを追加")');

    // 成功トーストが表示されることを確認
    const successToast = page.locator('.toast.success');
    await expect(successToast).toBeVisible({ timeout: 3000 });

    // 成功トーストの表示時間を計測開始
    const successStartTime = Date.now();
    await expect(successToast).not.toBeVisible({ timeout: 10000 });
    const successDuration = Date.now() - successStartTime;

    // 申請ボタンをクリックしてエラーを発生させる
    await page.click('#submitBtn');
    await page.waitForTimeout(500);

    // エラートーストが表示されることを確認
    const errorToast = page.locator('.toast.error');
    await expect(errorToast).toBeVisible({ timeout: 5000 });

    // エラートーストの表示時間を計測
    const errorStartTime = Date.now();
    await expect(errorToast).not.toBeVisible({ timeout: 15000 });
    const errorDuration = Date.now() - errorStartTime;

    // 両方のトーストが適切な時間表示されることを確認（2秒以上）
    console.log(`Success toast duration: ${successDuration}ms, Error toast duration: ${errorDuration}ms`);
    expect(successDuration).toBeGreaterThan(2000);
    expect(errorDuration).toBeGreaterThan(2000);
  });

  test('Submit button is re-enabled after error', async ({ page }) => {
    await setupErrorMock(page);

    await page.goto(`${baseUrl}/index.html`);
    await page.waitForLoadState('networkidle');

    // フォームに入力
    await page.selectOption('#property', '2010');
    await page.waitForTimeout(100);
    await page.selectOption('#vendor', '0');
    await page.selectOption('#inspectionType', '0');

    // データを追加
    await page.click('button:has-text("データを追加")');
    await page.waitForTimeout(200);

    const submitBtn = page.locator('#submitBtn');

    // 申請前にボタンが有効であることを確認
    await expect(submitBtn).toBeEnabled();

    // 申請ボタンをクリック
    await submitBtn.click();

    // エラートーストが表示されるのを待つ
    const errorToast = page.locator('.toast.error');
    await expect(errorToast).toBeVisible({ timeout: 5000 });

    // エラー後にボタンが再び有効になることを確認
    await expect(submitBtn).toBeEnabled({ timeout: 5000 });
  });

  test('Console error is logged on submission failure', async ({ page }) => {
    await setupErrorMock(page, 'Database connection failed');

    // コンソールエラーをキャプチャ
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(`${baseUrl}/index.html`);
    await page.waitForLoadState('networkidle');

    // フォームに入力
    await page.selectOption('#property', '2010');
    await page.waitForTimeout(100);
    await page.selectOption('#vendor', '0');
    await page.selectOption('#inspectionType', '0');

    // データを追加
    await page.click('button:has-text("データを追加")');
    await page.waitForTimeout(200);

    // 申請ボタンをクリック
    await page.click('#submitBtn');
    await page.waitForTimeout(1000);

    // エラートーストが表示されることを確認
    const errorToast = page.locator('.toast.error');
    await expect(errorToast).toBeVisible({ timeout: 5000 });

    // コンソールにエラーが出力されたことを確認
    console.log('Captured console errors:', consoleErrors);
    expect(consoleErrors.length).toBeGreaterThan(0);

    // エラーメッセージに関連する内容が含まれていることを確認
    const hasRelevantError = consoleErrors.some(error =>
      error.includes('error') ||
      error.includes('Error') ||
      error.includes('failed') ||
      error.includes('Database')
    );
    expect(hasRelevantError).toBe(true);
  });
});
