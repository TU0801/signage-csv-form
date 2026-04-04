// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * script.js の主要機能のE2Eテスト
 * Phase 4 リファクタリング前の安全網として追加
 */

const baseUrl = process.env.BASE_URL || 'http://localhost:8080';

async function loginAndGoToIndex(page) {
  await page.goto(`${baseUrl}/login.html`);
  await page.fill('input[type="email"]', 'a@a');
  await page.fill('input[type="password"]', 'aaaaaa');
  await page.click('button[type="submit"]');
  await page.waitForURL(url => !url.toString().includes('login.html'), { timeout: 30000 });
  await page.waitForLoadState('networkidle');
  // index.htmlに確実に遷移
  if (!page.url().includes('index.html')) {
    await page.goto(`${baseUrl}/index.html`);
    await page.waitForLoadState('networkidle');
  }
}

// ============================================
// フォーム初期化・UI要素の存在確認
// ============================================
test.describe('フォーム初期化', () => {
  test('主要フォーム要素が存在する', async ({ page }) => {
    await loginAndGoToIndex(page);

    const elements = ['property', 'terminal', 'vendor', 'inspectionType', 'startDate', 'endDate',
      'displayTime', 'noticeText', 'remarks', 'displayStartDate', 'displayEndDate'];
    for (const id of elements) {
      await expect(page.locator(`#${id}`)).toBeAttached();
    }
  });

  test('開始日にデフォルト値（今日）が設定される', async ({ page }) => {
    await loginAndGoToIndex(page);
    const today = new Date().toISOString().split('T')[0];
    const startDate = await page.inputValue('#startDate');
    expect(startDate).toBe(today);
  });

  test('物件セレクトにオプションが存在する', async ({ page }) => {
    await loginAndGoToIndex(page);
    const optionCount = await page.locator('#property option').count();
    expect(optionCount).toBeGreaterThan(1); // 「選択してください」+ 実データ
  });

  test('ベンダーセレクトにオプションが存在する', async ({ page }) => {
    await loginAndGoToIndex(page);
    const optionCount = await page.locator('#vendor option').count();
    expect(optionCount).toBeGreaterThan(1);
  });
});

// ============================================
// 物件選択→端末連動
// ============================================
test.describe('物件選択連動', () => {
  test('物件を選択すると端末セレクトが更新される', async ({ page }) => {
    await loginAndGoToIndex(page);

    // 物件セレクトの最初の実データオプションを選択
    const firstOption = await page.locator('#property option:not([value=""])').first();
    const value = await firstOption.getAttribute('value');
    if (value) {
      await page.selectOption('#property', value);
      await page.waitForTimeout(500);
      const terminalCount = await page.locator('#terminal option').count();
      expect(terminalCount).toBeGreaterThan(0);
    }
  });
});

// ============================================
// カテゴリ→点検種別連動
// ============================================
test.describe('カテゴリ選択連動', () => {
  test('カテゴリを選択すると点検種別が絞り込まれる', async ({ page }) => {
    await loginAndGoToIndex(page);

    const categorySelect = page.locator('#inspectionCategory');
    const hasCategory = await categorySelect.count() > 0;
    if (hasCategory) {
      const allOptions = await page.locator('#inspectionType option').count();
      // カテゴリを選択
      const firstCat = await page.locator('#inspectionCategory option:not([value=""])').first();
      const catVal = await firstCat.getAttribute('value');
      if (catVal) {
        await page.selectOption('#inspectionCategory', catVal);
        await page.waitForTimeout(500);
        const filteredOptions = await page.locator('#inspectionType option').count();
        // フィルタ後はオプション数が変わる（同じか減る）
        expect(filteredOptions).toBeLessThanOrEqual(allOptions);
      }
    }
  });
});

// ============================================
// 表示時間の調整
// ============================================
test.describe('表示時間調整', () => {
  test('adjustTime で値が増減する', async ({ page }) => {
    await loginAndGoToIndex(page);

    const initial = await page.inputValue('#displayTime');
    // +ボタンを押す
    await page.evaluate(() => window.adjustTime(1));
    const increased = await page.inputValue('#displayTime');
    expect(parseInt(increased)).toBe(parseInt(initial) + 1);

    // -ボタンを押す
    await page.evaluate(() => window.adjustTime(-1));
    const restored = await page.inputValue('#displayTime');
    expect(parseInt(restored)).toBe(parseInt(initial));
  });

  test('表示時間は1未満にならない', async ({ page }) => {
    await loginAndGoToIndex(page);

    // evaluate で直接値を設定してからadjustTime
    await page.evaluate(() => {
      document.getElementById('displayTime').value = '1';
      window.adjustTime(-1);
    });
    const val = await page.inputValue('#displayTime');
    expect(parseInt(val)).toBeGreaterThanOrEqual(1);
  });
});

// ============================================
// 位置選択
// ============================================
test.describe('位置選択', () => {
  test('setPosition でラジオボタンが更新される', async ({ page }) => {
    await loginAndGoToIndex(page);

    await page.evaluate(() => window.setPosition(1));
    const checked = await page.locator('input[name="displayPosition"]:checked').inputValue();
    expect(checked).toBe('1');

    await page.evaluate(() => window.setPosition(3));
    const checked2 = await page.locator('input[name="displayPosition"]:checked').inputValue();
    expect(checked2).toBe('3');
  });
});

// ============================================
// エントリ追加・削除
// ============================================
test.describe('エントリ管理', () => {
  test('必須項目未入力でaddEntryするとエントリが追加されない', async ({ page }) => {
    await loginAndGoToIndex(page);

    // フォームをクリアした状態でaddEntry
    await page.evaluate(() => window.clearForm());
    const before = await page.locator('#dataCount').textContent();
    await page.evaluate(() => window.addEntry());
    await page.waitForTimeout(500);
    const after = await page.locator('#dataCount').textContent();
    // エントリ数が増えていないこと（バリデーションエラー）
    expect(after).toBe(before);
  });

  test('全項目入力後にaddEntryでエントリが追加される', async ({ page }) => {
    await loginAndGoToIndex(page);

    // 必要な項目を入力
    const propertyOpt = await page.locator('#property option:not([value=""])').first();
    const propVal = await propertyOpt.getAttribute('value');
    if (propVal) {
      await page.selectOption('#property', propVal);
      await page.evaluate(() => window.onPropertyChange());
      await page.waitForTimeout(500);
    }

    // 端末を選択
    const termOpt = await page.locator('#terminal option:not([value=""])').first();
    const termVal = await termOpt.getAttribute('value');
    if (termVal) {
      await page.selectOption('#terminal', termVal);
    }

    // ベンダー（hidden input）- init()で自動設定済み、値を確認
    const vendorVal = await page.inputValue('#vendor');
    expect(vendorVal).toBeTruthy();

    // 点検種別を選択
    const inspOpt = await page.locator('#inspectionType option:not([value=""])').first();
    const inspVal = await inspOpt.getAttribute('value');
    if (inspVal) {
      await page.selectOption('#inspectionType', inspVal);
      await page.evaluate(() => window.onInspectionTypeChange());
    }

    // 日付入力
    const today = new Date().toISOString().split('T')[0];
    await page.fill('#startDate', today);
    await page.fill('#endDate', today);

    // エントリ追加
    await page.evaluate(() => window.addEntry());
    await page.waitForTimeout(500);

    const count = await page.locator('#dataCount').textContent();
    expect(parseInt(count || '0')).toBeGreaterThanOrEqual(1);
  });

  test('clearFormでフォームがリセットされる', async ({ page }) => {
    await loginAndGoToIndex(page);

    // フォームに値を設定
    await page.fill('#remarks', 'テスト備考');
    await page.evaluate(() => window.clearForm());

    const remarks = await page.inputValue('#remarks');
    expect(remarks).toBe('');
  });
});

// ============================================
// CSV生成
// ============================================
test.describe('CSV生成', () => {
  test('エントリ追加後にCSVが生成できる', async ({ page }) => {
    await loginAndGoToIndex(page);

    // エントリを追加
    const propertyOpt = await page.locator('#property option:not([value=""])').first();
    const propVal = await propertyOpt.getAttribute('value');
    if (propVal) {
      await page.selectOption('#property', propVal);
      await page.evaluate(() => window.onPropertyChange());
      await page.waitForTimeout(500);
    }
    const termOpt = await page.locator('#terminal option:not([value=""])').first();
    const termVal = await termOpt.getAttribute('value');
    if (termVal) await page.selectOption('#terminal', termVal);

    // ベンダー（hidden input）- init()で自動設定済み
    const vendorVal = await page.inputValue('#vendor');
    expect(vendorVal).toBeTruthy();

    const inspOpt = await page.locator('#inspectionType option:not([value=""])').first();
    const inspVal = await inspOpt.getAttribute('value');
    if (inspVal) {
      await page.selectOption('#inspectionType', inspVal);
      await page.evaluate(() => window.onInspectionTypeChange());
    }

    const today = new Date().toISOString().split('T')[0];
    await page.fill('#startDate', today);
    await page.fill('#endDate', today);
    await page.evaluate(() => window.addEntry());
    await page.waitForTimeout(500);

    // CSVプレビュー
    await page.evaluate(() => window.previewCSV());
    await page.waitForTimeout(500);

    const csvContent = await page.locator('#csvPreview').textContent();
    expect(csvContent).toContain('点検CO');
    expect(csvContent).toContain('端末ID');
    // 28列ヘッダーの確認
    const headerLine = csvContent?.split('\n')[0] || '';
    const columns = headerLine.split(',');
    expect(columns.length).toBe(28);
  });

  test('CSVプレビューモーダルが開閉できる', async ({ page }) => {
    await loginAndGoToIndex(page);

    // モーダルを開く
    await page.evaluate(() => {
      document.getElementById('csvPreview').textContent = 'test';
      document.getElementById('previewModal').classList.add('active');
    });
    await expect(page.locator('#previewModal.active')).toBeVisible();

    // Escapeで閉じる
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    const isActive = await page.locator('#previewModal').evaluate(el => el.classList.contains('active'));
    expect(isActive).toBe(false);
  });
});

// ============================================
// 貼紙タイプ切替
// ============================================
test.describe('貼紙タイプ切替', () => {
  test('カスタム貼紙に切り替えるとファイル入力が表示される', async ({ page }) => {
    await loginAndGoToIndex(page);

    // カスタムを選択
    await page.click('input[name="posterType"][value="custom"]');
    await page.evaluate(() => window.onPosterTypeChange());
    await page.waitForTimeout(500);

    const customSection = page.locator('#customImageSection, .custom-upload-section');
    // カスタムモード時はカスタム画像セクションが表示される
    const isVisible = await customSection.isVisible().catch(() => false);
    // テンプレートセクションが非表示になることを確認
    const templateHidden = await page.evaluate(() => {
      const el = document.getElementById('templatePreviewSection') || document.querySelector('.template-section');
      return el ? el.style.display === 'none' || el.classList.contains('hidden') : true;
    });
    expect(isVisible || templateHidden).toBeTruthy();
  });

  test('テンプレートに戻すとテンプレートプレビューが復帰する', async ({ page }) => {
    await loginAndGoToIndex(page);

    // カスタム→テンプレートに切替
    await page.click('input[name="posterType"][value="custom"]');
    await page.evaluate(() => window.onPosterTypeChange());
    await page.waitForTimeout(300);

    await page.click('input[name="posterType"][value="template"]');
    await page.evaluate(() => window.onPosterTypeChange());
    await page.waitForTimeout(300);

    // テンプレートモードが有効
    const checked = await page.locator('input[name="posterType"]:checked').inputValue();
    expect(checked).toBe('template');
  });
});

// ============================================
// プレビュー表示
// ============================================
test.describe('プレビュー表示', () => {
  test('点検種別選択後にプレビューが表示される', async ({ page }) => {
    await loginAndGoToIndex(page);

    // 点検種別を選択
    const inspOpt = await page.locator('#inspectionType option:not([value=""])').first();
    const inspVal = await inspOpt.getAttribute('value');
    if (inspVal) {
      await page.selectOption('#inspectionType', inspVal);
      await page.evaluate(() => window.onInspectionTypeChange());
      await page.waitForTimeout(1000);

      const preview = page.locator('#posterPreview');
      const hasContent = await preview.evaluate(el => el.innerHTML.trim().length > 0);
      expect(hasContent).toBeTruthy();
    }
  });

  test('updatePreviewが呼び出し可能', async ({ page }) => {
    await loginAndGoToIndex(page);

    const hasFunction = await page.evaluate(() => typeof window.updatePreview === 'function');
    expect(hasFunction).toBe(true);
  });
});

// ============================================
// window.* エクスポート確認
// ============================================
test.describe('window エクスポート', () => {
  test('全ての必須関数がwindowに公開されている', async ({ page }) => {
    await loginAndGoToIndex(page);

    const functions = [
      'initScript', 'onPropertyChange', 'onVendorChange', 'onCategoryChange',
      'onInspectionTypeChange', 'onPosterTypeChange', 'clearForm', 'addEntry',
      'duplicateLastEntry', 'downloadCSV', 'copyCSV', 'previewCSV',
      'submitEntries', 'clearCustomImage', 'onImageSelected', 'adjustTime',
      'setPosition', 'updatePreview', 'closeModal', 'onAdminVendorChange',
      'openBuildingRequestModal'
    ];

    const results = await page.evaluate((fns) => {
      return fns.map(fn => ({ name: fn, exists: typeof window[fn] === 'function' }));
    }, functions);

    for (const r of results) {
      expect(r.exists, `window.${r.name} should be a function`).toBe(true);
    }
  });
});

// ============================================
// テンプレート画像
// ============================================
test.describe('テンプレート画像', () => {
  test('getTemplateImageUrl がwindowスコープで利用可能', async ({ page }) => {
    await loginAndGoToIndex(page);

    const hasFunction = await page.evaluate(() => typeof getTemplateImageUrl === 'function');
    expect(hasFunction).toBe(true);
  });

  test('存在するキーでURLが返る', async ({ page }) => {
    await loginAndGoToIndex(page);

    const url = await page.evaluate(() => getTemplateImageUrl('cleaning'));
    expect(url).toBeTruthy();
    expect(url).toContain('cleaning');
  });

  test('存在しないキーでnullが返る', async ({ page }) => {
    await loginAndGoToIndex(page);

    const url = await page.evaluate(() => getTemplateImageUrl('nonexistent_key_12345'));
    expect(url).toBeNull();
  });
});
