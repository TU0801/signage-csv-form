-- 修正依頼1025 担当 form: 点検登録フォーム（F5 管理会社の略称・H1〜H3 号機ごとの行・H4/G4 点検種別の印）
-- 2026-10-25 作成。適用方法: ファイル全体を1つのクエリとして流す（Management API なら1回の query に全文。psql なら psql -1 -f）。
--   BEGIN/COMMIT は付けない。何度流しても同じ結果になる。既存の関数・ポリシーは変えない（足すだけ）。biz スキーマは変えない。
--
-- 1. signage.signage_inspection_type_flags（H4/G4）
--    点検種別ごとの印。report_only = 申請不要（報告書のみ。リモート点検・警備報告書・故障対応など）、
--    monthly = 点検月『毎月』（毎月の予定行を出す）。どちらも点検月超過の判定から外す（画面側）。
--    キーは signage_master_inspection_types.id（= biz.inspection_types.id。本番で 170 件すべて一致を確認済み）。
--    点検種別の編集モーダル（管理者）から書く。読み取りは is_active_member（管理者・保守会社）と管理会社。
-- 2. signage.portal_inspection_units()（H1・H2・H3）
--    範囲内の点検行（inspection_in_scope）の台（biz.property_unit_inspections があるもの）を1台1行で返す。
--    台の無い点検行で設備会社固有コード（maintainer_equipment_code）があるものは unit_id null の1行で返す。
--    画面は台が2台以上の点検の予定行を台ごとに出し、物件の下に unit_code（No1 など）を出す。
-- 3. signage.management_company_short_names()（F5）
--    管理会社の略称（biz.companies.short_name、空なら null）。範囲は management_companies_scoped と同じ判定
--    （管理者は全社・保守会社は紐付け/担当点検の物件の管理会社）に、管理会社アカウントの自社を足したもの。
--
-- 戻し方:
--   DROP FUNCTION IF EXISTS signage.management_company_short_names();
--   DROP FUNCTION IF EXISTS signage.portal_inspection_units();
--   DROP TABLE IF EXISTS signage.signage_inspection_type_flags;
--   DROP FUNCTION IF EXISTS signage.inspection_type_flags_touch();

SET lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. 点検種別の印
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS signage.signage_inspection_type_flags (
  inspection_type_id uuid PRIMARY KEY
    REFERENCES signage.signage_master_inspection_types(id) ON DELETE CASCADE,
  report_only boolean NOT NULL DEFAULT false,
  monthly boolean NOT NULL DEFAULT false,
  updated_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE signage.signage_inspection_type_flags IS
  '点検種別の印（修正依頼1025 H4/G4）。report_only=申請不要（報告書のみ）、monthly=点検月が毎月。どちらも点検月超過の判定から外す';

ALTER TABLE signage.signage_inspection_type_flags ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON signage.signage_inspection_type_flags FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON signage.signage_inspection_type_flags TO authenticated;

DROP POLICY IF EXISTS flags_select ON signage.signage_inspection_type_flags;
CREATE POLICY flags_select ON signage.signage_inspection_type_flags
  FOR SELECT TO authenticated
  USING (signage.is_active_member() OR signage.is_active_management());
DROP POLICY IF EXISTS flags_admin_insert ON signage.signage_inspection_type_flags;
CREATE POLICY flags_admin_insert ON signage.signage_inspection_type_flags
  FOR INSERT TO authenticated
  WITH CHECK (signage.is_active_admin());
DROP POLICY IF EXISTS flags_admin_update ON signage.signage_inspection_type_flags;
CREATE POLICY flags_admin_update ON signage.signage_inspection_type_flags
  FOR UPDATE TO authenticated
  USING (signage.is_active_admin())
  WITH CHECK (signage.is_active_admin());
DROP POLICY IF EXISTS flags_admin_delete ON signage.signage_inspection_type_flags;
CREATE POLICY flags_admin_delete ON signage.signage_inspection_type_flags
  FOR DELETE TO authenticated
  USING (signage.is_active_admin());

-- 更新者・更新日時はクライアントの値を使わない
CREATE OR REPLACE FUNCTION signage.inspection_type_flags_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = signage, pg_temp
AS $$
BEGIN
  NEW.updated_by := auth.uid();
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION signage.inspection_type_flags_touch() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS touch ON signage.signage_inspection_type_flags;
CREATE TRIGGER touch BEFORE INSERT OR UPDATE ON signage.signage_inspection_type_flags
  FOR EACH ROW EXECUTE FUNCTION signage.inspection_type_flags_touch();

-- ---------------------------------------------------------------------------
-- 2. 号機（台）
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION signage.portal_inspection_units()
RETURNS TABLE (
  inspection_id uuid,
  unit_id uuid,
  unit_code text,
  unit_sort integer,
  maintainer_id uuid,
  inspection_months integer[],
  inspected_on date,
  equipment_code text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = biz, signage, pg_temp
AS $$
  -- 範囲は点検行ごとに inspection_in_scope（管理者は全件・保守会社は担当の点検・管理会社は自社物件。それ以外は0件）
  select pi.id, u.id, u.unit_code, u.sort, ui.maintainer_id,
         coalesce(ui.inspection_months, '{}'), ui.inspected_on, pi.maintainer_equipment_code
  from biz.property_inspections pi
  join biz.property_units u on u.property_id = pi.property_id
  join biz.property_unit_inspections ui on ui.unit_id = u.id and ui.inspection_type_id = pi.inspection_type_id
  where signage.inspection_in_scope(pi.id)
  union all
  select pi.id, null, null, null, null, '{}', null, pi.maintainer_equipment_code
  from biz.property_inspections pi
  where pi.maintainer_equipment_code is not null
    and not exists (select 1 from biz.property_units u
                    join biz.property_unit_inspections ui on ui.unit_id = u.id
                    where u.property_id = pi.property_id and ui.inspection_type_id = pi.inspection_type_id)
    and signage.inspection_in_scope(pi.id)
  order by 1, 4 nulls first, 3;
$$;
REVOKE ALL ON FUNCTION signage.portal_inspection_units() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION signage.portal_inspection_units() TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. 管理会社の略称
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION signage.management_company_short_names()
RETURNS TABLE (id uuid, name text, short_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = biz, signage, pg_temp
AS $$
  select distinct c.id, c.name, nullif(btrim(c.short_name), '')
  from signage.signage_master_properties sp
  join biz.properties bp on bp.signage_property_id = sp.id
  join biz.companies c on c.id = bp.management_company_id
  where signage.is_active_admin()
     or (signage.current_role_kind() = 'user' and signage.current_vendor_id() is not null and (
           exists (select 1 from signage.signage_building_vendors bv
                   where bv.property_code = sp.property_code
                     and bv.vendor_id = signage.current_vendor_id()
                     and bv.status = 'active')
        or exists (select 1 from biz.property_inspections pi
                   where pi.property_id = bp.id and signage.inspection_in_scope(pi.id))))
     or (signage.is_active_management() and c.id = signage.current_management_company_id())
  order by 1;
$$;
REVOKE ALL ON FUNCTION signage.management_company_short_names() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION signage.management_company_short_names() TO authenticated;
