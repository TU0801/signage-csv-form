import { describe, expect, it, vi } from 'vitest';
import { buildBulkEntries, inspectionLinkOf } from '../utils/buildBulkEntries';
import { DEFAULT_BULK_SETTINGS } from '../utils/bulkMaster';
import { firstError } from '../utils/columns';
import { editRowInput, scheduleRowInput, submittedEntryPatch } from '../utils/scheduleRows';
import { buildSchedule } from '@/features/inspection-portal/lib/schedule';
import { buildNotifyOffIndex, buildUnitIndex, expandByUnits } from '@/features/inspection-portal/lib/units';
import { makeEntry, makeInspection } from '@/features/inspection-portal/__tests__/fixtures';
import type { DbEntry } from '@/types/database';
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

  it('台ごとの行は台の申請（と台なしの申請）だけで状態を決め、台の点検日連絡 OFF は申請不要。保守会社に1台しか見えなくても他の台の申請と混ぜない（修正依頼1026 I7）', () => {
    const unit = (id: string, code: string, maintainer: string) => ({
      inspection_id: 'i1',
      unit_id: id,
      unit_code: code,
      unit_sort: Number(code.slice(2)),
      maintainer_id: maintainer,
      inspection_months: [],
      inspected_on: null,
      equipment_code: null,
    });
    const index = buildUnitIndex([unit('u1', 'No1', 'v1'), unit('u2', 'No2', 'v1'), unit('u3', 'No3', 'v2')]);
    const entries = [
      makeEntry({ id: 'e-u2', status: 'ready', target_month: '2026-11-01', property_unit_id: 'u2', inspection_start: '2026-11-10' }),
      makeEntry({ id: 'e-u3', status: 'draft', target_month: '2026-05-01', property_unit_id: 'u3', inspection_start: '2026-05-10' }),
    ];
    const items = buildSchedule([makeInspection()], entries, [], { today: '2026-10-21', monthsAhead: 12 });
    const notify = buildNotifyOffIndex([{ inspection_id: 'i1', unit_id: 'u1' }]);
    const rows = expandByUnits(items, index, 'v1', { notify });
    const nov = rows.filter((i) => i.targetMonth === '2026-11-01');
    expect(nov.map((i) => [i.unitCode, i.application, !!i.reportOnly, !!i.secondary])).toEqual([
      ['No1', 'not_applied', true, false],
      ['No2', 'approved', false, true],
    ]);
    // 5月は No3（他社 v2 の台）の申請だけ。v1 の No2 は超過（No1 は点検日連絡 OFF なので超過にしない）
    const may = rows.filter((i) => i.targetMonth === '2026-05-01');
    expect(may.map((i) => [i.unitCode, i.application, i.overdueUnapplied])).toEqual([
      ['No1', 'not_applied', false],
      ['No2', 'not_applied', true],
    ]);
    // 台ごとの行は台を申請に渡し、2台目の行も入力できる（申請済みは読み取り）
    expect(scheduleRowInput(nov[1]!).meta).toMatchObject({ unitId: 'u2', secondary: true, locked: true });
    expect(scheduleRowInput(may[1]!).meta).toMatchObject({ unitId: 'u2', secondary: true, locked: false });
    // 他社の保守会社 v2 には No3 だけ（1台でも台ごとの申請で決める）
    const v2 = expandByUnits(items, index, 'v2').filter((i) => i.targetMonth === '2026-05-01');
    expect(v2.map((i) => [i.unitCode, i.application, i.unit?.unit_id])).toEqual([['No3', 'applied', 'u3']]);
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

describe('承認前の申請の修正（修正依頼1026 I11）', () => {
  it('過去の1日の点検を日付に触れずに出し直しても、表示期間は逆にならず表示終了日も元のまま（R1）', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-26T03:00:00Z'));
    try {
      const saved = {
        terminal_id: 'T001',
        inspection_start: '2026-08-20',
        inspection_end: '2026-08-20',
        display_start_date: '2026-08-20',
        display_end_date: '2026-08-20',
        poster_type: 'template',
        poster_position: '2',
      } as unknown as DbEntry;
      const input = editRowInput(saved);
      expect(input.endDate).toBe('2026-08-20');
      const row = {
        id: 1,
        propertyCode: '900001',
        vendorName: '保守',
        inspectionType: 'エレベーター定期点検',
        showOnBoard: true,
        isValid: true,
        errors: [],
        ...input,
      } as BulkEntryRow;
      const master = {
        properties: [],
        vendors: [{ id: 'v1', vendorName: '保守', emergencyContact: '' }],
        notices: [{ inspectionType: 'エレベーター定期点検', templateNo: '1', noticeText: '' }],
      };
      const [built] = buildBulkEntries([row], master, { id: 'v1', name: '保守' }, DEFAULT_BULK_SETTINGS);
      const patch = submittedEntryPatch({ ...built });
      expect(patch).toMatchObject({ inspection_end: '2026-08-20', display_start_date: '2026-08-20', display_end_date: '2026-08-20' });
    } finally {
      vi.useRealTimers();
    }
  });
});
