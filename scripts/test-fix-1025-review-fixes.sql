-- 修正依頼1025 検証の指摘（S3・S4・N1・N2・N3）の確かめ（ローカル DB 用。最後に ROLLBACK するので何も残らない）
-- 流し方: psql <ローカル DB> -X -v ON_ERROR_STOP=1 -f scripts/test-fix-1025-review-fixes.sql
--   どれか1つでも期待と違えば例外で止まる。全部通れば最後に「OK」の NOTICE が出る。
-- 前提: fix-1025-posters.sql・fix-1025-reports.sql を流してあること。ローカルの検証用アカウント（user@verify.local a..02・
--   user-b a..05・mgmt@verify.local a..06）と管理会社 c..09・c..10、物件 120409-00（管理会社 c..09）があること。
-- 確かめること:
--   S3: 貼紙ライブラリのファイル名は英数字で始まる名前だけ（'=1+1.png' は止まる。画面が付ける名前は通る）
--   N3: 1枚目の貼紙（poster_image）を '/./'・%6C・'//'・二重の符号化で書いても、他社の管理会社のライブラリの範囲の確かめを抜けない
--   S4: 保守会社の無い保守会社アカウントは OCR の確定を記録しない（0件）
--   N1: 大文字で書いた保守会社の id は小文字にそろえて記録する（割れにならない）
--   N2: signage_ocr_usage のシーケンスに anon・authenticated の権限が無い
BEGIN;

CREATE FUNCTION pg_temp.act_as(p_uid text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
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

-- p_sql が例外で止まること（止まらなければ失敗）。例外のときは中の変更は戻る
CREATE FUNCTION pg_temp.expect_error(p_label text, p_sql text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'ok (止まった) %: %', p_label, SQLERRM;
    RETURN;
  END;
  RAISE EXCEPTION 'NG (通ってしまった) %', p_label;
END $$;

GRANT EXECUTE ON FUNCTION pg_temp.act_as(text), pg_temp.as_owner(), pg_temp.expect_error(text, text) TO authenticated;

-- 管理会社 c..10 のライブラリの貼紙と、保守会社の無い保守会社アカウント
INSERT INTO signage.signage_poster_library (id, display_name, image_url, storage_path, management_company_id)
VALUES ('bbbbbbbb-1025-4000-8000-0000000000c1', 'TEST1025 c10',
        'http://127.0.0.1:55321/storage/v1/object/public/poster-images/library/c0000000-0000-4000-8000-000000000010/t1025.png',
        'library/c0000000-0000-4000-8000-000000000010/t1025.png', 'c0000000-0000-4000-8000-000000000010');
INSERT INTO auth.users (id, email, aud, role)
VALUES ('a9000000-1025-4000-8000-0000000000f1', 'test1025-nv@verify.local', 'authenticated', 'authenticated');
INSERT INTO signage.signage_profiles (id, email, role, status, vendor_id)
VALUES ('a9000000-1025-4000-8000-0000000000f1', 'test1025-nv@verify.local', 'user', 'active', NULL);

DO $$
DECLARE
  c_lib constant text := 'http://127.0.0.1:55321/storage/v1/object/public/poster-images/';
  c_ins constant text := 'INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, inspection_type, poster_type, poster_image) '
                         || 'VALUES (auth.uid(), ''120409-00'', '''', ''x'', ''x'', ''custom'', %L)';
  n integer;
  rec record;
BEGIN
  -- S3
  PERFORM pg_temp.act_as('a0000000-0000-4000-8000-000000000006');
  PERFORM pg_temp.expect_error('S3 数式で始まるファイル名', format(
    'INSERT INTO signage.signage_poster_library (display_name, image_url, storage_path, management_company_id) VALUES (%L, %L, %L, %L)',
    'x', c_lib || 'library/c0000000-0000-4000-8000-000000000009/=1+1.png',
    'library/c0000000-0000-4000-8000-000000000009/=1+1.png', 'c0000000-0000-4000-8000-000000000009'));
  INSERT INTO signage.signage_poster_library (display_name, image_url, storage_path, management_company_id)
  VALUES ('TEST1025 ok', c_lib || 'library/c0000000-0000-4000-8000-000000000009/1761360000000_ab12cd.png',
          'library/c0000000-0000-4000-8000-000000000009/1761360000000_ab12cd.png', 'c0000000-0000-4000-8000-000000000009');
  RAISE NOTICE 'ok S3 画面が付ける名前は通る';

  -- N3（user@ は物件 120409-00 の保守会社。c..10 のライブラリはこの物件では使えない）
  PERFORM pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
  PERFORM pg_temp.expect_error('N3 そのままの URL',
    format(c_ins, c_lib || 'library/c0000000-0000-4000-8000-000000000010/t1025.png'));
  PERFORM pg_temp.expect_error('N3 /./',
    format(c_ins, c_lib || './library/c0000000-0000-4000-8000-000000000010/t1025.png'));
  PERFORM pg_temp.expect_error('N3 %6C',
    format(c_ins, c_lib || '%6Cibrary/c0000000-0000-4000-8000-000000000010/t1025.png'));
  PERFORM pg_temp.expect_error('N3 // と二重の符号化',
    format(c_ins, replace(c_lib, '/public/', '/public//') || '%256Cibrary/c0000000-0000-4000-8000-000000000010/t1025.png'));
  PERFORM pg_temp.expect_error('N3 ..',
    format(c_ins, c_lib || 'a0000000-0000-4000-8000-000000000002/../library/c0000000-0000-4000-8000-000000000010/t1025.png'));
  -- 自分のフォルダの画像（日本語のファイル名を符号化したもの）は通る
  EXECUTE format(c_ins, c_lib || 'a0000000-0000-4000-8000-000000000002/1761_ab%E3%81%82.png');
  RAISE NOTICE 'ok N3 自分のフォルダの画像は通る';

  -- S4
  PERFORM pg_temp.act_as('a9000000-1025-4000-8000-0000000000f1');
  n := signage.ocr_record_corrections('[{"field":"category","raw_text":"TEST1025書類","resolved_value":"invoice"}]');
  IF n <> 0 THEN
    RAISE EXCEPTION 'NG S4 保守会社の無いアカウントが記録した: %', n;
  END IF;
  RAISE NOTICE 'ok S4 保守会社の無いアカウントは記録しない';

  -- N1（user@ と user-b は別の保守会社）
  PERFORM pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
  PERFORM signage.ocr_record_corrections('[{"field":"vendor","raw_text":"TEST1025会社","resolved_value":"c0000000-0000-4000-8000-000000000003"}]');
  PERFORM pg_temp.act_as('a0000000-0000-4000-8000-000000000005');
  PERFORM signage.ocr_record_corrections('[{"field":"vendor","raw_text":"TEST1025会社","resolved_value":"C0000000-0000-4000-8000-000000000003"}]');
  SELECT count(*) AS rows, max(confirmations) AS conf, bool_or(conflicting) AS conflicting INTO rec
    FROM signage.ocr_correction_dictionary() d WHERE d.raw_text = 'TEST1025会社';
  IF rec.rows <> 1 OR rec.conf <> 2 OR rec.conflicting THEN
    RAISE EXCEPTION 'NG N1 大文字の id が別の値になった: %', rec;
  END IF;
  RAISE NOTICE 'ok N1 大文字の id は同じ値: %', rec;

  -- N2
  PERFORM pg_temp.as_owner();
  IF has_sequence_privilege('anon', 'signage.signage_ocr_usage_id_seq', 'USAGE,SELECT,UPDATE')
     OR has_sequence_privilege('authenticated', 'signage.signage_ocr_usage_id_seq', 'USAGE,SELECT,UPDATE') THEN
    RAISE EXCEPTION 'NG N2 シーケンスに anon/authenticated の権限が残っている';
  END IF;
  RAISE NOTICE 'ok N2 シーケンスの権限';

  RAISE NOTICE 'OK: 修正依頼1025 検証の指摘（S3・S4・N1・N2・N3）の確かめはすべて通った';
END $$;

ROLLBACK;
