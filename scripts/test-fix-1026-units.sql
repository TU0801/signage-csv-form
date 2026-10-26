-- 修正依頼1026 units の確かめ（ローカル DB 用。最後に ROLLBACK するので何も残らない）
-- 流し方: psql <ローカル DB> -X -v ON_ERROR_STOP=1 -f scripts/test-fix-1026-units.sql
--   どれか1つでも期待と違えば例外で止まる。全部通れば最後に「OK」の NOTICE が出る。
-- 前提: fix-1026-units.sql を流してあること。ローカルの検証用アカウント（admin a..01・user@ a..02〔c..01〕・inactive a..03・
--   user-b a..05〔c..03〕・mgmt@ a..06〔管理会社 c..09〕・mgmt-b a..07〔c..10〕）、物件 120409-00（管理会社 c..09）の
--   エレベーターの台 EV-1（b..01。台の保守 c..01）・EV-2（b..02。台の保守なし）、サイネージの台 SG-1（b..03。別の物件）、
--   点検行 2b84a9bd（120409-00 × f..01。点検月 2・5・8・11）があること。EV-2 の台の保守（c..03）はこの中で足して戻す。
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

-- 0. 台が1台（EV-1 だけ）の点検へは、保守会社も台なしで申請できる（R3 の止めは2台以上の点検だけ）。この行は 7 で使う
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
WITH x AS (
  INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, inspection_type, inspection_start,
                                       status, property_inspection_id, vendor_id, target_month)
  VALUES ('a0000000-0000-4000-8000-000000000002', '120409-00', '', '検証エレベーター保守株式会社', 'テスト', '2026-11-05',
          'draft', '2b84a9bd-b98e-4332-bd19-2973387bc13c', 'c0000000-0000-4000-8000-000000000001', '2026-11-01')
  RETURNING id)
INSERT INTO t_ids SELECT 'e0', id FROM x;
SELECT pg_temp.check('0a 台が1台の点検へは台なしで申請できる', (SELECT count(*) = 1 FROM t_ids WHERE k = 'e0'));
SELECT pg_temp.as_owner();

-- 準備: EV-2 に台の保守（検証清掃 c..03）を足して、点検 2b84a9bd を2台（EV-1 は c..01、EV-2 は c..03）にする
INSERT INTO biz.property_unit_inspections (unit_id, inspection_type_id, maintainer_id, inspection_months)
VALUES ('b0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000003', '{2,5,8,11}');

-- 申請の雛形（user@ が EV-1 の台で申請する）

-- ============================================================
-- 1. 申請の台（guard_entry_unit）
-- ============================================================
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
WITH x AS (
  INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, inspection_type, inspection_start,
                                       status, property_inspection_id, vendor_id, target_month, property_unit_id)
  VALUES ('a0000000-0000-4000-8000-000000000002', '120409-00', '', '検証エレベーター保守株式会社', 'テスト', '2026-11-10',
          'draft', '2b84a9bd-b98e-4332-bd19-2973387bc13c', 'c0000000-0000-4000-8000-000000000001', '2026-11-01',
          'b0000000-0000-4000-8000-000000000001')
  RETURNING id)
INSERT INTO t_ids SELECT 'e1', id FROM x;
SELECT pg_temp.check('1a 自社の台（EV-1）で申請できる', (SELECT count(*) = 1 FROM t_ids WHERE k = 'e1'));

SELECT pg_temp.expect_error('1b 他社の台（EV-2）では申請できない', $q$
  INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, inspection_type, status,
                                       property_inspection_id, vendor_id, target_month, property_unit_id)
  VALUES ('a0000000-0000-4000-8000-000000000002', '120409-00', '', 'x', 'テスト', 'draft',
          '2b84a9bd-b98e-4332-bd19-2973387bc13c', 'c0000000-0000-4000-8000-000000000001', '2026-11-01',
          'b0000000-0000-4000-8000-000000000002')$q$, '担当外の台');
SELECT pg_temp.expect_error('1c 別の物件の台（SG-1）は指定できない', $q$
  INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, inspection_type, status,
                                       property_inspection_id, vendor_id, target_month, property_unit_id)
  VALUES ('a0000000-0000-4000-8000-000000000002', '120409-00', '', 'x', 'テスト', 'draft',
          '2b84a9bd-b98e-4332-bd19-2973387bc13c', 'c0000000-0000-4000-8000-000000000001', '2026-11-01',
          'b0000000-0000-4000-8000-000000000003')$q$, 'この点検のものではありません');
SELECT pg_temp.expect_error('1d 点検に結び付けない申請に台は付けられない', $q$
  INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, inspection_type, status, property_unit_id)
  VALUES ('a0000000-0000-4000-8000-000000000002', '120409-00', '', 'x', 'テスト', 'draft',
          'b0000000-0000-4000-8000-000000000001')$q$, '点検に結び付けた申請だけ');

SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000005');
WITH x AS (
  INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, inspection_type, inspection_start,
                                       status, property_inspection_id, vendor_id, target_month, property_unit_id)
  VALUES ('a0000000-0000-4000-8000-000000000005', '120409-00', '', '検証清掃サービス株式会社', 'テスト', '2026-11-12',
          'draft', '2b84a9bd-b98e-4332-bd19-2973387bc13c', 'c0000000-0000-4000-8000-000000000003', '2026-11-01',
          'b0000000-0000-4000-8000-000000000002')
  RETURNING id)
INSERT INTO t_ids SELECT 'e2', id FROM x;
SELECT pg_temp.check('1e 台の保守会社（user-b）は自社の台（EV-2）で申請できる', (SELECT count(*) = 1 FROM t_ids WHERE k = 'e2'));

-- 台が2台以上の点検へは、管理者以外は台なしの申請を出せない（台なしの申請は全部の台に効く。修正依頼1026 再検証 R3）
SELECT pg_temp.expect_error('1f 1台だけ保守する会社（user-b）は台なしで申請できない', $q$
  INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, inspection_type, status,
                                       property_inspection_id, vendor_id, target_month)
  VALUES ('a0000000-0000-4000-8000-000000000005', '120409-00', '', 'x', 'テスト', 'draft',
          '2b84a9bd-b98e-4332-bd19-2973387bc13c', 'c0000000-0000-4000-8000-000000000003', '2026-11-01')$q$,
  '点検登録フォーム（一括入力）から台ごとに申請してください');
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
SELECT pg_temp.expect_error('1g 点検行の保守会社（user@）も台なしでは申請できない', $q$
  INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, inspection_type, status,
                                       property_inspection_id, vendor_id, target_month)
  VALUES ('a0000000-0000-4000-8000-000000000002', '120409-00', '', 'x', 'テスト', 'draft',
          '2b84a9bd-b98e-4332-bd19-2973387bc13c', 'c0000000-0000-4000-8000-000000000001', '2026-11-01')$q$,
  '点検登録フォーム（一括入力）から台ごとに申請してください');
SELECT pg_temp.check('1h 既存の台なしの申請（台・点検を変えない修正）は今どおり直せる',
  (SELECT remarks = '既存' FROM signage.portal_update_submitted_entry((SELECT id FROM t_ids WHERE k = 'e0'), '{"remarks":"既存"}')));
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000001');
WITH x AS (
  INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, inspection_type, status,
                                       property_inspection_id, vendor_id, target_month)
  VALUES ('a0000000-0000-4000-8000-000000000001', '120409-00', '', 'x', 'テスト', 'draft',
          '2b84a9bd-b98e-4332-bd19-2973387bc13c', 'c0000000-0000-4000-8000-000000000001', '2026-11-01')
  RETURNING id)
INSERT INTO t_ids SELECT 'ea', id FROM x;
SELECT pg_temp.check('1i 管理者は台なしで申請できる', (SELECT count(*) = 1 FROM t_ids WHERE k = 'ea'));

-- ============================================================
-- 2. 完了連絡（台ごと）
-- ============================================================
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
SELECT pg_temp.check('2a user@ は EV-1 の完了を連絡できる',
  (SELECT property_unit_id = 'b0000000-0000-4000-8000-000000000001'
     FROM signage.portal_mark_completed_any_month('2b84a9bd-b98e-4332-bd19-2973387bc13c', '2026-11-01',
                                                  'b0000000-0000-4000-8000-000000000001')));
SELECT pg_temp.check('2b 2回目は前の記録を返す（増えない）',
  (SELECT (SELECT count(*) FROM signage.portal_completions() c
            WHERE c.property_inspection_id = '2b84a9bd-b98e-4332-bd19-2973387bc13c' AND c.target_month = '2026-11-01') = 1
     FROM signage.portal_mark_completed_any_month('2b84a9bd-b98e-4332-bd19-2973387bc13c', '2026-11-01',
                                                  'b0000000-0000-4000-8000-000000000001')));
SELECT pg_temp.expect_error('2c user@ は他社の台（EV-2）の完了を連絡できない', $q$
  SELECT signage.portal_mark_completed_any_month('2b84a9bd-b98e-4332-bd19-2973387bc13c', '2026-11-01',
                                                 'b0000000-0000-4000-8000-000000000002')$q$, 'この台の完了連絡をする権限');
SELECT pg_temp.expect_error('2d 別の物件の台は指定できない', $q$
  SELECT signage.portal_mark_completed_any_month('2b84a9bd-b98e-4332-bd19-2973387bc13c', '2026-11-01',
                                                 'b0000000-0000-4000-8000-000000000003')$q$, 'この点検のものではありません');
-- 台が2台以上の点検は、保守会社は台なしの完了連絡を出せない（台なしは全部の台に効く。R3）
SELECT pg_temp.expect_error('2e0 2台以上の点検へ台なしの完了連絡（2引数）は断る', $q$
  SELECT signage.portal_mark_completed_any_month(p_inspection_id => '2b84a9bd-b98e-4332-bd19-2973387bc13c',
                                                 p_target_month => '2026-11-01')$q$, '台ごとに完了を連絡してください');
SELECT pg_temp.expect_error('2e1 1024 の portal_mark_completed（台なし）も断る', $q$
  SELECT signage.portal_mark_completed('2b84a9bd-b98e-4332-bd19-2973387bc13c', '2026-11-01')$q$, '台ごとに完了を連絡してください');
-- 管理者は台なしの完了連絡を出せる（今どおり別の1件として入る）
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000001');
SELECT pg_temp.check('2e 管理者の台なしの完了連絡（2引数）は入る',
  (SELECT property_unit_id IS NULL
     FROM signage.portal_mark_completed_any_month(p_inspection_id => '2b84a9bd-b98e-4332-bd19-2973387bc13c',
                                                  p_target_month => '2026-11-01')));
SELECT pg_temp.check('2f 1024 の portal_mark_completed（台なし）は同じ台なしの1件を返す',
  (SELECT (SELECT count(*) FROM signage.portal_completions() c
            WHERE c.property_inspection_id = '2b84a9bd-b98e-4332-bd19-2973387bc13c' AND c.target_month = '2026-11-01') = 2
     FROM signage.portal_mark_completed('2b84a9bd-b98e-4332-bd19-2973387bc13c', '2026-11-01')));

SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000005');
SELECT pg_temp.check('2g user-b は EV-2 の完了を連絡でき、保守会社は c..03',
  (SELECT vendor_id = 'c0000000-0000-4000-8000-000000000003'
     FROM signage.portal_mark_completed_any_month('2b84a9bd-b98e-4332-bd19-2973387bc13c', '2026-11-01',
                                                  'b0000000-0000-4000-8000-000000000002')));
SELECT pg_temp.expect_error('2h user-b は user@ の EV-1 の完了連絡を取り消せない', $q$
  SELECT signage.portal_unmark_completed('2b84a9bd-b98e-4332-bd19-2973387bc13c', '2026-11-01',
                                         'b0000000-0000-4000-8000-000000000001')$q$, '連絡した保守会社か管理者だけ');

SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000006');
SELECT pg_temp.expect_error('2i 管理会社は完了を連絡できない', $q$
  SELECT signage.portal_mark_completed_any_month('2b84a9bd-b98e-4332-bd19-2973387bc13c', '2026-11-01',
                                                 'b0000000-0000-4000-8000-000000000001')$q$, '権限がありません');
SELECT pg_temp.check('2j 管理会社は自社物件の台ごとの完了連絡を読める（台の列つき）',
  (SELECT count(*) FILTER (WHERE property_unit_id IS NOT NULL) = 2 AND count(*) = 3
     FROM signage.portal_completions()
    WHERE property_inspection_id = '2b84a9bd-b98e-4332-bd19-2973387bc13c' AND target_month = '2026-11-01'));

SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000007');
SELECT pg_temp.check('2k 他の管理会社には見えない',
  (SELECT count(*) = 0 FROM signage.portal_completions() WHERE property_inspection_id = '2b84a9bd-b98e-4332-bd19-2973387bc13c'));

SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
SELECT pg_temp.check('2l user@ は EV-1 の完了連絡を取り消せる（台なしの1件は残る）',
  signage.portal_unmark_completed('2b84a9bd-b98e-4332-bd19-2973387bc13c', '2026-11-01', 'b0000000-0000-4000-8000-000000000001')
  AND (SELECT count(*) = 1 FROM signage.portal_completions()
        WHERE property_inspection_id = '2b84a9bd-b98e-4332-bd19-2973387bc13c' AND target_month = '2026-11-01'
          AND property_unit_id IS NULL));

-- ============================================================
-- 3. 点検日連絡 OFF
-- ============================================================
SELECT pg_temp.as_owner();
UPDATE biz.property_unit_inspections SET notify_inspection_date = false
 WHERE unit_id = 'b0000000-0000-4000-8000-000000000001' AND inspection_type_id = 'f0000000-0000-4000-8000-000000000001';

SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
SELECT pg_temp.check('3a 点検日連絡 OFF の台（EV-1）は点検月以外の月（12月）も完了を連絡できる',
  (SELECT target_month = '2026-12-01'
     FROM signage.portal_mark_completed_any_month('2b84a9bd-b98e-4332-bd19-2973387bc13c', '2026-12-01',
                                                  'b0000000-0000-4000-8000-000000000001')));
SELECT pg_temp.check('3b portal_inspection_notify_off は OFF の台を返す',
  (SELECT count(*) = 1 FROM signage.portal_inspection_notify_off()
    WHERE inspection_id = '2b84a9bd-b98e-4332-bd19-2973387bc13c' AND unit_id = 'b0000000-0000-4000-8000-000000000001'));
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000005');
SELECT pg_temp.expect_error('3c 点検日連絡 ON の台（EV-2）は点検月以外の月は申請が無いと断る', $q$
  SELECT signage.portal_mark_completed_any_month('2b84a9bd-b98e-4332-bd19-2973387bc13c', '2026-12-01',
                                                 'b0000000-0000-4000-8000-000000000002')$q$, '点検月ではありません');
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000006');
SELECT pg_temp.check('3d 管理会社にも返す（自社物件）',
  (SELECT count(*) = 1 FROM signage.portal_inspection_notify_off() WHERE inspection_id = '2b84a9bd-b98e-4332-bd19-2973387bc13c'));
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000003');
SELECT pg_temp.check('3e 無効なアカウントには返さない', (SELECT count(*) = 0 FROM signage.portal_inspection_notify_off()));

-- ============================================================
-- 4. 申請の台（portal_entry_units）
-- ============================================================
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000006');
SELECT pg_temp.check('4a 管理会社は自社物件の台ごとの申請の台を読める',
  (SELECT count(*) = 2 FROM signage.portal_entry_units() u JOIN t_ids t ON t.id = u.entry_id));
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000007');
SELECT pg_temp.check('4b 他の管理会社は読めない',
  (SELECT count(*) = 0 FROM signage.portal_entry_units() u JOIN t_ids t ON t.id = u.entry_id));
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000003');
SELECT pg_temp.check('4c 無効なアカウントは読めない', (SELECT count(*) = 0 FROM signage.portal_entry_units()));

-- ============================================================
-- 5. 申請済み（承認前）の申請の修正
-- ============================================================
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
SELECT pg_temp.check('5a 申請者は申請済みの申請を読める（メモつき）',
  (SELECT status = 'draft' FROM signage.portal_entry_for_edit((SELECT id FROM t_ids WHERE k = 'e1'))));
SELECT pg_temp.check('5b 申請者は申請済みの申請を直せる（状態は申請済みのまま）',
  (SELECT status = 'draft' AND remarks = '9時〜' AND memo = 'めも' AND inspection_start = '2026-11-11'
     FROM signage.portal_update_submitted_entry((SELECT id FROM t_ids WHERE k = 'e1'),
          '{"remarks":"9時〜","memo":"めも","inspection_start":"2026-11-11","inspection_end":"2026-11-11"}')));
SELECT pg_temp.check('5c 印は1文の間だけ（直した後は直接の更新を今どおり断る）',
  current_setting('signage.portal_review', true) IS DISTINCT FROM 'on');
SELECT pg_temp.expect_error('5d 申請済みの行の直接の更新は今どおり断る（ガードは変えていない）', $q$
  UPDATE signage.signage_entries SET remarks = 'x' WHERE id = (SELECT id FROM t_ids WHERE k = 'e1')$q$, '申請済み・承認済み');
SELECT pg_temp.expect_error('5e 状態は直せない', $q$
  SELECT signage.portal_update_submitted_entry((SELECT id FROM t_ids WHERE k = 'e1'), '{"status":"ready"}')$q$, '修正できません: status');
SELECT pg_temp.expect_error('5f 物件・点検・台は直せない', $q$
  SELECT signage.portal_update_submitted_entry((SELECT id FROM t_ids WHERE k = 'e1'),
         '{"property_unit_id":"b0000000-0000-4000-8000-000000000002"}')$q$, '修正できません');
SELECT pg_temp.expect_error('5g 点検開始日は空にできない', $q$
  SELECT signage.portal_update_submitted_entry((SELECT id FROM t_ids WHERE k = 'e1'), '{"inspection_start":null}')$q$, '点検開始日');
SELECT pg_temp.expect_error('5h 貼紙のガードは働く（他の方の画像は使えない）', $q$
  SELECT signage.portal_update_submitted_entry((SELECT id FROM t_ids WHERE k = 'e1'),
         jsonb_build_object('poster_type', 'custom', 'poster_image',
           signage.poster_public_base() || '/storage/v1/object/public/poster-images/a0000000-0000-4000-8000-000000000005/x.png'))$q$,
  '貼紙');

SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000005');
SELECT pg_temp.expect_error('5i 他社（user-b）は直せない', $q$
  SELECT signage.portal_update_submitted_entry((SELECT id FROM t_ids WHERE k = 'e1'), '{"remarks":"x"}')$q$, '権限がありません');
SELECT pg_temp.expect_error('5j 他社（user-b）は読めない', $q$
  SELECT signage.portal_entry_for_edit((SELECT id FROM t_ids WHERE k = 'e1'))$q$, '権限がありません');
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000006');
SELECT pg_temp.expect_error('5k 管理会社は直せない', $q$
  SELECT signage.portal_update_submitted_entry((SELECT id FROM t_ids WHERE k = 'e1'), '{"remarks":"x"}')$q$, '権限がありません');
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000003');
SELECT pg_temp.expect_error('5l 無効なアカウント（同じ保守会社）は直せない', $q$
  SELECT signage.portal_update_submitted_entry((SELECT id FROM t_ids WHERE k = 'e1'), '{"remarks":"x"}')$q$, '権限がありません');

-- 同じ保守会社の別のアカウント（inactive を一時的に有効にして確かめる）
SELECT pg_temp.as_owner();
UPDATE signage.signage_profiles SET status = 'active' WHERE id = 'a0000000-0000-4000-8000-000000000003';
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000003');
SELECT pg_temp.check('5m 同じ保守会社の別のアカウントは直せる',
  (SELECT remarks = '同社' FROM signage.portal_update_submitted_entry((SELECT id FROM t_ids WHERE k = 'e1'), '{"remarks":"同社"}')));
SELECT pg_temp.as_owner();
UPDATE signage.signage_profiles SET status = 'inactive' WHERE id = 'a0000000-0000-4000-8000-000000000003';

SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000001');
SELECT pg_temp.check('5n 管理者は直せる',
  (SELECT remarks = '管理者' FROM signage.portal_update_submitted_entry((SELECT id FROM t_ids WHERE k = 'e1'), '{"remarks":"管理者"}')));

-- 管理会社が承認した後・差戻した後は直せない
-- 承認は見た版（updated_at）を渡す。直された後の古い版では断る（このファイルは1トランザクションなので now() は変わらない。古い版は1秒前で作る）
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000007');
SELECT pg_temp.expect_error('5o0 範囲外の管理会社は版を比べる前に断られる', $q$
  SELECT signage.portal_approve_entry_checked((SELECT id FROM t_ids WHERE k = 'e1'), now())$q$, '権限がありません');
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000006');
SELECT pg_temp.expect_error('5o1 古い版では承認できない', $q$
  SELECT signage.portal_approve_entry_checked((SELECT id FROM t_ids WHERE k = 'e1'), now() - interval '1 second')$q$, '申請が修正されました');
SELECT pg_temp.check('5o2 古い版で断られた申請は申請済みのまま',
  (SELECT status = 'draft' FROM signage.portal_entries() WHERE id = (SELECT id FROM t_ids WHERE k = 'e1')));
SELECT pg_temp.check('5o 管理会社は最新の版で承認できる',
  (SELECT status = 'ready' AND remarks = '管理者' FROM signage.portal_approve_entry_checked(
     (SELECT id FROM t_ids WHERE k = 'e1'),
     (SELECT updated_at FROM signage.portal_entries() WHERE id = (SELECT id FROM t_ids WHERE k = 'e1')))));
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
SELECT pg_temp.expect_error('5p 承認の後は直せない', $q$
  SELECT signage.portal_update_submitted_entry((SELECT id FROM t_ids WHERE k = 'e1'), '{"remarks":"x"}')$q$, '承認前');
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000006');
SELECT pg_temp.check('5q 差戻し', (SELECT status = 'pending' FROM signage.portal_review_entry((SELECT id FROM t_ids WHERE k = 'e2'), 'send_back', '日付')));
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000005');
SELECT pg_temp.expect_error('5r 差戻しの後は（この RPC では）直せない', $q$
  SELECT signage.portal_update_submitted_entry((SELECT id FROM t_ids WHERE k = 'e2'), '{"remarks":"x"}')$q$, '承認前');
SELECT pg_temp.expect_error('5s 差戻し中の申請の台を外す（台なしにする）更新は断る（R3）', $q$
  UPDATE signage.signage_entries SET property_unit_id = NULL WHERE id = (SELECT id FROM t_ids WHERE k = 'e2')$q$,
  '点検登録フォーム（一括入力）から台ごとに申請してください');
UPDATE signage.signage_entries SET remarks = '直した' WHERE id = (SELECT id FROM t_ids WHERE k = 'e2');
SELECT pg_temp.check('5t 差戻し中の申請の台を変えない更新は通る',
  (SELECT remarks = '直した' AND property_unit_id = 'b0000000-0000-4000-8000-000000000002'
     FROM signage.signage_entries WHERE id = (SELECT id FROM t_ids WHERE k = 'e2')));

-- ============================================================
-- 6. anon には実行権限が無い
-- ============================================================
SELECT pg_temp.as_owner();
SET LOCAL ROLE anon;
SELECT pg_temp.expect_error('6a0 anon は承認できない', $q$SELECT signage.portal_approve_entry_checked(gen_random_uuid(), now())$q$, 'permission denied');
SELECT pg_temp.expect_error('6a anon は修正できない', $q$SELECT signage.portal_update_submitted_entry(gen_random_uuid(), '{}')$q$, 'permission denied');
SELECT pg_temp.expect_error('6b anon は完了連絡できない', $q$SELECT signage.portal_mark_completed_any_month(gen_random_uuid(), '2026-11-01', NULL)$q$, 'permission denied');
SELECT pg_temp.expect_error('6c anon は申請の台を読めない', $q$SELECT * FROM signage.portal_entry_units()$q$, 'permission denied');
SELECT pg_temp.expect_error('6d anon は点検日連絡を読めない', $q$SELECT * FROM signage.portal_inspection_notify_off()$q$, 'permission denied');
SELECT pg_temp.as_owner();
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error('6e 内部の関数は authenticated から呼べない', $q$SELECT signage.inspection_unit_vendor(gen_random_uuid(), gen_random_uuid())$q$, 'permission denied');
SELECT pg_temp.as_owner();

DO $$ BEGIN RAISE NOTICE 'OK（fix-1026-units の確かめが全部通った）'; END $$;
ROLLBACK;
