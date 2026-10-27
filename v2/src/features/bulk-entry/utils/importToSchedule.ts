import { monthOf, normalizePropertyCode } from '@/features/inspection-portal/lib/schedule';
import type { BulkEntryRow, BulkRowInput } from '../types';

/**
 * Excel 取込の行を入れる点検予定の行（修正依頼1027 (2)）。一括入力テンプレートは担当の点検（予定の行と同じ点検行）を
 * 並べるので、物件・点検種別が同じで、点検開始日の月が対象月の予定の行があれば、手の行を足さずにその行へ日付・備考を入れる。
 * 担当の点検でも物件の紐付け（signage_building_vendors）が無い物件は手の行の物件の候補に無く、手の行では申請できないため。
 * 対象月の行が無ければ点検月未登録（対象月なし）の行。台ごとの行は全部の台に入れる。
 * 申請済み・差戻し中・申請不要（locked）の行には入れない。どれも無ければ空（今までどおり手の行を足す）
 */
export function scheduleTargetsFor(rows: BulkEntryRow[], input: BulkRowInput): BulkEntryRow[] {
  if (!input.startDate || !input.inspectionType) return [];
  const code = input.propertyCode ? normalizePropertyCode(String(input.propertyCode)) : '';
  const name = input.pastedPropertyName?.trim() ?? '';
  if (!code && !name) return [];
  const candidates = rows.filter((r) => {
    const s = r.schedule;
    if (!s || s.locked || r.inspectionType !== input.inspectionType) return false;
    return code ? normalizePropertyCode(String(r.propertyCode)) === code : s.propertyName === name;
  });
  const month = monthOf(input.startDate);
  const exact = candidates.filter((r) => r.schedule!.targetMonth === month);
  return exact.length > 0 ? exact : candidates.filter((r) => r.schedule!.targetMonth === null);
}
