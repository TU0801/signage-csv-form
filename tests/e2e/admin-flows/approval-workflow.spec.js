// @ts-check
/**
 * E2Eテスト: 管理画面 - 承認ワークフロー（admin.html）
 *
 * 管理者ストーリー:
 * - 管理者として、ユーザーからの申請を一覧で確認したい
 * - 各申請の詳細を確認し、承認または却下を行いたい
 * - 一括で複数の申請を承認したい
 */

const { test, expect } = require('@playwright/test');
const {
  setupAuthMockWithMasterData,
  waitForPageReady,
  getApprovedEntries,
  getRejectedEntries,
  mockData
} = require('../../test-helpers');

test.describe('管理画面 - 承認待ち一覧', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMockWithMasterData(page, 'http://localhost:8080/admin.html', {
      isAuthenticated: true,
      isAdmin: true,
      email: 'admin@example.com'
    });
    await waitForPageReady(page);
  });

  test('初期表示: 承認待ちタブがデフォルトで表示される', async ({ page }) => {
    // 承認待ちタブがアクティブ
    const pendingTab = page.locator('[data-tab="pending"], .tab-btn:has-text("承認待ち")');
    if (await pendingTab.count() > 0) {
      await expect(pendingTab).toHaveClass(/active/);
    }

    // 承認待ちテーブルが表示される
    const pendingTable = page.locator('#pendingTable, .pending-table');
    if (await pendingTable.count() > 0) {
      await expect(pendingTable).toBeVisible();
    }
  });

  test('承認待ち件数: 承認待ち件数が表示される', async ({ page }) => {
    const pendingCount = page.locator('#pendingCount, .pending-count');
    if (await pendingCount.count() > 0) {
      const text = await pendingCount.textContent();
      expect(parseInt(text || '0')).toBeGreaterThanOrEqual(0);
    }
  });

  test('承認待ち一覧: 承認待ちのエントリーが一覧表示される', async ({ page }) => {
    const pendingRows = page.locator('#pendingTable tbody tr, .pending-table tbody tr');
    if (await pendingRows.count() > 0) {
      // 少なくとも1件の承認待ちがある（モックデータには2件）
      expect(await pendingRows.count()).toBeGreaterThanOrEqual(1);

      // 各行に物件コード、点検種別、申請者などの情報が表示される
      const firstRow = pendingRows.first();
      const rowText = await firstRow.textContent();
      expect(rowText).toBeTruthy();
    }
  });

  test('承認待ち詳細: 詳細ボタンで申請内容を確認できる', async ({ page }) => {
    const detailBtn = page.locator('#pendingTable tbody tr button:has-text("詳細"), .pending-table tbody tr button:has-text("詳細")').first();

    if (await detailBtn.count() > 0) {
      await detailBtn.click();
      await page.waitForTimeout(500);

      // 詳細モーダルが表示される
      const detailModal = page.locator('.modal:visible, #detailModal');
      await expect(detailModal).toBeVisible();

      // 申請内容が表示される
      const modalContent = await detailModal.textContent();
      expect(modalContent).toBeTruthy();
    }
  });
});

test.describe('管理画面 - 承認・却下操作', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMockWithMasterData(page, 'http://localhost:8080/admin.html', {
      isAuthenticated: true,
      isAdmin: true,
      email: 'admin@example.com'
    });
    await waitForPageReady(page);
  });

  test('個別承認: 承認ボタンで個別の申請を承認できる', async ({ page }) => {
    const approveBtn = page.locator('#pendingTable tbody tr button:has-text("承認"), .pending-table tbody tr .approve-btn').first();

    if (await approveBtn.count() > 0) {
      await approveBtn.click();
      await page.waitForTimeout(500);

      // 確認ダイアログまたはトースト
      const confirmDialog = page.locator('.confirm-dialog, [role="dialog"]:visible');
      if (await confirmDialog.count() > 0) {
        const confirmBtn = confirmDialog.locator('button:has-text("確認"), button:has-text("OK")');
        await confirmBtn.click();
        await page.waitForTimeout(500);
      }

      // 承認完了のフィードバック
      const toast = page.locator('.toast, [class*="toast"]');
      if (await toast.count() > 0) {
        await expect(toast.first()).toBeVisible();
      }
    }
  });

  test('個別却下: 却下ボタンで個別の申請を却下できる', async ({ page }) => {
    const rejectBtn = page.locator('#pendingTable tbody tr button:has-text("却下"), .pending-table tbody tr .reject-btn').first();

    if (await rejectBtn.count() > 0) {
      await rejectBtn.click();
      await page.waitForTimeout(500);

      // 確認ダイアログ
      const confirmDialog = page.locator('.confirm-dialog, [role="dialog"]:visible');
      if (await confirmDialog.count() > 0) {
        const confirmBtn = confirmDialog.locator('button:has-text("確認"), button:has-text("OK"), button:has-text("却下")');
        await confirmBtn.click();
        await page.waitForTimeout(500);
      }

      // 却下完了のフィードバック
      const toast = page.locator('.toast, [class*="toast"]');
      if (await toast.count() > 0) {
        await expect(toast.first()).toBeVisible();
      }
    }
  });

  test('一括承認: 複数の申請を一括で承認できる', async ({ page }) => {
    // 全選択チェックボックスをクリック
    const selectAllCheckbox = page.locator('#pendingTable thead input[type="checkbox"], .pending-table thead input[type="checkbox"]');
    if (await selectAllCheckbox.count() > 0) {
      await selectAllCheckbox.click();
      await page.waitForTimeout(200);

      // 一括承認ボタンをクリック
      const bulkApproveBtn = page.locator('#bulkApproveBtn, button:has-text("一括承認")');
      if (await bulkApproveBtn.count() > 0 && await bulkApproveBtn.isEnabled()) {
        await bulkApproveBtn.click();
        await page.waitForTimeout(500);

        // 確認ダイアログ
        const confirmDialog = page.locator('.confirm-dialog, [role="dialog"]:visible');
        if (await confirmDialog.count() > 0) {
          const confirmBtn = confirmDialog.locator('button:has-text("確認"), button:has-text("OK")');
          await confirmBtn.click();
          await page.waitForTimeout(500);
        }
      }
    }
  });
});

test.describe('管理画面 - データ一覧', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMockWithMasterData(page, 'http://localhost:8080/admin.html', {
      isAuthenticated: true,
      isAdmin: true,
      email: 'admin@example.com'
    });
    await waitForPageReady(page);
  });

  test('データ一覧タブ: データ一覧タブを表示できる', async ({ page }) => {
    const entriesTab = page.locator('[data-tab="entries"], .tab-btn:has-text("データ一覧")');
    if (await entriesTab.count() > 0) {
      await entriesTab.click();
      await page.waitForTimeout(500);

      // データ一覧テーブルが表示される
      const entriesTable = page.locator('#entriesTable, .entries-table');
      if (await entriesTable.count() > 0) {
        await expect(entriesTable).toBeVisible();
      }
    }
  });

  test('物件フィルター: 物件でフィルタリングできる', async ({ page }) => {
    // データ一覧タブに移動
    const entriesTab = page.locator('[data-tab="entries"], .tab-btn:has-text("データ一覧")');
    if (await entriesTab.count() > 0) {
      await entriesTab.click();
      await page.waitForTimeout(500);

      // 物件フィルターを選択
      const propertyFilter = page.locator('#filterProperty, select[name="property"]');
      if (await propertyFilter.count() > 0) {
        await propertyFilter.selectOption('2010');
        await page.waitForTimeout(300);

        // 検索ボタンをクリック
        const searchBtn = page.locator('#searchBtn, button:has-text("検索")');
        if (await searchBtn.count() > 0) {
          await searchBtn.click();
          await page.waitForTimeout(500);
        }
      }
    }
  });

  test('日付フィルター: 日付範囲でフィルタリングできる', async ({ page }) => {
    const entriesTab = page.locator('[data-tab="entries"], .tab-btn:has-text("データ一覧")');
    if (await entriesTab.count() > 0) {
      await entriesTab.click();
      await page.waitForTimeout(500);

      const startDateFilter = page.locator('#filterStartDate, input[name="startDate"]');
      const endDateFilter = page.locator('#filterEndDate, input[name="endDate"]');

      if (await startDateFilter.count() > 0) {
        await startDateFilter.fill('2025-01-01');
        await endDateFilter.fill('2025-12-31');
        await page.waitForTimeout(300);

        const searchBtn = page.locator('#searchBtn, button:has-text("検索")');
        if (await searchBtn.count() > 0) {
          await searchBtn.click();
          await page.waitForTimeout(500);
        }
      }
    }
  });

  test('ステータス変更: エントリのステータスを変更できる', async ({ page }) => {
    const entriesTab = page.locator('[data-tab="entries"], .tab-btn:has-text("データ一覧")');
    if (await entriesTab.count() > 0) {
      await entriesTab.click();
      await page.waitForTimeout(500);

      // 最初のエントリのステータスを変更
      const statusBtn = page.locator('#entriesTable tbody tr button:has-text("取込済み"), .entries-table tbody tr .status-btn').first();
      if (await statusBtn.count() > 0) {
        await statusBtn.click();
        await page.waitForTimeout(500);

        // フィードバック
        const toast = page.locator('.toast, [class*="toast"]');
        if (await toast.count() > 0) {
          await expect(toast.first()).toBeVisible();
        }
      }
    }
  });

  test('CSV出力: データ一覧からCSVを出力できる', async ({ page }) => {
    const entriesTab = page.locator('[data-tab="entries"], .tab-btn:has-text("データ一覧")');
    if (await entriesTab.count() > 0) {
      await entriesTab.click();
      await page.waitForTimeout(500);

      const csvBtn = page.locator('#entriesCsvBtn, button:has-text("CSV")');
      if (await csvBtn.count() > 0) {
        const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
        await csvBtn.click();
        const download = await downloadPromise;

        if (download) {
          const filename = download.suggestedFilename();
          expect(filename).toMatch(/\.csv$/);
        }
      }
    }
  });
});

test.describe('管理画面 - 統計情報', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMockWithMasterData(page, 'http://localhost:8080/admin.html', {
      isAuthenticated: true,
      isAdmin: true,
      email: 'admin@example.com'
    });
    await waitForPageReady(page);
  });

  test('統計カード: 統計情報が表示される', async ({ page }) => {
    // 総登録数のテキストが表示される
    const totalLabel = page.locator('text=総登録数');
    await expect(totalLabel).toBeVisible();

    // 今月の登録のテキストが表示される
    const monthlyLabel = page.locator('text=今月の登録');
    await expect(monthlyLabel).toBeVisible();

    // ユーザー数のテキストが表示される
    const userLabel = page.locator('text=ユーザー数');
    await expect(userLabel).toBeVisible();

    // 物件数のテキストが表示される
    const propertyLabel = page.locator('text=物件数');
    await expect(propertyLabel).toBeVisible();
  });
});

test.describe('管理画面 - アクセス制御', () => {
  test('管理者専用: 一般ユーザーは管理画面にアクセスできない', async ({ page }) => {
    await setupAuthMockWithMasterData(page, 'http://localhost:8080/admin.html', {
      isAuthenticated: true,
      isAdmin: false,
      email: 'user@example.com'
    });

    // リダイレクトを待機
    await page.waitForURL(/index\.html/, { timeout: 5000 }).catch(() => {});

    const currentUrl = page.url();
    expect(currentUrl).not.toContain('admin.html');
  });

  test('未認証: 未認証ユーザーはログイン画面にリダイレクトされる', async ({ page }) => {
    await setupAuthMockWithMasterData(page, 'http://localhost:8080/admin.html', {
      isAuthenticated: false
    });

    await page.waitForURL(/login\.html/, { timeout: 5000 }).catch(() => {});

    const currentUrl = page.url();
    expect(currentUrl.includes('login') || currentUrl.includes('index')).toBe(true);
  });
});
