-- fix-1029-upload.sql の確かめ（ローカル DB 用。最後に ROLLBACK するので何も残らない）
-- 流し方: psql <ローカル DB> -X -v ON_ERROR_STOP=1 -f scripts/test-fix-1029-upload.sql
--   どれか1つでも期待と違えば例外で止まる。全部通れば最後に「OK」の NOTICE が出る。
-- 前提: fix-1029-upload.sql を流してあること。ローカルの検証用アカウント（admin a..01・user@ a..02〔保守会社 c..01〕・
--   inactive a..03〔c..01〕・user-b a..05〔c..03〕）と、点検行 2b84a9bd（120409-00。保守 c..01）があること。
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

CREATE TEMP TABLE t_ids (k text PRIMARY KEY, id uuid);
GRANT ALL ON t_ids TO authenticated;

INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES
  ('inspection-reports', '2b84a9bd-b98e-4332-bd19-2973387bc13c/t1029-a.pdf', 'a0000000-0000-4000-8000-000000000002'),
  ('inspection-reports', '2b84a9bd-b98e-4332-bd19-2973387bc13c/t1029-b.pdf', 'a0000000-0000-4000-8000-000000000002'),
  ('inspection-reports', '2b84a9bd-b98e-4332-bd19-2973387bc13c/t1029-c.pdf', 'a0000000-0000-4000-8000-000000000002');

-- ============================================================
-- 1. 報告書: 提出・差戻しのうちは上げた保守会社も削除できる。受領後は管理者だけ。復元は管理者だけ。他社は消せない
-- ============================================================
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
INSERT INTO t_ids SELECT 'a', (signage.portal_register_report('2b84a9bd-b98e-4332-bd19-2973387bc13c', '2031-03-01', '2031-03-10',
  '20310310_試験_1029a.pdf', '2b84a9bd-b98e-4332-bd19-2973387bc13c/t1029-a.pdf', 'a.pdf', 10, 'hash-1029a')).id;
INSERT INTO t_ids SELECT 'b', (signage.portal_register_report('2b84a9bd-b98e-4332-bd19-2973387bc13c', '2031-03-01', '2031-03-11',
  '20310311_試験_1029b.pdf', '2b84a9bd-b98e-4332-bd19-2973387bc13c/t1029-b.pdf', 'b.pdf', 10, 'hash-1029b')).id;
INSERT INTO t_ids SELECT 'c', (signage.portal_register_report('2b84a9bd-b98e-4332-bd19-2973387bc13c', '2031-03-01', '2031-03-12',
  '20310312_試験_1029c.pdf', '2b84a9bd-b98e-4332-bd19-2973387bc13c/t1029-c.pdf', 'c.pdf', 10, 'hash-1029c')).id;

-- 他社（user-b・保守 c..03）は消せない
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000005');
SELECT pg_temp.expect_error('他社の報告書の削除',
  format('SELECT signage.portal_update_report(%L, ''delete'')', (SELECT id FROM t_ids WHERE k = 'a')), '権限がありません');
-- 無効ユーザー（同じ保守会社）は消せない
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000003');
SELECT pg_temp.expect_error('無効ユーザーの削除',
  format('SELECT signage.portal_update_report(%L, ''delete'')', (SELECT id FROM t_ids WHERE k = 'a')), '権限がありません');

-- 提出のうちは自社が削除できる
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
SELECT pg_temp.check('提出の報告書を保守会社が削除できる',
  (signage.portal_update_report((SELECT id FROM t_ids WHERE k = 'a'), 'delete')).status = 'deleted');
SELECT pg_temp.expect_error('保守会社の復元',
  format('SELECT signage.portal_update_report(%L, ''restore'')', (SELECT id FROM t_ids WHERE k = 'a')), '管理者だけ');

-- 差戻しのうちも削除できる、受領後は削除できない
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000001');
SELECT signage.portal_review_report((SELECT id FROM t_ids WHERE k = 'b'), 'return', '試験の差戻し');
SELECT signage.portal_review_report((SELECT id FROM t_ids WHERE k = 'c'), 'accept', NULL);
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
SELECT pg_temp.check('差戻しの報告書を保守会社が削除できる',
  (signage.portal_update_report((SELECT id FROM t_ids WHERE k = 'b'), 'delete')).status = 'deleted');
SELECT pg_temp.expect_error('受領済みの報告書を保守会社が削除',
  format('SELECT signage.portal_update_report(%L, ''delete'')', (SELECT id FROM t_ids WHERE k = 'c')), '管理者だけ');
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000001');
SELECT pg_temp.check('受領済みの報告書を管理者が削除できる',
  (signage.portal_update_report((SELECT id FROM t_ids WHERE k = 'c'), 'delete')).status = 'deleted');
SELECT pg_temp.check('管理者の復元',
  (signage.portal_update_report((SELECT id FROM t_ids WHERE k = 'a'), 'restore')).status = 'submitted');

-- ============================================================
-- 2. その他ファイル: 上げた会社（同じ保守会社の別の人）も削除できる。他社は見えないので消せない
-- ============================================================
SELECT pg_temp.as_owner();
-- 同じ保守会社 c..01 の別の人（inactive a..03）が上げた行と、user@ が上げた行、管理会社 mgmt@ が上げた行を直接置く
WITH x AS (
  INSERT INTO signage.signage_property_files (property_id, property_code, property_name, category, file_name, storage_path, mime_type,
    uploaded_by, vendor_id, status)
  VALUES ('d0000000-0000-4000-8000-000000000001', '120409-00', '試験', 'estimate', 't1029-1.pdf', '120409-00/t1029-1.pdf', 'application/pdf',
    'a0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000001', 'active') RETURNING id)
INSERT INTO t_ids SELECT 'f1', id FROM x;
WITH x AS (
  INSERT INTO signage.signage_property_files (property_id, property_code, property_name, category, file_name, storage_path, mime_type,
    uploaded_by, vendor_id, status)
  VALUES ('d0000000-0000-4000-8000-000000000001', '120409-00', '試験', 'invoice', 't1029-2.pdf', '120409-00/t1029-2.pdf', 'application/pdf',
    'a0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', 'active') RETURNING id)
INSERT INTO t_ids SELECT 'f2', id FROM x;
WITH x AS (
  INSERT INTO signage.signage_property_files (property_id, property_code, property_name, category, file_name, storage_path, mime_type,
    uploaded_by, vendor_id, status)
  VALUES ('d0000000-0000-4000-8000-000000000001', '120409-00', '試験', 'photo', 't1029-3.mp4', '120409-00/t1029-3.mp4', 'video/mp4',
    'a0000000-0000-4000-8000-000000000006', NULL, 'active') RETURNING id)
INSERT INTO t_ids SELECT 'f3', id FROM x;

SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000005');
SELECT pg_temp.expect_error('他社のファイルの削除',
  format('SELECT signage.portal_delete_property_file(%L)', (SELECT id FROM t_ids WHERE k = 'f1')), '見つかりません');
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
SELECT pg_temp.check('同じ保守会社の別の人が上げたファイルを削除できる',
  (signage.portal_delete_property_file((SELECT id FROM t_ids WHERE k = 'f1'))).status = 'deleted');
SELECT pg_temp.check('自分が上げたファイルを削除できる',
  (signage.portal_delete_property_file((SELECT id FROM t_ids WHERE k = 'f2'))).status = 'deleted');
-- 保守会社は管理会社が上げたファイルを（見えないので）消せない
SELECT pg_temp.expect_error('管理会社のファイルを保守会社が削除',
  format('SELECT signage.portal_delete_property_file(%L)', (SELECT id FROM t_ids WHERE k = 'f3')), '見つかりません');
-- 別の管理会社（mgmt-b）は消せない（見えれば権限なし、見えなければ見つからない）
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000007');
DO $$ BEGIN
  PERFORM signage.portal_delete_property_file((SELECT id FROM t_ids WHERE k = 'f3'));
  RAISE EXCEPTION 'NG (通ってしまった) 別の管理会社の削除';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE 'NG%' THEN RAISE; END IF;
  RAISE NOTICE 'ok (止まった) 別の管理会社の削除: %', SQLERRM;
END $$;
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000006');
SELECT pg_temp.check('管理会社が自社の上げたファイルを削除できる',
  (signage.portal_delete_property_file((SELECT id FROM t_ids WHERE k = 'f3'))).status = 'deleted');

-- ============================================================
-- 3. バケットに動画が足されている（重複なし）・上限 50MB のまま
-- ============================================================
SELECT pg_temp.as_owner();
SELECT pg_temp.check('property-files に video/mp4・video/quicktime',
  (SELECT allowed_mime_types @> ARRAY['video/mp4', 'video/quicktime', 'application/pdf']
          AND cardinality(allowed_mime_types) = (SELECT count(DISTINCT m) FROM unnest(allowed_mime_types) m)
          AND file_size_limit = 52428800
     FROM storage.buckets WHERE id = 'property-files'));
SELECT pg_temp.check('inspection-reports は PDF だけのまま',
  (SELECT allowed_mime_types = ARRAY['application/pdf'] FROM storage.buckets WHERE id = 'inspection-reports'));

-- ============================================================
-- 4. 名前の一覧: 保守会社は範囲内だけ、管理者は全部
-- ============================================================
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
SELECT pg_temp.check('保守会社の建物の一覧は置ける建物だけ',
  (SELECT count(*) FROM signage.portal_upload_property_aliases()) = (SELECT count(*) FROM signage.portal_property_file_targets())
  AND EXISTS (SELECT 1 FROM signage.portal_upload_property_aliases() WHERE property_code = '120409-00'));
SELECT pg_temp.check('保守会社の取引先の一覧に自社がある・他社 c..03 は無い',
  EXISTS (SELECT 1 FROM signage.portal_upload_vendor_aliases() WHERE id = 'c0000000-0000-4000-8000-000000000001')
  AND NOT EXISTS (SELECT 1 FROM signage.portal_upload_vendor_aliases() WHERE id = 'c0000000-0000-4000-8000-000000000003'));
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000004');
SELECT pg_temp.check('プロファイル無しは何も見えない',
  NOT EXISTS (SELECT 1 FROM signage.portal_upload_property_aliases())
  AND NOT EXISTS (SELECT 1 FROM signage.portal_upload_vendor_aliases()));
-- 全社の数は持ち主で数えておく（authenticated からは biz.maintainers が RLS で見えない）
SELECT pg_temp.as_owner();
CREATE TEMP TABLE t_count AS SELECT count(*) AS n FROM biz.maintainers m JOIN biz.companies c ON c.id = m.id;
GRANT SELECT ON t_count TO authenticated;
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000001');
SELECT pg_temp.check('管理者は保守会社を全社見られる',
  (SELECT count(*) FROM signage.portal_upload_vendor_aliases()) = (SELECT n FROM t_count));

-- ============================================================
-- 5. anon は実行できない
-- ============================================================
SELECT pg_temp.as_owner();
SELECT pg_temp.check('anon に実行権が無い',
  NOT has_function_privilege('anon', 'signage.portal_update_report(uuid, text, date, date, text, text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'signage.portal_delete_property_file(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'signage.portal_upload_property_aliases()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'signage.portal_upload_vendor_aliases()', 'EXECUTE'));

DO $$ BEGIN RAISE NOTICE 'OK'; END $$;
ROLLBACK;
