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
  user_id: string;
  property_code: string;
  inspection_type: string;
  vendor_name: string;
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
}

/** 点検報告書の状態 */
export type ReportStatus = 'submitted' | 'accepted' | 'returned' | 'superseded' | 'deleted';

/** signage_inspection_reports の1行 */
export interface DbInspectionReport {
  id: string;
  property_inspection_id: string;
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
