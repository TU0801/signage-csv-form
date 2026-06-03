// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * 点検種別の「実カテゴリによる絞り込み」と「ベンダー×点検種別 紐づけの反映」のE2Eテスト。
 *
 * 背景（要望）: マスターでベンダー×点検種別の紐づけを行ったため、入力画面（index.html）で
 *   - 案内カテゴリ: 紐づけが1カテゴリのみなら初期選択（Q1）
 *   - 点検工事案内: 紐づけリストの先頭を初期選択（Q2）
 *   - 並び順: 紐づけを上＋その他を下（Q3）
 *   - バグ: 「植栽の手入れ」がリストに出ない（旧実装が点検種別「名」の部分一致で絞り込んでいたため）
 * を反映する。
 *
 * a@a は管理者アカウント。index.html では vendor_id が無いため一般フローの自動反映はドーマント。
 * 紐づけ反映は管理者の「保守会社選択(adminVendorSelect)」経由で検証する。
 */

const baseUrl = process.env.BASE_URL || 'http://localhost:8080';

// 既知ベンダー（テスト安定性のためUUIDで選択する）
const VENDOR_YAMAMOTO = '95f7ded1-8105-42ee-a866-3e87592d184b'; // 山本クリーンシステム: 多カテゴリ紐づけ
const VENDOR_BARAN = 'f18bbd80-0f11-4d6c-a807-ac053bf0b4fd';    // 株式会社BARAN: 点検カテゴリのみ1件

async function loginAndGoToIndex(page) {
  await page.goto(`${baseUrl}/login.html`);
  await page.fill('input[type="email"]', 'a@a');
  await page.fill('input[type="password"]', 'aaaaaa');
  await page.click('button[type="submit"]');
  await page.waitForURL(url => !url.toString().includes('login.html'), { timeout: 30000 });
  await page.waitForLoadState('networkidle');
  if (!page.url().includes('index.html')) {
    await page.goto(`${baseUrl}/index.html`);
    await page.waitForLoadState('networkidle');
  }
}

async function inspectionOptionTexts(page) {
  return page.$$eval('#inspectionType option', opts =>
    opts.map(o => (o.textContent || '').trim()).filter(t => t && t !== '選択してください'));
}

test.describe('点検種別: 実カテゴリによる絞り込み（植栽の手入れ消失バグ修正）', () => {
  test('案内カテゴリ「点検」で、名前に「点検」を含まない点検カテゴリ項目が表示される', async ({ page }) => {
    await loginAndGoToIndex(page);
    await page.selectOption('#inspectionCategory', '点検');
    await page.waitForTimeout(300);
    const texts = await inspectionOptionTexts(page);
    // 旧実装(点検種別名の部分一致)では「点検」を名前に含まないため漏れていた項目
    expect(texts).toContain('植栽の手入れ');
    expect(texts).toContain('貯水槽清掃');
  });

  test('案内カテゴリ「工事」では点検カテゴリ項目（植栽の手入れ）は表示されない', async ({ page }) => {
    await loginAndGoToIndex(page);
    await page.selectOption('#inspectionCategory', '工事');
    await page.waitForTimeout(300);
    const texts = await inspectionOptionTexts(page);
    expect(texts).toContain('外壁塗装工事'); // 工事カテゴリの既知項目
    expect(texts).not.toContain('植栽の手入れ'); // 点検カテゴリなので工事では出ない
  });

  test('案内カテゴリに「その他」が存在し、その他カテゴリ項目で絞り込める（DBカテゴリと整合）', async ({ page }) => {
    await loginAndGoToIndex(page);
    // DBの signage_master_categories には「その他」が存在する。ドロップダウンにも用意されていること
    const hasOption = await page.locator('#inspectionCategory option[value="その他"]').count();
    expect(hasOption).toBe(1);
    await page.selectOption('#inspectionCategory', 'その他');
    await page.waitForTimeout(300);
    const texts = await inspectionOptionTexts(page);
    expect(texts).toContain('自転車撤去'); // category=その他 の既知項目
    expect(texts).not.toContain('植栽の手入れ'); // 点検カテゴリなので出ない
  });
});

test.describe('点検種別: ベンダー紐づけの反映（管理者のベンダー選択経由）', () => {
  test('多カテゴリ紐づけベンダー選択で先頭が自動選択され、編集可能のまま（Q2）', async ({ page }) => {
    await loginAndGoToIndex(page);
    const vendorSel = page.locator('#adminVendorSelect');
    await expect(vendorSel).toBeVisible({ timeout: 15000 });
    await vendorSel.selectOption(VENDOR_YAMAMOTO);
    await page.waitForTimeout(1500);

    // Q2: 先頭が初期選択されている
    expect(await page.locator('#inspectionType').inputValue()).not.toBe('');
    // 旧実装のロックは廃止 → 編集可能
    await expect(page.locator('#inspectionType')).toBeEnabled();
    // 多カテゴリのため案内カテゴリは「全て」のまま（Q1は単一カテゴリのみ）
    expect(await page.locator('#inspectionCategory').inputValue()).toBe('');
  });

  test('単一カテゴリ紐づけベンダー選択で案内カテゴリが自動選択され先頭が選ばれる（Q1+Q2+Q3）', async ({ page }) => {
    await loginAndGoToIndex(page);
    const vendorSel = page.locator('#adminVendorSelect');
    await expect(vendorSel).toBeVisible({ timeout: 15000 });
    await vendorSel.selectOption(VENDOR_BARAN);
    await page.waitForTimeout(1500);

    // Q1: 紐づけが点検カテゴリのみ → 案内カテゴリが「点検」に初期選択
    expect(await page.locator('#inspectionCategory').inputValue()).toBe('点検');
    // Q3+Q2: 紐づけ項目が先頭に並び、先頭が選択される
    const texts = await inspectionOptionTexts(page);
    expect(texts[0]).toBe('デジタルサイネージ点検');
    const selectedIdx = await page.locator('#inspectionType').inputValue();
    expect(selectedIdx).not.toBe('');
    const selectedText = await page.locator(`#inspectionType option[value="${selectedIdx}"]`).textContent();
    expect((selectedText || '').trim()).toBe('デジタルサイネージ点検');
  });

  test('ベンダー選択を解除すると紐づけ反映がリセットされる', async ({ page }) => {
    await loginAndGoToIndex(page);
    const vendorSel = page.locator('#adminVendorSelect');
    await expect(vendorSel).toBeVisible({ timeout: 15000 });
    await vendorSel.selectOption(VENDOR_BARAN);
    await page.waitForTimeout(1200);
    await vendorSel.selectOption({ index: 0 }); // 「-- 保守会社を選択 --」に戻す
    await page.waitForTimeout(1200);

    // 案内カテゴリは「全て」に戻り、点検種別は未選択
    expect(await page.locator('#inspectionCategory').inputValue()).toBe('');
    expect(await page.locator('#inspectionType').inputValue()).toBe('');
  });
});
