-- fix-1027-bulk.sql の確かめ（ローカル DB 用。最後に ROLLBACK するので何も残らない）
-- 流し方: psql <ローカル DB> -X -v ON_ERROR_STOP=1 -f scripts/test-fix-1027-bulk.sql
--   どれか1つでも期待と違えば例外で止まる。全部通れば最後に「OK」の NOTICE が出る。
-- 前提: fix-1027-bulk.sql を流してあること。ローカルの検証用アカウント（admin a..01・user@ a..02〔c..01〕・user-b a..05〔c..03〕・
--   mgmt@ a..06）、物件 e..01（120409-00。エレベーター定期点検 c..01・消防設備点検 c..02・定期清掃 c..03）、取引先 c..01（略称「検証EV」）。
--   点検行はこの中で足して戻す。
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

DO $$
DECLARE
  r jsonb;
  ids text[];
  ev uuid; clean uuid;
  denied boolean;
BEGIN
  -- 物件 e..01 に c..01 の点検を2つ足す: 外壁補修工事（大分類なし・いちばん古い登録）とデジタルサイネージ点検（大分類 signage）。
  -- 並びは 大分類の sort（elevator 1 → signage 3 → 大分類なし）→ 登録順 なので、エレベーター → サイネージ → 外壁 になる
  PERFORM pg_temp.as_owner();
  INSERT INTO biz.property_inspections (property_id, inspection_type_id, maintainer_id, created_at)
  VALUES ('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000006', 'c0000000-0000-4000-8000-000000000001', '2020-01-01')
  RETURNING id INTO clean;
  INSERT INTO biz.property_inspections (property_id, inspection_type_id, maintainer_id, created_at)
  VALUES ('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000001', '2030-01-01');
  SELECT id INTO ev FROM biz.property_inspections
   WHERE property_id = 'e0000000-0000-4000-8000-000000000001' AND inspection_type_id = 'f0000000-0000-4000-8000-000000000001';

  -- 1. 保守会社のアカウント（user@ = c..01）: 略称と自社の点検だけ。引数の別会社は見ない
  PERFORM pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
  r := signage.bulk_template_info('c0000000-0000-4000-8000-000000000003');
  IF r->>'short_name' IS DISTINCT FROM '検証EV' THEN RAISE EXCEPTION 'NG 1 short_name: %', r; END IF;
  PERFORM pg_temp.as_owner();  -- 点検行の中身は所有者で読む（authenticated は biz を読めない）
  SELECT array_agg(t.label ORDER BY o.n) INTO ids
    FROM jsonb_array_elements_text(r->'inspection_ids') WITH ORDINALITY o(id, n)
    JOIN biz.property_inspections pi ON pi.id = o.id::uuid
    JOIN biz.inspection_types t ON t.id = pi.inspection_type_id
   WHERE pi.property_id = 'e0000000-0000-4000-8000-000000000001';
  IF ids IS DISTINCT FROM ARRAY['エレベーター定期点検', 'デジタルサイネージ点検', '外壁補修工事'] THEN
    RAISE EXCEPTION 'NG 1 並び: %', ids;
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(r->'inspection_ids') o(id)
             JOIN biz.property_inspections pi ON pi.id = o.id::uuid
             WHERE pi.maintainer_id IS DISTINCT FROM 'c0000000-0000-4000-8000-000000000001'
               AND NOT EXISTS (SELECT 1 FROM biz.property_unit_inspections ui JOIN biz.property_units u ON u.id = ui.unit_id
                               WHERE u.property_id = pi.property_id AND ui.inspection_type_id = pi.inspection_type_id
                                 AND ui.maintainer_id = 'c0000000-0000-4000-8000-000000000001')) THEN
    RAISE EXCEPTION 'NG 1 他社の点検が入った: %', r;
  END IF;
  RAISE NOTICE 'ok 1 保守会社: 略称・自社の点検・設備の並び';

  -- 2. 管理者: 引数の保守会社（c..03 = 定期清掃の会社。略称「検証清掃」）
  PERFORM pg_temp.act_as('a0000000-0000-4000-8000-000000000001');
  r := signage.bulk_template_info('c0000000-0000-4000-8000-000000000003');
  IF r->>'short_name' IS DISTINCT FROM '検証清掃' THEN RAISE EXCEPTION 'NG 2 short_name: %', r; END IF;
  IF (r->'inspection_ids') @> to_jsonb(ev::text) OR jsonb_array_length(r->'inspection_ids') = 0 THEN
    RAISE EXCEPTION 'NG 2 点検: %', r;
  END IF;
  -- 保守会社を選んでいない（null）は空
  r := signage.bulk_template_info(NULL);
  IF r IS DISTINCT FROM '{"short_name": null, "inspection_ids": []}'::jsonb THEN RAISE EXCEPTION 'NG 2 null: %', r; END IF;
  RAISE NOTICE 'ok 2 管理者: 選んだ保守会社・未選択は空';

  -- 3. 略称が空なら名前
  PERFORM pg_temp.as_owner();
  UPDATE biz.companies SET short_name = '  ' WHERE id = 'c0000000-0000-4000-8000-000000000001';
  PERFORM pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
  r := signage.bulk_template_info(NULL);
  IF r->>'short_name' IS DISTINCT FROM '検証エレベーター保守株式会社' THEN RAISE EXCEPTION 'NG 3: %', r; END IF;
  RAISE NOTICE 'ok 3 略称が空なら名前';

  -- 4. 管理会社は断る
  PERFORM pg_temp.act_as('a0000000-0000-4000-8000-000000000006');
  denied := false;
  BEGIN
    PERFORM signage.bulk_template_info('c0000000-0000-4000-8000-000000000001');
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'NG 4 管理会社が通った'; END IF;
  RAISE NOTICE 'ok 4 管理会社は断る';

  -- 5. anon は実行できない
  PERFORM pg_temp.as_owner();
  IF has_function_privilege('anon', 'signage.bulk_template_info(uuid)', 'execute') THEN RAISE EXCEPTION 'NG 5 anon に実行権'; END IF;
  IF NOT has_function_privilege('authenticated', 'signage.bulk_template_info(uuid)', 'execute') THEN RAISE EXCEPTION 'NG 5 authenticated に実行権なし'; END IF;
  RAISE NOTICE 'ok 5 権限';

  RAISE NOTICE 'OK';
END $$;

ROLLBACK;
