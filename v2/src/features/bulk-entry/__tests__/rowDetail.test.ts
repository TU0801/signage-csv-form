import { describe, it, expect } from 'vitest';
import { rowDetailSummary } from '../utils/rowDetail';
import type { BulkEntryRow } from '../types';

const row = (patch: Partial<BulkEntryRow>) =>
  ({
    displayStartDate: '',
    displayEndDate: '',
    endDate: '',
    position: 2,
    displayTime: 6,
    noticeText: '',
    ...patch,
  }) as BulkEntryRow;

describe('rowDetailSummary（申請で保存される値に合わせた要約）', () => {
  it('表示開始日が空なら申請日、表示終了日が空なら点検終了日と書く', () => {
    expect(rowDetailSummary(row({ endDate: '2026-10-25' }))).toBe(
      '表示期間: 申請日〜10/25(点検終了日)・位置: ②上中・表示時間: 6秒',
    );
  });

  it('表示終了日も点検終了日も空なら未設定と書く', () => {
    expect(rowDetailSummary(row({ displayStartDate: '2026-10-20' }))).toContain('表示期間: 10/20〜未設定');
  });

  it('位置が NaN（貼り付けの8列目が数字でない）なら不正値と書く', () => {
    expect(rowDetailSummary(row({ position: NaN }))).toContain('位置: 不正値');
  });
});
