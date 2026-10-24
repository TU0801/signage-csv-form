-- 修正依頼1024 core（点検登録フォーム）: メモ列・完了連絡・管理会社フィルターの候補・検査月
-- 2026-10-24 作成。本番へは未適用（適用はユーザー承認後）。すべて追加（既存の表・関数・ポリシーは変えない）。冪等。
-- 適用方法: Management API で1文ずつ流すか、psql -f でファイル全体を流す（BEGIN/COMMIT は付けない）。
-- 戻し手順は末尾。

-- ============================================================
-- 1. 申請のメモ（B12）。CSV には出さない。点検月の変更などの覚え書き。承認画面の詳細（管理者）で見る
--    guard_entry_portal_columns は property_inspection_id・vendor_id・review_* しか見ないので、この列の書き込みは妨げない
-- ============================================================
ALTER TABLE signage.signage_entries ADD COLUMN IF NOT EXISTS memo text;
COMMENT ON COLUMN signage.signage_entries.memo IS '申請者のメモ（CSV に出さない）。点検月の変更などの覚え書き';

-- ============================================================
-- 2. 完了連絡（B14）。保守会社が「点検が終わった」と記録する。報告書が無くても点検完了にできる
--    読み: 点検の範囲（inspection_in_scope）。書き: RPC だけ（INSERT/UPDATE/DELETE のポリシーは作らない）
-- ============================================================
CREATE TABLE IF NOT EXISTS signage.signage_inspection_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_inspection_id uuid NOT NULL REFERENCES biz.property_inspections(id) ON DELETE CASCADE,
  target_month date NOT NULL CHECK (extract(day from target_month) = 1),
  vendor_id uuid REFERENCES signage.signage_master_vendors(id) ON DELETE SET NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  completed_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (property_inspection_id, target_month)
);
COMMENT ON TABLE signage.signage_inspection_completions IS '完了連絡（点検行 × 対象月）。書き込みは portal_mark_completed / portal_unmark_completed だけ';
ALTER TABLE signage.signage_inspection_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inspection_completions_select" ON signage.signage_inspection_completions;
CREATE POLICY "inspection_completions_select" ON signage.signage_inspection_completions
  FOR SELECT TO authenticated USING (signage.inspection_in_scope(property_inspection_id));

REVOKE ALL ON signage.signage_inspection_completions FROM PUBLIC, anon;
GRANT SELECT ON signage.signage_inspection_completions TO authenticated;
GRANT ALL ON signage.signage_inspection_completions TO service_role;

DROP TRIGGER IF EXISTS audit_trigger ON signage.signage_inspection_completions;
CREATE TRIGGER audit_trigger AFTER INSERT OR DELETE OR UPDATE ON signage.signage_inspection_completions
  FOR EACH ROW EXECUTE FUNCTION signage.signage_audit_trigger_fn();

-- 完了連絡を記録する。点検の保守会社（台の保守会社を含む）と管理者（inspection_writable）。同じ点検・対象月は1件（2回目は前の記録を返す）
CREATE OR REPLACE FUNCTION signage.portal_mark_completed(p_inspection_id uuid, p_target_month date)
 RETURNS signage.signage_inspection_completions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'pg_temp'
AS $function$
DECLARE
  r signage.signage_inspection_completions;
  v_vendor uuid;
  v_months int[];
BEGIN
  IF p_inspection_id IS NULL OR NOT signage.inspection_writable(p_inspection_id) THEN
    RAISE EXCEPTION 'この点検の完了連絡をする権限がありません' USING ERRCODE = '42501';
  END IF;
  IF p_target_month IS NULL THEN
    RAISE EXCEPTION '対象月を指定してください' USING ERRCODE = '22023';
  END IF;
  -- 点検月がある点検は、その月だけ（画面は点検月の行にしか出さない。RPC を直に呼んだときの取り違えを止める）。点検月未登録は月を問わない
  SELECT coalesce(inspection_months, '{}') INTO v_months FROM biz.property_inspections WHERE id = p_inspection_id;
  IF cardinality(v_months) > 0 AND NOT (extract(month from p_target_month)::int = ANY (v_months)) THEN
    RAISE EXCEPTION '対象月がこの点検の点検月ではありません' USING ERRCODE = '22023';
  END IF;
  -- 保守会社は自社。管理者は点検行の保守会社（管理者が号機の保守会社の代わりに連絡した記録は、その号機の保守会社からは取り消せない。
  -- 取り消すのは管理者か点検行の保守会社）
  IF signage.is_active_admin() THEN
    SELECT maintainer_id INTO v_vendor FROM biz.property_inspections WHERE id = p_inspection_id;
  ELSE
    v_vendor := signage.current_vendor_id();
  END IF;
  INSERT INTO signage.signage_inspection_completions (property_inspection_id, target_month, vendor_id, completed_by)
  VALUES (p_inspection_id, date_trunc('month', p_target_month)::date, v_vendor, auth.uid())
  ON CONFLICT (property_inspection_id, target_month) DO NOTHING
  RETURNING * INTO r;
  IF r.id IS NULL THEN
    SELECT * INTO r FROM signage.signage_inspection_completions
     WHERE property_inspection_id = p_inspection_id AND target_month = date_trunc('month', p_target_month)::date;
  END IF;
  RETURN r;
END;
$function$;

-- 完了連絡を取り消す。記録した保守会社と同じ保守会社のアカウントか管理者。無ければ何もしない（false）
CREATE OR REPLACE FUNCTION signage.portal_unmark_completed(p_inspection_id uuid, p_target_month date)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'pg_temp'
AS $function$
DECLARE
  r signage.signage_inspection_completions;
BEGIN
  IF p_inspection_id IS NULL OR NOT signage.inspection_writable(p_inspection_id) THEN
    RAISE EXCEPTION 'この点検の完了連絡を取り消す権限がありません' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM signage.signage_inspection_completions
   WHERE property_inspection_id = p_inspection_id AND target_month = date_trunc('month', p_target_month)::date
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF NOT signage.is_active_admin() AND r.vendor_id IS DISTINCT FROM signage.current_vendor_id() THEN
    RAISE EXCEPTION '完了連絡を取り消せるのは、連絡した保守会社か管理者だけです' USING ERRCODE = '42501';
  END IF;
  DELETE FROM signage.signage_inspection_completions WHERE id = r.id;
  RETURN true;
END;
$function$;

-- 範囲内の完了連絡（管理者は全件・保守会社は担当の点検・管理会社は自社物件）
CREATE OR REPLACE FUNCTION signage.portal_completions()
 RETURNS TABLE(id uuid, property_inspection_id uuid, target_month date, vendor_id uuid, completed_at timestamptz, completed_by uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'signage', 'pg_temp'
AS $function$
  select c.id, c.property_inspection_id, c.target_month, c.vendor_id, c.completed_at, c.completed_by
  from signage.signage_inspection_completions c
  where signage.inspection_in_scope(c.property_inspection_id)
  order by c.target_month, c.completed_at;
$function$;

-- ============================================================
-- 3. 管理会社フィルターの候補（B2）。物件ごとの管理会社を範囲つきで返す
--    管理者: biz と結び付いた全物件。保守会社: 担当物件表（signage_building_vendors の active）∪ 担当の点検（inspection_in_scope）の物件。
--    管理会社・無効なアカウント: 0行（フィルターは使わない）
--    既存の property_management_companies（管理者だけ）は変えない
-- ============================================================
CREATE OR REPLACE FUNCTION signage.management_companies_scoped()
 RETURNS TABLE(property_code text, management_company_id uuid, management_company_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'pg_temp'
AS $function$
  select sp.property_code, c.id, c.name
  from signage.signage_master_properties sp
  join biz.properties bp on bp.signage_property_id = sp.id
  left join biz.companies c on c.id = bp.management_company_id
  where signage.is_active_admin()
     or (signage.current_role_kind() = 'user' and signage.current_vendor_id() is not null and (
           exists (select 1 from signage.signage_building_vendors bv
                   where bv.property_code = sp.property_code
                     and bv.vendor_id = signage.current_vendor_id()
                     and bv.status = 'active')
        or exists (select 1 from biz.property_inspections pi
                   where pi.property_id = bp.id and signage.inspection_in_scope(pi.id))))
  order by sp.property_code;
$function$;

-- ============================================================
-- 4. 検査月（B13）。biz.property_inspections.inspected_on（直近の実施年月）を範囲つきで返す
--    portal_inspections は戻り値の型を変えられないので別の関数にする
-- ============================================================
CREATE OR REPLACE FUNCTION signage.portal_inspection_dates()
 RETURNS TABLE(inspection_id uuid, inspected_on date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'pg_temp'
AS $function$
  select pi.id, pi.inspected_on
  from biz.property_inspections pi
  where pi.inspected_on is not null and signage.inspection_in_scope(pi.id);
$function$;

-- ============================================================
-- 5. 実行権限（anon には渡さない）
-- ============================================================
REVOKE ALL ON FUNCTION signage.portal_mark_completed(uuid, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION signage.portal_unmark_completed(uuid, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION signage.portal_completions() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION signage.management_companies_scoped() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION signage.portal_inspection_dates() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION signage.portal_mark_completed(uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION signage.portal_unmark_completed(uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION signage.portal_completions() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION signage.management_companies_scoped() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION signage.portal_inspection_dates() TO authenticated, service_role;

-- ============================================================
-- 戻し手順
-- DROP FUNCTION signage.portal_inspection_dates(); DROP FUNCTION signage.management_companies_scoped();
-- DROP FUNCTION signage.portal_completions(); DROP FUNCTION signage.portal_unmark_completed(uuid, date);
-- DROP FUNCTION signage.portal_mark_completed(uuid, date); DROP TABLE signage.signage_inspection_completions;
-- ALTER TABLE signage.signage_entries DROP COLUMN memo;
-- ============================================================
