-- 2026-09-13 修正依頼0913 検証指摘の対応: 他アプリと共用している Auth ユーザーの判定
-- 本番 baran(pdouwmjyswswfmzpfjzf) へ適用済み。Edge Function signage-admin-users の set_password が使う
--
-- auth.users は noj / mansion / biz と共用のため、signage の管理者が他アプリでも使われているアカウントの
-- パスワードを変えると、他アプリ（管理者権限を含む）へのログインも奪えてしまう。
-- auth.users を外部キーで参照する signage 以外のアプリ表に行があれば「共用」とみなす（新しいアプリの表も自動で対象になる）

CREATE OR REPLACE FUNCTION signage.is_shared_auth_user(target uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  ref record;
  found boolean;
BEGIN
  FOR ref IN
    SELECT c.conrelid::regclass AS tbl, a.attname AS col
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.contype = 'f'
      AND c.confrelid = 'auth.users'::regclass
      AND c.connamespace::regnamespace::text NOT IN ('auth', 'storage', 'signage', 'realtime', 'supabase_functions', 'extensions', 'vault', 'graphql', 'pgsodium')
  LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s WHERE %I = $1)', ref.tbl, ref.col) INTO found USING target;
    IF found THEN
      RETURN true;
    END IF;
  END LOOP;
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION signage.is_shared_auth_user(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION signage.is_shared_auth_user(uuid) TO service_role;
