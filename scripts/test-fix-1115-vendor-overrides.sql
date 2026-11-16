-- fix-1115-vendor-overrides.sql の確かめ（ローカル DB 用。最後に ROLLBACK するので何も残らない）
-- 流し方: psql <ローカル DB> -X -v ON_ERROR_STOP=1 -f scripts/test-fix-1115-vendor-overrides.sql
--   どれか1つでも期待と違えば例外で止まる。全部通れば最後に「OK」の NOTICE が出る。
-- 前提: fix-1115-templates.sql → fix-1115-poster-library.sql → fix-1115-mgmt-entry.sql → fix-1115-vendor-overrides.sql を流してあること。
--   ローカルの検証用アカウント（admin a..01・user@ a..02〔保守会社 c..01〕・user-b a..05〔c..03〕・mgmt@ a..06〔管理会社 c..09〕・
--   mgmt-b@ a..07〔管理会社 c..10〕）と、物件 120409-00（c..09 の管理。点検 2b84a9bd エレベーター定期点検・保守 c..01、台1台）・
--   120411-00（c..10 の管理。user@ の紐付け active）、点検種別 f..01 エレベーター定期点検（既定 TPL elevator_inspection）、
--   テンプレート画像 cleaning・fire_inspection があること。上書きの行はこの中で足して戻す。
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
-- 1. 管理会社の上書きの登録（RLS・トリガー）
-- ============================================================
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000006');
-- 会社を省くと自社、updated_by は送った値ではなく DB が自分にする
WITH x AS (
  INSERT INTO signage.signage_mgmt_vendor_overrides (vendor_id, inspection_type_id, emergency_contact, updated_by)
  VALUES ('c0000000-0000-4000-8000-000000000001', NULL, ' 090-5115-0001 ', 'a0000000-0000-4000-8000-000000000001')
  RETURNING id)
INSERT INTO t_ids SELECT 'contact', id FROM x;
WITH x AS (
  INSERT INTO signage.signage_mgmt_vendor_overrides (management_company_id, vendor_id, inspection_type_id, template_no)
  VALUES ('c0000000-0000-4000-8000-000000000009', 'c0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'cleaning')
  RETURNING id)
INSERT INTO t_ids SELECT 'tpl', id FROM x;
SELECT pg_temp.check('1-1 管理会社: 自社の上書きを登録できる（会社・updated_by は DB が決め、連絡先は前後の空白を落とす）',
  (SELECT count(*) = 2 AND bool_and(management_company_id = 'c0000000-0000-4000-8000-000000000009')
          AND bool_and(updated_by = 'a0000000-0000-4000-8000-000000000006')
          AND bool_or(emergency_contact = '090-5115-0001')
     FROM signage.signage_mgmt_vendor_overrides));
SELECT pg_temp.expect_error('1-2 管理会社: 他社（c..10）の行は登録できない',
  $q$INSERT INTO signage.signage_mgmt_vendor_overrides (management_company_id, vendor_id, inspection_type_id, emergency_contact)
     VALUES ('c0000000-0000-4000-8000-000000000010', 'c0000000-0000-4000-8000-000000000002', NULL, '090')$q$, 'row-level security');
SELECT pg_temp.expect_error('1-3 実在しない TPL は登録できない',
  $q$INSERT INTO signage.signage_mgmt_vendor_overrides (vendor_id, inspection_type_id, template_no)
     VALUES ('c0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000002', 'no_such_template')$q$,
  'このテンプレートNoは登録されていません');
SELECT pg_temp.expect_error('1-4 種別 NULL の行に TPL は持たせない（連絡先用）',
  $q$INSERT INTO signage.signage_mgmt_vendor_overrides (vendor_id, inspection_type_id, template_no)
     VALUES ('c0000000-0000-4000-8000-000000000002', NULL, 'cleaning')$q$, 'signage_mgmt_vendor_overrides_kind_check');
SELECT pg_temp.expect_error('1-5 同じ管理会社×保守会社×種別 NULL は2行目を作れない（NULLS NOT DISTINCT）',
  $q$INSERT INTO signage.signage_mgmt_vendor_overrides (vendor_id, inspection_type_id, emergency_contact)
     VALUES ('c0000000-0000-4000-8000-000000000001', NULL, '090-0000-0000')$q$, 'signage_mgmt_vendor_overrides_key');
SELECT pg_temp.expect_error('1-6 キー（保守会社）の付け替えは断る',
  format($q$UPDATE signage.signage_mgmt_vendor_overrides SET vendor_id = 'c0000000-0000-4000-8000-000000000002' WHERE id = %L$q$,
         (SELECT id FROM t_ids WHERE k = 'tpl')), '変えられません');
-- 種別の TPL（inspection_types.template_no）も選べる
UPDATE signage.signage_mgmt_vendor_overrides SET template_no = 'fire_inspection' WHERE id = (SELECT id FROM t_ids WHERE k = 'tpl');
UPDATE signage.signage_mgmt_vendor_overrides SET template_no = 'cleaning' WHERE id = (SELECT id FROM t_ids WHERE k = 'tpl');
SELECT pg_temp.check('1-7 TPL を変えられる（updated_by は自分のまま）',
  (SELECT template_no = 'cleaning' AND updated_by = 'a0000000-0000-4000-8000-000000000006'
     FROM signage.signage_mgmt_vendor_overrides WHERE id = (SELECT id FROM t_ids WHERE k = 'tpl')));

-- 管理会社B は c..09 の行を読めない・変えられない・消せない。自社（c..10）の行は作れる
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000007');
SELECT pg_temp.check('1-8 管理会社B: 他社の上書きは見えない',
  (SELECT count(*) = 0 FROM signage.signage_mgmt_vendor_overrides));
UPDATE signage.signage_mgmt_vendor_overrides SET emergency_contact = '000' WHERE id = (SELECT id FROM t_ids WHERE k = 'contact');
DELETE FROM signage.signage_mgmt_vendor_overrides WHERE id = (SELECT id FROM t_ids WHERE k = 'tpl');
WITH x AS (
  INSERT INTO signage.signage_mgmt_vendor_overrides (vendor_id, inspection_type_id, template_no)
  VALUES ('c0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'fire_inspection')
  RETURNING id)
INSERT INTO t_ids SELECT 'tpl_b', id FROM x;
SELECT pg_temp.as_owner();
SELECT pg_temp.check('1-9 管理会社B の更新・削除は他社の行に効かない（空振り）',
  (SELECT emergency_contact = '090-5115-0001' FROM signage.signage_mgmt_vendor_overrides WHERE id = (SELECT id FROM t_ids WHERE k = 'contact'))
  AND EXISTS (SELECT 1 FROM signage.signage_mgmt_vendor_overrides WHERE id = (SELECT id FROM t_ids WHERE k = 'tpl')));
SELECT pg_temp.check('1-10 監査ログに残る',
  (SELECT count(*) >= 3 FROM signage.signage_audit_logs WHERE table_name = 'signage_mgmt_vendor_overrides'));

-- 保守会社は表を直接読めない（RLS で0行）
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
SELECT pg_temp.check('1-11 保守会社: 表を直接は読めない',
  (SELECT count(*) = 0 FROM signage.signage_mgmt_vendor_overrides));
SELECT pg_temp.expect_error('1-12 保守会社: 上書きを登録できない',
  $q$INSERT INTO signage.signage_mgmt_vendor_overrides (management_company_id, vendor_id, inspection_type_id, emergency_contact)
     VALUES ('c0000000-0000-4000-8000-000000000009', 'c0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002', NULL)$q$,
  'row-level security');

-- ============================================================
-- 2. RPC: mgmt_vendor_defaults（管理会社の保守会社タブ）
-- ============================================================
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000006');
SELECT pg_temp.check('2-1 管理会社: 保守会社×紐付け種別の行に既定と自社の上書き（c..01 エレベーター）',
  (SELECT count(*) = 1 FROM signage.mgmt_vendor_defaults()
    WHERE vendor_id = 'c0000000-0000-4000-8000-000000000001' AND inspection_type_id = 'f0000000-0000-4000-8000-000000000001'
      AND default_template_no = 'elevator_inspection' AND template_no = 'cleaning'
      AND emergency_contact = '090-5115-0001' AND default_emergency_contact = '0120-000-001'));
-- レビュー指摘: 紐付けの無い保守会社（c..02）でも、自社物件の点検行（120409-00 消防設備点検）と台の保守（エレベーター）の組は行に出る
SELECT pg_temp.check('2-2 紐付けの無い保守会社（c..02）は、自社物件の点検行・台の保守に出てくる種別の行（種別なしの行は出ない）',
  (SELECT count(*) = 2
          AND bool_and(inspection_type_id IN ('f0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000001'))
          AND bool_or(inspection_type_id = 'f0000000-0000-4000-8000-000000000002' AND default_template_no = 'fire_inspection')
     FROM signage.mgmt_vendor_defaults() WHERE vendor_id = 'c0000000-0000-4000-8000-000000000002'));
SELECT pg_temp.check('2-2b 他社物件だけの組（c..03 × 貯水槽清掃。120411-00 は管理会社B）は出ない',
  NOT EXISTS (SELECT 1 FROM signage.mgmt_vendor_defaults()
               WHERE vendor_id = 'c0000000-0000-4000-8000-000000000003' AND inspection_type_label = '貯水槽清掃（断水）'));
-- 点検行から出た組（c..02 × 消防設備点検）も上書きでき、行と管理会社の申請の TPL 照合に効く
INSERT INTO signage.signage_mgmt_vendor_overrides (vendor_id, inspection_type_id, template_no)
VALUES ('c0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000002', 'cleaning');
SELECT pg_temp.check('2-2c 点検行から出た組の上書きが行に付く',
  (SELECT template_no = 'cleaning' FROM signage.mgmt_vendor_defaults()
    WHERE vendor_id = 'c0000000-0000-4000-8000-000000000002' AND inspection_type_id = 'f0000000-0000-4000-8000-000000000002'));
WITH x AS (
  INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, inspection_type, template_no,
                                       inspection_start, status, property_inspection_id, target_month)
  VALUES ('a0000000-0000-4000-8000-000000000006', '120409-00', '', NULL, '消防設備点検', 'cleaning',
          '2033-06-05', 'draft', '2124a983-8f13-4323-9eea-67f36bedf3d3', '2033-06-01')
  RETURNING id)
INSERT INTO t_ids SELECT 'mf', id FROM x;
SELECT pg_temp.check('2-2d 管理会社の申請（受注先 c..02・消防設備点検）がその上書き TPL で通る',
  (SELECT template_no = 'cleaning' AND vendor_id = 'c0000000-0000-4000-8000-000000000002'
     FROM signage.signage_entries WHERE id = (SELECT id FROM t_ids WHERE k = 'mf')));
-- 後の試験（3- の件数）に響かないよう、足した上書きは既定に戻す
DELETE FROM signage.signage_mgmt_vendor_overrides
 WHERE vendor_id = 'c0000000-0000-4000-8000-000000000002' AND inspection_type_id = 'f0000000-0000-4000-8000-000000000002';
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000007');
SELECT pg_temp.check('2-2e 管理会社B には自社物件に無い組（c..02 × エレベーター。台の保守は 120409-00 だけ）は出ない',
  NOT EXISTS (SELECT 1 FROM signage.mgmt_vendor_defaults()
               WHERE vendor_id = 'c0000000-0000-4000-8000-000000000002' AND inspection_type_id = 'f0000000-0000-4000-8000-000000000001'));
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000006');
SELECT pg_temp.check('2-3 管理会社B の上書き（fire_inspection）は混ざらない',
  NOT EXISTS (SELECT 1 FROM signage.mgmt_vendor_defaults() WHERE template_no = 'fire_inspection'));
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
SELECT pg_temp.check('2-4 保守会社には0行', (SELECT count(*) = 0 FROM signage.mgmt_vendor_defaults()));

-- ============================================================
-- 3. RPC: entry_vendor_defaults（申請画面）
-- ============================================================
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
SELECT pg_temp.check('3-1 保守会社: 担当物件の管理会社の、自社の分の上書きを返す',
  (SELECT d->'properties'->>'120409-00' = 'c0000000-0000-4000-8000-000000000009'
          AND jsonb_array_length(d->'overrides') >= 2
          AND d->'overrides' @> '[{"vendor_id": "c0000000-0000-4000-8000-000000000001", "template_no": "cleaning"}]'::jsonb
          AND d->'overrides' @> '[{"vendor_id": "c0000000-0000-4000-8000-000000000001", "inspection_type_id": null, "emergency_contact": "090-5115-0001"}]'::jsonb
     FROM (SELECT signage.entry_vendor_defaults('120409') AS d) x));
SELECT pg_temp.check('3-2 保守会社: 物件を省くと見られる物件全部（120411-00 の管理会社B の分も。紐付け active）',
  (SELECT d->'properties' ?& ARRAY['120409-00', '120411-00']
          AND d->'overrides' @> '[{"management_company_id": "c0000000-0000-4000-8000-000000000010", "template_no": "fire_inspection"}]'::jsonb
     FROM (SELECT signage.entry_vendor_defaults() AS d) x));
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000005');
SELECT pg_temp.check('3-3 他の保守会社（user-b・c..03）には c..01 の上書きを返さない',
  (SELECT d = '{"properties": {}, "overrides": []}'::jsonb FROM (SELECT signage.entry_vendor_defaults('120409-00') AS d) x));
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000007');
SELECT pg_temp.check('3-4 管理会社B: 自社が管理しない物件（120409-00）の上書きは返さない',
  (SELECT d = '{"properties": {}, "overrides": []}'::jsonb FROM (SELECT signage.entry_vendor_defaults('120409-00') AS d) x));
SELECT pg_temp.check('3-5 管理会社B: 自社の物件の分は返す',
  (SELECT d->'properties' ? '120411-00' AND NOT (d->'properties' ? '120409-00')
          AND jsonb_array_length(d->'overrides') = 1
     FROM (SELECT signage.entry_vendor_defaults() AS d) x));
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000001');
SELECT pg_temp.check('3-6 管理者: 全社の分',
  (SELECT jsonb_array_length(d->'overrides') = 3 FROM (SELECT signage.entry_vendor_defaults() AS d) x));
SELECT pg_temp.as_owner();
UPDATE signage.signage_profiles SET status = 'inactive' WHERE id = 'a0000000-0000-4000-8000-000000000002';
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
SELECT pg_temp.check('3-7 無効のアカウントには空',
  (SELECT d = '{"properties": {}, "overrides": []}'::jsonb FROM (SELECT signage.entry_vendor_defaults() AS d) x));
SELECT pg_temp.as_owner();
UPDATE signage.signage_profiles SET status = 'active' WHERE id = 'a0000000-0000-4000-8000-000000000002';

-- ============================================================
-- 4. 申請の TPL 照合（guard_entry_type_scope）
-- ============================================================
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
-- 点検に結び付けた申請（(1)）: 上書き TPL で通る
WITH x AS (
  INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_id, vendor_name, inspection_type, template_no,
                                       inspection_start, status, property_inspection_id, target_month)
  VALUES ('a0000000-0000-4000-8000-000000000002', '120409-00', '', 'c0000000-0000-4000-8000-000000000001', '検証エレベーター保守株式会社',
          'エレベーター定期点検', 'cleaning', '2033-02-05', 'draft', '2b84a9bd-b98e-4332-bd19-2973387bc13c', '2033-02-01')
  RETURNING id)
INSERT INTO t_ids SELECT 'e1', id FROM x;
SELECT pg_temp.check('4-1 保守会社: 管理会社の上書き TPL で申請（INSERT）できる（点検に結び付けた申請）',
  (SELECT template_no = 'cleaning' FROM signage.signage_entries WHERE id = (SELECT id FROM t_ids WHERE k = 'e1')));
-- 点検に結び付けない申請（(3)。vendor_id を送らない＝自社として照合する）
WITH x AS (
  INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, inspection_type, template_no,
                                       inspection_start, status)
  VALUES ('a0000000-0000-4000-8000-000000000002', '120409-00', '', '検証エレベーター保守株式会社',
          'エレベーター定期点検', 'cleaning', '2033-03-05', 'draft')
  RETURNING id)
INSERT INTO t_ids SELECT 'e2', id FROM x;
SELECT pg_temp.check('4-2 保守会社: 結び付けない申請でも上書き TPL で通る', EXISTS (SELECT 1 FROM t_ids WHERE k = 'e2'));
SELECT pg_temp.expect_error('4-3 上書きの無い TPL（他の種別の TPL）は今までどおり断る',
  $q$INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, inspection_type, template_no,
                                          inspection_start, status)
     VALUES ('a0000000-0000-4000-8000-000000000002', '120409-00', '', '検証エレベーター保守株式会社',
             'エレベーター定期点検', 'fire_inspection', '2033-03-06', 'draft')$q$, 'テンプレートNoが点検種別と一致しません');
SELECT pg_temp.expect_error('4-4 上書きの無い他社物件（120411-00 は管理会社B。B の上書きは fire_inspection）では c..09 の上書き TPL は断る',
  $q$INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, inspection_type, template_no,
                                          inspection_start, status)
     VALUES ('a0000000-0000-4000-8000-000000000002', '120411-00', '', '検証エレベーター保守株式会社',
             'エレベーター定期点検', 'cleaning', '2033-03-06', 'draft')$q$, 'テンプレートNoが点検種別と一致しません');
WITH x AS (
  INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, inspection_type, template_no,
                                       inspection_start, status)
  VALUES ('a0000000-0000-4000-8000-000000000002', '120411-00', '', '検証エレベーター保守株式会社',
          'エレベーター定期点検', 'fire_inspection', '2033-03-07', 'draft')
  RETURNING id)
INSERT INTO t_ids SELECT 'e3', id FROM x;
SELECT pg_temp.check('4-5 その物件の管理会社（B）の上書き TPL なら通る', EXISTS (SELECT 1 FROM t_ids WHERE k = 'e3'));
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000005');
SELECT pg_temp.expect_error('4-6 他の保守会社（c..03）は c..01 向けの上書き TPL を使えない',
  $q$INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, inspection_type, template_no,
                                          inspection_start, status)
     VALUES ('a0000000-0000-4000-8000-000000000005', '120409-00', '', '検証清掃サービス株式会社',
             'エレベーター定期点検', 'cleaning', '2033-03-06', 'draft')$q$, 'テンプレートNoが点検種別と一致しません');
-- 管理会社自身の申請（受注先は guard_entry_portal_columns が点検行の保守会社 c..01 に決める）にも効く
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000006');
WITH x AS (
  INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, inspection_type, template_no,
                                       inspection_start, status, property_inspection_id, target_month)
  VALUES ('a0000000-0000-4000-8000-000000000006', '120409-00', '', NULL, 'エレベーター定期点検', 'cleaning',
          '2033-05-05', 'draft', '2b84a9bd-b98e-4332-bd19-2973387bc13c', '2033-05-01')
  RETURNING id)
INSERT INTO t_ids SELECT 'm1', id FROM x;
SELECT pg_temp.check('4-7 管理会社の申請も自社の上書き TPL で通り、受注先は点検行の保守会社（要件2の扱いが残る）',
  (SELECT template_no = 'cleaning' AND vendor_id = 'c0000000-0000-4000-8000-000000000001' AND emergency_contact = '0120-000-001'
     FROM signage.signage_entries WHERE id = (SELECT id FROM t_ids WHERE k = 'm1')));

-- ============================================================
-- 5. 申請済みの修正（portal_update_submitted_entry）
-- ============================================================
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
-- 結び付けない申請 e2 の TPL を既定に戻し、また上書きにする
SELECT pg_temp.check('5-1 修正で TPL を種別の既定に戻せる',
  (SELECT (signage.portal_update_submitted_entry((SELECT id FROM t_ids WHERE k = 'e2'),
            '{"template_no": "elevator_inspection"}'::jsonb)).template_no = 'elevator_inspection'));
SELECT pg_temp.check('5-2 修正で上書き TPL にできる',
  (SELECT (signage.portal_update_submitted_entry((SELECT id FROM t_ids WHERE k = 'e2'),
            '{"template_no": "cleaning"}'::jsonb)).template_no = 'cleaning'));
SELECT pg_temp.expect_error('5-3 修正でも上書きの無い TPL は断る',
  format($q$SELECT signage.portal_update_submitted_entry(%L, '{"template_no": "fire_inspection"}'::jsonb)$q$,
         (SELECT id FROM t_ids WHERE k = 'e2')), 'テンプレートNoが点検種別と一致しません');
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000006');
SELECT pg_temp.check('5-4 管理会社の申請の修正でも上書き TPL を通す（受注先は点検行の保守会社で照合）',
  (SELECT (signage.portal_update_submitted_entry((SELECT id FROM t_ids WHERE k = 'm1'),
            '{"template_no": "elevator_inspection"}'::jsonb)).template_no = 'elevator_inspection')
  AND (SELECT (signage.portal_update_submitted_entry((SELECT id FROM t_ids WHERE k = 'm1'),
            '{"template_no": "cleaning"}'::jsonb)).template_no = 'cleaning'));

-- 既定に戻す（行の DELETE）と、上書き TPL の新しい申請は断る
DELETE FROM signage.signage_mgmt_vendor_overrides WHERE id = (SELECT id FROM t_ids WHERE k = 'tpl');
SELECT pg_temp.check('5-5 管理会社: 既定に戻す（DELETE）', NOT EXISTS (
  SELECT 1 FROM signage.signage_mgmt_vendor_overrides WHERE id = (SELECT id FROM t_ids WHERE k = 'tpl')));
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
SELECT pg_temp.expect_error('5-6 既定に戻した後は上書き TPL で申請できない',
  $q$INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, inspection_type, template_no,
                                          inspection_start, status)
     VALUES ('a0000000-0000-4000-8000-000000000002', '120409-00', '', '検証エレベーター保守株式会社',
             'エレベーター定期点検', 'cleaning', '2033-03-08', 'draft')$q$, 'テンプレートNoが点検種別と一致しません');

-- ============================================================
-- 6. anon・権限・印
-- ============================================================
SELECT pg_temp.as_owner();
SET LOCAL ROLE anon;
SELECT pg_temp.expect_error('6-1 anon: entry_vendor_defaults は実行できない', $q$SELECT signage.entry_vendor_defaults()$q$, 'permission denied');
SELECT pg_temp.expect_error('6-2 anon: mgmt_vendor_defaults は実行できない', $q$SELECT * FROM signage.mgmt_vendor_defaults()$q$, 'permission denied');
SELECT pg_temp.expect_error('6-3 anon: 表は読めない', $q$SELECT * FROM signage.signage_mgmt_vendor_overrides$q$, 'permission denied');
SELECT pg_temp.as_owner();
SELECT pg_temp.check('6-4 vendor_override_template_allowed・guard_mgmt_vendor_override は利用者が実行できない',
  NOT has_function_privilege('authenticated', 'signage.vendor_override_template_allowed(text, uuid, text, text)', 'execute')
  AND NOT has_function_privilege('anon', 'signage.vendor_override_template_allowed(text, uuid, text, text)', 'execute')
  AND NOT has_function_privilege('authenticated', 'signage.guard_mgmt_vendor_override()', 'execute'));
SELECT pg_temp.check('6-5 RPC は authenticated だけ',
  has_function_privilege('authenticated', 'signage.mgmt_vendor_defaults()', 'execute')
  AND has_function_privilege('authenticated', 'signage.entry_vendor_defaults(text)', 'execute')
  AND NOT has_function_privilege('anon', 'signage.mgmt_vendor_defaults()', 'execute')
  AND NOT has_function_privilege('anon', 'signage.entry_vendor_defaults(text)', 'execute')
  AND NOT has_function_privilege('anon', 'signage.portal_update_submitted_entry(uuid, jsonb)', 'execute'));
SELECT pg_temp.check('6-6 表の権限: anon には無く、authenticated は CRUD',
  NOT has_table_privilege('anon', 'signage.signage_mgmt_vendor_overrides', 'select')
  AND NOT has_table_privilege('anon', 'signage.signage_mgmt_vendor_overrides', 'insert')
  AND has_table_privilege('authenticated', 'signage.signage_mgmt_vendor_overrides', 'select,insert,update,delete'));
SELECT pg_temp.check('6-7 置き換えた2関数に要件2（[1115(2)]）と要件5（[1115(5)]）の両方の変更が残る',
  position('[1115(2)]' in pg_get_functiondef('signage.guard_entry_type_scope()'::regprocedure)) > 0
  AND position('[1115(5)]' in pg_get_functiondef('signage.guard_entry_type_scope()'::regprocedure)) > 0
  AND position('[1115(2)]' in pg_get_functiondef('signage.portal_update_submitted_entry(uuid, jsonb)'::regprocedure)) > 0
  AND position('[1115(5)]' in pg_get_functiondef('signage.portal_update_submitted_entry(uuid, jsonb)'::regprocedure)) > 0);

DO $$ BEGIN RAISE NOTICE 'OK'; END $$;
ROLLBACK;
