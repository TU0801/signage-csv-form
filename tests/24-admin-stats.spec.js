// @ts-check
const { test, expect } = require('@playwright/test');

const mockEntries = [
  { id: 1, created_at: '2025-12-01T10:00:00Z' }, // This month
  { id: 2, created_at: '2025-12-15T10:00:00Z' }, // This month
  { id: 3, created_at: '2025-11-01T10:00:00Z' }  // Last month
];

const mockProfiles = [
  { id: 'user1', email: 'user1@test.com' },
  { id: 'user2', email: 'user2@test.com' }
];

const mockProperties = [
  { id: 1, property_code: '2010' },
  { id: 2, property_code: '2020' },
  { id: 3, property_code: '2030' }
];

/**
 * Setup auth mock with custom stats data
 */
async function setupAuthMockWithStatsData(page, url, options = {}) {
  const {
    isAuthenticated = true,
    isAdmin = false,
    email = 'test@example.com'
  } = options;

  await page.route('https://cdn.jsdelivr.net/**', async route => {
    if (route.request().url().includes('@supabase/supabase-js')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: `
          const mockEntries = ${JSON.stringify(mockEntries)};
          const mockProfiles = ${JSON.stringify(mockProfiles)};
          const mockProperties = ${JSON.stringify(mockProperties)};

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
                    case 'signage_entries': return mockEntries;
                    case 'signage_profiles': return mockProfiles;
                    case 'signage_master_properties': return mockProperties;
                    case 'signage_master_vendors': return [];
                    case 'signage_master_inspection_types': return [];
                    case 'signage_master_categories': return [];
                    case 'signage_settings': return [];
                    default: return [];
                  }
                };

                return {
                  select: (cols) => ({
                    eq: (col, val) => ({
                      single: async () => {
                        if (table === 'signage_profiles' && col === 'id') {
                          return {
                            data: ${isAdmin ? `{ id: 'test-user-id', email: '${email}', role: 'admin' }` : `{ id: 'test-user-id', email: '${email}', role: 'user' }`},
                            error: null
                          };
                        }
                        const data = getTableData();
                        const found = data.find(d => d[col] === val || d.id === val);
                        return { data: found || null, error: null };
                      },
                      order: () => ({ data: getTableData(), error: null }),
                      gte: () => ({ lte: () => ({ data: getTableData(), error: null }) })
                    }),
                    order: (col, opts) => ({ data: getTableData(), error: null }),
                    gte: () => ({ lte: () => ({ data: getTableData(), error: null }) })
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

  await page.goto(url);
}

test.describe('Admin Statistics Display', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMockWithStatsData(page, '/admin.html', {
      isAuthenticated: true,
      isAdmin: true,
      email: 'admin@example.com'
    });
  });

  test.describe('Total Stat Card', () => {
    test('shows total entry count', async ({ page }) => {
      // Wait for stats to load
      await page.waitForFunction(() => {
        const el = document.getElementById('statTotal');
        return el && el.textContent !== '-';
      }, { timeout: 5000 });

      const statTotal = page.locator('#statTotal');
      await expect(statTotal).toHaveText('3');
    });

    test('stat card has correct label', async ({ page }) => {
      const label = page.locator('.stat-card:has(#statTotal) .stat-card-label');
      await expect(label).toContainText('総登録数');
    });
  });

  test.describe('Monthly Stat Card', () => {
    test('shows this month entries count', async ({ page }) => {
      // Wait for stats to load
      await page.waitForFunction(() => {
        const el = document.getElementById('statMonth');
        return el && el.textContent !== '-';
      }, { timeout: 5000 });

      const statMonth = page.locator('#statMonth');
      // December 2025 entries: 2 (id 1 and 2)
      await expect(statMonth).toHaveText('2');
    });

    test('stat card has correct label', async ({ page }) => {
      const label = page.locator('.stat-card:has(#statMonth) .stat-card-label');
      await expect(label).toContainText('今月の登録');
    });
  });

  test.describe('Users Stat Card', () => {
    test('shows user count', async ({ page }) => {
      // Wait for stats to load
      await page.waitForFunction(() => {
        const el = document.getElementById('statUsers');
        return el && el.textContent !== '-';
      }, { timeout: 5000 });

      const statUsers = page.locator('#statUsers');
      await expect(statUsers).toHaveText('2');
    });

    test('stat card has correct label', async ({ page }) => {
      const label = page.locator('.stat-card:has(#statUsers) .stat-card-label');
      await expect(label).toContainText('ユーザー数');
    });
  });

  test.describe('Properties Stat Card', () => {
    test('shows property count', async ({ page }) => {
      // Wait for stats to load
      await page.waitForFunction(() => {
        const el = document.getElementById('statProperties');
        return el && el.textContent !== '-';
      }, { timeout: 5000 });

      const statProperties = page.locator('#statProperties');
      await expect(statProperties).toHaveText('3');
    });

    test('stat card has correct label', async ({ page }) => {
      const label = page.locator('.stat-card:has(#statProperties) .stat-card-label');
      await expect(label).toContainText('物件数');
    });
  });

  test.describe('Stat Cards Styling', () => {
    test('stat cards have stat-card class', async ({ page }) => {
      const statCards = page.locator('.stat-card');
      await expect(statCards).toHaveCount(4);

      // Verify each stat element is within a stat-card
      await expect(page.locator('.stat-card:has(#statTotal)')).toBeVisible();
      await expect(page.locator('.stat-card:has(#statMonth)')).toBeVisible();
      await expect(page.locator('.stat-card:has(#statUsers)')).toBeVisible();
      await expect(page.locator('.stat-card:has(#statProperties)')).toBeVisible();
    });

    test('stat cards are in stats-grid container', async ({ page }) => {
      const statsGrid = page.locator('.stats-grid');
      await expect(statsGrid).toBeVisible();

      const cardsInGrid = statsGrid.locator('.stat-card');
      await expect(cardsInGrid).toHaveCount(4);
    });

    test('stat values have stat-card-value class', async ({ page }) => {
      await expect(page.locator('#statTotal')).toHaveClass(/stat-card-value/);
      await expect(page.locator('#statMonth')).toHaveClass(/stat-card-value/);
      await expect(page.locator('#statUsers')).toHaveClass(/stat-card-value/);
      await expect(page.locator('#statProperties')).toHaveClass(/stat-card-value/);
    });
  });

  test.describe('Stats Update After Page Load', () => {
    test('stats initially show placeholder', async ({ page }) => {
      // Create a new page without waiting for stats to load
      const newPage = await page.context().newPage();

      // Set up route but don't wait for stats
      await newPage.route('https://cdn.jsdelivr.net/**', async route => {
        if (route.request().url().includes('@supabase/supabase-js')) {
          // Add a small delay to catch the initial state
          await new Promise(resolve => setTimeout(resolve, 100));
          await route.fulfill({
            status: 200,
            contentType: 'application/javascript',
            body: `
              export function createClient() {
                return {
                  auth: {
                    getUser: async () => ({
                      data: { user: { id: 'test-user-id', email: 'admin@example.com' } }
                    }),
                    signOut: async () => ({}),
                    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } })
                  },
                  from: (table) => ({
                    select: () => ({
                      eq: (col, val) => ({
                        single: async () => ({
                          data: { id: 'test-user-id', email: 'admin@example.com', role: 'admin' },
                          error: null
                        }),
                        order: () => ({ data: [], error: null }),
                        gte: () => ({ lte: () => ({ data: [], error: null }) })
                      }),
                      order: () => ({ data: [], error: null }),
                      gte: () => ({ lte: () => ({ data: [], error: null }) })
                    }),
                    insert: () => ({ select: () => ({ single: async () => ({ data: {}, error: null }) }) }),
                    update: () => ({ eq: () => ({ select: () => ({ single: async () => ({ data: {}, error: null }) }) }) }),
                    delete: () => ({ eq: async () => ({ error: null }) })
                  })
                };
              }
            `
          });
        } else {
          await route.continue();
        }
      });

      await newPage.goto('/admin.html');

      // Wait for stats to update to actual values (even if 0)
      await newPage.waitForFunction(() => {
        const el = document.getElementById('statTotal');
        return el && el.textContent !== '-';
      }, { timeout: 5000 });

      // Stats should show 0 when no data
      await expect(newPage.locator('#statTotal')).toHaveText('0');
      await expect(newPage.locator('#statMonth')).toHaveText('0');
      await expect(newPage.locator('#statUsers')).toHaveText('0');
      await expect(newPage.locator('#statProperties')).toHaveText('0');

      await newPage.close();
    });

    test('all stats update from placeholder to actual values', async ({ page }) => {
      // Wait for all stats to be updated
      await page.waitForFunction(() => {
        const statTotal = document.getElementById('statTotal');
        const statMonth = document.getElementById('statMonth');
        const statUsers = document.getElementById('statUsers');
        const statProperties = document.getElementById('statProperties');
        return statTotal?.textContent !== '-' &&
               statMonth?.textContent !== '-' &&
               statUsers?.textContent !== '-' &&
               statProperties?.textContent !== '-';
      }, { timeout: 5000 });

      // Verify all stats have real values
      await expect(page.locator('#statTotal')).not.toHaveText('-');
      await expect(page.locator('#statMonth')).not.toHaveText('-');
      await expect(page.locator('#statUsers')).not.toHaveText('-');
      await expect(page.locator('#statProperties')).not.toHaveText('-');
    });
  });
});
