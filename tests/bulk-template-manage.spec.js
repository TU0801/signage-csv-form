// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * 一括入力画面 テンプレート管理（削除・企業別フィルタ）の回帰テスト
 *
 * 要件（スクショの赤字メモ）:
 *  1. テンプレート削除できること
 *  2. 選択中の企業に登録されたテンプレートのみ表示すること
 *
 * 追加で検証:
 *  - 旧形式（{name:{}} オブジェクト）からの自動移行
 *  - テンプレート名の XSS 防止（textContent 描画）
 *  - 全社共通(vendorId=null)テンプレのドロップダウン接尾辞
 *  - 管理モーダルが Escape で閉じる（他モーダルとの一貫性）
 *
 * テンプレートは localStorage('bulk_templates') に配列形式で保存される:
 *  [{ id, name, vendorId, vendorName, createdAt, rows: [...] }]
 *
 * 注: テストユーザー a@a は管理者で、保守会社未選択時 vendorId=null（全社共通扱い）。
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

async function freshBulkPage(page) {
  await loginAsUser(page);
  await page.goto(`${baseUrl}/bulk.html`);
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('#pasteBtn', { timeout: 10000 });
  // autosave とテンプレートを掃除（テスト間の汚染防止）
  await page.evaluate(() => {
    Object.keys(localStorage)
      .filter(k => k.startsWith('bulk_autosave_'))
      .forEach(k => localStorage.removeItem(k));
    localStorage.removeItem('bulk_templates');
  });
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('#pasteBtn', { timeout: 10000 });
  await page.waitForTimeout(2000);
}

/** ツールバーのテンプレートドロップダウンの option テキスト一覧（先頭の "テンプレート" を除く） */
async function dropdownNames(page) {
  return await page.evaluate(() => {
    const sel = document.getElementById('templateSelect');
    return Array.from(sel.options).map(o => o.textContent).filter(t => t !== 'テンプレート');
  });
}

/** 部分一致で option の有無を判定（「（全社共通）」接尾辞に耐える） */
function hasOption(names, substr) {
  return names.some(n => n.includes(substr));
}

/** localStorage のテンプレート配列を取得 */
async function storedTemplates(page) {
  return await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('bulk_templates') || '[]'); }
    catch { return null; }
  });
}

/** 行を1つ追加してテンプレ保存（保存には rows.length>0 が必要） */
async function saveTemplateWithName(page, name) {
  await page.click('#addRowBtn');
  await page.waitForTimeout(300);
  await page.click('#saveTemplateBtn');
  await page.waitForSelector('#templateModal.active', { timeout: 5000 });
  await page.fill('#templateName', name);
  await page.click('#confirmSaveTemplate');
  await page.waitForTimeout(600);
}

test.describe.configure({ mode: 'parallel' });

test.describe('一括入力 テンプレート管理（削除・企業別フィルタ）', () => {

  test('保存したテンプレートがドロップダウンと管理一覧に出る', async ({ page }) => {
    await freshBulkPage(page);
    await saveTemplateWithName(page, 'マイテンプレ1');

    expect(hasOption(await dropdownNames(page), 'マイテンプレ1')).toBe(true);

    // 管理モーダルに表示される（一覧は接尾辞なしの素の名前）
    await page.click('#manageTemplateBtn');
    await page.waitForSelector('#manageTemplateModal.active', { timeout: 5000 });
    const items = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#manageTemplateList .template-manage-name'))
        .map(el => el.textContent)
    );
    expect(items).toContain('マイテンプレ1');
  });

  test('企業別フィルタ(null): 別企業のテンプレートは表示されない', async ({ page }) => {
    await freshBulkPage(page);
    // 自分の企業で保存（admin未選択なら vendorId=null）
    await saveTemplateWithName(page, '自社テンプレ');

    // 自社の vendorId を実際の保存値から取得し、確実に異なる別企業IDを作る
    const arr = await storedTemplates(page);
    const own = arr.find(t => t.name === '自社テンプレ');
    const otherVendorId = String(own.vendorId) + '_OTHER_XYZ';

    // 別企業テンプレ・レガシー(vendorId=null)テンプレを注入
    await page.evaluate(({ otherVendorId }) => {
      const list = JSON.parse(localStorage.getItem('bulk_templates') || '[]');
      list.push({ id: 'inj-other', name: '別社テンプレ', vendorId: otherVendorId, vendorName: '別会社', createdAt: 1, rows: [{ propertyCode: '' }] });
      list.push({ id: 'inj-legacy', name: '共通テンプレ', vendorId: null, vendorName: null, createdAt: 1, rows: [{ propertyCode: '' }] });
      localStorage.setItem('bulk_templates', JSON.stringify(list));
    }, { otherVendorId });

    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('#pasteBtn', { timeout: 10000 });
    await page.waitForTimeout(2000);

    const names = await dropdownNames(page);
    expect(hasOption(names, '自社テンプレ')).toBe(true);   // 自社のものは表示
    expect(hasOption(names, '共通テンプレ')).toBe(true);   // レガシー(全社共通)は表示
    expect(hasOption(names, '別社テンプレ')).toBe(false);  // 別企業のものは非表示
  });

  test('企業別フィルタ(実vendor): 選択企業のテンプレのみ表示し他社は隠す', async ({ page }) => {
    await freshBulkPage(page);

    // 管理者の保守会社セレクトから実在 vendorId を取得
    const vendorId = await page.evaluate(() => {
      const sel = document.getElementById('adminVendorSelect');
      if (!sel) return null;
      const opt = Array.from(sel.options).find(o => o.value);
      return opt ? opt.value : null;
    });
    test.skip(!vendorId, '管理者用の保守会社セレクトに選択可能なvendorが無いためスキップ');

    const otherVendorId = vendorId + '_OTHER';
    // V社・別社・全社共通テンプレを注入（reloadせず、この後 V を選択する）
    await page.evaluate(({ vendorId, otherVendorId }) => {
      localStorage.setItem('bulk_templates', JSON.stringify([
        { id: 't-v', name: 'V社テンプレ', vendorId, vendorName: 'V社', createdAt: 1, rows: [{ propertyCode: '' }] },
        { id: 't-o', name: '別社テンプレ', vendorId: otherVendorId, vendorName: '別社', createdAt: 1, rows: [{ propertyCode: '' }] },
        { id: 't-c', name: '全社共通テンプレ', vendorId: null, vendorName: null, createdAt: 1, rows: [{ propertyCode: '' }] },
      ]));
    }, { vendorId, otherVendorId });

    // 保守会社 V を選択 → 変更ハンドラが loadTemplates を呼ぶ
    await page.selectOption('#adminVendorSelect', vendorId);
    await page.waitForTimeout(2500);

    const names = await dropdownNames(page);
    expect(hasOption(names, 'V社テンプレ')).toBe(true);      // 選択企業のものは表示
    expect(hasOption(names, '全社共通テンプレ')).toBe(true); // 全社共通も表示
    expect(hasOption(names, '別社テンプレ')).toBe(false);    // 他社のものは非表示
  });

  test('全社共通テンプレはドロップダウンで「（全社共通）」接尾辞が付く', async ({ page }) => {
    await freshBulkPage(page);
    await page.evaluate(() => {
      localStorage.setItem('bulk_templates', JSON.stringify([
        { id: 'c1', name: 'きれいな名前', vendorId: null, vendorName: null, createdAt: 1, rows: [{ propertyCode: '' }] }
      ]));
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('#pasteBtn', { timeout: 10000 });
    await page.waitForTimeout(2000);

    const names = await dropdownNames(page);
    expect(names).toContain('きれいな名前（全社共通）');
  });

  test('テンプレート削除: 管理モーダルから削除でき一覧から消える', async ({ page }) => {
    await freshBulkPage(page);
    await saveTemplateWithName(page, '削除対象テンプレ');
    expect(hasOption(await dropdownNames(page), '削除対象テンプレ')).toBe(true);

    // 削除確認ダイアログは承認
    page.on('dialog', dialog => dialog.accept());

    await page.click('#manageTemplateBtn');
    await page.waitForSelector('#manageTemplateModal.active', { timeout: 5000 });

    // 「削除対象テンプレ」の行の削除ボタンを押す
    await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('#manageTemplateList .template-manage-item'));
      const target = items.find(it => it.querySelector('.template-manage-name')?.textContent === '削除対象テンプレ');
      target.querySelector('button').click();
    });
    await page.waitForTimeout(600);

    // ドロップダウン・localStorage 双方から消えている
    expect(hasOption(await dropdownNames(page), '削除対象テンプレ')).toBe(false);
    const arr = await storedTemplates(page);
    expect(arr.find(t => t.name === '削除対象テンプレ')).toBeUndefined();
  });

  test('管理モーダルは Escape キーで閉じる（他モーダルと一貫）', async ({ page }) => {
    await freshBulkPage(page);
    await page.evaluate(() => {
      localStorage.setItem('bulk_templates', JSON.stringify([
        { id: 'e1', name: 'エスケープ確認', vendorId: null, vendorName: null, createdAt: 1, rows: [{ propertyCode: '' }] }
      ]));
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('#pasteBtn', { timeout: 10000 });
    await page.waitForTimeout(1500);

    await page.click('#manageTemplateBtn');
    await page.waitForSelector('#manageTemplateModal.active', { timeout: 5000 });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    const active = await page.evaluate(() =>
      document.getElementById('manageTemplateModal').classList.contains('active'));
    expect(active).toBe(false);
  });

  test('旧形式（オブジェクト）から配列形式へ自動移行される', async ({ page }) => {
    await freshBulkPage(page);
    // 旧形式を直接書き込む
    await page.evaluate(() => {
      localStorage.setItem('bulk_templates', JSON.stringify({
        '旧テンプレA': { createdAt: 111, rows: [{ propertyCode: '' }] },
        '旧テンプレB': { createdAt: 222, rows: [{ propertyCode: '' }, { propertyCode: '' }] }
      }));
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('#pasteBtn', { timeout: 10000 });
    await page.waitForTimeout(2000);

    // ドロップダウンに旧テンプレが出る（レガシーは vendorId=null で全社共通扱い）
    const names = await dropdownNames(page);
    expect(hasOption(names, '旧テンプレA')).toBe(true);
    expect(hasOption(names, '旧テンプレB')).toBe(true);

    // localStorage は配列形式に移行し、id が付与されている
    const arr = await storedTemplates(page);
    expect(Array.isArray(arr)).toBe(true);
    expect(arr.length).toBe(2);
    expect(arr.every(t => typeof t.id === 'string' && t.id.length > 0)).toBe(true);
    expect(arr.every(t => t.vendorId === null)).toBe(true);
  });

  test('XSS防止: テンプレート名はHTMLとして実行されない', async ({ page }) => {
    await freshBulkPage(page);
    await page.evaluate(() => {
      localStorage.setItem('bulk_templates', JSON.stringify([
        { id: 'xss1', name: '<img src=x onerror="window.__xss_fired=true">', vendorId: null, vendorName: null, createdAt: 1, rows: [{ propertyCode: '' }] }
      ]));
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('#pasteBtn', { timeout: 10000 });
    await page.waitForTimeout(1500);

    await page.click('#manageTemplateBtn');
    await page.waitForSelector('#manageTemplateModal.active', { timeout: 5000 });
    await page.waitForTimeout(400);

    // onerror が発火していない & 名前は文字列として描画
    const fired = await page.evaluate(() => window.__xss_fired === true);
    expect(fired).toBe(false);
    const nameText = await page.evaluate(() =>
      document.querySelector('#manageTemplateList .template-manage-name')?.textContent
    );
    expect(nameText).toContain('<img');
  });
});
