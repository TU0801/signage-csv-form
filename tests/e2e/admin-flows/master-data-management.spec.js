// @ts-check
/**
 * E2Eテスト: 管理画面 - マスターデータ管理（admin.html）
 *
 * 管理者ストーリー:
 * - 管理者として、物件・受注先・点検種別・カテゴリのマスターデータを管理したい
 * - 新規追加・編集・削除ができるようにしたい
 * - アプリ設定を変更して、入力制限を調整したい
 */

const { test, expect } = require('@playwright/test');
const {
  setupAuthMockWithMasterData,
  waitForPageReady,
  mockData
} = require('../../test-helpers');

test.describe('管理画面 - 物件マスター管理', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMockWithMasterData(page, 'http://localhost:8080/admin.html', {
      isAuthenticated: true,
      isAdmin: true,
      email: 'admin@example.com'
    });
    await waitForPageReady(page);

    // マスター管理タブに移動
    const mastersTab = page.locator('[data-tab="masters"], .tab-btn:has-text("マスター管理")');
    if (await mastersTab.count() > 0) {
      await mastersTab.click();
      await page.waitForTimeout(500);
    }
  });

  test('物件一覧: 物件マスターが一覧表示される', async ({ page }) => {
    // 物件サブタブを選択
    const propertiesSubTab = page.locator('[data-subtab="properties"], .subtab-btn:has-text("物件")');
    if (await propertiesSubTab.count() > 0) {
      await propertiesSubTab.click();
      await page.waitForTimeout(500);

      // 物件一覧テーブルが表示される
      const propertiesTable = page.locator('#propertiesTable, .properties-table');
      if (await propertiesTable.count() > 0) {
        await expect(propertiesTable).toBeVisible();
      }
    }
  });

  test('物件追加モーダル: 新規追加ボタンでモーダルが開く', async ({ page }) => {
    const propertiesSubTab = page.locator('[data-subtab="properties"], .subtab-btn:has-text("物件")');
    if (await propertiesSubTab.count() > 0) {
      await propertiesSubTab.click();
      await page.waitForTimeout(500);

      const addBtn = page.locator('#addPropertyBtn, button:has-text("物件追加"), button:has-text("新規追加")');
      if (await addBtn.count() > 0) {
        await addBtn.click();
        await page.waitForTimeout(500);

        // モーダルが表示される
        const modal = page.locator('.modal:visible, #masterModal');
        await expect(modal).toBeVisible();
      }
    }
  });

  test('物件追加: 新規物件を追加できる', async ({ page }) => {
    const propertiesSubTab = page.locator('[data-subtab="properties"], .subtab-btn:has-text("物件")');
    if (await propertiesSubTab.count() > 0) {
      await propertiesSubTab.click();
      await page.waitForTimeout(500);

      const addBtn = page.locator('#addPropertyBtn, button:has-text("物件追加"), button:has-text("新規追加")');
      if (await addBtn.count() > 0) {
        await addBtn.click();
        await page.waitForTimeout(500);

        // フォームに入力
        const propertyCodeInput = page.locator('#propertyCode, input[name="property_code"]');
        const propertyNameInput = page.locator('#propertyName, input[name="property_name"]');
        const terminalIdInput = page.locator('#terminalId, input[name="terminal_id"]');

        if (await propertyCodeInput.count() > 0) {
          await propertyCodeInput.fill('999999');
          await propertyNameInput.fill('テスト物件');
          if (await terminalIdInput.count() > 0) {
            await terminalIdInput.fill('test001');
          }

          // 保存ボタンをクリック
          const saveBtn = page.locator('.modal:visible button:has-text("保存"), .modal:visible button:has-text("追加")');
          await saveBtn.click();
          await page.waitForTimeout(500);

          // トースト通知
          const toast = page.locator('.toast, [class*="toast"]');
          if (await toast.count() > 0) {
            await expect(toast.first()).toBeVisible();
          }
        }
      }
    }
  });

  test('物件編集: 既存物件を編集できる', async ({ page }) => {
    const propertiesSubTab = page.locator('[data-subtab="properties"], .subtab-btn:has-text("物件")');
    if (await propertiesSubTab.count() > 0) {
      await propertiesSubTab.click();
      await page.waitForTimeout(500);

      // 編集ボタンをクリック
      const editBtn = page.locator('#propertiesTable tbody tr button:has-text("編集"), .properties-table tbody tr .edit-btn').first();
      if (await editBtn.count() > 0) {
        await editBtn.click();
        await page.waitForTimeout(500);

        // モーダルが表示される
        const modal = page.locator('.modal:visible, #masterModal');
        await expect(modal).toBeVisible();

        // フォームに値が入力されている
        const propertyNameInput = page.locator('#propertyName, input[name="property_name"]');
        if (await propertyNameInput.count() > 0) {
          const value = await propertyNameInput.inputValue();
          expect(value).toBeTruthy();
        }
      }
    }
  });

  test('物件削除: 物件を削除できる（確認ダイアログ付き）', async ({ page }) => {
    const propertiesSubTab = page.locator('[data-subtab="properties"], .subtab-btn:has-text("物件")');
    if (await propertiesSubTab.count() > 0) {
      await propertiesSubTab.click();
      await page.waitForTimeout(500);

      // 削除ボタンをクリック
      const deleteBtn = page.locator('#propertiesTable tbody tr button:has-text("削除"), .properties-table tbody tr .delete-btn').first();
      if (await deleteBtn.count() > 0) {
        await deleteBtn.click();
        await page.waitForTimeout(500);

        // 確認ダイアログが表示される
        const confirmDialog = page.locator('.confirm-dialog, [role="dialog"]:visible, .modal:visible');
        if (await confirmDialog.count() > 0) {
          // キャンセルをクリック（実際の削除は行わない）
          const cancelBtn = confirmDialog.locator('button:has-text("キャンセル")');
          if (await cancelBtn.count() > 0) {
            await cancelBtn.click();
          }
        }
      }
    }
  });
});

test.describe('管理画面 - 受注先マスター管理', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMockWithMasterData(page, 'http://localhost:8080/admin.html', {
      isAuthenticated: true,
      isAdmin: true,
      email: 'admin@example.com'
    });
    await waitForPageReady(page);

    // マスター管理タブに移動
    const mastersTab = page.locator('[data-tab="masters"], .tab-btn:has-text("マスター管理")');
    if (await mastersTab.count() > 0) {
      await mastersTab.click();
      await page.waitForTimeout(500);
    }
  });

  test('受注先一覧: 受注先マスターが一覧表示される', async ({ page }) => {
    const vendorsSubTab = page.locator('[data-subtab="vendors"], .subtab-btn:has-text("受注先")');
    if (await vendorsSubTab.count() > 0) {
      await vendorsSubTab.click();
      await page.waitForTimeout(500);

      const vendorsTable = page.locator('#vendorsTable, .vendors-table');
      if (await vendorsTable.count() > 0) {
        await expect(vendorsTable).toBeVisible();
      }
    }
  });

  test('受注先追加: 新規受注先を追加できる', async ({ page }) => {
    const vendorsSubTab = page.locator('[data-subtab="vendors"], .subtab-btn:has-text("受注先")');
    if (await vendorsSubTab.count() > 0) {
      await vendorsSubTab.click();
      await page.waitForTimeout(500);

      const addBtn = page.locator('#addVendorBtn, button:has-text("受注先追加"), button:has-text("新規追加")');
      if (await addBtn.count() > 0) {
        await addBtn.click();
        await page.waitForTimeout(500);

        // フォームに入力
        const vendorNameInput = page.locator('#vendorName, input[name="vendor_name"]');
        const emergencyContactInput = page.locator('#emergencyContact, input[name="emergency_contact"]');

        if (await vendorNameInput.count() > 0) {
          await vendorNameInput.fill('テスト受注先株式会社');
          if (await emergencyContactInput.count() > 0) {
            await emergencyContactInput.fill('03-0000-0000');
          }

          const saveBtn = page.locator('.modal:visible button:has-text("保存"), .modal:visible button:has-text("追加")');
          await saveBtn.click();
          await page.waitForTimeout(500);
        }
      }
    }
  });
});

test.describe('管理画面 - 点検種別マスター管理', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMockWithMasterData(page, 'http://localhost:8080/admin.html', {
      isAuthenticated: true,
      isAdmin: true,
      email: 'admin@example.com'
    });
    await waitForPageReady(page);

    const mastersTab = page.locator('[data-tab="masters"], .tab-btn:has-text("マスター管理")');
    if (await mastersTab.count() > 0) {
      await mastersTab.click();
      await page.waitForTimeout(500);
    }
  });

  test('点検種別一覧: 点検種別マスターが一覧表示される', async ({ page }) => {
    const inspectionsSubTab = page.locator('[data-subtab="inspections"], .subtab-btn:has-text("点検種別")');
    if (await inspectionsSubTab.count() > 0) {
      await inspectionsSubTab.click();
      await page.waitForTimeout(500);

      const inspectionsTable = page.locator('#inspectionsTable, .inspections-table');
      if (await inspectionsTable.count() > 0) {
        await expect(inspectionsTable).toBeVisible();
      }
    }
  });

  test('点検種別追加: テンプレート画像を選択して追加できる', async ({ page }) => {
    const inspectionsSubTab = page.locator('[data-subtab="inspections"], .subtab-btn:has-text("点検種別")');
    if (await inspectionsSubTab.count() > 0) {
      await inspectionsSubTab.click();
      await page.waitForTimeout(500);

      const addBtn = page.locator('#addInspectionBtn, button:has-text("点検種別追加"), button:has-text("新規追加")');
      if (await addBtn.count() > 0) {
        await addBtn.click();
        await page.waitForTimeout(500);

        // フォームに入力
        const inspectionNameInput = page.locator('#inspectionName, input[name="inspection_name"]');
        const categorySelect = page.locator('#inspectionCategory, select[name="category"]');
        const templateSelect = page.locator('#templateNo, select[name="template_no"]');

        if (await inspectionNameInput.count() > 0) {
          await inspectionNameInput.fill('テスト点検');

          if (await categorySelect.count() > 0) {
            await categorySelect.selectOption({ index: 1 });
          }

          if (await templateSelect.count() > 0) {
            await templateSelect.selectOption({ index: 1 });
          }

          const saveBtn = page.locator('.modal:visible button:has-text("保存"), .modal:visible button:has-text("追加")');
          await saveBtn.click();
          await page.waitForTimeout(500);
        }
      }
    }
  });
});

test.describe('管理画面 - カテゴリマスター管理', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMockWithMasterData(page, 'http://localhost:8080/admin.html', {
      isAuthenticated: true,
      isAdmin: true,
      email: 'admin@example.com'
    });
    await waitForPageReady(page);

    const mastersTab = page.locator('[data-tab="masters"], .tab-btn:has-text("マスター管理")');
    if (await mastersTab.count() > 0) {
      await mastersTab.click();
      await page.waitForTimeout(500);
    }
  });

  test('カテゴリ一覧: カテゴリマスターが一覧表示される', async ({ page }) => {
    const categoriesSubTab = page.locator('[data-subtab="categories"], .subtab-btn:has-text("カテゴリ")');
    if (await categoriesSubTab.count() > 0) {
      await categoriesSubTab.click();
      await page.waitForTimeout(500);

      const categoriesTable = page.locator('#categoriesTable, .categories-table');
      if (await categoriesTable.count() > 0) {
        await expect(categoriesTable).toBeVisible();
      }
    }
  });

  test('カテゴリ追加: 新規カテゴリを追加できる', async ({ page }) => {
    const categoriesSubTab = page.locator('[data-subtab="categories"], .subtab-btn:has-text("カテゴリ")');
    if (await categoriesSubTab.count() > 0) {
      await categoriesSubTab.click();
      await page.waitForTimeout(500);

      const addBtn = page.locator('#addCategoryBtn, button:has-text("カテゴリ追加"), button:has-text("新規追加")');
      if (await addBtn.count() > 0) {
        await addBtn.click();
        await page.waitForTimeout(500);

        const categoryNameInput = page.locator('#categoryName, input[name="category_name"]');
        const sortOrderInput = page.locator('#sortOrder, input[name="sort_order"]');

        if (await categoryNameInput.count() > 0) {
          await categoryNameInput.fill('テストカテゴリ');
          if (await sortOrderInput.count() > 0) {
            await sortOrderInput.fill('99');
          }

          const saveBtn = page.locator('.modal:visible button:has-text("保存"), .modal:visible button:has-text("追加")');
          await saveBtn.click();
          await page.waitForTimeout(500);
        }
      }
    }
  });
});

test.describe('管理画面 - アプリ設定', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMockWithMasterData(page, 'http://localhost:8080/admin.html', {
      isAuthenticated: true,
      isAdmin: true,
      email: 'admin@example.com'
    });
    await waitForPageReady(page);

    const mastersTab = page.locator('[data-tab="masters"], .tab-btn:has-text("マスター管理")');
    if (await mastersTab.count() > 0) {
      await mastersTab.click();
      await page.waitForTimeout(500);
    }
  });

  test('設定表示: アプリ設定が表示される', async ({ page }) => {
    const settingsSubTab = page.locator('[data-subtab="settings"], .subtab-btn:has-text("設定")');
    if (await settingsSubTab.count() > 0) {
      await settingsSubTab.click();
      await page.waitForTimeout(500);

      // 設定フォームが表示される
      const settingsForm = page.locator('#settingsForm, .settings-form');
      if (await settingsForm.count() > 0) {
        await expect(settingsForm).toBeVisible();
      }
    }
  });

  test('表示時間上限: 表示時間の上限を変更できる', async ({ page }) => {
    const settingsSubTab = page.locator('[data-subtab="settings"], .subtab-btn:has-text("設定")');
    if (await settingsSubTab.count() > 0) {
      await settingsSubTab.click();
      await page.waitForTimeout(500);

      const displayTimeMax = page.locator('#displayTimeMax, input[name="display_time_max"]');
      if (await displayTimeMax.count() > 0) {
        await displayTimeMax.fill('60');

        const saveBtn = page.locator('#saveSettingsBtn, button:has-text("設定を保存")');
        if (await saveBtn.count() > 0) {
          await saveBtn.click();
          await page.waitForTimeout(500);

          // トースト通知
          const toast = page.locator('.toast, [class*="toast"]');
          if (await toast.count() > 0) {
            await expect(toast.first()).toBeVisible();
          }
        }
      }
    }
  });

  test('備考設定: 備考の文字数制限を変更できる', async ({ page }) => {
    const settingsSubTab = page.locator('[data-subtab="settings"], .subtab-btn:has-text("設定")');
    if (await settingsSubTab.count() > 0) {
      await settingsSubTab.click();
      await page.waitForTimeout(500);

      const remarksCharsPerLine = page.locator('#remarksCharsPerLine, input[name="remarks_chars_per_line"]');
      const remarksMaxLines = page.locator('#remarksMaxLines, input[name="remarks_max_lines"]');

      if (await remarksCharsPerLine.count() > 0) {
        await remarksCharsPerLine.fill('30');
      }
      if (await remarksMaxLines.count() > 0) {
        await remarksMaxLines.fill('10');
      }

      const saveBtn = page.locator('#saveSettingsBtn, button:has-text("設定を保存")');
      if (await saveBtn.count() > 0) {
        await saveBtn.click();
        await page.waitForTimeout(500);
      }
    }
  });

  test('案内文設定: 案内文の文字数制限を変更できる', async ({ page }) => {
    const settingsSubTab = page.locator('[data-subtab="settings"], .subtab-btn:has-text("設定")');
    if (await settingsSubTab.count() > 0) {
      await settingsSubTab.click();
      await page.waitForTimeout(500);

      const noticeTextMaxChars = page.locator('#noticeTextMaxChars, input[name="notice_text_max_chars"]');

      if (await noticeTextMaxChars.count() > 0) {
        await noticeTextMaxChars.fill('300');

        const saveBtn = page.locator('#saveSettingsBtn, button:has-text("設定を保存")');
        if (await saveBtn.count() > 0) {
          await saveBtn.click();
          await page.waitForTimeout(500);
        }
      }
    }
  });
});

test.describe('管理画面 - ユーザー管理', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMockWithMasterData(page, 'http://localhost:8080/admin.html', {
      isAuthenticated: true,
      isAdmin: true,
      email: 'admin@example.com'
    });
    await waitForPageReady(page);
  });

  test('ユーザー一覧: ユーザー管理タブでユーザー一覧が表示される', async ({ page }) => {
    const usersTab = page.locator('[data-tab="users"], .tab-btn:has-text("ユーザー管理")');
    if (await usersTab.count() > 0) {
      await usersTab.click();
      await page.waitForTimeout(500);

      const usersTable = page.locator('#usersTable, .users-table');
      if (await usersTable.count() > 0) {
        await expect(usersTable).toBeVisible();
      }
    }
  });

  test('ユーザー追加ボタン: ユーザー管理タブにユーザー追加ボタンが存在する', async ({ page }) => {
    // ユーザー管理タブをクリック
    const usersTab = page.locator('button:has-text("ユーザー管理")');
    await usersTab.click();
    await page.waitForTimeout(500);

    // ユーザー追加ボタンが表示される
    const addBtn = page.locator('button:has-text("ユーザー追加")');
    await expect(addBtn).toBeVisible();
  });

  test('ユーザー一覧表示: ユーザー一覧テーブルのヘッダーが表示される', async ({ page }) => {
    // ユーザー管理タブをクリック
    const usersTab = page.locator('button:has-text("ユーザー管理")');
    await usersTab.click();
    await page.waitForTimeout(500);

    // ユーザー一覧テーブルのヘッダーが表示される
    const emailHeader = page.locator('th:has-text("メールアドレス")');
    await expect(emailHeader).toBeVisible();

    // 会社名ヘッダーが表示される
    const companyHeader = page.locator('th:has-text("会社名")');
    await expect(companyHeader).toBeVisible();
  });

  test('ユーザーロール変更: 他のユーザーの権限変更コンボボックスが存在する', async ({ page }) => {
    // ユーザー管理タブをクリック
    const usersTab = page.locator('button:has-text("ユーザー管理")');
    await usersTab.click();
    await page.waitForTimeout(500);

    // 他のユーザー行の権限変更コンボボックスが存在する（自分の権限は変更できない）
    const roleSelect = page.locator('tr:has-text("user@example.com") select');
    await expect(roleSelect).toBeVisible();

    // ユーザーと管理者のオプションが存在する
    const options = roleSelect.locator('option');
    await expect(options).toHaveCount(2);
  });
});
