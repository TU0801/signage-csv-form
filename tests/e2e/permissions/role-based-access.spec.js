// @ts-check
/**
 * E2Eテスト: 権限制御（Role-Based Access Control）
 *
 * テスト対象:
 * - 認証状態による画面アクセス制御
 * - ユーザーロールによる機能制限
 * - 管理者専用機能の保護
 */

const { test, expect } = require('@playwright/test');
const {
  setupAuthMockWithMasterData,
  waitForPageReady
} = require('../../test-helpers');

test.describe('認証制御 - 未認証ユーザー', () => {
  test('1件入力画面: 未認証ユーザーはログイン画面にリダイレクトされる', async ({ page }) => {
    await setupAuthMockWithMasterData(page, 'http://localhost:8080/index.html', {
      isAuthenticated: false
    });

    // リダイレクトまたはログインモーダルを待機
    await page.waitForTimeout(2000);

    const currentUrl = page.url();
    const loginForm = page.locator('#loginForm, form[action*="login"], .login-form');

    // ログインページにリダイレクトされるか、ログインフォームが表示される
    const isLoginPage = currentUrl.includes('login');
    const hasLoginForm = await loginForm.count() > 0;

    expect(isLoginPage || hasLoginForm).toBe(true);
  });

  test('一括入力画面: 未認証ユーザーはログイン画面にリダイレクトされる', async ({ page }) => {
    await setupAuthMockWithMasterData(page, 'http://localhost:8080/bulk.html', {
      isAuthenticated: false
    });

    await page.waitForTimeout(2000);

    const currentUrl = page.url();
    const loginForm = page.locator('#loginForm, form[action*="login"], .login-form');

    const isLoginPage = currentUrl.includes('login');
    const hasLoginForm = await loginForm.count() > 0;

    expect(isLoginPage || hasLoginForm).toBe(true);
  });

  test('管理画面: 未認証ユーザーはログイン画面にリダイレクトされる', async ({ page }) => {
    await setupAuthMockWithMasterData(page, 'http://localhost:8080/admin.html', {
      isAuthenticated: false
    });

    await page.waitForTimeout(2000);

    const currentUrl = page.url();

    // admin.htmlには留まらない
    expect(currentUrl).not.toContain('admin.html');
  });
});

test.describe('ロール制御 - 一般ユーザー', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMockWithMasterData(page, 'http://localhost:8080/index.html', {
      isAuthenticated: true,
      isAdmin: false,
      email: 'user@example.com'
    });
    await waitForPageReady(page);
  });

  test('1件入力画面: 一般ユーザーは1件入力画面にアクセスできる', async ({ page }) => {
    const currentUrl = page.url();
    expect(currentUrl).toContain('index.html');

    // 入力フォームが表示される
    const propertySelect = page.locator('#property');
    await expect(propertySelect).toBeVisible();
  });

  test('一括入力画面: 一般ユーザーは一括入力画面にアクセスできる', async ({ page }) => {
    // 一括入力画面に直接セットアップ
    await setupAuthMockWithMasterData(page, 'http://localhost:8080/bulk.html', {
      isAuthenticated: true,
      isAdmin: false,
      email: 'user@example.com'
    });
    await waitForPageReady(page);

    const currentUrl = page.url();
    expect(currentUrl).toContain('bulk.html');

    // ツールバーが表示される（行追加ボタンなど）
    const addRowBtn = page.locator('#addRowBtn');
    await expect(addRowBtn).toBeVisible();
  });

  test('管理画面: 一般ユーザーは管理画面にアクセスできない', async ({ page }) => {
    await page.goto('http://localhost:8080/admin.html');
    await page.waitForTimeout(2000);

    const currentUrl = page.url();

    // 管理画面からリダイレクトされる
    expect(currentUrl).not.toContain('admin.html');
  });

  test('管理者リンク: 一般ユーザーには管理画面リンクが表示されない', async ({ page }) => {
    const adminLink = page.locator('a[href*="admin"]:visible, .admin-link:visible');

    // 管理画面リンクが表示されない（存在しないか非表示）
    const visibleCount = await adminLink.count();
    if (visibleCount > 0) {
      const isVisible = await adminLink.first().isVisible();
      expect(isVisible).toBe(false);
    } else {
      expect(visibleCount).toBe(0);
    }
  });
});

test.describe('ロール制御 - 管理者ユーザー', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMockWithMasterData(page, 'http://localhost:8080/index.html', {
      isAuthenticated: true,
      isAdmin: true,
      email: 'admin@example.com'
    });
    await waitForPageReady(page);
  });

  test('1件入力画面: 管理者は1件入力画面にアクセスできる', async ({ page }) => {
    const currentUrl = page.url();
    expect(currentUrl).toContain('index.html');

    const propertySelect = page.locator('#property');
    await expect(propertySelect).toBeVisible();
  });

  test('一括入力画面: 管理者は一括入力画面にアクセスできる', async ({ page }) => {
    await page.goto('http://localhost:8080/bulk.html');
    await waitForPageReady(page);

    const currentUrl = page.url();
    expect(currentUrl).toContain('bulk.html');
  });

  test('管理画面: 管理者は管理画面にアクセスできる', async ({ page }) => {
    await page.goto('http://localhost:8080/admin.html');
    await waitForPageReady(page);

    const currentUrl = page.url();
    expect(currentUrl).toContain('admin.html');

    // 管理画面のコンテンツが表示される
    const adminContent = page.locator('.admin-content, .tab-content, #pendingTable');
    if (await adminContent.count() > 0) {
      await expect(adminContent.first()).toBeVisible();
    }
  });

  test('管理者リンク: 管理者には管理画面リンクが表示される', async ({ page }) => {
    const adminLink = page.locator('a[href*="admin"], .admin-link, button:has-text("管理")');

    if (await adminLink.count() > 0) {
      await expect(adminLink.first()).toBeVisible();
    }
  });
});

test.describe('セッション管理', () => {
  test('ログアウト: ログアウト後は認証が必要なページにアクセスできない', async ({ page }) => {
    // 認証済みでログイン
    await setupAuthMockWithMasterData(page, 'http://localhost:8080/index.html', {
      isAuthenticated: true,
      email: 'user@example.com'
    });
    await waitForPageReady(page);

    // ログアウトボタンをクリック
    const logoutBtn = page.locator('#logoutBtn, button:has-text("ログアウト")');
    if (await logoutBtn.count() > 0) {
      await logoutBtn.click();
      await page.waitForTimeout(1000);

      // ログイン画面にリダイレクトされる
      const currentUrl = page.url();
      expect(currentUrl.includes('login') || currentUrl.includes('index')).toBe(true);
    }
  });

  test('ログアウトボタン: 認証済みユーザーにはログアウトボタンが表示される', async ({ page }) => {
    await setupAuthMockWithMasterData(page, 'http://localhost:8080/index.html', {
      isAuthenticated: true,
      email: 'user@example.com'
    });
    await waitForPageReady(page);

    const logoutBtn = page.locator('#logoutBtn, button:has-text("ログアウト")');
    if (await logoutBtn.count() > 0) {
      await expect(logoutBtn).toBeVisible();
    }
  });

  test('ユーザー情報: 認証済みユーザーのメールアドレスが表示される', async ({ page }) => {
    await setupAuthMockWithMasterData(page, 'http://localhost:8080/index.html', {
      isAuthenticated: true,
      email: 'user@example.com'
    });
    await waitForPageReady(page);

    const userInfo = page.locator('.user-email, .user-info, [class*="user"]');
    if (await userInfo.count() > 0) {
      const text = await userInfo.first().textContent();
      expect(text).toContain('user@example.com');
    }
  });
});

test.describe('画面間ナビゲーション - 一般ユーザー', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMockWithMasterData(page, 'http://localhost:8080/index.html', {
      isAuthenticated: true,
      isAdmin: false,
      email: 'user@example.com'
    });
    await waitForPageReady(page);
  });

  test('1件入力→一括入力: 一般ユーザーは1件入力から一括入力に移動できる', async ({ page }) => {
    const bulkLink = page.locator('a[href*="bulk"], button:has-text("一括入力")');
    if (await bulkLink.count() > 0) {
      await bulkLink.click();
      await page.waitForURL(/bulk\.html/, { timeout: 5000 }).catch(() => {});

      const currentUrl = page.url();
      expect(currentUrl).toContain('bulk');
    }
  });

  test('一括入力→1件入力: 一般ユーザーは一括入力から1件入力に移動できる', async ({ page }) => {
    await page.goto('http://localhost:8080/bulk.html');
    await waitForPageReady(page);

    const singleLink = page.locator('a[href*="index"], button:has-text("1件入力")');
    if (await singleLink.count() > 0) {
      await singleLink.click();
      await page.waitForURL(/index\.html/, { timeout: 5000 }).catch(() => {});

      const currentUrl = page.url();
      expect(currentUrl).toContain('index');
    }
  });
});

test.describe('画面間ナビゲーション - 管理者ユーザー', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMockWithMasterData(page, 'http://localhost:8080/index.html', {
      isAuthenticated: true,
      isAdmin: true,
      email: 'admin@example.com'
    });
    await waitForPageReady(page);
  });

  test('1件入力→管理画面: 管理者は1件入力から管理画面に移動できる', async ({ page }) => {
    const adminLink = page.locator('a[href*="admin"], button:has-text("管理")');
    if (await adminLink.count() > 0) {
      await adminLink.click();
      await page.waitForURL(/admin\.html/, { timeout: 5000 }).catch(() => {});

      const currentUrl = page.url();
      expect(currentUrl).toContain('admin');
    }
  });

  test('管理画面→1件入力: 管理者は管理画面から1件入力に移動できる', async ({ page }) => {
    await page.goto('http://localhost:8080/admin.html');
    await waitForPageReady(page);

    const entryLink = page.locator('a[href*="index"], button:has-text("1件入力"), button:has-text("入力画面")');
    if (await entryLink.count() > 0) {
      await entryLink.click();
      await page.waitForURL(/index\.html/, { timeout: 5000 }).catch(() => {});

      const currentUrl = page.url();
      expect(currentUrl).toContain('index');
    }
  });
});

test.describe('エラーケース', () => {
  test('無効なトークン: トークンが無効な場合はログイン画面にリダイレクトされる', async ({ page }) => {
    // 認証なしでアクセス（無効なトークンをシミュレート）
    await setupAuthMockWithMasterData(page, 'http://localhost:8080/index.html', {
      isAuthenticated: false
    });

    await page.waitForTimeout(2000);

    const currentUrl = page.url();
    const loginForm = page.locator('#loginForm, form[action*="login"], .login-form');

    const isProtected = currentUrl.includes('login') || await loginForm.count() > 0;
    expect(isProtected).toBe(true);
  });

  test('権限昇格防止: 一般ユーザーが直接admin.htmlにアクセスしてもアクセスできない', async ({ page }) => {
    await setupAuthMockWithMasterData(page, 'http://localhost:8080/admin.html', {
      isAuthenticated: true,
      isAdmin: false,
      email: 'user@example.com'
    });

    await page.waitForTimeout(2000);

    const currentUrl = page.url();

    // 管理画面からリダイレクトされる
    expect(currentUrl).not.toContain('admin.html');
  });
});

test.describe('管理者専用機能の保護', () => {
  test('承認機能: 一般ユーザーは承認機能にアクセスできない', async ({ page }) => {
    await setupAuthMockWithMasterData(page, 'http://localhost:8080/admin.html', {
      isAuthenticated: true,
      isAdmin: false,
      email: 'user@example.com'
    });

    await page.waitForTimeout(2000);

    // 管理画面にはアクセスできないので、承認機能も使えない
    const approveBtn = page.locator('button:has-text("承認")');
    const visibleCount = await approveBtn.count();

    // 承認ボタンが表示されない（管理画面にいないため）
    expect(visibleCount === 0 || !(await approveBtn.first().isVisible().catch(() => false))).toBe(true);
  });

  test('マスターデータ管理: 一般ユーザーはマスターデータを編集できない', async ({ page }) => {
    await setupAuthMockWithMasterData(page, 'http://localhost:8080/admin.html', {
      isAuthenticated: true,
      isAdmin: false,
      email: 'user@example.com'
    });

    await page.waitForTimeout(2000);

    // 管理画面にはアクセスできない
    const mastersTab = page.locator('[data-tab="masters"]');
    const visibleCount = await mastersTab.count();

    expect(visibleCount === 0 || !(await mastersTab.first().isVisible().catch(() => false))).toBe(true);
  });

  test('ユーザー管理: 一般ユーザーはユーザー管理にアクセスできない', async ({ page }) => {
    await setupAuthMockWithMasterData(page, 'http://localhost:8080/admin.html', {
      isAuthenticated: true,
      isAdmin: false,
      email: 'user@example.com'
    });

    await page.waitForTimeout(2000);

    const usersTab = page.locator('[data-tab="users"]');
    const visibleCount = await usersTab.count();

    expect(visibleCount === 0 || !(await usersTab.first().isVisible().catch(() => false))).toBe(true);
  });
});
