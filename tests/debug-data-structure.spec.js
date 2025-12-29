// @ts-check
/**
 * デバッグテスト: データ構造確認
 */

const { test, expect } = require('@playwright/test');
const { setupAuthMockWithMasterData } = require('./test-helpers');

test('bulk.htmlのmasterDataを確認', async ({ page }) => {
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  await setupAuthMockWithMasterData(page, 'http://localhost:8080/bulk.html', {
    isAuthenticated: true
  });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // bulk-state.jsのmasterDataを確認
  const debug = await page.evaluate(() => {
    // @ts-ignore - __BULK_STATE__をテスト用に公開しているか確認
    const state = window.__BULK_STATE__;
    if (state && state.masterData) {
      const data = state.masterData;
      return {
        source: 'window.__BULK_STATE__',
        hasProperties: Array.isArray(data.properties),
        propertiesCount: data.properties?.length,
        firstProperty: data.properties?.[0],
        propertiesStructure: data.properties?.slice(0, 2).map(p => ({
          property_code: p.property_code,
          property_name: p.property_name,
          hasTerminals: 'terminals' in p,
          terminalsType: typeof p.terminals,
          terminalsIsArray: Array.isArray(p.terminals),
          terminalsCount: Array.isArray(p.terminals) ? p.terminals.length : 0,
          firstTerminal: Array.isArray(p.terminals) ? p.terminals[0] : null
        }))
      };
    }
    return { source: 'not found', error: '__BULK_STATE__ not available' };
  });

  console.log('Bulk masterData debug:', JSON.stringify(debug, null, 2));

  if (debug.source !== 'not found') {
    expect(debug.hasProperties).toBe(true);
    expect(debug.propertiesCount).toBeGreaterThan(0);

    // 物件が正しい構造を持っているか確認
    if (debug.propertiesStructure && debug.propertiesStructure.length > 0) {
      const firstProp = debug.propertiesStructure[0];
      console.log('First property structure:', firstProp);
      expect(firstProp.hasTerminals).toBe(true);
      expect(firstProp.terminalsIsArray).toBe(true);
      expect(firstProp.terminalsCount).toBeGreaterThan(0);
    }
  }
});

test('bulk.html: 行追加と物件選択でのmasterData参照を確認', async ({ page }) => {
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  await setupAuthMockWithMasterData(page, 'http://localhost:8080/bulk.html', {
    isAuthenticated: true
  });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // 行を追加
  await page.locator('#addRowBtn').click();
  await page.waitForTimeout(500);

  // 物件を選択
  const firstRow = page.locator('.bulk-table tbody tr').first();
  await firstRow.locator('.property-select').selectOption('2010');
  await page.waitForTimeout(1000);

  // 端末セレクトボックスの状態を確認
  const terminalInfo = await page.evaluate(() => {
    const tr = document.querySelector('.bulk-table tbody tr');
    const terminalSelect = tr?.querySelector('.terminal-select');
    return {
      optionsCount: terminalSelect?.options?.length,
      options: Array.from(terminalSelect?.options || []).map(o => ({
        value: o.value,
        text: o.textContent
      }))
    };
  });

  console.log('Terminal select after property selection:', JSON.stringify(terminalInfo, null, 2));
});

test('index.htmlのmasterDataを確認', async ({ page }) => {
  await setupAuthMockWithMasterData(page, 'http://localhost:8080/index.html', {
    isAuthenticated: true
  });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000); // 初期化を待つ

  const debug = await page.evaluate(() => {
    return {
      hasMasterData: !!window.masterData,
      masterDataType: typeof window.masterData,
      propertiesCount: window.masterData?.properties?.length,
      firstProperty: window.masterData?.properties?.[0],
      firstThreeProperties: window.masterData?.properties?.slice(0, 3)
    };
  });

  console.log('Debug info:', JSON.stringify(debug, null, 2));

  expect(debug.hasMasterData).toBe(true);
  expect(debug.propertiesCount).toBeGreaterThan(0);
  console.log('First property:', debug.firstProperty);
  console.log('First 3 properties:', debug.firstThreeProperties);
});

test('物件選択時のDOM変化を確認', async ({ page }) => {
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  await setupAuthMockWithMasterData(page, 'http://localhost:8080/index.html', {
    isAuthenticated: true
  });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // 物件選択前の状態
  const beforeSelect = await page.evaluate(() => {
    const terminalSelect = document.getElementById('terminal');
    return {
      terminalOptionsCount: terminalSelect?.options?.length,
      terminalOptions: Array.from(terminalSelect?.options || []).map(o => ({ value: o.value, text: o.textContent }))
    };
  });
  console.log('Before select:', beforeSelect);

  // 物件を選択
  await page.locator('#property').selectOption('2010');
  await page.waitForTimeout(1000);

  // onPropertyChange()が存在するか確認し、手動で呼び出す
  const functionCheck = await page.evaluate(() => {
    return {
      hasOnPropertyChange: typeof window.onPropertyChange === 'function',
      onPropertyChangeDefined: typeof onPropertyChange !== 'undefined'
    };
  });
  console.log('Function check:', functionCheck);

  // 手動でonPropertyChange()を呼び出す
  if (functionCheck.hasOnPropertyChange) {
    await page.evaluate(() => {
      console.log('Calling window.onPropertyChange()...');
      window.onPropertyChange();
    });
    await page.waitForTimeout(500);
  }

  // 物件選択後の状態
  const afterSelect = await page.evaluate(() => {
    const terminalSelect = document.getElementById('terminal');
    const propertySelect = document.getElementById('property');
    return {
      propertyValue: propertySelect?.value,
      terminalOptionsCount: terminalSelect?.options?.length,
      terminalOptions: Array.from(terminalSelect?.options || []).map(o => ({ value: o.value, text: o.textContent })),
      masterDataSample: window.masterData?.properties?.slice(0, 2)
    };
  });
  console.log('After select:', JSON.stringify(afterSelect, null, 2));

  expect(afterSelect.propertyValue).toBe('2010');
  // ここで端末オプションが増えているはず
});
