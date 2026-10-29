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
  -- (3) 紐付けの無い INSERT でも、テンプレートNo が種別のものでなければ断る
  PERFORM pg_temp.expect_denied($q$
    INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, inspection_type, template_no, status, inspection_start)
    VALUES ('a0000000-0000-4000-8000-000000000002', '120409-00', '', '検証エレベーター保守株式会社', '消防設備点検',
            'cleaning', 'pending', '2026-12-05')$q$,
    '22023', 'INSERT 紐付け無しでテンプレートNo の食い違い');

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

-- 申請済み（承認前）の申請の修正で点検種別・テンプレートNo・紐付けを直す（portal_update_submitted_entry。ユーザー決定④）
-- 上で足した消防設備の台 FIRE-1（c..01 が保守）で、c..01 は物件 e..01 の消防設備点検（2124…）も担当。
-- 申請 d..04: user@ のエレベーター定期点検（2b84…）・2026年12月・承認待ち（draft）
SELECT pg_temp.as_owner();
INSERT INTO signage.signage_entries (id, user_id, property_code, terminal_id, vendor_name, vendor_id, inspection_type, template_no,
                                     property_inspection_id, target_month, status, inspection_start)
VALUES ('d1029000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000002', '120409-00', '', '検証エレベーター保守株式会社',
        'c0000000-0000-4000-8000-000000000001', 'エレベーター定期点検', 'elevator_inspection',
        '2b84a9bd-b98e-4332-bd19-2973387bc13c', '2026-12-01', 'draft', '2026-12-03');

DO $$
DECLARE
  r signage.signage_entries;
  v_fire constant text := '2124a983-8f13-4323-9eea-67f36bedf3d3';
BEGIN
  -- REST の anon は呼べない
  IF has_function_privilege('anon', 'signage.portal_update_submitted_entry(uuid, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon が portal_update_submitted_entry を呼べる';
  END IF;
  PERFORM pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
  -- 担当外の種別（定期清掃は c..03 の点検）へは、その種別の点検に紐付けても変えられない
  PERFORM pg_temp.expect_denied($q$
    SELECT signage.portal_update_submitted_entry('d1029000-0000-4000-8000-000000000004',
      '{"inspection_type":"定期清掃","template_no":"cleaning","property_inspection_id":"4343bb34-0832-4275-a507-6d18115ec3e5"}')$q$,
    '42501', 'RPC 担当外の種別へ');
  -- テンプレートNo が種別のものでない
  PERFORM pg_temp.expect_denied($q$
    SELECT signage.portal_update_submitted_entry('d1029000-0000-4000-8000-000000000004',
      '{"inspection_type":"消防設備点検","template_no":"cleaning","property_inspection_id":"2124a983-8f13-4323-9eea-67f36bedf3d3"}')$q$,
    '22023', 'RPC テンプレートNo の食い違い');
  -- 種別だけ変えて紐付けを前の点検のままにする
  PERFORM pg_temp.expect_denied($q$
    SELECT signage.portal_update_submitted_entry('d1029000-0000-4000-8000-000000000004',
      '{"inspection_type":"消防設備点検","template_no":"fire_inspection"}')$q$,
    '22023', 'RPC 紐付けと種別の食い違い');
  -- 別の物件の点検（T1024-01 の c..01 のエレベーター定期点検）へは付け替えられない
  PERFORM pg_temp.expect_denied($q$
    SELECT signage.portal_update_submitted_entry('d1029000-0000-4000-8000-000000000004',
      '{"property_inspection_id":"fde97cc9-6848-4660-a8c2-e8382185092e"}')$q$,
    '22023', 'RPC 別の物件の点検へ');
  -- 紐付けを外せない
  PERFORM pg_temp.expect_denied($q$
    SELECT signage.portal_update_submitted_entry('d1029000-0000-4000-8000-000000000004', '{"property_inspection_id":null}')$q$,
    '22023', 'RPC 紐付けを外す');
  -- 台は付け替え先の点検の台だけ（EV-1 はエレベーターの台）
  PERFORM pg_temp.expect_denied($q$
    SELECT signage.portal_update_submitted_entry('d1029000-0000-4000-8000-000000000004',
      '{"inspection_type":"消防設備点検","template_no":"fire_inspection","property_inspection_id":"2124a983-8f13-4323-9eea-67f36bedf3d3",
        "property_unit_id":"b0000000-0000-4000-8000-000000000001"}')$q$,
    '22023', 'RPC 別の点検の台');
  -- 他社（user-b・c..03）は user@ の申請を直せない
  PERFORM pg_temp.act_as('a0000000-0000-4000-8000-000000000005');
  PERFORM pg_temp.expect_denied($q$
    SELECT signage.portal_update_submitted_entry('d1029000-0000-4000-8000-000000000004',
      '{"inspection_type":"消防設備点検","template_no":"fire_inspection","property_inspection_id":"2124a983-8f13-4323-9eea-67f36bedf3d3"}')$q$,
    '42501', 'RPC 他社の申請');

  -- 付け替え先の点検・同じ月に承認待ちの申請があれば断る（二重の申請にしない）
  PERFORM pg_temp.as_owner();
  INSERT INTO signage.signage_entries (id, user_id, property_code, terminal_id, vendor_name, vendor_id, inspection_type, template_no,
                                       property_inspection_id, target_month, status, inspection_start)
  VALUES ('d1029000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000002', '120409-00', '', '検証エレベーター保守株式会社',
          'c0000000-0000-4000-8000-000000000001', '消防設備点検', 'fire_inspection', v_fire::uuid, '2026-12-01', 'draft', '2026-12-04');
  PERFORM pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
  PERFORM pg_temp.expect_denied($q$
    SELECT signage.portal_update_submitted_entry('d1029000-0000-4000-8000-000000000004',
      '{"inspection_type":"消防設備点検","template_no":"fire_inspection","property_inspection_id":"2124a983-8f13-4323-9eea-67f36bedf3d3"}')$q$,
    '22023', 'RPC 付け替え先の月に申請がある');
  -- 台なしの申請は全部の台に効く: 台なしの申請がある月へ、台（FIRE-1）を付けて付け替えても断る
  PERFORM pg_temp.expect_denied($q$
    SELECT signage.portal_update_submitted_entry('d1029000-0000-4000-8000-000000000004',
      '{"inspection_type":"消防設備点検","template_no":"fire_inspection","property_inspection_id":"2124a983-8f13-4323-9eea-67f36bedf3d3",
        "property_unit_id":"b1029000-0000-4000-8000-000000000001"}')$q$,
    '22023', 'RPC 台なしの申請がある月へ台ありで');
  -- 逆向き: 台（FIRE-1）の申請がある月へ、台なしで付け替えても断る
  PERFORM pg_temp.as_owner();
  UPDATE signage.signage_entries SET property_unit_id = 'b1029000-0000-4000-8000-000000000001'
   WHERE id = 'd1029000-0000-4000-8000-000000000005';
  PERFORM pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
  PERFORM pg_temp.expect_denied($q$
    SELECT signage.portal_update_submitted_entry('d1029000-0000-4000-8000-000000000004',
      '{"inspection_type":"消防設備点検","template_no":"fire_inspection","property_inspection_id":"2124a983-8f13-4323-9eea-67f36bedf3d3"}')$q$,
    '22023', 'RPC 台ありの申請がある月へ台なしで');
  PERFORM pg_temp.as_owner();
  DELETE FROM signage.signage_entries WHERE id = 'd1029000-0000-4000-8000-000000000005';

  -- 付け替え先が2台以上の点検なら台を決める（台なしは断る）
  INSERT INTO biz.property_units (id, property_id, category_code, unit_code)
  VALUES ('b1029000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', 'fire_inspection', 'FIRE-2');
  INSERT INTO biz.property_unit_inspections (unit_id, inspection_type_id, maintainer_id)
  VALUES ('b1029000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001')
  ON CONFLICT (unit_id, inspection_type_id) DO UPDATE SET maintainer_id = EXCLUDED.maintainer_id;
  PERFORM pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
  PERFORM pg_temp.expect_denied($q$
    SELECT signage.portal_update_submitted_entry('d1029000-0000-4000-8000-000000000004',
      '{"inspection_type":"消防設備点検","template_no":"fire_inspection","property_inspection_id":"2124a983-8f13-4323-9eea-67f36bedf3d3"}')$q$,
    '22023', 'RPC 2台以上の点検に台なし');

  -- 担当の種別へ、その種別のテンプレートNo・その種別の点検・自社の台で付け替えると通り、承認待ちのまま
  r := signage.portal_update_submitted_entry('d1029000-0000-4000-8000-000000000004',
    jsonb_build_object('inspection_type', '消防設備点検', 'template_no', 'fire_inspection', 'property_inspection_id', v_fire,
                       'property_unit_id', 'b1029000-0000-4000-8000-000000000001', 'remarks', '種別を変えた'));
  IF r.inspection_type <> '消防設備点検' OR r.template_no <> 'fire_inspection' OR r.property_inspection_id::text <> v_fire
     OR r.property_unit_id::text <> 'b1029000-0000-4000-8000-000000000001' OR r.status <> 'draft'
     OR r.target_month <> '2026-12-01' OR r.remarks <> '種別を変えた' THEN
    RAISE EXCEPTION '付け替えの結果が違う: %', row_to_json(r);
  END IF;
  -- 監査ログに残る（audit_trigger は今どおり）
  PERFORM pg_temp.as_owner();
  IF NOT EXISTS (SELECT 1 FROM signage.signage_audit_logs WHERE record_id::text = 'd1029000-0000-4000-8000-000000000004' AND operation = 'UPDATE') THEN
    RAISE EXCEPTION '修正が監査ログに残らない';
  END IF;

  -- 付け替えた後に、付け替え先の点検・同じ月・同じ台へ新しく申請（INSERT）しても断る（一括入力で付け替え先の行から申請したとき）
  PERFORM pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
  PERFORM pg_temp.expect_denied($q$
    INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, vendor_id, inspection_type, template_no,
                                         property_inspection_id, property_unit_id, target_month, status, inspection_start)
    VALUES ('a0000000-0000-4000-8000-000000000002', '120409-00', '', '検証エレベーター保守株式会社', 'c0000000-0000-4000-8000-000000000001',
            '消防設備点検', 'fire_inspection', '2124a983-8f13-4323-9eea-67f36bedf3d3', 'b1029000-0000-4000-8000-000000000001',
            '2026-12-01', 'draft', '2026-12-12')$q$,
    '23505', 'INSERT 付け替えた申請と同じ点検・月・台');
  -- 別の台（FIRE-2）なら同じ点検・月でも申請できる
  INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, vendor_id, inspection_type, template_no,
                                       property_inspection_id, property_unit_id, target_month, status, inspection_start)
  VALUES ('a0000000-0000-4000-8000-000000000002', '120409-00', '', '検証エレベーター保守株式会社', 'c0000000-0000-4000-8000-000000000001',
          '消防設備点検', 'fire_inspection', '2124a983-8f13-4323-9eea-67f36bedf3d3', 'b1029000-0000-4000-8000-000000000002',
          '2026-12-01', 'draft', '2026-12-12');
  -- 台なしの申請は全部の台と重なる（管理者の台なしの INSERT も断る）
  PERFORM pg_temp.act_as('a0000000-0000-4000-8000-000000000001');
  PERFORM pg_temp.expect_denied($q$
    INSERT INTO signage.signage_entries (user_id, property_code, terminal_id, vendor_name, vendor_id, inspection_type, template_no,
                                         property_inspection_id, target_month, status, inspection_start)
    VALUES ('a0000000-0000-4000-8000-000000000001', '120409-00', '', '検証エレベーター保守株式会社', 'c0000000-0000-4000-8000-000000000001',
            '消防設備点検', 'fire_inspection', '2124a983-8f13-4323-9eea-67f36bedf3d3', '2026-12-01', 'draft', '2026-12-12')$q$,
    '23505', 'INSERT 台ありの申請がある月へ台なし（管理者）');
  PERFORM pg_temp.as_owner();
  RAISE NOTICE 'RPC ok';
END $$;

ROLLBACK;
