-- ========================================
-- Fix RLS Policy for User Profile Updates
-- ========================================
-- 問題: 管理者がvendor_idを更新できない
-- 原因: UPDATEポリシーがvendor_idを含まない

-- 既存のポリシーを削除
DROP POLICY IF EXISTS "Users can update own profile" ON signage_profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON signage_profiles;

-- 新しいポリシー: ユーザーは自分のプロファイルを更新可能
CREATE POLICY "Users can update own profile"
  ON signage_profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 新しいポリシー: 管理者はすべてのプロファイルを更新可能
CREATE POLICY "Admins can update all profiles"
  ON signage_profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM signage_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM signage_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 確認
SELECT * FROM pg_policies WHERE tablename = 'signage_profiles' AND cmd = 'UPDATE';
