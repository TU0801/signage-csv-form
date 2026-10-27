/**
 * signage スキーマの RPC（biz への窓口）の戻り値。
 * 列は pg_get_function_result で実DBから確認した形（2026-10-15）。
 * 管理会社用の mgmt_inspections_all / mgmt_inspections_for_property / mgmt_unit_inspections_all /
 * mgmt_unit_inspection_type_options（修正依頼1024 C2。scripts/fix-1024-mgmt.sql）は、mgmt_ を外した同名の RPC と同じ列を返す
 * （範囲が自社の物件に絞られるだけ）ので、下の型をそのまま使う。
 */

/** inspections_all() の1行（物件×点検種別） */
export interface RpcInspectionRow {
  property_code: string;
  inspection_type_id: string;
  vendor_id: string | null;
  inspection_months: number[] | null;
  remarks: string | null;
  remarks2: string | null;
}

/** inspections_for_property(p_property_code) の1行 */
export interface RpcPropertyInspectionRow {
  id: string;
  property_code: string;
  property_name: string;
  inspection_type_id: string;
  inspection_name: string;
  template_no: string;
  default_text: string | null;
  maintainer_id: string | null;
  maintainer_name: string | null;
  emergency_contact: string | null;
  inspection_months: number[] | null;
  maintainer_equipment_code: string | null;
  remarks: string | null;
  remarks2: string | null;
}

/** unit_inspections_all() の1行（台×点検種別。保守がまだ無い台は inspection_id から後ろが null） */
export interface RpcUnitInspectionRow {
  property_code: string;
  category_code: string;
  category_label: string | null;
  unit_id: string;
  unit_sort: number | null;
  unit_code: string | null;
  unit_location: string | null;
  unit_remarks: string | null;
  unit_remarks2: string | null;
  inspection_id: string | null;
  inspection_type_id: string | null;
  inspection_type_label: string | null;
  vendor_id: string | null;
  vendor_name: string | null;
  inspection_months: number[] | null;
  inspected_on: string | null;
  legacy_remarks: string | null;
  legacy_remarks2: string | null;
}

/** unit_inspection_type_options() の1行（台に付けられる点検種別の選択肢） */
export interface RpcUnitInspectionTypeOption {
  category_code: string;
  inspection_type_id: string;
  inspection_type_label: string;
  sort: number | null;
}

/** master_property_management_companies() の1行（修正依頼1025 E1。管理者は全物件・管理会社は自社物件、ほかは0行。未設定は null） */
export interface RpcMasterPropertyManagementCompanyRow {
  property_code: string;
  management_company_id: string | null;
  management_company_name: string | null;
  /** biz.companies.short_name（空は null） */
  management_company_short_name: string | null;
}

/** property_management_companies() の1行（物件ごとの管理会社。未設定は null。有効な管理者以外には0行） */
export interface RpcPropertyManagementCompanyRow {
  property_code: string;
  management_company_id: string | null;
  management_company_name: string | null;
}

/** RPC master_property_codes の行（修正依頼1027(7)）。en_no はマンションコード（補助）＝ biz.properties.en_no（空は null） */
export interface RpcMasterPropertyCodeRow {
  property_code: string;
  biz_property_id: string;
  en_no: string | null;
}

/** RPC master_inspection_schedules の行（修正依頼1027(7)）。kind は物件単位（property）か台ごと（unit） */
export interface RpcInspectionScheduleRow {
  kind: 'property' | 'unit';
  inspection_id: string;
  property_code: string;
  inspection_type_id: string;
  notify_inspection_date: boolean;
  interval_months: number | null;
  billing_months: number[] | null;
}
