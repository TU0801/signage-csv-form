import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY env vars');
}

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
  templateImages: 'signage_master_template_images',
  settings: 'signage_master_settings',
  buildingVendors: 'building_vendors',
  vendorInspections: 'signage_vendor_inspections',
  buildingEquipment: 'signage_building_equipment',
  adSlots: 'signage_ad_slots',
} as const;
