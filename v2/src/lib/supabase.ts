import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY env vars');
}

export const SUPABASE_URL: string = supabaseUrl;
export const SUPABASE_ANON_KEY: string = supabaseAnonKey;

// baranプロジェクトはアプリ別スキーマ構成。本アプリのテーブルはsignageスキーマに在る
export const supabase = createClient(supabaseUrl, supabaseAnonKey, { db: { schema: 'signage' } });

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
  /** 点検ポータル（2026-10-21）。範囲（管理者・保守会社・管理会社）は DB 側で絞る */
  portalInspections: 'portal_inspections',
  portalEntries: 'portal_entries',
  portalReviewEntry: 'portal_review_entry',
  portalRegisterReport: 'portal_register_report',
  portalUpdateReport: 'portal_update_report',
  portalReviewReport: 'portal_review_report',
  managementCompaniesMaster: 'management_companies_master',
  /** 点検登録フォーム（2026-10-24）。scripts/fix-1024-core.sql */
  managementCompaniesScoped: 'management_companies_scoped',
  portalCompletions: 'portal_completions',
  portalMarkCompleted: 'portal_mark_completed',
  portalUnmarkCompleted: 'portal_unmark_completed',
  portalInspectionDates: 'portal_inspection_dates',
} as const;

/** Storage のバケット */
export const BUCKETS = {
  /** 点検報告書（非公開・PDF・50MB）。置き場所は {property_inspection_id}/{uuid}.pdf、読むときは署名付き URL */
  inspectionReports: 'inspection-reports',
} as const;

/** Edge Function（ユーザー作成・パスワード変更。service_role が要るため管理者検証付きでサーバー側が行う） */
export const EDGE_FUNCTIONS = {
  adminUsers: 'signage-admin-users',
} as const;
