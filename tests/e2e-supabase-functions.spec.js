// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * supabase-client.js の各カテゴリの関数が正しくデータを返すことを検証
 * Phase 3（ファイル分割）前の安全ネット
 *
 * テスト方針:
 * - 読み取り系関数を中心にテスト（DBを汚さない）
 * - 管理者でログインし、ブラウザコンテキストからモジュール関数を呼び出す
 * - 戻り値の型・構造を検証（値の中身はDB依存なので構造のみ）
 */

const baseUrl = process.env.BASE_URL || 'http://localhost:8080';

async function loginAsAdmin(page) {
  await page.goto(`${baseUrl}/login.html`);
  await page.fill('input[type="email"]', 'admin@example.com');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForURL(url => !url.toString().includes('login.html'), { timeout: 30000 });
  await page.goto(`${baseUrl}/admin.html`);
  await page.waitForLoadState('networkidle');
}

async function loginAsUser(page) {
  await page.goto(`${baseUrl}/login.html`);
  await page.fill('input[type="email"]', 'a@a');
  await page.fill('input[type="password"]', 'aaaaaa');
  await page.click('button[type="submit"]');
  await page.waitForURL(url => !url.toString().includes('login.html'), { timeout: 30000 });
  await page.waitForLoadState('networkidle');
}

/**
 * admin.html のモジュールコンテキストで supabase-client.js の関数を呼び出すヘルパー
 * admin.js が supabase-client.js を import しているため、関数は window 経由で公開されていないが
 * dynamic import で直接呼べる
 */
async function callSupabaseFunction(page, functionName, args = []) {
  return page.evaluate(async ({ fn, fnArgs }) => {
    const mod = await import('./js/supabase-client.js');
    const func = mod[fn];
    if (!func) throw new Error(`Function ${fn} not found in supabase-client.js`);
    return await func(...fnArgs);
  }, { fn: functionName, fnArgs: args });
}

// ============================================
// 認証関連
// ============================================
test.describe('認証関数', () => {
  test('getUser が認証ユーザー情報を返す', async ({ page }) => {
    await loginAsAdmin(page);
    const user = await callSupabaseFunction(page, 'getUser');
    expect(user).toBeTruthy();
    expect(user.id).toBeTruthy();
    expect(user.email).toBe('admin@example.com');
  });

  test('getProfile がプロファイル情報を返す', async ({ page }) => {
    await loginAsAdmin(page);
    const profile = await callSupabaseFunction(page, 'getProfile');
    expect(profile).toBeTruthy();
    expect(profile.email).toBe('admin@example.com');
    expect(profile.role).toBe('admin');
  });

  test('isAdmin が管理者で true を返す', async ({ page }) => {
    await loginAsAdmin(page);
    const result = await callSupabaseFunction(page, 'isAdmin');
    expect(result).toBe(true);
  });

  test('isAdmin が boolean を返す', async ({ page }) => {
    await loginAsUser(page);
    await page.goto(`${baseUrl}/index.html`);
    await page.waitForTimeout(1000);
    const result = await callSupabaseFunction(page, 'isAdmin');
    expect(typeof result).toBe('boolean');
  });
});

// ============================================
// マスターデータ取得
// ============================================
test.describe('マスターデータ取得', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('getMasterProperties が配列を返す', async ({ page }) => {
    const data = await callSupabaseFunction(page, 'getMasterProperties');
    expect(Array.isArray(data)).toBe(true);
    if (data.length > 0) {
      expect(data[0]).toHaveProperty('property_code');
      expect(data[0]).toHaveProperty('property_name');
    }
  });

  test('getMasterVendors が配列を返す', async ({ page }) => {
    const data = await callSupabaseFunction(page, 'getMasterVendors');
    expect(Array.isArray(data)).toBe(true);
    if (data.length > 0) {
      expect(data[0]).toHaveProperty('vendor_name');
    }
  });

  test('getMasterInspectionTypes が配列を返す', async ({ page }) => {
    const data = await callSupabaseFunction(page, 'getMasterInspectionTypes');
    expect(Array.isArray(data)).toBe(true);
    if (data.length > 0) {
      expect(data[0]).toHaveProperty('inspection_name');
    }
  });

  test('getMasterCategories が配列を返す', async ({ page }) => {
    const data = await callSupabaseFunction(page, 'getMasterCategories');
    expect(Array.isArray(data)).toBe(true);
    if (data.length > 0) {
      expect(data[0]).toHaveProperty('category_name');
    }
  });

  test('getMasterTemplateImages が配列を返す', async ({ page }) => {
    const data = await callSupabaseFunction(page, 'getMasterTemplateImages');
    expect(Array.isArray(data)).toBe(true);
    if (data.length > 0) {
      expect(data[0]).toHaveProperty('image_key');
      expect(data[0]).toHaveProperty('image_url');
    }
  });

  test('getAllMasterData が全マスターデータを含むオブジェクトを返す', async ({ page }) => {
    const data = await callSupabaseFunction(page, 'getAllMasterData');
    expect(data).toBeTruthy();
    expect(data).toHaveProperty('properties');
    expect(data).toHaveProperty('vendors');
    expect(data).toHaveProperty('inspectionTypes');
    expect(data).toHaveProperty('categories');
    expect(data).toHaveProperty('templateImages');
    expect(Array.isArray(data.properties)).toBe(true);
    expect(Array.isArray(data.vendors)).toBe(true);
  });

  test('getAllMasterDataCamelCase がcamelCase変換されたデータを返す', async ({ page }) => {
    const data = await callSupabaseFunction(page, 'getAllMasterDataCamelCase');
    expect(data).toBeTruthy();
    expect(data).toHaveProperty('properties');
    expect(data).toHaveProperty('vendors');
    expect(data).toHaveProperty('notices');
    if (data.properties.length > 0) {
      // camelCase変換されていること
      expect(data.properties[0]).toHaveProperty('propertyCode');
      expect(data.properties[0]).toHaveProperty('propertyName');
    }
  });
});

// ============================================
// エントリ取得
// ============================================
test.describe('エントリ取得', () => {
  test('getAllEntries が配列を返す（管理者）', async ({ page }) => {
    await loginAsAdmin(page);
    const data = await callSupabaseFunction(page, 'getAllEntries');
    expect(Array.isArray(data)).toBe(true);
    if (data.length > 0) {
      expect(data[0]).toHaveProperty('property_code');
      expect(data[0]).toHaveProperty('status');
      expect(data[0]).toHaveProperty('created_at');
    }
  });

  test('getAllEntries がフィルタ付きで動作する', async ({ page }) => {
    await loginAsAdmin(page);
    const all = await callSupabaseFunction(page, 'getAllEntries');
    const filtered = await callSupabaseFunction(page, 'getAllEntries', [{ status: 'draft' }]);
    expect(Array.isArray(filtered)).toBe(true);
    // フィルタ結果は全件以下
    expect(filtered.length).toBeLessThanOrEqual(all.length);
  });

  test('getUserEntriesCurrentMonth が配列を返す（一般ユーザー）', async ({ page }) => {
    await loginAsUser(page);
    await page.goto(`${baseUrl}/index.html`);
    await page.waitForTimeout(1000);
    const data = await callSupabaseFunction(page, 'getUserEntriesCurrentMonth');
    expect(Array.isArray(data)).toBe(true);
  });

  test('getPendingEntries が配列を返す（管理者）', async ({ page }) => {
    await loginAsAdmin(page);
    const data = await callSupabaseFunction(page, 'getPendingEntries');
    expect(Array.isArray(data)).toBe(true);
  });
});

// ============================================
// 紐付け・ビル管理
// ============================================
test.describe('紐付け・ビル管理', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('getBuildingVendors が配列を返す', async ({ page }) => {
    const data = await callSupabaseFunction(page, 'getBuildingVendors');
    expect(Array.isArray(data)).toBe(true);
    if (data.length > 0) {
      expect(data[0]).toHaveProperty('property_code');
      expect(data[0]).toHaveProperty('vendor_id');
      expect(data[0]).toHaveProperty('status');
    }
  });

  test('getPendingBuildingRequests が配列を返す', async ({ page }) => {
    const data = await callSupabaseFunction(page, 'getPendingBuildingRequests');
    expect(Array.isArray(data)).toBe(true);
  });

  test('addBuildingVendor → 削除 → 再追加が成功する', async ({ page }) => {
    // テスト用の物件コードを取得
    const properties = await callSupabaseFunction(page, 'getMasterProperties');
    const vendors = await callSupabaseFunction(page, 'getMasterVendors');
    if (properties.length === 0 || vendors.length === 0) {
      test.skip();
      return;
    }
    const testCode = '__test_reactivate_' + Date.now();
    const vendorId = vendors[0].id;

    // テスト用レコードを直接作成（property_codeは実在しなくてもDB上は追加可能）
    const added = await page.evaluate(async ({ code, vid }) => {
      const { supabase } = await import('./js/supabase/client.js');
      const user = (await supabase.auth.getUser()).data.user;
      const { data, error } = await supabase
        .from('signage_building_vendors')
        .insert({ property_code: code, vendor_id: vid, status: 'active', requested_by: user.id, approved_by: user.id })
        .select().single();
      if (error) throw new Error(error.message);
      return data;
    }, { code: testCode, vid: vendorId });
    expect(added.status).toBe('active');

    // 削除（soft delete）
    const removed = await callSupabaseFunction(page, 'removeBuildingVendor', [added.id]);
    expect(removed.status).toBe('deleted');

    // 再追加 → 以前はここでduplicate keyエラーになっていた
    const reactivated = await callSupabaseFunction(page, 'addBuildingVendor', [testCode, vendorId]);
    expect(reactivated.status).toBe('active');
    expect(reactivated.id).toBe(added.id); // 同じレコードが再有効化される

    // クリーンアップ: テストレコードを物理削除
    await page.evaluate(async ({ id }) => {
      const { supabase } = await import('./js/supabase/client.js');
      await supabase.from('signage_building_vendors').delete().eq('id', id);
    }, { id: added.id });
  });

  test('getVendorInspections がvendor_id付きで配列を返す', async ({ page }) => {
    // まず保守会社一覧を取得してIDを得る
    const vendors = await callSupabaseFunction(page, 'getMasterVendors');
    if (vendors.length === 0) {
      test.skip();
      return;
    }
    const vendorId = vendors[0].id;
    const data = await callSupabaseFunction(page, 'getVendorInspections', [vendorId]);
    expect(Array.isArray(data)).toBe(true);
  });
});

// ============================================
// 設定
// ============================================
test.describe('設定', () => {
  test('getSettings が配列を返す', async ({ page }) => {
    await loginAsAdmin(page);
    const data = await callSupabaseFunction(page, 'getSettings');
    expect(Array.isArray(data)).toBe(true);
    if (data.length > 0) {
      expect(data[0]).toHaveProperty('setting_key');
      expect(data[0]).toHaveProperty('setting_value');
    }
  });
});

// ============================================
// ユーザー管理
// ============================================
test.describe('ユーザー管理', () => {
  test('getAllProfiles が配列を返す（管理者）', async ({ page }) => {
    await loginAsAdmin(page);
    const data = await callSupabaseFunction(page, 'getAllProfiles');
    expect(Array.isArray(data)).toBe(true);
    if (data.length > 0) {
      expect(data[0]).toHaveProperty('email');
      expect(data[0]).toHaveProperty('role');
    }
  });
});

// ============================================
// 広告枠
// ============================================
test.describe('広告枠', () => {
  test('getAdSlots が配列を返す', async ({ page }) => {
    await loginAsAdmin(page);
    const data = await callSupabaseFunction(page, 'getAdSlots');
    expect(Array.isArray(data)).toBe(true);
    if (data.length > 0) {
      expect(data[0]).toHaveProperty('slot_index');
    }
  });
});

// ============================================
// ビル設備（物件マスターに統合）
// ============================================
test.describe('ビル設備', () => {
  test('getMasterProperties の equipment は存在すれば配列', async ({ page }) => {
    await loginAsAdmin(page);
    const properties = await callSupabaseFunction(page, 'getMasterProperties');
    expect(Array.isArray(properties)).toBe(true);
    for (const p of properties) {
      if ('equipment' in p && p.equipment !== null) {
        expect(Array.isArray(p.equipment)).toBe(true);
      }
    }
  });

  test('getAllMasterData の各物件が equipment 配列を持つ', async ({ page }) => {
    await loginAsAdmin(page);
    const data = await callSupabaseFunction(page, 'getAllMasterData');
    expect(Array.isArray(data.properties)).toBe(true);
    for (const p of data.properties) {
      expect(Array.isArray(p.equipment)).toBe(true);
    }
  });
});
