import { describe, it, expect } from 'vitest';
import { validateBulkRow } from '../utils/validateBulkRow';
import { applySettings, DEFAULT_BULK_SETTINGS } from '../utils/bulkMaster';
import type { BulkProperty } from '../types';

const properties: BulkProperty[] = [
  { propertyCode: 'z0001A01', propertyName: '物件A', terminalId: 'T-A1', supplement: '' },
];

// 実DB signage_master_settings の setting_key / setting_value（文字列）を v1 setAppSettings と同じく取り込む
const settings = applySettings(DEFAULT_BULK_SETTINGS, [
  { setting_key: 'display_time_max', setting_value: '20' },
  { setting_key: 'remarks_max_lines', setting_value: '2' },
  { setting_key: 'remarks_chars_per_line', setting_value: '5' },
  { setting_key: 'notice_text_max_chars', setting_value: '10' },
]);

/** 必須項目がそろった行（これだけならエラー無し） */
const base = {
  propertyCode: 'z0001A01',
  terminalId: 'T-A1',
  inspectionType: '消防設備点検',
  startDate: '2026-10-01',
  endDate: '2026-10-01',
  displayStartDate: '',
  displayEndDate: '',
  displayTime: 10,
  remarks: '',
  noticeText: '',
};

const errorsOf = (patch: Partial<typeof base>) => validateBulkRow({ ...base, ...patch }, properties, settings);

describe('validateBulkRow (v1 js/bulk-table.js validateRow)', () => {
  it('end dates must not be before start dates (inspection and display)', () => {
    expect(errorsOf({})).toEqual([]);
    expect(errorsOf({ startDate: '2026-10-02', endDate: '2026-10-01' })).toEqual(['点検終了日は開始日以降']);
    expect(errorsOf({ displayStartDate: '2026-10-05', displayEndDate: '2026-10-04' })).toEqual(['表示終了日は開始日以降']);
  });

  it('display time must not exceed display_time_max', () => {
    expect(errorsOf({ displayTime: 20 })).toEqual([]);
    expect(errorsOf({ displayTime: 21 })).toEqual(['表示時間(20秒以下)']);
  });

  it('備考の行数・1行の文字数は目安なのでエラーにしない（申請を止めない。修正依頼1026 I8）', () => {
    expect(errorsOf({ remarks: '12345\n12345' })).toEqual([]);
    expect(errorsOf({ remarks: 'a\nb\nc' })).toEqual([]);
    expect(errorsOf({ remarks: '123456' })).toEqual([]);
  });

  it('an inspection type missing from the master is an error (only once the master is loaded)', () => {
    const notices = [{ inspectionType: '消防設備点検', templateNo: '7', noticeText: '' }];
    expect(validateBulkRow({ ...base }, properties, settings, notices)).toEqual([]);
    expect(validateBulkRow({ ...base, inspectionType: '消防設備 点検' }, properties, settings, notices)).toEqual([
      '点検種別(未登録)',
    ]);
    expect(validateBulkRow({ ...base, inspectionType: '消防設備 点検' }, properties, settings, [])).toEqual([]);
  });

  it('notice text is limited by notice_text_max_chars', () => {
    expect(errorsOf({ noticeText: '1234567890' })).toEqual([]);
    expect(errorsOf({ noticeText: '12345678901' })).toEqual(['案内文(10文字以下)']);
  });

  it('追加の貼紙は画像が無いとエラー（B18）', () => {
    expect(validateBulkRow({ ...base, posterType: 'custom', posterImage: '' }, properties, settings)).toEqual(['貼紙画像']);
    expect(validateBulkRow({ ...base, posterType: 'custom', posterImage: 'https://x/a.png' }, properties, settings)).toEqual([]);
    expect(validateBulkRow({ ...base, posterType: 'template', posterImage: '' }, properties, settings)).toEqual([]);
  });
});
