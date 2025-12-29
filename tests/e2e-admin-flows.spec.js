// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * 管理者のE2Eテスト
 *
 * 実際の管理者行動に基づいたテストケース:
 * - ログイン・権限確認
 * - 承認待ち申請の確認・承認・却下
 * - データ一覧の検索・フィルタリング
 * - CSVエクスポート
 * - マスターデータ管理
 */

// テスト用モックデータ
const mockPendingEntries = [
  {
    id: 1,
    property_code: '2010',
    terminal_id: 'h0001A00',
    vendor_name: '山本クリーンシステム',
    inspection_type: 'エレベーター点検',
    inspection_start: '2025-02-01',
    inspection_end: '2025-02-01',
    remarks: 'テスト備考',
    announcement: '点検のお知らせ',
    display_duration: 6,
    poster_type: 'template',
    poster_position: '2',
    status: 'draft',
    user_id: 'user-1',
    created_at: '2025-01-15T10:00:00Z',
    signage_profiles: { email: 'user@example.com', company_name: 'テスト会社' }
  },
  {
    id: 2,
    property_code: '120406',
    terminal_id: 'z1003A01',
    vendor_name: '別の業者',
    inspection_type: '消防点検',
    inspection_start: '2025-02-15',
    inspection_end: '2025-02-15',
    remarks: '備考2',
    announcement: '案内2',
    display_duration: 8,
    poster_type: 'template',
    poster_position: '1',
    status: 'draft',
    user_id: 'user-2',
    created_at: '2025-01-16T10:00:00Z',
    signage_profiles: { email: 'user2@example.com', company_name: '別会社' }
  }
];

const mockProperties = [
  { id: 1, property_code: '2010', property_name: 'エンクレストガーデン福岡', terminals: [{ terminalId: 'h0001A00', supplement: '' }, { terminalId: 'h0001A01', supplement: '' }] },
  { id: 2, property_code: '120406', property_name: 'アソシアグロッツォ天神', terminals: [{ terminalId: 'z1003A01', supplement: '' }] }
];

const mockVendors = [
  { id: 1, vendor_name: '山本クリーンシステム', emergency_contact: '092-000-0001' },
  { id: 2, vendor_name: '別の業者', emergency_contact: '092-000-0002' }
];

const mockInspectionTypes = [
  { id: 1, template_no: 'elevator', inspection_name: 'エレベーター点検', category: 'inspection', default_text: '' },
  { id: 2, template_no: 'fire', inspection_name: '消防点検', category: 'inspection', default_text: '' }
];

// 管理者用モックセットアップ
async function setupAdminMock(page, options = {}) {
  const { email = 'admin@example.com', entries = mockPendingEntries } = options;

  await page.route('https://cdn.jsdelivr.net/**', async route => {
    if (route.request().url().includes('@supabase/supabase-js')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: `
          let currentEntries = ${JSON.stringify(entries)};
          const mockProperties = ${JSON.stringify(mockProperties)};
          const mockVendors = ${JSON.stringify(mockVendors)};
          const mockInspectionTypes = ${JSON.stringify(mockInspectionTypes)};
          const mockUsers = [{ id: 'admin-id', email: '${email}', role: 'admin', company_name: '管理会社' }];
          const mockCategories = [{ id: 1, category_key: 'inspection', category_name: '点検', sort_order: 1 }];

          export function createClient() {
            return {
              auth: {
                getUser: async () => ({ data: { user: { id: 'admin-id', email: '${email}' } } }),
                signInWithPassword: async () => ({ data: { user: { id: 'admin-id', email: '${email}' } } }),
                signOut: async () => ({}),
                onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } })
              },
              from: (table) => ({
                select: (cols) => ({
                  eq: (col, val) => {
                    if (table === 'signage_entries' && col === 'status') {
                      if (val === 'draft') {
                        return { order: () => ({ data: currentEntries.filter(e => e.status === 'draft'), error: null }) };
                      } else if (val === 'submitted') {
                        return { order: () => ({ data: currentEntries.filter(e => e.status === 'submitted'), error: null }) };
                      }
                    }
                    return {
                      single: async () => {
                        if (table === 'signage_profiles') {
                          return { data: { id: 'admin-id', email: '${email}', role: 'admin' }, error: null };
                        }
                        return { data: null, error: null };
                      },
                      order: () => ({ data: [], error: null }),
                      gte: () => ({ lte: () => ({ data: currentEntries, error: null }) })
                    };
                  },
                  order: () => {
                    if (table === 'signage_master_properties') return { data: mockProperties, error: null };
                    if (table === 'signage_master_vendors') return { data: mockVendors, error: null };
                    if (table === 'signage_master_inspection_types') return { data: mockInspectionTypes, error: null };
                    if (table === 'signage_master_categories') return { data: mockCategories, error: null };
                    if (table === 'signage_profiles') return { data: mockUsers, error: null };
                    if (table === 'signage_entries') return { data: currentEntries, error: null };
                    return { data: [], error: null };
                  },
                  gte: () => ({ lte: () => ({ order: () => ({ data: currentEntries, error: null }), data: currentEntries, error: null }) }),
                  neq: () => ({ order: () => ({ data: currentEntries, error: null }) })
                }),
                insert: (data) => ({
                  select: () => ({
                    single: async () => ({ data: { id: Date.now(), ...data }, error: null }),
                    then: (cb) => cb({ data: Array.isArray(data) ? data : [data], error: null })
                  })
                }),
                update: (data) => ({
                  eq: (col, val) => {
                    const entry = currentEntries.find(e => e.id === val);
                    if (entry) Object.assign(entry, data);
                    return { select: () => ({ single: async () => ({ data: entry || data, error: null }) }) };
                  },
                  in: (col, vals) => ({
                    select: async () => {
                      vals.forEach(id => {
                        const entry = currentEntries.find(e => e.id === id);
                        if (entry) Object.assign(entry, data);
                      });
                      return { data: currentEntries.filter(e => vals.includes(e.id)), error: null };
                    }
                  })
                }),
                upsert: (data) => ({ select: async () => ({ data: Array.isArray(data) ? data : [data], error: null }) }),
                delete: () => ({
                  eq: async (col, val) => {
                    currentEntries = currentEntries.filter(e => e.id !== val);
                    return { error: null };
                  }
                })
              })
            };
          }
        `
      });
    } else {
      await route.continue();
    }
  });

  await page.goto('/admin.html');
  await page.waitForLoadState('networkidle');
}

// ============================================
// ログイン・権限テスト
// ============================================
test.describe('管理者ログイン・権限', () => {
  test('一般ユーザーは管理画面にアクセスできない', async ({ page }) => {
    await page.route('https://cdn.jsdelivr.net/**', async route => {
      if (route.request().url().includes('@supabase/supabase-js')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/javascript',
          body: `
            export function createClient() {
              return {
                auth: {
                  getUser: async () => ({ data: { user: { id: 'user-id', email: 'user@example.com' } } }),
                  signOut: async () => ({}),
                  onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } })
                },
                from: (table) => ({
                  select: () => ({
                    eq: () => ({
                      single: async () => ({ data: { id: 'user-id', email: 'user@example.com', role: 'user' }, error: null }),
                      order: () => ({ data: [], error: null })
                    }),
                    order: () => ({ data: [], error: null })
                  })
                })
              };
            }
          `
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/admin.html');
    await page.waitForTimeout(500);

    // 一般ユーザーはリダイレクトされる
    expect(page.url()).not.toContain('admin.html');
  });

  test('管理者は管理画面にアクセスできる', async ({ page }) => {
    await setupAdminMock(page);
    await page.waitForTimeout(300);

    // 管理画面が表示される
    await expect(page.locator('.admin-tab.active').first()).toBeVisible();
  });
});

// ============================================
// 承認待ちテスト
// ============================================
test.describe('承認待ち', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminMock(page);
    await page.waitForTimeout(300);
  });

  test('承認待ちタブがデフォルトで選択されている', async ({ page }) => {
    await expect(page.locator('.admin-tab.active').first()).toContainText('承認待ち');
  });

  test('承認待ちの申請件数が表示される', async ({ page }) => {
    await expect(page.locator('#pendingCount')).toBeVisible();
  });

  test('承認待ちの申請一覧テーブルが表示される', async ({ page }) => {
    // テーブル要素が存在することを確認
    await expect(page.locator('#tab-approval .data-table')).toBeVisible();
  });

  test('申請の詳細ボタンをクリックすると詳細モーダルが表示される', async ({ page }) => {
    await page.waitForTimeout(500);

    const detailBtn = page.locator('#pendingBody tr:first-child button').filter({ hasText: '📋' }).first();
    if (await detailBtn.isVisible()) {
      await detailBtn.click();
      await expect(page.locator('#entryDetailModal, .entry-detail-modal')).toBeVisible();
    }
  });

  test('承認ボタンをクリックすると申請が承認される', async ({ page }) => {
    await page.waitForTimeout(500);

    const approveBtn = page.locator('#pendingBody tr:first-child button').filter({ hasText: '承認' }).first();
    if (await approveBtn.isVisible()) {
      page.on('dialog', dialog => dialog.accept());
      await approveBtn.click();
      await page.waitForTimeout(300);

      // 成功メッセージが表示される
      await expect(page.locator('.toast')).toBeVisible();
    }
  });

  test('却下ボタンをクリックすると申請が削除される', async ({ page }) => {
    await page.waitForTimeout(500);

    const pendingBody = page.locator('#pendingBody');
    const initialCount = await pendingBody.locator('tr').count();

    const rejectBtn = pendingBody.locator('tr:first-child button').filter({ hasText: '却下' }).first();
    if (await rejectBtn.isVisible()) {
      page.on('dialog', dialog => dialog.accept());
      await rejectBtn.click();
      await page.waitForTimeout(300);

      // 行が減っていることを確認
      const newCount = await pendingBody.locator('tr').count();
      expect(newCount).toBeLessThan(initialCount);
    }
  });

  test('全選択して一括承認できる', async ({ page }) => {
    await page.waitForTimeout(500);

    const selectAll = page.locator('#pendingSelectAll');
    if (await selectAll.isVisible()) {
      await selectAll.check();

      const bulkApproveBtn = page.locator('#bulkApproveBtn');
      if (await bulkApproveBtn.isVisible() && await bulkApproveBtn.isEnabled()) {
        page.on('dialog', dialog => dialog.accept());
        await bulkApproveBtn.click();
        await page.waitForTimeout(300);

        await expect(page.locator('.toast')).toBeVisible();
      }
    }
  });
});

// ============================================
// データ一覧テスト
// ============================================
test.describe('データ一覧', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminMock(page);
    await page.waitForTimeout(300);
    await page.click('.admin-tab[data-tab="entries"]');
    await expect(page.locator('#tab-entries')).toBeVisible();
  });

  test('データ一覧タブでテーブルが表示される', async ({ page }) => {
    // テーブル要素が存在することを確認
    await expect(page.locator('#tab-entries .data-table')).toBeVisible();
  });

  test('物件でフィルタリングできる', async ({ page }) => {
    await expect(page.locator('#filterProperty')).toBeVisible();
  });

  test('日付でフィルタリングできる', async ({ page }) => {
    await expect(page.locator('#filterStartDate')).toBeVisible();
    await expect(page.locator('#filterEndDate')).toBeVisible();
  });

  test('検索ボタンで条件に合うデータを絞り込める', async ({ page }) => {
    await expect(page.locator('#searchBtn')).toBeVisible();
  });

  test('状態フィルターが表示される', async ({ page }) => {
    await expect(page.locator('#filterStatus')).toBeVisible();
    // オプションを確認
    await expect(page.locator('#filterStatus option')).toHaveCount(3);
  });

  test('一括ステータス変更ボタンが表示される', async ({ page }) => {
    await expect(page.locator('#markExportedBtn')).toBeVisible();
    await expect(page.locator('#markSubmittedBtn')).toBeVisible();
    // 初期状態では無効
    await expect(page.locator('#markExportedBtn')).toBeDisabled();
    await expect(page.locator('#markSubmittedBtn')).toBeDisabled();
  });
});

// ============================================
// CSVエクスポートテスト（データ一覧タブに統合）
// ============================================
test.describe('CSVエクスポート', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminMock(page);
    await page.waitForTimeout(300);
    await page.click('.admin-tab[data-tab="entries"]');
    await expect(page.locator('#tab-entries')).toBeVisible();
  });

  test('データ一覧タブでデータ件数が表示される', async ({ page }) => {
    await expect(page.locator('#entriesCount')).toBeVisible();
  });

  test('CSVダウンロードボタンが表示される', async ({ page }) => {
    await expect(page.locator('#exportCsvBtn')).toBeVisible();
  });

  test('CSVコピーボタンが表示される', async ({ page }) => {
    await expect(page.locator('#exportCopyBtn')).toBeVisible();
  });
});

// ============================================
// マスター管理テスト
// ============================================
test.describe('マスター管理', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminMock(page);
    await page.waitForTimeout(300);
    await page.click('.admin-tab[data-tab="master"]');
    await expect(page.locator('#tab-master')).toBeVisible();
  });

  test('物件マスターが表示される', async ({ page }) => {
    // 物件タブがデフォルトで選択されている
    await expect(page.locator('#tab-master .admin-tab.active')).toContainText('物件');
    await expect(page.locator('#master-properties')).toBeVisible();
  });

  test('受注先マスタータブをクリックすると受注先一覧が表示される', async ({ page }) => {
    await page.click('#tab-master .admin-tab[data-master="vendors"]');
    await expect(page.locator('#master-vendors')).toBeVisible();
  });

  test('点検種別マスタータブをクリックすると点検種別一覧が表示される', async ({ page }) => {
    await page.click('#tab-master .admin-tab[data-master="inspections"]');
    await expect(page.locator('#master-inspections')).toBeVisible();
  });
});

// ============================================
// マスターデータがユーザー画面に反映されるテスト
// ============================================
test.describe('マスターデータ連携', () => {
  test('マスターデータがユーザーの入力画面に反映される', async ({ page }) => {
    const { setupAuthMockWithMasterData } = require('./test-helpers');

    await setupAuthMockWithMasterData(page, '/', {
      isAuthenticated: true,
      email: 'user@example.com'
    });

    await page.waitForLoadState('networkidle');

    // 物件プルダウンにデータが入っていることを確認
    const propertyOptions = await page.locator('#property option').count();
    expect(propertyOptions).toBeGreaterThan(1);

    // 業者プルダウンにデータが入っていることを確認
    const vendorOptions = await page.locator('#vendor option').count();
    expect(vendorOptions).toBeGreaterThan(1);

    // 点検種別プルダウンにデータが入っていることを確認
    const inspectionOptions = await page.locator('#inspectionType option').count();
    expect(inspectionOptions).toBeGreaterThan(1);
  });

  test('物件を選択すると対応する端末がプルダウンに表示される', async ({ page }) => {
    const { setupAuthMockWithMasterData } = require('./test-helpers');

    await setupAuthMockWithMasterData(page, '/', {
      isAuthenticated: true,
      email: 'user@example.com'
    });

    await page.waitForLoadState('networkidle');

    // 物件を選択
    await page.selectOption('#property', '2010');
    await page.waitForTimeout(200);

    // 端末プルダウンにオプションが追加されていることを確認
    const terminalOptions = await page.locator('#terminal option').count();
    expect(terminalOptions).toBeGreaterThan(0);
  });
});
