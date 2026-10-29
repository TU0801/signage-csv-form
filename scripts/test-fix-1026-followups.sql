-- fix-1026-followups.sql の確かめ（ローカル DB 用。最後に ROLLBACK するので何も残らない）
-- 流し方: psql <ローカル DB> -X -v ON_ERROR_STOP=1 -f scripts/test-fix-1026-followups.sql
--   どれか1つでも期待と違えば例外で止まる。全部通れば最後に「OK」の NOTICE が出る。
-- 前提: fix-1026-units.sql と fix-1026-followups.sql を流してあること。ローカルの検証用アカウント（admin a..01・user@ a..02〔c..01〕・
--   user-b a..05〔c..03〕・mgmt@ a..06〔管理会社 c..09〕）、物件 120409-00（管理会社 c..09）のエレベーターの台 EV-1（b..01。台の保守 c..01）・
--   EV-2（b..02。台の保守なし）、点検行 2b84a9bd（120409-00 × f..01。保守 c..01。点検月 2・5・8・11）があること。
--   EV-2 の台の保守（c..03）はこの中で足して戻す。
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

-- ============================================================
-- 2. 承認は版の照合つきの経路だけ（台が1台のうちに、台なしの申請済みを3件作る）
-- ============================================================
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
WITH x AS (
  INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, inspection_type, inspection_start,
                                       status, property_inspection_id, vendor_id, target_month)
  SELECT 'a0000000-0000-4000-8000-000000000002', '120409-00', '', '検証エレベーター保守株式会社', 'エレベーター定期点検', ('2026-11-0' || n)::date,
         'draft', '2b84a9bd-b98e-4332-bd19-2973387bc13c', 'c0000000-0000-4000-8000-000000000001',
         -- 同じ点検・同じ月の申請は1件だけ（修正依頼1029 guard_entry_unit_duplicate）なので、対象月を1か月ずつずらす
         (date '2026-11-01' + (n - 1) * interval '1 month')::date
    FROM generate_series(1, 3) n
  RETURNING id, inspection_start)
INSERT INTO t_ids SELECT 'e' || extract(day from inspection_start)::int, id FROM x;
SELECT pg_temp.check('2-0 申請済みを3件作った', (SELECT count(*) = 3 FROM t_ids WHERE k IN ('e1', 'e2', 'e3')));

SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000006');
SELECT pg_temp.expect_error('2a 管理会社が portal_review_entry で直接承認すると断る', $q$
  SELECT signage.portal_review_entry((SELECT id FROM t_ids WHERE k = 'e1'), 'approve')$q$, 'portal_approve_entry_checked');
SELECT pg_temp.check('2a2 断られた申請は申請済みのまま',
  (SELECT status = 'draft' FROM signage.portal_entries() WHERE id = (SELECT id FROM t_ids WHERE k = 'e1')));
SELECT pg_temp.expect_error('2b 古い版では承認できない（今までどおり）', $q$
  SELECT signage.portal_approve_entry_checked((SELECT id FROM t_ids WHERE k = 'e1'), now() - interval '1 second')$q$, '申請が修正されました');
SELECT pg_temp.check('2c 見た版を渡せば承認できる',
  (SELECT status = 'ready' AND reviewed_by = 'a0000000-0000-4000-8000-000000000006'
     FROM signage.portal_approve_entry_checked((SELECT id FROM t_ids WHERE k = 'e1'),
       (SELECT updated_at FROM signage.portal_entries() WHERE id = (SELECT id FROM t_ids WHERE k = 'e1')))));
SELECT pg_temp.check('2d 承認の後は印が下りている', coalesce(current_setting('signage.portal_approve_checked', true), '') <> 'on');
SELECT pg_temp.expect_error('2e 同じトランザクションで続けて直接承認しても断る（印が残らない）', $q$
  SELECT signage.portal_review_entry((SELECT id FROM t_ids WHERE k = 'e2'), 'approve')$q$, 'portal_approve_entry_checked');
SELECT pg_temp.check('2f 差戻しは portal_review_entry のまま通る',
  (SELECT status = 'pending' FROM signage.portal_review_entry((SELECT id FROM t_ids WHERE k = 'e2'), 'send_back', '日付')));

SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000001');
SELECT pg_temp.expect_error('2g 管理者も portal_review_entry で直接承認すると断る', $q$
  SELECT signage.portal_review_entry((SELECT id FROM t_ids WHERE k = 'e3'), 'approve')$q$, 'portal_approve_entry_checked');
UPDATE signage.signage_entries SET status = 'ready' WHERE id = (SELECT id FROM t_ids WHERE k = 'e3');
SELECT pg_temp.check('2h 管理者の直接 UPDATE による承認は今までどおり通る',
  (SELECT status = 'ready' FROM signage.signage_entries WHERE id = (SELECT id FROM t_ids WHERE k = 'e3')));
SELECT pg_temp.expect_error('2i 不明な操作は今までどおり断る', $q$
  SELECT signage.portal_review_entry((SELECT id FROM t_ids WHERE k = 'e3'), 'xxx')$q$, '不明な操作');

-- ============================================================
-- 1. 台なしの完了連絡の取り消し
-- ============================================================
-- 1a は、まだ c..03 が台を持たないうち（関係の無い保守会社）に確かめる
SELECT pg_temp.as_owner();
INSERT INTO signage.signage_inspection_completions (property_inspection_id, target_month, vendor_id, completed_by, property_unit_id)
VALUES ('2b84a9bd-b98e-4332-bd19-2973387bc13c', '2026-11-01', 'c0000000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-000000000002', NULL);
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000005');
SELECT pg_temp.expect_error('1a 関係の無い保守会社は台なしの完了連絡を取り消せない', $q$
  SELECT signage.portal_unmark_completed('2b84a9bd-b98e-4332-bd19-2973387bc13c', '2026-11-01', NULL)$q$, '権限がありません');
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000006');
SELECT pg_temp.expect_error('1b 管理会社は取り消せない（今までどおり）', $q$
  SELECT signage.portal_unmark_completed('2b84a9bd-b98e-4332-bd19-2973387bc13c', '2026-11-01', NULL)$q$, '権限がありません');

-- 準備: EV-2 に台の保守（c..03）を足して、点検 2b84a9bd を2台（EV-1 は c..01、EV-2 は c..03）にする
SELECT pg_temp.as_owner();
INSERT INTO biz.property_unit_inspections (unit_id, inspection_type_id, maintainer_id, inspection_months)
VALUES ('b0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000003', '{2,5,8,11}');

SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000005');
SELECT pg_temp.check('1c 台を1台だけ保守する会社も、他社が連絡した台なしの完了連絡を取り消せる',
  signage.portal_unmark_completed('2b84a9bd-b98e-4332-bd19-2973387bc13c', '2026-11-01', NULL));
SELECT pg_temp.check('1c2 取り消した行は消えている',
  NOT EXISTS (SELECT 1 FROM signage.portal_completions() c
               WHERE c.property_inspection_id = '2b84a9bd-b98e-4332-bd19-2973387bc13c' AND c.target_month = '2026-11-01'));

-- X12 の再現: c..03（EV-2 だけ保守）が連絡した台なしの完了連絡を、点検行と EV-1 を保守する c..01 が取り消す
SELECT pg_temp.as_owner();
INSERT INTO signage.signage_inspection_completions (property_inspection_id, target_month, vendor_id, completed_by, property_unit_id)
VALUES ('2b84a9bd-b98e-4332-bd19-2973387bc13c', '2026-11-01', 'c0000000-0000-4000-8000-000000000003',
        'a0000000-0000-4000-8000-000000000005', NULL);
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
SELECT pg_temp.check('1d 点検を保守する会社は、他社が連絡した台なしの完了連絡を取り消せる（X12）',
  signage.portal_unmark_completed('2b84a9bd-b98e-4332-bd19-2973387bc13c', '2026-11-01', NULL));

-- 台ごとの完了連絡は今どおり、連絡した保守会社か管理者だけ
SELECT pg_temp.check('1e 自社の台の完了連絡はできる',
  (SELECT property_unit_id = 'b0000000-0000-4000-8000-000000000001'
     FROM signage.portal_mark_completed_any_month('2b84a9bd-b98e-4332-bd19-2973387bc13c', '2026-11-01',
                                                  'b0000000-0000-4000-8000-000000000001')));
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000005');
SELECT pg_temp.expect_error('1f 他社の台の完了連絡は取り消せない（今までどおり）', $q$
  SELECT signage.portal_unmark_completed('2b84a9bd-b98e-4332-bd19-2973387bc13c', '2026-11-01',
                                         'b0000000-0000-4000-8000-000000000001')$q$, '連絡した保守会社か管理者だけ');
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
SELECT pg_temp.check('1g 連絡した保守会社は台の完了連絡を取り消せる',
  signage.portal_unmark_completed('2b84a9bd-b98e-4332-bd19-2973387bc13c', '2026-11-01', 'b0000000-0000-4000-8000-000000000001'));
SELECT pg_temp.check('1h 無い完了連絡の取り消しは false（今までどおり）',
  NOT signage.portal_unmark_completed('2b84a9bd-b98e-4332-bd19-2973387bc13c', '2026-11-01', NULL));

SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000001');
SELECT pg_temp.check('1i 管理者は台なしの完了連絡を出せる',
  (SELECT property_unit_id IS NULL
     FROM signage.portal_mark_completed_any_month('2b84a9bd-b98e-4332-bd19-2973387bc13c', '2026-11-01', NULL)));
SELECT pg_temp.check('1j 管理者は台なしの完了連絡を取り消せる',
  signage.portal_unmark_completed('2b84a9bd-b98e-4332-bd19-2973387bc13c', '2026-11-01', NULL));

-- ============================================================
-- 3. 権限（anon には実行権限が無い。定義を作り直しても ACL が変わらない）
-- ============================================================
SELECT pg_temp.as_owner();
SET LOCAL ROLE anon;
SELECT pg_temp.expect_error('3a anon は承認・差戻しできない', $q$SELECT signage.portal_review_entry(gen_random_uuid(), 'send_back', 'x')$q$, 'permission denied');
SELECT pg_temp.expect_error('3b anon は版つきで承認できない', $q$SELECT signage.portal_approve_entry_checked(gen_random_uuid(), now())$q$, 'permission denied');
SELECT pg_temp.expect_error('3c anon は完了連絡を取り消せない', $q$SELECT signage.portal_unmark_completed(gen_random_uuid(), '2026-11-01', NULL)$q$, 'permission denied');
SELECT pg_temp.as_owner();
SELECT pg_temp.check('3d 3つの関数は SECURITY DEFINER・重複定義なし',
  (SELECT count(*) = 3 AND bool_and(prosecdef) FROM pg_proc
    WHERE pronamespace = 'signage'::regnamespace
      AND proname IN ('portal_review_entry', 'portal_approve_entry_checked', 'portal_unmark_completed')));

DO $$ BEGIN RAISE NOTICE 'OK（fix-1026-followups の確かめが全部通った）'; END $$;
ROLLBACK;
