import { monthOf, normalizePropertyCode } from './schedule';
import type { PortalInspectionRow } from '@/types/portal';

/*
 * 1件入力・一括入力（手で足した行）の申請を、保守会社の点検行（portal_inspections）に結び付ける（修正依頼1024 後続）。
 * 結び付けると点検登録フォーム・点検一覧の予定に「申請中」として現れ、報告書UP が申請 ID 付きで通る。
 */

/** 結び付けに使う点検行（portal_inspections の一部） */
export type InspectionLinkRow = Pick<PortalInspectionRow, 'inspection_id' | 'property_code' | 'inspection_type_label'>;

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
 * 物件コード（120410 と 120410-00 は同じ物件）＋点検種別が一致する点検行に結び付ける。対象月は点検開始日の月（無ければ null）。
 * 一致しなければ null（結び付けない）
 */
export function matchInspectionLink(
  entry: { propertyCode: string | number; inspectionType: string; startDate: string },
  links: InspectionLinkRow[],
  vendorId: string | null,
): InspectionLink | null {
  const code = normalizePropertyCode(String(entry.propertyCode));
  const hit = links.find(
    (l) => normalizePropertyCode(l.property_code) === code && (l.inspection_type_label ?? '') === entry.inspectionType,
  );
  if (!hit) return null;
  return {
    property_inspection_id: hit.inspection_id,
    vendor_id: vendorId,
    target_month: entry.startDate ? monthOf(entry.startDate) : null,
  };
}
