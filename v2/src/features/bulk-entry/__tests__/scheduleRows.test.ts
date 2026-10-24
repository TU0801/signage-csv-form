import { describe, expect, it } from 'vitest';
import { inspectionLinkOf } from '../utils/buildBulkEntries';
import { firstError } from '../utils/columns';
import { scheduleRowInput } from '../utils/scheduleRows';
import { buildSchedule } from '@/features/inspection-portal/lib/schedule';
import { makeEntry, makeInspection } from '@/features/inspection-portal/__tests__/fixtures';
import type { BulkEntryRow } from '../types';

const links = [
  { inspection_id: 'i1', property_code: '900001-00', inspection_type_label: 'エレベーター定期点検' },
  { inspection_id: 'i2', property_code: '900001-00', inspection_type_label: '消防設備点検' },
];

describe('点検登録フォームの点検行との結び付け', () => {
  it('手で足した行は物件コード＋点検種別が一致する点検行に結び付け、対象月は点検開始日の月。一致しなければ結び付けない', () => {
    const row = { propertyCode: '900001-00', inspectionType: '消防設備点検', startDate: '2026-12-15' };
    expect(inspectionLinkOf(row, links, 'v1')).toEqual({ property_inspection_id: 'i2', vendor_id: 'v1', target_month: '2026-12-01' });
    expect(inspectionLinkOf({ ...row, inspectionType: '定期清掃' }, links, 'v1')).toBeNull();
    // 予定の行はその点検行と対象月（点検月の無い点検は開始日の月）
    const schedule = { key: 'k', inspectionId: 'i9', targetMonth: '2026-11-01', locked: false, propertyName: '', terminalIds: [] };
    expect(inspectionLinkOf({ ...row, schedule }, links, 'v1')).toEqual({ property_inspection_id: 'i9', vendor_id: 'v1', target_month: '2026-11-01' });
    expect(inspectionLinkOf({ ...row, schedule: { ...schedule, targetMonth: null } }, links, 'v1')!.target_month).toBe('2026-12-01');
  });

  it('申請済み・差戻し中の予定は読み取りの行になり、申請の日付と備考を出す。未申請は点検開始日を空にする', () => {
    const items = buildSchedule(
      [makeInspection()],
      [makeEntry({ status: 'ready', target_month: '2026-11-01', inspection_start: '2026-11-10', inspection_end: '2026-11-11', remarks: '午前' })],
      [],
      { today: '2026-10-21', monthsAhead: 12 },
    );
    const nov = scheduleRowInput(items.find((i) => i.targetMonth === '2026-11-01')!);
    expect(nov.meta.locked).toBe(true);
    expect(nov.row).toMatchObject({ startDate: '2026-11-10', endDate: '2026-11-11', remarks: '午前', terminalId: 'T001' });
    const may = scheduleRowInput(items.find((i) => i.targetMonth === '2026-05-01')!);
    expect(may.meta.locked).toBe(false);
    expect(may.row.startDate).toBe('');
  });

  it('申請済みの予定の行には申請のメモを出し、未申請の行には出さない（B12・F12）', () => {
    const items = buildSchedule(
      [makeInspection()],
      [makeEntry({ id: 'e-nov', status: 'draft', target_month: '2026-11-01' })],
      [],
      { today: '2026-10-21', monthsAhead: 12 },
    );
    const memos = new Map([['e-nov', '点検月を11月に変更']]);
    expect(scheduleRowInput(items.find((i) => i.targetMonth === '2026-11-01')!, memos).row.memo).toBe('点検月を11月に変更');
    expect(scheduleRowInput(items.find((i) => i.targetMonth === '2026-05-01')!, memos).row.memo).toBe('');
  });

  it('最初のエラーの行と、そのエラーを直す欄（端末は物件の欄）を返す', () => {
    const rows = [
      { id: 3, errors: [] },
      { id: 7, errors: ['端末', '備考行数(5行以下)'] },
    ] as unknown as BulkEntryRow[];
    expect(firstError(rows)).toEqual({ rowId: 7, rowIndex: 1, col: 0, message: '端末' });
    expect(firstError([rows[0]!])).toBeNull();
  });
});
