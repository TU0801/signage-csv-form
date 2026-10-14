/**
 * signage スキーマの RPC（biz への窓口）の戻り値。
 * 列は pg_get_function_result で実DBから確認した形（2026-10-15）。
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
