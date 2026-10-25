-- 修正依頼1025 担当 master: マスター管理の物件（E1 管理会社で絞り込み・管理会社の列）
-- 2026-10-25 作成。本番へは未適用（適用はユーザー承認後）。ローカル DB（signage-v2-verify）で確かめた。
-- 適用方法: ファイル全体を1つのクエリとして流す（Management API なら1回の query に全文を入れる。psql なら psql -1 -f）。
--   BEGIN/COMMIT は付けない。先頭の lock_timeout で、ロックが取れないときは待ち続けずに失敗させる。
-- リリース順: このファイルを本番へ流してから（遅くとも同時に）v2 をデプロイする。先に v2 だけ出ると、この関数が無いため
--   物件一覧の管理会社の列が全て「-」になり、管理会社の絞り込みも出ない（保守会社の絞り込みは外したので、その間は絞り込みが無い）。
-- 何度流しても同じ結果になる（冪等）。追加だけで、既存の関数・ポリシーは変えない。
--
-- 物件一覧の「管理会社」列と絞り込み用に、物件ごとの管理会社（正式名と略称）を返す読み取り専用の関数を足す。
--   - 管理者: 全物件
--   - 管理会社アカウント: 自社が管理会社の物件だけ（biz.properties.management_company_id = 自社。管理会社が自分で書ける表は根拠にしない）
--   - 保守会社・無効なアカウント・未ログイン: 0行
-- 既存の management_companies_scoped（管理者と保守会社）・management_companies_master / _for_request（管理会社には返さない）では
-- 管理会社アカウントが自社名を引けず、略称（biz.companies.short_name）も返さないので、別名で足す。
-- 戻し手順は末尾。

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION signage.master_property_management_companies()
 RETURNS TABLE(property_code text, management_company_id uuid, management_company_name text, management_company_short_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'pg_temp'
AS $function$
  select sp.property_code, c.id, c.name, nullif(btrim(c.short_name), '')
  from signage.signage_master_properties sp
  join biz.properties bp on bp.signage_property_id = sp.id
  left join biz.companies c on c.id = bp.management_company_id
  where signage.is_active_admin()
     or (signage.is_active_management()
         and bp.management_company_id = signage.current_management_company_id())
  order by sp.property_code;
$function$;

COMMENT ON FUNCTION signage.master_property_management_companies() IS
  '修正依頼1025 E1: マスター管理の物件一覧の管理会社（正式名・略称）。管理者は全物件、管理会社は自社物件だけ、ほかは0行';

REVOKE ALL ON FUNCTION signage.master_property_management_companies() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION signage.master_property_management_companies() TO authenticated, service_role;

-- 戻し手順:
--   DROP FUNCTION IF EXISTS signage.master_property_management_companies();
