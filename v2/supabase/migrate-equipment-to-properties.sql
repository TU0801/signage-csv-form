-- 設備情報を signage_building_equipment から signage_master_properties.equipment(JSONB) へ統合する移行
-- Supabase ダッシュボードの SQL Editor で実行する（anon key では DDL 不可のため）。
-- 旧テーブル signage_building_equipment は削除しない（安全策）。

-- 1) equipment カラムを追加（既にあれば何もしない）
ALTER TABLE signage_master_properties
  ADD COLUMN IF NOT EXISTS equipment JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 2) 既存の設備データを property_code 単位で配列化して移行
--    要素キーは snake_case（フロント・旧カラム名と一致）
UPDATE signage_master_properties p
SET equipment = sub.eq
FROM (
  SELECT property_code,
         jsonb_agg(
           jsonb_build_object(
             'inspection_type_id', inspection_type_id,
             'vendor_id', vendor_id,
             'inspection_months', inspection_months,
             'remarks', remarks,
             'remarks2', remarks2
           )
           ORDER BY created_at
         ) AS eq
  FROM signage_building_equipment
  GROUP BY property_code
) sub
WHERE p.property_code = sub.property_code;

-- 3) 移行結果の確認（任意）
-- SELECT property_code, property_name, jsonb_array_length(equipment) AS equip_count
-- FROM signage_master_properties
-- WHERE jsonb_array_length(equipment) > 0
-- ORDER BY property_code;
