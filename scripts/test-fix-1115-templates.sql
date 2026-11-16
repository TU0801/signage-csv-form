-- fix-1115-templates.sql の確かめ（ローカル DB 用。最後に ROLLBACK するので何も残らない）
-- 流し方: psql <ローカル DB> -X -v ON_ERROR_STOP=1 -f scripts/test-fix-1115-templates.sql
--   どれか1つでも期待と違えば例外で止まる。全部通れば最後に「OK」の NOTICE が出る。
-- 前提: fix-1115-templates.sql を流してあること。ローカルの検証用アカウント（admin a..01・user@ a..02〔c..01〕・inactive a..03・
--   noprofile a..04・mgmt@ a..06〔管理会社 c..09〕・mgmt-b@ a..07〔管理会社 c..10〕）と、biz.template_images に1行以上。
--   管理会社の無効化はこの中で変えて戻す（管理会社ロールで管理会社が未設定の行は CHECK signage_profiles_management_company_check で作れない）。
BEGIN;

CREATE FUNCTION pg_temp.act_as(p_uid text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated', 'iss', 'http://127.0.0.1:55321/auth/v1')::text, true);
  PERFORM set_config('request.jwt.claim.sub', p_uid, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END $$;

CREATE FUNCTION pg_temp.as_owner() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
END $$;

-- そのアカウントで template_images_master() が返す行数
CREATE FUNCTION pg_temp.rows_as(p_uid text) RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  n int;
BEGIN
  PERFORM pg_temp.act_as(p_uid);
  SELECT count(*) INTO n FROM signage.template_images_master();
  PERFORM pg_temp.as_owner();
  RETURN n;
END $$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated, anon;

DO $$
DECLARE
  v_all int;
  n int;
BEGIN
  SELECT count(*) INTO v_all FROM biz.template_images;
  IF v_all = 0 THEN
    RAISE EXCEPTION '前提: biz.template_images が空';
  END IF;

  -- 有効な管理会社は全行を受け取る（今回広げたところ。2社とも）
  n := pg_temp.rows_as('a0000000-0000-4000-8000-000000000006');
  IF n <> v_all THEN RAISE EXCEPTION '管理会社 mgmt@: % 行のはずが % 行', v_all, n; END IF;
  n := pg_temp.rows_as('a0000000-0000-4000-8000-000000000007');
  IF n <> v_all THEN RAISE EXCEPTION '管理会社 mgmt-b@: % 行のはずが % 行', v_all, n; END IF;

  -- 管理者・一般（保守会社）は今までどおり全行
  n := pg_temp.rows_as('a0000000-0000-4000-8000-000000000001');
  IF n <> v_all THEN RAISE EXCEPTION '管理者: % 行のはずが % 行', v_all, n; END IF;
  n := pg_temp.rows_as('a0000000-0000-4000-8000-000000000002');
  IF n <> v_all THEN RAISE EXCEPTION '一般 user@: % 行のはずが % 行', v_all, n; END IF;

  -- 無効の一般・プロファイルの無いアカウントは今までどおり0行
  n := pg_temp.rows_as('a0000000-0000-4000-8000-000000000003');
  IF n <> 0 THEN RAISE EXCEPTION '無効の一般: 0 行のはずが % 行', n; END IF;
  n := pg_temp.rows_as('a0000000-0000-4000-8000-000000000004');
  IF n <> 0 THEN RAISE EXCEPTION 'プロファイル無し: 0 行のはずが % 行', n; END IF;

  -- 無効にした管理会社は0行
  UPDATE signage.signage_profiles SET status = 'inactive' WHERE id = 'a0000000-0000-4000-8000-000000000007';
  n := pg_temp.rows_as('a0000000-0000-4000-8000-000000000007');
  IF n <> 0 THEN RAISE EXCEPTION '無効の管理会社: 0 行のはずが % 行', n; END IF;

  -- 実行権: anon と PUBLIC には無く、authenticated にはある
  IF has_function_privilege('anon', 'signage.template_images_master()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon が実行できてしまう';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
              WHERE p.oid = 'signage.template_images_master()'::regprocedure AND a.grantee = 0) THEN
    RAISE EXCEPTION 'PUBLIC に実行権が残っている';
  END IF;
  IF NOT has_function_privilege('authenticated', 'signage.template_images_master()', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated が実行できない';
  END IF;

  -- anon で呼ぶと 42501 で断られる
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    PERFORM count(*) FROM signage.template_images_master();
    RAISE EXCEPTION 'anon で呼べてしまった';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'denied ok: anon (%)', SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  RAISE NOTICE 'OK（fix-1115-templates の確かめが全部通った）';
END $$;

ROLLBACK;
