/** signage_profiles テーブル */
export interface DbProfile {
  id: string;
  email: string;
  company_name: string | null;
  /** admin: 管理者（BARAN） / user: 保守会社（vendor_id） / management: 管理会社（management_company_id → biz.companies） */
  role: 'admin' | 'user' | 'management';
  vendor_id: string | null;
  /** 管理会社アカウントの会社（role='management' のときだけ。点検ポータル 2026-10-21） */
  management_company_id?: string | null;
  /** 無効化は 'inactive'（RLS の is_active_member / is_active_admin は 'active' だけを通す） */
  status: 'active' | 'inactive';
  created_at: string | null;
  updated_at: string | null;
}

/** signage_entries テーブル */
export interface DbEntry {
  id: string;
  user_id: string;
  property_code: string;
  terminal_id: string;
  vendor_name: string;
  emergency_contact: string | null;
  inspection_type: string;
  template_no: string | null;
  inspection_start: string | null;
  inspection_end: string | null;
  display_start_date: string | null;
  display_start_time: string | null;
  display_end_date: string | null;
  display_end_time: string | null;
  display_duration: number | null;
  announcement: string | null;
  remarks: string | null;
  poster_type: 'template' | 'custom' | null;
  poster_position: string | null;
  frame_no: string | null;
  status: 'pending' | 'draft' | 'ready' | 'exported' | null;
  poster_image: string | null;
  inspection_co: number;
  /** 点検ポータルから申請したときの点検行（biz.property_inspections.id）。旧来の申請は null */
  property_inspection_id?: string | null;
  /** 申請した保守会社（点検ポータルから申請したときだけ。旧来の申請は vendor_name の文字列だけ） */
  vendor_id?: string | null;
  /** 何月分の点検の申請か（月初の日付）。点検ポータルから申請したときだけ */
  target_month?: string | null;
  /** 承認・差戻しのコメント（差戻しでは理由） */
  review_comment?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/** signage_master_properties テーブル */
export interface DbProperty {
  id: string;
  property_code: string;
  property_name: string;
  terminals: DbTerminal[];
  /**
   * 移行前の点検情報（読み取り専用）。**書き込み禁止**: block_equipment_write トリガーが
   * 値の変更を拒否する（2026-09-20 凍結）。点検情報の正本は biz.property_inspections で、
   * lib/api の overlayInspections / saveInspectionsToBiz を使う。
   */
  readonly equipment: DbLegacyEquipment[];
  created_at: string | null;
}

/**
 * terminals jsonb の1要素。実データは terminalId と terminal_id が混在する。
 * 読むときは normalizeTerminalId（lib/terminal.ts）、書くときは v1 と同じ terminal_id を使う
 * （v1: js/admin-masters.js handleMasterFormSubmit）
 */
export interface DbTerminal {
  terminalId?: string;
  terminal_id?: string;
  supplement?: string;
}

/** 正規化済みの端末（画面で使う形） */
export interface Terminal {
  terminal_id: string;
  supplement: string;
}

/** signage_master_properties.equipment jsonb の1要素（移行前の名残。読み取り専用） */
export interface DbLegacyEquipment {
  inspection_type_id?: string;
  vendor_id?: string | null;
  inspection_months?: number[];
  remarks?: string;
  remarks2?: string;
}

/** signage_master_vendors テーブル（読み取り専用。正本は biz の取引先で、block_vendor_direct_write が直接の書き込みを拒否する） */
export interface DbVendor {
  id: string;
  vendor_name: string;
  emergency_contact: string | null;
  inspection_type: string | null;
  created_at: string | null;
}

/** signage_master_inspection_types テーブル */
export interface DbInspectionType {
  id: string;
  inspection_name: string;
  template_no: string;
  template_image: string | null;
  default_text: string | null;
  category_id: string | null;
  category: string | null;
  show_on_board: boolean | null;
  sort_order: number | null;
  created_at: string | null;
}

/** signage_master_categories テーブル */
export interface DbCategory {
  id: string;
  category_name: string;
  sort_order: number | null;
  created_at: string | null;
}

/**
 * テンプレート画像。正本は biz.template_images で RPC template_images_master が返す形と同じ列。
 * 旧表 signage_master_template_images（block_template_images_write で書き込み不可）は RPC 失敗時の読み取りだけに使う
 */
export interface DbTemplateImage {
  id: string;
  image_key: string;
  display_name: string;
  image_url: string;
  category: string | null;
  sort_order: number | null;
  /** 旧表だけにある列（RPC は返さない） */
  created_at?: string | null;
}

/** signage_master_settings テーブル */
export interface DbSetting {
  id: string;
  setting_key: string;
  setting_value: string;
  description: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/** signage_building_vendors テーブル（UNIQUE(property_code, vendor_id)。解除は status='deleted' のソフトデリート） */
export interface DbBuildingVendor {
  id: string;
  property_code: string;
  vendor_id: string;
  status: 'active' | 'pending' | 'deleted';
  requested_by: string | null;
  approved_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/** signage_vendor_inspections テーブル */
export interface DbVendorInspection {
  id: string;
  vendor_id: string;
  inspection_id: string;
  status: 'active' | 'inactive';
  created_at: string | null;
  updated_at: string | null;
}

/** signage_ad_slots テーブル（slot_index は CHECK 1〜7。ログイン画面で使うのは 1〜3） */
export interface DbAdSlot {
  id: string;
  slot_index: number;
  image_url: string | null;
  caption: string | null;
  link_url: string | null;
  is_active: boolean | null;
  sort_order: number | null;
  created_at: string | null;
  updated_at: string | null;
}

/** signage_error_logs テーブル（INSERT は is_active_member かつ user_id が本人か null のときだけ RLS が通す） */
export interface DbErrorLog {
  id: number;
  created_at: string | null;
  context: string | null;
  message: string | null;
  stack: string | null;
  user_id: string | null;
  user_agent: string | null;
  url: string | null;
}

/** signage_audit_logs テーブル（DB の audit_trigger が自動で書く。クライアントからは書かない） */
export interface DbAuditLog {
  id: number;
  table_name: string;
  operation: string;
  record_id: string | null;
  user_id: string | null;
  old_data: unknown;
  new_data: unknown;
  created_at: string | null;
}
