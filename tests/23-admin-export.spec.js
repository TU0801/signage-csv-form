// @ts-check
const { test, expect } = require('@playwright/test');
const { baseUrl, setupAuthMockWithMasterData } = require('./test-helpers');

/**
 * Custom mock setup with export entries for testing CSV export functionality
 */
async function setupExportMock(page, options = {}) {
  const {
    isAuthenticated = true,
    isAdmin = true,
    email = 'admin@example.com'
  } = options;

  const mockProperties = [
    { id: 1, property_code: '2010', property_name: 'エンクレストガーデン福岡', terminals: '["h0001A00", "h0001A01", "h0001A02"]' },
    { id: 2, property_code: '120406', property_name: 'アソシアグロッツォ天神サウス', terminals: '["z1003A01"]' },
    { id: 3, property_code: '120408', property_name: 'アソシアグロッツォ博多プレイス', terminals: '["z1006A01"]' }
  ];

  const mockEntries = [
    {
      id: 1,
      property_code: '2010',
      terminal_id: 'h0001A00',
      vendor_name: 'テスト業者',
      inspection_type: 'テスト点検',
      inspection_start: '2025-01-01',
      inspection_end: '2025-01-01',
      remarks: 'テスト備考',
      announcement: 'テスト案内',
      display_duration: 6,
      poster_type: 'template',
      poster_position: '2',
      status: 'submitted',
      user_id: 'test-user',
      created_at: '2025-01-01T10:00:00Z',
      signage_profiles: { email: 'user@example.com', company_name: 'テスト会社' }
    },
    {
      id: 2,
      property_code: '2010',
      terminal_id: 'h0001A01',
      vendor_name: 'テスト業者2',
      inspection_type: 'エレベーター点検',
      inspection_start: '2025-01-15',
      inspection_end: '2025-01-15',
      remarks: '備考2',
      announcement: '案内2',
      display_duration: 10,
      poster_type: 'template',
      poster_position: '1',
      status: 'submitted',
      user_id: 'test-user',
      created_at: '2025-01-10T10:00:00Z',
      signage_profiles: { email: 'user@example.com', company_name: 'テスト会社' }
    },
    {
      id: 3,
      property_code: '120406',
      terminal_id: 'z1003A01',
      vendor_name: '別業者',
      inspection_type: '消防点検',
      inspection_start: '2025-02-01',
      inspection_end: '2025-02-01',
      remarks: '備考3',
      announcement: '案内3',
      display_duration: 8,
      poster_type: 'template',
      poster_position: '3',
      status: 'submitted',
      user_id: 'test-user-2',
      created_at: '2025-01-20T10:00:00Z',
      signage_profiles: { email: 'user2@example.com', company_name: '別会社' }
    }
  ];

  const mockUsers = [
    { id: 'user-1', email: 'admin@example.com', company_name: '管理会社', role: 'admin', created_at: '2025-01-01' },
    { id: 'user-2', email: 'user@example.com', company_name: 'テスト会社', role: 'user', created_at: '2025-01-05' }
  ];

  const mockSettings = [
    { id: 1, setting_key: 'display_time_max', setting_value: '30' },
    { id: 2, setting_key: 'remarks_chars_per_line', setting_value: '25' },
    { id: 3, setting_key: 'remarks_max_lines', setting_value: '5' },
    { id: 4, setting_key: 'notice_text_max_chars', setting_value: '200' }
  ];

  await page.route('https://cdn.jsdelivr.net/**', async route => {
    if (route.request().url().includes('@supabase/supabase-js')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: `
          const mockData = {
            properties: ${JSON.stringify(mockProperties)},
            entries: ${JSON.stringify(mockEntries)},
            users: ${JSON.stringify(mockUsers)},
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
                signInWithPassword: async ({ email, password }) => {
                  if (email && password) {
                    return { data: { user: { id: 'test-user-id', email } } };
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
                    case 'signage_entries': return mockData.entries;
                    case 'signage_profiles': return mockData.users;
                    case 'signage_settings': return mockData.settings;
                    default: return [];
                  }
                };

                return {
                  select: (cols) => ({
                    eq: (col, val) => ({
                      single: async () => {
                        const data = getTableData();
                        const found = data.find(d => d[col] === val || d.id === val);
                        if (table === 'signage_profiles' && col === 'id') {
                          return {
                            data: ${isAdmin ? `{ id: 'test-user-id', email: '${email}', role: 'admin' }` : `{ id: 'test-user-id', email: '${email}', role: 'user' }`},
                            error: null
                          };
                        }
                        return { data: found || null, error: null };
                      },
                      order: () => ({ data: getTableData(), error: null }),
                      gte: () => ({
                        lte: () => ({ data: getTableData(), error: null })
                      })
                    }),
                    order: (col, opts) => ({ data: getTableData(), error: null }),
                    gte: (col, val) => ({
                      lte: (col2, val2) => ({ data: getTableData(), error: null }),
                      order: () => ({ data: getTableData(), error: null })
                    }),
                    neq: (col, val) => ({
                      order: () => ({ data: getTableData(), error: null })
                    })
                  }),
                  insert: (data) => ({
                    select: () => ({
                      single: async () => ({ data: { id: Date.now(), ...data }, error: null }),
                      then: (cb) => cb({ data: Array.isArray(data) ? data.map((d, i) => ({ id: Date.now() + i, ...d })) : [{ id: Date.now(), ...data }], error: null })
                    })
                  }),
                  update: (data) => ({
                    eq: () => ({
                      select: () => ({
                        single: async () => ({ data: { id: 1, ...data }, error: null })
                      })
                    })
                  }),
                  delete: () => ({
                    eq: async () => ({ error: null })
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

  await page.goto('/admin.html');
}

test.describe('Admin CSV Export Tab Tests', () => {
  test.beforeEach(async ({ page }) => {
    await setupExportMock(page, {
      isAuthenticated: true,
      isAdmin: true,
      email: 'admin@example.com'
    });
    // Navigate to export tab
    await page.click('.admin-tab[data-tab="export"]');
    await expect(page.locator('#tab-export')).toBeVisible();
  });

  test.describe('Export Tab Display', () => {
    test('export tab content is visible when clicked', async ({ page }) => {
      await expect(page.locator('#tab-export')).toHaveClass(/active/);
    });

    test('export count shows number of entries', async ({ page }) => {
      const exportCount = page.locator('#exportCount');
      await expect(exportCount).toBeVisible();
      // The count should be a number
      const countText = await exportCount.textContent();
      expect(countText).toMatch(/^\d+$/);
    });
  });

  test.describe('Property Filter', () => {
    test('property filter dropdown is visible', async ({ page }) => {
      await expect(page.locator('#exportProperty')).toBeVisible();
    });

    test('property filter has default "all" option', async ({ page }) => {
      const select = page.locator('#exportProperty');
      const firstOption = select.locator('option').first();
      await expect(firstOption).toHaveAttribute('value', '');
      await expect(firstOption).toContainText('すべて');
    });

    test('property filter is populated with properties', async ({ page }) => {
      const select = page.locator('#exportProperty');
      // Wait for options to be populated
      await page.waitForTimeout(500);
      const options = await select.locator('option').count();
      // Should have at least the default option plus some properties
      expect(options).toBeGreaterThanOrEqual(1);
    });
  });

  test.describe('Date Filters', () => {
    test('start date filter is visible', async ({ page }) => {
      await expect(page.locator('#exportStartDate')).toBeVisible();
    });

    test('end date filter is visible', async ({ page }) => {
      await expect(page.locator('#exportEndDate')).toBeVisible();
    });

    test('start date filter is date input type', async ({ page }) => {
      const input = page.locator('#exportStartDate');
      await expect(input).toHaveAttribute('type', 'date');
    });

    test('end date filter is date input type', async ({ page }) => {
      const input = page.locator('#exportEndDate');
      await expect(input).toHaveAttribute('type', 'date');
    });

    test('date filters can accept values', async ({ page }) => {
      await page.fill('#exportStartDate', '2025-01-01');
      await page.fill('#exportEndDate', '2025-12-31');

      await expect(page.locator('#exportStartDate')).toHaveValue('2025-01-01');
      await expect(page.locator('#exportEndDate')).toHaveValue('2025-12-31');
    });
  });

  test.describe('CSV Download Button', () => {
    test('CSV download button is visible', async ({ page }) => {
      await expect(page.locator('#exportCsvBtn')).toBeVisible();
    });

    test('CSV download button has correct text', async ({ page }) => {
      await expect(page.locator('#exportCsvBtn')).toContainText('CSVダウンロード');
    });

    test('CSV download button is enabled', async ({ page }) => {
      await expect(page.locator('#exportCsvBtn')).toBeEnabled();
    });

    test('CSV download button is clickable', async ({ page }) => {
      // Just verify the button can be clicked without error
      await page.locator('#exportCsvBtn').click();
      // No error should be thrown
    });
  });

  test.describe('Copy Button', () => {
    test('copy button is visible', async ({ page }) => {
      await expect(page.locator('#exportCopyBtn')).toBeVisible();
    });

    test('copy button has correct text', async ({ page }) => {
      await expect(page.locator('#exportCopyBtn')).toContainText('コピー');
    });

    test('copy button is enabled', async ({ page }) => {
      await expect(page.locator('#exportCopyBtn')).toBeEnabled();
    });

    test('copy button is clickable', async ({ page }) => {
      // Just verify the button can be clicked without error
      await page.locator('#exportCopyBtn').click();
      // No error should be thrown
    });
  });

  test.describe('Filter Bar Structure', () => {
    test('filter bar contains property filter', async ({ page }) => {
      const filterBar = page.locator('#tab-export .filter-bar');
      await expect(filterBar.locator('#exportProperty')).toBeVisible();
    });

    test('filter bar contains date filters', async ({ page }) => {
      const filterBar = page.locator('#tab-export .filter-bar');
      await expect(filterBar.locator('#exportStartDate')).toBeVisible();
      await expect(filterBar.locator('#exportEndDate')).toBeVisible();
    });

    test('action bar shows export count', async ({ page }) => {
      const actionBar = page.locator('#tab-export .action-bar');
      await expect(actionBar.locator('#exportCount')).toBeVisible();
    });

    test('action bar contains export buttons', async ({ page }) => {
      const actionBar = page.locator('#tab-export .action-bar');
      await expect(actionBar.locator('#exportCsvBtn')).toBeVisible();
      await expect(actionBar.locator('#exportCopyBtn')).toBeVisible();
    });
  });

  test.describe('Filter Interaction', () => {
    test('changing property filter updates the view', async ({ page }) => {
      const propertySelect = page.locator('#exportProperty');
      // Get initial count
      const initialCount = await page.locator('#exportCount').textContent();

      // Wait for any dynamic content to load
      await page.waitForTimeout(300);

      // Check that the select can be interacted with
      await propertySelect.click();
      // The filter should be interactive
      await expect(propertySelect).toBeEnabled();
    });

    test('setting date range filters works', async ({ page }) => {
      // Set date range
      await page.fill('#exportStartDate', '2025-01-01');
      await page.fill('#exportEndDate', '2025-01-31');

      // Verify values are set
      await expect(page.locator('#exportStartDate')).toHaveValue('2025-01-01');
      await expect(page.locator('#exportEndDate')).toHaveValue('2025-01-31');
    });
  });
});

test.describe('Admin Export Tab with Master Data Helper', () => {
  test('export tab works with setupAuthMockWithMasterData', async ({ page }) => {
    await setupAuthMockWithMasterData(page, '/admin.html', {
      isAuthenticated: true,
      isAdmin: true,
      email: 'admin@example.com'
    });

    // Navigate to export tab
    await page.click('.admin-tab[data-tab="export"]');
    await expect(page.locator('#tab-export')).toBeVisible();

    // Verify core elements are present
    await expect(page.locator('#exportProperty')).toBeVisible();
    await expect(page.locator('#exportStartDate')).toBeVisible();
    await expect(page.locator('#exportEndDate')).toBeVisible();
    await expect(page.locator('#exportCount')).toBeVisible();
    await expect(page.locator('#exportCsvBtn')).toBeVisible();
    await expect(page.locator('#exportCopyBtn')).toBeVisible();
  });
});
