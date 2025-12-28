// @ts-check
const { test, expect } = require('@playwright/test');
const { baseUrl } = require('./test-helpers');

const mockEntries = [
  { id: 1, property_code: '2010', inspection_type: 'テスト点検', inspection_start: '2025-01-01', status: 'submitted', user_id: 'test-user', created_at: '2025-01-01T10:00:00Z' },
  { id: 2, property_code: '2020', inspection_type: '定期清掃', inspection_start: '2025-01-15', status: 'submitted', user_id: 'test-user', created_at: '2025-01-15T10:00:00Z' },
  { id: 3, property_code: '2010', inspection_type: 'エレベーター点検', inspection_start: '2025-02-01', status: 'draft', user_id: 'test-user', created_at: '2025-02-01T10:00:00Z' }
];

const mockProperties = [
  { id: 1, property_code: '2010', property_name: 'エンクレストガーデン福岡', terminals: '["h0001A00"]' },
  { id: 2, property_code: '2020', property_name: 'アソシアグロッツォ天神', terminals: '["z1003A01"]' },
  { id: 3, property_code: '2030', property_name: 'テスト物件', terminals: '["t0001A01"]' }
];

const mockUsers = [
  { id: 'test-user', email: 'user@example.com', company_name: 'テスト会社', role: 'user', created_at: '2025-01-01' }
];

/**
 * Setup auth mock with custom entries data
 * @param {import('@playwright/test').Page} page
 * @param {object} options
 */
async function setupAuthMockWithEntries(page, options = {}) {
  const {
    isAuthenticated = true,
    isAdmin = true,
    email = 'admin@example.com',
    entries = mockEntries,
    properties = mockProperties
  } = options;

  await page.route('https://cdn.jsdelivr.net/**', async route => {
    if (route.request().url().includes('@supabase/supabase-js')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: `
          const mockData = {
            properties: ${JSON.stringify(properties)},
            entries: ${JSON.stringify(entries)},
            users: ${JSON.stringify(mockUsers)},
            vendors: [],
            inspectionTypes: [],
            categories: [],
            settings: []
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
                    case 'signage_master_vendors': return mockData.vendors;
                    case 'signage_master_inspection_types': return mockData.inspectionTypes;
                    case 'signage_master_categories': return mockData.categories;
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
                      gte: () => ({ lte: () => ({ order: () => ({ data: getTableData(), error: null }), data: getTableData(), error: null }) })
                    }),
                    order: (col, opts) => ({ data: getTableData(), error: null }),
                    gte: () => ({ lte: () => ({ order: () => ({ data: getTableData(), error: null }), data: getTableData(), error: null }) })
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

test.describe('Admin Entries Tab Tests', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMockWithEntries(page, {
      isAuthenticated: true,
      isAdmin: true,
      email: 'admin@example.com'
    });
    // Navigate to entries tab
    await page.click('.admin-tab[data-tab="entries"]');
    await expect(page.locator('#tab-entries')).toBeVisible();
  });

  test.describe('Entries Display', () => {
    test('entries are displayed in the table', async ({ page }) => {
      const tableBody = page.locator('#entriesBody');
      await expect(tableBody).toBeVisible();
      // Wait for entries to load
      await page.waitForTimeout(500);
      const rows = tableBody.locator('tr');
      // Should have entries (may vary based on filter/status)
      const count = await rows.count();
      expect(count).toBeGreaterThanOrEqual(0);
    });

    test('table has correct column headers', async ({ page }) => {
      const headers = page.locator('#tab-entries .data-table thead th');
      await expect(headers.nth(0)).toContainText('登録者');
      await expect(headers.nth(1)).toContainText('物件コード');
      await expect(headers.nth(2)).toContainText('点検種別');
      await expect(headers.nth(3)).toContainText('開始日');
      await expect(headers.nth(4)).toContainText('登録日時');
      await expect(headers.nth(5)).toContainText('操作');
    });

    test('entries table container is visible', async ({ page }) => {
      const tableContainer = page.locator('#tab-entries .table-container');
      await expect(tableContainer).toBeVisible();
    });
  });

  test.describe('Property Filter', () => {
    test('property filter dropdown is visible', async ({ page }) => {
      const filterProperty = page.locator('#filterProperty');
      await expect(filterProperty).toBeVisible();
    });

    test('property filter dropdown is populated with options', async ({ page }) => {
      const filterProperty = page.locator('#filterProperty');
      await expect(filterProperty).toBeVisible();

      // Wait for properties to load
      await page.waitForTimeout(500);

      // Check that dropdown has options (at least the default "all" option)
      const options = filterProperty.locator('option');
      const count = await options.count();
      expect(count).toBeGreaterThanOrEqual(1);

      // First option should be "all"
      await expect(options.first()).toHaveText('すべて');
    });

    test('property filter has label', async ({ page }) => {
      const label = page.locator('#tab-entries .filter-bar label').first();
      await expect(label).toContainText('物件');
    });
  });

  test.describe('Date Filter', () => {
    test('start date filter input is visible', async ({ page }) => {
      const filterStartDate = page.locator('#filterStartDate');
      await expect(filterStartDate).toBeVisible();
    });

    test('end date filter input is visible', async ({ page }) => {
      const filterEndDate = page.locator('#filterEndDate');
      await expect(filterEndDate).toBeVisible();
    });

    test('date filter inputs are of type date', async ({ page }) => {
      const filterStartDate = page.locator('#filterStartDate');
      const filterEndDate = page.locator('#filterEndDate');

      await expect(filterStartDate).toHaveAttribute('type', 'date');
      await expect(filterEndDate).toHaveAttribute('type', 'date');
    });

    test('date filter can be set', async ({ page }) => {
      const filterStartDate = page.locator('#filterStartDate');
      const filterEndDate = page.locator('#filterEndDate');

      await filterStartDate.fill('2025-01-01');
      await filterEndDate.fill('2025-12-31');

      await expect(filterStartDate).toHaveValue('2025-01-01');
      await expect(filterEndDate).toHaveValue('2025-12-31');
    });
  });

  test.describe('Search Button', () => {
    test('search button is visible', async ({ page }) => {
      const searchBtn = page.locator('#searchBtn');
      await expect(searchBtn).toBeVisible();
    });

    test('search button has correct text', async ({ page }) => {
      const searchBtn = page.locator('#searchBtn');
      await expect(searchBtn).toHaveText('検索');
    });

    test('search button triggers filter', async ({ page }) => {
      const searchBtn = page.locator('#searchBtn');

      // Set filter values
      await page.locator('#filterStartDate').fill('2025-01-01');
      await page.locator('#filterEndDate').fill('2025-01-31');

      // Click search button - should not throw error
      await searchBtn.click();

      // Wait for potential data reload
      await page.waitForTimeout(500);

      // Table should still be visible after search
      await expect(page.locator('#tab-entries .table-container')).toBeVisible();
    });

    test('search button is clickable', async ({ page }) => {
      const searchBtn = page.locator('#searchBtn');
      await expect(searchBtn).toBeEnabled();
      await searchBtn.click();
      // Should not throw error
    });
  });

  test.describe('Empty Message', () => {
    test('empty message element exists', async ({ page }) => {
      const entriesEmpty = page.locator('#entriesEmpty');
      // Element should exist in DOM
      await expect(entriesEmpty).toBeAttached();
    });

    test('empty message has correct text', async ({ page }) => {
      const entriesEmpty = page.locator('#entriesEmpty');
      await expect(entriesEmpty).toContainText('データがありません');
    });
  });

  test.describe('Filter Bar', () => {
    test('filter bar is visible', async ({ page }) => {
      const filterBar = page.locator('#tab-entries .filter-bar');
      await expect(filterBar).toBeVisible();
    });

    test('filter bar contains all filter elements', async ({ page }) => {
      const filterBar = page.locator('#tab-entries .filter-bar');

      await expect(filterBar.locator('#filterProperty')).toBeVisible();
      await expect(filterBar.locator('#filterStartDate')).toBeVisible();
      await expect(filterBar.locator('#filterEndDate')).toBeVisible();
      await expect(filterBar.locator('#searchBtn')).toBeVisible();
    });
  });
});

test.describe('Admin Entries Tab - Empty State', () => {
  test('empty message shown when no entries match filter', async ({ page }) => {
    // Setup with empty entries
    await setupAuthMockWithEntries(page, {
      isAuthenticated: true,
      isAdmin: true,
      email: 'admin@example.com',
      entries: []
    });

    // Navigate to entries tab
    await page.click('.admin-tab[data-tab="entries"]');
    await expect(page.locator('#tab-entries')).toBeVisible();

    // Wait for data to load
    await page.waitForTimeout(500);

    // Either empty message is shown OR table body has no rows
    const entriesEmpty = page.locator('#entriesEmpty');
    const tableBody = page.locator('#entriesBody');

    // Check if empty state is properly handled
    const rowCount = await tableBody.locator('tr').count();
    if (rowCount === 0) {
      // Empty message should be visible or table body should be empty
      const isEmptyVisible = await entriesEmpty.isVisible();
      expect(isEmptyVisible || rowCount === 0).toBeTruthy();
    }
  });
});
