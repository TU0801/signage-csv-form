import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { bulkCsvFilename, generateBulkCsv } from '../utils/bulkCsv';
import { applySettings, DEFAULT_BULK_SETTINGS } from '../utils/bulkMaster';
import type { BulkEntryRow, BulkMasterData } from '../types';

/**
 * 一括入力の CSV が v1（js/bulk-data.js generateCSV）とバイト一致することを確かめる。
 * v1 のモジュールを直接読み、DB を触る supabase-client.js だけスタブにする。
 */
vi.mock('../../../../../js/supabase-client.js', () => ({ createEntries: vi.fn() }));

// @ts-expect-error v1 の素の JS モジュール（型宣言なし）を同等性比較のためだけに読む
import * as v1Data from '../../../../../js/bulk-data.js';
// @ts-expect-error v1 の素の JS モジュール（型宣言なし）
import * as v1State from '../../../../../js/bulk-state.js';

// UTC 2026-10-14 15:30:00 = JST 2026-10-15 00:30:00（変更日は UTC、変更日時の時刻はローカル）
const FIXED_NOW = new Date('2026-10-14T15:30:00Z');

const master: BulkMasterData = {
  properties: [
    { propertyCode: 'z0001A01', propertyName: '物件A', terminalId: 'T-A1', supplement: '' },
    { propertyCode: 'z0001A01', propertyName: '物件A', terminalId: 'T-A2', supplement: '2号機' },
    { propertyCode: '120442-00', propertyName: '物件B', terminalId: 'T-B1', supplement: '' },
  ],
  vendors: [
    { id: 'v1', vendorName: '株式会社テスト保守', emergencyContact: '092-000-0000' },
    { id: 'v2', vendorName: '別会社', emergencyContact: '03-1111-1111' },
  ],
  notices: [
    { inspectionType: 'エレベーター定期点検', templateNo: '12', noticeText: '点検のため停止します。\n御協力をお願いします。' },
    { inspectionType: '消防設備点検', templateNo: '7', noticeText: '' },
  ],
};

const settingsRows = [
  { setting_key: 'display_time_default', setting_value: '10' },
  { setting_key: 'display_time_max', setting_value: '30' },
];

function row(over: Partial<BulkEntryRow>): BulkEntryRow {
  return {
    id: 1,
    propertyCode: 'z0001A01',
    terminalId: 'T-A1',
    vendorName: '株式会社テスト保守',
    inspectionType: 'エレベーター定期点検',
    startDate: '2026-11-02',
    endDate: '2026-11-03',
    remarks: '',
    memo: '',
    displayTime: 10,
    noticeText: '',
    displayStartDate: '',
    displayStartTime: '',
    displayEndDate: '',
    displayEndTime: '',
    showOnBoard: true,
    emergencyContact: '',
    posterType: 'template',
    posterImage: '',
    position: 2,
    isValid: true,
    errors: [],
    ...over,
  };
}

const rows: BulkEntryRow[] = [
  // 案内文は点検種別の定型文（LF 入り → CRLF・クォート）
  row({ id: 1 }),
  // 掲示板に表示しない → False、備考に LF とカンマ、位置 0、表示期間・時刻あり
  row({
    id: 2,
    terminalId: 'T-A2',
    showOnBoard: false,
    remarks: '午前中,10時から\n2行目',
    noticeText: '独自の "案内" 文',
    position: 0,
    displayStartDate: '2026-10-20',
    displayStartTime: '08:00',
    displayEndDate: '2026-11-04',
    displayEndTime: '18:00',
    displayTime: 5,
  }),
  // 終了日・表示期間なし（完了日は開始日、表示日は点検日から）、未知の点検種別（TPLNo 空）
  row({ id: 3, propertyCode: '120442-00', terminalId: 'T-B1', inspectionType: '未登録の点検', endDate: '' }),
  // 無効な行は出さない
  row({ id: 4, isValid: false, errors: ['物件'] }),
  // 受注先名は行の vendorName（画面上部の保守会社と別でも行の値）、表示時間は既定値
  row({ id: 5, vendorName: '別会社', inspectionType: '消防設備点検', displayTime: 0 }),
];

describe('bulk CSV parity with v1 js/bulk-data.js generateCSV', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(FIXED_NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('generates byte-identical CSV', () => {
    v1State.setMasterData(master);
    v1State.setCurrentVendor('v1', '株式会社テスト保守');
    v1State.setAppSettings(settingsRows);
    v1State.state.rows = rows.map((r) => ({ ...r }));
    const expected: string = v1Data.generateCSV();

    const actual = generateBulkCsv(
      rows,
      master,
      { id: 'v1', name: '株式会社テスト保守' },
      applySettings(DEFAULT_BULK_SETTINGS, settingsRows),
    );

    expect(actual).toBe(expected);
    const lines = actual.split('\n');
    // ヘッダーの4列目は「受注先名」（長谷工の取込仕様）
    expect(lines[0]!.split(',')[3]).toBe('受注先名');
    expect(actual).toContain(',False,');
    expect(actual).toContain('2026/10/14 [00:30:00]');
  });

  it('メモは CSV に出さない（B12）', () => {
    const csv = generateBulkCsv(
      rows.map((r) => ({ ...r, memo: '点検月を変更した覚え書き' })),
      master,
      { id: 'v1', name: '株式会社テスト保守' },
      applySettings(DEFAULT_BULK_SETTINGS, settingsRows),
    );
    expect(csv).not.toContain('覚え書き');
    expect(csv.split('\n')[0]!.split(',')).toHaveLength(28);
  });

  it('詳細設定の連絡先と追加の貼紙を CSV に出す（B18。追加は管理画面の CSV と同じく案内・日付・備考を空に）', () => {
    const csv = generateBulkCsv(
      [
        // 定型文は改行入りなので、行で分けて読めるよう1行の案内文にする
        row({ id: 1, emergencyContact: '03-1111-2222', noticeText: '独自の案内' }),
        row({ id: 2, posterType: 'custom', posterImage: 'https://x/poster-images/u1/1700_ab12.png?v=1', remarks: '備考' }),
      ],
      master,
      { id: 'v1', name: '株式会社テスト保守' },
      applySettings(DEFAULT_BULK_SETTINGS, settingsRows),
    );
    const [, template, custom] = csv.split('\n').map((l) => l.split(','));
    expect(template![4]).toBe('03-1111-2222');
    expect(template![27]).toBe('テンプレート');
    expect(custom![4]).toBe('092-000-0000'); // 書き換えていない行は保守会社マスターの緊急連絡先
    expect(custom![5]).toBe(''); // 点検工事案内
    expect(custom![7]).toBe('1700_ab12'); // 点検案内TPLNo＝画像のファイル名
    expect([custom![8], custom![9], custom![10], custom![11]]).toEqual(['', '', '', '']);
    expect(custom![27]).toBe('追加');
  });

  it('returns empty string when no valid rows (same as v1)', () => {
    v1State.state.rows = [row({ isValid: false })];
    expect(generateBulkCsv([row({ isValid: false })], master, { id: null, name: null }, DEFAULT_BULK_SETTINGS)).toBe(
      v1Data.generateCSV(),
    );
  });

  it('names the download bulk-<UTC timestamp>.csv', () => {
    expect(bulkCsvFilename()).toBe('bulk-20261014T153000.csv');
  });
});
