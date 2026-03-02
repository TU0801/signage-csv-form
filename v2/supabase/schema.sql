-- v2 スキーマリファレンス
-- 実際のテーブル名は signage_ プレフィックス付き（既存DBと互換）
-- コード内では TABLES 定数経由でアクセス

-- signage_profiles
CREATE TABLE IF NOT EXISTS signage_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT NOT NULL,
  company_name TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  vendor_id UUID REFERENCES signage_master_vendors(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- signage_entries
CREATE TABLE IF NOT EXISTS signage_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  property_code TEXT NOT NULL,
  terminal_id TEXT NOT NULL,
  vendor_name TEXT NOT NULL,
  emergency_contact TEXT,
  inspection_type TEXT NOT NULL,
  template_no TEXT,
  inspection_start DATE,
  inspection_end DATE,
  display_start_date DATE,
  display_start_time TEXT,
  display_end_date DATE,
  display_end_time TEXT,
  display_duration INTEGER DEFAULT 10,
  announcement TEXT,
  remarks TEXT,
  poster_type TEXT DEFAULT 'template' CHECK (poster_type IN ('template', 'custom')),
  poster_position TEXT DEFAULT '4',
  frame_no TEXT DEFAULT '1',
  status TEXT DEFAULT 'draft' CHECK (status IN ('pending', 'draft', 'ready', 'exported')),
  poster_image TEXT,
  inspection_co SERIAL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- signage_master_properties
CREATE TABLE IF NOT EXISTS signage_master_properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_code TEXT UNIQUE NOT NULL,
  property_name TEXT NOT NULL,
  terminals JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- signage_master_vendors
CREATE TABLE IF NOT EXISTS signage_master_vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_name TEXT UNIQUE NOT NULL,
  emergency_contact TEXT,
  inspection_type TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- signage_master_inspection_types
CREATE TABLE IF NOT EXISTS signage_master_inspection_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_name TEXT UNIQUE NOT NULL,
  template_no TEXT NOT NULL,
  template_image TEXT,
  default_text TEXT,
  category_id UUID REFERENCES signage_master_categories(id),
  category TEXT,
  show_on_board BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- signage_master_categories
CREATE TABLE IF NOT EXISTS signage_master_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_name TEXT UNIQUE NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- signage_master_template_images
CREATE TABLE IF NOT EXISTS signage_master_template_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_key TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  image_url TEXT NOT NULL,
  category TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- signage_master_settings
CREATE TABLE IF NOT EXISTS signage_master_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT UNIQUE NOT NULL,
  setting_value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- building_vendors
CREATE TABLE IF NOT EXISTS building_vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_code TEXT NOT NULL,
  vendor_id UUID NOT NULL REFERENCES signage_master_vendors(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'deleted')),
  requested_by UUID REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- signage_vendor_inspections
CREATE TABLE IF NOT EXISTS signage_vendor_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES signage_master_vendors(id),
  inspection_id UUID NOT NULL REFERENCES signage_master_inspection_types(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- signage_building_equipment
CREATE TABLE IF NOT EXISTS signage_building_equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_code TEXT NOT NULL,
  inspection_type_id UUID NOT NULL,
  vendor_id UUID,
  inspection_months JSONB DEFAULT '[]',
  remarks TEXT,
  remarks2 TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- signage_ad_slots
CREATE TABLE IF NOT EXISTS signage_ad_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_index INTEGER UNIQUE NOT NULL CHECK (slot_index >= 1 AND slot_index <= 7),
  image_url TEXT,
  caption TEXT DEFAULT '',
  link_url TEXT DEFAULT '',
  is_active BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
