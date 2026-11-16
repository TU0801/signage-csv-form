import type { ComboboxOption } from '@/components/ui/Combobox';
import { compareVendorNames } from './vendorOptions';

/*
 * 保守会社での絞り込み（修正依頼1115 (4)。(2) の点検登録フォームの保守会社フィルターでも同じ判定を使う）。
 * 物件（または点検）の設備の行（物件単位の点検行・台ごとの保守の行）が持つ保守会社の id の並びで判定する。
 */

/** 絞り込みの値: '' はすべて、VENDOR_UNSET は保守会社が未設定の行がある物件 */
export const VENDOR_UNSET = '__vendor_unset__';

/** 保守会社の名前が引けないとき（保守会社マスターに無い id）の表示 */
export const UNKNOWN_VENDOR_LABEL = '（不明な保守会社）';

/** 1行の保守会社がその絞り込みに合うか（未設定は null・空文字） */
export function vendorRowMatches(vendorId: string | null | undefined, filter: string): boolean {
  if (!filter) return true;
  if (filter === VENDOR_UNSET) return !vendorId;
  return vendorId === filter;
}

/**
 * 行のどれか1つでも合えば true。
 * 「保守会社未設定」は、保守会社の無い行が1つ以上あるとき。行が1つも無い（設備情報が未登録の）物件は合わない
 * （物件タブではそれを「設備情報が未登録の物件だけ」で出す）。
 */
export function matchesVendorFilter(vendorIds: readonly (string | null | undefined)[], filter: string): boolean {
  if (!filter) return true;
  return vendorIds.some((id) => vendorRowMatches(id, filter));
}

/** 絞り込み中は合う行を先頭に（なぜ残ったかが1行目で分かるように）。合う行どうし・合わない行どうしは元の並び */
export function matchedFirst<T>(rows: readonly T[], vendorIdOf: (row: T) => string | null | undefined, filter: string): T[] {
  if (!filter) return [...rows];
  const hit = rows.filter((r) => vendorRowMatches(vendorIdOf(r), filter));
  return hit.length === 0 ? [...rows] : [...hit, ...rows.filter((r) => !vendorRowMatches(vendorIdOf(r), filter))];
}

/**
 * 絞り込みの選択肢: すべての保守会社 → 行に出てくる保守会社（法人格を除いた名前の順）→ 保守会社未設定（未設定の行があるときだけ）。
 */
export function vendorFilterOptions(
  vendorIds: Iterable<string | null | undefined>,
  vendorNames: ReadonlyMap<string, string>,
): ComboboxOption[] {
  const ids = new Set<string>();
  let hasUnset = false;
  for (const id of vendorIds) {
    if (id) ids.add(id);
    else hasUnset = true;
  }
  const options = [...ids]
    .map((id) => ({ value: id, label: vendorNames.get(id) ?? UNKNOWN_VENDOR_LABEL }))
    .sort((a, b) => compareVendorNames(a.label, b.label));
  return [
    { value: '', label: 'すべての保守会社' },
    ...options,
    ...(hasUnset ? [{ value: VENDOR_UNSET, label: '保守会社未設定' }] : []),
  ];
}
