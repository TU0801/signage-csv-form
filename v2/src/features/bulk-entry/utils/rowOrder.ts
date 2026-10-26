import { STATUS_ORDER, type InspectionStatus } from '@/features/inspection-portal/lib/status';
import type { BulkEntryRow } from '../types';

/*
 * 点検登録フォーム（一括入力）の表の並べ替え（修正依頼1025 F3）。
 * 並べ替えるのは点検予定の行だけで、手で足した行は常に上にまとめて置く（ステータスも対象月も無いため）。
 * 並べ替えは表示だけ（ストアの rows は触らない）。No と申請エラーの「N行目」はこの並びの通し番号。
 */

export type SortColumn = 'status' | 'targetMonth' | 'months';
export interface SortState {
  column: SortColumn;
  dir: 'asc' | 'desc';
}

/** 見出しを押したときの次の状態（昇順 → 降順 → 解除） */
export function nextSort(current: SortState | null, column: SortColumn): SortState | null {
  if (!current || current.column !== column) return { column, dir: 'asc' };
  if (current.dir === 'asc') return { column, dir: 'desc' };
  return null;
}

/** 並べ替えに使う行の情報（BulkRowInfo の一部） */
export interface RowSortInfo {
  status?: InspectionStatus;
  /** 点検月（formatInspectionMonths の表示。奇数月と偶数月を改行で分ける／毎月）。無ければ '' */
  months: string;
  /** 検査月（例 2026年4月）。無ければ '-' */
  inspectedOn: string;
}

/** 点検月の並べ替えの値。毎月は先頭、無ければ最後。並びは最初の月 */
function monthsKey(months: string): number {
  if (months === '毎月') return 0;
  const nums = months
    .split(/\D+/)
    .map((m) => Number(m))
    .filter((n) => n >= 1 && n <= 12);
  return nums.length ? Math.min(...nums) : 99;
}

function compare(
  a: BulkEntryRow,
  b: BulkEntryRow,
  ia: RowSortInfo,
  ib: RowSortInfo,
  column: SortColumn,
): number {
  switch (column) {
    case 'status': {
      const sa = ia.status ? STATUS_ORDER.indexOf(ia.status) : STATUS_ORDER.length;
      const sb = ib.status ? STATUS_ORDER.indexOf(ib.status) : STATUS_ORDER.length;
      return sa - sb;
    }
    case 'targetMonth':
      // 点検月未登録（対象月なし）は最後
      return (a.schedule?.targetMonth ?? '9999').localeCompare(b.schedule?.targetMonth ?? '9999');
    case 'months': {
      const d = monthsKey(ia.months) - monthsKey(ib.months);
      if (d) return d;
      const ka = ia.inspectedOn === '-' ? '' : ia.inspectedOn;
      const kb = ib.inspectedOn === '-' ? '' : ib.inspectedOn;
      return ka.localeCompare(kb, 'ja', { numeric: true });
    }
  }
}

/**
 * 表に出す行の並び。表示する行だけを、手で足した行 → 点検予定の行の順に並べ、予定の行は sort で並べ替える。
 * 台ごとに分けた2台目以降の行（schedule.secondary）は、並べ替えても直前の1台目の行の下に付けたまま動かす。
 * 同じ値の行は元の並び（安定ソート）
 */
export function orderRows(
  rows: BulkEntryRow[],
  isVisible: (row: BulkEntryRow) => boolean,
  sortInfoOf: (row: BulkEntryRow) => RowSortInfo,
  sort: SortState | null,
): BulkEntryRow[] {
  const visible = rows.filter(isVisible);
  const manual = visible.filter((r) => !r.schedule);
  const schedule = visible.filter((r) => r.schedule);
  if (!sort) return [...manual, ...schedule];
  const groups: BulkEntryRow[][] = [];
  for (const r of schedule) {
    const last = groups[groups.length - 1];
    if (r.schedule?.secondary && last) last.push(r);
    else groups.push([r]);
  }
  const info = new Map(groups.map((g) => [g[0]!.id, sortInfoOf(g[0]!)]));
  const sign = sort.dir === 'asc' ? 1 : -1;
  groups.sort(
    (ga, gb) =>
      sign * compare(ga[0]!, gb[0]!, info.get(ga[0]!.id)!, info.get(gb[0]!.id)!, sort.column),
  );
  return [...manual, ...groups.flat()];
}
