import { normalizeSearch } from '@/lib/utils';
import type { DbBuildingVendor } from '@/types/database';
import type { VendorInspectionWithType } from '../api';

/** 紐付け済みの表（物件・点検種別）の並び・絞り込み・解除の確認文。取得は登録日順なので、表示用にここで並べ直す */

const collator = new Intl.Collator('ja', { numeric: true });

/** 物件の紐付けを物件コード順に（英数字のコードもあるので数字は数として比べる） */
export function sortBuildingLinks<T extends Pick<DbBuildingVendor, 'property_code'>>(rels: T[]): T[] {
  return [...rels].sort((a, b) => collator.compare(String(a.property_code), String(b.property_code)));
}

/** 物件コード・物件名で絞り込む（ひらがな/カタカナ・全角/半角・大小文字・空白を区別しない） */
export function filterBuildingLinks<T extends Pick<DbBuildingVendor, 'property_code'>>(
  rels: T[],
  nameOf: (code: string) => string | undefined,
  query: string,
): T[] {
  const q = normalizeSearch(query);
  if (!q) return rels;
  return rels.filter((r) =>
    normalizeSearch(`${r.property_code} ${nameOf(String(r.property_code)) ?? ''}`).includes(q),
  );
}

/** 点検種別の紐付けを点検種別マスターの並び順（sort_order。未設定は最後）、同じなら名前順に */
export function sortInspectionLinks(rels: VendorInspectionWithType[]): VendorInspectionWithType[] {
  const order = (r: VendorInspectionWithType) => r.signage_master_inspection_types?.sort_order ?? Number.MAX_SAFE_INTEGER;
  return [...rels].sort(
    (a, b) =>
      order(a) - order(b) ||
      collator.compare(
        a.signage_master_inspection_types?.inspection_name ?? '',
        b.signage_master_inspection_types?.inspection_name ?? '',
      ),
  );
}

/** 点検種別名・カテゴリで絞り込む */
export function filterInspectionLinks(rels: VendorInspectionWithType[], query: string): VendorInspectionWithType[] {
  const q = normalizeSearch(query);
  if (!q) return rels;
  return rels.filter((r) =>
    normalizeSearch(
      `${r.signage_master_inspection_types?.inspection_name ?? ''} ${r.signage_master_inspection_types?.category ?? ''}`,
    ).includes(q),
  );
}

/** 解除の確認に並べる名前（1行に1件。多いときは先頭 max 件と「…ほか n 件」） */
export function confirmNameList(names: string[], max = 10): string {
  const head = names.slice(0, max).map((n) => `・${n}`);
  if (names.length > max) head.push(`…ほか ${names.length - max} 件`);
  return head.join('\n');
}
