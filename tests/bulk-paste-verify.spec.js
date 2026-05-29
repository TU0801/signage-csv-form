// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * 一括入力画面 Excel貼り付け動作の回帰テスト（値反映とバリデーション）
 *
 * 正常系(A/C/D/G): 入力値が各行に正しく反映され status=OK
 * silent防止(B/E/H): マスタ不一致・列ずれは生値で素通りせず status=エラー（赤）で気づける
 *
 * 実データ前提:
 *  - 120406 アソシアグロッツォ天神サウス → 端末 z1003A01
 *  - 120410 パリス大濠ベイタウン       → 端末 z1001A01
 *  - 実在点検種別: エレベーター定期点検 / 消防設備点検
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
  await page.evaluate(() => {
    Object.keys(localStorage)
      .filter(k => k.startsWith('bulk_autosave_'))
      .forEach(k => localStorage.removeItem(k));
  });
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('#pasteBtn', { timeout: 10000 });
  await page.waitForTimeout(1800);
}

/** メインのデータテーブル(#tableBody)だけをダンプ */
async function dumpRows(page) {
  return await page.evaluate(() => {
    const trs = Array.from(document.querySelectorAll('#tableBody tr'));
    return trs.map(tr => ({
      property: tr.querySelector('.property-select')?.value ?? null,
      terminal: tr.querySelector('.terminal-select')?.value ?? null,
      inspection: tr.querySelector('.inspection-select')?.value ?? null,
      startDate: tr.querySelector('.start-date')?.value ?? null,
      endDate: tr.querySelector('.end-date')?.value ?? null,
      remarks: tr.querySelector('.remarks-input')?.value ?? null,
      status: tr.querySelector('.status-badge')?.textContent ?? null,
      statusClass: tr.querySelector('.status-badge')?.className ?? null,
      errorTitle: tr.querySelector('.status-badge')?.title ?? null,
    }));
  });
}

async function pasteText(page, text) {
  await page.click('#pasteBtn');
  await page.waitForSelector('#pasteModal.active', { timeout: 5000 });
  await page.fill('#pasteArea', text);
  await page.click('#importPasteBtn');
  await page.waitForTimeout(1500);
}

const TAB = '\t';

test.describe.configure({ mode: 'parallel' });

test.describe('一括入力 Excel貼り付け（値反映・バリデーション）', () => {

  // ── 正常系 ──
  test('A: 6列形式が全フィールド正しく反映されOK判定', async ({ page }) => {
    await freshBulkPage(page);
    const text = [
      ['アソシアグロッツォ天神サウス', 'z1003A01', 'エレベーター定期点検', '2025/1/15', '2025/1/15', '午前中'].join(TAB),
      ['パリス大濠ベイタウン', 'z1001A01', '消防設備点検', '2025/2/1', '2025/2/3', ''].join(TAB),
    ].join('\n');
    await pasteText(page, text);

    const rows = await dumpRows(page);
    console.log('A:', JSON.stringify(rows));
    expect(rows.length).toBe(2);
    expect(rows[0]).toMatchObject({
      property: '120406', terminal: 'z1003A01', inspection: 'エレベーター定期点検',
      startDate: '2025-01-15', endDate: '2025-01-15', remarks: '午前中', status: 'OK',
    });
    expect(rows[1]).toMatchObject({
      property: '120410', terminal: 'z1001A01', inspection: '消防設備点検',
      startDate: '2025-02-01', endDate: '2025-02-03', remarks: '', status: 'OK',
    });
  });

  test('C: ヘッダー行が自動スキップされOK判定', async ({ page }) => {
    await freshBulkPage(page);
    const text = [
      ['物件', '端末ID', '点検種別', '開始日', '終了日', '備考'].join(TAB),
      ['アソシアグロッツォ天神サウス', 'z1003A01', 'エレベーター定期点検', '2025/3/1', '2025/3/1', 'テスト'].join(TAB),
    ].join('\n');
    await pasteText(page, text);

    const rows = await dumpRows(page);
    console.log('C:', JSON.stringify(rows));
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({ property: '120406', startDate: '2025-03-01', status: 'OK' });
  });

  test('D: 各種日付フォーマットがISO形式に正規化されOK判定', async ({ page }) => {
    await freshBulkPage(page);
    const text = [
      ['アソシアグロッツォ天神サウス', 'z1003A01', 'エレベーター定期点検', '2025/1/5', '2025/12/31', '斜線'].join(TAB),
      ['パリス大濠ベイタウン', 'z1001A01', '消防設備点検', '2025-03-07', '2025-3-9', 'ハイフン'].join(TAB),
    ].join('\n');
    await pasteText(page, text);

    const rows = await dumpRows(page);
    console.log('D:', JSON.stringify(rows));
    expect(rows.length).toBe(2);
    expect(rows[0]).toMatchObject({ startDate: '2025-01-05', endDate: '2025-12-31', status: 'OK' });
    expect(rows[1]).toMatchObject({ startDate: '2025-03-07', endDate: '2025-03-09', status: 'OK' });
  });

  test('G: 6列+末尾空タブ(10列化)でも崩れずOK判定', async ({ page }) => {
    await freshBulkPage(page);
    const cols = ['アソシアグロッツォ天神サウス', 'z1003A01', 'エレベーター定期点検', '2025/1/15', '2025/1/15', '午前中', '', '', '', ''];
    await pasteText(page, cols.join(TAB));

    const rows = await dumpRows(page);
    console.log('G:', JSON.stringify(rows));
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({
      property: '120406', terminal: 'z1003A01', inspection: 'エレベーター定期点検',
      startDate: '2025-01-15', remarks: '午前中', status: 'OK',
    });
  });

  // ── silent防止（修正で「エラー」表示になり気づける） ──
  test('B: 非実在端末IDは空欄+端末エラーになる(silent上書きしない)', async ({ page }) => {
    await freshBulkPage(page);
    const text = ['パリス大濠ベイタウン', 'WRONG999', '消防設備点検', '2025/2/1', '2025/2/3', ''].join(TAB);
    await pasteText(page, text);

    const rows = await dumpRows(page);
    console.log('B:', JSON.stringify(rows));
    expect(rows.length).toBe(1);
    expect(rows[0].property).toBe('120410');
    // 物件の実端末(z1001A01)に黙って差し替えず、空のまま
    expect(rows[0].terminal).toBe('');
    expect(rows[0].status).toBe('エラー');
    expect(rows[0].errorTitle).toContain('端末');
  });

  test('E: 存在しない物件名は生値で素通りせず物件エラーになる', async ({ page }) => {
    await freshBulkPage(page);
    const text = ['存在しない物件XYZ', 'z9999A01', 'エレベーター定期点検', '2025/4/1', '2025/4/1', ''].join(TAB);
    await pasteText(page, text);

    const rows = await dumpRows(page);
    console.log('E:', JSON.stringify(rows));
    expect(rows.length).toBe(1);
    expect(rows[0].property).toBe('');
    expect(rows[0].status).toBe('エラー');
    expect(rows[0].errorTitle).toContain('物件');
  });

  test('H: 28列CSV貼り付けは列ずれのままOK判定されず、物件エラーになる', async ({ page }) => {
    await freshBulkPage(page);
    const c = new Array(28).fill('');
    c[0] = '';            // 点検CO
    c[1] = 'z1003A01';    // 端末ID
    c[2] = '120406';      // 物件コード
    c[3] = '保守会社テスト';
    c[4] = '092-000-0000';
    c[5] = 'エレベーター定期点検';
    c[6] = 'true';
    c[7] = '5';
    c[8] = '2025/05/01';
    c[9] = '2025/05/02';
    c[10] = '備考メモ';
    c[11] = '案内文テスト';
    await pasteText(page, c.join(TAB));

    const rows = await dumpRows(page);
    console.log('H:', JSON.stringify(rows));
    expect(rows.length).toBe(1);
    // 先頭セル(点検CO)が空のため物件が特定できず、OK判定されない（silentな壊れ取込を防止）
    expect(rows[0].property).toBe('');
    expect(rows[0].status).toBe('エラー');
    expect(rows[0].errorTitle).toContain('物件');
  });
});
