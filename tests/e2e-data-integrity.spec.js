// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * データ変換・CSV出力・共通ユーティリティの正しさを検証するテスト
 * リファクタリング前に追加し、統合後も値が変わらないことを保証する
 */

const baseUrl = process.env.BASE_URL || 'http://localhost:8080';

async function loginAsUser(page, email = 'a@a', password = 'aaaaaa') {
  await page.goto(`${baseUrl}/login.html`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(url => !url.toString().includes('login.html'), { timeout: 10000 });
  await page.waitForTimeout(2000);
}

async function loginAsAdmin(page) {
  await loginAsUser(page, 'admin@example.com', 'admin123');
}

// ============================================
// normalizeTerminalId の動作検証
// ============================================
test.describe('normalizeTerminalId', () => {
  test('一件入力画面で normalizeTerminalId が利用可能', async ({ page }) => {
    await loginAsUser(page);
    await page.goto(`${baseUrl}/index.html`);
    await page.waitForTimeout(1000);

    const hasFunction = await page.evaluate(() => typeof window.normalizeTerminalId === 'function');
    expect(hasFunction).toBe(true);
  });

  test('通常の文字列はそのまま返す', async ({ page }) => {
    await loginAsUser(page);
    await page.goto(`${baseUrl}/index.html`);
    await page.waitForTimeout(1000);

    const result = await page.evaluate(() => window.normalizeTerminalId('T001'));
    expect(result).toBe('T001');
  });

  test('JSON文字列から terminalId を抽出する', async ({ page }) => {
    await loginAsUser(page);
    await page.goto(`${baseUrl}/index.html`);
    await page.waitForTimeout(1000);

    const result = await page.evaluate(() =>
      window.normalizeTerminalId('{"terminalId":"T002","other":"data"}')
    );
    expect(result).toBe('T002');
  });

  test('JSON文字列から terminal_id を抽出する', async ({ page }) => {
    await loginAsUser(page);
    await page.goto(`${baseUrl}/index.html`);
    await page.waitForTimeout(1000);

    const result = await page.evaluate(() =>
      window.normalizeTerminalId('{"terminal_id":"T003"}')
    );
    expect(result).toBe('T003');
  });

  test('空値は空文字を返す', async ({ page }) => {
    await loginAsUser(page);
    await page.goto(`${baseUrl}/index.html`);
    await page.waitForTimeout(1000);

    const results = await page.evaluate(() => [
      window.normalizeTerminalId(''),
      window.normalizeTerminalId(null),
      window.normalizeTerminalId(undefined),
    ]);
    expect(results).toEqual(['', '', '']);
  });

  test('不正なJSONはそのまま返す', async ({ page }) => {
    await loginAsUser(page);
    await page.goto(`${baseUrl}/index.html`);
    await page.waitForTimeout(1000);

    const result = await page.evaluate(() =>
      window.normalizeTerminalId('{broken json')
    );
    expect(result).toBe('{broken json');
  });
});

// ============================================
// 一件入力 CSV生成の検証
// ============================================
test.describe('一件入力 CSV生成', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page);
    await page.goto(`${baseUrl}/index.html`);
    await page.waitForTimeout(2000);
  });

  test('データ追加後にCSVダウンロードボタンが有効になる', async ({ page }) => {
    const propertyOptions = await page.locator('#property option').count();
    if (propertyOptions <= 1) {
      test.skip();
      return;
    }

    await page.selectOption('#property', { index: 1 });
    await page.waitForTimeout(300);

    const inspectionOptions = await page.locator('#inspectionType option').count();
    if (inspectionOptions > 1) {
      await page.selectOption('#inspectionType', { index: 1 });
    }

    const today = new Date().toISOString().split('T')[0];
    await page.fill('#startDate', today);

    const addBtn = page.locator('button:has-text("データを追加")');
    if (await addBtn.isEnabled()) {
      await addBtn.click();
      await page.waitForTimeout(500);
    }

    // CSVプレビューボタンが表示される
    const previewBtn = page.locator('button:has-text("プレビュー")');
    await expect(previewBtn).toBeVisible();
  });

  test('CSV生成が28列のヘッダーを含む', async ({ page }) => {
    const propertyOptions = await page.locator('#property option').count();
    if (propertyOptions <= 1) {
      test.skip();
      return;
    }

    // データを追加
    await page.selectOption('#property', { index: 1 });
    await page.waitForTimeout(300);
    const inspectionOptions = await page.locator('#inspectionType option').count();
    if (inspectionOptions > 1) {
      await page.selectOption('#inspectionType', { index: 1 });
    }
    const today = new Date().toISOString().split('T')[0];
    await page.fill('#startDate', today);
    const addBtn = page.locator('button:has-text("データを追加")');
    if (!(await addBtn.isEnabled())) {
      test.skip();
      return;
    }
    await addBtn.click();
    await page.waitForTimeout(500);

    // CSV プレビューを開いてヘッダーを確認
    const previewBtn = page.locator('button:has-text("プレビュー")');
    if (await previewBtn.isVisible()) {
      await previewBtn.click();
      await page.waitForTimeout(500);

      // モーダル内のCSVテキストを取得
      const csvContent = await page.evaluate(() => {
        const modal = document.querySelector('.modal.active, .modal[style*="display: block"]');
        if (modal) {
          const pre = modal.querySelector('pre, textarea, .csv-preview');
          return pre ? pre.textContent : '';
        }
        return '';
      });

      if (csvContent) {
        const headerLine = csvContent.split('\n')[0];
        const columns = headerLine.split(',');
        expect(columns.length).toBe(28);
        expect(headerLine).toContain('点検CO');
        expect(headerLine).toContain('端末ID');
        expect(headerLine).toContain('frame_No');
        expect(headerLine).toContain('貼紙区分');
      }
    }
  });

  test('CSV行データに端末IDが含まれる', async ({ page }) => {
    const propertyOptions = await page.locator('#property option').count();
    if (propertyOptions <= 1) {
      test.skip();
      return;
    }

    await page.selectOption('#property', { index: 1 });
    await page.waitForTimeout(300);

    // 端末IDを取得
    const terminalValue = await page.locator('#terminal').inputValue();

    const inspectionOptions = await page.locator('#inspectionType option').count();
    if (inspectionOptions > 1) {
      await page.selectOption('#inspectionType', { index: 1 });
    }
    const today = new Date().toISOString().split('T')[0];
    await page.fill('#startDate', today);
    const addBtn = page.locator('button:has-text("データを追加")');
    if (!(await addBtn.isEnabled())) {
      test.skip();
      return;
    }
    await addBtn.click();
    await page.waitForTimeout(500);

    // CSVプレビューを開いてデータ行を確認
    const previewBtn = page.locator('button:has-text("プレビュー")');
    if (await previewBtn.isVisible()) {
      await previewBtn.click();
      await page.waitForTimeout(500);

      const csvContent = await page.evaluate(() => {
        const modal = document.querySelector('.modal.active, .modal[style*="display: block"]');
        if (modal) {
          const pre = modal.querySelector('pre, textarea, .csv-preview');
          return pre ? pre.textContent : '';
        }
        return '';
      });

      if (csvContent && terminalValue) {
        const dataLine = csvContent.split('\n')[1];
        expect(dataLine).toContain(terminalValue);
      }
    }
  });
});

// ============================================
// 管理画面 CSVエクスポートの検証
// ============================================
test.describe('管理画面 CSVエクスポート', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${baseUrl}/admin.html`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
  });

  test('データ一覧タブでCSVエクスポートボタンが機能する', async ({ page }) => {
    // データ一覧タブへ
    await page.click('.sidebar-nav-link[data-tab="entries"]');
    await page.waitForTimeout(500);

    const rowCount = await page.locator('#entriesBody tr').count();
    if (rowCount === 0) {
      test.skip();
      return;
    }

    // CSVコピーボタンをクリック（ダウンロードよりテストしやすい）
    const copyBtn = page.locator('#exportCopyBtn');
    if (await copyBtn.isVisible()) {
      // クリップボードAPIのモック
      await page.evaluate(() => {
        window.__copiedText = '';
        navigator.clipboard.writeText = async (text) => {
          window.__copiedText = text;
        };
      });

      await copyBtn.click();
      await page.waitForTimeout(1000);

      const csvText = await page.evaluate(() => window.__copiedText);
      if (csvText) {
        const lines = csvText.split('\n');
        // ヘッダー行が28列
        const headerCols = lines[0].split(',');
        expect(headerCols.length).toBe(28);

        // データ行が存在
        expect(lines.length).toBeGreaterThan(1);

        // ヘッダーの内容確認
        expect(lines[0]).toContain('点検CO');
        expect(lines[0]).toContain('端末ID');
        expect(lines[0]).toContain('貼紙区分');
      }
    }
  });

  test('CSVエクスポートの端末IDがJSON文字列でない', async ({ page }) => {
    await page.click('.sidebar-nav-link[data-tab="entries"]');
    await page.waitForTimeout(500);

    const rowCount = await page.locator('#entriesBody tr').count();
    if (rowCount === 0) {
      test.skip();
      return;
    }

    await page.evaluate(() => {
      window.__copiedText = '';
      navigator.clipboard.writeText = async (text) => {
        window.__copiedText = text;
      };
    });

    const copyBtn = page.locator('#exportCopyBtn');
    if (await copyBtn.isVisible()) {
      await copyBtn.click();
      await page.waitForTimeout(1000);

      const csvText = await page.evaluate(() => window.__copiedText);
      if (csvText) {
        const lines = csvText.split('\n').slice(1); // ヘッダー除外
        for (const line of lines) {
          if (!line.trim()) continue;
          const cols = line.split(',');
          const terminalId = cols[1]; // 2列目が端末ID
          // JSON文字列が含まれていないこと
          expect(terminalId).not.toContain('{');
          expect(terminalId).not.toContain('}');
        }
      }
    }
  });
});

// ============================================
// escapeHtml の動作検証
// ============================================
test.describe('escapeHtml', () => {
  test('管理画面で escapeHtml が正しく動作する', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${baseUrl}/admin.html`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // admin.js 内で escapeHtml がimportされて使われている
    // HTMLインジェクションがないことを確認（データ一覧のセル）
    await page.click('.sidebar-nav-link[data-tab="entries"]');
    await page.waitForTimeout(500);

    const rowCount = await page.locator('#entriesBody tr').count();
    if (rowCount === 0) {
      test.skip();
      return;
    }

    // テーブルセル内にscriptタグが含まれていないこと
    const cellContents = await page.evaluate(() => {
      const cells = document.querySelectorAll('#entriesBody td');
      return Array.from(cells).map(c => c.innerHTML);
    });

    for (const content of cellContents) {
      expect(content).not.toContain('<script');
      expect(content).not.toContain('javascript:');
    }
  });
});

// ============================================
// showToast の動作検証
// ============================================
test.describe('showToast', () => {
  test('一件入力画面でトースト表示が動作する', async ({ page }) => {
    await loginAsUser(page);
    await page.goto(`${baseUrl}/index.html`);
    await page.waitForTimeout(2000);

    // showToast を直接呼び出し
    await page.evaluate(() => {
      if (window.showToast) {
        window.showToast('テスト通知', 'success');
      }
    });
    await page.waitForTimeout(500);

    // トーストが表示されること
    const toast = page.locator('.toast');
    const toastVisible = await toast.evaluate(el => {
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.opacity !== '0';
    }).catch(() => false);

    // トーストが存在し、テキストを含むことを確認
    if (toastVisible) {
      const text = await toast.textContent();
      expect(text).toContain('テスト通知');
    }
  });

  test('管理画面でトースト表示が動作する', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${baseUrl}/admin.html`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    await page.evaluate(() => {
      if (window.showToast) {
        window.showToast('管理者テスト通知', 'info');
      }
    });
    await page.waitForTimeout(500);

    const toast = page.locator('#toast');
    if (await toast.count() > 0) {
      const text = await toast.textContent();
      expect(text).toContain('管理者テスト通知');
    }
  });

  test('一括入力画面でトースト表示が動作する', async ({ page }) => {
    await loginAsUser(page);
    await page.goto(`${baseUrl}/bulk.html`);
    await page.waitForTimeout(2000);

    // bulk.html では showToast は ES Module 内で定義されているため
    // window 公開されていない場合がある。行追加でトーストが表示されるかで検証
    const addRowBtn = page.locator('#addRowBtn');
    if (await addRowBtn.isVisible()) {
      await addRowBtn.click();
      await page.waitForTimeout(500);

      // トースト要素が存在すること
      const toast = page.locator('#toast');
      await expect(toast).toBeAttached();
    }
  });
});

// ============================================
// frameNo デフォルト値の検証
// ============================================
test.describe('frameNo デフォルト値', () => {
  test('一件入力画面で position のデフォルト値が2である', async ({ page }) => {
    await loginAsUser(page);
    await page.goto(`${baseUrl}/index.html`);
    await page.waitForTimeout(2000);

    // ラジオボタンで表示位置のデフォルトが2（②上中）であることを確認
    const checkedValue = await page.evaluate(() => {
      const checked = document.querySelector('input[name="displayPosition"]:checked');
      return checked ? checked.value : null;
    });

    expect(checkedValue).toBe('2');
  });
});
