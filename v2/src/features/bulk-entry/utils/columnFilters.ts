import type { BulkEntryRow } from '../types';
import type { FilterOption } from '../components/ValueFilterPopover';

/*
 * 一括入力の表の見出しの🔍（物件・点検種別・備考・メモの抽出。修正依頼1027 (6)）。
 * 一覧から複数選んだ値の行だけを出す。選んだときに当てはまった行は、そのあと備考・メモを書き換えても隠さない
 * （空白の行だけ出して書き込むと、1文字目で行が消えないように。Excel のフィルターと同じく選び直すまで残す）。
 * 物件を選んでいない手の行は隠さない（ほかの絞り込みと同じ）。
 */

export type FilterColumn = 'property' | 'inspectionType' | 'remarks' | 'memo';

export const FILTER_COLUMN_LABEL: Record<FilterColumn, string> = {
  property: '物件',
  inspectionType: '点検種別',
  remarks: '備考',
  memo: 'メモ',
};

/** 値が空のときの候補の名前 */
export const EMPTY_VALUE = '（空白）';

export interface ColumnFilter {
  /** 選んだ値（空にはしない。外すときは列ごと消す） */
  values: string[];
  /** 選んだときに当てはまった行（そのあと値が変わっても出す） */
  matched: ReadonlySet<number>;
}
export type ColumnFilters = Partial<Record<FilterColumn, ColumnFilter>>;

/** 行のその列の値（物件は物件名。空は「（空白）」） */
export function columnValue(row: BulkEntryRow, column: FilterColumn, propertyName: string): string {
  const raw =
    column === 'property'
      ? propertyName || String(row.propertyCode)
      : column === 'inspectionType'
        ? row.inspectionType
        : column === 'remarks'
          ? row.remarks
          : row.memo;
  return raw.trim() === '' ? EMPTY_VALUE : raw;
}

/** 見出しの抽出に合う行か。except の列は見ない（その列の候補を数えるとき） */
export function matchesColumnFilters(
  row: BulkEntryRow,
  filters: ColumnFilters,
  propertyName: string,
  except?: FilterColumn,
): boolean {
  if (!row.schedule && !row.propertyCode) return true;
  for (const [column, filter] of Object.entries(filters) as [FilterColumn, ColumnFilter][]) {
    if (column === except || !filter) continue;
    if (filter.matched.has(row.id)) continue;
    if (!filter.values.includes(columnValue(row, column, propertyName))) return false;
  }
  return true;
}

/** 候補（値ごとの行の数）。並びは名前の順で、空白は最後 */
export function buildFilterOptions(
  rows: BulkEntryRow[],
  column: FilterColumn,
  propertyNameOf: (row: BulkEntryRow) => string,
): FilterOption[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.schedule && !row.propertyCode) continue;
    const v = columnValue(row, column, propertyNameOf(row));
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => (a === EMPTY_VALUE ? 1 : b === EMPTY_VALUE ? -1 : a.localeCompare(b, 'ja', { numeric: true })))
    .map(([value, count]) => ({ value, count }));
}
