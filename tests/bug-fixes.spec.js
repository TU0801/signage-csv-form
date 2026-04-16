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
    // 28列CSV_HEADERS: [0]点検CO, [1]端末ID, [2]物件コード, [3]保守会社名,
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
