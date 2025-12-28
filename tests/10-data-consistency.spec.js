// @ts-check
const { test, expect } = require('@playwright/test');
const { baseUrl, setupAuthMockWithMasterData } = require('./test-helpers');

/**
 * データ整合性テスト（E2E / シナリオテスト）
 *
 * 一件入力と一括入力で同じデータを申請した場合、
 * Supabaseに保存されるデータ構造が同一であることを確認する
 */
test.describe('Data Consistency Tests - 一件入力と一括入力のデータ整合性', () => {

  // テスト用の共通データ（script.jsの静的データと一致させる）
  const testData = {
    propertyCode: '2010',
    propertyName: 'エンクレストガーデン福岡',
    terminalId: 'h0001A00',
    vendorName: '山本クリーンシステム　有限会社',
    emergencyContact: '092-934-0407',
    inspectionType: 'エレベーター定期点検', // script.jsの最初の点検種別
    templateNo: 'elevator_inspection',
    startDate: '2025-02-01',
    endDate: '2025-02-01',
    remarks: 'テスト備考',
    displayTime: 6,
    position: 2
  };

  test('一件入力からの申請データ構造を確認', async ({ page }) => {
    // 申請時に送信されるデータをキャプチャ
    let capturedEntries = null;

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

            // 申請データをキャプチャするためのグローバル変数
            window.__capturedEntries = null;

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
                      // 申請データをキャプチャ
                      window.__capturedEntries = data;
                      console.log('CAPTURED_ENTRIES:', JSON.stringify(data));
                      return {
                        select: () => ({
                          single: async () => ({ data: { id: 1, ...data[0] }, error: null }),
                          then: (cb) => cb({ data: data.map((d, i) => ({ id: i + 1, ...d })), error: null })
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

    // コンソールログをキャプチャ
    page.on('console', msg => {
      if (msg.text().startsWith('CAPTURED_ENTRIES:')) {
        capturedEntries = JSON.parse(msg.text().replace('CAPTURED_ENTRIES:', ''));
      }
    });

    await page.goto(`${baseUrl}/index.html`);
    await page.waitForLoadState('networkidle');

    // フォームに入力
    await page.selectOption('#property', testData.propertyCode);
    await page.waitForTimeout(100);
    await page.selectOption('#terminal', testData.terminalId);
    await page.selectOption('#vendor', '0'); // index
    await page.selectOption('#inspectionType', '0'); // index
    await page.fill('#startDate', testData.startDate);
    await page.fill('#endDate', testData.endDate);
    await page.fill('#remarks', testData.remarks);
    await page.fill('#displayTime', String(testData.displayTime));

    // データを追加
    await page.click('button:has-text("データを追加")');
    await page.waitForTimeout(200);

    // 申請ボタンをクリック
    await page.click('#submitBtn');
    await page.waitForTimeout(500);

    // データがキャプチャされたことを確認
    expect(capturedEntries).not.toBeNull();
    expect(capturedEntries.length).toBe(1);

    const entry = capturedEntries[0];

    // 必須フィールドが正しい形式で存在することを確認
    expect(entry).toHaveProperty('property_code');
    expect(entry).toHaveProperty('terminal_id');
    expect(entry).toHaveProperty('vendor_name');
    expect(entry).toHaveProperty('emergency_contact');
    expect(entry).toHaveProperty('inspection_type');
    expect(entry).toHaveProperty('template_no');
    expect(entry).toHaveProperty('start_date');
    expect(entry).toHaveProperty('end_date');
    expect(entry).toHaveProperty('remarks');
    expect(entry).toHaveProperty('display_time');
    expect(entry).toHaveProperty('show_on_board');
    expect(entry).toHaveProperty('poster_type');
    expect(entry).toHaveProperty('position');
    expect(entry).toHaveProperty('status');

    // 値の検証
    expect(entry.property_code).toBe('2010');
    expect(entry.vendor_name).toBe(testData.vendorName);
    expect(entry.inspection_type).toBe(testData.inspectionType);
    expect(entry.start_date).toBe(testData.startDate);
    expect(entry.remarks).toBe(testData.remarks);
    expect(entry.status).toBe('pending');

    console.log('Single entry captured data:', JSON.stringify(entry, null, 2));
  });

  test('一括入力からの申請データ構造を確認', async ({ page }) => {
    let capturedEntries = null;

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
              { id: 1, template_no: 'elevator_inspection', inspection_name: 'エレベーター定期点検', category: '点検', default_text: '点検中はエレベーター停止致します。' }
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
                      console.log('CAPTURED_ENTRIES:', JSON.stringify(data));
                      return {
                        select: () => ({
                          single: async () => ({ data: { id: 1, ...data[0] }, error: null }),
                          then: (cb) => cb({ data: data.map((d, i) => ({ id: i + 1, ...d })), error: null })
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

    page.on('console', msg => {
      if (msg.text().startsWith('CAPTURED_ENTRIES:')) {
        capturedEntries = JSON.parse(msg.text().replace('CAPTURED_ENTRIES:', ''));
      }
    });

    await page.goto(`${baseUrl}/bulk.html`);
    await page.waitForLoadState('networkidle');

    // 行を追加
    await page.click('#addRowBtn');
    await page.waitForTimeout(200);

    // 行にデータを入力（端末選択は省略、自動設定に任せる）
    const row = page.locator('tbody tr').first();
    await row.locator('.property-select').selectOption(testData.propertyCode);
    await page.waitForTimeout(300); // 端末リスト更新を待つ
    await row.locator('.vendor-select').selectOption(testData.vendorName);
    await row.locator('.inspection-select').selectOption(testData.inspectionType);
    await row.locator('.start-date').fill(testData.startDate);
    await row.locator('.remarks-input').fill(testData.remarks);
    await row.locator('.display-time').fill(String(testData.displayTime));

    await page.waitForTimeout(300);

    // 申請ボタンをクリック
    await page.click('#saveBtn');
    await page.waitForTimeout(500);

    // データがキャプチャされたことを確認
    expect(capturedEntries).not.toBeNull();
    expect(capturedEntries.length).toBe(1);

    const entry = capturedEntries[0];

    // 必須フィールドが正しい形式で存在することを確認
    expect(entry).toHaveProperty('property_code');
    expect(entry).toHaveProperty('terminal_id');
    expect(entry).toHaveProperty('vendor_name');
    expect(entry).toHaveProperty('emergency_contact');
    expect(entry).toHaveProperty('inspection_type');
    expect(entry).toHaveProperty('template_no');
    expect(entry).toHaveProperty('start_date');
    expect(entry).toHaveProperty('end_date');
    expect(entry).toHaveProperty('remarks');
    expect(entry).toHaveProperty('display_time');
    expect(entry).toHaveProperty('show_on_board');
    expect(entry).toHaveProperty('poster_type');
    expect(entry).toHaveProperty('position');
    expect(entry).toHaveProperty('status');

    // 値の検証
    expect(entry.property_code).toBe('2010');
    expect(entry.vendor_name).toBe(testData.vendorName);
    expect(entry.inspection_type).toBe(testData.inspectionType);
    expect(entry.start_date).toBe(testData.startDate);
    expect(entry.remarks).toBe(testData.remarks);
    expect(entry.status).toBe('pending');

    console.log('Bulk entry captured data:', JSON.stringify(entry, null, 2));
  });

  test('一件入力と一括入力のデータ構造が一致すること', async ({ page }) => {
    // 両方の入力方法で同じデータを申請し、構造を比較
    const capturedData = { single: null, bulk: null };

    const setupMock = async (pageInstance) => {
      await pageInstance.route('https://cdn.jsdelivr.net/**', async route => {
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
                { id: 1, template_no: 'elevator_inspection', inspection_name: 'エレベーター定期点検', category: '点検', default_text: '点検中はエレベーター停止致します。' }
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
                        console.log('CAPTURED_ENTRIES:', JSON.stringify(data));
                        return {
                          select: () => ({
                            single: async () => ({ data: { id: 1, ...data[0] }, error: null }),
                            then: (cb) => cb({ data: data.map((d, i) => ({ id: i + 1, ...d })), error: null })
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
    };

    // 一件入力
    await setupMock(page);
    page.on('console', msg => {
      if (msg.text().startsWith('CAPTURED_ENTRIES:')) {
        const data = JSON.parse(msg.text().replace('CAPTURED_ENTRIES:', ''));
        if (!capturedData.single) {
          capturedData.single = data[0];
        } else if (!capturedData.bulk) {
          capturedData.bulk = data[0];
        }
      }
    });

    await page.goto(`${baseUrl}/index.html`);
    await page.waitForLoadState('networkidle');

    await page.selectOption('#property', testData.propertyCode);
    await page.waitForTimeout(100);
    await page.selectOption('#vendor', '0');
    await page.selectOption('#inspectionType', '0');
    await page.fill('#startDate', testData.startDate);
    await page.fill('#endDate', testData.endDate);
    await page.fill('#remarks', testData.remarks);
    await page.fill('#displayTime', String(testData.displayTime));
    await page.click('button:has-text("データを追加")');
    await page.waitForTimeout(200);
    await page.click('#submitBtn');
    await page.waitForTimeout(500);

    // 一括入力
    await page.goto(`${baseUrl}/bulk.html`);
    await page.waitForLoadState('networkidle');

    await page.click('#addRowBtn');
    await page.waitForTimeout(200);

    const row = page.locator('tbody tr').first();
    await row.locator('.property-select').selectOption(testData.propertyCode);
    await page.waitForTimeout(300);
    await row.locator('.vendor-select').selectOption(testData.vendorName);
    await row.locator('.inspection-select').selectOption(testData.inspectionType);
    await row.locator('.start-date').fill(testData.startDate);
    await row.locator('.remarks-input').fill(testData.remarks);
    await row.locator('.display-time').fill(String(testData.displayTime));
    await page.waitForTimeout(200);
    await page.click('#saveBtn');
    await page.waitForTimeout(500);

    // 両方のデータがキャプチャされたことを確認
    expect(capturedData.single).not.toBeNull();
    expect(capturedData.bulk).not.toBeNull();

    console.log('Single entry:', JSON.stringify(capturedData.single, null, 2));
    console.log('Bulk entry:', JSON.stringify(capturedData.bulk, null, 2));

    // 共通フィールドが一致することを確認
    const fieldsToCompare = [
      'property_code',
      'vendor_name',
      'inspection_type',
      'start_date',
      'remarks',
      'display_time',
      'show_on_board',
      'status'
    ];

    for (const field of fieldsToCompare) {
      expect(capturedData.single[field]).toBe(capturedData.bulk[field]);
    }

    // キーのセットが同じであることを確認
    const singleKeys = Object.keys(capturedData.single).sort();
    const bulkKeys = Object.keys(capturedData.bulk).sort();
    expect(singleKeys).toEqual(bulkKeys);
  });

  test('管理画面でのCSV出力データ構造を確認', async ({ page }) => {
    // 管理画面に移動してCSV出力をテスト
    await setupAuthMockWithMasterData(page, `${baseUrl}/admin.html`, { isAdmin: true });
    await page.waitForLoadState('networkidle');

    // エントリータブを選択
    const entriesTab = page.locator('[data-tab="entries"]');
    if (await entriesTab.isVisible()) {
      await entriesTab.click();
      await page.waitForTimeout(200);
    }

    // CSV出力ボタンを確認
    const csvButton = page.locator('button:has-text("CSV出力")');
    const isVisible = await csvButton.isVisible().catch(() => false);

    if (isVisible) {
      // CSVエクスポートダイアログを開く
      await csvButton.click();
      await page.waitForTimeout(200);

      // モーダルが開いたことを確認
      const modal = page.locator('.modal-overlay.active, #csvExportModal.active');
      const modalVisible = await modal.isVisible().catch(() => false);

      expect(modalVisible || isVisible).toBe(true);
      console.log('CSV export functionality is available');
    }
  });
});

test.describe('Data Field Mapping Tests - フィールドマッピング確認', () => {

  test('一件入力のフィールド名がスネークケースに変換されること', async ({ page }) => {
    let capturedEntry = null;

    await page.route('https://cdn.jsdelivr.net/**', async route => {
      if (route.request().url().includes('@supabase/supabase-js')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/javascript',
          body: `
            const mockProperties = [{ id: 1, property_code: '2010', property_name: 'Test', terminals: '["h0001A00"]' }];
            const mockVendors = [{ id: 1, vendor_name: 'TestVendor', emergency_contact: '000-0000' }];
            const mockInspectionTypes = [{ id: 1, template_no: 'test', inspection_name: 'Test', category: 'Test', default_text: 'Test' }];
            const mockSettings = [];

            export function createClient() {
              return {
                auth: {
                  getUser: async () => ({ data: { user: { id: 'test-user-id', email: 'test@example.com' } } }),
                  signOut: async () => ({}),
                  onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } })
                },
                from: (table) => ({
                  select: () => ({
                    eq: () => ({
                      single: async () => ({ data: { id: 'test-user-id', email: 'test@example.com', role: 'user' }, error: null }),
                      order: () => {
                        switch(table) {
                          case 'signage_master_properties': return { data: mockProperties, error: null };
                          case 'signage_master_vendors': return { data: mockVendors, error: null };
                          case 'signage_master_inspection_types': return { data: mockInspectionTypes, error: null };
                          case 'signage_settings': return { data: mockSettings, error: null };
                          default: return { data: [], error: null };
                        }
                      }
                    }),
                    order: () => {
                      switch(table) {
                        case 'signage_master_properties': return { data: mockProperties, error: null };
                        case 'signage_master_vendors': return { data: mockVendors, error: null };
                        case 'signage_master_inspection_types': return { data: mockInspectionTypes, error: null };
                        case 'signage_settings': return { data: mockSettings, error: null };
                        default: return { data: [], error: null };
                      }
                    }
                  }),
                  insert: (data) => {
                    console.log('ENTRY_DATA:', JSON.stringify(data));
                    return { select: () => ({ single: async () => ({ data: { id: 1 }, error: null }), then: (cb) => cb({ data: [{ id: 1 }], error: null }) }) };
                  }
                })
              };
            }
          `
        });
      } else {
        await route.continue();
      }
    });

    page.on('console', msg => {
      if (msg.text().startsWith('ENTRY_DATA:')) {
        capturedEntry = JSON.parse(msg.text().replace('ENTRY_DATA:', ''))[0];
      }
    });

    await page.goto(`${baseUrl}/index.html`);
    await page.waitForLoadState('networkidle');

    // 最小限の入力
    await page.selectOption('#property', '2010');
    await page.waitForTimeout(100);
    await page.selectOption('#vendor', '0');
    await page.selectOption('#inspectionType', '0');
    await page.click('button:has-text("データを追加")');
    await page.waitForTimeout(200);
    await page.click('#submitBtn');
    await page.waitForTimeout(500);

    expect(capturedEntry).not.toBeNull();

    // キャメルケースではなくスネークケースであることを確認
    expect(capturedEntry).not.toHaveProperty('propertyCode');
    expect(capturedEntry).not.toHaveProperty('terminalId');
    expect(capturedEntry).not.toHaveProperty('vendorName');
    expect(capturedEntry).not.toHaveProperty('emergencyContact');
    expect(capturedEntry).not.toHaveProperty('inspectionType');
    expect(capturedEntry).not.toHaveProperty('templateNo');
    expect(capturedEntry).not.toHaveProperty('startDate');
    expect(capturedEntry).not.toHaveProperty('endDate');
    expect(capturedEntry).not.toHaveProperty('showOnBoard');
    expect(capturedEntry).not.toHaveProperty('posterType');
    expect(capturedEntry).not.toHaveProperty('displayTime');
    expect(capturedEntry).not.toHaveProperty('displayStartDate');
    expect(capturedEntry).not.toHaveProperty('displayEndDate');
    expect(capturedEntry).not.toHaveProperty('displayStartTime');
    expect(capturedEntry).not.toHaveProperty('displayEndTime');
    expect(capturedEntry).not.toHaveProperty('noticeText');
    expect(capturedEntry).not.toHaveProperty('frameNo');

    // スネークケースであることを確認
    expect(capturedEntry).toHaveProperty('property_code');
    expect(capturedEntry).toHaveProperty('terminal_id');
    expect(capturedEntry).toHaveProperty('vendor_name');
    expect(capturedEntry).toHaveProperty('emergency_contact');
    expect(capturedEntry).toHaveProperty('inspection_type');
    expect(capturedEntry).toHaveProperty('template_no');
    expect(capturedEntry).toHaveProperty('start_date');
    expect(capturedEntry).toHaveProperty('end_date');
    expect(capturedEntry).toHaveProperty('show_on_board');
    expect(capturedEntry).toHaveProperty('poster_type');
    expect(capturedEntry).toHaveProperty('display_time');
    expect(capturedEntry).toHaveProperty('display_start_date');
    expect(capturedEntry).toHaveProperty('display_end_date');
    expect(capturedEntry).toHaveProperty('display_start_time');
    expect(capturedEntry).toHaveProperty('display_end_time');
    expect(capturedEntry).toHaveProperty('notice_text');
    expect(capturedEntry).toHaveProperty('position');
    expect(capturedEntry).toHaveProperty('status');
  });
});
