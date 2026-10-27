import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY env vars');
}

export const SUPABASE_URL: string = supabaseUrl;
export const SUPABASE_ANON_KEY: string = supabaseAnonKey;

// baranプロジェクトはアプリ別スキーマ構成。本アプリのテーブルはsignageスキーマに在る
// Microsoft ログインは PKCE（戻り先 /login の ?code= を初期化時にセッションへ交換する）
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: { schema: 'signage' },
  auth: { flowType: 'pkce' },
});

/** v1テーブル名 → v2コード内で使う定数 */
export const TABLES = {
  profiles: 'signage_profiles',
  entries: 'signage_entries',
  properties: 'signage_master_properties',
  vendors: 'signage_master_vendors',
  inspectionTypes: 'signage_master_inspection_types',
  categories: 'signage_master_categories',
  /** 旧表（書き込み不可）。読むのは RPC template_images_master が失敗したときだけ */
  templateImages: 'signage_master_template_images',
  settings: 'signage_master_settings',
  buildingVendors: 'signage_building_vendors',
  vendorInspections: 'signage_vendor_inspections',
  adSlots: 'signage_ad_slots',
  errorLogs: 'signage_error_logs',
  /** 点検報告書（点検ポータル）。書き込みは RPC だけ */
  inspectionReports: 'signage_inspection_reports',
  /** 新規建物の申請（2026-10-24）。承認・却下は RPC だけ */
  propertyRequests: 'signage_property_requests',
  /** 点検種別の印（修正依頼1025 H4/G4: 申請不要・毎月）。書くのは管理者だけ。scripts/fix-1025-form.sql */
  inspectionTypeFlags: 'signage_inspection_type_flags',
  /** 貼紙ライブラリ（文字を合成しない貼紙。修正依頼1025 D2。scripts/fix-1025-posters.sql） */
  posterLibrary: 'signage_poster_library',
  /** その他ファイル（見積書・請求書など。修正依頼1025 G2）。書き込みは RPC だけ */
  propertyFiles: 'signage_property_files',
} as const;

/** signage スキーマの RPC（biz への窓口） */
export const RPC = {
  inspectionsAll: 'inspections_all',
  inspectionsForProperty: 'inspections_for_property',
  upsertPropertyInspection: 'upsert_property_inspection',
  deletePropertyInspection: 'delete_property_inspection',
  templateImagesMaster: 'template_images_master',
  unitInspectionsAll: 'unit_inspections_all',
  unitInspectionTypeOptions: 'unit_inspection_type_options',
  upsertUnitInspection: 'upsert_unit_inspection',
  deleteUnitInspection: 'delete_unit_inspection',
  propertyManagementCompanies: 'property_management_companies',
  /** マスター管理の物件一覧の管理会社（修正依頼1025 E1。管理者は全物件・管理会社は自社物件）。scripts/fix-1025-master.sql */
  masterPropertyManagementCompanies: 'master_property_management_companies',
  /** 点検ポータル（2026-10-21）。範囲（管理者・保守会社・管理会社）は DB 側で絞る */
  portalInspections: 'portal_inspections',
  portalEntries: 'portal_entries',
  portalReviewEntry: 'portal_review_entry',
  /** 見た版（updated_at）の申請だけを承認する（修正依頼1026 I11）。scripts/fix-1026-units.sql */
  portalApproveEntryChecked: 'portal_approve_entry_checked',
  portalRegisterReport: 'portal_register_report',
  portalUpdateReport: 'portal_update_report',
  portalReviewReport: 'portal_review_report',
  managementCompaniesMaster: 'management_companies_master',
  /** 新規建物の申請（2026-10-24）。管理会社の候補は管理者以外にも返す。承認・却下は管理者だけ */
  managementCompaniesForRequest: 'management_companies_for_request',
  inspectionTypeOptionsForRequest: 'inspection_type_options_for_request',
  approvePropertyRequest: 'approve_property_request',
  rejectPropertyRequest: 'reject_property_request',
  /** 建物追加の申請の管理会社の審査（任意）と、未承認の建物の掲示の申請の件数（修正依頼1025 D4・F2） */
  mgmtReviewPropertyRequest: 'mgmt_review_property_request',
  propertyRequestEntryCounts: 'property_request_entry_counts',
  /**
   * 管理会社メニュー（修正依頼1024 C2・C3）。管理会社のアカウントで、自社が管理する物件だけを読み書きする。
   * 戻り値の形は管理者用の同名（mgmt_ を外したもの）と同じ。scripts/fix-1024-mgmt.sql
   */
  mgmtInspectionsAll: 'mgmt_inspections_all',
  mgmtInspectionsForProperty: 'mgmt_inspections_for_property',
  mgmtUpsertPropertyInspection: 'mgmt_upsert_property_inspection',
  mgmtDeletePropertyInspection: 'mgmt_delete_property_inspection',
  mgmtUnitInspectionsAll: 'mgmt_unit_inspections_all',
  mgmtUnitInspectionTypeOptions: 'mgmt_unit_inspection_type_options',
  mgmtUpsertUnitInspection: 'mgmt_upsert_unit_inspection',
  mgmtDeleteUnitInspection: 'mgmt_delete_unit_inspection',
  mgmtReviewBuildingRequest: 'mgmt_review_building_request',
  mgmtAddBuildingVendor: 'mgmt_add_building_vendor',
  mgmtRemoveBuildingVendor: 'mgmt_remove_building_vendor',
  mgmtOwnCompany: 'mgmt_own_company',
  /** 点検登録フォーム（2026-10-24）。scripts/fix-1024-core.sql */
  managementCompaniesScoped: 'management_companies_scoped',
  portalCompletions: 'portal_completions',
  /** 完了連絡。毎月・申請不要の印と点検月以外の月の申請を通す版（修正依頼1025 form。scripts/fix-1025-form.sql）。旧 portal_mark_completed は使わない */
  portalMarkCompleted: 'portal_mark_completed_any_month',
  portalUnmarkCompleted: 'portal_unmark_completed',
  portalInspectionDates: 'portal_inspection_dates',
  /** マスター管理の物件の検査月（管理者・管理会社は自社物件）。書き込みは upsert の戻り値の点検行 id で */
  propertyInspectionDates: 'property_inspection_dates',
  setPropertyInspectionInspectedOn: 'set_property_inspection_inspected_on',
  /** 使われていない貼紙画像の一覧（管理者だけ。修正依頼1024 後続 orphan。scripts/fix-1024-followups-orphan.sql） */
  orphanPosterImages: 'orphan_poster_images',
  /** 点検登録フォーム（修正依頼1025 form）。号機（台）と設備会社固有コード、管理会社の略称。scripts/fix-1025-form.sql */
  portalInspectionUnits: 'portal_inspection_units',
  managementCompanyShortNames: 'management_company_short_names',
  /** 号機（台）ごとの申請・点検日連絡・申請済みの修正（修正依頼1026 units。scripts/fix-1026-units.sql） */
  portalEntryUnits: 'portal_entry_units',
  portalInspectionNotifyOff: 'portal_inspection_notify_off',
  portalEntryForEdit: 'portal_entry_for_edit',
  portalUpdateSubmittedEntry: 'portal_update_submitted_entry',
  /** この物件の申請で選べる貼紙ライブラリ（全社共通＋物件の管理会社の分。修正依頼1025 D2） */
  posterLibraryForProperty: 'poster_library_for_property',
  /** ライブラリの画像が申請・ライブラリの行から使われているか（使われていなければ片付けてよい） */
  posterLibraryObjectInUse: 'poster_library_object_in_use',
  /** その他ファイルと AI-OCR の自己改善（修正依頼1025 G2・G4。scripts/fix-1025-reports.sql） */
  portalRegisterPropertyFile: 'portal_register_property_file',
  portalDeletePropertyFile: 'portal_delete_property_file',
  /** その他ファイルを置ける建物（点検行の無い自社物件を含む） */
  portalPropertyFileTargets: 'portal_property_file_targets',
  ocrRecordCorrections: 'ocr_record_corrections',
  ocrCorrectionDictionary: 'ocr_correction_dictionary',
  /** 一括入力テンプレートの保守会社の略称と、点検種別の並び（業務システムの設備の並び。修正依頼1027 (2)。scripts/fix-1027-bulk.sql） */
  bulkTemplateInfo: 'bulk_template_info',
} as const;

/** Storage のバケット */
export const BUCKETS = {
  /** 点検報告書（非公開・PDF・50MB）。置き場所は {property_inspection_id}/{uuid}.pdf、読むときは署名付き URL */
  inspectionReports: 'inspection-reports',
  /** その他ファイル（非公開・50MB）。置き場所は {物件コード}/{uuid}.{拡張子}、読むときは署名付き URL */
  propertyFiles: 'property-files',
} as const;

/** Edge Function（ユーザー作成・パスワード変更。service_role が要るため管理者検証付きでサーバー側が行う） */
export const EDGE_FUNCTIONS = {
  adminUsers: 'signage-admin-users',
  /** AI-OCR（Claude Haiku。キー ANTHROPIC_API_KEY が未設定なら 503） */
  aiOcr: 'signage-ai-ocr',
} as const;
