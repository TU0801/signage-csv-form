import { describe, it, expect } from 'vitest';
import { buildInspectionReportSheet, REPORT_HEADERS } from '../lib/inspectionReport';
import { makeEntry } from './fixtures';

describe('buildInspectionReportSheet (v1 admin-export.js exportInspectionReport)', () => {
  it('writes title rows, headers and one row per selected entry with ja-JP dates', () => {
    const now = new Date('2026-10-15T03:04:05Z');
    const sheet = buildInspectionReportSheet(
      [makeEntry({ inspection_end: null })],
      new Map([['2010', 'さくらマンション']]),
      now,
    );
    expect(sheet[0]).toEqual(['点検レポート']);
    expect(sheet[1]).toEqual([`出力日時: ${now.toLocaleString('ja-JP')}`]);
    expect(sheet[2]).toEqual(['対象件数: 1件']);
    expect(sheet[3]).toEqual([]);
    expect(sheet[4]).toEqual(REPORT_HEADERS);
    expect(sheet[5]).toEqual([
      '2010',
      'さくらマンション',
      'エレベーター定期点検',
      '2026/11/1',
      '',
      '10時〜12時',
      '山田エレベーター',
      new Date('2026-10-01T01:00:00+00:00').toLocaleString('ja-JP'),
    ]);
  });
});
