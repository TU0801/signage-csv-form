/*
 * 点検ポータル（2026-10-21）の DB 行の型。定義は scripts/inspection-portal.sql。
 * 範囲（管理者は全件・保守会社は担当の点検・管理会社は自社物件）は RPC と RLS が絞る。
 */

/** RPC portal_inspections の1行（点検行 = biz.property_inspections） */
export interface PortalInspectionRow {
  inspection_id: string;
  property_code: string;
  property_name: string;
  /** 物件の端末数。0 の物件も申請できる（terminal_id は ''） */
  terminal_count: number;
  /** 物件の端末 ID（並び順どおり）。保守会社の物件マスタに無い点検物件でも端末を選べるように RPC が返す */
  terminal_ids: string[];
  management_company_id: string | null;
  management_company_name: string | null;
  inspection_type_id: string;
  inspection_type_label: string | null;
  template_no: string | null;
  /** 点検行の保守会社。台を持つ点検は先頭の台の会社（ほかの台の会社は unit_vendor_ids） */
  vendor_id: string | null;
  vendor_name: string | null;
  unit_vendor_ids: string[];
  /** 毎年この月に点検する（1〜12、年は無い） */
  inspection_months: number[];
  /** 予定を数え始める月（点検行を登録した月、月初の日付） */
  schedule_from: string;
  remarks: string;
}

/** RPC portal_entries の1行（範囲内の申請） */
export interface PortalEntryRow {
  id: string;
  /** 申請者。同じ点検の台を受け持つ別の保守会社には null で返る（vendor_name・日付・理由・掲示の内容も同じ） */
  user_id: string | null;
  property_code: string;
  inspection_type: string;
  vendor_name: string | null;
  vendor_id: string | null;
  property_inspection_id: string | null;
  target_month: string | null;
  inspection_start: string | null;
  inspection_end: string | null;
  status: 'pending' | 'draft' | 'ready' | 'exported';
  review_comment: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string | null;
  /** ログイン中のアカウントが作った申請か */
  is_mine: boolean;
  /**
   * 台ごとの申請の台（biz.property_units.id。修正依頼1026 I7）。portal_entries は返さないので portal_entry_units で足す。
   * 台なし（1台以下の点検・旧来・1件入力）は null（点検行 × 対象月の全体の申請として全部の台に効く）
   */
  property_unit_id?: string | null;
  /** 掲示の内容（管理会社が承認の前に確かめる）。同じ点検の台を受け持つ別の保守会社には null で返る */
  terminal_id: string | null;
  template_no: string | null;
  announcement: string | null;
  remarks: string | null;
  poster_type: 'template' | 'custom' | null;
  poster_image: string | null;
  display_start_date: string | null;
  display_start_time: string | null;
  display_end_date: string | null;
  display_end_time: string | null;
}

/** 点検報告書の状態 */
export type ReportStatus = 'submitted' | 'accepted' | 'returned' | 'superseded' | 'deleted';

/** signage_inspection_reports の1行 */
export interface DbInspectionReport {
  id: string;
  /** 業務システムで点検行が消されると null（報告書は写しの列で残る） */
  property_inspection_id: string | null;
  property_code: string;
  property_name: string;
  inspection_type_id: string | null;
  inspection_type_label: string;
  vendor_id: string | null;
  vendor_name: string | null;
  target_month: string | null;
  performed_on: string;
  entry_id: string | null;
  file_name: string;
  original_name: string | null;
  size_bytes: number | null;
  mime: string;
  content_hash: string | null;
  storage_backend: 'supabase' | 'archive';
  storage_path: string;
  status: ReportStatus;
  status_before_delete: ReportStatus | null;
  note: string | null;
  review_comment: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  uploaded_by: string;
  archived_at: string | null;
  retention_until: string | null;
  created_at: string;
  updated_at: string;
}

/** RPC management_companies_master の1行（管理者だけ） */
export interface ManagementCompanyRow {
  id: string;
  name: string;
}

/**
 * RPC portal_inspection_units の1行（修正依頼1025 H1〜H3）。範囲内の点検行の台（biz.property_unit_inspections があるもの）。
 * 台の無い点検行で設備会社固有コードがあるものは unit_id null の1行（equipment_code だけ）
 */
export interface PortalUnitRow {
  inspection_id: string;
  unit_id: string | null;
  /** 設備会社固有の No（No1 など。サイネージの台は端末番号）。未登録は null */
  unit_code: string | null;
  unit_sort: number | null;
  /** 台の保守会社 */
  maintainer_id: string | null;
  inspection_months: number[];
  inspected_on: string | null;
  /** 点検行の設備会社固有コード（biz.property_inspections.maintainer_equipment_code） */
  equipment_code: string | null;
}

/** RPC portal_entry_units の1行（修正依頼1026 I7）。台ごとの申請の台 */
export interface PortalEntryUnitRow {
  entry_id: string;
  property_unit_id: string;
}

/** RPC portal_inspection_notify_off の1行（修正依頼1026）。点検日連絡が OFF の点検行（unit_id null）と台 */
export interface NotifyOffRow {
  inspection_id: string;
  unit_id: string | null;
}

/** signage_inspection_type_flags の1行（修正依頼1025 H4/G4）。行が無い点検種別はどちらも false */
export interface InspectionTypeFlagRow {
  inspection_type_id: string;
  /** 申請不要（報告書のみ）。予定行に申請の欄を出さず、報告書UP・完了連絡だけ */
  report_only: boolean;
  /** 点検月『毎月』。毎月の予定行を出す */
  monthly: boolean;
}

/** RPC management_company_short_names の1行（F5）。short_name は未登録なら null */
export interface ManagementCompanyShortNameRow {
  id: string;
  name: string;
  short_name: string | null;
}

/** その他ファイルの区分（signage_property_files.category） */
export const PROPERTY_FILE_CATEGORY_VALUES = ['estimate', 'invoice', 'contract', 'building_info', 'proposal', 'photo', 'other'] as const;
export type PropertyFileCategory = (typeof PROPERTY_FILE_CATEGORY_VALUES)[number];

export function isPropertyFileCategory(value: unknown): value is PropertyFileCategory {
  return typeof value === 'string' && (PROPERTY_FILE_CATEGORY_VALUES as readonly string[]).includes(value);
}

/** signage_property_files の1行（修正依頼1025 G2。scripts/fix-1025-reports.sql） */
export interface DbPropertyFile {
  id: string;
  property_id: string | null;
  property_code: string;
  property_name: string;
  category: PropertyFileCategory;
  category_note: string | null;
  doc_date: string | null;
  file_name: string;
  original_name: string | null;
  storage_path: string;
  mime_type: string;
  size_bytes: number | null;
  content_hash: string | null;
  uploaded_by: string;
  vendor_id: string | null;
  vendor_name: string | null;
  management_company_id: string | null;
  note: string | null;
  ocr_result: unknown;
  status: 'active' | 'deleted';
  created_at: string;
  updated_at: string;
  /** 見ている人が削除できるか（一覧の計算列。DB の property_file_can_delete。修正依頼1029） */
  can_delete?: boolean;
}
