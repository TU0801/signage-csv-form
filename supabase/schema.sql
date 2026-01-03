-- ========================================
-- Signage CSV Form - Supabase Schema
-- ========================================
-- このSQLをSupabaseのSQL Editorで実行してください

-- ========================================
-- signage_profiles: ユーザープロファイル
-- ========================================
CREATE TABLE signage_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  company_name TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 新規ユーザー登録時に自動でプロファイル作成するトリガー
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.signage_profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'user');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ========================================
-- signage_entries: 点検データ（メイン）
-- ========================================
CREATE TABLE signage_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'exported')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- updated_at自動更新トリガー
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_signage_entries_updated_at
  BEFORE UPDATE ON signage_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- signage_master_properties: 物件マスター
-- ========================================
CREATE TABLE signage_master_properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_code TEXT NOT NULL UNIQUE,
  property_name TEXT NOT NULL,
  terminals JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- signage_master_vendors: 受注先マスター
-- ========================================
CREATE TABLE signage_master_vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_name TEXT NOT NULL UNIQUE,
  emergency_contact TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- signage_master_inspection_types: 点検種別マスター
-- ========================================
CREATE TABLE signage_master_inspection_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_name TEXT NOT NULL UNIQUE,
  template_no TEXT NOT NULL,
  template_image TEXT,
  default_text TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- signage_master_template_images: テンプレート画像マスター
-- ========================================
CREATE TABLE signage_master_template_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  image_url TEXT NOT NULL,
  category TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- Row Level Security (RLS) 設定
-- ========================================

-- signage_profiles
ALTER TABLE signage_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON signage_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON signage_profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON signage_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM signage_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- signage_entries
ALTER TABLE signage_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own entries"
  ON signage_entries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own entries"
  ON signage_entries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own entries"
  ON signage_entries FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own entries"
  ON signage_entries FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all entries"
  ON signage_entries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM signage_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update all entries"
  ON signage_entries FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM signage_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can delete all entries"
  ON signage_entries FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM signage_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- マスターデータ（誰でも読み取り可能）
ALTER TABLE signage_master_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE signage_master_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE signage_master_inspection_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE signage_master_template_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read properties"
  ON signage_master_properties FOR SELECT
  USING (true);

CREATE POLICY "Anyone can read vendors"
  ON signage_master_vendors FOR SELECT
  USING (true);

CREATE POLICY "Anyone can read inspection_types"
  ON signage_master_inspection_types FOR SELECT
  USING (true);

CREATE POLICY "Anyone can read template_images"
  ON signage_master_template_images FOR SELECT
  USING (true);

-- 管理者のみマスターデータ更新可能
CREATE POLICY "Admins can manage properties"
  ON signage_master_properties FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM signage_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can manage vendors"
  ON signage_master_vendors FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM signage_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can manage inspection_types"
  ON signage_master_inspection_types FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM signage_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can manage template_images"
  ON signage_master_template_images FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM signage_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
