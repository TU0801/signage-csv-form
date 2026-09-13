-- 2026-09-13 修正依頼0913 再検証の指摘対応（rls-active-member.sql の続き）
-- 本番 baran(pdouwmjyswswfmzpfjzf) へ適用済み。Management API では BEGIN/COMMIT を付けず1文ずつ流すこと

-- エラーログは本人の user_id（または未設定）でのみ登録できる（他人のエラーに見せかけられないように）
ALTER POLICY authenticated_insert ON signage.signage_error_logs
  WITH CHECK (signage.is_active_member() AND (user_id IS NULL OR user_id = auth.uid()));

-- プロファイル作成は Edge Function（service_role）に限る。管理者が任意の auth.users の UUID でプロファイルを作ると
-- set_password の対象を他アプリ専用ユーザーへ広げられるため、画面で使っていない直接 INSERT のポリシーを削除する
DROP POLICY IF EXISTS "Admins can insert profiles" ON signage.signage_profiles;

-- 本人によるプロファイル更新は有効なメンバーに限る（role/vendor_id/status/email はトリガーで別途保護）
ALTER POLICY "Users can update own profile" ON signage.signage_profiles
  USING (auth.uid() = id AND signage.is_active_member()) WITH CHECK (auth.uid() = id AND signage.is_active_member());
ALTER POLICY update_own_profile ON signage.signage_profiles
  USING (id = auth.uid() AND signage.is_active_member());

-- 貼紙画像バケット: 広告枠・テンプレート画像の差し替え（upsert）と削除に必要な UPDATE / DELETE を管理者に許可する
DROP POLICY IF EXISTS "poster-images admin update" ON storage.objects;
CREATE POLICY "poster-images admin update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'poster-images' AND signage.is_active_admin())
  WITH CHECK (bucket_id = 'poster-images' AND signage.is_active_admin());
DROP POLICY IF EXISTS "poster-images admin delete" ON storage.objects;
CREATE POLICY "poster-images admin delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'poster-images' AND signage.is_active_admin());
