import { describe, expect, it } from 'vitest';
import { inspectionLinkOf } from '../utils/buildBulkEntries';
import { firstError } from '../utils/columns';
import { scheduleRowInput } from '../utils/scheduleRows';
import { buildSchedule } from '@/features/inspection-portal/lib/schedule';
import { makeEntry, makeInspection } from '@/features/inspection-portal/__tests__/fixtures';
import type { BulkEntryRow } from '../types';

const links = [
  makeInspection({ inspection_id: 'i1', inspection_type_label: 'エレベーター定期点検' }),
  makeInspection({ inspection_id: 'i2', inspection_type_label: '消防設備点検', inspection_months: [6, 12] }),
];

describe('点検登録フォームの点検行との結び付け', () => {
  it('点検開始日の月が点検行の予定に無い（点検月でない・数え始める月より前）なら結び付けない。複数一致はその保守会社が点検行の会社のものを選ぶ', () => {
    const row = { propertyCode: '900001', inspectionType: 'エレベーター定期点検', startDate: '2026-11-10' };
    // 点検月は 5・11 月（schedule_from 2026-04）
    expect(inspectionLinkOf(row, links, 'v1')?.target_month).toBe('2026-11-01');
    expect(inspectionLinkOf({ ...row, startDate: '2027-03-10' }, links, 'v1')).toBeNull();
    expect(inspectionLinkOf({ ...row, startDate: '2025-11-10' }, links, 'v1')).toBeNull();
    // 点検月の無い点検行は予定の行を作らない（月を選んで申請する）ので、どの月でも結び付ける
    const unscheduled = [makeInspection({ inspection_id: 'i3', inspection_months: [] })];
    expect(inspectionLinkOf({ ...row, startDate: '2027-03-10' }, unscheduled, 'v1')?.target_month).toBe('2027-03-01');
    // 同じ物件・点検種別の点検行が複数: 台だけの会社の行より点検行の会社の行。月が予定に無い行は候補にしない
    const dup = [
      makeInspection({ inspection_id: 'unit', vendor_id: 'v-other', unit_vendor_ids: ['v1'] }),
      makeInspection({ inspection_id: 'own', vendor_id: 'v1' }),
      makeInspection({ inspection_id: 'march', vendor_id: 'v1', inspection_months: [3] }),
    ];
    expect(inspectionLinkOf(row, dup, 'v1')?.property_inspection_id).toBe('own');
    expect(inspectionLinkOf(row, dup, 'v2')?.property_inspection_id).toBe('unit');
    expect(inspectionLinkOf({ ...row, startDate: '2027-03-10' }, dup, 'v1')?.property_inspection_id).toBe('march');
  });

  it('手で足した行は物件コード＋点検種別が一致する点検行に結び付け、対象月は点検開始日の月。一致しなければ結び付けない', () => {
    const row = { propertyCode: '900001-00', inspectionType: '消防設備点検', startDate: '2026-12-15' };
    expect(inspectionLinkOf(row, links, 'v1')).toEqual({ property_inspection_id: 'i2', vendor_id: 'v1', target_month: '2026-12-01' });
    expect(inspectionLinkOf({ ...row, inspectionType: '定期清掃' }, links, 'v1')).toBeNull();
    // 物件コードの -00 の有無は同じ物件（1件入力と同じ照合）
    expect(inspectionLinkOf({ ...row, propertyCode: '900001' }, links, 'v1')?.property_inspection_id).toBe('i2');
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

  it('2台目以降の行は読み取りで、1台目の申請の日付・備考・メモを出さない（修正依頼1025 決定4）', () => {
    const items = buildSchedule(
      [makeInspection()],
      [makeEntry({ id: 'e-nov', status: 'ready', target_month: '2026-11-01', inspection_start: '2026-11-10', inspection_end: '2026-11-11', remarks: '午前' })],
      [],
      { today: '2026-10-21', monthsAhead: 12 },
    );
    const nov = items.find((i) => i.targetMonth === '2026-11-01')!;
    const memos = new Map([['e-nov', 'メモ']]);
    const second = scheduleRowInput({ ...nov, key: `${nov.key}:u2`, secondary: true }, memos);
    expect(second.meta).toMatchObject({ locked: true, secondary: true });
    expect(second.row).toMatchObject({ startDate: '', endDate: '', remarks: '', memo: '', terminalId: 'T001' });
    expect(scheduleRowInput(nov, memos).row.startDate).toBe('2026-11-10');
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
