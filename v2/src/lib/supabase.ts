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
} as const;

/** Edge Function（ユーザー作成・パスワード変更。service_role が要るため管理者検証付きでサーバー側が行う） */
export const EDGE_FUNCTIONS = {
  adminUsers: 'signage-admin-users',
} as const;
