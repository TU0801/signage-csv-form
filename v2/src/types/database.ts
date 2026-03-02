/** signage_profiles テーブル */
export interface DbProfile {
  id: string;
  email: string;
  company_name: string | null;
  role: 'admin' | 'user';
  vendor_id: string | null;
  is_active: boolean;
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
  created_at: string | null;
  updated_at: string | null;
}

/** signage_master_properties テーブル */
export interface DbProperty {
  id: string;
  property_code: string;
  property_name: string;
  terminals: Terminal[];
  created_at: string | null;
}

export interface Terminal {
  id: string;
  supplement?: string;
}

/** signage_master_vendors テーブル */
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

/** signage_master_template_images テーブル */
export interface DbTemplateImage {
  id: string;
  image_key: string;
  display_name: string;
  image_url: string;
  category: string | null;
  sort_order: number | null;
  created_at: string | null;
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

/** building_vendors テーブル */
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

/** signage_building_equipment テーブル */
export interface DbBuildingEquipment {
  id: string;
  property_code: string;
  inspection_type_id: string;
  vendor_id: string | null;
  inspection_months: number[] | null;
  remarks: string | null;
  remarks2: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/** signage_ad_slots テーブル */
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
