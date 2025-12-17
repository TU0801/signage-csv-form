/**
 * UI機能テスト
 * 分割前後で同じテストを実行し、動作に問題がないことを確認する
 */

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

// テスト結果を格納
const results = {
    passed: 0,
    failed: 0,
    tests: []
};

function test(name, fn) {
    try {
        fn();
        results.passed++;
        results.tests.push({ name, status: 'PASS' });
        console.log(`✓ ${name}`);
    } catch (error) {
        results.failed++;
        results.tests.push({ name, status: 'FAIL', error: error.message });
        console.log(`✗ ${name}`);
        console.log(`  Error: ${error.message}`);
    }
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(`${message}: expected "${expected}", got "${actual}"`);
    }
}

function assertTrue(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function assertExists(element, message) {
    if (!element) {
        throw new Error(message);
    }
}

async function runTests() {
    console.log('='.repeat(50));
    console.log('サイネージCSVフォーム UI テスト');
    console.log('='.repeat(50));
    console.log('');

    // HTMLファイルを読み込み
    const htmlPath = path.join(__dirname, '..', 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf-8');

    // JSDOMでDOMを作成
    const dom = new JSDOM(html, {
        runScripts: 'dangerously',
        resources: 'usable',
        url: 'http://localhost/'
    });

    const { window } = dom;
    const { document } = window;

    // 外部スクリプトを手動で読み込み・実行
    const scriptsToLoad = [
        path.join(__dirname, '..', 'data', 'templates.js'),
        path.join(__dirname, '..', 'data', 'master.js'),
        path.join(__dirname, '..', 'js', 'app.js')
    ];

    for (const scriptPath of scriptsToLoad) {
        if (fs.existsSync(scriptPath)) {
            const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
            const scriptEl = document.createElement('script');
            scriptEl.textContent = scriptContent;
            document.head.appendChild(scriptEl);
        }
    }

    // スクリプトの実行を待つ
    await new Promise(resolve => setTimeout(resolve, 500));

    console.log('【1. HTML構造テスト】');
    console.log('-'.repeat(30));

    test('ヘッダーが存在する', () => {
        const header = document.querySelector('.header');
        assertExists(header, 'ヘッダー要素が見つからない');
    });

    test('タイトルが正しい', () => {
        const title = document.querySelector('title');
        assertEqual(title.textContent, '点検CSV作成フォーム', 'タイトルが異なる');
    });

    test('メインレイアウトが存在する', () => {
        const layout = document.querySelector('.main-layout');
        assertExists(layout, 'メインレイアウトが見つからない');
    });

    console.log('');
    console.log('【2. フォーム要素テスト】');
    console.log('-'.repeat(30));

    test('物件選択が存在する', () => {
        const select = document.getElementById('property');
        assertExists(select, '物件選択が見つからない');
        assertEqual(select.tagName, 'SELECT', '物件要素がSELECTではない');
    });

    test('端末番号選択が存在する', () => {
        const select = document.getElementById('terminal');
        assertExists(select, '端末番号選択が見つからない');
    });

    test('受注先選択が存在する', () => {
        const select = document.getElementById('vendor');
        assertExists(select, '受注先選択が見つからない');
    });

    test('緊急連絡先入力が存在する', () => {
        const input = document.getElementById('emergencyContact');
        assertExists(input, '緊急連絡先入力が見つからない');
    });

    test('点検種類選択が存在する', () => {
        const select = document.getElementById('inspectionType');
        assertExists(select, '点検種類選択が見つからない');
    });

    test('お知らせ文入力が存在する', () => {
        const textarea = document.getElementById('noticeText');
        assertExists(textarea, 'お知らせ文入力が見つからない');
    });

    test('開始日入力が存在する', () => {
        const input = document.getElementById('startDate');
        assertExists(input, '開始日入力が見つからない');
        assertEqual(input.type, 'date', '開始日の入力タイプが異なる');
    });

    test('終了日入力が存在する', () => {
        const input = document.getElementById('endDate');
        assertExists(input, '終了日入力が見つからない');
    });

    test('備考入力が存在する', () => {
        const textarea = document.getElementById('remarks');
        assertExists(textarea, '備考入力が見つからない');
    });

    test('表示時間入力が存在する', () => {
        const input = document.getElementById('displayTime');
        assertExists(input, '表示時間入力が見つからない');
        assertEqual(input.type, 'number', '表示時間の入力タイプが異なる');
    });

    test('掲示板表示チェックボックスが存在する', () => {
        const checkbox = document.getElementById('showOnBoard');
        assertExists(checkbox, '掲示板表示チェックボックスが見つからない');
    });

    console.log('');
    console.log('【3. プレビュー要素テスト】');
    console.log('-'.repeat(30));

    test('ポスタープレビューエリアが存在する', () => {
        const preview = document.getElementById('posterPreview');
        assertExists(preview, 'ポスタープレビューエリアが見つからない');
    });

    test('位置選択グリッドが存在する', () => {
        const grid = document.querySelector('.position-grid');
        assertExists(grid, '位置選択グリッドが見つからない');
    });

    test('位置選択セルが5つ存在する', () => {
        const cells = document.querySelectorAll('.position-cell');
        assertEqual(cells.length, 5, '位置選択セルの数が異なる');
    });

    console.log('');
    console.log('【4. データ一覧テスト】');
    console.log('-'.repeat(30));

    test('データ一覧エリアが存在する', () => {
        const dataList = document.getElementById('dataList');
        assertExists(dataList, 'データ一覧エリアが見つからない');
    });

    test('データカウントが存在する', () => {
        const count = document.getElementById('dataCount');
        assertExists(count, 'データカウントが見つからない');
        assertEqual(count.textContent, '0', '初期カウントが0でない');
    });

    test('エクスポートボタンセクションが存在する', () => {
        const section = document.getElementById('exportSection');
        assertExists(section, 'エクスポートボタンセクションが見つからない');
    });

    console.log('');
    console.log('【5. モーダルテスト】');
    console.log('-'.repeat(30));

    test('プレビューモーダルが存在する', () => {
        const modal = document.getElementById('previewModal');
        assertExists(modal, 'プレビューモーダルが見つからない');
    });

    test('CSVプレビューエリアが存在する', () => {
        const preview = document.getElementById('csvPreview');
        assertExists(preview, 'CSVプレビューエリアが見つからない');
    });

    console.log('');
    console.log('【6. データ・関数テスト】');
    console.log('-'.repeat(30));

    test('templateImagesが定義されている', () => {
        assertTrue(typeof window.templateImages === 'object', 'templateImagesが定義されていない');
        assertTrue(Object.keys(window.templateImages).length > 0, 'templateImagesが空');
    });

    test('masterDataが定義されている', () => {
        assertTrue(typeof window.masterData === 'object', 'masterDataが定義されていない');
    });

    test('masterData.propertiesが配列である', () => {
        assertTrue(Array.isArray(window.masterData.properties), 'masterData.propertiesが配列でない');
        assertTrue(window.masterData.properties.length > 0, 'masterData.propertiesが空');
    });

    test('masterData.vendorsが配列である', () => {
        assertTrue(Array.isArray(window.masterData.vendors), 'masterData.vendorsが配列でない');
        assertTrue(window.masterData.vendors.length > 0, 'masterData.vendorsが空');
    });

    test('masterData.noticesが配列である', () => {
        assertTrue(Array.isArray(window.masterData.notices), 'masterData.noticesが配列でない');
        assertTrue(window.masterData.notices.length > 0, 'masterData.noticesが空');
    });

    test('init関数が定義されている', () => {
        assertTrue(typeof window.init === 'function', 'init関数が定義されていない');
    });

    test('addEntry関数が定義されている', () => {
        assertTrue(typeof window.addEntry === 'function', 'addEntry関数が定義されていない');
    });

    test('generateCSV関数が定義されている', () => {
        assertTrue(typeof window.generateCSV === 'function', 'generateCSV関数が定義されていない');
    });

    test('downloadCSV関数が定義されている', () => {
        assertTrue(typeof window.downloadCSV === 'function', 'downloadCSV関数が定義されていない');
    });

    test('updatePreview関数が定義されている', () => {
        assertTrue(typeof window.updatePreview === 'function', 'updatePreview関数が定義されていない');
    });

    console.log('');
    console.log('【7. 初期化後の状態テスト】');
    console.log('-'.repeat(30));

    // init()を実行
    if (typeof window.init === 'function') {
        window.init();
    }

    test('物件選択にオプションが追加されている', () => {
        const select = document.getElementById('property');
        // デフォルトオプション + 物件数
        assertTrue(select.options.length > 1, '物件オプションが追加されていない');
    });

    test('受注先選択にオプションが追加されている', () => {
        const select = document.getElementById('vendor');
        assertTrue(select.options.length > 1, '受注先オプションが追加されていない');
    });

    test('点検種類選択にオプションが追加されている', () => {
        const select = document.getElementById('inspectionType');
        assertTrue(select.options.length > 1, '点検種類オプションが追加されていない');
    });

    test('getUrlConfig関数が定義されている', () => {
        assertTrue(typeof window.getUrlConfig === 'function', 'getUrlConfig関数が定義されていない');
    });

    // Close first DOM for URL parameter tests
    dom.window.close();

    // URL parameter tests
    console.log('');
    console.log('【8. URLパラメータテスト】');
    console.log('-'.repeat(30));

    await runUrlParamTests();

    // 結果サマリー
    console.log('');
    console.log('='.repeat(50));
    console.log(`結果: ${results.passed} passed, ${results.failed} failed`);
    console.log('='.repeat(50));

    // 終了コード
    process.exit(results.failed > 0 ? 1 : 0);
}

async function createDomWithUrl(urlParams = '') {
    const htmlPath = path.join(__dirname, '..', 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf-8');
    const url = `http://localhost/${urlParams ? '?' + urlParams : ''}`;

    const dom = new JSDOM(html, {
        runScripts: 'dangerously',
        resources: 'usable',
        url: url
    });

    const { window } = dom;
    const { document } = window;

    const scriptsToLoad = [
        path.join(__dirname, '..', 'data', 'templates.js'),
        path.join(__dirname, '..', 'data', 'master.js'),
        path.join(__dirname, '..', 'js', 'app.js')
    ];

    for (const scriptPath of scriptsToLoad) {
        if (fs.existsSync(scriptPath)) {
            const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
            const scriptEl = document.createElement('script');
            scriptEl.textContent = scriptContent;
            document.head.appendChild(scriptEl);
        }
    }

    await new Promise(resolve => setTimeout(resolve, 300));
    return { dom, window, document };
}

async function runUrlParamTests() {
    // Test: vendor parameter sets default
    {
        const { dom, window, document } = await createDomWithUrl('vendor=1');
        test('vendorパラメータでデフォルト値が設定される', () => {
            const config = window.getUrlConfig();
            assertEqual(config.vendor, 1, 'vendor設定値が異なる');
            const vendorSelect = document.getElementById('vendor');
            assertEqual(vendorSelect.value, '1', '受注先のデフォルト値が設定されていない');
        });
        dom.window.close();
    }

    // Test: vendors parameter filters options
    {
        const { dom, window, document } = await createDomWithUrl('vendors=0,2');
        test('vendorsパラメータで受注先がフィルタされる', () => {
            const config = window.getUrlConfig();
            assertTrue(Array.isArray(config.vendors), 'vendorsが配列でない');
            assertEqual(config.vendors.length, 2, 'vendors配列の長さが異なる');
            const vendorSelect = document.getElementById('vendor');
            // default option + 2 filtered options
            assertEqual(vendorSelect.options.length, 3, '受注先オプション数が異なる');
        });
        dom.window.close();
    }

    // Test: property parameter sets default
    {
        const { dom, window, document } = await createDomWithUrl('property=1001');
        test('propertyパラメータでデフォルト値が設定される', () => {
            const config = window.getUrlConfig();
            assertEqual(config.property, 1001, 'property設定値が異なる');
        });
        dom.window.close();
    }

    // Test: hideRemarks parameter
    {
        const { dom, window, document } = await createDomWithUrl('hideRemarks=true');
        test('hideRemarksパラメータで備考欄が非表示になる', () => {
            const config = window.getUrlConfig();
            assertTrue(config.hideRemarks, 'hideRemarksが設定されていない');
            const remarksGroup = document.getElementById('remarks')?.closest('.form-group');
            if (remarksGroup) {
                assertEqual(remarksGroup.style.display, 'none', '備考欄が非表示になっていない');
            }
        });
        dom.window.close();
    }

    // Test: showAll parameter
    {
        const { dom, window, document } = await createDomWithUrl('showAll=true&vendors=0');
        test('showAllパラメータでフィルタが無効になる', () => {
            const config = window.getUrlConfig();
            assertTrue(config.showAll, 'showAllが設定されていない');
            const vendorSelect = document.getElementById('vendor');
            // With showAll=true, vendors filter should be ignored
            assertTrue(vendorSelect.options.length > 2, 'showAllでフィルタが無効になっていない');
        });
        dom.window.close();
    }

    // Test: templates parameter
    {
        const { dom, window, document } = await createDomWithUrl('templates=exchange_light_battery_2');
        test('templatesパラメータで点検種類がフィルタされる', () => {
            const config = window.getUrlConfig();
            assertTrue(Array.isArray(config.templates), 'templatesが配列でない');
            assertEqual(config.templates[0], 'exchange_light_battery_2', 'テンプレート値が異なる');
        });
        dom.window.close();
    }

    // Test: hideRemarks=false should not hide
    {
        const { dom, window, document } = await createDomWithUrl('hideRemarks=false');
        test('hideRemarks=falseで備考欄が表示される', () => {
            const config = window.getUrlConfig();
            assertTrue(!config.hideRemarks, 'hideRemarks=falseが正しく処理されていない');
        });
        dom.window.close();
    }
}

runTests().catch(error => {
    console.error('テスト実行エラー:', error);
    process.exit(1);
});
