import { describe, expect, it } from 'vitest';
import { buildReportCheckItems } from '../lib/reportCheck';
import { buildNotifyOffIndex, buildUnitIndex } from '../lib/units';
import { makeInspection, makeReport } from './fixtures';

describe('buildReportCheckItems（報告書確認。修正依頼1027）', () => {
  it('台ごとの点検は、どれかの台が点検日連絡 OFF なら点検ごとに1行（報告書は点検行の単位）。点検月の無い点検は報告書が届いた月だけ', () => {
    const inspections = [
      makeInspection({ inspection_id: 'i1', inspection_months: [9, 10], schedule_from: '2026-04-01' }),
      makeInspection({ inspection_id: 'i2', inspection_months: [], inspection_type_id: 't2' }),
      makeInspection({ inspection_id: 'i3', inspection_months: [10], inspection_type_id: 't3' }),
    ];
    const unitIndex = buildUnitIndex([
      { inspection_id: 'i1', unit_id: 'u1', unit_code: 'No1', unit_sort: 0, maintainer_id: 'v1', inspection_months: [], inspected_on: null, equipment_code: null },
      { inspection_id: 'i1', unit_id: 'u2', unit_code: 'No2', unit_sort: 1, maintainer_id: 'v1', inspection_months: [], inspected_on: null, equipment_code: null },
    ]);
    const items = buildReportCheckItems(
      inspections,
      [],
      [makeReport({ id: 'r2', property_inspection_id: 'i2', target_month: '2026-08-01' })],
      {
        today: '2026-10-21',
        unitIndex,
        unitVendorId: null,
        // i1 は No2 だけ OFF、i2 は点検行が OFF、i3 は ON（申請の要る点検）
        notify: buildNotifyOffIndex([
          { inspection_id: 'i1', unit_id: 'u2' },
          { inspection_id: 'i2', unit_id: null },
        ]),
      },
    );
    expect(items.map((i) => i.key).sort()).toEqual(['i1:2026-09-01', 'i1:2026-10-01', 'i2:2026-08-01']);
    expect(items.every((i) => i.reportOnly && !i.secondary)).toBe(true);
    // まとめた台の行を全部持つ（2台目だけの完了連絡も「完了連絡あり」に出せるように）
    expect(items.find((i) => i.key === 'i1:2026-10-01')!.unitRows.map((r) => r.unit?.unit_id)).toEqual(['u1', 'u2']);
  });
});
