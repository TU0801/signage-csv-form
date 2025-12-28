// @ts-check
const { test, expect } = require('@playwright/test');

// Mock pending entries for approval workflow tests
const mockPendingEntries = [
  { id: 1, property_code: '2010', inspection_type: 'テスト点検', inspection_start: '2025-01-01', start_date: '2025-01-01', status: 'pending', user_id: 'test-user', created_at: '2025-01-01T10:00:00Z' },
  { id: 2, property_code: '2020', inspection_type: '定期清掃', inspection_start: '2025-01-02', start_date: '2025-01-02', status: 'pending', user_id: 'test-user', created_at: '2025-01-02T10:00:00Z' }
];

/**
 * Custom setup for admin approval tests with pending entries
 */
async function setupAuthMockWithPendingEntries(page, url, options = {}) {
  const {
    isAuthenticated = true,
    isAdmin = true,
    email = 'admin@example.com',
    pendingEntries = mockPendingEntries
  } = options;

  const mockProperties = [
    { id: 1, property_code: '2010', property_name: 'エンクレストガーデン福岡', terminals: '["h0001A00", "h0001A01", "h0001A02"]' },
    { id: 2, property_code: '2020', property_name: 'テスト物件', terminals: '["t0001A01"]' }
  ];

  const mockVendors = [
    { id: 1, vendor_name: '山本クリーンシステム　有限会社', emergency_contact: '092-934-0407' }
  ];

  const mockInspectionTypes = [
    { id: 1, template_no: 'cleaning', inspection_name: '定期清掃', category: '清掃', default_text: '定期清掃を実施いたします。' },
    { id: 2, template_no: 'test_inspection', inspection_name: 'テスト点検', category: '点検', default_text: 'テスト点検を実施いたします。' }
  ];

  const mockCategories = [
    { id: 1, category_name: '点検', sort_order: 1 },
    { id: 2, category_name: '清掃', sort_order: 2 }
  ];

  const mockEntries = [];

  const mockUsers = [
    { id: 'test-user', email: 'user@example.com', company_name: 'テスト会社', role: 'user', created_at: '2025-01-01' },
    { id: 'admin-user', email: 'admin@example.com', company_name: '管理会社', role: 'admin', created_at: '2025-01-01' }
  ];

  const mockSettings = [
    { id: 1, setting_key: 'display_time_max', setting_value: '30' }
  ];

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
            categories: ${JSON.stringify(mockCategories)},
            entries: ${JSON.stringify(mockEntries)},
            users: ${JSON.stringify(mockUsers)},
            settings: ${JSON.stringify(mockSettings)},
            pendingEntries: ${JSON.stringify(pendingEntries)}
          };

          export function createClient() {
            return {
              auth: {
                getUser: async () => ({
                  data: {
                    user: ${isAuthenticated ? `{ id: 'admin-user', email: '${email}' }` : 'null'}
                  }
                }),
                signInWithPassword: async ({ email, password }) => {
                  if (email && password) {
                    return { data: { user: { id: 'admin-user', email } } };
                  }
                  throw new Error('Invalid credentials');
                },
                signOut: async () => ({}),
                onAuthStateChange: (callback) => {
                  return { data: { subscription: { unsubscribe: () => {} } } };
                }
              },
              from: (table) => {
                const getTableData = () => {
                  switch(table) {
                    case 'signage_master_properties': return mockData.properties;
                    case 'signage_master_vendors': return mockData.vendors;
                    case 'signage_master_inspection_types': return mockData.inspectionTypes;
                    case 'signage_master_categories': return mockData.categories;
                    case 'signage_entries': return mockData.entries;
                    case 'signage_profiles': return mockData.users;
                    case 'signage_settings': return mockData.settings;
                    case 'signage_master_settings': return mockData.settings;
                    default: return [];
                  }
                };

                const createChainableResult = (data) => ({
                  order: () => ({ data, error: null }),
                  data,
                  error: null
                });

                return {
                  select: (cols) => {
                    const baseData = getTableData();

                    return {
                      eq: (col, val) => {
                        // Handle status filter for pending entries
                        if (table === 'signage_entries' && col === 'status' && val === 'pending') {
                          return createChainableResult(mockData.pendingEntries);
                        }

                        // Handle profile lookup
                        if (table === 'signage_profiles' && col === 'id') {
                          return {
                            single: async () => ({
                              data: ${isAdmin ? `{ id: 'admin-user', email: '${email}', role: 'admin' }` : `{ id: 'admin-user', email: '${email}', role: 'user' }`},
                              error: null
                            }),
                            order: () => ({ data: baseData, error: null }),
                            gte: () => ({ lte: () => ({ data: baseData, error: null }) })
                          };
                        }

                        // Handle setting key lookup
                        if (table === 'signage_master_settings' && col === 'setting_key') {
                          const found = mockData.settings.find(s => s.setting_key === val);
                          return {
                            single: async () => ({ data: found || null, error: null })
                          };
                        }

                        return {
                          single: async () => {
                            const found = baseData.find(d => d[col] === val || d.id === val);
                            return { data: found || null, error: null };
                          },
                          order: () => ({ data: baseData, error: null }),
                          gte: () => ({ lte: () => ({ data: baseData, error: null }) })
                        };
                      },
                      order: (col, opts) => ({ data: baseData, error: null }),
                      gte: () => ({ lte: () => ({ data: baseData, error: null }) }),
                      in: (col, vals) => ({
                        data: baseData.filter(d => vals.includes(d[col])),
                        error: null
                      })
                    };
                  },
                  insert: (data) => ({
                    select: () => ({
                      single: async () => ({ data: { id: Date.now(), ...data }, error: null }),
                      then: (cb) => cb({ data: Array.isArray(data) ? data.map((d, i) => ({ id: Date.now() + i, ...d })) : [{ id: Date.now(), ...data }], error: null })
                    })
                  }),
                  update: (data) => ({
                    eq: (col, val) => ({
                      select: () => ({
                        single: async () => ({ data: { id: val, ...data }, error: null })
                      }),
                      then: (cb) => cb({ data: { id: val, ...data }, error: null })
                    }),
                    in: (col, vals) => ({
                      select: () => ({
                        then: (cb) => cb({ data: vals.map(v => ({ id: v, ...data })), error: null }),
                        data: vals.map(v => ({ id: v, ...data })),
                        error: null
                      }),
                      then: (cb) => cb({ data: vals.map(v => ({ id: v, ...data })), error: null })
                    })
                  }),
                  delete: () => ({
                    eq: async () => ({ error: null })
                  }),
                  upsert: (data, options) => ({
                    select: () => ({
                      single: async () => ({ data: Array.isArray(data) ? data[0] : data, error: null }),
                      then: (cb) => cb({ data: Array.isArray(data) ? data : [data], error: null })
                    })
                  })
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

  await page.goto(url);

  // Wait for the page to be fully loaded
  await page.waitForLoadState('networkidle');
}

test.describe('Admin Approval Workflow Tests', () => {
  test.describe('Pending Entries Display', () => {
    test('pending entries are displayed in the approval tab', async ({ page }) => {
      await setupAuthMockWithPendingEntries(page, '/admin.html');

      // Check that the approval tab is active by default
      await expect(page.locator('#tab-approval')).toHaveClass(/active/);

      // Wait for entries to be rendered
      await expect(page.locator('#pendingBody tr')).toHaveCount(2, { timeout: 10000 });

      // Check that pending entries are rendered
      const rows = page.locator('#pendingBody tr');

      // Verify first entry data
      await expect(rows.first()).toContainText('2010');
      await expect(rows.first()).toContainText('テスト点検');

      // Verify second entry data
      await expect(rows.last()).toContainText('2020');
      await expect(rows.last()).toContainText('定期清掃');
    });

    test('pending count shows correct number', async ({ page }) => {
      await setupAuthMockWithPendingEntries(page, '/admin.html');

      await expect(page.locator('#pendingCount')).toHaveText('2', { timeout: 10000 });
    });

    test('pending count shows zero when no entries', async ({ page }) => {
      await setupAuthMockWithPendingEntries(page, '/admin.html', {
        pendingEntries: []
      });

      await expect(page.locator('#pendingCount')).toHaveText('0', { timeout: 10000 });
    });
  });

  test.describe('Approve and Reject Buttons', () => {
    test('approve button is visible for each entry', async ({ page }) => {
      await setupAuthMockWithPendingEntries(page, '/admin.html');

      // Wait for entries to be rendered
      await expect(page.locator('#pendingBody tr')).toHaveCount(2, { timeout: 10000 });

      // Check approve buttons exist for each row
      const approveButtons = page.locator('#pendingBody [data-action="approve"]');
      await expect(approveButtons).toHaveCount(2);

      // Verify buttons are visible
      await expect(approveButtons.first()).toBeVisible();
      await expect(approveButtons.last()).toBeVisible();
    });

    test('reject button is visible for each entry', async ({ page }) => {
      await setupAuthMockWithPendingEntries(page, '/admin.html');

      // Wait for entries to be rendered
      await expect(page.locator('#pendingBody tr')).toHaveCount(2, { timeout: 10000 });

      // Check reject buttons exist for each row
      const rejectButtons = page.locator('#pendingBody [data-action="reject"]');
      await expect(rejectButtons).toHaveCount(2);

      // Verify buttons are visible
      await expect(rejectButtons.first()).toBeVisible();
      await expect(rejectButtons.last()).toBeVisible();
    });

    test('approve button has correct styling', async ({ page }) => {
      await setupAuthMockWithPendingEntries(page, '/admin.html');

      // Wait for entries to be rendered
      await expect(page.locator('#pendingBody tr')).toHaveCount(2, { timeout: 10000 });

      const approveButton = page.locator('#pendingBody [data-action="approve"]').first();
      await expect(approveButton).toHaveClass(/btn-success/);
    });
  });

  test.describe('Select All Checkbox', () => {
    test('select all checkbox toggles all checkboxes', async ({ page }) => {
      await setupAuthMockWithPendingEntries(page, '/admin.html');

      // Wait for entries to be rendered
      await expect(page.locator('#pendingBody tr')).toHaveCount(2, { timeout: 10000 });

      const selectAll = page.locator('#selectAllPending');
      const rowCheckboxes = page.locator('#pendingBody input[type="checkbox"]');

      // Initially unchecked
      await expect(selectAll).not.toBeChecked();
      await expect(rowCheckboxes.first()).not.toBeChecked();
      await expect(rowCheckboxes.last()).not.toBeChecked();

      // Click select all
      await selectAll.click();

      // All should be checked
      await expect(selectAll).toBeChecked();
      await expect(rowCheckboxes.first()).toBeChecked();
      await expect(rowCheckboxes.last()).toBeChecked();

      // Click again to uncheck all
      await selectAll.click();

      // All should be unchecked
      await expect(selectAll).not.toBeChecked();
      await expect(rowCheckboxes.first()).not.toBeChecked();
      await expect(rowCheckboxes.last()).not.toBeChecked();
    });

    test('select all checkbox is visible', async ({ page }) => {
      await setupAuthMockWithPendingEntries(page, '/admin.html');

      await expect(page.locator('#selectAllPending')).toBeVisible();
    });
  });

  test.describe('Bulk Approve Button', () => {
    test('bulk approve button is disabled when no entries selected', async ({ page }) => {
      await setupAuthMockWithPendingEntries(page, '/admin.html');

      // Wait for entries to be rendered
      await expect(page.locator('#pendingBody tr')).toHaveCount(2, { timeout: 10000 });

      const bulkApproveBtn = page.locator('#approveAllBtn');
      await expect(bulkApproveBtn).toBeVisible();
      await expect(bulkApproveBtn).toBeDisabled();
    });

    test('bulk approve button is enabled when entries are selected', async ({ page }) => {
      await setupAuthMockWithPendingEntries(page, '/admin.html');

      // Wait for entries to be rendered
      await expect(page.locator('#pendingBody tr')).toHaveCount(2, { timeout: 10000 });

      const bulkApproveBtn = page.locator('#approveAllBtn');

      // Initially disabled
      await expect(bulkApproveBtn).toBeDisabled();

      // Select first checkbox
      await page.locator('#pendingBody input[type="checkbox"]').first().click();

      // Should now be enabled
      await expect(bulkApproveBtn).toBeEnabled();
    });

    test('bulk approve button has correct text', async ({ page }) => {
      await setupAuthMockWithPendingEntries(page, '/admin.html');

      await expect(page.locator('#approveAllBtn')).toContainText('一括承認');
    });

    test('bulk approve button becomes disabled when all entries deselected', async ({ page }) => {
      await setupAuthMockWithPendingEntries(page, '/admin.html');

      // Wait for entries to be rendered
      await expect(page.locator('#pendingBody tr')).toHaveCount(2, { timeout: 10000 });

      const bulkApproveBtn = page.locator('#approveAllBtn');
      const firstCheckbox = page.locator('#pendingBody input[type="checkbox"]').first();

      // Select and then deselect
      await firstCheckbox.click();
      await expect(bulkApproveBtn).toBeEnabled();

      await firstCheckbox.click();
      await expect(bulkApproveBtn).toBeDisabled();
    });

    test('selecting all via select all checkbox enables bulk approve', async ({ page }) => {
      await setupAuthMockWithPendingEntries(page, '/admin.html');

      // Wait for entries to be rendered
      await expect(page.locator('#pendingBody tr')).toHaveCount(2, { timeout: 10000 });

      const bulkApproveBtn = page.locator('#approveAllBtn');
      const selectAll = page.locator('#selectAllPending');

      await expect(bulkApproveBtn).toBeDisabled();

      await selectAll.click();

      await expect(bulkApproveBtn).toBeEnabled();
    });
  });

  test.describe('Empty State', () => {
    test('empty message is shown when no pending entries', async ({ page }) => {
      await setupAuthMockWithPendingEntries(page, '/admin.html', {
        pendingEntries: []
      });

      await expect(page.locator('#pendingEmpty')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('#pendingEmpty')).toContainText('承認待ちのデータはありません');
    });

    test('empty message is hidden when pending entries exist', async ({ page }) => {
      await setupAuthMockWithPendingEntries(page, '/admin.html');

      // Wait for entries to be rendered
      await expect(page.locator('#pendingBody tr')).toHaveCount(2, { timeout: 10000 });

      const emptyMessage = page.locator('#pendingEmpty');
      await expect(emptyMessage).not.toBeVisible();
    });

    test('table body is empty when no pending entries', async ({ page }) => {
      await setupAuthMockWithPendingEntries(page, '/admin.html', {
        pendingEntries: []
      });

      await expect(page.locator('#pendingEmpty')).toBeVisible({ timeout: 10000 });

      const rows = page.locator('#pendingBody tr');
      await expect(rows).toHaveCount(0);
    });
  });

  test.describe('Entry Details Display', () => {
    test('property code is displayed correctly', async ({ page }) => {
      await setupAuthMockWithPendingEntries(page, '/admin.html');

      // Wait for entries to be rendered
      await expect(page.locator('#pendingBody tr')).toHaveCount(2, { timeout: 10000 });

      const firstRow = page.locator('#pendingBody tr').first();
      await expect(firstRow).toContainText('2010');
    });

    test('inspection type is displayed correctly', async ({ page }) => {
      await setupAuthMockWithPendingEntries(page, '/admin.html');

      // Wait for entries to be rendered
      await expect(page.locator('#pendingBody tr')).toHaveCount(2, { timeout: 10000 });

      const firstRow = page.locator('#pendingBody tr').first();
      await expect(firstRow).toContainText('テスト点検');
    });

    test('each row has a checkbox with data-id attribute', async ({ page }) => {
      await setupAuthMockWithPendingEntries(page, '/admin.html');

      // Wait for entries to be rendered
      await expect(page.locator('#pendingBody tr')).toHaveCount(2, { timeout: 10000 });

      const checkbox1 = page.locator('#pendingBody input[type="checkbox"][data-id="1"]');
      const checkbox2 = page.locator('#pendingBody input[type="checkbox"][data-id="2"]');

      await expect(checkbox1).toBeVisible();
      await expect(checkbox2).toBeVisible();
    });
  });

  test.describe('Table Structure', () => {
    test('table has correct headers', async ({ page }) => {
      await setupAuthMockWithPendingEntries(page, '/admin.html');

      const thead = page.locator('#tab-approval thead');
      await expect(thead).toContainText('申請者');
      await expect(thead).toContainText('物件コード');
      await expect(thead).toContainText('点検種別');
      await expect(thead).toContainText('開始日');
      await expect(thead).toContainText('申請日時');
      await expect(thead).toContainText('操作');
    });

    test('table header has checkbox for select all', async ({ page }) => {
      await setupAuthMockWithPendingEntries(page, '/admin.html');

      const headerCheckbox = page.locator('#tab-approval thead input[type="checkbox"]');
      await expect(headerCheckbox).toBeVisible();
    });
  });
});
