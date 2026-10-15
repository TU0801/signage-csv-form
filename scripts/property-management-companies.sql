-- 2026-10-15 1件入力の「管理会社」フィルター用: signage の物件ごとの管理会社を業務システム（biz）から返す
-- 物件と biz.properties は signage_property_id で結び付く。管理会社の正本は biz.properties.management_company_id → biz.companies。
-- 管理会社が未設定（点検だけの物件など）の物件は management_company_id / management_company_name が null。
-- 画面で使うのは管理者だけなので、有効な管理者以外には何も返さない。
-- 戻すとき: DROP FUNCTION signage.property_management_companies();

CREATE OR REPLACE FUNCTION signage.property_management_companies()
 RETURNS TABLE(property_code text, management_company_id uuid, management_company_name text)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'public'
AS $function$
  select sp.property_code, c.id, c.name
  from signage.signage_master_properties sp
  join biz.properties bp on bp.signage_property_id = sp.id
  left join biz.companies c on c.id = bp.management_company_id
  where signage.is_active_admin()
  order by sp.property_code;
$function$;

REVOKE ALL ON FUNCTION signage.property_management_companies() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION signage.property_management_companies() TO authenticated, service_role;
