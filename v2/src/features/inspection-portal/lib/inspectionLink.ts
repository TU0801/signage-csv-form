import { monthOf, normalizePropertyCode } from './schedule';
import type { PortalInspectionRow } from '@/types/portal';

/*
 * 1件入力・一括入力（手で足した行）の申請を、保守会社の点検行（portal_inspections）に結び付ける（修正依頼1024 後続）。
 * 結び付けると点検登録フォーム・点検一覧の予定に「申請中」として現れ、報告書UP が申請 ID 付きで通る。
 */

/** 結び付けに使う点検行（portal_inspections の一部） */
export type InspectionLinkRow = Pick<
  PortalInspectionRow,
  'inspection_id' | 'property_code' | 'inspection_type_label' | 'vendor_id' | 'inspection_months' | 'schedule_from'
>;

/** signage_entries に入れる点検行・保守会社・対象月 */
export interface InspectionLink {
  property_inspection_id: string;
  vendor_id: string | null;
  target_month: string | null;
}

/**
 * 保守会社の点検行。保守会社のアカウントは DB が担当の点検（台の保守会社を含む）に絞って返すのでそのまま。
 * 管理者は選んだ保守会社の点検（点検行の会社か台の会社）だけ。保守会社を選んでいなければ無し
 */
export function inspectionsOfVendor<T extends Pick<PortalInspectionRow, 'vendor_id' | 'unit_vendor_ids'>>(
  inspections: T[],
  isAdmin: boolean,
  vendorId: string | null,
): T[] {
  if (!isAdmin) return inspections;
  if (!vendorId) return [];
  return inspections.filter((i) => i.vendor_id === vendorId || i.unit_vendor_ids.includes(vendorId));
}

/**
 * 対象月がこの点検行の予定（buildSchedule の行）にあるか。点検月の無い点検行は予定を作らず月を選んで申請するので、どの月も可。
 * 点検月がある点検行は、点検月で、かつ予定を数え始める月（schedule_from）以降の月だけ
 */
function hasScheduleMonth(link: InspectionLinkRow, targetMonth: string): boolean {
  if (link.inspection_months.length === 0) return true;
  return link.inspection_months.includes(Number(targetMonth.slice(5, 7))) && targetMonth >= monthOf(link.schedule_from);
}

/**
 * 物件コード（120410 と 120410-00 は同じ物件）＋点検種別が一致し、点検開始日の月がその点検行の予定にある点検行に結び付ける。
 * 対象月は点検開始日の月。点検開始日の月が点検月でない（予定の行が無い）ときは結び付けない: 結び付けるとどの予定の行にも
 * 出ず、旧来の照合（物件・点検種別・開始日の月）でも出ないのは同じなので、今までどおり入れない。
 * 一致する点検行が複数あれば、その保守会社が点検行の会社であるもの（台だけの会社より先）→ 先頭の順で1つ選ぶ。
 * 一致しなければ null（結び付けない）
 */
export function matchInspectionLink(
  entry: { propertyCode: string | number; inspectionType: string; startDate: string },
  links: InspectionLinkRow[],
  vendorId: string | null,
): InspectionLink | null {
  if (!entry.startDate) return null;
  const code = normalizePropertyCode(String(entry.propertyCode));
  const targetMonth = monthOf(entry.startDate);
  const hits = links.filter(
    (l) =>
      normalizePropertyCode(l.property_code) === code &&
      (l.inspection_type_label ?? '') === entry.inspectionType &&
      hasScheduleMonth(l, targetMonth),
  );
  const hit = hits.find((l) => vendorId !== null && l.vendor_id === vendorId) ?? hits[0];
  if (!hit) return null;
  return { property_inspection_id: hit.inspection_id, vendor_id: vendorId, target_month: targetMonth };
}
