import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useBulkStore, resetBulkSession } from '@/stores/bulkStore';
import { parseExcelPaste } from '../utils/parseExcelPaste';
import { applySettings, DEFAULT_BULK_SETTINGS } from '../utils/bulkMaster';
import type { BulkMasterData } from '../types';

/**
 * Excel 貼り付け（6列固定・v1.29.2 の silent バグ修正後）が v1 と同じ行を作ることを確かめる。
 * v1 の importFromPaste は画面の要素を読むので、必要な要素だけ jsdom に置いて動かし、
 * v1 の state.rows と v2 の store の行を比べる。
 */
// @ts-expect-error v1 の素の JS モジュール（型宣言なし）
import * as v1Modals from '../../../../../js/bulk-modals.js';
// @ts-expect-error v1 の素の JS モジュール（型宣言なし）
import * as v1State from '../../../../../js/bulk-state.js';

const master: BulkMasterData = {
  properties: [
    { propertyCode: 'z0001A01', propertyName: '物件A', terminalId: 'T-A1', supplement: '' },
    { propertyCode: 'z0001A01', propertyName: '物件A', terminalId: 'T-A2', supplement: '' },
    { propertyCode: '120442-00', propertyName: '物件B', terminalId: 'T-B1', supplement: '' },
  ],
  vendors: [{ id: 'v1', vendorName: '株式会社テスト保守', emergencyContact: '' }],
  notices: [{ inspectionType: 'エレベーター定期点検', templateNo: '12', noticeText: '' }],
};
const settingsRows = [{ setting_key: 'display_time_default', setting_value: '10' }];

const PASTE = [
  '物件名\t端末ID\t点検種別\t開始日\t終了日\t備考',
  // 物件名で照合・端末あり
  '物件A\tT-A2\tエレベーター定期点検\t2026/11/2\t2026/11/3\t午前中',
  // 物件コードで照合・端末省略（最初の端末）
  '120442-00\t\tエレベーター定期点検\t2026-11-05\t\t',
  // 物件に無い端末 → 空（端末エラー）。黙って別端末に差し替えない
  '物件A\tT-ZZZ\tエレベーター定期点検\t2026/11/2\t2026/11/3\t',
  // マスターに無い物件名 → 物件を空にして行は残す（物件エラー）
  '存在しない物件\tT-A1\tエレベーター定期点検\t2026/11/2\t2026/11/3\t',
  // 先頭セルが空でも列がずれない
  '\tT-A1\t\t\t\t',
  // 物件・端末・点検種別が全部空の行は飛ばす（空白でなければ不正行として数える）
  '\t\t\t\t\tメモ',
  '',
  '',
].join('\r\n');

const comparable = (r: Record<string, unknown>) => {
  const { id: _id, ...rest } = r;
  void _id;
  return rest;
};

describe('Excel paste parity with v1 js/bulk-modals.js importFromPaste', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(new Date('2026-10-14T15:30:00Z'));
    document.body.innerHTML = `
      <div id="pasteModal"></div><textarea id="pasteArea"></textarea>
      <table><tbody id="tableBody"></tbody></table>`;
    resetBulkSession();
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('creates the same rows (terminal and property resolution, error flags)', () => {
    // v1
    v1State.setMasterData(master);
    v1State.setCurrentVendor('v1', '株式会社テスト保守');
    v1State.setAppSettings(settingsRows);
    v1State.clearRows();
    v1State.setRowIdCounter(0);
    (document.getElementById('pasteArea') as HTMLTextAreaElement).value = PASTE;
    const toasts: string[] = [];
    const noop = () => {};
    v1Modals.importFromPaste({
      showToast: (m: string) => toasts.push(m),
      triggerAutoSave: noop,
      updateStats: noop,
      updateEmptyState: noop,
      updateButtons: noop,
      showContextMenu: noop,
      openRowDetailModal: noop,
      updateSelectedCount: noop,
    });
    const v1Rows = (v1State.getRows() as Record<string, unknown>[]).map(comparable);

    // v2
    const store = useBulkStore.getState();
    store.setMasterData(master);
    store.setCurrentVendor({ id: 'v1', name: '株式会社テスト保守' });
    store.setAppSettings(applySettings(DEFAULT_BULK_SETTINGS, settingsRows));
    const result = parseExcelPaste(PASTE, master.properties);
    result.rows.forEach((r) => useBulkStore.getState().addRow(r));
    const v2Rows = useBulkStore.getState().rows.map((r) => comparable({ ...r }));

    expect(v2Rows).toEqual(v1Rows);
    expect(v2Rows).toHaveLength(5);
    expect(v2Rows[2]).toMatchObject({ terminalId: '', isValid: false, errors: ['端末'] });
    expect(v2Rows[3]).toMatchObject({ propertyCode: '', isValid: false });
    expect(result.unresolvedCount).toBe(1);
    expect(result.errorCount).toBe(1);
    expect(toasts).toEqual([
      '5件のデータを取り込みました',
      '1件は物件名が見つかりませんでした。行を確認してください',
      '1件の不正な行をスキップしました',
    ]);
  });
});
