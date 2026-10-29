-- fix-1029-detail.sql の確かめ（ローカル DB 用。最後に ROLLBACK するので何も残らない）
-- 流し方: psql <ローカル DB> -X -v ON_ERROR_STOP=1 -f scripts/test-fix-1029-detail.sql
--   どれか1つでも期待と違えば例外で止まる。全部通れば最後に「OK」の NOTICE が出る。
-- 前提: fix-1029-detail.sql を流してあること。ローカルの検証用アカウント（admin a..01・user@ a..02〔c..01〕・user-b a..05〔c..03〕）、
--   物件 e..01（120409-00。エレベーター定期点検 2b84…〔c..01〕・消防設備点検 2124…〔c..02〕・定期清掃 4343…〔c..03〕、台 b..01・b..02）。
--   申請と台の保守はこの中で足して戻す。
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

-- 期待どおり断られるか（SQLSTATE も確かめる）
CREATE FUNCTION pg_temp.expect_denied(p_sql text, p_state text, p_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> p_state THEN
      RAISE EXCEPTION '% : % で断られるはずが % (%)', p_label, p_state, SQLSTATE, SQLERRM;
    END IF;
    RAISE NOTICE 'denied ok: % (%)', p_label, SQLERRM;
    RETURN;
  END;
  RAISE EXCEPTION '% : 通ってしまった', p_label;
END $$;

-- 申請（user@ のもの。owner で入れる＝ガードの対象外）
--   linked: エレベーター定期点検の点検に紐付いた申請 / loose: 紐付けの無い担当外の種別（デジタルサイネージ点検）の申請
INSERT INTO signage.signage_entries (id, user_id, property_code, terminal_id, vendor_name, vendor_id, inspection_type, template_no,
                                     property_inspection_id, target_month, status, inspection_start)
VALUES
  ('d1029000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', '120409-00', '', '検証エレベーター保守株式会社',
   'c0000000-0000-4000-8000-000000000001', 'エレベーター定期点検', 'elevator_inspection',
   '2b84a9bd-b98e-4332-bd19-2973387bc13c', '2026-11-01', 'pending', '2026-11-05'),
  ('d1029000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002', '120409-00', '', '検証エレベーター保守株式会社',
   'c0000000-0000-4000-8000-000000000001', 'デジタルサイネージ点検', 'Construction_without_sound',
   NULL, NULL, 'pending', '2026-11-05');

DO $$
DECLARE
  n int;
BEGIN
  PERFORM pg_temp.act_as('a0000000-0000-4000-8000-000000000002');

  -- (1) 紐付けた点検と種別が違う INSERT は断る
  PERFORM pg_temp.expect_denied($q$
    INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, vendor_id, inspection_type, template_no,
                                         property_inspection_id, target_month, status, inspection_start)
    VALUES ('a0000000-0000-4000-8000-000000000002', '120409-00', '', '検証エレベーター保守株式会社', 'c0000000-0000-4000-8000-000000000001',
            '消防設備点検', 'fire_inspection', '2b84a9bd-b98e-4332-bd19-2973387bc13c', '2026-12-01', 'draft', '2026-12-05')$q$,
    '22023', 'INSERT 紐付けと種別の食い違い');
  -- (1) 紐付けた点検の種別でも、テンプレートNo が違えば断る
  PERFORM pg_temp.expect_denied($q$
    INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, vendor_id, inspection_type, template_no,
                                         property_inspection_id, target_month, status, inspection_start)
    VALUES ('a0000000-0000-4000-8000-000000000002', '120409-00', '', '検証エレベーター保守株式会社', 'c0000000-0000-4000-8000-000000000001',
            'エレベーター定期点検', 'fire_inspection', '2b84a9bd-b98e-4332-bd19-2973387bc13c', '2026-12-01', 'draft', '2026-12-05')$q$,
    '22023', 'INSERT テンプレートNo の食い違い');
  -- 紐付けた点検と合う INSERT は通る
  INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, vendor_id, inspection_type, template_no,
                                       property_inspection_id, target_month, status, inspection_start)
  VALUES ('a0000000-0000-4000-8000-000000000002', '120409-00', '', '検証エレベーター保守株式会社', 'c0000000-0000-4000-8000-000000000001',
          'エレベーター定期点検', 'elevator_inspection', '2b84a9bd-b98e-4332-bd19-2973387bc13c', '2026-12-01', 'draft', '2026-12-05');
  -- 紐付けの無い INSERT は種別を問わず今までどおり通る（工事の案内など）
  INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, inspection_type, template_no, status, inspection_start)
  VALUES ('a0000000-0000-4000-8000-000000000002', '120409-00', '', '検証エレベーター保守株式会社', '外壁補修工事',
          'construction_building_large_scale', 'draft', '2026-12-05');

  -- (1) 紐付けたまま種別だけ変える UPDATE は断る
  PERFORM pg_temp.expect_denied($q$
    UPDATE signage.signage_entries SET inspection_type = '定期清掃', template_no = 'cleaning'
     WHERE id = 'd1029000-0000-4000-8000-000000000001'$q$,
    '22023', 'UPDATE 紐付けたまま種別を変える');
  -- (2) 紐付けを外して担当外の種別（定期清掃は c..03 の点検）へ変える UPDATE は断る
  PERFORM pg_temp.expect_denied($q$
    UPDATE signage.signage_entries SET inspection_type = '定期清掃', template_no = 'cleaning', property_inspection_id = NULL
     WHERE id = 'd1029000-0000-4000-8000-000000000001'$q$,
    '42501', 'UPDATE 担当外の種別へ');
  -- (2) 紐付けの無い申請でも、担当外の種別へは変えられない
  PERFORM pg_temp.expect_denied($q$
    UPDATE signage.signage_entries SET inspection_type = '消防設備点検', template_no = 'fire_inspection'
     WHERE id = 'd1029000-0000-4000-8000-000000000002'$q$,
    '42501', 'UPDATE 紐付け無し・担当外の種別へ');
  -- (2) 担当の種別でも、テンプレートNo が違えば断る
  PERFORM pg_temp.expect_denied($q$
    UPDATE signage.signage_entries SET inspection_type = 'エレベーター定期点検', template_no = 'cleaning'
     WHERE id = 'd1029000-0000-4000-8000-000000000002'$q$,
    '22023', 'UPDATE テンプレートNo の食い違い');
  -- (3) テンプレートNo だけを別の種別のものに書き換える UPDATE も断る（担当外の種別の既存の申請）
  PERFORM pg_temp.expect_denied($q$
    UPDATE signage.signage_entries SET template_no = 'elevator_inspection'
     WHERE id = 'd1029000-0000-4000-8000-000000000002'$q$,
    '22023', 'UPDATE 担当外の種別の申請のテンプレートNo だけ');
  -- テンプレートNo を空にしてから、その種別のテンプレートNo を入れ直す（再申請で旧来の空の申請に入るのと同じ）は通る
  UPDATE signage.signage_entries SET template_no = NULL WHERE id = 'd1029000-0000-4000-8000-000000000002';
  UPDATE signage.signage_entries SET template_no = 'Construction_without_sound' WHERE id = 'd1029000-0000-4000-8000-000000000002';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION '種別のテンプレートNo を入れ直す更新が通らない (%)', n; END IF;

  -- 種別・テンプレートNo・紐付けを変えない UPDATE は、担当外の種別の既存の申請でも通る（既存の申請を壊さない）
  UPDATE signage.signage_entries SET remarks = '午前中' WHERE id = 'd1029000-0000-4000-8000-000000000002';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION '備考だけの更新が通らない (%)', n; END IF;
  -- 担当の種別へ、その種別のテンプレートNo で変える UPDATE は通る
  UPDATE signage.signage_entries SET inspection_type = 'エレベーター定期点検', template_no = 'elevator_inspection'
   WHERE id = 'd1029000-0000-4000-8000-000000000002';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION '担当の種別への更新が通らない (%)', n; END IF;
  -- 担当の点検の種別へ、紐付けごと付け替える UPDATE は通る（定期清掃→エレベーターではなく、エレベーター→エレベーター〔12月〕の付け替えを兼ねる）
  UPDATE signage.signage_entries SET property_inspection_id = '2b84a9bd-b98e-4332-bd19-2973387bc13c', target_month = '2027-01-01'
   WHERE id = 'd1029000-0000-4000-8000-000000000002';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION '担当の点検への紐付けが通らない (%)', n; END IF;
  RAISE NOTICE 'user@ ok';
END $$;

-- 台ごとの保守の保守会社も「担当」: 物件 e..01 に消防設備の台を足し、その台の消防設備点検を c..01 が保守すると、
-- c..01 は消防設備点検（点検行の保守会社は c..02）へ変えられる
SELECT pg_temp.as_owner();
INSERT INTO biz.property_units (id, property_id, category_code, unit_code)
VALUES ('b1029000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'fire_inspection', 'FIRE-1');
INSERT INTO biz.property_unit_inspections (unit_id, inspection_type_id, maintainer_id)
VALUES ('b1029000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001')
ON CONFLICT (unit_id, inspection_type_id) DO UPDATE SET maintainer_id = EXCLUDED.maintainer_id;
UPDATE signage.signage_entries SET property_inspection_id = NULL, target_month = NULL WHERE id = 'd1029000-0000-4000-8000-000000000002';

DO $$
DECLARE
  n int;
BEGIN
  PERFORM pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
  UPDATE signage.signage_entries SET inspection_type = '消防設備点検', template_no = 'fire_inspection'
   WHERE id = 'd1029000-0000-4000-8000-000000000002';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION '台の保守会社の種別への更新が通らない (%)', n; END IF;

  -- 別の保守会社（user-b〔c..03〕）は自社の申請でなければそもそも見えない。自社の申請で c..01 の種別へは変えられない
  PERFORM pg_temp.as_owner();
  INSERT INTO signage.signage_entries (id, user_id, property_code, terminal_id, vendor_name, vendor_id, inspection_type, template_no, status)
  VALUES ('d1029000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000005', '120409-00', '', '検証清掃サービス株式会社',
          'c0000000-0000-4000-8000-000000000003', '定期清掃', 'cleaning', 'pending');
  PERFORM pg_temp.act_as('a0000000-0000-4000-8000-000000000005');
  PERFORM pg_temp.expect_denied($q$
    UPDATE signage.signage_entries SET inspection_type = 'エレベーター定期点検', template_no = 'elevator_inspection'
     WHERE id = 'd1029000-0000-4000-8000-000000000003'$q$,
    '42501', 'UPDATE 他社の担当の種別へ');

  -- 管理者は止めない（紐付けと食い違う種別にも変えられる）
  PERFORM pg_temp.act_as('a0000000-0000-4000-8000-000000000001');
  UPDATE signage.signage_entries SET inspection_type = '定期清掃', template_no = 'cleaning'
   WHERE id = 'd1029000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION '管理者の更新が通らない (%)', n; END IF;
  PERFORM pg_temp.as_owner();
  RAISE NOTICE 'OK';
END $$;

ROLLBACK;
