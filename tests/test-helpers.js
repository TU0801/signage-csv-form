// @ts-check
// テスト用ヘルパー関数

const baseUrl = 'http://localhost:8080';

/**
 * モックデータ定義
 */
const mockData = {
  // 物件マスター（Supabaseの実際の形式 - terminalsがJSON配列）
  propertiesRaw: [
    {
      id: 1,
      property_code: '2010',
      property_name: 'エンクレストガーデン福岡',
      address: '福岡県福岡市中央区小笹４－５',
      terminals: [
        { terminalId: 'h0001A00', supplement: 'センター棟' },
        { terminalId: 'h0001A01', supplement: 'A棟' },
        { terminalId: 'h0001A02', supplement: 'B棟' },
        { terminalId: 'h0001A03', supplement: 'C棟' }
      ]
    },
    {
      id: 2,
      property_code: '120406',
      property_name: 'アソシアグロッツォ天神サウス',
      address: '福岡県福岡市中央区天神',
      terminals: [
        { terminalId: 'z1003A01', supplement: '' }
      ]
    },
    {
      id: 3,
      property_code: '120408',
      property_name: 'アソシアグロッツォ博多プレイス',
      address: '福岡県福岡市博多区',
      terminals: [
        { terminalId: 'z1006A01', supplement: '' }
      ]
    }
  ],

  // 受注先マスター
  vendors: [
    { id: 1, vendor_name: '山本クリーンシステム　有限会社', emergency_contact: '092-934-0407' },
    { id: 2, vendor_name: '日本オーチス・エレベータ　株式会社', emergency_contact: '0120-085-050' },
    { id: 3, vendor_name: '株式会社　えん建物管理', emergency_contact: '092-263-8040' },
    { id: 4, vendor_name: 'テスト業者', emergency_contact: '03-1234-5678' }
  ],

  // 点検種別マスター
  inspectionTypes: [
    { id: 1, template_no: 'cleaning', inspection_name: '定期清掃', category: '清掃', default_text: '定期清掃を実施いたします。' },
    { id: 2, template_no: 'elevator_inspection', inspection_name: 'エレベーター定期点検', category: '点検', default_text: 'エレベーター定期点検を実施いたします。' },
    { id: 3, template_no: 'fire_inspection', inspection_name: '消防設備点検', category: '点検', default_text: '消防設備点検を実施いたします。' },
    { id: 4, template_no: 'construction', inspection_name: '防犯カメラ取付工事', category: '工事', default_text: '' },
    { id: 5, template_no: 'survey', inspection_name: '消防設備点検アンケート', category: 'アンケート', default_text: '' },
    { id: 6, template_no: 'building_inspection', inspection_name: '建物設備点検', category: '点検', default_text: '建物設備点検を実施いたします。' }
  ],

  // カテゴリマスター
  categories: [
    { id: 1, category_name: '点検', sort_order: 1 },
    { id: 2, category_name: '工事', sort_order: 2 },
    { id: 3, category_name: '清掃', sort_order: 3 },
    { id: 4, category_name: 'アンケート', sort_order: 4 }
  ],

  // アプリ設定
  settings: [
    { id: 1, setting_key: 'display_time_max', setting_value: '30' },
    { id: 2, setting_key: 'remarks_chars_per_line', setting_value: '25' },
    { id: 3, setting_key: 'remarks_max_lines', setting_value: '5' },
    { id: 4, setting_key: 'notice_text_max_chars', setting_value: '200' }
  ],

  // ユーザー
  users: [
    { id: 'admin-user-id', email: 'admin@example.com', company_name: '管理会社', role: 'admin', created_at: '2025-01-01T00:00:00Z' },
    { id: 'test-user-id', email: 'user@example.com', company_name: 'テスト会社', role: 'user', created_at: '2025-01-05T00:00:00Z' }
  ],

  // 登録済みエントリ
  entries: [
    {
      id: 1,
      user_id: 'test-user-id',
      property_code: '2010',
      terminal_id: 'h0001A00',
      vendor_name: '山本クリーンシステム　有限会社',
      inspection_type: '定期清掃',
      inspection_start: '2025-01-15',
      inspection_end: '2025-01-15',
      display_start_date: '2025-01-10',
      display_end_date: '2025-01-20',
      display_time: 6,
      notice_text: '定期清掃を実施いたします。',
      remarks: '',
      status: 'submitted',
      created_at: '2025-01-10T10:00:00Z',
      approved_at: null
    },
    {
      id: 2,
      user_id: 'test-user-id',
      property_code: '120406',
      terminal_id: 'z1003A01',
      vendor_name: '日本オーチス・エレベータ　株式会社',
      inspection_type: 'エレベーター定期点検',
      inspection_start: '2025-01-20',
      inspection_end: '2025-01-20',
      display_start_date: '2025-01-15',
      display_end_date: '2025-01-25',
      display_time: 10,
      notice_text: 'エレベーター定期点検を実施いたします。',
      remarks: '',
      status: 'exported',
      created_at: '2025-01-12T14:00:00Z',
      approved_at: '2025-01-12T15:00:00Z'
    }
  ],

  // 承認待ちエントリ
  pendingEntries: [
    {
      id: 101,
      user_id: 'test-user-id',
      property_code: '2010',
      terminal_id: 'h0001A01',
      vendor_name: '株式会社　えん建物管理',
      inspection_type: '消防設備点検',
      inspection_start: '2025-02-01',
      inspection_end: '2025-02-01',
      display_start_date: '2025-01-25',
      display_end_date: '2025-02-05',
      display_time: 8,
      notice_text: '消防設備点検を実施いたします。',
      remarks: '全館点検',
      status: 'pending',
      created_at: '2025-01-20T09:00:00Z',
      approved_at: null,
      signage_profiles: { email: 'user@example.com', company_name: 'テスト会社' }
    },
    {
      id: 102,
      user_id: 'admin-user-id',
      property_code: '120408',
      terminal_id: 'z1006A01',
      vendor_name: 'テスト業者',
      inspection_type: '防犯カメラ取付工事',
      inspection_start: '2025-02-10',
      inspection_end: '2025-02-15',
      display_start_date: '2025-02-05',
      display_end_date: '2025-02-20',
      display_time: 15,
      notice_text: '',
      remarks: '工事期間中はエレベーター停止',
      status: 'pending',
      created_at: '2025-01-22T11:00:00Z',
      approved_at: null,
      signage_profiles: { email: 'admin@example.com', company_name: '管理会社' }
    }
  ]
};

/**
 * 物件データをグループ化（getAllMasterData()形式）
 * Supabaseの実際のデータ構造に対応:
 * - terminals: JSON配列 [{terminalId, supplement}, ...]
 */
function groupProperties(propertiesRaw) {
  const propertiesMap = new Map();
  propertiesRaw.forEach(p => {
    const code = p.property_code;
    if (!propertiesMap.has(code)) {
      propertiesMap.set(code, {
        property_code: code,
        property_name: p.property_name,
        address: p.address || '',
        terminals: []
      });
    }

    // terminals が JSON配列の場合（新データ構造）
    if (Array.isArray(p.terminals)) {
      p.terminals.forEach(t => {
        propertiesMap.get(code).terminals.push({
          terminal_id: t.terminalId || t.terminal_id || '',
          supplement: t.supplement || ''
        });
      });
    } else if (p.terminal_id) {
      // terminal_id がフラットな場合（旧データ構造、フォールバック）
      propertiesMap.get(code).terminals.push({
        terminal_id: p.terminal_id,
        supplement: p.supplement || ''
      });
    }
  });
  return Array.from(propertiesMap.values());
}

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

  await page.route('https://cdn.jsdelivr.net/**', async route => {
    if (route.request().url().includes('@supabase/supabase-js')) {
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
                    order: () => ({ data: [], error: null })
                  }),
                  order: () => ({ data: [], error: null })
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

  await page.goto(url);
}

/**
 * マスターデータ付きで認証モックをセットアップ
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 * @param {object} options
 * @param {boolean} [options.isAuthenticated=true]
 * @param {boolean} [options.isAdmin=false]
 * @param {string} [options.email='test@example.com']
 * @param {boolean} [options.captureSubmissions=false] - 申請データを捕捉するか
 */
async function setupAuthMockWithMasterData(page, url, options = {}) {
  const {
    isAuthenticated = true,
    isAdmin = false,
    email = 'test@example.com',
    captureSubmissions = false
  } = options;

  const propertiesGrouped = groupProperties(mockData.propertiesRaw);
  const userId = isAdmin ? 'admin-user-id' : 'test-user-id';

  await page.route('https://cdn.jsdelivr.net/**', async route => {
    if (route.request().url().includes('@supabase/supabase-js')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: `
          const mockData = {
            propertiesRaw: ${JSON.stringify(mockData.propertiesRaw)},
            propertiesGrouped: ${JSON.stringify(propertiesGrouped)},
            vendors: ${JSON.stringify(mockData.vendors)},
            inspectionTypes: ${JSON.stringify(mockData.inspectionTypes)},
            categories: ${JSON.stringify(mockData.categories)},
            entries: ${JSON.stringify(mockData.entries)},
            pendingEntries: ${JSON.stringify(mockData.pendingEntries)},
            users: ${JSON.stringify(mockData.users)},
            settings: ${JSON.stringify(mockData.settings)}
          };

          // 申請データを捕捉するための配列
          window.__capturedSubmissions = [];
          window.__approvedEntries = [];
          window.__rejectedEntries = [];

          export function createClient() {
            return {
              auth: {
                getUser: async () => ({
                  data: { user: ${isAuthenticated ? `{ id: '${userId}', email: '${email}' }` : 'null'} }
                }),
                signInWithPassword: async ({ email, password }) => {
                  if (email && password) {
                    return { data: { user: { id: '${userId}', email } } };
                  }
                  throw new Error('Invalid credentials');
                },
                signOut: async () => ({}),
                onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } })
              },
              from: (table) => {
                const getTableData = (filterPending = false) => {
                  switch(table) {
                    case 'signage_master_properties': return mockData.propertiesRaw;
                    case 'signage_master_vendors': return mockData.vendors;
                    case 'signage_master_inspection_types': return mockData.inspectionTypes;
                    case 'signage_master_categories': return mockData.categories;
                    case 'signage_entries':
                      return filterPending ? mockData.pendingEntries : mockData.entries;
                    case 'signage_profiles': return mockData.users;
                    case 'signage_settings': return mockData.settings;
                    default: return [];
                  }
                };

                return {
                  select: (cols) => {
                    let isPendingFilter = false;

                    const chainable = {
                      eq: (col, val) => {
                        if (col === 'status' && val === 'pending') {
                          isPendingFilter = true;
                        }
                        return {
                          single: async () => {
                            const data = getTableData();
                            const found = data.find(d => d[col] === val || d.id === val);
                            if (table === 'signage_profiles' && col === 'id') {
                              return {
                                data: ${isAdmin ? `{ id: '${userId}', email: '${email}', role: 'admin', company_name: '管理会社' }` : `{ id: '${userId}', email: '${email}', role: 'user', company_name: 'テスト会社' }`},
                                error: null
                              };
                            }
                            return { data: found || null, error: null };
                          },
                          order: () => ({
                            data: isPendingFilter ? mockData.pendingEntries : getTableData(),
                            error: null
                          }),
                          gte: () => ({ lte: () => ({ data: getTableData(), error: null }) }),
                          in: () => ({ data: getTableData(), error: null })
                        };
                      },
                      order: (col, opts) => ({ data: getTableData(), error: null }),
                      gte: () => ({ lte: () => ({ data: getTableData(), error: null }) }),
                      is: (col, val) => ({
                        order: () => ({ data: mockData.pendingEntries, error: null })
                      })
                    };
                    return chainable;
                  },
                  insert: (data) => ({
                    select: () => ({
                      single: async () => {
                        const newEntry = { id: Date.now(), ...data };
                        ${captureSubmissions ? 'window.__capturedSubmissions.push(newEntry);' : ''}
                        return { data: newEntry, error: null };
                      },
                      then: (cb) => {
                        const entries = Array.isArray(data)
                          ? data.map((d, i) => ({ id: Date.now() + i, ...d }))
                          : [{ id: Date.now(), ...data }];
                        ${captureSubmissions ? 'window.__capturedSubmissions.push(...entries);' : ''}
                        return cb({ data: entries, error: null });
                      }
                    })
                  }),
                  update: (updateData) => ({
                    eq: (col, val) => ({
                      select: () => ({
                        single: async () => {
                          // 承認/却下の追跡
                          if (updateData.status === 'submitted' || updateData.approved_at) {
                            window.__approvedEntries.push({ id: val, ...updateData });
                          }
                          return { data: { id: val, ...updateData }, error: null };
                        }
                      }),
                      then: (cb) => {
                        if (updateData.status === 'submitted' || updateData.approved_at) {
                          window.__approvedEntries.push({ id: val, ...updateData });
                        }
                        return cb({ data: { id: val, ...updateData }, error: null });
                      }
                    }),
                    in: (col, vals) => ({
                      then: (cb) => {
                        vals.forEach(id => {
                          if (updateData.status === 'submitted' || updateData.approved_at) {
                            window.__approvedEntries.push({ id, ...updateData });
                          }
                        });
                        return cb({ data: vals.map(id => ({ id, ...updateData })), error: null });
                      }
                    })
                  }),
                  delete: () => ({
                    eq: (col, val) => {
                      window.__rejectedEntries.push(val);
                      return Promise.resolve({ error: null });
                    }
                  })
                };
              },
              storage: {
                from: () => ({
                  upload: async (path, file) => ({ data: { path }, error: null }),
                  getPublicUrl: (path) => ({ data: { publicUrl: 'https://example.com/' + path } })
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

  await page.goto(url);
}

/**
 * ページの完全読み込みを待機
 * @param {import('@playwright/test').Page} page
 * @param {number} [timeout=3000]
 */
async function waitForPageReady(page, timeout = 3000) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(timeout);
}

/**
 * トースト通知を待機して取得
 * @param {import('@playwright/test').Page} page
 * @param {string} [type] - 'success' | 'error' | 'info'
 */
async function waitForToast(page, type) {
  const toastSelector = type
    ? `.toast.${type}, .toast-${type}, [class*="toast"][class*="${type}"]`
    : '.toast, [class*="toast"]';
  await page.waitForSelector(toastSelector, { timeout: 5000 });
  return page.locator(toastSelector).first();
}

/**
 * 申請データを捕捉して取得
 * @param {import('@playwright/test').Page} page
 */
async function getCapturedSubmissions(page) {
  return page.evaluate(() => window.__capturedSubmissions || []);
}

/**
 * 承認されたエントリを取得
 * @param {import('@playwright/test').Page} page
 */
async function getApprovedEntries(page) {
  return page.evaluate(() => window.__approvedEntries || []);
}

/**
 * 却下されたエントリを取得
 * @param {import('@playwright/test').Page} page
 */
async function getRejectedEntries(page) {
  return page.evaluate(() => window.__rejectedEntries || []);
}

/**
 * 今日の日付を取得（YYYY-MM-DD形式）
 */
function getToday() {
  return new Date().toISOString().split('T')[0];
}

/**
 * 指定日数後の日付を取得
 * @param {number} days
 */
function getDateOffset(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

module.exports = {
  baseUrl,
  mockData,
  setupAuthMock,
  setupAuthMockWithMasterData,
  waitForPageReady,
  waitForToast,
  getCapturedSubmissions,
  getApprovedEntries,
  getRejectedEntries,
  getToday,
  getDateOffset
};
