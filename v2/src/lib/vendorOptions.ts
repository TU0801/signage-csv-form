import type { ComboboxOption } from '@/components/ui/Combobox';
import type { DbVendor } from '@/types/database';

/** 社名の前後に付く法人格（㈱・(株)・株式会社・有限会社 など）。並べ替えのときだけ外す */
const CORPORATE_AFFIX =
  /^\s*(?:株式会社|有限会社|合同会社|\([株有]\))\s*|\s*(?:株式会社|有限会社|合同会社|\([株有]\))\s*$/g;

/**
 * 保守会社の並べ替えキー。DB は vendor_name の文字コード順で、「㈱」始まり・半角カナ・全角カナが散らばるため、
 * 全角にそろえて（NFKC で ㈱ は (株)、ｵﾘｴﾝﾄ は オリエント）法人格を外した名前で並べる。
 */
export function vendorSortKey(name: string): string {
  return name.normalize('NFKC').replace(CORPORATE_AFFIX, '').trim();
}

/** 保守会社名の比較（法人格を除いた名前の順）。どの画面の選択欄もこの順にそろえる */
export function compareVendorNames(a: string, b: string): number {
  return vendorSortKey(a).localeCompare(vendorSortKey(b), 'ja');
}

/** 保守会社を画面共通の順に並べる */
export function sortVendors<T extends { vendor_name: string }>(vendors: readonly T[]): T[] {
  return [...vendors].sort((a, b) => compareVendorNames(a.vendor_name, b.vendor_name));
}

/**
 * 保守会社の選択欄の候補。法人格を除いた名前の順に並べる（検索は Combobox の部分一致なので「長谷工」などで当たる）。
 * 管理者は保守会社なしで運用するので、withNone のときだけ先頭に「選択なし」を置いて空に戻せるようにする。
 */
export function vendorOptions(vendors: Pick<DbVendor, 'id' | 'vendor_name'>[], { withNone = false } = {}): ComboboxOption[] {
  const options = sortVendors(vendors).map((v) => ({ value: String(v.id), label: v.vendor_name }));
  return withNone ? [{ value: '', label: '選択なし' }, ...options] : options;
}
