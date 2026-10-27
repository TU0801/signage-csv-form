-- fix-1027-reports.sql の確かめ（ローカル DB 用。最後に ROLLBACK するので何も残らない）
-- 流し方: psql <ローカル DB> -X -v ON_ERROR_STOP=1 -f scripts/test-fix-1027-reports.sql
--   どれか1つでも期待と違えば例外で止まる。全部通れば最後に「OK」の NOTICE が出る。
-- 前提: fix-1027-reports.sql を流してあること。ローカルの検証用アカウント（admin a..01・user@ a..02〔保守会社 c..01〕）と、
--   点検行 2b84a9bd（120409-00。保守 c..01）があること。Storage の行（inspection-reports）はこの中で足して戻す。
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

-- p_sql が例外で止まり、文言に p_like を含むこと（止まらなければ・別の理由で止まれば失敗）
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

CREATE TEMP TABLE t_ids (k text PRIMARY KEY, id uuid);
GRANT ALL ON t_ids TO authenticated;

-- アップロード済みの Storage の行（owner は user@）を2つ置く
INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES
  ('inspection-reports', '2b84a9bd-b98e-4332-bd19-2973387bc13c/t1027-a.pdf', 'a0000000-0000-4000-8000-000000000002'),
  ('inspection-reports', '2b84a9bd-b98e-4332-bd19-2973387bc13c/t1027-b.pdf', 'a0000000-0000-4000-8000-000000000002');

-- ============================================================
-- 1. 同じ点検 × 対象月に2件登録しても、前の版は置き換わらない（どちらも提出のまま）
-- ============================================================
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
INSERT INTO t_ids SELECT 'a', (signage.portal_register_report('2b84a9bd-b98e-4332-bd19-2973387bc13c', '2031-02-01', '2031-02-10',
  '20310210_試験_1027.pdf', '2b84a9bd-b98e-4332-bd19-2973387bc13c/t1027-a.pdf', 'a.pdf', 10, 'hash-a')).id;
INSERT INTO t_ids SELECT 'b', (signage.portal_register_report('2b84a9bd-b98e-4332-bd19-2973387bc13c', '2031-02-01', '2031-02-11',
  '20310211_試験_1027.pdf', '2b84a9bd-b98e-4332-bd19-2973387bc13c/t1027-b.pdf', 'b.pdf', 10, 'hash-b')).id;
SELECT pg_temp.check('2件とも提出のまま（置き換え済みにならない）',
  (SELECT count(*) FROM signage.signage_inspection_reports r JOIN t_ids t ON t.id = r.id WHERE r.status = 'submitted') = 2);
-- 同じファイル（storage_path）をもう一度登録すると断る（追加になったので、二重に生きた行ができないように）
SELECT pg_temp.expect_error('同じファイルの二重登録',
  $q$SELECT signage.portal_register_report('2b84a9bd-b98e-4332-bd19-2973387bc13c', '2031-02-01', '2031-02-12',
    '20310212_試験_1027.pdf', '2b84a9bd-b98e-4332-bd19-2973387bc13c/t1027-a.pdf', 'a.pdf', 10, 'hash-a')$q$, '登録済み');

-- ============================================================
-- 2. 保守会社は削除・復元できない。編集は今どおりできる
-- ============================================================
SELECT pg_temp.expect_error('保守会社の削除',
  format('SELECT signage.portal_update_report(%L, ''delete'')', (SELECT id FROM t_ids WHERE k = 'a')), '管理者だけ');
SELECT pg_temp.check('保守会社の編集はできる',
  (signage.portal_update_report((SELECT id FROM t_ids WHERE k = 'a'), 'edit', p_note => 'メモ1027')).note = 'メモ1027');

-- ============================================================
-- 3. 管理者は削除・復元できる。保守会社は管理者が消した版を復元できない
-- ============================================================
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000001');
SELECT pg_temp.check('管理者の削除',
  (signage.portal_update_report((SELECT id FROM t_ids WHERE k = 'a'), 'delete')).status = 'deleted');
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
SELECT pg_temp.expect_error('保守会社の復元',
  format('SELECT signage.portal_update_report(%L, ''restore'')', (SELECT id FROM t_ids WHERE k = 'a')), '管理者だけ');
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000001');
SELECT pg_temp.check('管理者の復元',
  (signage.portal_update_report((SELECT id FROM t_ids WHERE k = 'a'), 'restore')).status = 'submitted');
SELECT pg_temp.check('もう一方の版は提出のまま',
  (SELECT status FROM signage.signage_inspection_reports WHERE id = (SELECT id FROM t_ids WHERE k = 'b')) = 'submitted');

-- ============================================================
-- 4. 無効ユーザー（a..03）・プロファイル無し（a..04）は他社の版も自社の版も編集できない
--    （current_role_kind()・current_vendor_id() が NULL になっても権限の判定を素通りしない）
-- ============================================================
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000004');
SELECT pg_temp.expect_error('プロファイル無しの編集',
  format('SELECT signage.portal_update_report(%L, ''edit'', p_note => ''改ざん'')', (SELECT id FROM t_ids WHERE k = 'b')), '権限がありません');
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000003');
SELECT pg_temp.expect_error('無効ユーザーの編集',
  format('SELECT signage.portal_update_report(%L, ''edit'', p_note => ''改ざん'')', (SELECT id FROM t_ids WHERE k = 'b')), '権限がありません');
SELECT pg_temp.as_owner();
SELECT pg_temp.check('版 b の備考は変わっていない',
  (SELECT note FROM signage.signage_inspection_reports WHERE id = (SELECT id FROM t_ids WHERE k = 'b')) IS NULL);

-- ============================================================
-- 5. anon は実行できない
-- ============================================================
SELECT pg_temp.as_owner();
SELECT pg_temp.check('anon に実行権が無い',
  NOT has_function_privilege('anon', 'signage.portal_register_report(uuid, date, date, text, text, text, bigint, text, uuid, text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'signage.portal_update_report(uuid, text, date, date, text, text)', 'EXECUTE'));

DO $$ BEGIN RAISE NOTICE 'OK'; END $$;
ROLLBACK;
