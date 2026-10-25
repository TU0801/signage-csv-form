-- fix-1025-building.sql の guard_entry_property_request の確かめ（ローカル DB 用。最後に ROLLBACK するので何も残らない）
-- 流し方: psql <ローカル DB> -X -v ON_ERROR_STOP=1 -f scripts/test-fix-1025-building-guard.sql
--   どれか1つでも期待と違えば例外で止まる。全部通れば最後に「OK」の NOTICE が出る。
-- 前提: ローカルの検証用アカウント（admin@verify.local・user@verify.local・mgmt@verify.local）と保守会社・管理会社があること。
-- 確かめること（自動セキュリティレビューの指摘 1025 building）:
--   1. 仮のコード（REQ-）の掲示を、建物追加の申請から外す（NULL）・別の申請へ付け替える更新は、保守会社・管理者とも止まる。
--      管理会社は掲示の申請を更新できない（UPDATE のポリシーが無く 0 件）。
--   2. 仮のコードの掲示は、申請の結び付きの有無にかかわらず承認（ready）・取込済み（exported）にできない（管理者も）。
--   3. 承認の関数（approve_property_request）の付け替えは通り、その後は管理者が承認できる。
BEGIN;

INSERT INTO signage.signage_property_requests (id, vendor_id, management_company_id, property_name, status, requested_by)
VALUES ('aaaaaaaa-1111-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000009', 'TEST1025検証A', 'pending', 'a0000000-0000-4000-8000-000000000002'),
       ('bbbbbbbb-2222-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000009', 'TEST1025検証B', 'pending', 'a0000000-0000-4000-8000-000000000002');

CREATE FUNCTION pg_temp.act_as(p_uid text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
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

-- p_sql が1件も変えないこと（変えたら失敗）
CREATE FUNCTION pg_temp.expect_no_rows(p_label text, p_sql text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  EXECUTE p_sql;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN
    RAISE EXCEPTION 'NG (% 件変わった) %', n, p_label;
  END IF;
  RAISE NOTICE 'ok (0 件) %', p_label;
END $$;

DO $$
DECLARE
  e text := 'eeeeeeee-0000-4000-8000-000000000001';
  e_orphan text := 'eeeeeeee-0000-4000-8000-000000000002';
  who text;
  rec record;
BEGIN
  -- 保守会社の利用者として仮のコードの掲示を出す（画面と同じ INSERT）
  PERFORM pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
  INSERT INTO signage.signage_entries (id, user_id, property_code, terminal_id, vendor_name, inspection_type, status, property_request_id, vendor_id)
  VALUES (e::uuid, 'a0000000-0000-4000-8000-000000000002', 'REQ-aaaaaaaa', '', 'v', 'x', 'pending',
          'aaaaaaaa-1111-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001'),
         (e_orphan::uuid, 'a0000000-0000-4000-8000-000000000002', 'REQ-bbbbbbbb', '', 'v', 'x', 'pending',
          'bbbbbbbb-2222-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001');

  -- 1・2: 保守会社・管理者
  FOREACH who IN ARRAY ARRAY['a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001'] LOOP
    PERFORM pg_temp.act_as(who);
    PERFORM pg_temp.expect_error(who || ' 結び付きを外す',
      format('UPDATE signage.signage_entries SET property_request_id = NULL WHERE id = %L', e));
    PERFORM pg_temp.expect_error(who || ' 別の申請へ付け替え（コードはそのまま）',
      format('UPDATE signage.signage_entries SET property_request_id = %L WHERE id = %L', 'bbbbbbbb-2222-4000-8000-000000000002', e));
    PERFORM pg_temp.expect_error(who || ' 別の申請へ付け替え（コードも合わせる）',
      format('UPDATE signage.signage_entries SET property_request_id = %L, property_code = %L WHERE id = %L',
             'bbbbbbbb-2222-4000-8000-000000000002', 'REQ-bbbbbbbb', e));
    PERFORM pg_temp.expect_error(who || ' 承認（ready）',
      format('UPDATE signage.signage_entries SET status = %L WHERE id = %L', 'ready', e));
    PERFORM pg_temp.expect_error(who || ' 取込済み（exported）',
      format('UPDATE signage.signage_entries SET status = %L WHERE id = %L', 'exported', e));
    PERFORM pg_temp.expect_error(who || ' 結び付きを外して承認',
      format('UPDATE signage.signage_entries SET property_request_id = NULL, status = %L WHERE id = %L', 'ready', e));
  END LOOP;

  -- 1・2: 管理会社（申請の管理会社）は掲示の申請を更新できない
  PERFORM pg_temp.act_as('a0000000-0000-4000-8000-000000000006');
  PERFORM pg_temp.expect_no_rows('管理会社 結び付きを外す',
    format('UPDATE signage.signage_entries SET property_request_id = NULL WHERE id = %L', e));
  PERFORM pg_temp.expect_no_rows('管理会社 承認（ready）',
    format('UPDATE signage.signage_entries SET status = %L WHERE id = %L', 'ready', e));

  -- 2: 結び付きの無い仮のコードの行（申請の行が消えて外部キーで NULL になった）も、管理者が承認・取込済みにできない
  PERFORM pg_temp.as_owner();
  DELETE FROM signage.signage_property_requests WHERE id = 'bbbbbbbb-2222-4000-8000-000000000002';
  SELECT property_code, property_request_id INTO rec FROM signage.signage_entries WHERE id = e_orphan::uuid;
  IF rec.property_code <> 'REQ-bbbbbbbb' OR rec.property_request_id IS NOT NULL THEN
    RAISE EXCEPTION 'NG 前提: 結び付きの無い仮のコードの行が作れていない %', rec;
  END IF;
  PERFORM pg_temp.act_as('a0000000-0000-4000-8000-000000000001');
  PERFORM pg_temp.expect_error('管理者 結び付きの無い仮のコードを承認（ready）',
    format('UPDATE signage.signage_entries SET status = %L WHERE id = %L', 'ready', e_orphan));
  PERFORM pg_temp.expect_error('管理者 結び付きの無い仮のコードを取込済み（exported）',
    format('UPDATE signage.signage_entries SET status = %L WHERE id = %L', 'exported', e_orphan));

  -- 3: 承認の関数の付け替えは通る
  PERFORM signage.approve_property_request('aaaaaaaa-1111-4000-8000-000000000001', 'TEST1025-01', NULL);
  PERFORM pg_temp.as_owner();
  SELECT property_code, property_request_id, status INTO rec FROM signage.signage_entries WHERE id = e::uuid;
  IF rec.property_code <> 'TEST1025-01' OR rec.property_request_id IS DISTINCT FROM 'aaaaaaaa-1111-4000-8000-000000000001'::uuid
     OR rec.status <> 'pending' THEN
    RAISE EXCEPTION 'NG 承認の付け替え: %', rec;
  END IF;
  RAISE NOTICE 'ok 承認の付け替え: %', rec;
  PERFORM pg_temp.act_as('a0000000-0000-4000-8000-000000000001');
  UPDATE signage.signage_entries SET status = 'ready' WHERE id = e::uuid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NG 付け替え後に管理者が承認できない';
  END IF;
  PERFORM pg_temp.as_owner();
  RAISE NOTICE 'OK: guard_entry_property_request の確かめはすべて通った';
END $$;

ROLLBACK;
