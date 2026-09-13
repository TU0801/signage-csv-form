-- 2026-09-13 修正依頼0913 検証指摘の対応: RLS を「有効な signage メンバー／有効な管理者」で判定する
-- 本番 baran(pdouwmjyswswfmzpfjzf) へ適用済み。Management API では BEGIN/COMMIT を付けず1文ずつ流すこと
--
-- 背景:
--  - 無効化（signage_profiles.status='inactive'）が画面側でしか効かず、RLS は role='admin' / auth.uid() しか見ていなかった
--  - auth.users は noj/mansion/biz と共用で公開サインアップも有効なため、signage にプロファイルの無いユーザーでも
--    全プロファイル・監査ログを読め、エントリを登録できた
--  - storage の poster-image ポリシーに bucket_id 条件が無く、ログイン済みなら全バケットを読み書きできた

-- ========== 判定関数 ==========
CREATE OR REPLACE FUNCTION signage.is_active_member()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = signage, pg_temp
AS $$ SELECT EXISTS (SELECT 1 FROM signage.signage_profiles WHERE id = auth.uid() AND status = 'active') $$;

CREATE OR REPLACE FUNCTION signage.is_active_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = signage, pg_temp
AS $$ SELECT EXISTS (SELECT 1 FROM signage.signage_profiles WHERE id = auth.uid() AND status = 'active' AND role = 'admin') $$;

CREATE OR REPLACE FUNCTION signage.current_vendor_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = signage, pg_temp
AS $$ SELECT vendor_id FROM signage.signage_profiles WHERE id = auth.uid() AND status = 'active' $$;

-- 公開サインアップ経由（options.data に company_name）のプロファイルは無効状態で作る（有効化は管理者が行う）
CREATE OR REPLACE FUNCTION signage.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'signage'
AS $$
BEGIN
  -- signage経由のsignUp（options.dataにcompany_name）に限定して発火。noj/mansion等のユーザー作成では何もしない
  IF NEW.raw_user_meta_data ? 'company_name' THEN
    INSERT INTO signage.signage_profiles (id, email, role, status)
    VALUES (NEW.id, NEW.email, 'user', 'inactive')
    ON CONFLICT (id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- ========== 管理者判定のポリシー（USING / WITH CHECK を関数に置き換え） ==========
ALTER POLICY admin_manage_ad_slots ON signage.signage_ad_slots USING (signage.is_active_admin()) WITH CHECK (signage.is_active_admin());
ALTER POLICY "Admins can manage building_equipment" ON signage.signage_building_equipment USING (signage.is_active_admin());
ALTER POLICY "Admins can manage categories" ON signage.signage_master_categories USING (signage.is_active_admin());
ALTER POLICY "Admins can manage inspection_types" ON signage.signage_master_inspection_types USING (signage.is_active_admin());
ALTER POLICY "Admins can manage properties" ON signage.signage_master_properties USING (signage.is_active_admin());
ALTER POLICY "Admins can manage settings" ON signage.signage_master_settings USING (signage.is_active_admin());
ALTER POLICY "Admins can manage template_images" ON signage.signage_master_template_images USING (signage.is_active_admin());
ALTER POLICY "Admins can manage vendors" ON signage.signage_master_vendors USING (signage.is_active_admin());
ALTER POLICY signage_vendor_inspections_delete ON signage.signage_vendor_inspections USING (signage.is_active_admin());
ALTER POLICY signage_vendor_inspections_insert ON signage.signage_vendor_inspections WITH CHECK (signage.is_active_admin());
ALTER POLICY signage_vendor_inspections_update ON signage.signage_vendor_inspections USING (signage.is_active_admin());
ALTER POLICY admin_select ON signage.signage_error_logs USING (signage.is_active_admin());

-- ========== 物件×保守会社 ==========
ALTER POLICY building_vendors_delete ON signage.signage_building_vendors USING (signage.is_active_admin());
ALTER POLICY building_vendors_insert ON signage.signage_building_vendors WITH CHECK (
  signage.is_active_admin()
  OR (vendor_id = signage.current_vendor_id() AND status = 'pending' AND requested_by = auth.uid()));
ALTER POLICY building_vendors_select ON signage.signage_building_vendors USING (
  signage.is_active_admin()
  OR (vendor_id = signage.current_vendor_id() AND status = 'active'));
ALTER POLICY building_vendors_update ON signage.signage_building_vendors USING (
  signage.is_active_admin()
  OR (vendor_id = signage.current_vendor_id() AND status = 'deleted'));

-- ========== エントリ ==========
ALTER POLICY "Admins can delete all entries" ON signage.signage_entries USING (signage.is_active_admin());
ALTER POLICY "Admins can view all entries" ON signage.signage_entries USING (signage.is_active_admin());
ALTER POLICY "Admins can update all entries" ON signage.signage_entries USING (signage.is_active_admin());
ALTER POLICY "管理者は全てのエントリを閲覧可能" ON signage.signage_entries USING (signage.is_active_admin() OR (user_id = auth.uid() AND signage.is_active_member()));
ALTER POLICY "Users can delete own entries" ON signage.signage_entries USING (auth.uid() = user_id AND signage.is_active_member());
ALTER POLICY "Users can insert own entries" ON signage.signage_entries WITH CHECK (auth.uid() = user_id AND signage.is_active_member());
ALTER POLICY "Users can view own entries" ON signage.signage_entries USING (auth.uid() = user_id AND signage.is_active_member());
ALTER POLICY "Users can update own entries" ON signage.signage_entries USING (auth.uid() = user_id AND signage.is_active_member());

-- ========== エラーログ・監査ログ ==========
ALTER POLICY authenticated_insert ON signage.signage_error_logs WITH CHECK (signage.is_active_member());
DROP POLICY IF EXISTS "Authenticated users can view audit_logs" ON signage.signage_audit_logs;
DROP POLICY IF EXISTS admin_select_audit_logs ON signage.signage_audit_logs;
CREATE POLICY admin_select_audit_logs ON signage.signage_audit_logs FOR SELECT TO authenticated USING (signage.is_active_admin());

-- ========== プロファイル ==========
-- 全員が全プロファイルを読めるポリシーを廃止（本人分は read_own_profile、管理者は下のポリシー）
DROP POLICY IF EXISTS "Allow authenticated select" ON signage.signage_profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON signage.signage_profiles;
CREATE POLICY "Admins can view all profiles" ON signage.signage_profiles FOR SELECT TO authenticated USING (signage.is_active_admin());
-- 自分のプロファイル作成は Edge Function（service_role）に一本化したため不要
DROP POLICY IF EXISTS "Allow authenticated insert" ON signage.signage_profiles;
ALTER POLICY "Admins can insert profiles" ON signage.signage_profiles WITH CHECK (signage.is_active_admin());
ALTER POLICY "Admins can update all profiles" ON signage.signage_profiles USING (signage.is_active_admin()) WITH CHECK (signage.is_active_admin());

-- ========== ストレージ（貼紙画像） ==========
ALTER POLICY "poster-image 2whf5k_0" ON storage.objects USING (bucket_id = 'poster-images' AND signage.is_active_member());
ALTER POLICY "poster-image 2whf5k_1" ON storage.objects WITH CHECK (bucket_id = 'poster-images' AND signage.is_active_member());
