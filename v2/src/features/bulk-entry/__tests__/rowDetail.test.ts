import { describe, it, expect } from 'vitest';
import { hasCustomDisplayPeriod, hasRowDetail, rowDetailSummary, submittedDisplayPeriod, templateDisplayName } from '../utils/rowDetail';
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

describe('詳細設定の判定（修正依頼1024 B18）', () => {
  it('追加の貼紙・書き換えた連絡先は「詳細✓」になり、要約にも出る', () => {
    const custom = row({ posterType: 'custom', posterImage: 'https://x/a.png', emergencyContact: '' });
    expect(hasRowDetail(custom, 6)).toBe(true);
    expect(rowDetailSummary(custom)).toContain('貼紙: 追加');
    const contact = row({ posterType: 'template', emergencyContact: '03-1111-2222' });
    expect(hasRowDetail(contact, 6)).toBe(true);
    expect(rowDetailSummary(contact)).toContain('連絡先: 03-1111-2222');
    expect(hasRowDetail(row({ posterType: 'template', emergencyContact: '' }), 6)).toBe(false);
  });

  it('表示期間は空か点検期間と同じなら既定（畳む）、それ以外は開く', () => {
    const base = { startDate: '2026-11-02', endDate: '2026-11-03', displayStartTime: '', displayEndTime: '' };
    expect(hasCustomDisplayPeriod({ ...base, displayStartDate: '', displayEndDate: '' })).toBe(false);
    expect(hasCustomDisplayPeriod({ ...base, displayStartDate: '2026-11-02', displayEndDate: '2026-11-03' })).toBe(false);
    expect(hasCustomDisplayPeriod({ ...base, displayStartDate: '2026-10-30', displayEndDate: '' })).toBe(true);
    expect(hasCustomDisplayPeriod({ ...base, displayStartDate: '', displayEndDate: '', displayStartTime: '08:00' })).toBe(true);
  });

  it('テンプレート名は image_key を大小文字を無視して引き、無ければ点検種別名', () => {
    const images = [{ image_key: 'Fire_Inspection', display_name: '消防設備点検' }];
    expect(templateDisplayName('fire_inspection', '消防設備点検（年2回）', images)).toBe('消防設備点検');
    expect(templateDisplayName('elevator', 'エレベーター定期点検', images)).toBe('エレベーター定期点検');
  });
});

describe('申請で保存される表示期間（修正依頼1024 F11）', () => {
  const past = { displayStartDate: '', displayStartTime: '', displayEndDate: '', displayEndTime: '', startDate: '2026-08-20', endDate: '2026-08-20' };
  it('過ぎた予定を後から申請しても期間が逆にならない（表示開始日は点検開始日）', () => {
    expect(submittedDisplayPeriod(past, '2026-10-24')).toMatchObject({ startDate: '2026-08-20', endDate: '2026-08-20' });
    // 点検開始日が表示終了日より後なら表示終了日
    expect(submittedDisplayPeriod({ ...past, displayEndDate: '2026-08-10' }, '2026-10-24').startDate).toBe('2026-08-10');
  });
  it('表示終了日が今日以降なら、表示開始日は今まで通り申請日（null）', () => {
    expect(submittedDisplayPeriod({ ...past, endDate: '2026-10-30' }, '2026-10-24').startDate).toBeNull();
  });
});
