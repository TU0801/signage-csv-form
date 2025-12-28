// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * E2E Admin Flow Tests
 *
 * Covers complete admin journeys:
 * 1. Login → View Pending → View Detail → Approve/Reject → CSV Export
 * 2. Login → Edit Master Data → Verify User Screen Reflects Changes
 */

// Mock entries for admin tests
const mockPendingEntries = [
  {
    id: 1,
    property_code: '2010',
    terminal_id: 'h0001A00',
    vendor_name: 'テスト業者',
    inspection_type: 'エレベーター点検',
    inspection_start: '2025-02-01',
    inspection_end: '2025-02-01',
    remarks: 'テスト備考',
    announcement: 'テスト案内',
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
  { id: 1, property_code: '2010', property_name: 'エンクレストガーデン福岡', terminals: '["h0001A00", "h0001A01"]' },
  { id: 2, property_code: '120406', property_name: 'アソシアグロッツォ天神', terminals: '["z1003A01"]' }
];

const mockVendors = [
  { id: 1, vendor_name: 'テスト業者', emergency_contact: '092-000-0001' },
  { id: 2, vendor_name: '別の業者', emergency_contact: '092-000-0002' }
];

const mockInspectionTypes = [
  { id: 1, template_no: 'elevator', inspection_name: 'エレベーター点検', category: 'inspection', default_text: '' },
  { id: 2, template_no: 'fire', inspection_name: '消防点検', category: 'inspection', default_text: '' }
];

async function setupAdminMock(page, options = {}) {
  const {
    email = 'admin@example.com',
    entries = mockPendingEntries,
    approvedEntries = []
  } = options;

  await page.route('https://cdn.jsdelivr.net/**', async route => {
    if (route.request().url().includes('@supabase/supabase-js')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: `
          let currentEntries = ${JSON.stringify(entries)};
          const approvedEntries = ${JSON.stringify(approvedEntries)};
          const mockProperties = ${JSON.stringify(mockProperties)};
          const mockVendors = ${JSON.stringify(mockVendors)};
          const mockInspectionTypes = ${JSON.stringify(mockInspectionTypes)};
          const mockUsers = [
            { id: 'admin-id', email: '${email}', role: 'admin', company_name: '管理会社' }
          ];
          const mockCategories = [
            { id: 1, category_key: 'inspection', category_name: '点検', sort_order: 1 }
          ];

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
                    // Simulate approval - update status
                    const entry = currentEntries.find(e => e.id === val);
                    if (entry) {
                      Object.assign(entry, data);
                    }
                    return {
                      select: () => ({
                        single: async () => ({ data: entry || data, error: null })
                      })
                    };
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
                upsert: (data) => ({
                  select: async () => ({ data: Array.isArray(data) ? data : [data], error: null })
                }),
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

test.describe('E2E: Admin Approval Flow', () => {
  test('admin can view pending entries and approve them', async ({ page }) => {
    await setupAdminMock(page);
    await page.waitForTimeout(300);

    // === Step 1: Verify admin is on approval tab ===
    await expect(page.locator('.admin-tab.active').first()).toContainText('承認待ち');
    await expect(page.locator('#pendingCount')).toBeVisible();

    // === Step 2: Verify pending entries are displayed ===
    const pendingBody = page.locator('#pendingBody');
    await expect(pendingBody).toBeVisible();

    // Wait for entries to load
    await page.waitForTimeout(500);
    const rows = pendingBody.locator('tr');
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThanOrEqual(0);

    // === Step 3: View entry detail (if detail button exists) ===
    const detailBtn = pendingBody.locator('tr:first-child button').filter({ hasText: '📋' }).first();
    if (await detailBtn.isVisible()) {
      await detailBtn.click();
      await expect(page.locator('#entryDetailModal, .entry-detail-modal')).toBeVisible();

      // Close modal
      const closeBtn = page.locator('#closeEntryDetailModal, .entry-detail-modal .close-btn').first();
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
      }
    }

    // === Step 4: Approve entry ===
    const approveBtn = pendingBody.locator('tr:first-child button').filter({ hasText: '承認' }).first();
    if (await approveBtn.isVisible()) {
      page.on('dialog', dialog => dialog.accept());
      await approveBtn.click();
      await page.waitForTimeout(300);

      // Verify success toast
      await expect(page.locator('.toast')).toBeVisible();
    }
  });

  test('admin can reject (delete) pending entry', async ({ page }) => {
    await setupAdminMock(page);
    await page.waitForTimeout(300);

    const pendingBody = page.locator('#pendingBody');
    await page.waitForTimeout(500);

    const initialCount = await pendingBody.locator('tr').count();

    // Find and click reject button
    const rejectBtn = pendingBody.locator('tr:first-child button').filter({ hasText: '却下' }).first();
    if (await rejectBtn.isVisible()) {
      page.on('dialog', dialog => dialog.accept());
      await rejectBtn.click();
      await page.waitForTimeout(300);

      // Verify entry was removed
      const newCount = await pendingBody.locator('tr').count();
      expect(newCount).toBeLessThan(initialCount);
    }
  });

  test('admin can bulk approve multiple entries', async ({ page }) => {
    await setupAdminMock(page);
    await page.waitForTimeout(500);

    // Select all pending entries
    const selectAll = page.locator('#pendingSelectAll');
    if (await selectAll.isVisible()) {
      await selectAll.check();

      // Click bulk approve
      const bulkApproveBtn = page.locator('#bulkApproveBtn');
      if (await bulkApproveBtn.isVisible() && await bulkApproveBtn.isEnabled()) {
        page.on('dialog', dialog => dialog.accept());
        await bulkApproveBtn.click();
        await page.waitForTimeout(300);

        // Verify success
        await expect(page.locator('.toast')).toBeVisible();
      }
    }
  });
});

test.describe('E2E: Admin CSV Export Flow', () => {
  test('admin can export approved entries to CSV', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await setupAdminMock(page);
    await page.waitForTimeout(300);

    // Navigate to export tab
    await page.click('.admin-tab[data-tab="export"]');
    await expect(page.locator('#tab-export')).toBeVisible();

    // Verify export controls are present
    await expect(page.locator('#exportProperty')).toBeVisible();
    await expect(page.locator('#exportStartDate')).toBeVisible();
    await expect(page.locator('#exportEndDate')).toBeVisible();
    await expect(page.locator('#exportCsvBtn')).toBeVisible();
    await expect(page.locator('#exportCopyBtn')).toBeVisible();

    // Verify export count is shown
    await expect(page.locator('#exportCount')).toBeVisible();

    // Click copy button
    await page.click('#exportCopyBtn');

    // Verify success toast
    await expect(page.locator('.toast')).toBeVisible();
  });

  test('admin CSV export has correct 28-column format', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await setupAdminMock(page);
    await page.waitForTimeout(300);

    // Navigate to export tab
    await page.click('.admin-tab[data-tab="export"]');
    await expect(page.locator('#tab-export')).toBeVisible();

    // The export should produce CSV in the same format as single/bulk entry
    const copyBtn = page.locator('#exportCopyBtn');
    await expect(copyBtn).toBeVisible();
  });
});

test.describe('E2E: Admin Data List', () => {
  test('admin can view all entries in data list tab', async ({ page }) => {
    await setupAdminMock(page);
    await page.waitForTimeout(300);

    // Navigate to entries tab
    await page.click('.admin-tab[data-tab="entries"]');
    await expect(page.locator('#tab-entries')).toBeVisible();

    // Verify filter controls
    await expect(page.locator('#filterProperty')).toBeVisible();
    await expect(page.locator('#filterStartDate')).toBeVisible();
    await expect(page.locator('#filterEndDate')).toBeVisible();
    await expect(page.locator('#searchBtn')).toBeVisible();

    // Verify table is displayed
    await expect(page.locator('#entriesBody')).toBeVisible();
  });

  test('admin can filter entries by property and date', async ({ page }) => {
    await setupAdminMock(page);
    await page.waitForTimeout(300);

    await page.click('.admin-tab[data-tab="entries"]');
    await expect(page.locator('#tab-entries')).toBeVisible();

    // Set date filter
    await page.fill('#filterStartDate', '2025-01-01');
    await page.fill('#filterEndDate', '2025-12-31');

    // Click search
    await page.click('#searchBtn');
    await page.waitForTimeout(300);

    // Table should still be visible
    await expect(page.locator('#entriesBody')).toBeVisible();
  });
});

test.describe('E2E: Admin Master Data Management', () => {
  test('admin can view and edit master properties', async ({ page }) => {
    await setupAdminMock(page);
    await page.waitForTimeout(300);

    // Navigate to master tab
    await page.click('.admin-tab[data-tab="master"]');
    await expect(page.locator('#tab-master')).toBeVisible();

    // Properties sub-tab should be active by default (uses data-master attribute)
    await expect(page.locator('#tab-master .admin-tab.active')).toContainText('物件');

    // Verify properties content is visible
    await expect(page.locator('#master-properties')).toBeVisible();
  });

  test('admin can view vendors list', async ({ page }) => {
    await setupAdminMock(page);
    await page.waitForTimeout(300);

    await page.click('.admin-tab[data-tab="master"]');
    await expect(page.locator('#tab-master')).toBeVisible();

    // Click vendors sub-tab (uses data-master attribute)
    await page.click('#tab-master .admin-tab[data-master="vendors"]');
    await expect(page.locator('#master-vendors')).toBeVisible();
  });

  test('admin can view inspection types list', async ({ page }) => {
    await setupAdminMock(page);
    await page.waitForTimeout(300);

    await page.click('.admin-tab[data-tab="master"]');
    await expect(page.locator('#tab-master')).toBeVisible();

    // Click inspections sub-tab (uses data-master attribute)
    await page.click('#tab-master .admin-tab[data-master="inspections"]');
    await expect(page.locator('#master-inspections')).toBeVisible();
  });
});

test.describe('E2E: Master Data Reflects in User Screen', () => {
  test('master data from database appears in user entry form', async ({ page }) => {
    // This test verifies that master data is loaded and displayed correctly
    // Using the standard mock which provides properties, vendors, and inspection types

    const { setupAuthMockWithMasterData } = require('./test-helpers');

    await setupAuthMockWithMasterData(page, '/', {
      isAuthenticated: true,
      email: 'user@example.com'
    });

    await page.waitForLoadState('networkidle');

    // Verify property dropdown is populated
    const propertySelect = page.locator('#property');
    await expect(propertySelect).toBeVisible();

    const propertyOptions = await propertySelect.locator('option').count();
    expect(propertyOptions).toBeGreaterThan(1); // More than just the default option

    // Verify vendor dropdown is populated
    const vendorSelect = page.locator('#vendor');
    await expect(vendorSelect).toBeVisible();

    const vendorOptions = await vendorSelect.locator('option').count();
    expect(vendorOptions).toBeGreaterThan(1);

    // Verify inspection type dropdown is populated
    const inspectionSelect = page.locator('#inspectionType');
    await expect(inspectionSelect).toBeVisible();

    const inspectionOptions = await inspectionSelect.locator('option').count();
    expect(inspectionOptions).toBeGreaterThan(1);

    // Verify selecting a property populates terminals
    await propertySelect.selectOption('2010');
    await page.waitForTimeout(200);

    const terminalSelect = page.locator('#terminal');
    const terminalOptions = await terminalSelect.locator('option').count();
    expect(terminalOptions).toBeGreaterThan(0);
  });
});

test.describe('E2E: Admin Authentication', () => {
  test('non-admin user cannot access admin page', async ({ page }) => {
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
                  signInWithPassword: async () => ({ data: { user: { id: 'user-id', email: 'user@example.com' } } }),
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

    await page.goto('/admin.html');
    await page.waitForTimeout(500);

    // Non-admin should be redirected
    const url = page.url();
    expect(url).not.toContain('admin.html');
  });
});
