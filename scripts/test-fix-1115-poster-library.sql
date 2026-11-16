-- fix-1115-poster-library.sql の確かめ（ローカル DB 用。最後に ROLLBACK するので何も残らない）
-- 流し方: psql <ローカル DB> -X -v ON_ERROR_STOP=1 -f scripts/test-fix-1115-poster-library.sql
--   どれか1つでも期待と違えば例外で止まる。全部通れば最後に「OK」の NOTICE が出る。
-- 前提: fix-1115-poster-library.sql を流してあること。ローカルの検証用アカウント（admin a..01・user@ a..02・
--   mgmt@ a..06〔管理会社 c..09〕・mgmt-b@ a..07〔管理会社 c..10〕）と、申請 a2000000-…-000000000001（pending）・
--   a2000000-…-000000000003（ready）があること。ライブラリの行と申請の貼紙はここで入れて、最後に戻す。
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

CREATE FUNCTION pg_temp.expect_error(p_label text, p_sql text, p_like text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%' || p_like || '%' THEN
      RAISE NOTICE 'ok (止まった) %: %', p_label, SQLERRM;
      RETURN;
    END IF;
    RAISE EXCEPTION 'NG (別の理由で止まった) %: %', p_label, SQLERRM;
  END;
  RAISE EXCEPTION 'NG (通ってしまった) %', p_label;
END $$;

CREATE FUNCTION pg_temp.check(p_label text, p_ok boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'NG %', p_label;
  END IF;
  RAISE NOTICE 'ok %', p_label;
END $$;

GRANT EXECUTE ON FUNCTION pg_temp.expect_error(text, text, text), pg_temp.check(text, boolean) TO authenticated, anon;

-- ライブラリの行（JWT の無い経路で入れる＝guard_poster_library_columns は URL を確かめない）
INSERT INTO signage.signage_poster_library (id, display_name, category, image_url, storage_path, management_company_id) VALUES
  ('d0000000-0000-4000-8000-000000000001', '全社共通', 'その他',
   'http://127.0.0.1:55321/storage/v1/object/public/poster-images/library/common/t1115-common.png', 'library/common/t1115-common.png', NULL),
  ('d0000000-0000-4000-8000-000000000002', 'A社・未使用', 'その他',
   'http://127.0.0.1:55321/storage/v1/object/public/poster-images/library/c0000000-0000-4000-8000-000000000009/t1115-a.png',
   'library/c0000000-0000-4000-8000-000000000009/t1115-a.png', 'c0000000-0000-4000-8000-000000000009'),
  ('d0000000-0000-4000-8000-000000000003', 'A社・1枚目で使用中', 'その他',
   'http://127.0.0.1:55321/storage/v1/object/public/poster-images/library/c0000000-0000-4000-8000-000000000009/t1115-b.png',
   'library/c0000000-0000-4000-8000-000000000009/t1115-b.png', 'c0000000-0000-4000-8000-000000000009'),
  ('d0000000-0000-4000-8000-000000000004', 'A社・追加で使用中', 'その他',
   'http://127.0.0.1:55321/storage/v1/object/public/poster-images/library/c0000000-0000-4000-8000-000000000009/t1115-c.png',
   'library/c0000000-0000-4000-8000-000000000009/t1115-c.png', 'c0000000-0000-4000-8000-000000000009'),
  ('d0000000-0000-4000-8000-000000000005', 'B社・未使用', 'その他',
   'http://127.0.0.1:55321/storage/v1/object/public/poster-images/library/c0000000-0000-4000-8000-000000000010/t1115-d.png',
   'library/c0000000-0000-4000-8000-000000000010/t1115-d.png', 'c0000000-0000-4000-8000-000000000010');

-- 申請で使う（1枚目は ? 付きの URL でも使用中と見る。追加は library_id で見る＝URL は別にしておく）
UPDATE signage.signage_entries
   SET poster_image = 'http://127.0.0.1:55321/storage/v1/object/public/poster-images/library/c0000000-0000-4000-8000-000000000009/t1115-b.png?v=1'
 WHERE id = 'a2000000-0000-4000-8000-000000000001';
UPDATE signage.signage_entries
   SET extra_posters = jsonb_build_array(jsonb_build_object(
         'image_url', 'http://127.0.0.1:55321/storage/v1/object/public/poster-images/library/c0000000-0000-4000-8000-000000000009/old-name.png',
         'source', 'library', 'library_id', 'd0000000-0000-4000-8000-000000000004'))
 WHERE id = 'a2000000-0000-4000-8000-000000000003';

-- ============================================================
-- 1. 管理会社: 他社の行・全社共通・見つからない行は消せない。使用中は消せない。自社の未使用は消せて storage_path が返る
-- ============================================================
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000007');  -- mgmt-b（c..10）
SELECT pg_temp.expect_error('他社（A社）の行を管理会社 B が消す',
  $q$SELECT signage.delete_poster_library_item('d0000000-0000-4000-8000-000000000002')$q$, '削除できません');
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000006');  -- mgmt（c..09）
SELECT pg_temp.expect_error('全社共通を管理会社が消す',
  $q$SELECT signage.delete_poster_library_item('d0000000-0000-4000-8000-000000000001')$q$, '削除できません');
SELECT pg_temp.expect_error('他社（B社）の行を管理会社 A が消す',
  $q$SELECT signage.delete_poster_library_item('d0000000-0000-4000-8000-000000000005')$q$, '削除できません');
SELECT pg_temp.expect_error('見つからない行',
  $q$SELECT signage.delete_poster_library_item('d0000000-0000-4000-8000-0000000000ff')$q$, '削除できません');
SELECT pg_temp.expect_error('1枚目で使用中',
  $q$SELECT signage.delete_poster_library_item('d0000000-0000-4000-8000-000000000003')$q$, '申請で使われているため削除できません。無効にしてください');
SELECT pg_temp.expect_error('追加の貼紙で使用中（library_id）',
  $q$SELECT signage.delete_poster_library_item('d0000000-0000-4000-8000-000000000004')$q$, '申請で使われているため削除できません');
SELECT pg_temp.check('自社の未使用を消すと storage_path が返る',
  signage.delete_poster_library_item('d0000000-0000-4000-8000-000000000002')
    = 'library/c0000000-0000-4000-8000-000000000009/t1115-a.png');
SELECT pg_temp.as_owner();
SELECT pg_temp.check('自社の未使用の行が消えた',
  NOT EXISTS (SELECT 1 FROM signage.signage_poster_library WHERE id = 'd0000000-0000-4000-8000-000000000002'));
SELECT pg_temp.check('使用中・他社・全社共通の行は残っている',
  (SELECT count(*) FROM signage.signage_poster_library WHERE id IN ('d0000000-0000-4000-8000-000000000001',
     'd0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000005')) = 4);

-- ============================================================
-- 2. 保守会社（一般）・無効の管理会社は消せない
-- ============================================================
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000002');  -- user@
SELECT pg_temp.expect_error('保守会社が消す',
  $q$SELECT signage.delete_poster_library_item('d0000000-0000-4000-8000-000000000005')$q$, '削除できません');
SELECT pg_temp.as_owner();
UPDATE signage.signage_profiles SET status = 'inactive' WHERE id = 'a0000000-0000-4000-8000-000000000007';
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000007');
SELECT pg_temp.expect_error('無効の管理会社が自社分を消す',
  $q$SELECT signage.delete_poster_library_item('d0000000-0000-4000-8000-000000000005')$q$, '削除できません');
SELECT pg_temp.as_owner();
UPDATE signage.signage_profiles SET status = 'active' WHERE id = 'a0000000-0000-4000-8000-000000000007';

-- ============================================================
-- 3. 管理者: 全社共通・他社分も消せる。使用中は管理者でも消せない
-- ============================================================
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000001');
SELECT pg_temp.expect_error('管理者でも使用中は消せない',
  $q$SELECT signage.delete_poster_library_item('d0000000-0000-4000-8000-000000000003')$q$, '申請で使われているため');
SELECT pg_temp.check('管理者が全社共通を消せる',
  signage.delete_poster_library_item('d0000000-0000-4000-8000-000000000001') = 'library/common/t1115-common.png');
SELECT pg_temp.check('管理者が管理会社の分を消せる',
  signage.delete_poster_library_item('d0000000-0000-4000-8000-000000000005')
    = 'library/c0000000-0000-4000-8000-000000000010/t1115-d.png');
SELECT pg_temp.as_owner();

-- ============================================================
-- 4. 実行権: anon と PUBLIC には無く、authenticated にはある。表への DELETE は今までどおり無い
-- ============================================================
DO $$
BEGIN
  IF has_function_privilege('anon', 'signage.delete_poster_library_item(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon が実行できてしまう';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
              WHERE p.oid = 'signage.delete_poster_library_item(uuid)'::regprocedure AND a.grantee = 0) THEN
    RAISE EXCEPTION 'PUBLIC に実行権が残っている';
  END IF;
  IF NOT has_function_privilege('authenticated', 'signage.delete_poster_library_item(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated が実行できない';
  END IF;
  IF has_table_privilege('authenticated', 'signage.signage_poster_library', 'DELETE') THEN
    RAISE EXCEPTION 'authenticated に表の DELETE が付いている';
  END IF;

  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    PERFORM signage.delete_poster_library_item('d0000000-0000-4000-8000-000000000004');
    RAISE EXCEPTION 'anon で呼べてしまった';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'denied ok: anon (%)', SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  RAISE NOTICE 'OK（fix-1115-poster-library の確かめが全部通った）';
END $$;

ROLLBACK;
