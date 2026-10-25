-- 修正依頼1025 検証の指摘（S3・S4・N1・N2・N3）の確かめ（ローカル DB 用。最後に ROLLBACK するので何も残らない）
-- 流し方: psql <ローカル DB> -X -v ON_ERROR_STOP=1 -f scripts/test-fix-1025-review-fixes.sql
--   どれか1つでも期待と違えば例外で止まる。全部通れば最後に「OK」の NOTICE が出る。
-- 前提: fix-1025-posters.sql・fix-1025-reports.sql を流してあること。ローカルの検証用アカウント（user@verify.local a..02・
--   user-b a..05・mgmt@verify.local a..06）と管理会社 c..09・c..10、物件 120409-00（管理会社 c..09）があること。
-- 確かめること:
--   S3: 貼紙ライブラリのファイル名は英数字で始まる名前だけ（'=1+1.png' は止まる。画面が付ける名前は通る）
--   N3: 貼紙の URL（1枚目の poster_image と extra_posters の upload）は許可リストとの完全一致だけ通る。
--       %2F・%5C・'\'・タブ・CR・LF・'/./'・'//'・2〜5重の符号化・'..'・大文字のホスト・別のホスト・他社のライブラリの完全な URL・
--       他の方のフォルダ・サブフォルダ・%xx 入りのファイル名は止まり（42501）、本人のアップロード・範囲内のライブラリ・NULL は通る。
--       管理者が他の方の申請を直すときは申請した方のフォルダで見る。同じ物件・同じ点検種別の他の方の差戻し中の追加貼紙の申請の
--       画像は写せる（点検一覧）。差戻しでない（下書き・承認済み）申請・別の点検種別の画像は写せない。
--       写した画像を、物件コードを変えて別の物件へ持ち出せない。ライブラリの行の URL が後から変わった古い URL は、
--       他社の物件へ移せない（同じ管理会社の物件へは移せる）。本人のアップロードは別の物件へ移せる
--   S4: 保守会社の無い保守会社アカウントは OCR の確定を記録しない（0件）
--   N1: 大文字で書いた保守会社の id は小文字にそろえて記録する（割れにならない）
--   N2: signage_ocr_usage のシーケンスに anon・authenticated の権限が無い
BEGIN;

CREATE FUNCTION pg_temp.act_as(p_uid text, p_iss text DEFAULT 'http://127.0.0.1:55321/auth/v1') RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated', 'iss', p_iss)::text, true);
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

-- p_sql が貼紙の確かめ（guard_entry_posters の 42501）で止まること。RLS の 42501 や書き間違いの例外では通さない
CREATE FUNCTION pg_temp.expect_poster_denied(p_label text, p_sql text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = '42501' AND SQLERRM LIKE '%貼紙%' THEN
      RAISE NOTICE 'ok (止まった) %: %', p_label, SQLERRM;
      RETURN;
    END IF;
    RAISE EXCEPTION 'NG (別の理由で止まった) %: % %', p_label, SQLSTATE, SQLERRM;
  END;
  RAISE EXCEPTION 'NG (通ってしまった) %', p_label;
END $$;

GRANT EXECUTE ON FUNCTION pg_temp.act_as(text, text), pg_temp.as_owner(), pg_temp.expect_error(text, text),
  pg_temp.expect_poster_denied(text, text) TO authenticated;

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
  c_ins_extra constant text := 'INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, inspection_type, poster_type, extra_posters) '
                         || 'VALUES (auth.uid(), ''120409-00'', '''', ''x'', ''x'', ''template'', %L::jsonb)';
  v_own text;
  v_c10 text;
  v_bad text[];
  v_url text;
  v_entry uuid;
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

  -- N3（user@ は物件 120409-00 の保守会社。c..10 のライブラリはこの物件では使えない。c..09 の分は使える）
  PERFORM pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
  v_own := c_lib || 'a0000000-0000-4000-8000-000000000002/';
  v_c10 := 'library/c0000000-0000-4000-8000-000000000010/t1025.png';
  v_bad := ARRAY[
    c_lib || v_c10,                                                                    -- 他社のライブラリの完全な URL
    c_lib || './' || v_c10,                                                            -- '/./'
    c_lib || '%6Cibrary/c0000000-0000-4000-8000-000000000010/t1025.png',               -- %xx
    replace(c_lib, '/public/', '/public//') || '%256Cibrary/c0000000-0000-4000-8000-000000000010/t1025.png',
    v_own || '../' || v_c10,                                                           -- '..'
    v_own || '..%2F' || replace(v_c10, '/', '%2F'),                                    -- %2F
    v_own || '..%5C' || replace(v_c10, '/', '%5C'),                                    -- %5C
    v_own || '..\' || replace(v_c10, '/', '\'),                                        -- '\'
    v_own || '..' || chr(9) || '/' || v_c10,                                           -- タブ
    v_own || '..' || chr(13) || '/' || v_c10,                                          -- CR
    v_own || '..' || chr(10) || '/' || v_c10,                                          -- LF
    v_own || '1761_ab' || chr(9) || '12.png',
    v_own || '1761_ab12.png' || chr(10),
    v_own || './1761_ab12.png',                                                        -- 本人のフォルダでも '/./'
    v_own || '/1761_ab12.png',                                                         -- '//'
    replace(v_own, '/poster-images/', '/poster-images//') || '1761_ab12.png',
    v_own || '..',
    v_own || '.',
    v_own || '%E3%81%82.png',                                                          -- %xx 入りのファイル名
    'HTTP://127.0.0.1:55321/storage/v1/object/public/poster-images/a0000000-0000-4000-8000-000000000002/1761_ab12.png',
    'https://evil.example.com/storage/v1/object/public/poster-images/a0000000-0000-4000-8000-000000000002/1761_ab12.png',
    'http://127.0.0.1:55321.evil.example.com/storage/v1/object/public/poster-images/a0000000-0000-4000-8000-000000000002/1761_ab12.png',
    c_lib || 'a0000000-0000-4000-8000-000000000005/1761_ab12.png',                     -- 他の方のフォルダ
    v_own || 'sub/1761_ab12.png',                                                      -- サブフォルダ
    v_own || '1761_ab12.png?x=1',
    v_own || '1761_ab12.png#x',
    'javascript:alert(1)//' || v_own || '1761_ab12.png',
    ' ' || v_own || '1761_ab12.png'];
  -- 2〜5重に符号化した '../'（'%' を '%25' にする回数を変える）
  FOR k IN 2..5 LOOP
    v_bad := v_bad || (v_own || replace('%2E%2E%2F', '%', '%' || repeat('25', k - 1)) || v_c10);
  END LOOP;
  FOREACH v_url IN ARRAY v_bad LOOP
    PERFORM pg_temp.expect_poster_denied('N3 1枚目 ' || v_url, format(c_ins, v_url));
    PERFORM pg_temp.expect_poster_denied('N3 2枚目以降 ' || v_url, format(c_ins_extra,
      jsonb_build_array(jsonb_build_object('source', 'upload', 'image_url', v_url))::text));
  END LOOP;
  -- 大文字のホスト（iss のホストが英字のとき。iss を kong.local にして、KONG.local と書く）
  PERFORM pg_temp.act_as('a0000000-0000-4000-8000-000000000002', 'http://kong.local:8000/auth/v1');
  v_url := 'http://KONG.local:8000/storage/v1/object/public/poster-images/a0000000-0000-4000-8000-000000000002/1761_ab12.png';
  PERFORM pg_temp.expect_poster_denied('N3 大文字のホスト', format(c_ins, v_url));
  EXECUTE format(c_ins, replace(v_url, 'KONG', 'kong'));
  -- iss から URL を出せない（旧形式の鍵など）ときは、本人のフォルダの形でも通さない
  PERFORM pg_temp.act_as('a0000000-0000-4000-8000-000000000002', 'supabase');
  PERFORM pg_temp.expect_poster_denied('N3 iss が無い', format(c_ins, v_own || '1761_ab12.png'));

  PERFORM pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
  -- 本人のアップロード（画面が付ける名前）・範囲内のライブラリ・NULL は通る
  EXECUTE format(c_ins, v_own || '1761360000000_ab12cd.png');
  EXECUTE format(c_ins_extra, jsonb_build_array(jsonb_build_object('source', 'upload', 'image_url', v_own || '1761360000000_ab12cd.jpg'))::text);
  EXECUTE format(c_ins, c_lib || 'library/c0000000-0000-4000-8000-000000000009/1761360000000_ab12cd.png');
  EXECUTE format(c_ins_extra, '[]');
  RAISE NOTICE 'ok N3 本人のアップロード・範囲内のライブラリ・NULL は通る';

  -- 管理者が user@ の申請を直す: user@ のフォルダは通り、管理者のフォルダは止まる（user_id は行の値で見る）
  SELECT id INTO v_entry FROM signage.signage_entries
   WHERE user_id = 'a0000000-0000-4000-8000-000000000002' AND poster_image = v_own || '1761360000000_ab12cd.png';
  PERFORM pg_temp.act_as('a0000000-0000-4000-8000-000000000001');
  EXECUTE format('UPDATE signage.signage_entries SET poster_image = %L WHERE id = %L', v_own || '1761360000001_ef34gh.png', v_entry);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'NG N3 管理者の編集が 1 行に当たらない: %', n;
  END IF;
  PERFORM pg_temp.expect_poster_denied('N3 管理者が自分のフォルダの画像に替える', format(
    'UPDATE signage.signage_entries SET poster_image = %L WHERE id = %L',
    c_lib || 'a0000000-0000-4000-8000-000000000001/1761_ab12.png', v_entry));
  RAISE NOTICE 'ok N3 管理者の編集は申請した方のフォルダで見る';

  -- user-b が、同じ物件の user@ の追加貼紙の申請の画像で新しい申請を出す（点検一覧の差戻し）: 差戻し中なら通る。
  -- 下書き・承認済みの申請の画像・別の点検種別・どの申請にも無い user@ のフォルダの画像・別の物件の申請の画像は止まる
  PERFORM pg_temp.act_as('a0000000-0000-4000-8000-000000000005');
  PERFORM pg_temp.expect_poster_denied('N3 下書きの申請の画像', format(c_ins, v_own || '1761360000001_ef34gh.png'));
  PERFORM pg_temp.as_owner();
  UPDATE signage.signage_entries SET status = 'ready' WHERE id = v_entry;
  PERFORM pg_temp.act_as('a0000000-0000-4000-8000-000000000005');
  PERFORM pg_temp.expect_poster_denied('N3 承認済みの申請の画像', format(c_ins, v_own || '1761360000001_ef34gh.png'));
  PERFORM pg_temp.as_owner();
  UPDATE signage.signage_entries SET status = 'pending', review_comment = 'TEST1025 差戻し' WHERE id = v_entry;
  PERFORM pg_temp.act_as('a0000000-0000-4000-8000-000000000005');
  PERFORM pg_temp.expect_poster_denied('N3 別の点検種別の差戻しの画像', replace(format(c_ins, v_own || '1761360000001_ef34gh.png'),
    '''x'', ''custom''', '''y'', ''custom'''));
  EXECUTE format(c_ins, v_own || '1761360000001_ef34gh.png');
  PERFORM pg_temp.expect_poster_denied('N3 どの申請にも無い他の方の画像', format(c_ins, v_own || '1761360000009_zz99zz.png'));
  PERFORM pg_temp.expect_poster_denied('N3 別の物件の申請の画像', replace(format(c_ins, v_own || '1761360000001_ef34gh.png'),
    '''120409-00''', '''TEST1025-other'''));
  RAISE NOTICE 'ok N3 同じ物件の他の方の差戻しの追加貼紙の画像は写せる';

  -- 写した画像を別の物件へ持ち出せない: user-b の差戻しの画像を user@ が写し（120409-00）、120411-00（管理会社 c..10）へ移す
  PERFORM pg_temp.act_as('a0000000-0000-4000-8000-000000000005');
  EXECUTE format(c_ins, c_lib || 'a0000000-0000-4000-8000-000000000005/1761360000002_bb22bb.png');
  PERFORM pg_temp.as_owner();
  UPDATE signage.signage_entries SET status = 'pending', review_comment = 'TEST1025 差戻し'
   WHERE poster_image = c_lib || 'a0000000-0000-4000-8000-000000000005/1761360000002_bb22bb.png';
  PERFORM pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
  EXECUTE format(c_ins, c_lib || 'a0000000-0000-4000-8000-000000000005/1761360000002_bb22bb.png');
  SELECT id INTO v_entry FROM signage.signage_entries
   WHERE user_id = 'a0000000-0000-4000-8000-000000000002'
     AND poster_image = c_lib || 'a0000000-0000-4000-8000-000000000005/1761360000002_bb22bb.png';
  -- 保守会社が書き換えられるのは未申請（pending）の行だけ（guard_entry_approval_flow）なので、移す行は pending にしておく
  PERFORM pg_temp.as_owner();
  UPDATE signage.signage_entries SET status = 'pending'
   WHERE user_id = 'a0000000-0000-4000-8000-000000000002' AND poster_type = 'custom' AND property_code = '120409-00';
  PERFORM pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
  PERFORM pg_temp.expect_poster_denied('N3 写した他の方の画像を別の物件へ移す', format(
    'UPDATE signage.signage_entries SET property_code = %L WHERE id = %L', '120411-00', v_entry));
  -- 本人のアップロードは別の物件へ移せる
  SELECT id INTO v_entry FROM signage.signage_entries
   WHERE user_id = 'a0000000-0000-4000-8000-000000000002' AND poster_image = v_own || '1761360000001_ef34gh.png';
  EXECUTE format('UPDATE signage.signage_entries SET property_code = %L WHERE id = %L', '120411-00', v_entry);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'NG N3 本人のアップロードの申請を別の物件へ移せない: %', n;
  END IF;
  RAISE NOTICE 'ok N3 写した画像は別の物件へ移せない（本人のアップロードは移せる）';

  -- ライブラリの行（c..09）の URL を後から変えたとき、古い URL の申請は c..10 の物件へ移せない（c..09 の物件へは移せる）
  SELECT id INTO v_entry FROM signage.signage_entries
   WHERE user_id = 'a0000000-0000-4000-8000-000000000002'
     AND poster_image = c_lib || 'library/c0000000-0000-4000-8000-000000000009/1761360000000_ab12cd.png';
  PERFORM pg_temp.as_owner();
  UPDATE signage.signage_poster_library
     SET image_url = c_lib || 'library/c0000000-0000-4000-8000-000000000009/1761360000000_ab12cdb.png',
         storage_path = 'library/c0000000-0000-4000-8000-000000000009/1761360000000_ab12cdb.png'
   WHERE storage_path = 'library/c0000000-0000-4000-8000-000000000009/1761360000000_ab12cd.png';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'NG N3 ライブラリの行を付け替えられない: %', n;
  END IF;
  PERFORM pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
  PERFORM pg_temp.expect_poster_denied('N3 付け替え前のライブラリの URL を他社の物件へ移す', format(
    'UPDATE signage.signage_entries SET property_code = %L WHERE id = %L', '120411-00', v_entry));
  EXECUTE format('UPDATE signage.signage_entries SET property_code = %L WHERE id = %L', 'T1024-01', v_entry);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'NG N3 付け替え前のライブラリの URL を同じ管理会社の物件へ移せない: %', n;
  END IF;
  RAISE NOTICE 'ok N3 付け替え前のライブラリの URL は他社の物件へ移せない';

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
