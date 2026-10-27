-- 修正依頼1027(7) マスター管理（物件タブ・物件を編集）
-- 2026-10-27 作成。本番へは未適用（適用はユーザー承認後）。ローカル DB（signage-v2-verify）で確かめた（scripts/test-fix-1027-master.sql）。
-- 適用方法: ファイル全体を1つのクエリとして流す（Management API なら1回の query に全文を入れる。psql なら psql -1 -f）。
--   BEGIN/COMMIT は付けない。先頭の lock_timeout で、ロックが取れないときは待ち続けずに失敗させる。何度流しても同じ結果になる。
--   既存の関数は変えない（新しい関数を足すだけ。既存の RPC の引数・戻り値の形は変えないので v1 と並列の他担当に影響しない）。
--   権限の判定は本番の signage.set_property_inspection_inspected_on / property_inspection_dates /
--   master_property_management_companies（2026-10-27 に pg_get_functiondef で読んだもの）と同じ形にそろえた。
--
-- 1. master_property_codes: 物件コード → 業務システムの物件（id）とマンションコード（補助）＝ biz.properties.en_no。
--    一覧と物件を編集に「マンションコード（補助）」を出す（読み取りだけ。正本は業務システム）。管理者は全件、管理会社は自社物件。
-- 2. master_inspection_schedules: 点検の行（物件単位＝biz.property_inspections と 台ごと＝biz.property_unit_inspections）の
--    点検日連絡・インターバル・請求月（業務システム 修正依頼1026 で足した3列）。inspections_all / unit_inspections_all は
--    戻り値の形を変えられないので別に読む（property_inspection_dates と同じ考え方）。
-- 3. set_inspection_schedule: その3列を書く。upsert_property_inspection / upsert_unit_inspection の戻り値の id で続けて呼ぶ
--    （検査月の set_property_inspection_inspected_on と同じ形）。台の保守の写し（from_units の行）は物件単位では書かせない。
-- 4. master_property_links / delete_master_property: 物件を編集の『削除』。
--    物件の追加・削除は業務システムの物件で行う方針だが、業務システムは「点検日入力システムとリンク済みの物件は削除できません」で
--    止め（biz purge_property も signage_property_id が null の物件しか消さない）、リンクを外す画面も無い。signage 側も
--    block_property_direct_write で物件の表を直接消せないので、今はどこからも消せない。そこで削除は
--    「設備点検管理システムから物件を外す」= 業務システムの物件のリンク（signage_property_id・signage_property_code）を外し、
--    signage_master_properties の行を消す、とする。業務システムの物件そのもの（契約・台・請求）は消さない。
--    紐付け（申請・報告書・保守会社の紐付け〔削除済みを除く〕・物件のファイル・設備〔旧〕・業務システムの点検・台）が1件でもあれば断る。
--    signage_property_code も null にする（残すと biz.sync_property_to_signage が次の更新で同じコードの物件を作り直す）。
--    SECURITY DEFINER（所有者 postgres）の中なので、biz.guard_signage_link / guard_signage_code / signage.block_property_direct_write は通る。
--    管理者だけ（管理会社は削除できない）。

SET lock_timeout = '5s';

-- ============================================================
-- 1. master_property_codes
-- ============================================================
CREATE OR REPLACE FUNCTION signage.master_property_codes()
 RETURNS TABLE(property_code text, biz_property_id uuid, en_no text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'pg_temp'
AS $function$
  select sp.property_code, bp.id, nullif(btrim(bp.en_no), '')
  from signage.signage_master_properties sp
  join biz.properties bp on bp.signage_property_id = sp.id
  where signage.is_active_admin()
     or (signage.is_active_management()
         and bp.management_company_id = signage.current_management_company_id())
  order by sp.property_code;
$function$;

REVOKE ALL ON FUNCTION signage.master_property_codes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION signage.master_property_codes() TO authenticated, service_role;

-- ============================================================
-- 2. master_inspection_schedules
-- ============================================================
CREATE OR REPLACE FUNCTION signage.master_inspection_schedules()
 RETURNS TABLE(kind text, inspection_id uuid, property_code text, inspection_type_id uuid,
               notify_inspection_date boolean, interval_months integer, billing_months integer[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'pg_temp'
AS $function$
  select 'property'::text, pi.id, s.property_code, pi.inspection_type_id,
         pi.notify_inspection_date, pi.interval_months, pi.billing_months
  from biz.property_inspections pi
  join biz.properties b on b.id = pi.property_id
  join signage.signage_master_properties s on s.id = b.signage_property_id
  where signage.is_active_admin()
     or (signage.current_role_kind() = 'management'
         and signage.current_management_company_id() is not null
         and b.management_company_id = signage.current_management_company_id())
  union all
  select 'unit'::text, ui.id, s.property_code, ui.inspection_type_id,
         ui.notify_inspection_date, ui.interval_months, ui.billing_months
  from biz.property_unit_inspections ui
  join biz.property_units u on u.id = ui.unit_id
  join biz.properties b on b.id = u.property_id
  join signage.signage_master_properties s on s.id = b.signage_property_id
  where signage.is_active_admin()
     or (signage.current_role_kind() = 'management'
         and signage.current_management_company_id() is not null
         and b.management_company_id = signage.current_management_company_id())
  order by 3, 1;
$function$;

REVOKE ALL ON FUNCTION signage.master_inspection_schedules() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION signage.master_inspection_schedules() TO authenticated, service_role;

-- ============================================================
-- 3. set_inspection_schedule
-- ============================================================
CREATE OR REPLACE FUNCTION signage.set_inspection_schedule(
  p_kind text,
  p_inspection_id uuid,
  p_notify_inspection_date boolean,
  p_interval_months integer,
  p_billing_months integer[])
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'pg_temp'
AS $function$
DECLARE
  v_company uuid;
  v_from_units boolean;
  v_month int;
  v_billing int[];
  v_n int;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('property', 'unit') THEN
    RAISE EXCEPTION '点検の種類は property か unit で指定してください';
  END IF;
  IF p_notify_inspection_date IS NULL THEN
    RAISE EXCEPTION '点検日連絡を指定してください';
  END IF;
  IF p_interval_months IS NOT NULL AND (p_interval_months < 1 OR p_interval_months > 120) THEN
    RAISE EXCEPTION 'インターバルは 1〜120 の整数（か月）で入力してください';
  END IF;
  IF p_billing_months IS NOT NULL THEN
    FOREACH v_month IN ARRAY p_billing_months LOOP
      IF v_month IS NULL OR v_month < 1 OR v_month > 12 THEN
        RAISE EXCEPTION '請求月は 1〜12 で指定してください（%）', coalesce(v_month::text, 'null');
      END IF;
    END LOOP;
  END IF;
  v_billing := array(SELECT DISTINCT m FROM unnest(coalesce(p_billing_months, '{}')) m ORDER BY m);

  -- 行を取ってから権限を見る。行が無いときと他社の行のときは同じ文言にする（他社の点検行があるかを漏らさない）
  IF p_kind = 'property' THEN
    SELECT b.management_company_id, pi.from_units INTO v_company, v_from_units
      FROM biz.property_inspections pi
      JOIN biz.properties b ON b.id = pi.property_id
     WHERE pi.id = p_inspection_id
       FOR UPDATE OF pi;
  ELSE
    SELECT b.management_company_id, false INTO v_company, v_from_units
      FROM biz.property_unit_inspections ui
      JOIN biz.property_units u ON u.id = ui.unit_id
      JOIN biz.properties b ON b.id = u.property_id
     WHERE ui.id = p_inspection_id
       FOR UPDATE OF ui;
  END IF;
  IF NOT FOUND OR NOT (
       signage.is_active_admin()
       OR (signage.current_role_kind() = 'management'
           AND signage.current_management_company_id() IS NOT NULL
           AND v_company = signage.current_management_company_id())) THEN
    RAISE EXCEPTION 'この点検の点検日連絡・インターバル・請求月を変更する権限がありません' USING ERRCODE = '42501';
  END IF;

  IF p_kind = 'property' THEN
    IF v_from_units THEN
      -- 写しの行は台の保守から作り直されるので、ここで書いても消える
      RAISE EXCEPTION 'この点検は台ごとに管理しています。点検日連絡・インターバル・請求月は台ごとの保守で入れてください';
    END IF;
    UPDATE biz.property_inspections
       SET notify_inspection_date = p_notify_inspection_date,
           interval_months = p_interval_months,
           billing_months = v_billing
     WHERE id = p_inspection_id
       AND (notify_inspection_date, interval_months, billing_months)
           IS DISTINCT FROM (p_notify_inspection_date, p_interval_months, v_billing);
  ELSE
    UPDATE biz.property_unit_inspections
       SET notify_inspection_date = p_notify_inspection_date,
           interval_months = p_interval_months,
           billing_months = v_billing
     WHERE id = p_inspection_id
       AND (notify_inspection_date, interval_months, billing_months)
           IS DISTINCT FROM (p_notify_inspection_date, p_interval_months, v_billing);
  END IF;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n > 0;
END;
$function$;

REVOKE ALL ON FUNCTION signage.set_inspection_schedule(text, uuid, boolean, integer, integer[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION signage.set_inspection_schedule(text, uuid, boolean, integer, integer[]) TO authenticated, service_role;

-- ============================================================
-- 4. master_property_links / delete_master_property
-- ============================================================
-- 物件の紐付けの件数（0 の項目も返す）。管理者だけ。物件が無ければ断る
CREATE OR REPLACE FUNCTION signage.master_property_links(p_property_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'pg_temp'
AS $function$
DECLARE
  v_id uuid;
  v_code text;
BEGIN
  IF NOT signage.is_active_admin() THEN
    RAISE EXCEPTION '物件を削除できるのは管理者だけです' USING ERRCODE = '42501';
  END IF;
  SELECT s.id, s.property_code INTO v_id, v_code
    FROM signage.signage_master_properties s WHERE s.property_code = p_property_code;
  IF NOT FOUND THEN
    RAISE EXCEPTION '物件が見つかりません（削除済みの可能性があります）';
  END IF;
  RETURN jsonb_build_object(
    'entries', (SELECT count(*) FROM signage.signage_entries e WHERE e.property_code = v_code),
    'reports', (SELECT count(*) FROM signage.signage_inspection_reports r WHERE r.property_code = v_code),
    'building_vendors', (SELECT count(*) FROM signage.signage_building_vendors v
                          WHERE v.property_code = v_code AND v.status IS DISTINCT FROM 'deleted'),
    'files', (SELECT count(*) FROM signage.signage_property_files f
               WHERE f.property_id = v_id OR f.property_code = v_code),
    'building_equipment', (SELECT count(*) FROM signage.signage_building_equipment q WHERE q.property_code = v_code),
    'inspections', (SELECT count(*) FROM biz.property_inspections pi
                      JOIN biz.properties b ON b.id = pi.property_id
                     WHERE b.signage_property_id = v_id),
    'units', (SELECT count(*) FROM biz.property_units u
                JOIN biz.properties b ON b.id = u.property_id
               WHERE b.signage_property_id = v_id)
  );
END;
$function$;

REVOKE ALL ON FUNCTION signage.master_property_links(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION signage.master_property_links(text) TO authenticated, service_role;

-- 物件を設備点検管理システムから外す（紐付けがあれば断る）。業務システムの物件は残し、リンクだけ外す
CREATE OR REPLACE FUNCTION signage.delete_master_property(p_property_code text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'pg_temp'
AS $function$
DECLARE
  v_id uuid;
  v_links jsonb;
  v_parts text[];
BEGIN
  IF NOT signage.is_active_admin() THEN
    RAISE EXCEPTION '物件を削除できるのは管理者だけです' USING ERRCODE = '42501';
  END IF;
  SELECT s.id INTO v_id FROM signage.signage_master_properties s WHERE s.property_code = p_property_code;
  IF NOT FOUND THEN
    RAISE EXCEPTION '物件が見つかりません（削除済みの可能性があります）';
  END IF;
  -- ロックの順は 業務システムの物件 → signage の物件（biz.sync_property_to_signage と同じ順。逆にすると業務システムの保存と待ち合う）
  PERFORM 1 FROM biz.properties b WHERE b.signage_property_id = v_id ORDER BY b.id FOR UPDATE;
  PERFORM 1 FROM signage.signage_master_properties s WHERE s.id = v_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '物件が見つかりません（削除済みの可能性があります）';
  END IF;

  v_links := signage.master_property_links(p_property_code);
  v_parts := array_remove(ARRAY[
    CASE WHEN (v_links->>'entries')::int > 0 THEN '点検の申請 ' || (v_links->>'entries') || '件' END,
    CASE WHEN (v_links->>'reports')::int > 0 THEN '点検報告書 ' || (v_links->>'reports') || '件' END,
    CASE WHEN (v_links->>'building_vendors')::int > 0 THEN '保守会社の紐付け ' || (v_links->>'building_vendors') || '件' END,
    CASE WHEN (v_links->>'files')::int > 0 THEN '物件のファイル ' || (v_links->>'files') || '件' END,
    CASE WHEN (v_links->>'building_equipment')::int > 0 THEN '設備（旧） ' || (v_links->>'building_equipment') || '件' END,
    CASE WHEN (v_links->>'inspections')::int > 0 THEN '設備情報（点検） ' || (v_links->>'inspections') || '件' END,
    CASE WHEN (v_links->>'units')::int > 0 THEN '業務システムの台 ' || (v_links->>'units') || '台' END
  ], NULL);
  IF cardinality(v_parts) > 0 THEN
    RAISE EXCEPTION '紐づけありの為、削除できません（%）', array_to_string(v_parts, '・')
      USING ERRCODE = 'P0001';
  END IF;

  -- リンクを外す。signage_property_code も外す（残すと biz.sync_property_to_signage が次の更新で作り直す）
  UPDATE biz.properties
     SET signage_property_id = NULL,
         signage_property_code = NULL
   WHERE signage_property_id = v_id;
  DELETE FROM signage.signage_master_properties WHERE id = v_id;
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION signage.delete_master_property(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION signage.delete_master_property(text) TO authenticated, service_role;
