-- 修正依頼1027 (2) 一括入力テンプレート（Excel）のための読み取り関数
-- 2026-10-27 作成。本番へは未適用（適用はユーザー承認後）。ローカル DB（signage-v2-verify）で確かめた（scripts/test-fix-1027-bulk.sql）。
-- 適用方法: ファイル全体を1つのクエリとして流す（Management API なら1回の query に全文を入れる。psql なら psql -1 -f）。
--   BEGIN/COMMIT は付けない。先頭の lock_timeout で、ロックが取れないときは待ち続けずに失敗させる。何度流しても同じ結果になる。
--   新しい関数（本番に同名なし。2026-10-27 に pg_proc で確認）。既存の関数・表は変えない。
--
-- signage.bulk_template_info(p_vendor_id uuid) → jsonb {"short_name": text, "inspection_ids": [uuid, ...]}
--   short_name: 保守会社の略称（biz.companies.short_name。空なら biz.companies.name）。テンプレートのファイル名に使う。
--     保守会社（biz.maintainers）の id は取引先（biz.companies）の id と同じ（本番 41社すべて一致を確認）。
--     保守会社のアカウントは biz.companies を読めない（RLS は biz.is_staff のみ）ので、この関数が略称だけを返す。
--   inspection_ids: その保守会社の点検行（画面の portal_inspections と同じ範囲: 点検行の保守会社か、台の保守会社）を、
--     業務システムの物件詳細「設備」の並び（点検種別の大分類 equipment_categories.sort → 登録順 created_at）にしたもの。
--     画面は物件ごとに先頭の点検種別をテンプレートの既定にする（「既定は設備の1番上の点検種別」）。
--   範囲: 管理者は p_vendor_id の保守会社。保守会社のアカウントは自社（p_vendor_id は見ない）。それ以外（管理会社・無効）は断る。

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION signage.bulk_template_info(p_vendor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'pg_temp'
AS $function$
DECLARE
  v_vendor uuid;
BEGIN
  IF signage.is_active_admin() THEN
    v_vendor := p_vendor_id;
  ELSIF signage.current_role_kind() = 'user' THEN
    v_vendor := signage.current_vendor_id();
  ELSE
    RAISE EXCEPTION 'テンプレートを作る権限がありません' USING ERRCODE = '42501';
  END IF;
  IF v_vendor IS NULL THEN
    RETURN jsonb_build_object('short_name', NULL, 'inspection_ids', '[]'::jsonb);
  END IF;
  RETURN jsonb_build_object(
    'short_name',
    (SELECT coalesce(nullif(btrim(c.short_name), ''), c.name) FROM biz.companies c WHERE c.id = v_vendor),
    'inspection_ids',
    coalesce((
      SELECT jsonb_agg(x.id ORDER BY x.property_id, x.cat_sort, x.created_at, x.id)
      FROM (
        SELECT pi.id, pi.property_id, pi.created_at,
               coalesce((SELECT ec.sort FROM biz.equipment_categories ec WHERE ec.code = t.equipment_category_code), 2147483647) AS cat_sort
        FROM biz.property_inspections pi
        LEFT JOIN biz.inspection_types t ON t.id = pi.inspection_type_id
        WHERE pi.maintainer_id = v_vendor
           OR EXISTS (SELECT 1 FROM biz.property_unit_inspections ui
                      JOIN biz.property_units u ON u.id = ui.unit_id
                      WHERE u.property_id = pi.property_id
                        AND ui.inspection_type_id = pi.inspection_type_id
                        AND ui.maintainer_id = v_vendor)
      ) x
    ), '[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION signage.bulk_template_info(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION signage.bulk_template_info(uuid) TO authenticated, service_role;
