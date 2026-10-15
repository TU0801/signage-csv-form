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

/**
 * 保守会社の選択欄の候補。法人格を除いた名前の順に並べる（検索は Combobox の部分一致なので「長谷工」などで当たる）。
 * 管理者は保守会社なしで運用するので、withNone のときだけ先頭に「選択なし」を置いて空に戻せるようにする。
 */
export function vendorOptions(vendors: DbVendor[], { withNone = false } = {}): ComboboxOption[] {
  const sorted = [...vendors].sort((a, b) =>
    vendorSortKey(a.vendor_name).localeCompare(vendorSortKey(b.vendor_name), 'ja'),
  );
  const options = sorted.map((v) => ({ value: String(v.id), label: v.vendor_name }));
  return withNone ? [{ value: '', label: '選択なし' }, ...options] : options;
}
