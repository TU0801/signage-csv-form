// @ts-check
const { test, expect } = require('@playwright/test');
const { setupAuthMockWithMasterData } = require('./test-helpers');

test.describe('Admin Page Button Tests', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMockWithMasterData(page, '/admin.html', {
      isAuthenticated: true,
      isAdmin: true,
      email: 'admin@example.com'
    });
  });

  test.describe('Logout Button', () => {
    test('logout button is visible', async ({ page }) => {
      await expect(page.locator('#logoutBtn')).toBeVisible();
    });

    test('logout button has correct text', async ({ page }) => {
      await expect(page.locator('#logoutBtn')).toHaveText('ログアウト');
    });
  });

  test.describe('Main Tab Buttons', () => {
    test('approval tab is visible and active by default', async ({ page }) => {
      const tab = page.locator('.admin-tab[data-tab="approval"]');
      await expect(tab).toBeVisible();
      await expect(tab).toHaveClass(/active/);
    });

    test('data list tab is visible', async ({ page }) => {
      const tab = page.locator('.admin-tab[data-tab="entries"]');
      await expect(tab).toBeVisible();
    });

    test('csv export tab is visible', async ({ page }) => {
      await expect(page.locator('.admin-tab[data-tab="export"]')).toBeVisible();
    });

    test('master management tab is visible', async ({ page }) => {
      await expect(page.locator('.admin-tab[data-tab="master"]')).toBeVisible();
    });

    test('user management tab is visible', async ({ page }) => {
      await expect(page.locator('.admin-tab[data-tab="users"]')).toBeVisible();
    });

    test('clicking data list tab shows entries content', async ({ page }) => {
      await page.click('.admin-tab[data-tab="entries"]');
      await expect(page.locator('#tab-entries')).toBeVisible();
      await expect(page.locator('#tab-entries')).toHaveClass(/active/);
    });

    test('clicking csv export tab shows export content', async ({ page }) => {
      await page.click('.admin-tab[data-tab="export"]');
      await expect(page.locator('#tab-export')).toBeVisible();
      await expect(page.locator('#tab-export')).toHaveClass(/active/);
    });

    test('clicking master tab shows master content', async ({ page }) => {
      await page.click('.admin-tab[data-tab="master"]');
      await expect(page.locator('#tab-master')).toBeVisible();
      await expect(page.locator('#tab-master')).toHaveClass(/active/);
    });

    test('clicking users tab shows users content', async ({ page }) => {
      await page.click('.admin-tab[data-tab="users"]');
      await expect(page.locator('#tab-users')).toBeVisible();
      await expect(page.locator('#tab-users')).toHaveClass(/active/);
    });

    test('only one tab content is visible at a time', async ({ page }) => {
      await page.click('.admin-tab[data-tab="export"]');

      await expect(page.locator('#tab-export')).toHaveClass(/active/);
      await expect(page.locator('#tab-approval')).not.toHaveClass(/active/);
      await expect(page.locator('#tab-entries')).not.toHaveClass(/active/);
      await expect(page.locator('#tab-master')).not.toHaveClass(/active/);
      await expect(page.locator('#tab-users')).not.toHaveClass(/active/);
    });

    test('clicking approval tab shows approval content', async ({ page }) => {
      await page.click('.admin-tab[data-tab="entries"]');
      await page.click('.admin-tab[data-tab="approval"]');
      await expect(page.locator('#tab-approval')).toBeVisible();
      await expect(page.locator('#tab-approval')).toHaveClass(/active/);
    });
  });

  test.describe('Search Button (Entries Tab)', () => {
    test.beforeEach(async ({ page }) => {
      await page.click('.admin-tab[data-tab="entries"]');
    });

    test('search button is visible', async ({ page }) => {
      await expect(page.locator('#searchBtn')).toBeVisible();
    });

    test('search button has correct text', async ({ page }) => {
      await expect(page.locator('#searchBtn')).toHaveText('検索');
    });

    test('search button is clickable', async ({ page }) => {
      await page.click('#searchBtn');
      // Should not throw error
    });
  });

  test.describe('CSV Export Buttons', () => {
    test.beforeEach(async ({ page }) => {
      await page.click('.admin-tab[data-tab="export"]');
    });

    test('csv download button is visible', async ({ page }) => {
      await expect(page.locator('#exportCsvBtn')).toBeVisible();
    });

    test('csv download button has correct text', async ({ page }) => {
      await expect(page.locator('#exportCsvBtn')).toContainText('CSVダウンロード');
    });

    test('copy button is visible', async ({ page }) => {
      await expect(page.locator('#exportCopyBtn')).toBeVisible();
    });

    test('copy button has correct text', async ({ page }) => {
      await expect(page.locator('#exportCopyBtn')).toContainText('コピー');
    });
  });

  test.describe('Master Management Tab Buttons', () => {
    test.beforeEach(async ({ page }) => {
      await page.click('.admin-tab[data-tab="master"]');
    });

    test('properties sub-tab is visible and active by default', async ({ page }) => {
      const tab = page.locator('.admin-tab[data-master="properties"]');
      await expect(tab).toBeVisible();
      await expect(tab).toHaveClass(/active/);
    });

    test('vendors sub-tab is visible', async ({ page }) => {
      await expect(page.locator('.admin-tab[data-master="vendors"]')).toBeVisible();
    });

    test('inspections sub-tab is visible', async ({ page }) => {
      await expect(page.locator('.admin-tab[data-master="inspections"]')).toBeVisible();
    });

    test('clicking vendors sub-tab shows vendors content', async ({ page }) => {
      await page.click('.admin-tab[data-master="vendors"]');
      await expect(page.locator('#master-vendors')).toBeVisible();
    });

    test('clicking inspections sub-tab shows inspections content', async ({ page }) => {
      await page.click('.admin-tab[data-master="inspections"]');
      await expect(page.locator('#master-inspections')).toBeVisible();
    });
  });

  test.describe('Add Property Button', () => {
    test.beforeEach(async ({ page }) => {
      await page.click('.admin-tab[data-tab="master"]');
    });

    test('add property button is visible', async ({ page }) => {
      await expect(page.locator('#addPropertyBtn')).toBeVisible();
    });

    test('add property button has correct text', async ({ page }) => {
      await expect(page.locator('#addPropertyBtn')).toContainText('追加');
    });
  });

  test.describe('Add Vendor Button', () => {
    test.beforeEach(async ({ page }) => {
      await page.click('.admin-tab[data-tab="master"]');
      await page.click('.admin-tab[data-master="vendors"]');
    });

    test('add vendor button is visible', async ({ page }) => {
      await expect(page.locator('#addVendorBtn')).toBeVisible();
    });

    test('add vendor button has correct text', async ({ page }) => {
      await expect(page.locator('#addVendorBtn')).toContainText('追加');
    });
  });

  test.describe('Add Inspection Type Button', () => {
    test.beforeEach(async ({ page }) => {
      await page.click('.admin-tab[data-tab="master"]');
      await page.click('.admin-tab[data-master="inspections"]');
    });

    test('add inspection button is visible', async ({ page }) => {
      await expect(page.locator('#addInspectionBtn')).toBeVisible();
    });

    test('add inspection button has correct text', async ({ page }) => {
      await expect(page.locator('#addInspectionBtn')).toContainText('追加');
    });
  });

  test.describe('Navigation Links', () => {
    test('link to single entry form is visible', async ({ page }) => {
      await expect(page.locator('a[href="index.html"]')).toBeVisible();
    });

    test('link to bulk entry form is visible', async ({ page }) => {
      await expect(page.locator('a[href="bulk.html"]')).toBeVisible();
    });
  });

  test.describe('Authentication and Authorization', () => {
    test('redirects to login when not authenticated', async ({ page }) => {
      await setupAuthMockWithMasterData(page, '/admin.html', { isAuthenticated: false });
      await page.waitForURL(/login\.html/);
      expect(page.url()).toContain('login.html');
    });

    test('redirects to index when not admin', async ({ page }) => {
      // Setup dialog handler before navigation
      page.on('dialog', async dialog => {
        await dialog.accept();
      });

      await setupAuthMockWithMasterData(page, '/admin.html', {
        isAuthenticated: true,
        isAdmin: false
      });

      await page.waitForURL(/index\.html/);
      expect(page.url()).toContain('index.html');
    });
  });

  test.describe('Statistics Cards', () => {
    test('total entries stat card is visible', async ({ page }) => {
      await expect(page.locator('#statTotal')).toBeVisible();
    });

    test('monthly entries stat card is visible', async ({ page }) => {
      await expect(page.locator('#statMonth')).toBeVisible();
    });

    test('users stat card is visible', async ({ page }) => {
      await expect(page.locator('#statUsers')).toBeVisible();
    });

    test('properties stat card is visible', async ({ page }) => {
      await expect(page.locator('#statProperties')).toBeVisible();
    });
  });
});
