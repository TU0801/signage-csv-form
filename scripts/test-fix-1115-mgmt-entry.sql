-- fix-1115-mgmt-entry.sql の確かめ（ローカル DB 用。最後に ROLLBACK するので何も残らない）
-- 流し方: psql <ローカル DB> -X -v ON_ERROR_STOP=1 -f scripts/test-fix-1115-mgmt-entry.sql
--   どれか1つでも期待と違えば例外で止まる。全部通れば最後に「OK」の NOTICE が出る。
-- 前提: fix-1115-mgmt-entry.sql を流してあること。ローカルの検証用アカウント（admin a..01・user@ a..02〔保守会社 c..01〕・
--   user-b a..05〔c..03〕・mgmt@ a..06〔管理会社 c..09〕・mgmt-b@ a..07〔管理会社 c..10〕）と、物件 e..01（120409-00）・
--   e..02（120410-00）・e..03（z0015A01）が c..09、e..04（120411-00）が c..10 の管理であること、点検行 2b84a9bd（120409-00。保守 c..01）。
--   点検行・台はこの中で足して戻す（ほかの試験の足した行には頼らない）。
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

-- ============================================================
-- 0. 試験の点検行と台（所有者で入れる）
--   I1: e..02 外壁補修工事・保守 c..02（台なし）       I0: e..02 デジタルサイネージ点検・保守会社 未登録
--   I2: e..03 消防設備点検・保守 c..01、台 U1（保守 c..01）・U2（保守 c..02）＝台が2台・台ごとに保守会社が違う
--   I3: e..04（mgmt-b の物件）外壁補修工事・保守 c..03
-- ============================================================
INSERT INTO biz.property_inspections (id, property_id, inspection_type_id, maintainer_id) VALUES
  ('a1151115-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000006', 'c0000000-0000-4000-8000-000000000002'),
  ('a1151115-0000-4000-8000-000000000000', 'e0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000004', NULL),
  ('a1151115-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001'),
  ('a1151115-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000004', 'f0000000-0000-4000-8000-000000000006', 'c0000000-0000-4000-8000-000000000003');
INSERT INTO biz.property_units (id, property_id, category_code, sort, unit_code) VALUES
  ('a1151115-0000-4000-8000-0000000000a1', 'e0000000-0000-4000-8000-000000000003', 'fire_inspection', 91, 'T1115-U1'),
  ('a1151115-0000-4000-8000-0000000000a2', 'e0000000-0000-4000-8000-000000000003', 'fire_inspection', 92, 'T1115-U2');
INSERT INTO biz.property_unit_inspections (unit_id, inspection_type_id, maintainer_id) VALUES
  ('a1151115-0000-4000-8000-0000000000a1', 'f0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001'),
  ('a1151115-0000-4000-8000-0000000000a2', 'f0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000002')
ON CONFLICT (unit_id, inspection_type_id) DO UPDATE SET maintainer_id = excluded.maintainer_id;  -- 台を足すと業務システムのトリガーが行を作ることがある

-- ============================================================
-- 1. 管理会社の申請（INSERT）: 自社物件の点検なら通り、受注先・受注先名は DB が点検行（台）の保守会社から決める
-- ============================================================
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000006');
-- 受注先を指定しない（vendor_name も NULL）→ DB が c..02 にし、緊急連絡先は空なので既定を入れる
WITH x AS (
  INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, inspection_type, inspection_start,
                                       status, property_inspection_id, target_month)
  VALUES ('a0000000-0000-4000-8000-000000000006', '120410-00', '', NULL, '外壁補修工事', '2032-01-05',
          'pending', 'a1151115-0000-4000-8000-000000000001', '2032-01-01')
  RETURNING id)
INSERT INTO t_ids SELECT 'm1', id FROM x;
SELECT pg_temp.check('1-1 管理会社の申請: 受注先・受注先名・緊急連絡先を DB が決める',
  (SELECT vendor_id = 'c0000000-0000-4000-8000-000000000002' AND vendor_name = '検証消防設備株式会社'
          AND emergency_contact = '0120-000-002' AND user_id = 'a0000000-0000-4000-8000-000000000006'
     FROM signage.signage_entries WHERE id = (SELECT id FROM t_ids WHERE k = 'm1')));
-- 受注先を正しく指定・緊急連絡先を入れた → 緊急連絡先は上書きしない
WITH x AS (
  INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_id, vendor_name, emergency_contact, inspection_type,
                                       inspection_start, status, property_inspection_id, target_month)
  VALUES ('a0000000-0000-4000-8000-000000000006', '120410-00', '', 'c0000000-0000-4000-8000-000000000002', '検証消防設備株式会社',
          '090-1115-0000', '外壁補修工事', '2032-02-05', 'draft', 'a1151115-0000-4000-8000-000000000001', '2032-02-01')
  RETURNING id)
INSERT INTO t_ids SELECT 'm2', id FROM x;
SELECT pg_temp.check('1-2 緊急連絡先は上書きしない',
  (SELECT emergency_contact = '090-1115-0000' AND vendor_id = 'c0000000-0000-4000-8000-000000000002'
     FROM signage.signage_entries WHERE id = (SELECT id FROM t_ids WHERE k = 'm2')));
-- 台が2台で台ごとに保守会社が違う点検: 台ごとにその台の保守会社になる
WITH x AS (
  INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, inspection_type, inspection_start,
                                       status, property_inspection_id, property_unit_id, target_month)
  VALUES ('a0000000-0000-4000-8000-000000000006', 'z0015A01', '', NULL, '消防設備点検', '2032-01-10',
          'draft', 'a1151115-0000-4000-8000-000000000002', 'a1151115-0000-4000-8000-0000000000a1', '2032-01-01')
  RETURNING id)
INSERT INTO t_ids SELECT 'u1', id FROM x;
WITH x AS (
  INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, inspection_type, inspection_start,
                                       status, property_inspection_id, property_unit_id, target_month)
  VALUES ('a0000000-0000-4000-8000-000000000006', 'z0015A01', '', NULL, '消防設備点検', '2032-01-10',
          'pending', 'a1151115-0000-4000-8000-000000000002', 'a1151115-0000-4000-8000-0000000000a2', '2032-01-01')
  RETURNING id)
INSERT INTO t_ids SELECT 'u2', id FROM x;
SELECT pg_temp.check('1-3 台ごとに台の保守会社（U1 = c..01・U2 = c..02）',
  (SELECT vendor_id = 'c0000000-0000-4000-8000-000000000001' AND vendor_name = '検証エレベーター保守株式会社'
     FROM signage.signage_entries WHERE id = (SELECT id FROM t_ids WHERE k = 'u1'))
  AND (SELECT vendor_id = 'c0000000-0000-4000-8000-000000000002' AND vendor_name = '検証消防設備株式会社'
     FROM signage.signage_entries WHERE id = (SELECT id FROM t_ids WHERE k = 'u2')));

-- ============================================================
-- 2. 管理会社の申請で断るもの
-- ============================================================
SELECT pg_temp.expect_error('2-1 他社（mgmt-b）の物件の点検',
  $q$INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, inspection_type, inspection_start,
                                          status, property_inspection_id, target_month)
     VALUES ('a0000000-0000-4000-8000-000000000006', '120411-00', '', NULL, '外壁補修工事', '2032-01-05',
             'pending', 'a1151115-0000-4000-8000-000000000003', '2032-01-01')$q$, '自社が管理する物件にだけ');
SELECT pg_temp.expect_error('2-2 自社物件のコードで他社物件の点検を名乗る',
  $q$INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, inspection_type, inspection_start,
                                          status, property_inspection_id, target_month)
     VALUES ('a0000000-0000-4000-8000-000000000006', '120410-00', '', NULL, '外壁補修工事', '2032-01-05',
             'pending', 'a1151115-0000-4000-8000-000000000003', '2032-01-01')$q$, '担当外の点検');
SELECT pg_temp.expect_error('2-3 受注先（vendor_id）の偽装',
  $q$INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_id, vendor_name, inspection_type, inspection_start,
                                          status, property_inspection_id, target_month)
     VALUES ('a0000000-0000-4000-8000-000000000006', '120410-00', '', 'c0000000-0000-4000-8000-000000000001', '検証消防設備株式会社',
             '外壁補修工事', '2032-03-05', 'pending', 'a1151115-0000-4000-8000-000000000001', '2032-03-01')$q$, '受注先の保守会社が点検の保守会社と一致しません');
SELECT pg_temp.expect_error('2-4 受注先名（CSV 4列目）の偽装',
  $q$INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, inspection_type, inspection_start,
                                          status, property_inspection_id, target_month)
     VALUES ('a0000000-0000-4000-8000-000000000006', '120410-00', '', '検証管理会社', '外壁補修工事', '2032-03-05',
             'pending', 'a1151115-0000-4000-8000-000000000001', '2032-03-01')$q$, '受注先名が点検の保守会社と一致しません');
SELECT pg_temp.expect_error('2-5 保守会社が未登録の点検',
  $q$INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, inspection_type, inspection_start,
                                          status, property_inspection_id, target_month)
     VALUES ('a0000000-0000-4000-8000-000000000006', '120410-00', '', NULL, 'デジタルサイネージ点検', '2032-01-05',
             'pending', 'a1151115-0000-4000-8000-000000000000', '2032-01-01')$q$,
  'この点検は保守会社が未登録です。業務システムで保守会社を登録してください');
SELECT pg_temp.expect_error('2-6 点検に結び付かない申請（受注先を決められない）',
  $q$INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, inspection_type, inspection_start, status)
     VALUES ('a0000000-0000-4000-8000-000000000006', '120410-00', '', '検証消防設備株式会社', '外壁補修工事', '2032-01-05', 'pending')$q$,
  '点検の行から申請してください');
SELECT pg_temp.expect_error('2-7 他社物件の点検に結び付かない申請',
  $q$INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, inspection_type, inspection_start, status)
     VALUES ('a0000000-0000-4000-8000-000000000006', '120411-00', '', 'x', '外壁補修工事', '2032-01-05', 'pending')$q$,
  '自社が管理する物件にだけ');
SELECT pg_temp.expect_error('2-8 建物追加の申請（開かない）',
  $q$INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, inspection_type, inspection_start,
                                          status, property_request_id)
     VALUES ('a0000000-0000-4000-8000-000000000006', 'REQ-a1151115', '', 'x', '外壁補修工事', '2032-01-05',
             'pending', 'a1151115-0000-4000-8000-0000000000ff')$q$, '建物追加の申請はできません');
SELECT pg_temp.expect_error('2-9 台が2台の点検に台なし',
  $q$INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, inspection_type, inspection_start,
                                          status, property_inspection_id, target_month)
     VALUES ('a0000000-0000-4000-8000-000000000006', 'z0015A01', '', NULL, '消防設備点検', '2032-04-05',
             'pending', 'a1151115-0000-4000-8000-000000000002', '2032-04-01')$q$, '台ごとに申請してください');
SELECT pg_temp.expect_error('2-10 他人の名義（user_id）',
  $q$INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, inspection_type, inspection_start,
                                          status, property_inspection_id, target_month)
     VALUES ('a0000000-0000-4000-8000-000000000002', '120410-00', '', NULL, '外壁補修工事', '2032-05-05',
             'pending', 'a1151115-0000-4000-8000-000000000001', '2032-05-01')$q$, 'row-level security');
SELECT pg_temp.expect_error('2-11 いきなり承認済み',
  $q$INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, inspection_type, inspection_start,
                                          status, property_inspection_id, target_month)
     VALUES ('a0000000-0000-4000-8000-000000000006', '120410-00', '', NULL, '外壁補修工事', '2032-05-05',
             'ready', 'a1151115-0000-4000-8000-000000000001', '2032-05-01')$q$, '承認済みにできるのは管理者のみ');

-- ============================================================
-- 3. 管理会社の UPDATE: 本人の未申請（pending）だけ。受注先名だけの書き換えも決め直しで止まる。取り下げ（DELETE）は開かない
-- ============================================================
SELECT pg_temp.expect_error('3-1 受注先名だけの書き換え',
  format($q$UPDATE signage.signage_entries SET vendor_name = '検証管理会社' WHERE id = %L$q$, (SELECT id FROM t_ids WHERE k = 'm1')),
  '受注先名が点検の保守会社と一致しません');
UPDATE signage.signage_entries SET inspection_start = '2032-01-06', status = 'draft' WHERE id = (SELECT id FROM t_ids WHERE k = 'm1');
SELECT pg_temp.check('3-2 本人の pending を直して申請（draft）できる',
  (SELECT status = 'draft' AND inspection_start = '2032-01-06' AND vendor_id = 'c0000000-0000-4000-8000-000000000002'
     FROM signage.signage_entries WHERE id = (SELECT id FROM t_ids WHERE k = 'm1')));
-- 申請済み（draft）は直接は更新できない（ポリシーが pending だけなので 0 行。修正は portal_update_submitted_entry 経由）
WITH u AS (UPDATE signage.signage_entries SET remarks = 'x' WHERE id = (SELECT id FROM t_ids WHERE k = 'm2') RETURNING 1)
SELECT pg_temp.check('3-3 申請済み（draft）の直接の更新は 0 行', (SELECT count(*) FROM u) = 0);
-- 取り下げ（DELETE）: 管理会社の DELETE のポリシーは無いので 0 行（行は残る）
WITH d AS (DELETE FROM signage.signage_entries WHERE id = (SELECT id FROM t_ids WHERE k = 'u2') RETURNING 1)
SELECT pg_temp.check('3-4 取り下げ（DELETE）は 0 行', (SELECT count(*) FROM d) = 0);
-- 保守会社（user@）の未申請の行（120409-00 = 自社物件）も UPDATE は 0 行
WITH u AS (UPDATE signage.signage_entries SET remarks = 't1115' WHERE id = 'a2000000-0000-4000-8000-000000000001' RETURNING 1)
SELECT pg_temp.check('3-5 保守会社の未申請の行は UPDATE できない（0 行）', (SELECT count(*) FROM u) = 0);

-- 他社の管理会社（mgmt-b）の申請（120411-00）: mgmt-b は自社物件なので入れられる。mgmt@ は UPDATE も修正もできない
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000007');
WITH x AS (
  INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, inspection_type, inspection_start,
                                       status, property_inspection_id, target_month)
  VALUES ('a0000000-0000-4000-8000-000000000007', '120411-00', '', NULL, '外壁補修工事', '2032-01-05',
          'pending', 'a1151115-0000-4000-8000-000000000003', '2032-01-01')
  RETURNING id)
INSERT INTO t_ids SELECT 'b1', id FROM x;
WITH x AS (
  INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, inspection_type, inspection_start,
                                       status, property_inspection_id, target_month)
  VALUES ('a0000000-0000-4000-8000-000000000007', '120411-00', '', NULL, '外壁補修工事', '2032-02-05',
          'draft', 'a1151115-0000-4000-8000-000000000003', '2032-02-01')
  RETURNING id)
INSERT INTO t_ids SELECT 'b2', id FROM x;
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000006');
WITH u AS (UPDATE signage.signage_entries SET remarks = 't1115' WHERE id = (SELECT id FROM t_ids WHERE k = 'b1') RETURNING 1)
SELECT pg_temp.check('3-6a mgmt@ は mgmt-b の未申請の行を UPDATE できない（0 行）', (SELECT count(*) FROM u) = 0);
SELECT pg_temp.expect_error('3-6b mgmt@ は mgmt-b の申請済みを修正できない',
  format($q$SELECT signage.portal_update_submitted_entry(%L, '{"remarks": "x"}'::jsonb)$q$, (SELECT id FROM t_ids WHERE k = 'b2')),
  'この申請を修正する権限がありません');

-- 他社の管理会社（mgmt-b）は mgmt@ の申請を直せない
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000007');
WITH u AS (UPDATE signage.signage_entries SET remarks = 't1115' WHERE id = (SELECT id FROM t_ids WHERE k = 'u2') RETURNING 1)
SELECT pg_temp.check('3-6 mgmt-b は mgmt@ の未申請の行を UPDATE できない（0 行）', (SELECT count(*) FROM u) = 0);
SELECT pg_temp.expect_error('3-7 mgmt-b は mgmt@ の申請済みを修正できない',
  format($q$SELECT signage.portal_update_submitted_entry(%L, '{"remarks": "x"}'::jsonb)$q$, (SELECT id FROM t_ids WHERE k = 'm2')),
  'この申請を修正する権限がありません');
SELECT pg_temp.expect_error('3-8 mgmt-b は mgmt@ の申請済みを開けない',
  format($q$SELECT signage.portal_entry_for_edit(%L)$q$, (SELECT id FROM t_ids WHERE k = 'm2')), 'この申請を修正する権限がありません');

SELECT pg_temp.as_owner();
SELECT pg_temp.check('3-9 行はそのまま（取り下げ・他社の更新が効いていない）',
  (SELECT remarks IS DISTINCT FROM 't1115' FROM signage.signage_entries WHERE id = (SELECT id FROM t_ids WHERE k = 'u2'))
  AND (SELECT remarks IS DISTINCT FROM 't1115' FROM signage.signage_entries WHERE id = 'a2000000-0000-4000-8000-000000000001')
  AND (SELECT remarks IS DISTINCT FROM 't1115' AND vendor_id = 'c0000000-0000-4000-8000-000000000003'
         FROM signage.signage_entries WHERE id = (SELECT id FROM t_ids WHERE k = 'b1')));

-- ============================================================
-- 4. 申請済み（draft）の修正（portal_update_submitted_entry）: 管理会社は自社物件の自分の申請だけ。台を付け替えると受注先も決め直す
-- ============================================================
-- 保守会社（user@）の申請済み（自社物件 120409-00）
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
WITH x AS (
  INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, inspection_type, inspection_start,
                                       status, property_inspection_id, vendor_id, target_month)
  VALUES ('a0000000-0000-4000-8000-000000000002', '120409-00', '', '検証エレベーター保守株式会社', 'エレベーター定期点検', '2032-06-05',
          'draft', '2b84a9bd-b98e-4332-bd19-2973387bc13c', 'c0000000-0000-4000-8000-000000000001', '2032-06-01')
  RETURNING id)
INSERT INTO t_ids SELECT 'v1', id FROM x;

SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000006');
SELECT pg_temp.expect_error('4-1 保守会社の申請を管理会社が修正',
  format($q$SELECT signage.portal_update_submitted_entry(%L, '{"remarks": "x"}'::jsonb)$q$, (SELECT id FROM t_ids WHERE k = 'v1')),
  'この申請を修正する権限がありません');
SELECT pg_temp.expect_error('4-2 保守会社の申請を管理会社が開く',
  format($q$SELECT signage.portal_entry_for_edit(%L)$q$, (SELECT id FROM t_ids WHERE k = 'v1')), 'この申請を修正する権限がありません');
SELECT pg_temp.check('4-3 自分の申請済みを開ける',
  (signage.portal_entry_for_edit((SELECT id FROM t_ids WHERE k = 'm2'))).id = (SELECT id FROM t_ids WHERE k = 'm2'));
SELECT pg_temp.check('4-4 自分の申請済みを修正できる（受注先はそのまま）',
  (SELECT r.remarks = 't1115-edit' AND r.vendor_id = 'c0000000-0000-4000-8000-000000000002' AND r.emergency_contact = '090-1115-0000'
     FROM signage.portal_update_submitted_entry((SELECT id FROM t_ids WHERE k = 'm2'), '{"remarks": "t1115-edit"}'::jsonb) r));
-- レビュー指摘: 受注先になった保守会社（user@ c..01）は、管理会社の申請（u1。受注先 c..01）を開けず直せない。一覧では by_management が付く
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
SELECT pg_temp.expect_error('4-6 管理会社の申請を受注先の保守会社が開く',
  format($q$SELECT signage.portal_entry_for_edit(%L)$q$, (SELECT id FROM t_ids WHERE k = 'u1')), 'この申請を修正する権限がありません');
SELECT pg_temp.expect_error('4-7 管理会社の申請を受注先の保守会社が修正',
  format($q$SELECT signage.portal_update_submitted_entry(%L, '{"remarks": "vendor edited"}'::jsonb)$q$, (SELECT id FROM t_ids WHERE k = 'u1')),
  'この申請を修正する権限がありません');
SELECT pg_temp.check('4-8 portal_entries の by_management: 管理会社の申請は true、保守会社の申請は false',
  (SELECT bool_and(CASE WHEN p.id = (SELECT id FROM t_ids WHERE k = 'u1') THEN p.by_management
                        ELSE p.by_management IS FALSE END)
     FROM signage.portal_entries() p WHERE p.id IN (SELECT id FROM t_ids WHERE k IN ('u1', 'v1')))
  AND (SELECT count(*) FROM signage.portal_entries() p WHERE p.id IN (SELECT id FROM t_ids WHERE k IN ('u1', 'v1'))) = 2);
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000006');
-- 緊急連絡先は上書きしない決定なので、付け替え前の会社の既定（c..01 の 0120-000-001）のまま残る（画面が新しい会社の連絡先を送る）
SELECT pg_temp.check('4-5 台を付け替えると受注先も台の保守会社に（U1 c..01 → U2 c..02）。緊急連絡先はそのまま',
  (SELECT r.property_unit_id = 'a1151115-0000-4000-8000-0000000000a2' AND r.vendor_id = 'c0000000-0000-4000-8000-000000000002'
          AND r.vendor_name = '検証消防設備株式会社' AND r.emergency_contact = '0120-000-001'
     FROM signage.portal_update_submitted_entry((SELECT id FROM t_ids WHERE k = 'u1'),
            '{"property_unit_id": "a1151115-0000-4000-8000-0000000000a2"}'::jsonb) r));

-- ============================================================
-- 5. 完了連絡は管理会社には開かない（inspection_writable は変えていない）
-- ============================================================
SELECT pg_temp.expect_error('5-1 完了連絡',
  $q$SELECT signage.portal_mark_completed_any_month('a1151115-0000-4000-8000-000000000001', '2032-01-01', NULL)$q$,
  'この点検の完了連絡をする権限がありません');
SELECT pg_temp.check('5-2 inspection_writable は管理会社には偽のまま',
  NOT signage.inspection_writable('a1151115-0000-4000-8000-000000000001'));

-- ============================================================
-- 6. 報告書: 自社物件の点検だけ置ける・登録できる。自分で上げた版は直せる。他社・保守会社の版は直せない
-- ============================================================
INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES
  ('inspection-reports', 'a1151115-0000-4000-8000-000000000001/t1115-m.pdf', 'a0000000-0000-4000-8000-000000000006');
SELECT pg_temp.as_owner();
SELECT pg_temp.check('6-1 自社物件の点検のフォルダに PDF を置ける（上の INSERT が管理会社の権限で通った）',
  EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'inspection-reports'
            AND name = 'a1151115-0000-4000-8000-000000000001/t1115-m.pdf'));
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000006');
SELECT pg_temp.expect_error('6-2 他社物件の点検のフォルダには置けない',
  $q$INSERT INTO storage.objects (bucket_id, name, owner_id)
     VALUES ('inspection-reports', 'a1151115-0000-4000-8000-000000000003/t1115-x.pdf', 'a0000000-0000-4000-8000-000000000006')$q$,
  'row-level security');
INSERT INTO t_ids SELECT 'r1', (signage.portal_register_report('a1151115-0000-4000-8000-000000000001', '2032-01-01', '2032-01-10',
  '20320110_試験_1115.pdf', 'a1151115-0000-4000-8000-000000000001/t1115-m.pdf', 'm.pdf', 10, 'hash-1115m')).id;
SELECT pg_temp.as_owner();
SELECT pg_temp.check('6-3 管理会社が登録した報告書の保守会社は点検行の保守会社',
  (SELECT vendor_id = 'c0000000-0000-4000-8000-000000000002' AND uploaded_by = 'a0000000-0000-4000-8000-000000000006'
          AND status = 'submitted'
     FROM signage.signage_inspection_reports WHERE id = (SELECT id FROM t_ids WHERE k = 'r1')));
-- 他社物件の点検へは登録できない（ファイルは所有者で置いておく）
INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES
  ('inspection-reports', 'a1151115-0000-4000-8000-000000000003/t1115-y.pdf', 'a0000000-0000-4000-8000-000000000006');
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000006');
SELECT pg_temp.expect_error('6-4 他社物件の点検の報告書登録',
  $q$SELECT signage.portal_register_report('a1151115-0000-4000-8000-000000000003', '2032-01-01', '2032-01-10',
       '20320110_試験_1115y.pdf', 'a1151115-0000-4000-8000-000000000003/t1115-y.pdf', 'y.pdf', 10, 'hash-1115y')$q$,
  'この点検の報告書を登録する権限がありません');
SELECT pg_temp.check('6-5 自分で上げた版を直せる',
  (signage.portal_update_report((SELECT id FROM t_ids WHERE k = 'r1'), 'edit', NULL, NULL, NULL, 't1115 メモ')).note = 't1115 メモ');
SELECT pg_temp.expect_error('6-6 復元は管理者だけ（管理会社も同じ）',
  format($q$SELECT signage.portal_update_report(%L, 'restore')$q$, (SELECT id FROM t_ids WHERE k = 'r1')), '管理者だけ');

-- 保守会社（user@）が上げた版（自社物件 120409-00 の点検）は管理会社は直せない
INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES
  ('inspection-reports', '2b84a9bd-b98e-4332-bd19-2973387bc13c/t1115-v.pdf', 'a0000000-0000-4000-8000-000000000002');
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
INSERT INTO t_ids SELECT 'rv', (signage.portal_register_report('2b84a9bd-b98e-4332-bd19-2973387bc13c', '2032-01-01', '2032-01-11',
  '20320111_試験_1115v.pdf', '2b84a9bd-b98e-4332-bd19-2973387bc13c/t1115-v.pdf', 'v.pdf', 10, 'hash-1115v')).id;
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000006');
SELECT pg_temp.expect_error('6-7 保守会社の版を管理会社が直す',
  format($q$SELECT signage.portal_update_report(%L, 'edit', NULL, NULL, NULL, 'x')$q$, (SELECT id FROM t_ids WHERE k = 'rv')),
  'この報告書を変更する権限がありません');
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000007');
SELECT pg_temp.expect_error('6-8 mgmt-b は mgmt@ の版を直せない',
  format($q$SELECT signage.portal_update_report(%L, 'delete')$q$, (SELECT id FROM t_ids WHERE k = 'r1')),
  'この報告書を変更する権限がありません');
-- 受領後は管理会社も直せない・提出のうちは削除できる
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000006');
SELECT pg_temp.check('6-9 提出のうちは自分の版を削除できる',
  (signage.portal_update_report((SELECT id FROM t_ids WHERE k = 'r1'), 'delete')).status = 'deleted');

-- ============================================================
-- 6b. 報告書の版を触れる人（1115 の残り）: 保守会社は保守会社のアカウントが上げた自社の版だけ。管理会社が上げた版は
--     上げた管理会社（自社）の管理会社アカウントと管理者だけ。画面の計算列 can_modify（inspection_report_modifiable）も同じ
-- ============================================================
SELECT pg_temp.as_owner();
INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES
  ('inspection-reports', '2b84a9bd-b98e-4332-bd19-2973387bc13c/t1115-m2.pdf', 'a0000000-0000-4000-8000-000000000006'),
  ('inspection-reports', '2b84a9bd-b98e-4332-bd19-2973387bc13c/t1115-a.pdf', 'a0000000-0000-4000-8000-000000000001');
-- 管理会社（mgmt@）が保守 c..01 の点検（自社物件 120409-00）に上げた版。vendor_id は c..01 になる
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000006');
INSERT INTO t_ids SELECT 'rm2', (signage.portal_register_report('2b84a9bd-b98e-4332-bd19-2973387bc13c', '2032-01-01', '2032-01-12',
  '20320112_試験_1115m2.pdf', '2b84a9bd-b98e-4332-bd19-2973387bc13c/t1115-m2.pdf', 'm2.pdf', 10, 'hash-1115m2')).id;
-- 管理者の代理提出の版（同じ点検。vendor_id は c..01）
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000001');
INSERT INTO t_ids SELECT 'ra', (signage.portal_register_report('2b84a9bd-b98e-4332-bd19-2973387bc13c', '2032-01-01', '2032-01-13',
  '20320113_試験_1115a.pdf', '2b84a9bd-b98e-4332-bd19-2973387bc13c/t1115-a.pdf', 'a.pdf', 10, 'hash-1115a')).id;
SELECT pg_temp.as_owner();
SELECT pg_temp.check('6b-0 管理会社の版・管理者の版とも vendor_id は点検の保守会社 c..01',
  (SELECT bool_and(vendor_id = 'c0000000-0000-4000-8000-000000000001') FROM signage.signage_inspection_reports
    WHERE id IN (SELECT id FROM t_ids WHERE k IN ('rm2', 'ra'))));

SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
SELECT pg_temp.expect_error('6b-1 保守会社（c..01）は管理会社が上げた自社の版を直せない',
  format($q$SELECT signage.portal_update_report(%L, 'edit', NULL, NULL, NULL, 'x')$q$, (SELECT id FROM t_ids WHERE k = 'rm2')),
  'この報告書を変更する権限がありません');
SELECT pg_temp.expect_error('6b-2 保守会社（c..01）は管理会社が上げた自社の版を削除できない',
  format($q$SELECT signage.portal_update_report(%L, 'delete')$q$, (SELECT id FROM t_ids WHERE k = 'rm2')),
  'この報告書を変更する権限がありません');
SELECT pg_temp.expect_error('6b-3 保守会社は管理者の代理提出の版も直せない',
  format($q$SELECT signage.portal_update_report(%L, 'delete')$q$, (SELECT id FROM t_ids WHERE k = 'ra')),
  'この報告書を変更する権限がありません');
SELECT pg_temp.check('6b-4 保守会社は自分たちが上げた版は今までどおり直せる',
  (signage.portal_update_report((SELECT id FROM t_ids WHERE k = 'rv'), 'edit', NULL, NULL, NULL, 't1115 v')).note = 't1115 v');
SELECT pg_temp.check('6b-5 計算列 can_modify（保守会社）: 自分たちの版だけ真',
  (SELECT bool_and(signage.inspection_report_modifiable(r) = (r.id = (SELECT id FROM t_ids WHERE k = 'rv')))
     FROM signage.signage_inspection_reports r WHERE r.id IN (SELECT id FROM t_ids WHERE k IN ('rv', 'rm2', 'ra'))));

SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000006');
SELECT pg_temp.check('6b-6 計算列 can_modify（管理会社）: 自社の管理会社が上げた版だけ真',
  (SELECT bool_and(signage.inspection_report_modifiable(r) = (r.id = (SELECT id FROM t_ids WHERE k = 'rm2')))
     FROM signage.signage_inspection_reports r WHERE r.id IN (SELECT id FROM t_ids WHERE k IN ('rv', 'rm2', 'ra'))));
SELECT pg_temp.expect_error('6b-7 管理会社は管理者の代理提出の版を直せない',
  format($q$SELECT signage.portal_update_report(%L, 'edit', NULL, NULL, NULL, 'x')$q$, (SELECT id FROM t_ids WHERE k = 'ra')),
  'この報告書を変更する権限がありません');

-- 同じ管理会社の別のアカウント: mgmt-b を一時的に c..09 の所属にする（最後に ROLLBACK で戻る）
SELECT pg_temp.as_owner();
UPDATE signage.signage_profiles SET management_company_id = 'c0000000-0000-4000-8000-000000000009'
 WHERE id = 'a0000000-0000-4000-8000-000000000007';
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000007');
SELECT pg_temp.check('6b-8 同じ管理会社の別のアカウントも、管理会社が上げた版を直せる',
  (signage.portal_update_report((SELECT id FROM t_ids WHERE k = 'rm2'), 'edit', NULL, NULL, NULL, 't1115 m2')).note = 't1115 m2');
SELECT pg_temp.as_owner();
UPDATE signage.signage_profiles SET management_company_id = 'c0000000-0000-4000-8000-000000000010'
 WHERE id = 'a0000000-0000-4000-8000-000000000007';

SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000001');
SELECT pg_temp.check('6b-9 管理者は今までどおり全部の版を直せる',
  (SELECT bool_and(signage.inspection_report_modifiable(r)) FROM signage.signage_inspection_reports r
    WHERE r.id IN (SELECT id FROM t_ids WHERE k IN ('rv', 'rm2', 'ra')))
  AND (signage.portal_update_report((SELECT id FROM t_ids WHERE k = 'ra'), 'edit', NULL, NULL, NULL, 't1115 a')).note = 't1115 a');
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000006');
SELECT pg_temp.check('6b-10 管理会社は自社の版を提出のうちに削除できる',
  (signage.portal_update_report((SELECT id FROM t_ids WHERE k = 'rm2'), 'delete')).status = 'deleted');

-- ============================================================
-- 6c. 報告書に結び付ける申請（entry_id）は、その点検・物件の申請だけ（管理会社・保守会社・管理者とも）
-- ============================================================
SELECT pg_temp.as_owner();
-- 点検は合っているが物件が違う申請（トリガーを通らない所有者の書き込みで作る食い違い）
WITH x AS (
  INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, inspection_type, inspection_start,
                                       status, property_inspection_id, target_month)
  VALUES ('a0000000-0000-4000-8000-000000000001', '120409-00', '', '検証消防設備株式会社', '外壁補修工事', '2032-04-05',
          'pending', 'a1151115-0000-4000-8000-000000000001', '2032-04-01')
  RETURNING id)
INSERT INTO t_ids SELECT 'xp1', id FROM x;
WITH x AS (
  INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, inspection_type, inspection_start,
                                       status, property_inspection_id, target_month)
  SELECT 'a0000000-0000-4000-8000-000000000001', '120410-00', '', vendor_name, inspection_type, '2032-04-05',
         'pending', '2b84a9bd-b98e-4332-bd19-2973387bc13c', '2032-04-01'
    FROM signage.signage_entries WHERE id = (SELECT id FROM t_ids WHERE k = 'm1')
  RETURNING id)
INSERT INTO t_ids SELECT 'xp2', id FROM x;
INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES
  ('inspection-reports', 'a1151115-0000-4000-8000-000000000001/t1115-e1.pdf', 'a0000000-0000-4000-8000-000000000006'),
  ('inspection-reports', 'a1151115-0000-4000-8000-000000000001/t1115-e2.pdf', 'a0000000-0000-4000-8000-000000000001'),
  ('inspection-reports', '2b84a9bd-b98e-4332-bd19-2973387bc13c/t1115-e3.pdf', 'a0000000-0000-4000-8000-000000000002');
SELECT pg_temp.check('6c-0 申請 m1・u1 が残っていて、m1 は点検 I1・物件 120410-00 の申請',
  (SELECT property_inspection_id = 'a1151115-0000-4000-8000-000000000001' AND property_code = '120410-00'
     FROM signage.signage_entries WHERE id = (SELECT id FROM t_ids WHERE k = 'm1'))
  AND EXISTS (SELECT 1 FROM signage.signage_entries WHERE id = (SELECT id FROM t_ids WHERE k = 'u1')));

SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000006');
SELECT pg_temp.expect_error('6c-1 管理会社: 別の点検の申請は結び付けられない',
  format($q$SELECT signage.portal_register_report('a1151115-0000-4000-8000-000000000001', '2032-01-01', '2032-01-14',
       '20320114_試験_1115e1.pdf', 'a1151115-0000-4000-8000-000000000001/t1115-e1.pdf', 'e1.pdf', 10, 'hash-1115e1', %L)$q$,
         (SELECT id FROM t_ids WHERE k = 'u1')), '申請と点検が一致しません');
SELECT pg_temp.expect_error('6c-2 管理会社: 点検は合っていても物件が違う申請は結び付けられない',
  format($q$SELECT signage.portal_register_report('a1151115-0000-4000-8000-000000000001', '2032-01-01', '2032-01-14',
       '20320114_試験_1115e1.pdf', 'a1151115-0000-4000-8000-000000000001/t1115-e1.pdf', 'e1.pdf', 10, 'hash-1115e1', %L)$q$,
         (SELECT id FROM t_ids WHERE k = 'xp1')), '申請と点検が一致しません');
SELECT pg_temp.check('6c-3 管理会社: その点検・物件の申請なら結び付けられる',
  (signage.portal_register_report('a1151115-0000-4000-8000-000000000001', '2032-01-01', '2032-01-14',
     '20320114_試験_1115e1.pdf', 'a1151115-0000-4000-8000-000000000001/t1115-e1.pdf', 'e1.pdf', 10, 'hash-1115e1',
     (SELECT id FROM t_ids WHERE k = 'm1'))).entry_id = (SELECT id FROM t_ids WHERE k = 'm1'));

SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000001');
SELECT pg_temp.expect_error('6c-4 管理者: 別の点検の申請は結び付けられない',
  format($q$SELECT signage.portal_register_report('a1151115-0000-4000-8000-000000000001', '2032-01-01', '2032-01-15',
       '20320115_試験_1115e2.pdf', 'a1151115-0000-4000-8000-000000000001/t1115-e2.pdf', 'e2.pdf', 10, 'hash-1115e2', %L)$q$,
         (SELECT id FROM t_ids WHERE k = 'u1')), '申請と点検が一致しません');
SELECT pg_temp.expect_error('6c-5 管理者: 物件が違う申請は結び付けられない',
  format($q$SELECT signage.portal_register_report('a1151115-0000-4000-8000-000000000001', '2032-01-01', '2032-01-15',
       '20320115_試験_1115e2.pdf', 'a1151115-0000-4000-8000-000000000001/t1115-e2.pdf', 'e2.pdf', 10, 'hash-1115e2', %L)$q$,
         (SELECT id FROM t_ids WHERE k = 'xp1')), '申請と点検が一致しません');
SELECT pg_temp.check('6c-6 管理者: その点検・物件の申請なら結び付けられる',
  (signage.portal_register_report('a1151115-0000-4000-8000-000000000001', '2032-01-01', '2032-01-15',
     '20320115_試験_1115e2.pdf', 'a1151115-0000-4000-8000-000000000001/t1115-e2.pdf', 'e2.pdf', 10, 'hash-1115e2',
     (SELECT id FROM t_ids WHERE k = 'm1'))).entry_id = (SELECT id FROM t_ids WHERE k = 'm1'));

SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
SELECT pg_temp.expect_error('6c-7 保守会社: 別の点検の申請は結び付けられない',
  format($q$SELECT signage.portal_register_report('2b84a9bd-b98e-4332-bd19-2973387bc13c', '2032-01-01', '2032-01-16',
       '20320116_試験_1115e3.pdf', '2b84a9bd-b98e-4332-bd19-2973387bc13c/t1115-e3.pdf', 'e3.pdf', 10, 'hash-1115e3', %L)$q$,
         (SELECT id FROM t_ids WHERE k = 'm1')), '申請と点検が一致しません');
SELECT pg_temp.expect_error('6c-8 保守会社: 点検は合っていても物件が違う申請は結び付けられない',
  format($q$SELECT signage.portal_register_report('2b84a9bd-b98e-4332-bd19-2973387bc13c', '2032-01-01', '2032-01-16',
       '20320116_試験_1115e3.pdf', '2b84a9bd-b98e-4332-bd19-2973387bc13c/t1115-e3.pdf', 'e3.pdf', 10, 'hash-1115e3', %L)$q$,
         (SELECT id FROM t_ids WHERE k = 'xp2')), '申請と点検が一致しません');
SELECT pg_temp.as_owner();
WITH x AS (
  INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, inspection_type, inspection_start,
                                       status, property_inspection_id, target_month)
  SELECT 'a0000000-0000-4000-8000-000000000002', '120409-00', '', vendor_name, inspection_type, '2032-04-05',
         'pending', '2b84a9bd-b98e-4332-bd19-2973387bc13c', '2032-04-01'
    FROM signage.signage_entries WHERE id = (SELECT id FROM t_ids WHERE k = 'm1')
  RETURNING id)
INSERT INTO t_ids SELECT 'xv', id FROM x;
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
SELECT pg_temp.check('6c-9 保守会社: その点検・物件の申請なら結び付けられる',
  (signage.portal_register_report('2b84a9bd-b98e-4332-bd19-2973387bc13c', '2032-01-01', '2032-01-16',
     '20320116_試験_1115e3.pdf', '2b84a9bd-b98e-4332-bd19-2973387bc13c/t1115-e3.pdf', 'e3.pdf', 10, 'hash-1115e3',
     (SELECT id FROM t_ids WHERE k = 'xv'))).entry_id = (SELECT id FROM t_ids WHERE k = 'xv'));
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000006');  -- 7 は管理会社（mgmt@）として続ける

-- ============================================================
-- 7. 詳細設定の貼紙画像: 管理会社も自分の uid のフォルダだけ置ける
-- ============================================================
INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES
  ('poster-images', 'a0000000-0000-4000-8000-000000000006/t1115-own.png', 'a0000000-0000-4000-8000-000000000006');
SELECT pg_temp.expect_error('7-1 他人の uid のフォルダ',
  $q$INSERT INTO storage.objects (bucket_id, name, owner_id)
     VALUES ('poster-images', 'a0000000-0000-4000-8000-000000000002/t1115-x.png', 'a0000000-0000-4000-8000-000000000006')$q$,
  'row-level security');
SELECT pg_temp.expect_error('7-2 templates のフォルダ（管理者だけ）',
  $q$INSERT INTO storage.objects (bucket_id, name, owner_id)
     VALUES ('poster-images', 'templates/t1115-x.png', 'a0000000-0000-4000-8000-000000000006')$q$, 'row-level security');
-- レビュー指摘: 自分の uid の画像は、申請で使われていなければ消せる（Storage API の削除は SELECT・DELETE の両方のポリシーで見る。
-- 実際の削除は API で確かめた。ここでは判定とポリシーを見る）
SELECT pg_temp.check('7-3 自分の uid の使われていない画像は消せる・見える',
  signage.mgmt_poster_object_deletable('a0000000-0000-4000-8000-000000000006/t1115-own.png')
  AND EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'poster-images' AND name = 'a0000000-0000-4000-8000-000000000006/t1115-own.png'));
SELECT pg_temp.check('7-4 他人の uid・.. を含む名前は消せない',
  NOT signage.mgmt_poster_object_deletable('a0000000-0000-4000-8000-000000000002/t1115-x.png')
  AND NOT signage.mgmt_poster_object_deletable('a0000000-0000-4000-8000-000000000006/../a0000000-0000-4000-8000-000000000002/x.png'));
SELECT pg_temp.as_owner();
UPDATE signage.signage_entries SET poster_image = 'http://127.0.0.1:55321/storage/v1/object/public/poster-images/a0000000-0000-4000-8000-000000000006/t1115-own.png?t=1'
 WHERE id = (SELECT id FROM t_ids WHERE k = 'm1');
SELECT pg_temp.check('7-5 前提: 申請 m1 がその画像を使っている',
  EXISTS (SELECT 1 FROM signage.signage_entries WHERE id = (SELECT id FROM t_ids WHERE k = 'm1') AND poster_image LIKE '%/t1115-own.png?t=1'));
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000006');
SELECT pg_temp.check('7-5 申請で使われている画像は消せない',
  NOT signage.mgmt_poster_object_deletable('a0000000-0000-4000-8000-000000000006/t1115-own.png'));
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000007');
SELECT pg_temp.check('7-6 他社の管理会社は消せない・見えない',
  NOT signage.mgmt_poster_object_deletable('a0000000-0000-4000-8000-000000000006/t1115-own.png')
  AND NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'poster-images' AND name = 'a0000000-0000-4000-8000-000000000006/t1115-own.png'));
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000006');

-- ============================================================
-- 8. 一括入力テンプレート（bulk_template_info）: 管理会社は自社物件の点検。保守会社を渡せばその会社の分
-- ============================================================
DO $$
DECLARE r jsonb;
BEGIN
  r := signage.bulk_template_info(NULL);
  IF r->>'short_name' IS DISTINCT FROM '検証管理会社' THEN RAISE EXCEPTION 'NG 8-1 short_name: %', r; END IF;
  IF NOT (r->'inspection_ids') @> '["a1151115-0000-4000-8000-000000000001", "a1151115-0000-4000-8000-000000000000", "a1151115-0000-4000-8000-000000000002"]'::jsonb
     OR (r->'inspection_ids') @> '["a1151115-0000-4000-8000-000000000003"]'::jsonb THEN
    RAISE EXCEPTION 'NG 8-1 点検: %', r;
  END IF;
  RAISE NOTICE 'ok 8-1 管理会社・保守会社なし: 自社物件の全点検（他社物件は入らない）・略称は自社';
  r := signage.bulk_template_info('c0000000-0000-4000-8000-000000000002');
  IF r->>'short_name' IS DISTINCT FROM '検証消防' THEN RAISE EXCEPTION 'NG 8-2 short_name: %', r; END IF;
  -- I1（点検行が c..02）と I2（台 U2 が c..02）は入り、I0（未登録）は入らない
  IF NOT (r->'inspection_ids') @> '["a1151115-0000-4000-8000-000000000001", "a1151115-0000-4000-8000-000000000002"]'::jsonb
     OR (r->'inspection_ids') @> '["a1151115-0000-4000-8000-000000000000"]'::jsonb THEN
    RAISE EXCEPTION 'NG 8-2 点検: %', r;
  END IF;
  RAISE NOTICE 'ok 8-2 管理会社・保守会社あり: その会社の点検（台の保守会社を含む）';
  -- レビュー指摘: 自社物件の点検に出てこない会社（c..10 は他社の管理会社）の略称は返さない
  r := signage.bulk_template_info('c0000000-0000-4000-8000-000000000010');
  IF r->>'short_name' IS NOT NULL OR jsonb_array_length(r->'inspection_ids') <> 0 THEN RAISE EXCEPTION 'NG 8-3 c..10: %', r; END IF;
  RAISE NOTICE 'ok 8-3 自社物件の点検に出てこない会社の略称は返さない';
END $$;

-- ============================================================
-- 9. 保守会社・管理者の挙動は変わらない
-- ============================================================
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
SELECT pg_temp.expect_error('9-1 保守会社: 他社の台（U2 = c..02）',
  $q$INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, inspection_type, inspection_start,
                                          status, property_inspection_id, property_unit_id, vendor_id, target_month)
     VALUES ('a0000000-0000-4000-8000-000000000002', 'z0015A01', '', '検証エレベーター保守株式会社', '消防設備点検', '2032-07-10',
             'draft', 'a1151115-0000-4000-8000-000000000002', 'a1151115-0000-4000-8000-0000000000a2',
             'c0000000-0000-4000-8000-000000000001', '2032-07-01')$q$, '担当外の台');
SELECT pg_temp.expect_error('9-2 保守会社: 他社を保守会社に指定',
  $q$INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, inspection_type, inspection_start,
                                          status, property_inspection_id, vendor_id, target_month)
     VALUES ('a0000000-0000-4000-8000-000000000002', '120409-00', '', 'x', 'エレベーター定期点検', '2032-07-05',
             'draft', '2b84a9bd-b98e-4332-bd19-2973387bc13c', 'c0000000-0000-4000-8000-000000000003', '2032-07-01')$q$,
  '保守会社は自社のみ指定できます');
WITH x AS (
  INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, emergency_contact, inspection_type, inspection_start,
                                       status, property_inspection_id, property_unit_id, vendor_id, target_month)
  VALUES ('a0000000-0000-4000-8000-000000000002', 'z0015A01', '', '保守会社が入れた名前', NULL, '消防設備点検', '2032-07-10',
          'draft', 'a1151115-0000-4000-8000-000000000002', 'a1151115-0000-4000-8000-0000000000a1',
          'c0000000-0000-4000-8000-000000000001', '2032-07-01')
  RETURNING id)
INSERT INTO t_ids SELECT 'v2', id FROM x;
SELECT pg_temp.check('9-3 保守会社: 自社の台に申請でき、受注先名・緊急連絡先は画面の値のまま（DB は埋めない）',
  (SELECT vendor_name = '保守会社が入れた名前' AND emergency_contact IS NULL
     FROM signage.signage_entries WHERE id = (SELECT id FROM t_ids WHERE k = 'v2')));
SELECT pg_temp.check('9-4 保守会社: 自社の申請済みは今までどおり修正できる',
  (signage.portal_update_submitted_entry((SELECT id FROM t_ids WHERE k = 'v1'), '{"remarks": "t1115-v"}'::jsonb)).remarks = 't1115-v');
SELECT pg_temp.expect_error('9-5 保守会社: 管理会社物件でも自社担当外の点検は不可（I1 = c..02）',
  $q$INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, inspection_type, inspection_start,
                                          status, property_inspection_id, target_month)
     VALUES ('a0000000-0000-4000-8000-000000000002', '120410-00', '', 'x', '外壁補修工事', '2032-07-05',
             'draft', 'a1151115-0000-4000-8000-000000000001', '2032-07-01')$q$, '担当外の点検');
SELECT pg_temp.check('9-6 保守会社: bulk_template_info は今までどおり自社の点検（引数は見ない）',
  (signage.bulk_template_info('c0000000-0000-4000-8000-000000000002'))->>'short_name' = '検証EV');

SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000001');
WITH x AS (
  INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, inspection_type, inspection_start, status)
  VALUES ('a0000000-0000-4000-8000-000000000001', '120411-00', '', '管理者が入れた名前', '外壁補修工事', '2032-08-05', 'ready')
  RETURNING id)
INSERT INTO t_ids SELECT 'a1', id FROM x;
SELECT pg_temp.check('9-7 管理者: 点検に結び付かない申請・承認済みで入れられる（今までどおり）',
  (SELECT vendor_name = '管理者が入れた名前' AND status = 'ready' FROM signage.signage_entries WHERE id = (SELECT id FROM t_ids WHERE k = 'a1')));
SELECT pg_temp.check('9-8 管理者: bulk_template_info(NULL) は空のまま',
  signage.bulk_template_info(NULL) = '{"short_name": null, "inspection_ids": []}'::jsonb);
-- 管理者の代理申請（受注先 c..01）は、今までどおり同じ保守会社のアカウントが直せる（レビュー指摘で閉じたのは管理会社の申請だけ）
WITH x AS (
  INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, inspection_type, inspection_start,
                                       status, property_inspection_id, vendor_id, target_month)
  VALUES ('a0000000-0000-4000-8000-000000000001', '120409-00', '', '検証エレベーター保守株式会社', 'エレベーター定期点検', '2032-09-05',
          'draft', '2b84a9bd-b98e-4332-bd19-2973387bc13c', 'c0000000-0000-4000-8000-000000000001', '2032-09-01')
  RETURNING id)
INSERT INTO t_ids SELECT 'a2', id FROM x;
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
SELECT pg_temp.check('9-8b 保守会社: 管理者の代理申請（同じ保守会社）は今までどおり修正できる',
  (signage.portal_update_submitted_entry((SELECT id FROM t_ids WHERE k = 'a2'), '{"remarks": "t1115-a"}'::jsonb)).remarks = 't1115-a');

-- 無効の管理会社・プロファイル無しは申請できない
SELECT pg_temp.as_owner();
UPDATE signage.signage_profiles SET status = 'inactive' WHERE id = 'a0000000-0000-4000-8000-000000000007';
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000007');
SELECT pg_temp.expect_error('9-9 無効の管理会社',
  $q$INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, inspection_type, inspection_start,
                                          status, property_inspection_id, target_month)
     VALUES ('a0000000-0000-4000-8000-000000000007', '120411-00', '', NULL, '外壁補修工事', '2032-01-05',
             'pending', 'a1151115-0000-4000-8000-000000000003', '2032-01-01')$q$, '担当外の点検');  -- 無効なので役割が決まらず、保守会社の確かめで止まる（RLS より先）

-- ============================================================
-- 10. 権限
-- ============================================================
SELECT pg_temp.as_owner();
SELECT pg_temp.check('10-1 entry_vendor_for_management・3引数の submitted_entry_editable は利用者が実行できない',
  NOT has_function_privilege('authenticated', 'signage.entry_vendor_for_management(uuid, uuid)', 'execute')
  AND NOT has_function_privilege('anon', 'signage.entry_vendor_for_management(uuid, uuid)', 'execute')
  AND NOT has_function_privilege('authenticated', 'signage.submitted_entry_editable(uuid, uuid, text)', 'execute')
  AND NOT has_function_privilege('anon', 'signage.submitted_entry_editable(uuid, uuid, text)', 'execute')
  AND NOT has_function_privilege('authenticated', 'signage.entry_author_is_management(uuid)', 'execute')
  AND NOT has_function_privilege('anon', 'signage.entry_author_is_management(uuid)', 'execute'));
SELECT pg_temp.check('10-1b mgmt_poster_object_deletable は authenticated だけ（Storage のポリシーで使う）・portal_entries は anon 不可',
  has_function_privilege('authenticated', 'signage.mgmt_poster_object_deletable(text)', 'execute')
  AND NOT has_function_privilege('anon', 'signage.mgmt_poster_object_deletable(text)', 'execute')
  AND has_function_privilege('authenticated', 'signage.portal_entries()', 'execute')
  AND NOT has_function_privilege('anon', 'signage.portal_entries()', 'execute'));
SELECT pg_temp.check('10-2 inspection_report_writable は authenticated だけ（Storage のポリシーで使う）',
  has_function_privilege('authenticated', 'signage.inspection_report_writable(uuid)', 'execute')
  AND NOT has_function_privilege('anon', 'signage.inspection_report_writable(uuid)', 'execute'));
SELECT pg_temp.check('10-2b inspection_report_modifiable は authenticated だけ（一覧の計算列 can_modify）',
  has_function_privilege('authenticated', 'signage.inspection_report_modifiable(signage.signage_inspection_reports)', 'execute')
  AND NOT has_function_privilege('anon', 'signage.inspection_report_modifiable(signage.signage_inspection_reports)', 'execute')
  AND NOT has_function_privilege('public', 'signage.inspection_report_modifiable(signage.signage_inspection_reports)', 'execute'));
SELECT pg_temp.check('10-3 置き換えた RPC は anon が実行できない',
  NOT has_function_privilege('anon', 'signage.portal_update_submitted_entry(uuid, jsonb)', 'execute')
  AND NOT has_function_privilege('anon', 'signage.portal_entry_for_edit(uuid)', 'execute')
  AND NOT has_function_privilege('anon', 'signage.portal_register_report(uuid, date, date, text, text, text, bigint, text, uuid, text)', 'execute')
  AND NOT has_function_privilege('anon', 'signage.portal_update_report(uuid, text, date, date, text, text)', 'execute')
  AND NOT has_function_privilege('anon', 'signage.bulk_template_info(uuid)', 'execute'));

DO $$ BEGIN RAISE NOTICE 'OK'; END $$;
ROLLBACK;
