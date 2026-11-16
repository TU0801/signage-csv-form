import type { SortState } from '@/components/ui/SortHeaderButton';
import { compareVendorNames } from '@/lib/vendorOptions';

/** 物件タブの見出しで並べ替えられる列（修正依頼1115 (4)） */
export type PropertySortColumn =
  | 'property_code'
  | 'en_no'
  | 'property_name'
  | 'terminals'
  | 'management_company'
  | 'equipment_count'
  | 'unit_count'
  | 'vendor_summary';

export const PROPERTY_SORT_COLUMNS: PropertySortColumn[] = [
  'property_code',
  'en_no',
  'property_name',
  'terminals',
  'management_company',
  'equipment_count',
  'unit_count',
  'vendor_summary',
];

/** 並べ替えの値。文字の列は表示の文字（空・未設定は null）、端末・設備・台は数 */
export type SortValue = string | number | null;

const isEmpty = (v: SortValue) => v === null || v === '';

/**
 * 物件の並べ替え。文字は日本語順（数字は数として。保守会社は法人格を除いた名前の順）、数は小さい順。
 * 空の値（補助なし・管理会社なし・保守会社未設定）は昇順でも降順でも最後。同じ値は元の並び。sort が null なら元の並び
 */
export function sortProperties<T>(
  items: readonly T[],
  sort: SortState<PropertySortColumn> | null,
  valueOf: (item: T, column: PropertySortColumn) => SortValue,
): T[] {
  if (!sort) return [...items];
  const { column, dir } = sort;
  const sign = dir === 'asc' ? 1 : -1;
  const keyed = items.map((item, index) => ({ item, index, value: valueOf(item, column) }));
  keyed.sort((a, b) => {
    const ea = isEmpty(a.value);
    const eb = isEmpty(b.value);
    if (ea || eb) return ea === eb ? a.index - b.index : ea ? 1 : -1;
    let d: number;
    if (typeof a.value === 'number' && typeof b.value === 'number') d = a.value - b.value;
    else if (column === 'vendor_summary') d = compareVendorNames(String(a.value), String(b.value));
    else d = String(a.value).localeCompare(String(b.value), 'ja', { numeric: true });
    return d === 0 ? a.index - b.index : d * sign;
  });
  return keyed.map((k) => k.item);
}
