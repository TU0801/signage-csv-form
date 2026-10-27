import { describe, it, expect } from 'vitest';
import { orderRows, type RowSortInfo } from '../utils/rowOrder';
import type { InspectionStatus } from '@/features/inspection-portal/lib/status';
import type { BulkEntryRow } from '../types';

/** 表の並び（修正依頼1027 (3)・(6)）。並びに使う項目だけ持つ行 */
const row = (id: number, status: InspectionStatus | undefined, startDate = '', manual = false) =>
  ({
    id,
    startDate,
    endDate: '',
    schedule: manual ? undefined : { key: `k${id}`, targetMonth: '2026-11-01' },
    _status: status,
  }) as unknown as BulkEntryRow & { _status?: InspectionStatus };

const infoOf = (r: BulkEntryRow): RowSortInfo => ({
  status: (r as BulkEntryRow & { _status?: InspectionStatus })._status,
  months: '',
  inspectedOn: '-',
});

describe('orderRows', () => {
  it('既定はタグの優先度（超過・差戻し → … → 完了 → 未申請）。手で足した行は上のまま、同じステータスは元の並び', () => {
    const rows = [
      row(1, 'not_applied'),
      row(2, 'completed'),
      row(3, 'sent_back'),
      row(4, undefined, '', true),
      row(5, 'overdue'),
      row(6, 'not_applied'),
      row(7, 'applying'),
    ];
    expect(orderRows(rows, () => true, infoOf, null).map((r) => r.id)).toEqual([4, 5, 3, 7, 2, 1, 6]);
  });

  it('点検開始日の並べ替えは、未入力の行を昇順でも降順でも最後にする', () => {
    const rows = [row(1, 'not_applied'), row(2, 'not_applied', '2026-11-20'), row(3, 'not_applied', '2026-11-05')];
    expect(orderRows(rows, () => true, infoOf, { column: 'startDate', dir: 'asc' }).map((r) => r.id)).toEqual([3, 2, 1]);
    expect(orderRows(rows, () => true, infoOf, { column: 'startDate', dir: 'desc' }).map((r) => r.id)).toEqual([2, 3, 1]);
  });
});
