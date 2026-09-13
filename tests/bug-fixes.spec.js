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

// ========================================
// 修正依頼0913 追加対応（2026-09-13）
//   - 一般ユーザーが自分の role を admin に書き換えられた（RLS の穴）→ DBトリガーで拒否
//   - ユーザー編集のパスワード欄が無視されていた → Edge Function signage-admin-users で変更
//   - 無効化が status 列の欠落で失敗し、無効化しても入れた → 列追加＋ログイン・各画面で拒否
//   - error-handler.js がどの画面にも読み込まれず signage_error_logs が0件だった
// テスト専用の一般ユーザー e2e-user@example.com（保守会社は b@b と同じ）を使う
// ========================================
const E2E_USER = { email: 'e2e-user@example.com', password: 'e2euser123' };

async function loginAndGetSupabase(page, { email, password }) {
  await page.goto(`${baseUrl}/js/config.js`);
  return page.evaluate(async ([e, p]) => {
    await import('/js/config.js');
    const { supabase } = await import('/js/supabase/client.js');
    const { data, error } = await supabase.auth.signInWithPassword({ email: e, password: p });
    return { userId: data?.user?.id || null, error: error?.message || null };
  }, [email, password]);
}

async function openUsersTab(page) {
  await loginAsUser(page);
  await page.goto(`${baseUrl}/admin.html`);
  await page.waitForLoadState('networkidle');
  await page.click('.sidebar-nav-link[data-tab="users"]');
  await expect(page.locator('#usersBody tr', { hasText: E2E_USER.email })).toBeVisible({ timeout: 15000 });
}

test.describe('修正依頼0913: アカウント管理', () => {
  test.describe.configure({ mode: 'serial' });

  test('一般ユーザーは自分の権限を admin に変更できない', async ({ page }) => {
    const { userId } = await loginAndGetSupabase(page, E2E_USER);
    const result = await page.evaluate(async (id) => {
      const { supabase } = await import('/js/supabase/client.js');
      const { error } = await supabase.from('signage_profiles').update({ role: 'admin' }).eq('id', id);
      const { data } = await supabase.from('signage_profiles').select('role').eq('id', id).single();
      return { code: error?.code || null, role: data?.role };
    }, userId);
    expect(result).toEqual({ code: '42501', role: 'user' });
  });

  test('一般ユーザーはユーザー管理の Edge Function を使えない', async ({ page }) => {
    const { userId } = await loginAndGetSupabase(page, E2E_USER);
    const message = await page.evaluate(async (id) => {
      const { updateUserPassword } = await import('/js/supabase/users.js');
      try {
        await updateUserPassword(id, 'hacked123');
        return 'no error';
      } catch (e) {
        return e.message;
      }
    }, userId);
    expect(message).toBe('管理者権限が必要です');
  });

  test('管理者はユーザー編集でパスワードを変更できる', async ({ page, browser }) => {
    const newPassword = 'e2euser456';
    await openUsersTab(page);
    try {
      await page.locator('#usersBody tr', { hasText: E2E_USER.email }).getByRole('button', { name: '編集' }).click();
      await expect(page.locator('#userModal')).toHaveClass(/active/);
      await page.fill('#newUserPassword', newPassword);
      await page.click('#userSubmitBtn');
      await expect(page.getByText('ユーザー情報とパスワードを更新しました')).toBeVisible({ timeout: 15000 });

      const other = await browser.newContext();
      const login = await loginAndGetSupabase(await other.newPage(), { email: E2E_USER.email, password: newPassword });
      await other.close();
      expect(login.error).toBeNull();
    } finally {
      await page.evaluate(async ([email, password]) => {
        const { getAllProfiles, updateUserPassword } = await import('/js/supabase/users.js');
        const target = (await getAllProfiles()).find(p => p.email === email);
        await updateUserPassword(target.id, password);
      }, [E2E_USER.email, E2E_USER.password]);
    }
  });

  test('無効化したユーザーはログインできず、有効化で戻る', async ({ page, browser }) => {
    page.on('dialog', dialog => dialog.accept());
    await openUsersTab(page);
    const row = page.locator('#usersBody tr', { hasText: E2E_USER.email });
    // 無効化の前からログインしている画面（開いたままのタブ）を用意する
    const openedTab = await (await browser.newContext()).newPage();
    await loginAndGetSupabase(openedTab, E2E_USER);
    const isActiveMember = () => openedTab.evaluate(async () => {
      const { supabase } = await import('/js/supabase/client.js');
      const { data } = await supabase.rpc('is_active_member');
      return data;
    });
    try {
      expect(await isActiveMember()).toBe(true);
      await row.getByRole('button', { name: '無効化' }).click();
      await expect(row.getByRole('button', { name: '有効化' })).toBeVisible({ timeout: 15000 });
      // RLS の判定（全ポリシー共通）は開いたままのセッションにも即時に効く
      expect(await isActiveMember()).toBe(false);

      const other = await browser.newContext();
      const userPage = await other.newPage();
      await userPage.goto(`${baseUrl}/login.html`);
      await userPage.fill('input[type="email"]', E2E_USER.email);
      await userPage.fill('input[type="password"]', E2E_USER.password);
      await userPage.click('button[type="submit"]');
      await expect(userPage.locator('#errorMessage')).toHaveText(/無効化されています/, { timeout: 15000 });
      await expect(userPage).toHaveURL(/login\.html/);
      await other.close();

      await row.getByRole('button', { name: '有効化' }).click();
      await expect(row.getByRole('button', { name: '無効化' })).toBeVisible({ timeout: 15000 });
    } finally {
      await page.evaluate(async (email) => {
        const { getAllProfiles, updateUserStatus } = await import('/js/supabase/users.js');
        const target = (await getAllProfiles()).find(p => p.email === email);
        if (target.status !== 'active') await updateUserStatus(target.id, 'active');
      }, E2E_USER.email);
      await openedTab.context().close();
    }
  });

  test('他システムと共用のアカウントはパスワードを変更できない', async ({ page }) => {
    await openUsersTab(page);
    const message = await page.evaluate(async () => {
      const { supabase } = await import('/js/supabase/client.js');
      const { updateUserPassword } = await import('/js/supabase/users.js');
      // 001@baran-ev.com は biz でも使われている共用アカウント
      const { data: target } = await supabase.from('signage_profiles').select('id').eq('email', '001@baran-ev.com').maybeSingle();
      if (!target) return 'skip';
      try {
        await updateUserPassword(target.id, 'shouldnotchange1');
        return 'no error';
      } catch (e) {
        return e.message;
      }
    });
    test.skip(message === 'skip', '共用アカウントがない環境');
    expect(message).toContain('他のシステムと共用');
  });

  test('管理者ユーザーは保守会社なしでも編集を保存できる', async ({ page }) => {
    await openUsersTab(page);
    await page.locator('#usersBody tr', { hasText: 'admin@example.com' }).getByRole('button', { name: '編集' }).click();
    await expect(page.locator('#userModal')).toHaveClass(/active/);
    await page.selectOption('#newUserRole', 'admin');
    await page.selectOption('#newUserVendor', '');
    await page.click('#userSubmitBtn');
    await expect(page.getByText('ユーザー情報を更新しました')).toBeVisible({ timeout: 15000 });
  });
});

test.describe('修正依頼0913: 一括入力中のアカウント切替', () => {
  test('行が残っていても、別タブで切り替わったら画面を塞いで開き直す', async ({ context }) => {
    const bulkPage = await context.newPage();
    await loginAsUser(bulkPage);
    await bulkPage.goto(`${baseUrl}/bulk.html`);
    await bulkPage.waitForLoadState('networkidle');
    await bulkPage.click('#addRowBtn');
    await bulkPage.evaluate(() => { window.__beforeSwitch = true; });
    const dialogs = [];
    bulkPage.on('dialog', dialog => { dialogs.push(dialog.type()); dialog.dismiss(); });

    const otherTab = await openSameOriginTab(context);
    await otherTab.evaluate(async () => {
      const { supabase } = await import('/js/supabase/client.js');
      await supabase.auth.signOut({ scope: 'local' });
    });

    await expect.poll(
      () => bulkPage.evaluate(() => window.__beforeSwitch === true).catch(() => false),
      { timeout: 15000 }
    ).toBe(false);
    expect(dialogs).not.toContain('beforeunload');
  });
});

test.describe('修正依頼0913: エラーログ保存', () => {
  test('画面で失敗して console.error に渡されたエラーが signage_error_logs に送られる', async ({ page }) => {
    const posted = [];
    // 本番DBにテストのログを残さないよう、送信内容だけを捕まえて応答を差し替える
    await page.route('**/rest/v1/signage_error_logs', async route => {
      posted.push(route.request().postDataJSON());
      await route.fulfill({ status: 201, body: '' });
    });
    await loginAsUser(page);
    await page.goto(`${baseUrl}/admin.html`);
    await page.waitForLoadState('networkidle');

    await page.evaluate(() => {
      console.error('Failed to remove building-vendor relationship:', { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' });
    });

    await expect.poll(() => posted.length, { timeout: 10000 }).toBeGreaterThan(0);
    expect(posted[0]).toMatchObject({
      context: 'Failed to remove building-vendor relationship:',
      message: 'JSON object requested, multiple (or no) rows returned [PGRST116]',
    });
    expect(posted[0].user_id).toBeTruthy();
  });
});
