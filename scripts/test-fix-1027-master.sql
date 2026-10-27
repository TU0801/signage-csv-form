-- fix-1027-master.sql の確かめ（ローカル DB 用。最後に ROLLBACK するので何も残らない）
-- 流し方: psql <ローカル DB> -X -v ON_ERROR_STOP=1 -f scripts/test-fix-1027-master.sql
--   どれか1つでも期待と違えば例外で止まる。全部通れば最後に「OK」の NOTICE が出る。
-- 前提: fix-1027-master.sql を流してあること。ローカルの検証用アカウント（admin a..01・user@ a..02・mgmt@ a..06〔管理会社 c..09〕・
--   mgmt-b a..07〔管理会社 c..10〕）、物件 120409-00（c..09。手入力の点検 4343bb34・台の保守の写し 2b84a9bd・台 EV-1 の保守 fddb16c4）、
--   120411-00（c..10。点検 1a0ff1d0）があること。削除の試験用の物件はこの中で業務システムの物件から作る。
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

-- anon には実行権が無い
SELECT pg_temp.check('anon に実行権なし',
  NOT has_function_privilege('anon', 'signage.set_inspection_schedule(text, uuid, boolean, integer, integer[])', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'signage.delete_master_property(text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'signage.master_property_links(text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'signage.master_inspection_schedules()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'signage.master_property_codes()', 'EXECUTE'));

-- ============================================================
-- 1. master_property_codes（補助は biz.properties.en_no）
-- ============================================================
SELECT pg_temp.as_owner();
UPDATE biz.properties SET en_no = '0409' WHERE id = 'e0000000-0000-4000-8000-000000000001';
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000001');
SELECT pg_temp.check('管理者: 補助が読める',
  (SELECT en_no FROM signage.master_property_codes() WHERE property_code = '120409-00') = '0409');
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000007');
SELECT pg_temp.check('管理会社: 他社の物件は出ない',
  NOT EXISTS (SELECT 1 FROM signage.master_property_codes() WHERE property_code = '120409-00')
  AND EXISTS (SELECT 1 FROM signage.master_property_codes() WHERE property_code = '120411-00'));
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
SELECT pg_temp.check('保守会社: 0件', NOT EXISTS (SELECT 1 FROM signage.master_property_codes()));

-- ============================================================
-- 2・3. master_inspection_schedules / set_inspection_schedule
-- ============================================================
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000001');
SELECT pg_temp.check('管理者: 物件単位と台の行が読める',
  EXISTS (SELECT 1 FROM signage.master_inspection_schedules() WHERE kind = 'property' AND inspection_id = '4343bb34-0832-4275-a507-6d18115ec3e5')
  AND EXISTS (SELECT 1 FROM signage.master_inspection_schedules() WHERE kind = 'unit' AND inspection_id = 'fddb16c4-d119-4130-9c12-9c03f23073b0'));
SELECT pg_temp.check('管理者: 物件単位の3列を書く',
  signage.set_inspection_schedule('property', '4343bb34-0832-4275-a507-6d18115ec3e5', false, 6, ARRAY[4, 1, 4]));
SELECT pg_temp.check('同じ値なら書かない（false）',
  NOT signage.set_inspection_schedule('property', '4343bb34-0832-4275-a507-6d18115ec3e5', false, 6, ARRAY[1, 4]));
SELECT pg_temp.check('物件単位: 読み直すと書いた値（請求月は重複なしの昇順）',
  (SELECT row(notify_inspection_date, interval_months, billing_months)::text FROM signage.master_inspection_schedules()
    WHERE inspection_id = '4343bb34-0832-4275-a507-6d18115ec3e5') = row(false, 6, ARRAY[1, 4])::text);
SELECT pg_temp.check('管理者: 台の3列を書く',
  signage.set_inspection_schedule('unit', 'fddb16c4-d119-4130-9c12-9c03f23073b0', false, 24, ARRAY[3]));
SELECT pg_temp.as_owner();
SELECT pg_temp.check('台: biz に入った',
  (SELECT row(notify_inspection_date, interval_months, billing_months)::text FROM biz.property_unit_inspections
    WHERE id = 'fddb16c4-d119-4130-9c12-9c03f23073b0') = row(false, 24, ARRAY[3])::text);
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000001');
SELECT pg_temp.expect_error('写しの行は物件単位で書けない',
  $q$SELECT signage.set_inspection_schedule('property', '2b84a9bd-b98e-4332-bd19-2973387bc13c', true, 12, '{}')$q$, '台ごとに管理');
SELECT pg_temp.expect_error('インターバルの範囲',
  $q$SELECT signage.set_inspection_schedule('property', '4343bb34-0832-4275-a507-6d18115ec3e5', true, 121, '{}')$q$, 'インターバル');
SELECT pg_temp.expect_error('請求月の範囲',
  $q$SELECT signage.set_inspection_schedule('unit', 'fddb16c4-d119-4130-9c12-9c03f23073b0', true, 12, ARRAY[13])$q$, '請求月');
SELECT pg_temp.expect_error('種類の指定',
  $q$SELECT signage.set_inspection_schedule('x', 'fddb16c4-d119-4130-9c12-9c03f23073b0', true, 12, '{}')$q$, 'property か unit');
SELECT pg_temp.expect_error('無い行',
  $q$SELECT signage.set_inspection_schedule('unit', gen_random_uuid(), true, 12, '{}')$q$, '権限がありません');

-- 管理会社: 自社物件だけ
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000006');
SELECT pg_temp.check('管理会社: 自社物件の台を書ける',
  signage.set_inspection_schedule('unit', 'fddb16c4-d119-4130-9c12-9c03f23073b0', true, NULL, '{}'));
SELECT pg_temp.check('管理会社: 他社の行は読めない',
  NOT EXISTS (SELECT 1 FROM signage.master_inspection_schedules() WHERE inspection_id = '1a0ff1d0-4808-4bb7-9b9e-9193b158bc2c'));
SELECT pg_temp.expect_error('管理会社: 他社の行は書けない',
  $q$SELECT signage.set_inspection_schedule('property', '1a0ff1d0-4808-4bb7-9b9e-9193b158bc2c', true, 12, '{}')$q$, '権限がありません');
-- 保守会社は書けない
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
SELECT pg_temp.expect_error('保守会社は書けない',
  $q$SELECT signage.set_inspection_schedule('unit', 'fddb16c4-d119-4130-9c12-9c03f23073b0', true, 12, '{}')$q$, '権限がありません');
SELECT pg_temp.check('保守会社: 0件', NOT EXISTS (SELECT 1 FROM signage.master_inspection_schedules()));

-- ============================================================
-- 4. master_property_links / delete_master_property
-- ============================================================
-- 紐付けの無い物件を業務システムの物件から出す（トリガー biz.sync_property_to_signage が signage へ写す）
SELECT pg_temp.as_owner();
INSERT INTO biz.properties (id, name, management_company_id, signage_property_code, active)
VALUES ('e0000000-0000-4000-8000-0000000010d7', '削除試験マンション', 'c0000000-0000-4000-8000-000000000009', 'T1027DEL-01', true);
SELECT pg_temp.check('試験用の物件が signage に出た',
  EXISTS (SELECT 1 FROM signage.signage_master_properties WHERE property_code = 'T1027DEL-01'));

-- 管理会社・保守会社は削除できない
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000006');
SELECT pg_temp.expect_error('管理会社は削除できない', $q$SELECT signage.delete_master_property('T1027DEL-01')$q$, '管理者だけ');
SELECT pg_temp.expect_error('管理会社は件数も読めない', $q$SELECT signage.master_property_links('T1027DEL-01')$q$, '管理者だけ');
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
SELECT pg_temp.expect_error('保守会社は削除できない', $q$SELECT signage.delete_master_property('T1027DEL-01')$q$, '管理者だけ');

-- 紐付けのある物件は断る（120409-00 は点検・台・保守会社の紐付けがある）
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000001');
SELECT pg_temp.check('120409-00 の件数',
  (signage.master_property_links('120409-00')->>'inspections')::int > 0
  AND (signage.master_property_links('120409-00')->>'units')::int > 0);
SELECT pg_temp.expect_error('紐付けありは削除できない', $q$SELECT signage.delete_master_property('120409-00')$q$, '紐づけありの為、削除できません');

-- 保守会社の紐付けを足すと断る。削除済みにした紐付けは数えない
SELECT pg_temp.as_owner();
INSERT INTO signage.signage_building_vendors (property_code, vendor_id, status)
VALUES ('T1027DEL-01', 'c0000000-0000-4000-8000-000000000001', 'active');
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000001');
SELECT pg_temp.check('紐付けの件数 1', (signage.master_property_links('T1027DEL-01')->>'building_vendors')::int = 1);
SELECT pg_temp.expect_error('保守会社の紐付けありは削除できない', $q$SELECT signage.delete_master_property('T1027DEL-01')$q$, '保守会社の紐付け 1件');
SELECT pg_temp.as_owner();
UPDATE signage.signage_building_vendors SET status = 'deleted' WHERE property_code = 'T1027DEL-01';
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000001');
SELECT pg_temp.check('削除済みの紐付けは数えない', (signage.master_property_links('T1027DEL-01')->>'building_vendors')::int = 0);

-- 管理者は直接は消せない（物件の表への直接の書き込みは今どおり断る）
SELECT pg_temp.expect_error('直接の DELETE は断る',
  $q$DELETE FROM signage.signage_master_properties WHERE property_code = 'T1027DEL-01'$q$, '業務システム');

-- 削除: signage の行が消え、業務システムの物件は残ってリンクが外れる
SELECT pg_temp.check('削除できる', signage.delete_master_property('T1027DEL-01'));
SELECT pg_temp.as_owner();
SELECT pg_temp.check('signage の行が消えた',
  NOT EXISTS (SELECT 1 FROM signage.signage_master_properties WHERE property_code = 'T1027DEL-01'));
SELECT pg_temp.check('業務システムの物件は残り、リンクとコードが外れた',
  (SELECT signage_property_id IS NULL AND signage_property_code IS NULL AND active
     FROM biz.properties WHERE id = 'e0000000-0000-4000-8000-0000000010d7'));
SELECT pg_temp.check('削除済みの保守会社の紐付けも消えた（同じコードの物件が後でできても付き直らない）',
  NOT EXISTS (SELECT 1 FROM signage.signage_building_vendors WHERE property_code = 'T1027DEL-01'));
-- 業務システムで物件を更新しても作り直されない
UPDATE biz.properties SET name = '削除試験マンション2' WHERE id = 'e0000000-0000-4000-8000-0000000010d7';
SELECT pg_temp.check('業務システムの更新で作り直されない',
  NOT EXISTS (SELECT 1 FROM signage.signage_master_properties WHERE property_name LIKE '削除試験マンション%'));
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000001');
SELECT pg_temp.expect_error('2回目は見つからない', $q$SELECT signage.delete_master_property('T1027DEL-01')$q$, '見つかりません');

SELECT pg_temp.as_owner();
DO $$ BEGIN RAISE NOTICE 'OK'; END $$;
ROLLBACK;
