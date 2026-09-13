// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * 2026-04-17 バグ修正の再現テスト
 *
 * Bug1-3: bulk-data.js の generateCSV が masterData を snake_case で参照している
 *   - 226: property?.terminal_id → property?.terminalId
 *   - 229: vendor?.emergency_contact → vendor?.emergencyContact
 *   - 232: inspection?.template_no → inspection?.templateNo
 *
 * Bug4: admin-entry-edit.js のテンプレ埋込で escapeHtml を使っておらずXSSリスク
 * Bug5: script.js の populatePropertySelect が物件コードをソートしない
 * Bug6: supabase/auth.js の getUser() が AuthSessionMissingError を console.error に出す
 * Bug7: favicon.ico がなく404
 */

const baseUrl = process.env.BASE_URL || 'http://localhost:8080';

async function loginAsUser(page, email = 'a@a', password = 'aaaaaa') {
  await page.goto(`${baseUrl}/login.html`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(url => !url.toString().includes('login.html'), { timeout: 30000 });
  await page.waitForLoadState('networkidle');
}

// ========================================
// Bug1-3: bulk CSV の snake/camel混在
// ========================================
test.describe('Bug1-3: bulk CSV snake_case/camelCase 整合', () => {
  test('generateCSV は vendor.emergencyContact と inspection.templateNo を出力する', async ({ page }) => {
    await loginAsUser(page);
    await page.goto(`${baseUrl}/bulk.html`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2500); // masterData読み込み待機

    const result = await page.evaluate(async () => {
      const state = await import('/js/bulk-state.js');
      const data = await import('/js/bulk-data.js');

      const md = state.getMasterData();
      const vendor = md.vendors.find(v => v.emergencyContact);
      const notice = md.notices.find(n => n.templateNo);
      const property = md.properties[0];

      if (!vendor || !notice || !property) {
        return { skipped: true, reason: 'テストデータ不足', vendors: md.vendors.length, notices: md.notices.length, properties: md.properties.length };
      }

      state.setCurrentVendor(vendor.id, vendor.vendorName);

      state.state.rows = [{
        id: 9999,
        propertyCode: property.propertyCode,
        terminalId: property.terminalId || '',
        vendorName: vendor.vendorName,
        inspectionType: notice.inspectionType,
        startDate: '2026-04-20',
        endDate: '2026-04-21',
        remarks: '',
        noticeText: '',
        displayStartDate: '',
        displayStartTime: '',
        displayEndDate: '',
        displayEndTime: '',
        displayTime: 6,
        showOnBoard: true,
        position: 2,
        isValid: true,
        errors: []
      }];

      return {
        csv: data.generateCSV(),
        expectedEmergency: vendor.emergencyContact,
        expectedTemplate: notice.templateNo,
        expectedTerminal: property.terminalId || ''
      };
    });

    if (result.skipped) {
      test.skip(true, `テストデータ不足: ${JSON.stringify(result)}`);
      return;
    }

    const lines = result.csv.split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(2); // headers + 1 data row
    const cells = lines[1].split(',');
    // 28列CSV_HEADERS: [0]点検CO, [1]端末ID, [2]物件コード, [3]受注先名,
    //                   [4]緊急連絡先番号, [5]点検工事案内, [6]掲示板に表示する, [7]点検案内TPLNo
    expect(cells[4]).toBe(result.expectedEmergency);
    expect(cells[7]).toBe(result.expectedTemplate);
    expect(cells[1]).toBe(result.expectedTerminal);
  });
});

// ========================================
// Bug4: admin-entry-edit.js XSS
// ========================================
test.describe('Bug4: admin-entry-edit.js のXSS対策', () => {
  test('ソースコードで entry.* が escapeHtml で包まれている', async ({ page }) => {
    const response = await page.request.get(`${baseUrl}/js/admin-entry-edit.js`);
    const code = await response.text();

    expect(code).toMatch(/import\s*\{[^}]*escapeHtml[^}]*\}\s*from\s*['"]\.\/ui-utils\.js['"]/);
    expect(code).toMatch(/\$\{escapeHtml\(entry\.vendor_name/);
    expect(code).toMatch(/\$\{escapeHtml\(entry\.inspection_type/);
    expect(code).toMatch(/\$\{escapeHtml\(entry\.terminal_id/);
    expect(code).toMatch(/\$\{escapeHtml\(entry\.inspection_start/);
    expect(code).toMatch(/\$\{escapeHtml\(entry\.inspection_end/);
  });
});

// ========================================
// Bug8: admin-relationships.js onclick埋込のescapeHtml化（水平展開）
// ========================================
test.describe('Bug8: admin-relationships.js onclick埋込の escape', () => {
  test('ソースコードで onclick 内の動的値が escapeHtml で包まれている', async ({ page }) => {
    const response = await page.request.get(`${baseUrl}/js/admin-relationships.js`);
    const code = await response.text();

    // raw テンプレ埋込 onclick="fn('${var}')" が残っていないこと（escapeHtml を経由しない ${...} はNG）
    const rawOnclickPattern = /onclick="[a-zA-Z_]+\('\$\{(?!escapeHtml)[^}]+\}/;
    expect(code).not.toMatch(rawOnclickPattern);
  });
});

// ========================================
// Bug9: csv-generator.js null安全化（水平展開）
// ========================================
test.describe('Bug9: csv-generator.js の null 安全', () => {
  test('entry.remarks / entry.noticeText が undefined でも generateCSV が例外を投げない', async ({ page }) => {
    await loginAsUser(page);
    await page.goto(`${baseUrl}/index.html`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    const result = await page.evaluate(() => {
      window._entries = [{
        terminalId: 'T001',
        propertyCode: '120109',
        vendorName: 'Test',
        emergencyContact: '000',
        inspectionType: 'x',
        showOnBoard: true,
        templateNo: '',
        startDate: '2026-04-20',
        endDate: '2026-04-21',
        // remarks と noticeText を意図的に欠落させる
        frameNo: 2,
        displayStartDate: '',
        displayEndDate: '',
        displayStartTime: '',
        displayEndTime: '',
        displayTime: 6,
        posterType: 'template'
      }];
      try {
        const csv = typeof window.generateCSV === 'function' ? window.generateCSV() : null;
        return { ok: true, csv };
      } catch (e) {
        return { ok: false, error: String(e?.message || e) };
      }
    });

    expect(result.ok).toBe(true);
    expect(result.csv).toContain('120109');
  });
});

// ========================================
// Bug5: script.js 物件コードソート
// ========================================
test.describe('Bug5: 物件コードプルダウンのソート', () => {
  test('index.html の #property オプションが数値昇順でソートされる', async ({ page }) => {
    await loginAsUser(page);
    await page.goto(`${baseUrl}/index.html`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2500);

    const values = await page.$$eval('#property option', opts =>
      opts.map(o => o.value).filter(v => v)
    );
    if (values.length < 2) {
      test.skip(true, `物件2件以上ないとソート検証できない: ${values.length}件`);
      return;
    }

    const sorted = [...values].sort((a, b) => {
      const na = parseInt(a, 10);
      const nb = parseInt(b, 10);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return String(a).localeCompare(String(b));
    });
    expect(values).toEqual(sorted);
  });
});

// ========================================
// Bug6: auth.js ログノイズ
// ========================================
test.describe('Bug6: ログイン画面で AuthSessionMissingError のログが出ない', () => {
  test('login.html 初回表示時に "Failed to get user" が console.error に出ない', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto(`${baseUrl}/login.html`);
    await page.waitForTimeout(2500); // getUser() 実行待機

    const authSessionErrors = errors.filter(e =>
      e.includes('Failed to get user') || e.includes('AuthSessionMissingError')
    );
    expect(authSessionErrors).toEqual([]);
  });
});

// ========================================
// Bug7: favicon 404
// ========================================
test.describe('Bug7: favicon.ico の404解消', () => {
  const pages = ['index.html', 'bulk.html', 'admin.html', 'login.html'];

  for (const p of pages) {
    test(`${p} に rel="icon" の link タグがある`, async ({ page }) => {
      await page.goto(`${baseUrl}/${p}`);
      // 認証済みページは未ログインだと login.html にリダイレクトされる。
      // どちらのDOMでも favicon が存在することを保証する。
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(500);
      const count = await page.locator('link[rel="icon"]').count();
      expect(count).toBeGreaterThan(0);
    });
  }
});

// ========================================
// 修正依頼0913（2026-09-09 報告）
//   - 物件コードが <input type="number"> + parseInt で、既存の英数字コード（z0023A01 等）を登録・編集できない
//   - 端末リストが必須だが、サイネージ未設置の物件もあるため任意にする
//   - admin.html を開いたまま別タブで一般ユーザーに切り替えると、画面は管理者のまま
//     一般ユーザー権限で書き込みが走り RLS に拒否される（物件登録403・紐付け削除406）
// ========================================
async function loginAsAdminAtAdminPage(page) {
  await loginAsUser(page);
  await page.goto(`${baseUrl}/admin.html`);
  await page.waitForLoadState('networkidle');
  await page.click('.sidebar-nav-link[data-tab="master"]');
  await page.click('.admin-tab[data-master="properties"]');
}

// 認証リダイレクトを持たない同一オリジンのタブ（login.html はログイン済みだと遷移してしまう）
async function openSameOriginTab(context) {
  const tab = await context.newPage();
  await tab.goto(`${baseUrl}/js/config.js`);
  await tab.evaluate(() => import('/js/config.js'));
  return tab;
}

test.describe('修正依頼0913: 物件マスター', () => {
  test('英数字の物件コード・端末なしで物件を登録できる', async ({ page }) => {
    const code = `ZT${Date.now()}A01`;
    page.on('dialog', dialog => dialog.accept());
    await loginAsAdminAtAdminPage(page);

    await page.click('#addPropertyBtn');
    await page.fill('#propertyCode', code);
    await page.fill('#propertyName', `テスト物件_${code}`);
    await page.click('#masterForm button[type="submit"]');

    try {
      await expect(page.locator('.master-item', { hasText: code })).toBeVisible({ timeout: 15000 });
      const saved = await page.evaluate(async (c) => {
        const { supabase } = await import('/js/supabase/client.js');
        const { data } = await supabase.from('signage_master_properties').select('property_code, terminals').eq('property_code', c).single();
        return data;
      }, code);
      expect(saved).toEqual({ property_code: code, terminals: [] });
    } finally {
      await page.evaluate(async (c) => {
        const { supabase } = await import('/js/supabase/client.js');
        await supabase.from('signage_master_properties').delete().eq('property_code', c);
      }, code);
    }
  });

  test('既存の英数字コード物件を編集で開くと物件コードが保持される', async ({ page }) => {
    await loginAsAdminAtAdminPage(page);
    const code = await page.evaluate(() =>
      [...document.querySelectorAll('.master-item')].map(el => el.dataset.propertyCode).find(c => /[^0-9]/.test(c))
    );
    test.skip(!code, '英数字コードの物件がない環境');

    await page.locator(`.master-item[data-property-code="${code}"] [data-action="edit"]`).click();
    await expect(page.locator('#propertyCode')).toHaveValue(code);
  });
});

test.describe('修正依頼0913: 1件入力の英数字物件コード', () => {
  test('英数字コードの物件で追加したエントリの物件コードが NaN にならない', async ({ page }) => {
    await loginAsUser(page);
    await page.goto(`${baseUrl}/index.html`);
    await page.waitForLoadState('networkidle');

    const code = await page.evaluate(() =>
      [...document.querySelectorAll('#property option')].map(o => o.value).find(v => /[^0-9]/.test(v))
    );
    test.skip(!code, '英数字コードの物件がない環境');

    await page.selectOption('#property', code);
    await page.evaluate(() => window.onPropertyChange());
    await page.selectOption('#inspectionType', { index: 1 });
    await page.evaluate(() => window.onInspectionTypeChange());
    const today = new Date().toISOString().split('T')[0];
    await page.fill('#startDate', today);
    await page.fill('#endDate', today);
    await page.evaluate(() => window.addEntry());

    await expect(page.locator('#dataList tr.pending td').first()).toHaveText(code);
  });
});

test.describe('修正依頼0913: 別タブでのアカウント切替', () => {
  test('別タブでログアウトすると admin.html はログイン画面へ戻る', async ({ context }) => {
    const adminPage = await context.newPage();
    await loginAsAdminAtAdminPage(adminPage);

    const otherTab = await openSameOriginTab(context);
    await otherTab.evaluate(async () => {
      const { supabase } = await import('/js/supabase/client.js');
      await supabase.auth.signOut({ scope: 'local' });
    });

    await adminPage.waitForURL(/login\.html/, { timeout: 15000 });
  });

  test('別タブで別アカウントにログインすると admin.html は再読み込みされる', async ({ context }) => {
    const adminPage = await context.newPage();
    await loginAsAdminAtAdminPage(adminPage);
    await adminPage.evaluate(() => { window.__beforeSwitch = true; });

    const otherTab = await openSameOriginTab(context);
    await otherTab.evaluate(async () => {
      const { supabase } = await import('/js/supabase/client.js');
      await supabase.auth.signOut({ scope: 'local' });
      const { error } = await supabase.auth.signInWithPassword({ email: 'admin@example.com', password: 'admin123' });
      if (error) throw new Error(error.message);
    });

    await expect.poll(
      () => adminPage.evaluate(() => window.__beforeSwitch === true).catch(() => true),
      { timeout: 15000 }
    ).toBe(false);
  });
});
