-- 2026-09-13 残課題対応: マスタの閲覧を有効な signage メンバーに限定し、貼紙画像バケットに形式・サイズ・置き場所の制限を掛ける
-- 本番 baran(pdouwmjyswswfmzpfjzf) へ適用済み。Management API では BEGIN/COMMIT を付けず1文ずつ流すこと
--
-- 背景:
--  - 物件（端末ID）・保守会社（緊急連絡先）・設定などが "Anyone can read"（anon 含む）/ "Allow authenticated to read"
--    （他アプリのユーザー含む）で誰でも読めた。公開の anon key は config.js にある
--  - 未ログインで読む正規の利用は login.html の広告枠（signage_ad_slots）だけ（コードと edge_logs で確認）。
--    biz の初期データ投入は service_role なので影響しない
--  - poster-images は形式・サイズ無制限で、一般ユーザーも ads/ や templates/ 配下に置けた

-- ========== マスタ: 有効な signage メンバーのみ閲覧 ==========
DROP POLICY IF EXISTS "Anyone can read properties" ON signage.signage_master_properties;
DROP POLICY IF EXISTS "Allow authenticated to read properties" ON signage.signage_master_properties;
DROP POLICY IF EXISTS "Members can read properties" ON signage.signage_master_properties;
CREATE POLICY "Members can read properties" ON signage.signage_master_properties FOR SELECT TO authenticated USING (signage.is_active_member());

DROP POLICY IF EXISTS "Anyone can read vendors" ON signage.signage_master_vendors;
DROP POLICY IF EXISTS "Allow authenticated to read vendors" ON signage.signage_master_vendors;
DROP POLICY IF EXISTS "Members can read vendors" ON signage.signage_master_vendors;
CREATE POLICY "Members can read vendors" ON signage.signage_master_vendors FOR SELECT TO authenticated USING (signage.is_active_member());

DROP POLICY IF EXISTS "Anyone can read inspection_types" ON signage.signage_master_inspection_types;
DROP POLICY IF EXISTS "Allow authenticated to read inspection_types" ON signage.signage_master_inspection_types;
DROP POLICY IF EXISTS "Members can read inspection_types" ON signage.signage_master_inspection_types;
CREATE POLICY "Members can read inspection_types" ON signage.signage_master_inspection_types FOR SELECT TO authenticated USING (signage.is_active_member());

DROP POLICY IF EXISTS "Anyone can read categories" ON signage.signage_master_categories;
DROP POLICY IF EXISTS "Members can read categories" ON signage.signage_master_categories;
CREATE POLICY "Members can read categories" ON signage.signage_master_categories FOR SELECT TO authenticated USING (signage.is_active_member());

DROP POLICY IF EXISTS "Anyone can read settings" ON signage.signage_master_settings;
DROP POLICY IF EXISTS "Members can read settings" ON signage.signage_master_settings;
CREATE POLICY "Members can read settings" ON signage.signage_master_settings FOR SELECT TO authenticated USING (signage.is_active_member());

DROP POLICY IF EXISTS "Anyone can read template_images" ON signage.signage_master_template_images;
DROP POLICY IF EXISTS "Members can read template_images" ON signage.signage_master_template_images;
CREATE POLICY "Members can read template_images" ON signage.signage_master_template_images FOR SELECT TO authenticated USING (signage.is_active_member());

DROP POLICY IF EXISTS "Anyone can read building_equipment" ON signage.signage_building_equipment;
DROP POLICY IF EXISTS "Members can read building_equipment" ON signage.signage_building_equipment;
CREATE POLICY "Members can read building_equipment" ON signage.signage_building_equipment FOR SELECT TO authenticated USING (signage.is_active_member());

ALTER POLICY signage_vendor_inspections_select ON signage.signage_vendor_inspections TO authenticated USING (signage.is_active_member());

-- ========== 貼紙画像バケット ==========
-- 画面の上限（5MB・PNG/JPEG）とそろえる。既存オブジェクトは最大約0.9MB・PNG/JPEGのみ（2026-09-13 実測）
UPDATE storage.buckets SET file_size_limit = 5242880, allowed_mime_types = ARRAY['image/png', 'image/jpeg'] WHERE id = 'poster-images';

-- 置き場所: 利用者の貼紙は自分のユーザーIDフォルダ、広告枠(ads/)とテンプレート画像(templates/)は管理者のみ。
-- 判定は先頭フォルダ名で行うため、`uid/../templates/x.png` のような相対パスを含む名前は拒否する
ALTER POLICY "poster-image 2whf5k_1" ON storage.objects WITH CHECK (
  bucket_id = 'poster-images'
  AND position('..' in name) = 0
  AND (
    ((storage.foldername(name))[1] = auth.uid()::text AND signage.is_active_member())
    OR ((storage.foldername(name))[1] IN ('ads', 'templates') AND signage.is_active_admin())
  ));
