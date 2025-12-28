-- ========================================
-- signage_master_settings: 設定マスター
-- ========================================
-- 管理者が変更可能なシステム設定

CREATE TABLE IF NOT EXISTS signage_master_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT NOT NULL UNIQUE,
  setting_value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS設定
ALTER TABLE signage_master_settings ENABLE ROW LEVEL SECURITY;

-- 誰でも読み取り可能
CREATE POLICY "Anyone can read settings"
  ON signage_master_settings FOR SELECT
  USING (true);

-- 管理者のみ更新可能
CREATE POLICY "Admins can manage settings"
  ON signage_master_settings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM signage_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 初期データ投入
INSERT INTO signage_master_settings (setting_key, setting_value, description) VALUES
  ('display_time_max', '30', '表示時間の上限（秒）'),
  ('remarks_chars_per_line', '25', '掲示備考の1行あたり文字数制限'),
  ('remarks_max_lines', '5', '掲示備考の最大行数'),
  ('notice_text_max_chars', '200', '案内文の最大文字数')
ON CONFLICT (setting_key) DO UPDATE SET
  setting_value = EXCLUDED.setting_value,
  updated_at = NOW();

-- ========================================
-- signage_master_categories: 案内文カテゴリ
-- ========================================
CREATE TABLE IF NOT EXISTS signage_master_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_name TEXT NOT NULL UNIQUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS設定
ALTER TABLE signage_master_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read categories"
  ON signage_master_categories FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage categories"
  ON signage_master_categories FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM signage_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 初期データ投入
INSERT INTO signage_master_categories (category_name, sort_order) VALUES
  ('点検', 1),
  ('工事', 2),
  ('清掃', 3),
  ('アンケート', 4)
ON CONFLICT (category_name) DO NOTHING;

-- ========================================
-- signage_master_inspection_types にカテゴリ列を追加
-- ========================================
ALTER TABLE signage_master_inspection_types
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES signage_master_categories(id);
