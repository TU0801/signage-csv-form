// @ts-check
// テスト用ヘルパー関数

/**
 * 認証をモックしてページをロードする
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 * @param {object} options
 * @param {boolean} [options.isAuthenticated=true]
 * @param {boolean} [options.isAdmin=false]
 * @param {string} [options.email='test@example.com']
 */
async function setupAuthMock(page, url, options = {}) {
  const {
    isAuthenticated = true,
    isAdmin = false,
    email = 'test@example.com'
  } = options;

  // Supabase CDNからのインポートをインターセプト
  await page.route('https://cdn.jsdelivr.net/**', async route => {
    if (route.request().url().includes('@supabase/supabase-js')) {
      // モックモジュールを返す
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: `
          export function createClient() {
            return {
              auth: {
                getUser: async () => ({
                  data: {
                    user: ${isAuthenticated ? `{ id: 'test-user-id', email: '${email}' }` : 'null'}
                  }
                }),
                signInWithPassword: async () => {
                  if (${isAuthenticated}) {
                    return { data: { user: { id: 'test-user-id', email: '${email}' } } };
                  }
                  throw new Error('Invalid credentials');
                },
                signOut: async () => ({}),
                onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } })
              },
              from: () => ({
                select: () => ({
                  eq: () => ({
                    single: async () => ({
                      data: ${isAdmin ? `{ id: 'test-user-id', email: '${email}', role: 'admin' }` : `{ id: 'test-user-id', email: '${email}', role: 'user' }`},
                      error: null
                    }),
                    order: () => ({
                      data: [],
                      error: null
                    })
                  }),
                  order: () => ({
                    data: [],
                    error: null
                  })
                }),
                insert: () => ({
                  select: () => ({
                    single: async () => ({ data: {}, error: null })
                  })
                }),
                update: () => ({
                  eq: () => ({
                    select: () => ({
                      single: async () => ({ data: {}, error: null })
                    })
                  })
                }),
                delete: () => ({
                  eq: async () => ({ error: null })
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

  await page.goto(url);
}

/**
 * マスターデータ付きで認証モックをセットアップ
 */
async function setupAuthMockWithMasterData(page, url, options = {}) {
  const {
    isAuthenticated = true,
    isAdmin = false,
    email = 'test@example.com'
  } = options;

  const mockProperties = [
    { id: 1, property_code: '2010', property_name: 'テスト物件A', terminal_id: 'h0001A00' },
    { id: 2, property_code: '120406', property_name: 'テスト物件B', terminal_id: 'h0002A00' }
  ];

  const mockVendors = [
    { id: 1, vendor_name: '山本クリーンシステム', phone: '092-934-0407' },
    { id: 2, vendor_name: 'テスト業者', phone: '03-1234-5678' }
  ];

  const mockInspectionTypes = [
    { id: 1, template_no: 0, inspection_name: '定期清掃' },
    { id: 2, template_no: 1, inspection_name: 'エレベーター点検' }
  ];

  const mockEntries = [
    {
      id: 1,
      property_code: '2010',
      inspection_type: '定期清掃',
      inspection_start: '2025-01-15',
      created_at: '2025-01-10T10:00:00Z',
      signage_profiles: { email: 'user@example.com', company_name: 'テスト会社' }
    }
  ];

  const mockUsers = [
    { id: 'user-1', email: 'admin@example.com', company_name: '管理会社', role: 'admin', created_at: '2025-01-01' },
    { id: 'user-2', email: 'user@example.com', company_name: 'テスト会社', role: 'user', created_at: '2025-01-05' }
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
            entries: ${JSON.stringify(mockEntries)},
            users: ${JSON.stringify(mockUsers)}
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
                    case 'signage_entries': return mockData.entries;
                    case 'signage_profiles': return mockData.users;
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

module.exports = {
  setupAuthMock,
  setupAuthMockWithMasterData
};
