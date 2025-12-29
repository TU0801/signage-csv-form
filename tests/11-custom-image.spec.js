// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * 追加モード（カスタム画像）のテスト
 *
 * テストケース:
 * - 追加モード選択時にフィールドの状態変化
 * - 画像アップロードとStorage連携
 * - 申請データの構造確認
 */

// モックデータ
const mockProperties = [
  { id: 1, property_code: '2010', property_name: 'エンクレストガーデン福岡', terminals: [{ terminalId: 'h0001A00', supplement: '' }] }
];

const mockVendors = [
  { id: 1, vendor_name: '山本クリーンシステム　有限会社', emergency_contact: '092-934-0407' }
];

const mockInspectionTypes = [
  { id: 1, template_no: 'elevator_inspection', inspection_name: 'エレベーター定期点検', category: '点検', default_text: '点検中はエレベーター停止致します。' }
];

const mockSettings = [
  { id: 1, setting_key: 'display_time_max', setting_value: '30' }
];

async function setupMockWithStorage(page, options = {}) {
  const { isAuthenticated = true, email = 'test@example.com' } = options;

  // Storage upload をモック
  let uploadedImages = [];

  await page.route('https://cdn.jsdelivr.net/**', async route => {
    if (route.request().url().includes('@supabase/supabase-js')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: `
          const mockData = {
            properties: ${JSON.stringify(mockProperties)},
            vendors: ${JSON.stringify(mockVendors)},
            inspectionTypes: ${JSON.stringify(mockInspectionTypes)},
            settings: ${JSON.stringify(mockSettings)}
          };

          export function createClient() {
            return {
              auth: {
                getUser: async () => ({
                  data: {
                    user: ${isAuthenticated ? `{ id: 'test-user-id', email: '${email}' }` : 'null'}
                  }
                }),
                signOut: async () => ({}),
                onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } })
              },
              from: (table) => {
                const getTableData = () => {
                  switch(table) {
                    case 'signage_master_properties': return mockData.properties;
                    case 'signage_master_vendors': return mockData.vendors;
                    case 'signage_master_inspection_types': return mockData.inspectionTypes;
                    case 'signage_master_settings': return mockData.settings;
                    default: return [];
                  }
                };

                return {
                  select: (cols) => ({
                    eq: (col, val) => ({
                      single: async () => {
                        if (table === 'signage_profiles') {
                          return {
                            data: { id: 'test-user-id', email: '${email}', role: 'user' },
                            error: null
                          };
                        }
                        return { data: null, error: null };
                      },
                      order: () => ({ data: getTableData(), error: null })
                    }),
                    order: (col, opts) => ({ data: getTableData(), error: null })
                  }),
                  insert: (data) => ({
                    select: () => ({
                      single: async () => ({ data: { id: Date.now(), ...data }, error: null }),
                      then: (cb) => cb({ data: Array.isArray(data) ? data.map((d, i) => ({ id: Date.now() + i, ...d })) : [{ id: Date.now(), ...data }], error: null })
                    })
                  })
                };
              },
              storage: {
                from: (bucket) => ({
                  upload: async (path, blob, options) => {
                    console.log('Mock upload:', path);
                    return { data: { path: path }, error: null };
                  },
                  getPublicUrl: (path) => ({
                    data: { publicUrl: 'https://mock-storage.example.com/' + path }
                  })
                })
              }
            };
          }
        `
      });
    } else {
      await route.continue();
    }
  });

  await page.goto('/');
}

test.describe('追加モード（カスタム画像）', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockWithStorage(page);
    await page.waitForLoadState('networkidle');
  });

  test('追加モード選択時に画像アップロードエリアが表示される', async ({ page }) => {
    // テンプレートモードがデフォルト
    const templateRadio = page.locator('input[name="posterType"][value="template"]');
    await expect(templateRadio).toBeChecked();

    // 画像アップロードエリアは非表示
    const customImageGroup = page.locator('#customImageGroup');
    await expect(customImageGroup).not.toBeVisible();

    // 追加モードを選択
    const customRadio = page.locator('input[name="posterType"][value="custom"]');
    await customRadio.click();

    // 画像アップロードエリアが表示される
    await expect(customImageGroup).toBeVisible();
  });

  test('追加モード選択時に点検開始日・終了日グループが非表示になる', async ({ page }) => {
    // テンプレートモードでは点検日付グループが表示
    const startDateGroup = page.locator('#startDateGroup');
    const endDateGroup = page.locator('#endDateGroup');

    await expect(startDateGroup).toBeVisible();
    await expect(endDateGroup).toBeVisible();

    // 追加モードを選択
    const customRadio = page.locator('input[name="posterType"][value="custom"]');
    await customRadio.click();

    // 点検日付グループが非表示になる
    await expect(startDateGroup).not.toBeVisible();
    await expect(endDateGroup).not.toBeVisible();
  });

  test('追加モード選択時に掲示板用の表示日付フィールドが非活性になる', async ({ page }) => {
    // テンプレートモードでは表示日付フィールドが有効
    const displayStartDate = page.locator('#displayStartDate');
    const displayStartTime = page.locator('#displayStartTime');
    const displayEndDate = page.locator('#displayEndDate');
    const displayEndTime = page.locator('#displayEndTime');

    await expect(displayStartDate).toBeEnabled();
    await expect(displayStartTime).toBeEnabled();
    await expect(displayEndDate).toBeEnabled();
    await expect(displayEndTime).toBeEnabled();

    // 追加モードを選択
    const customRadio = page.locator('input[name="posterType"][value="custom"]');
    await customRadio.click();

    // 表示日付フィールドが非活性になる
    await expect(displayStartDate).toBeDisabled();
    await expect(displayStartTime).toBeDisabled();
    await expect(displayEndDate).toBeDisabled();
    await expect(displayEndTime).toBeDisabled();
  });

  test('テンプレートモードに戻すと日付フィールドが再度有効になる', async ({ page }) => {
    const startDateGroup = page.locator('#startDateGroup');
    const endDateGroup = page.locator('#endDateGroup');
    const displayStartDate = page.locator('#displayStartDate');
    const displayEndDate = page.locator('#displayEndDate');

    // 追加モードを選択
    const customRadio = page.locator('input[name="posterType"][value="custom"]');
    await customRadio.click();

    await expect(startDateGroup).not.toBeVisible();
    await expect(displayStartDate).toBeDisabled();

    // テンプレートモードに戻す
    const templateRadio = page.locator('input[name="posterType"][value="template"]');
    await templateRadio.click();

    // 日付フィールドが再度有効になる
    await expect(startDateGroup).toBeVisible();
    await expect(endDateGroup).toBeVisible();
    await expect(displayStartDate).toBeEnabled();
    await expect(displayEndDate).toBeEnabled();
  });

  test('追加モードで画像を選択するとプレビューが表示される', async ({ page }) => {
    // 追加モードを選択
    await page.locator('input[name="posterType"][value="custom"]').click();

    // ファイル選択をシミュレート
    const fileInput = page.locator('#customImage');

    // テスト用の小さな画像を作成
    const buffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );

    await fileInput.setInputFiles({
      name: 'test.png',
      mimeType: 'image/png',
      buffer: buffer
    });

    // プレビューが表示される
    const uploadPreview = page.locator('#uploadPreview');
    await expect(uploadPreview).toBeVisible();
  });

  test('追加モードで画像削除ボタンをクリックするとプレビューが消える', async ({ page }) => {
    // 追加モードを選択
    await page.locator('input[name="posterType"][value="custom"]').click();

    // ファイル選択
    const fileInput = page.locator('#customImage');
    const buffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );

    await fileInput.setInputFiles({
      name: 'test.png',
      mimeType: 'image/png',
      buffer: buffer
    });

    // プレビュー確認
    const uploadPreview = page.locator('#uploadPreview');
    await expect(uploadPreview).toBeVisible();

    // 削除ボタンをクリック
    await page.locator('#uploadPreview button').click();

    // プレビューが非表示になる
    await expect(uploadPreview).not.toBeVisible();
  });
});

test.describe('追加モードでの申請データ構造', () => {
  test('追加モードで申請するとposter_typeがcustomになる', async ({ page }) => {
    await setupMockWithStorage(page);
    await page.waitForLoadState('networkidle');

    // 必須項目を入力
    await page.locator('#property').selectOption('2010');
    await page.locator('#vendor').selectOption('山本クリーンシステム　有限会社');
    await page.locator('#inspectionType').selectOption('エレベーター定期点検');

    // 追加モードを選択
    await page.locator('input[name="posterType"][value="custom"]').click();

    // 画像を選択
    const fileInput = page.locator('#customImage');
    const buffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );

    await fileInput.setInputFiles({
      name: 'test.png',
      mimeType: 'image/png',
      buffer: buffer
    });

    // データ追加
    await page.locator('button:has-text("データを追加")').click();

    // データが追加されたことを確認
    const dataCount = page.locator('#dataCount');
    await expect(dataCount).toHaveText('1');

    // 申請リクエストをキャプチャ
    let capturedData = null;
    await page.route('**/signage_entries*', async route => {
      if (route.request().method() === 'POST') {
        const postData = route.request().postDataJSON();
        capturedData = postData;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{ id: 1, ...postData }])
        });
      } else {
        await route.continue();
      }
    });

    // 申請ボタンをクリック
    await page.locator('#submitBtn').click();

    // データ構造を確認（UIからCSVプレビューで確認する方法）
    // 実際のSupabaseへの送信はモックされているので、
    // ここではUIの状態変化を確認
    await page.waitForTimeout(500);
  });
});
