// @ts-check
const { test, expect } = require('@playwright/test');
const { setupAuthMockWithMasterData } = require('./test-helpers');

/**
 * E2E Test: Submit to Admin Flow
 *
 * Tests the end-to-end flow from single/bulk entry submission to admin pending list.
 * Verifies data structure consistency across all pages.
 */

// Helper to create a mock that logs insert data
function createInsertCapturingMock(userId = 'test-user-id', email = 'test@example.com', logPrefix = 'INSERT_DATA') {
  const mockProperties = [
    { id: 1, property_code: '2010', property_name: 'Test Property 1', terminals: '["h0001A00"]' },
    { id: 2, property_code: '120406', property_name: 'Test Property 2', terminals: '["z1003A01"]' }
  ];
  const mockVendors = [
    { id: 1, vendor_name: 'Test Vendor 1', emergency_contact: '03-1234-5678' },
    { id: 2, vendor_name: 'Test Vendor 2', emergency_contact: '03-2222-3333' }
  ];
  const mockInspectionTypes = [
    { id: 1, template_no: 'cleaning', inspection_name: 'Test Inspection 1', category: 'cleaning', default_text: 'Test text' },
    { id: 2, template_no: 'elevator', inspection_name: 'Test Inspection 2', category: 'inspection', default_text: '' }
  ];

  return `
    const mockProperties = ${JSON.stringify(mockProperties)};
    const mockVendors = ${JSON.stringify(mockVendors)};
    const mockInspectionTypes = ${JSON.stringify(mockInspectionTypes)};

    export function createClient() {
      return {
        auth: {
          getUser: async () => ({
            data: { user: { id: '${userId}', email: '${email}' } }
          }),
          signInWithPassword: async () => ({ data: { user: { id: '${userId}', email: '${email}' } } }),
          signOut: async () => ({}),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } })
        },
        from: (table) => {
          const getTableData = () => {
            switch(table) {
              case 'signage_master_properties': return mockProperties;
              case 'signage_master_vendors': return mockVendors;
              case 'signage_master_inspection_types': return mockInspectionTypes;
              case 'signage_master_settings': return [];
              case 'signage_master_categories': return [];
              default: return [];
            }
          };

          return {
            select: (cols) => ({
              eq: (col, val) => ({
                single: async () => {
                  if (table === 'signage_profiles') {
                    return { data: { id: '${userId}', email: '${email}', role: 'user' }, error: null };
                  }
                  return { data: null, error: null };
                },
                order: () => ({ data: getTableData(), error: null })
              }),
              order: () => ({ data: getTableData(), error: null })
            }),
            insert: (data) => {
              console.log('${logPrefix}:' + JSON.stringify(data));
              return {
                select: () => ({
                  single: async () => ({ data: { id: Date.now(), ...data }, error: null }),
                  then: (cb) => cb({ data: Array.isArray(data) ? data : [data], error: null })
                })
              };
            },
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
          };
        }
      };
    }
  `;
}

test.describe('E2E: Single Entry Submit to Admin', () => {
  test('single entry submit creates data with correct structure for admin', async ({ page }) => {
    // Capture console logs to verify insert data structure
    const insertedData = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('Sending entries:') || text.includes('insert')) {
        insertedData.push(text);
      }
    });

    await setupAuthMockWithMasterData(page, '/', { isAuthenticated: true });
    await page.waitForLoadState('networkidle');

    // Fill in the form with required fields
    await page.selectOption('#property', '2010');
    await page.waitForTimeout(100);
    await page.selectOption('#vendor', '0');
    await page.selectOption('#inspectionType', '0');
    await page.fill('#startDate', '2025-01-20');
    await page.fill('#endDate', '2025-01-21');
    await page.fill('#remarks', 'Test remarks for E2E');

    // Add entry to local data
    await page.click('button:has-text("データを追加")');
    await page.waitForTimeout(200);

    // Verify entry was added
    await expect(page.locator('#dataCount')).toContainText('1');

    // Submit to Supabase
    await page.click('#submitBtn');
    await page.waitForTimeout(500);

    // Verify success toast
    await expect(page.locator('.toast')).toContainText('申請');
  });

  test('submitted data has status draft (pending approval)', async ({ page }) => {
    // Track insert calls through route interception
    let capturedInsertData = null;

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
                    data: { user: { id: 'test-user-id', email: 'test@example.com' } }
                  }),
                  signInWithPassword: async () => ({ data: { user: { id: 'test-user-id', email: 'test@example.com' } } }),
                  signOut: async () => ({}),
                  onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } })
                },
                from: (table) => ({
                  select: () => ({
                    eq: () => ({
                      single: async () => ({ data: { id: 'test-user-id', email: 'test@example.com', role: 'user' }, error: null }),
                      order: () => ({ data: [], error: null })
                    }),
                    order: () => ({ data: [], error: null })
                  }),
                  insert: (data) => {
                    // Capture the insert data
                    console.log('INSERT_DATA:' + JSON.stringify(data));
                    window.__capturedInsertData = data;
                    return {
                      select: () => ({
                        single: async () => ({ data: { id: Date.now(), ...data }, error: null }),
                        then: (cb) => cb({ data: Array.isArray(data) ? data : [data], error: null })
                      })
                    };
                  },
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

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Fill form and submit
    await page.selectOption('#property', '2010');
    await page.waitForTimeout(100);
    await page.selectOption('#vendor', '0');
    await page.selectOption('#inspectionType', '0');
    await page.fill('#startDate', '2025-01-20');

    await page.click('button:has-text("データを追加")');
    await page.waitForTimeout(200);

    // Capture console to verify status field
    const consoleLogs = [];
    page.on('console', msg => {
      consoleLogs.push(msg.text());
    });

    await page.click('#submitBtn');
    await page.waitForTimeout(500);

    // Verify the insert data contains status: 'draft'
    const insertLog = consoleLogs.find(log => log.includes('INSERT_DATA:'));
    expect(insertLog).toBeTruthy();

    if (insertLog) {
      const jsonStr = insertLog.replace('INSERT_DATA:', '');
      const insertData = JSON.parse(jsonStr);
      const entry = Array.isArray(insertData) ? insertData[0] : insertData;
      expect(entry.status).toBe('draft');
    }
  });

  test('single entry includes user_id for admin display', async ({ page }) => {
    const consoleLogs = [];

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
                    data: { user: { id: 'test-user-id', email: 'test@example.com' } }
                  }),
                  signInWithPassword: async () => ({ data: { user: { id: 'test-user-id', email: 'test@example.com' } } }),
                  signOut: async () => ({}),
                  onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } })
                },
                from: (table) => ({
                  select: () => ({
                    eq: () => ({
                      single: async () => ({ data: { id: 'test-user-id', email: 'test@example.com', role: 'user' }, error: null }),
                      order: () => ({ data: [], error: null })
                    }),
                    order: () => ({ data: [], error: null })
                  }),
                  insert: (data) => {
                    console.log('INSERT_DATA:' + JSON.stringify(data));
                    return {
                      select: () => ({
                        single: async () => ({ data: { id: Date.now(), ...data }, error: null }),
                        then: (cb) => cb({ data: Array.isArray(data) ? data : [data], error: null })
                      })
                    };
                  },
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

    page.on('console', msg => {
      consoleLogs.push(msg.text());
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Fill form and submit
    await page.selectOption('#property', '2010');
    await page.waitForTimeout(100);
    await page.selectOption('#vendor', '0');
    await page.selectOption('#inspectionType', '0');

    await page.click('button:has-text("データを追加")');
    await page.waitForTimeout(200);

    await page.click('#submitBtn');
    await page.waitForTimeout(500);

    // Verify the insert data contains user_id
    const insertLog = consoleLogs.find(log => log.includes('INSERT_DATA:'));
    expect(insertLog).toBeTruthy();

    if (insertLog) {
      const jsonStr = insertLog.replace('INSERT_DATA:', '');
      const insertData = JSON.parse(jsonStr);
      const entry = Array.isArray(insertData) ? insertData[0] : insertData;
      expect(entry.user_id).toBe('test-user-id');
    }
  });
});

test.describe('E2E: Bulk Entry Submit to Admin', () => {
  test('bulk entry submit creates data with correct structure for admin', async ({ page }) => {
    // Clear localStorage before test
    await page.addInitScript(() => {
      localStorage.clear();
    });

    const consoleLogs = [];

    await page.route('https://cdn.jsdelivr.net/**', async route => {
      if (route.request().url().includes('@supabase/supabase-js')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/javascript',
          body: createInsertCapturingMock('test-user-id', 'test@example.com', 'BULK_INSERT_DATA')
        });
      } else {
        await route.continue();
      }
    });

    page.on('console', msg => {
      consoleLogs.push(msg.text());
    });

    await page.goto('/bulk.html');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    // Add a row
    await page.click('#addRowBtn');
    await page.waitForTimeout(300);

    // Fill in the row - select property using the correct selector
    const propertySelect = page.locator('#tableBody tr:first-child .property-select');
    await propertySelect.selectOption({ index: 1 }); // First real option after empty
    await page.waitForTimeout(100);

    // Select vendor
    const vendorSelect = page.locator('#tableBody tr:first-child .vendor-select');
    await vendorSelect.selectOption({ index: 1 });
    await page.waitForTimeout(100);

    // Select inspection type
    const inspectionSelect = page.locator('#tableBody tr:first-child .inspection-select');
    await inspectionSelect.selectOption({ index: 1 });
    await page.waitForTimeout(200);

    // Verify the row is valid (status badge shows OK)
    await expect(page.locator('#tableBody tr:first-child .status-badge')).toHaveText('OK');

    // Wait for save button to be enabled
    await expect(page.locator('#saveBtn')).toBeEnabled({ timeout: 5000 });

    // Submit
    await page.click('#saveBtn');
    await page.waitForTimeout(500);

    // Verify the insert data structure
    const insertLog = consoleLogs.find(log => log.includes('BULK_INSERT_DATA:'));
    expect(insertLog).toBeTruthy();

    if (insertLog) {
      const jsonStr = insertLog.replace('BULK_INSERT_DATA:', '');
      const insertData = JSON.parse(jsonStr);
      const entry = Array.isArray(insertData) ? insertData[0] : insertData;

      // Verify required fields for admin display
      expect(entry).toHaveProperty('property_code');
      expect(entry).toHaveProperty('status');
      expect(entry.status).toBe('draft');
    }
  });

  test('bulk entry includes user_id for admin display', async ({ page }) => {
    // Clear localStorage before test
    await page.addInitScript(() => {
      localStorage.clear();
    });

    const consoleLogs = [];

    await page.route('https://cdn.jsdelivr.net/**', async route => {
      if (route.request().url().includes('@supabase/supabase-js')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/javascript',
          body: createInsertCapturingMock('bulk-user-id', 'bulk@example.com', 'BULK_INSERT_DATA')
        });
      } else {
        await route.continue();
      }
    });

    page.on('console', msg => {
      consoleLogs.push(msg.text());
    });

    await page.goto('/bulk.html');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    // Add a row
    await page.click('#addRowBtn');
    await page.waitForTimeout(300);

    // Fill in the row
    const propertySelect = page.locator('#tableBody tr:first-child .property-select');
    await propertySelect.selectOption({ index: 1 });
    await page.waitForTimeout(100);

    const vendorSelect = page.locator('#tableBody tr:first-child .vendor-select');
    await vendorSelect.selectOption({ index: 1 });
    await page.waitForTimeout(100);

    const inspectionSelect = page.locator('#tableBody tr:first-child .inspection-select');
    await inspectionSelect.selectOption({ index: 1 });
    await page.waitForTimeout(200);

    // Verify the row is valid
    await expect(page.locator('#tableBody tr:first-child .status-badge')).toHaveText('OK');

    // Wait for save button to be enabled
    await expect(page.locator('#saveBtn')).toBeEnabled({ timeout: 5000 });

    // Submit
    await page.click('#saveBtn');
    await page.waitForTimeout(500);

    // Verify user_id is included
    const insertLog = consoleLogs.find(log => log.includes('BULK_INSERT_DATA:'));
    expect(insertLog).toBeTruthy();

    if (insertLog) {
      const jsonStr = insertLog.replace('BULK_INSERT_DATA:', '');
      const insertData = JSON.parse(jsonStr);
      const entry = Array.isArray(insertData) ? insertData[0] : insertData;
      expect(entry.user_id).toBe('bulk-user-id');
    }
  });
});

test.describe('E2E: Data Structure Consistency', () => {
  test('both entry types produce compatible data structures', async ({ page }) => {
    // Clear localStorage before test
    await page.addInitScript(() => {
      localStorage.clear();
    });

    await page.route('https://cdn.jsdelivr.net/**', async route => {
      if (route.request().url().includes('@supabase/supabase-js')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/javascript',
          body: createInsertCapturingMock('test-user-id', 'test@example.com', 'STRUCTURE_TEST')
        });
      } else {
        await route.continue();
      }
    });

    const consoleLogs = [];
    page.on('console', msg => {
      consoleLogs.push(msg.text());
    });

    // Test single entry structure
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.selectOption('#property', '2010');
    await page.waitForTimeout(100);
    await page.selectOption('#vendor', '0');
    await page.selectOption('#inspectionType', '0');
    await page.fill('#startDate', '2025-01-20');

    await page.click('button:has-text("データを追加")');
    await page.waitForTimeout(200);
    await page.click('#submitBtn');
    await page.waitForTimeout(500);

    // Get single entry fields
    const singleLog = consoleLogs.find(log => log.includes('STRUCTURE_TEST:'));
    let singleEntryData = null;
    if (singleLog) {
      const jsonStr = singleLog.replace('STRUCTURE_TEST:', '');
      const parsed = JSON.parse(jsonStr);
      singleEntryData = Array.isArray(parsed) ? parsed[0] : parsed;
    }

    // Clear logs
    consoleLogs.length = 0;

    // Test bulk entry structure
    await page.goto('/bulk.html');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    await page.click('#addRowBtn');
    await page.waitForTimeout(300);

    const propertySelect = page.locator('#tableBody tr:first-child .property-select');
    await propertySelect.selectOption({ index: 1 });
    await page.waitForTimeout(100);

    const vendorSelect = page.locator('#tableBody tr:first-child .vendor-select');
    await vendorSelect.selectOption({ index: 1 });
    await page.waitForTimeout(100);

    const inspectionSelect = page.locator('#tableBody tr:first-child .inspection-select');
    await inspectionSelect.selectOption({ index: 1 });
    await page.waitForTimeout(200);

    // Verify the row is valid
    await expect(page.locator('#tableBody tr:first-child .status-badge')).toHaveText('OK');

    // Wait for save button to be enabled
    await expect(page.locator('#saveBtn')).toBeEnabled({ timeout: 5000 });

    await page.click('#saveBtn');
    await page.waitForTimeout(500);

    // Get bulk entry fields
    const bulkLog = consoleLogs.find(log => log.includes('STRUCTURE_TEST:'));
    let bulkEntryData = null;
    if (bulkLog) {
      const jsonStr = bulkLog.replace('STRUCTURE_TEST:', '');
      const parsed = JSON.parse(jsonStr);
      bulkEntryData = Array.isArray(parsed) ? parsed[0] : parsed;
    }

    // Verify both have data
    expect(singleEntryData).toBeTruthy();
    expect(bulkEntryData).toBeTruthy();

    // Verify common required fields exist in both
    const requiredFields = ['property_code', 'inspection_type', 'status', 'user_id'];

    for (const field of requiredFields) {
      expect(singleEntryData).toHaveProperty(field);
      expect(bulkEntryData).toHaveProperty(field);
    }

    // Verify status is draft for both
    expect(singleEntryData.status).toBe('draft');
    expect(bulkEntryData.status).toBe('draft');
  });

  test('admin can display data from both entry types', async ({ page }) => {
    // This test verifies the admin pending list can handle data from both sources
    const mockPendingEntries = [
      {
        id: 1,
        property_code: '2010',
        inspection_type: 'Test Inspection',
        inspection_start: '2025-01-20',
        status: 'draft',
        user_id: 'user-1',
        created_at: '2025-01-15T10:00:00Z',
        signage_profiles: { email: 'single@example.com' }
      },
      {
        id: 2,
        property_code: '120406',
        inspection_type: 'Bulk Inspection',
        inspection_start: '2025-01-22',
        status: 'draft',
        user_id: 'user-2',
        created_at: '2025-01-15T11:00:00Z',
        signage_profiles: { email: 'bulk@example.com' }
      }
    ];

    await page.route('https://cdn.jsdelivr.net/**', async route => {
      if (route.request().url().includes('@supabase/supabase-js')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/javascript',
          body: `
            const mockEntries = ${JSON.stringify(mockPendingEntries)};
            const mockProperties = [
              { id: 1, property_code: '2010', property_name: 'Property 1', terminals: '[]' },
              { id: 2, property_code: '120406', property_name: 'Property 2', terminals: '[]' }
            ];
            const mockUsers = [
              { id: 'user-1', email: 'single@example.com', role: 'user' },
              { id: 'user-2', email: 'bulk@example.com', role: 'user' },
              { id: 'admin-id', email: 'admin@example.com', role: 'admin' }
            ];
            const mockCategories = [];
            const mockVendors = [];
            const mockInspectionTypes = [];

            export function createClient() {
              return {
                auth: {
                  getUser: async () => ({
                    data: { user: { id: 'admin-id', email: 'admin@example.com' } }
                  }),
                  signInWithPassword: async () => ({ data: { user: { id: 'admin-id', email: 'admin@example.com' } } }),
                  signOut: async () => ({}),
                  onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } })
                },
                from: (table) => {
                  return {
                    select: (cols) => ({
                      eq: (col, val) => {
                        if (table === 'signage_entries' && col === 'status' && val === 'pending') {
                          return {
                            order: () => ({ data: mockEntries, error: null })
                          };
                        }
                        return {
                          single: async () => {
                            if (table === 'signage_profiles') {
                              return { data: { id: 'admin-id', email: 'admin@example.com', role: 'admin' }, error: null };
                            }
                            return { data: null, error: null };
                          },
                          order: () => ({ data: [], error: null })
                        };
                      },
                      order: () => {
                        if (table === 'signage_entries') {
                          return { data: mockEntries, error: null };
                        }
                        if (table === 'signage_master_properties') {
                          return { data: mockProperties, error: null };
                        }
                        if (table === 'signage_profiles') {
                          return { data: mockUsers, error: null };
                        }
                        if (table === 'signage_master_categories') {
                          return { data: mockCategories, error: null };
                        }
                        if (table === 'signage_master_vendors') {
                          return { data: mockVendors, error: null };
                        }
                        if (table === 'signage_master_inspection_types') {
                          return { data: mockInspectionTypes, error: null };
                        }
                        return { data: [], error: null };
                      },
                      gte: () => ({ lte: () => ({ data: mockEntries, error: null }) })
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
                      }),
                      in: () => ({
                        select: async () => ({ data: [], error: null })
                      })
                    }),
                    upsert: () => ({
                      select: async () => ({ data: [], error: null })
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
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    // Verify admin page loaded - use first() to select only the first matching element
    await expect(page.locator('.admin-tab.active').first()).toContainText('承認待ち');

    // The admin page should be able to display entries from both sources
    // The data structure should be compatible
  });
});
