-- ========================================
-- Vendor Multi-tenancy Migration
-- ========================================
-- 目的: メンテナンス会社ごとに担当ビルを制限する機能を追加
-- 戦略: 既存テーブル名を維持し、最小限の変更で実装

-- ========================================
-- Step 1: building_vendors 紐付けテーブル作成
-- ========================================
CREATE TABLE IF NOT EXISTS building_vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 物件コードで紐付け（property_codeはsignage_master_propertiesのUNIQUE制約付きカラム）
  property_code TEXT NOT NULL,

  -- ベンダーID（signage_master_vendorsのid）
  vendor_id UUID NOT NULL REFERENCES signage_master_vendors(id) ON DELETE CASCADE,

  -- ステータス: active, pending, deleted
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'deleted')),

  -- 追加リクエスト者（一般ユーザーがpendingで追加する場合）
  requested_by UUID REFERENCES auth.users(id),

  -- 承認者（管理者が承認した場合）
  approved_by UUID REFERENCES auth.users(id),

  -- タイムスタンプ
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- 同じビルに同じベンダーは1回のみ
  UNIQUE(property_code, vendor_id)
);

-- インデックス（検索高速化）
CREATE INDEX IF NOT EXISTS idx_building_vendors_property ON building_vendors(property_code);
CREATE INDEX IF NOT EXISTS idx_building_vendors_vendor ON building_vendors(vendor_id);
CREATE INDEX IF NOT EXISTS idx_building_vendors_status ON building_vendors(status);

-- updated_at自動更新トリガー
CREATE TRIGGER update_building_vendors_updated_at
  BEFORE UPDATE ON building_vendors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- Step 2: signage_profiles にvendor_id追加
-- ========================================
ALTER TABLE signage_profiles
  ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES signage_master_vendors(id);

-- ========================================
-- Step 3: signage_master_vendors にinspection_type追加
-- ========================================
ALTER TABLE signage_master_vendors
  ADD COLUMN IF NOT EXISTS inspection_type TEXT;

-- ========================================
-- Step 4: RLS（Row Level Security）ポリシー
-- ========================================

-- building_vendors: 権限に応じたアクセス制御
ALTER TABLE building_vendors ENABLE ROW LEVEL SECURITY;

-- 読み取り: 管理者は全件、一般ユーザーは自分のvendor_idかつactiveのみ
CREATE POLICY "building_vendors_select" ON building_vendors
  FOR SELECT USING (
    -- 管理者: 全件閲覧可能
    EXISTS (SELECT 1 FROM signage_profiles WHERE id = auth.uid() AND role = 'admin')
    OR
    -- 一般ユーザー: 自分のvendor_idかつactiveのみ
    (
      vendor_id = (SELECT vendor_id FROM signage_profiles WHERE id = auth.uid())
      AND status = 'active'
    )
  );

-- 挿入: 管理者はactiveで追加、一般ユーザーはpendingで追加
CREATE POLICY "building_vendors_insert" ON building_vendors
  FOR INSERT WITH CHECK (
    -- 管理者: 即座にactiveで追加可能
    EXISTS (SELECT 1 FROM signage_profiles WHERE id = auth.uid() AND role = 'admin')
    OR
    -- 一般ユーザー: pendingで追加可能（自分のvendor_idのみ）
    (
      vendor_id = (SELECT vendor_id FROM signage_profiles WHERE id = auth.uid())
      AND status = 'pending'
      AND requested_by = auth.uid()
    )
  );

-- 更新: 管理者は全件更新可、一般ユーザーは自分の紐付けをdeletedに変更可
CREATE POLICY "building_vendors_update" ON building_vendors
  FOR UPDATE USING (
    -- 管理者: 全件更新可能（承認処理用）
    EXISTS (SELECT 1 FROM signage_profiles WHERE id = auth.uid() AND role = 'admin')
    OR
    -- 一般ユーザー: 自分の紐付けをdeletedに変更可能（削除機能）
    (
      vendor_id = (SELECT vendor_id FROM signage_profiles WHERE id = auth.uid())
      AND status = 'deleted' -- deletedへの変更のみ許可
    )
  );

-- 削除: 管理者のみ
CREATE POLICY "building_vendors_delete" ON building_vendors
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM signage_profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ========================================
-- Step 5: 初期データ投入ヘルパー関数
-- ========================================

-- 既存のvendorに仮のinspection_typeを設定する関数
CREATE OR REPLACE FUNCTION assign_default_inspection_types()
RETURNS void AS $$
BEGIN
  -- エレベーター会社はEV点検
  UPDATE signage_master_vendors
  SET inspection_type = 'エレベーター点検'
  WHERE vendor_name LIKE '%エレベーター%' OR vendor_name LIKE '%EV%';

  -- 消防設備会社は消防点検
  UPDATE signage_master_vendors
  SET inspection_type = '消防設備点検'
  WHERE vendor_name LIKE '%消防%' OR vendor_name LIKE '%防災%';

  -- その他は「その他点検」
  UPDATE signage_master_vendors
  SET inspection_type = 'その他点検'
  WHERE inspection_type IS NULL;
END;
$$ LANGUAGE plpgsql;

-- 全物件を全ベンダーに紐付ける関数（初期セットアップ用）
CREATE OR REPLACE FUNCTION initialize_building_vendors()
RETURNS void AS $$
BEGIN
  INSERT INTO building_vendors (property_code, vendor_id, status)
  SELECT DISTINCT p.property_code, v.id, 'active'
  FROM signage_master_properties p
  CROSS JOIN signage_master_vendors v
  ON CONFLICT (property_code, vendor_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- Step 6: 実行手順コメント
-- ========================================

-- 以下のコマンドを管理者が実行:
-- 1. SELECT assign_default_inspection_types();  # inspection_typeを自動設定
-- 2. SELECT initialize_building_vendors();      # 全物件×全ベンダーで初期化（任意）
-- 3. 手動でsignage_profilesのvendor_idを設定
