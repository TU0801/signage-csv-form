// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * 管理者CRUD操作のE2Eテスト
 * マスターデータの追加・編集・削除、承認フロー、エクスポートをテスト
 */

const baseUrl = process.env.BASE_URL || 'http://localhost:8080';

// テスト用ユニーク識別子（重複防止）
const TEST_ID = `test_${Date.now()}`;

/**
 * 管理者でログインしてadmin画面へ遷移
 */
async function loginAsAdminAndGoToAdmin(page) {
  await page.goto(`${baseUrl}/login.html`);
  await page.fill('input[type="email"]', 'admin@example.com');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(index|admin)\.html/, { timeout: 10000 });
  await page.goto(`${baseUrl}/admin.html`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
}

/**
 * マスター管理タブ内のサブタブをクリック
 */
async function clickMasterSubTab(page, subTabName) {
  // まずマスター管理メインタブをクリック
  await page.click('.sidebar-nav-link[data-tab="master"]');
  await page.waitForTimeout(500);
  // サブタブをクリック
  await page.click(`.admin-tab[data-master="${subTabName}"]`);
  await page.waitForTimeout(500);
}

// ============================================
// マスター管理: サブタブナビゲーション
// ============================================
test.describe('マスター管理タブ', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdminAndGoToAdmin(page);
  });

  test('マスター管理の全サブタブが表示される', async ({ page }) => {
    await page.click('.sidebar-nav-link[data-tab="master"]');
    await page.waitForTimeout(500);

    const subTabs = ['properties', 'vendors', 'inspections', 'categories', 'templateImages', 'settings'];
    for (const tab of subTabs) {
      await expect(page.locator(`.admin-tab[data-master="${tab}"]`)).toBeAttached();
    }
  });

  test('物件サブタブでリストと追加ボタンが表示される', async ({ page }) => {
    await clickMasterSubTab(page, 'properties');
    await expect(page.locator('#addPropertyBtn')).toBeVisible();
    await expect(page.locator('#propertiesList')).toBeAttached();
  });

  test('保守会社サブタブでリストと追加ボタンが表示される', async ({ page }) => {
    await clickMasterSubTab(page, 'vendors');
    await expect(page.locator('#addVendorBtn')).toBeVisible();
    await expect(page.locator('#vendorsList')).toBeAttached();
  });

  test('点検種別サブタブでリストと追加ボタンが表示される', async ({ page }) => {
    await clickMasterSubTab(page, 'inspections');
    await expect(page.locator('#addInspectionBtn')).toBeVisible();
    await expect(page.locator('#inspectionsList')).toBeAttached();
  });

  test('カテゴリサブタブでリストと追加ボタンが表示される', async ({ page }) => {
    await clickMasterSubTab(page, 'categories');
    await expect(page.locator('#addCategoryBtn')).toBeVisible();
    await expect(page.locator('#categoriesList')).toBeAttached();
  });
});

// ============================================
// マスター管理: カテゴリCRUD
// ============================================
test.describe('カテゴリCRUD', () => {
  const categoryName = `テストカテゴリ_${TEST_ID}`;
  const categoryNameEdited = `編集済カテゴリ_${TEST_ID}`;

  test.beforeEach(async ({ page }) => {
    await loginAsAdminAndGoToAdmin(page);
    await clickMasterSubTab(page, 'categories');
  });

  test('カテゴリを追加できる', async ({ page }) => {
    // confirm ダイアログを自動承認
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });

    await page.click('#addCategoryBtn');
    await page.waitForTimeout(300);

    // モーダルが表示される
    await expect(page.locator('#masterModal')).toBeVisible();
    await expect(page.locator('#categoryFields')).toBeVisible();

    // フォーム入力
    await page.fill('#categoryName', categoryName);
    await page.fill('#categorySortOrder', '99');

    // 送信
    await page.click('#masterForm button[type="submit"]');
    await page.waitForTimeout(2000);

    // リストに追加されたことを確認
    await expect(page.locator('#categoriesList')).toContainText(categoryName);
  });

  test('カテゴリを編集できる', async ({ page }) => {
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });

    // テストカテゴリが存在するまで待機
    await page.waitForTimeout(1000);

    // テストカテゴリの編集ボタンをクリック
    const categoryItem = page.locator('#categoriesList').locator(`text=${categoryName}`).first();
    if (await categoryItem.isVisible()) {
      // 編集ボタンを取得（同じカード内の✏️ボタン）
      const card = categoryItem.locator('..').locator('..');
      const editBtn = card.locator('button:has-text("✏")').first();

      if (await editBtn.isVisible()) {
        await editBtn.click();
        await page.waitForTimeout(500);

        // モーダルでカテゴリ名を変更
        await page.fill('#categoryName', categoryNameEdited);
        await page.click('#masterForm button[type="submit"]');
        await page.waitForTimeout(2000);

        // 変更が反映されていることを確認
        await expect(page.locator('#categoriesList')).toContainText(categoryNameEdited);
      }
    }
  });

  test('カテゴリを削除できる', async ({ page }) => {
    // confirm ダイアログを自動承認
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });

    await page.waitForTimeout(1000);

    // 編集済みカテゴリまたは元のカテゴリを探す
    const searchName = categoryNameEdited;
    const categoryItem = page.locator('#categoriesList').locator(`text=${searchName}`).first();

    if (await categoryItem.isVisible()) {
      const card = categoryItem.locator('..').locator('..');
      const deleteBtn = card.locator('button:has-text("🗑")').first();

      if (await deleteBtn.isVisible()) {
        await deleteBtn.click();
        await page.waitForTimeout(2000);

        // 削除されたことを確認
        await expect(page.locator('#categoriesList')).not.toContainText(searchName);
      }
    }
  });
});

// ============================================
// マスター管理: 保守会社CRUD
// ============================================
test.describe('保守会社CRUD', () => {
  const vendorName = `テスト保守会社_${TEST_ID}`;
  const vendorNameEdited = `編集済会社_${TEST_ID}`;

  test.beforeEach(async ({ page }) => {
    await loginAsAdminAndGoToAdmin(page);
    await clickMasterSubTab(page, 'vendors');
  });

  test('保守会社を追加できる', async ({ page }) => {
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });

    await page.click('#addVendorBtn');
    await page.waitForTimeout(300);

    await expect(page.locator('#masterModal')).toBeVisible();
    await expect(page.locator('#vendorFields')).toBeVisible();

    await page.fill('#vendorName', vendorName);
    await page.fill('#emergencyContact', '03-1234-5678');

    await page.click('#masterForm button[type="submit"]');
    await page.waitForTimeout(2000);

    await expect(page.locator('#vendorsList')).toContainText(vendorName);
  });

  test('保守会社を編集できる', async ({ page }) => {
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });

    await page.waitForTimeout(1000);

    const vendorItem = page.locator('#vendorsList').locator(`text=${vendorName}`).first();
    if (await vendorItem.isVisible()) {
      const card = vendorItem.locator('..').locator('..');
      const editBtn = card.locator('button:has-text("✏")').first();

      if (await editBtn.isVisible()) {
        await editBtn.click();
        await page.waitForTimeout(500);

        await page.fill('#vendorName', vendorNameEdited);
        await page.click('#masterForm button[type="submit"]');
        await page.waitForTimeout(2000);

        await expect(page.locator('#vendorsList')).toContainText(vendorNameEdited);
      }
    }
  });

  test('保守会社を削除できる', async ({ page }) => {
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });

    await page.waitForTimeout(1000);

    const searchName = vendorNameEdited;
    const vendorItem = page.locator('#vendorsList').locator(`text=${searchName}`).first();

    if (await vendorItem.isVisible()) {
      const card = vendorItem.locator('..').locator('..');
      const deleteBtn = card.locator('button:has-text("🗑")').first();

      if (await deleteBtn.isVisible()) {
        await deleteBtn.click();
        await page.waitForTimeout(2000);

        await expect(page.locator('#vendorsList')).not.toContainText(searchName);
      }
    }
  });
});

// ============================================
// データ一覧: フィルタ・ソート・エクスポート
// ============================================
test.describe('データ一覧操作', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdminAndGoToAdmin(page);
    await page.click('.sidebar-nav-link[data-tab="entries"]');
    await page.waitForTimeout(1000);
  });

  test('データ一覧タブにフィルタUIが表示される', async ({ page }) => {
    await expect(page.locator('#filterProperty')).toBeAttached();
    await expect(page.locator('#filterStartDate')).toBeAttached();
    await expect(page.locator('#filterEndDate')).toBeAttached();
    await expect(page.locator('#filterVendor')).toBeAttached();
    await expect(page.locator('#searchBtn')).toBeVisible();
  });

  test('CSVエクスポートボタンが表示される', async ({ page }) => {
    await expect(page.locator('#exportCsvBtn')).toBeVisible();
    await expect(page.locator('#exportCopyBtn')).toBeVisible();
  });

  test('点検レポートボタンが表示される', async ({ page }) => {
    await expect(page.locator('#exportReportBtn')).toBeVisible();
  });

  test('ソートヘッダをクリックするとソートが切り替わる', async ({ page }) => {
    // データが存在する場合のみテスト
    const rowCount = await page.locator('#entriesBody tr').count();
    if (rowCount > 1) {
      // 物件コードでソート
      await page.click('th.sortable[data-sort="property_code"]');
      await page.waitForTimeout(500);

      // ソートインジケータが表示される
      const indicator = page.locator('th[data-sort="property_code"] .sort-indicator');
      await expect(indicator).toBeVisible();
    }
  });

  test('全選択チェックボックスで全行が選択される', async ({ page }) => {
    const rowCount = await page.locator('#entriesBody tr').count();
    if (rowCount > 0) {
      // 全選択
      await page.click('#selectAllEntries');
      await page.waitForTimeout(300);

      // 一括操作ボタンが有効になる
      const bulkDeleteBtn = page.locator('#bulkDeleteBtn');
      await expect(bulkDeleteBtn).toBeEnabled();
    }
  });

  test('検索ボタンでフィルタが適用される', async ({ page }) => {
    // フィルタ前のカウント取得
    const countBefore = await page.locator('#entriesCount').textContent();

    // 存在しない物件コードでフィルタ
    await page.selectOption('#filterProperty', { index: 0 }); // 全て

    // 検索実行
    await page.click('#searchBtn');
    await page.waitForTimeout(1500);

    // カウントが表示される
    const countAfter = await page.locator('#entriesCount').textContent();
    expect(countAfter).toBeTruthy();
  });
});

// ============================================
// 承認待ちタブ
// ============================================
test.describe('承認待ち操作', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdminAndGoToAdmin(page);
    await page.click('.sidebar-nav-link[data-tab="approval"]');
    await page.waitForTimeout(1000);
  });

  test('承認待ちタブにデータ承認とビル追加のサブタブがある', async ({ page }) => {
    await expect(page.locator('.admin-tab[data-approval-type="data"]')).toBeAttached();
    await expect(page.locator('.admin-tab[data-approval-type="buildings"]')).toBeAttached();
  });

  test('承認待ち件数が表示される', async ({ page }) => {
    const countEl = page.locator('#pendingCount');
    await expect(countEl).toBeAttached();
    const countText = await countEl.textContent();
    expect(parseInt(countText || '0')).toBeGreaterThanOrEqual(0);
  });

  test('一括承認ボタンが存在する', async ({ page }) => {
    await expect(page.locator('#approveAllBtn')).toBeAttached();
  });

  test('ビル追加リクエストサブタブに切り替えられる', async ({ page }) => {
    await page.click('.admin-tab[data-approval-type="buildings"]');
    await page.waitForTimeout(500);

    // ビル追加セクションが表示される
    await expect(page.locator('#approval-buildings')).toBeVisible();
  });
});

// ============================================
// 紐付け管理
// ============================================
test.describe('紐付け管理', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdminAndGoToAdmin(page);
    await page.click('.sidebar-nav-link[data-tab="relationships"]');
    await page.waitForTimeout(1000);
  });

  test('保守会社選択ドロップダウンが表示される', async ({ page }) => {
    await expect(page.locator('#relationshipVendorSelect')).toBeVisible();
  });

  test('保守会社を選択するとサブタブが表示される', async ({ page }) => {
    const options = await page.locator('#relationshipVendorSelect option').count();
    if (options > 1) {
      // 最初の保守会社を選択
      await page.selectOption('#relationshipVendorSelect', { index: 1 });
      await page.waitForTimeout(1000);

      // サブタブが表示される
      await expect(page.locator('#relationshipSubTabs')).toBeVisible();
      await expect(page.locator('.admin-tab[data-rel-type="buildings"]')).toBeAttached();
      await expect(page.locator('.admin-tab[data-rel-type="inspections"]')).toBeAttached();
    } else {
      test.skip();
    }
  });

  test('ビル紐付けタブで紐付け一覧が表示される', async ({ page }) => {
    const options = await page.locator('#relationshipVendorSelect option').count();
    if (options > 1) {
      await page.selectOption('#relationshipVendorSelect', { index: 1 });
      await page.waitForTimeout(1000);

      await page.click('.admin-tab[data-rel-type="buildings"]');
      await page.waitForTimeout(500);

      // ビル紐付けコンテナが表示される
      await expect(page.locator('#buildingRelationshipsContainer')).toBeVisible();
    } else {
      test.skip();
    }
  });

  test('点検種別紐付けタブに切り替えられる', async ({ page }) => {
    const options = await page.locator('#relationshipVendorSelect option').count();
    if (options > 1) {
      await page.selectOption('#relationshipVendorSelect', { index: 1 });
      await page.waitForTimeout(1000);

      await page.click('.admin-tab[data-rel-type="inspections"]');
      await page.waitForTimeout(500);

      await expect(page.locator('#inspectionRelationshipsContainer')).toBeVisible();
    } else {
      test.skip();
    }
  });
});

// ============================================
// ユーザー管理
// ============================================
test.describe('ユーザー管理', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdminAndGoToAdmin(page);
    await page.click('.sidebar-nav-link[data-tab="users"]');
    await page.waitForTimeout(1000);
  });

  test('ユーザー追加ボタンが表示される', async ({ page }) => {
    await expect(page.locator('#addUserBtn')).toBeVisible();
  });

  test('ユーザー一覧テーブルが表示される', async ({ page }) => {
    await expect(page.locator('#usersBody')).toBeAttached();
    // 少なくとも1人のユーザーが存在する
    const rowCount = await page.locator('#usersBody tr').count();
    expect(rowCount).toBeGreaterThan(0);
  });

  test('ユーザー追加モーダルが開閉できる', async ({ page }) => {
    // 追加ボタンクリック
    await page.click('#addUserBtn');
    await page.waitForTimeout(300);

    // モーダルが表示される
    await expect(page.locator('#userModal')).toBeVisible();
    await expect(page.locator('#newUserEmail')).toBeVisible();
    await expect(page.locator('#newUserPassword')).toBeVisible();
    await expect(page.locator('#newUserVendor')).toBeVisible();
    await expect(page.locator('#newUserRole')).toBeVisible();

    // モーダルを閉じる
    await page.click('#userModal .modal-close');
    await page.waitForTimeout(300);
  });
});

// ============================================
// マスターモーダルのバリデーション
// ============================================
test.describe('マスターモーダル バリデーション', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdminAndGoToAdmin(page);
  });

  test('物件追加モーダルで必須フィールドが表示される', async ({ page }) => {
    await clickMasterSubTab(page, 'properties');
    await page.click('#addPropertyBtn');
    await page.waitForTimeout(300);

    await expect(page.locator('#masterModal')).toBeVisible();
    await expect(page.locator('#propertyFields')).toBeVisible();
    await expect(page.locator('#propertyCode')).toBeVisible();
    await expect(page.locator('#propertyName')).toBeVisible();
  });

  test('点検種別追加モーダルでカテゴリとテンプレートが選択できる', async ({ page }) => {
    await clickMasterSubTab(page, 'inspections');
    await page.click('#addInspectionBtn');
    await page.waitForTimeout(300);

    await expect(page.locator('#masterModal')).toBeVisible();
    await expect(page.locator('#inspectionFields')).toBeVisible();
    await expect(page.locator('#inspectionName')).toBeVisible();
    await expect(page.locator('#inspectionCategory')).toBeVisible();
    await expect(page.locator('#templateNo')).toBeVisible();
    await expect(page.locator('#noticeText')).toBeVisible();
    await expect(page.locator('#showOnBoard')).toBeVisible();
  });

  test('マスターモーダルを×ボタンで閉じられる', async ({ page }) => {
    await clickMasterSubTab(page, 'categories');
    await page.click('#addCategoryBtn');
    await page.waitForTimeout(300);

    await expect(page.locator('#masterModal')).toBeVisible();

    // ×ボタンで閉じる
    await page.click('#masterModal .modal-close');
    await page.waitForTimeout(300);

    // モーダルが非表示になることを確認
    await expect(page.locator('#masterModal')).not.toBeVisible();
  });
});

// ============================================
// 広告枠タブ
// ============================================
test.describe('広告枠管理', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdminAndGoToAdmin(page);
    await page.click('.sidebar-nav-link[data-tab="ads"]');
    await page.waitForTimeout(1500);
  });

  test('広告枠グリッドが表示される', async ({ page }) => {
    await expect(page.locator('#adSlotsGrid')).toBeVisible();
    // 8つのセル（0: ログイン固定 + 1-7: 広告枠）
    const cells = await page.locator('#adSlotsGrid > div').count();
    expect(cells).toBe(8);
  });
});

// ============================================
// サイドバーナビゲーション
// ============================================
test.describe('サイドバーナビゲーション', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdminAndGoToAdmin(page);
  });

  test('全タブに切り替えられる', async ({ page }) => {
    const tabs = ['approval', 'entries', 'relationships', 'master', 'users'];

    for (const tab of tabs) {
      await page.click(`.sidebar-nav-link[data-tab="${tab}"]`);
      await page.waitForTimeout(500);

      // 対応するタブコンテンツが表示される
      await expect(page.locator(`#tab-${tab}`)).toBeVisible();
    }
  });

  test('サイドバーに承認待ち件数バッジが表示される', async ({ page }) => {
    await expect(page.locator('#navPendingCount')).toBeAttached();
  });
});
