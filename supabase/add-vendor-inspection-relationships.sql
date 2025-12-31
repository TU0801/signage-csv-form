-- ========================================
-- Vendor-Inspection Type Relationships
-- ========================================
-- 目的: メンテナンス会社と点検種別の紐付けを管理

-- 新規テーブル: vendor_inspections
CREATE TABLE IF NOT EXISTS vendor_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES signage_master_vendors(id) ON DELETE CASCADE,
  inspection_id UUID NOT NULL REFERENCES signage_master_inspection_types(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(vendor_id, inspection_id)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_vendor_inspections_vendor ON vendor_inspections(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_inspections_inspection ON vendor_inspections(inspection_id);
CREATE INDEX IF NOT EXISTS idx_vendor_inspections_status ON vendor_inspections(status);

-- updated_at自動更新トリガー
CREATE TRIGGER update_vendor_inspections_updated_at
  BEFORE UPDATE ON vendor_inspections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS ポリシー
ALTER TABLE vendor_inspections ENABLE ROW LEVEL SECURITY;

-- 読み取り: すべてのユーザー
CREATE POLICY "vendor_inspections_select" ON vendor_inspections
  FOR SELECT USING (true);

-- 挿入/更新/削除: 管理者のみ
CREATE POLICY "vendor_inspections_insert" ON vendor_inspections
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM signage_profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "vendor_inspections_update" ON vendor_inspections
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM signage_profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "vendor_inspections_delete" ON vendor_inspections
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM signage_profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ========================================
-- 初期データ投入: すべてのベンダー×すべての点検種別
-- ========================================

CREATE OR REPLACE FUNCTION initialize_vendor_inspections()
RETURNS void AS $$
BEGIN
  INSERT INTO vendor_inspections (vendor_id, inspection_id, status)
  SELECT v.id, i.id, 'active'
  FROM signage_master_vendors v
  CROSS JOIN signage_master_inspection_types i
  ON CONFLICT (vendor_id, inspection_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- 実行コマンド:
-- SELECT initialize_vendor_inspections();
