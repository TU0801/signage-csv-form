import { RPC, supabase } from '@/lib/supabase';
import { rpcAllRows } from './masterData';
import type { RpcInspectionScheduleRow, RpcMasterPropertyCodeRow } from '@/types/rpc';

// マスター管理の物件（修正依頼1027(7)。scripts/fix-1027-master.sql）

/** 物件コード → マンションコード（補助）と業務システムの物件 id。管理者は全件、管理会社は自社物件。失敗はそのまま投げる */
export async function fetchMasterPropertyCodes(): Promise<Map<string, RpcMasterPropertyCodeRow>> {
  const rows = await rpcAllRows<RpcMasterPropertyCodeRow>(RPC.masterPropertyCodes);
  return new Map(rows.map((r) => [r.property_code, r]));
}

/** 点検日連絡・インターバル・請求月。物件単位の行は 物件コード|点検種別、台の行は台の保守の id で引く */
export interface InspectionSchedules {
  property: Map<string, RpcInspectionScheduleRow>;
  unit: Map<string, RpcInspectionScheduleRow>;
}

/** 点検の行の3項目を読む（管理者は全件・管理会社は自社物件、ほかは0件）。失敗はそのまま投げる */
export async function fetchInspectionSchedules(): Promise<InspectionSchedules> {
  const rows = await rpcAllRows<RpcInspectionScheduleRow>(RPC.masterInspectionSchedules);
  const out: InspectionSchedules = { property: new Map(), unit: new Map() };
  rows.forEach((r) => {
    if (r.kind === 'unit') out.unit.set(r.inspection_id, r);
    else out.property.set(`${r.property_code}|${r.inspection_type_id}`, r);
  });
  return out;
}

/** 点検の行の3項目を書く（upsert の戻り値の点検行 id で。同じ値なら DB は何もしない） */
export async function setInspectionSchedule(
  kind: 'property' | 'unit',
  inspectionId: string,
  values: { notify_inspection_date: boolean; interval_months: number | null; billing_months: number[] },
): Promise<void> {
  const { error } = await supabase.rpc(RPC.setInspectionSchedule, {
    p_kind: kind,
    p_inspection_id: inspectionId,
    p_notify_inspection_date: values.notify_inspection_date,
    p_interval_months: values.interval_months,
    p_billing_months: values.billing_months,
  });
  if (error) throw error;
}

/** 物件の紐付けの件数（管理者だけ。RPC master_property_links） */
export interface PropertyLinks {
  entries: number;
  reports: number;
  building_vendors: number;
  files: number;
  building_equipment: number;
  inspections: number;
  units: number;
}

const LINK_LABELS: [keyof PropertyLinks, string, string][] = [
  ['entries', '点検の申請', '件'],
  ['reports', '点検報告書', '件'],
  ['building_vendors', '保守会社の紐付け', '件'],
  ['files', '物件のファイル', '件'],
  ['building_equipment', '設備（旧）', '件'],
  ['inspections', '設備情報（点検）', '件'],
  ['units', '業務システムの台', '台'],
];

/** 件数のある紐付けの「名前 n件」の並び（DB の delete_master_property の文言と同じ） */
export function propertyLinkParts(links: PropertyLinks): string[] {
  return LINK_LABELS.filter(([k]) => Number(links[k] ?? 0) > 0).map(
    ([k, label, unit]) => `${label} ${Number(links[k])}${unit}`,
  );
}

export async function fetchPropertyLinks(propertyCode: string): Promise<PropertyLinks> {
  const { data, error } = await supabase.rpc(RPC.masterPropertyLinks, { p_property_code: propertyCode });
  if (error) throw error;
  return data as PropertyLinks;
}

/** 物件を設備点検管理システムから外す（業務システムの物件は残り、リンクが外れる）。紐付けがあれば DB が断る */
export async function deleteMasterProperty(propertyCode: string): Promise<void> {
  const { error } = await supabase.rpc(RPC.deleteMasterProperty, { p_property_code: propertyCode });
  if (error) throw error;
}
