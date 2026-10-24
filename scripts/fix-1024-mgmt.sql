-- 修正依頼1024 担当 mgmt: 管理会社メニュー（C2・C3）
-- 2026-10-24 作成。本番へは未適用（適用はユーザー承認後）。ローカル DB（signage-v2-verify）で確かめた。
-- 適用方法: Management API で1文ずつ流す（BEGIN/COMMIT を付けない）。何度流しても同じ結果になる（冪等）。
--
-- すべて追加だけ。既存の関数・ポリシー・トリガーは変えない（管理者・保守会社の結果は従来と同じ）。
-- 管理会社（role='management'）に、管理者メニューの一部（承認待ち・承認済み・紐付け管理・マスター管理・ユーザー管理）を
-- 「自社が管理する物件」（property_reviewable と同じ条件）の範囲だけ開く。
--   - 読み: 管理会社用の SELECT ポリシーを足す（申請・物件・紐付けは自社物件だけ、共通マスターは閲覧のみ）
--   - 書き: 範囲を確かめる管理会社用の RPC（mgmt_*）を足す。表への直接の INSERT / UPDATE / DELETE は開かない
--   - 申請の承認・差戻しは既存の portal_review_entry（管理会社の範囲を確かめ済み）をそのまま使う
--   - ユーザー管理は自社の管理会社ユーザーだけ（作成・無効化・パスワード変更は Edge Function signage-admin-users が範囲を確かめて行う。保守会社ユーザーは管理者だけが扱う）
-- 戻し手順は末尾。

-- ============================================================
-- 1. 判定の補助関数
-- ============================================================

-- 有効な管理会社アカウント（会社が付いているもの）
CREATE OR REPLACE FUNCTION signage.is_active_management()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'signage', 'pg_temp'
AS $function$
  select signage.current_role_kind() = 'management' and signage.current_management_company_id() is not null;
$function$;

-- 物件コードが指す物件マスターの1行を決め、その行が自社（ログイン中の管理会社）の物件かを返す（書き込み系 mgmt_* の範囲判定）。
-- 行の決め方は mgmt_add_building_vendor の保存先と同じ: 書式揺れ（120410 / 120410-00）を吸収した一致のうち、完全一致を優先する。
-- property_reviewable（正規化した一致のどれかが自社なら真）と違い、実際に書く行そのものの管理会社で判定する
-- （仮に 120410 が他社、120410-00 が自社のとき、'120410' で自社の判定を通して他社の行に書くことを防ぐ）
CREATE OR REPLACE FUNCTION signage.mgmt_resolve_own_property_code(p_property_code text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'pg_temp'
AS $function$
  select t.property_code from (
    select s.property_code, s.id from signage.signage_master_properties s
     where regexp_replace(s.property_code, '-00$', '') = regexp_replace(btrim(p_property_code), '-00$', '')
     order by (s.property_code = btrim(p_property_code)) desc, s.property_code
     limit 1) t
  join biz.properties b on b.signage_property_id = t.id
  where signage.is_active_management()
    and b.management_company_id = signage.current_management_company_id()
  limit 1;
$function$;

-- ============================================================
-- 2. 読み取り（管理会社用の SELECT ポリシー。既存のポリシーには触らない）
-- ============================================================

-- 申請: 自社物件のもの（承認待ち・承認済み・追加登録された画像の一覧）
DROP POLICY IF EXISTS "mgmt_select_entries" ON signage.signage_entries;
CREATE POLICY "mgmt_select_entries" ON signage.signage_entries FOR SELECT TO authenticated
  USING (signage.is_active_management() AND signage.property_reviewable(property_code));

-- 物件: 自社物件だけ
DROP POLICY IF EXISTS "mgmt_select_properties" ON signage.signage_master_properties;
CREATE POLICY "mgmt_select_properties" ON signage.signage_master_properties FOR SELECT TO authenticated
  USING (signage.is_active_management() AND signage.property_reviewable(property_code));

-- 紐付け（物件×保守会社）: 自社物件のもの（status は問わない。承認待ちのビル追加もここから読む）
DROP POLICY IF EXISTS "mgmt_select_building_vendors" ON signage.signage_building_vendors;
CREATE POLICY "mgmt_select_building_vendors" ON signage.signage_building_vendors FOR SELECT TO authenticated
  USING (signage.is_active_management() AND signage.property_reviewable(property_code));

-- 共通マスター（閲覧のみ）: 保守会社・点検種別・カテゴリ・保守会社ごとの点検種別・設定。
-- 保守会社は自社物件に新しく紐付ける相手を選ぶために全社を読む（名前・緊急連絡先。書き込みは業務システム）
DROP POLICY IF EXISTS "mgmt_select_vendors" ON signage.signage_master_vendors;
CREATE POLICY "mgmt_select_vendors" ON signage.signage_master_vendors FOR SELECT TO authenticated
  USING (signage.is_active_management());
DROP POLICY IF EXISTS "mgmt_select_inspection_types" ON signage.signage_master_inspection_types;
CREATE POLICY "mgmt_select_inspection_types" ON signage.signage_master_inspection_types FOR SELECT TO authenticated
  USING (signage.is_active_management());
DROP POLICY IF EXISTS "mgmt_select_categories" ON signage.signage_master_categories;
CREATE POLICY "mgmt_select_categories" ON signage.signage_master_categories FOR SELECT TO authenticated
  USING (signage.is_active_management());
DROP POLICY IF EXISTS "mgmt_select_vendor_inspections" ON signage.signage_vendor_inspections;
CREATE POLICY "mgmt_select_vendor_inspections" ON signage.signage_vendor_inspections FOR SELECT TO authenticated
  USING (signage.is_active_management());
-- 設定は CSV の表示時間の既定（display_time_default）を読むため
DROP POLICY IF EXISTS "mgmt_select_settings" ON signage.signage_master_settings;
CREATE POLICY "mgmt_select_settings" ON signage.signage_master_settings FOR SELECT TO authenticated
  USING (signage.is_active_management());

-- ユーザー: 自社の管理会社ユーザーだけ。
-- 保守会社のユーザー（role 'user'）は出さない: 「自社物件を担当する保守会社」の根拠（紐付け・点検行の保守会社）は
-- 管理会社自身が mgmt_add_building_vendor / mgmt_upsert_* で書けるため、範囲の根拠にならない（任意の保守会社を紐付けて
-- そのユーザーのメールアドレス・状態を読めてしまう）。保守会社ユーザーの作成・管理は管理者だけ
DROP POLICY IF EXISTS "mgmt_select_profiles" ON signage.signage_profiles;
CREATE POLICY "mgmt_select_profiles" ON signage.signage_profiles FOR SELECT TO authenticated
  USING (signage.is_active_management()
    AND role = 'management' AND management_company_id = signage.current_management_company_id());

-- 自社（管理会社）の id と名前（ユーザー管理の会社の列・作成の既定）
CREATE OR REPLACE FUNCTION signage.mgmt_own_company()
 RETURNS TABLE(id uuid, name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'pg_temp'
AS $function$
  select c.id, c.name from biz.companies c
  where signage.is_active_management() and c.id = signage.current_management_company_id();
$function$;

-- 途中版にあった保守会社の範囲判定の関数を消す（範囲の根拠を管理会社が書けたため。上の mgmt_select_profiles 参照）。
-- 本番には未適用。ローカルなど途中版を流した DB を同じ状態にそろえるため（無ければ何もしない）
DROP FUNCTION IF EXISTS signage.mgmt_vendor_ids();
DROP FUNCTION IF EXISTS signage.mgmt_vendor_in_scope(uuid);
DROP FUNCTION IF EXISTS signage.vendor_serves_management_company(uuid, uuid);

-- ============================================================
-- 3. 紐付け（ビル追加の承認・却下、物件×保守会社の追加・解除）
-- ============================================================

-- ビル追加リクエスト（status=pending）の承認・却下。却下は管理者と同じく行を消す
CREATE OR REPLACE FUNCTION signage.mgmt_review_building_request(p_id uuid, p_action text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'signage', 'pg_temp'
AS $function$
DECLARE
  r signage.signage_building_vendors;
BEGIN
  IF NOT signage.is_active_management() THEN
    RAISE EXCEPTION '管理会社のアカウントでのみ使えます' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM signage.signage_building_vendors WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR signage.mgmt_resolve_own_property_code(r.property_code) IS NULL THEN
    RAISE EXCEPTION 'リクエストが見つかりません' USING ERRCODE = 'P0002';
  END IF;
  IF r.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION '承認待ちのリクエストではありません（他の操作で処理された可能性があります）' USING ERRCODE = '22023';
  END IF;
  IF p_action = 'approve' THEN
    UPDATE signage.signage_building_vendors SET status = 'active', approved_by = auth.uid() WHERE id = p_id;
  ELSIF p_action = 'reject' THEN
    DELETE FROM signage.signage_building_vendors WHERE id = p_id;
  ELSE
    RAISE EXCEPTION '不明な操作です: %', p_action USING ERRCODE = '22023';
  END IF;
END;
$function$;

-- 自社物件に保守会社を紐付ける（解除済み・申請中の行は active に戻す。UNIQUE(property_code, vendor_id) があるため）
CREATE OR REPLACE FUNCTION signage.mgmt_add_building_vendor(p_property_code text, p_vendor_id uuid)
 RETURNS signage.signage_building_vendors
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'signage', 'pg_temp'
AS $function$
DECLARE
  v_code text;
  r signage.signage_building_vendors;
BEGIN
  IF NOT signage.is_active_management() THEN
    RAISE EXCEPTION '管理会社のアカウントでのみ使えます' USING ERRCODE = '42501';
  END IF;
  -- 書く先の物件マスターの行を先に決め、その行の管理会社で判定する。マスターの書式（120410-00 など）で保存する
  -- （管理者の画面と同じく、物件マスターのコードで紐付ける）
  v_code := signage.mgmt_resolve_own_property_code(p_property_code);
  IF v_code IS NULL THEN
    RAISE EXCEPTION '自社が管理する物件ではありません' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM signage.signage_master_vendors WHERE id = p_vendor_id) THEN
    RAISE EXCEPTION '保守会社が見つかりません' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO r FROM signage.signage_building_vendors
   WHERE property_code = v_code AND vendor_id = p_vendor_id FOR UPDATE;
  IF FOUND THEN
    IF r.status = 'active' THEN
      RAISE EXCEPTION 'この物件は既に追加されています' USING ERRCODE = '23505';
    END IF;
    UPDATE signage.signage_building_vendors
       SET status = 'active', requested_by = auth.uid(), approved_by = auth.uid(), updated_at = now()
     WHERE id = r.id RETURNING * INTO r;
    RETURN r;
  END IF;
  INSERT INTO signage.signage_building_vendors (property_code, vendor_id, status, requested_by, approved_by)
  VALUES (v_code, p_vendor_id, 'active', auth.uid(), auth.uid())
  RETURNING * INTO r;
  RETURN r;
END;
$function$;

-- 自社物件の紐付けを解除する（管理者と同じくソフトデリート status='deleted'）
CREATE OR REPLACE FUNCTION signage.mgmt_remove_building_vendor(p_id uuid)
 RETURNS signage.signage_building_vendors
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'signage', 'pg_temp'
AS $function$
DECLARE
  r signage.signage_building_vendors;
BEGIN
  IF NOT signage.is_active_management() THEN
    RAISE EXCEPTION '管理会社のアカウントでのみ使えます' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM signage.signage_building_vendors WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR signage.mgmt_resolve_own_property_code(r.property_code) IS NULL THEN
    RAISE EXCEPTION '紐付けが見つかりません' USING ERRCODE = 'P0002';
  END IF;
  UPDATE signage.signage_building_vendors SET status = 'deleted' WHERE id = p_id RETURNING * INTO r;
  RETURN r;
END;
$function$;

-- ============================================================
-- 4. マスター管理: 物件の点検情報（自社物件だけ）
--    中身は管理者用の inspections_all / inspections_for_property / upsert_* / delete_* / unit_* と同じ。
--    違うのは先頭の権限の確かめ（管理者 → 管理会社＋自社物件）だけ
-- ============================================================

CREATE OR REPLACE FUNCTION signage.mgmt_inspections_all()
 RETURNS TABLE(property_code text, inspection_type_id uuid, vendor_id uuid, inspection_months integer[], remarks text, remarks2 text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'public'
AS $function$
  select s.property_code, pi.inspection_type_id, pi.maintainer_id,
         pi.inspection_months, coalesce(pi.remarks, ''), coalesce(pi.remarks2, '')
  from biz.property_inspections pi
  join biz.properties b on b.id = pi.property_id
  join signage.signage_master_properties s on s.id = b.signage_property_id
  where signage.is_active_management()
    and b.management_company_id = signage.current_management_company_id();
$function$;

CREATE OR REPLACE FUNCTION signage.mgmt_inspections_for_property(p_property_code text)
 RETURNS TABLE(id uuid, property_code text, property_name text, inspection_type_id uuid, inspection_name text, template_no text, default_text text, maintainer_id uuid, maintainer_name text, emergency_contact text, inspection_months integer[], maintainer_equipment_code text, remarks text, remarks2 text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'public'
AS $function$
  select pi.id, s.property_code, b.name,
         pi.inspection_type_id, t.label, t.template_no, t.default_text,
         pi.maintainer_id, m.name, m.emergency_contact,
         pi.inspection_months, pi.maintainer_equipment_code, pi.remarks, pi.remarks2
  from biz.property_inspections pi
  join biz.properties b on b.id = pi.property_id
  join signage.signage_master_properties s on s.id = b.signage_property_id
  left join biz.inspection_types t on t.id = pi.inspection_type_id
  left join biz.maintainers m on m.id = pi.maintainer_id
  where s.property_code = p_property_code
    and signage.is_active_management()
    and b.management_company_id = signage.current_management_company_id();
$function$;

CREATE OR REPLACE FUNCTION signage.mgmt_upsert_property_inspection(p_property_code text, p_inspection_type_id uuid, p_maintainer_id uuid DEFAULT NULL::uuid, p_inspection_months integer[] DEFAULT '{}'::integer[], p_maintainer_equipment_code text DEFAULT NULL::text, p_remarks text DEFAULT NULL::text, p_remarks2 text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'public'
AS $function$
declare
  v_property_id uuid;
  v_id uuid;
  v_month int;
  v_row biz.property_inspections%rowtype;
  v_category text;
  v_found boolean;
begin
  if not signage.is_active_management() then
    raise exception '権限がありません' using errcode = '42501';
  end if;

  select b.id into v_property_id
  from biz.properties b
  join signage.signage_master_properties s on s.id = b.signage_property_id
  where s.property_code = p_property_code
    and b.management_company_id = signage.current_management_company_id();

  if v_property_id is null then
    raise exception '物件コード % は自社が管理する物件ではありません', p_property_code using errcode = '42501';
  end if;

  if p_inspection_months is not null then
    foreach v_month in array p_inspection_months loop
      if v_month < 1 or v_month > 12 then
        raise exception '点検月は 1〜12 で指定してください（%）', v_month;
      end if;
    end loop;
  end if;

  perform 1 from biz.properties b where b.id = v_property_id for share;

  select pi.* into v_row
    from biz.property_inspections pi
   where pi.property_id = v_property_id and pi.inspection_type_id = p_inspection_type_id;
  v_found := found;
  if v_found and v_row.from_units then
    if p_maintainer_id is not distinct from v_row.maintainer_id
       and array(select distinct m from unnest(coalesce(p_inspection_months, '{}')) m order by m)
         = array(select distinct m from unnest(v_row.inspection_months) m order by m)
       and coalesce(p_remarks, '') = coalesce(v_row.remarks, '')
       and coalesce(p_remarks2, '') = coalesce(v_row.remarks2, '') then
      return v_row.id;
    end if;
    raise exception 'この点検は台ごとに管理しています。画面を読み込み直してから、業務システムで登録してください';
  elsif not v_found then
    select t.equipment_category_code into v_category from biz.inspection_types t where t.id = p_inspection_type_id;
    if v_category is not null
       and exists (select 1 from biz.property_units u where u.property_id = v_property_id and u.category_code = v_category) then
      raise exception 'この点検は台ごとに管理しています。画面を読み込み直してから、業務システムで登録してください';
    end if;
  else
    update biz.property_inspections
       set maintainer_id = p_maintainer_id,
           inspection_months = coalesce(p_inspection_months, '{}'),
           maintainer_equipment_code = coalesce(p_maintainer_equipment_code, maintainer_equipment_code),
           remarks = p_remarks,
           remarks2 = p_remarks2
     where id = v_row.id and not from_units
    returning id into v_id;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  insert into biz.property_inspections
    (property_id, inspection_type_id, maintainer_id, inspection_months, maintainer_equipment_code, remarks, remarks2)
  values
    (v_property_id, p_inspection_type_id, p_maintainer_id, coalesce(p_inspection_months, '{}'), p_maintainer_equipment_code, p_remarks, p_remarks2)
  on conflict (property_id, inspection_type_id) do update set
    maintainer_id = excluded.maintainer_id,
    inspection_months = excluded.inspection_months,
    maintainer_equipment_code = coalesce(excluded.maintainer_equipment_code, property_inspections.maintainer_equipment_code),
    remarks = excluded.remarks,
    remarks2 = excluded.remarks2
    where not property_inspections.from_units
  returning id into v_id;

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION signage.mgmt_delete_property_inspection(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'public'
AS $function$
begin
  if not signage.is_active_management() then
    raise exception '権限がありません' using errcode = '42501';
  end if;
  if exists (select 1 from biz.property_inspections pi
              join biz.properties b on b.id = pi.property_id
             where pi.id = p_id
               and b.management_company_id is distinct from signage.current_management_company_id()) then
    raise exception '自社が管理する物件の点検ではありません' using errcode = '42501';
  end if;
  delete from biz.property_inspections where id = p_id and not from_units;
end;
$function$;

CREATE OR REPLACE FUNCTION signage.mgmt_unit_inspections_all()
 RETURNS TABLE(property_code text, category_code text, category_label text, unit_id uuid, unit_sort integer, unit_code text, unit_location text, unit_remarks text, unit_remarks2 text, inspection_id uuid, inspection_type_id uuid, inspection_type_label text, vendor_id uuid, vendor_name text, inspection_months integer[], inspected_on date, legacy_remarks text, legacy_remarks2 text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'public'
AS $function$
  select s.property_code, u.category_code, c.label,
         u.id, u.sort, u.unit_code, u.location, u.remarks, u.remarks2,
         i.id, i.inspection_type_id, t.label,
         i.maintainer_id, m.name, i.inspection_months, i.inspected_on,
         pi.remarks, pi.remarks2
  from biz.property_units u
  join biz.properties b on b.id = u.property_id
  join signage.signage_master_properties s on s.id = b.signage_property_id
  left join biz.property_unit_inspections i on i.unit_id = u.id
  left join biz.equipment_categories c on c.code = u.category_code
  left join biz.inspection_types t on t.id = i.inspection_type_id
  left join biz.maintainers m on m.id = i.maintainer_id
  left join biz.property_inspections pi
         on pi.property_id = u.property_id and pi.inspection_type_id = i.inspection_type_id and pi.from_units
  where signage.is_active_management()
    and b.management_company_id = signage.current_management_company_id()
  order by s.property_code, c.label, u.category_code, u.sort, u.created_at, u.id, t.sort, t.label, i.id;
$function$;

CREATE OR REPLACE FUNCTION signage.mgmt_unit_inspection_type_options()
 RETURNS TABLE(category_code text, inspection_type_id uuid, inspection_type_label text, sort integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'public'
AS $function$
  select t.equipment_category_code, t.id, t.label, t.sort
  from biz.inspection_types t
  where t.active and t.equipment_category_code is not null
    and signage.is_active_management()
  order by t.equipment_category_code, t.sort, t.label, t.id;
$function$;

CREATE OR REPLACE FUNCTION signage.mgmt_upsert_unit_inspection(p_unit_id uuid, p_inspection_type_id uuid, p_maintainer_id uuid DEFAULT NULL::uuid, p_inspection_months integer[] DEFAULT '{}'::integer[], p_inspected_on date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'public'
AS $function$
declare
  v_property_id uuid;
  v_month int;
  v_months int[];
  v_id uuid;
begin
  if not signage.is_active_management() then
    raise exception '権限がありません' using errcode = '42501';
  end if;
  if p_unit_id is null or p_inspection_type_id is null then
    raise exception '台と点検種別を指定してください';
  end if;

  select u.property_id into v_property_id from biz.property_units u where u.id = p_unit_id for key share;
  if not found then
    raise exception '台が見つかりません（削除済みの可能性があります）';
  end if;
  if not exists (select 1 from biz.properties b
                   join signage.signage_master_properties s on s.id = b.signage_property_id
                  where b.id = v_property_id) then
    raise exception 'この台の物件は、点検日入力システムの物件と対応が付いていません';
  end if;
  if not exists (select 1 from biz.properties b
                  where b.id = v_property_id and b.management_company_id = signage.current_management_company_id()) then
    raise exception '自社が管理する物件の台ではありません' using errcode = '42501';
  end if;
  if not exists (select 1 from biz.inspection_types t where t.id = p_inspection_type_id) then
    raise exception '点検種別が見つかりません';
  end if;
  if p_maintainer_id is not null and not exists (select 1 from biz.maintainers m where m.id = p_maintainer_id) then
    raise exception '保守会社が見つかりません';
  end if;

  if p_inspection_months is not null then
    foreach v_month in array p_inspection_months loop
      if v_month is null or v_month < 1 or v_month > 12 then
        raise exception '点検月は 1〜12 で指定してください（%）', coalesce(v_month::text, 'null');
      end if;
    end loop;
  end if;
  v_months := array(select distinct m from unnest(coalesce(p_inspection_months, '{}')) m order by m);

  insert into biz.property_unit_inspections (unit_id, inspection_type_id, maintainer_id, inspection_months, inspected_on, created_by)
  values (p_unit_id, p_inspection_type_id, p_maintainer_id, v_months, date_trunc('month', p_inspected_on)::date, auth.uid())
  on conflict (unit_id, inspection_type_id) do update set
    maintainer_id = excluded.maintainer_id,
    inspection_months = excluded.inspection_months,
    inspected_on = excluded.inspected_on
  returning id into v_id;

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION signage.mgmt_delete_unit_inspection(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'public'
AS $function$
declare
  v_property_id uuid;
begin
  if not signage.is_active_management() then
    raise exception '権限がありません' using errcode = '42501';
  end if;
  select u.property_id into v_property_id
    from biz.property_unit_inspections i
    join biz.property_units u on u.id = i.unit_id
   where i.id = p_id;
  if not found then
    return;
  end if;
  if not exists (select 1 from biz.properties b
                   join signage.signage_master_properties s on s.id = b.signage_property_id
                  where b.id = v_property_id) then
    raise exception 'この台の物件は、点検日入力システムの物件と対応が付いていません';
  end if;
  if not exists (select 1 from biz.properties b
                  where b.id = v_property_id and b.management_company_id = signage.current_management_company_id()) then
    raise exception '自社が管理する物件の台ではありません' using errcode = '42501';
  end if;
  delete from biz.property_unit_inspections where id = p_id;
end;
$function$;

-- ============================================================
-- 5. 実行権限（anon から外す。会社を引数で受ける判定は service_role だけ）
-- ============================================================
REVOKE ALL ON FUNCTION signage.is_active_management() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION signage.mgmt_resolve_own_property_code(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION signage.mgmt_own_company() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION signage.mgmt_review_building_request(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION signage.mgmt_add_building_vendor(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION signage.mgmt_remove_building_vendor(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION signage.mgmt_inspections_all() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION signage.mgmt_inspections_for_property(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION signage.mgmt_upsert_property_inspection(text, uuid, uuid, integer[], text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION signage.mgmt_delete_property_inspection(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION signage.mgmt_unit_inspections_all() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION signage.mgmt_unit_inspection_type_options() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION signage.mgmt_upsert_unit_inspection(uuid, uuid, uuid, integer[], date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION signage.mgmt_delete_unit_inspection(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION signage.is_active_management() TO authenticated;
GRANT EXECUTE ON FUNCTION signage.mgmt_resolve_own_property_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION signage.mgmt_own_company() TO authenticated;
GRANT EXECUTE ON FUNCTION signage.mgmt_review_building_request(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION signage.mgmt_add_building_vendor(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION signage.mgmt_remove_building_vendor(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION signage.mgmt_inspections_all() TO authenticated;
GRANT EXECUTE ON FUNCTION signage.mgmt_inspections_for_property(text) TO authenticated;
GRANT EXECUTE ON FUNCTION signage.mgmt_upsert_property_inspection(text, uuid, uuid, integer[], text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION signage.mgmt_delete_property_inspection(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION signage.mgmt_unit_inspections_all() TO authenticated;
GRANT EXECUTE ON FUNCTION signage.mgmt_unit_inspection_type_options() TO authenticated;
GRANT EXECUTE ON FUNCTION signage.mgmt_upsert_unit_inspection(uuid, uuid, uuid, integer[], date) TO authenticated;
GRANT EXECUTE ON FUNCTION signage.mgmt_delete_unit_inspection(uuid) TO authenticated;

-- ============================================================
-- 戻し手順（必要なときだけ。上で足したものを消すだけで、既存の定義は変えていない）
-- ============================================================
-- DROP POLICY IF EXISTS "mgmt_select_entries" ON signage.signage_entries;
-- DROP POLICY IF EXISTS "mgmt_select_properties" ON signage.signage_master_properties;
-- DROP POLICY IF EXISTS "mgmt_select_building_vendors" ON signage.signage_building_vendors;
-- DROP POLICY IF EXISTS "mgmt_select_vendors" ON signage.signage_master_vendors;
-- DROP POLICY IF EXISTS "mgmt_select_inspection_types" ON signage.signage_master_inspection_types;
-- DROP POLICY IF EXISTS "mgmt_select_categories" ON signage.signage_master_categories;
-- DROP POLICY IF EXISTS "mgmt_select_vendor_inspections" ON signage.signage_vendor_inspections;
-- DROP POLICY IF EXISTS "mgmt_select_settings" ON signage.signage_master_settings;
-- DROP POLICY IF EXISTS "mgmt_select_profiles" ON signage.signage_profiles;
-- DROP FUNCTION IF EXISTS signage.mgmt_delete_unit_inspection(uuid);
-- DROP FUNCTION IF EXISTS signage.mgmt_upsert_unit_inspection(uuid, uuid, uuid, integer[], date);
-- DROP FUNCTION IF EXISTS signage.mgmt_unit_inspection_type_options();
-- DROP FUNCTION IF EXISTS signage.mgmt_unit_inspections_all();
-- DROP FUNCTION IF EXISTS signage.mgmt_delete_property_inspection(uuid);
-- DROP FUNCTION IF EXISTS signage.mgmt_upsert_property_inspection(text, uuid, uuid, integer[], text, text, text);
-- DROP FUNCTION IF EXISTS signage.mgmt_inspections_for_property(text);
-- DROP FUNCTION IF EXISTS signage.mgmt_inspections_all();
-- DROP FUNCTION IF EXISTS signage.mgmt_remove_building_vendor(uuid);
-- DROP FUNCTION IF EXISTS signage.mgmt_add_building_vendor(text, uuid);
-- DROP FUNCTION IF EXISTS signage.mgmt_review_building_request(uuid, text);
-- DROP FUNCTION IF EXISTS signage.mgmt_own_company();
-- DROP FUNCTION IF EXISTS signage.mgmt_resolve_own_property_code(text);
-- DROP FUNCTION IF EXISTS signage.is_active_management();
