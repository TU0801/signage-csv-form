-- 修正依頼20261104 E1（業務システムからの中継）: ファイルアップロードで、自社（biz.issuers の発行元と同じ会社）を
-- 保守会社の読み取りの候補から外すための名前の一覧
-- 2026-11-05 作成。本番へは未適用（適用はユーザー承認後）。
-- 適用方法: ファイル全体を1つのクエリとして流す（Management API なら1回の query に全文を入れる）。何度流しても同じ結果になる。
--   新しい関数を1つ足すだけで、既存の関数・表は変えない。画面は、この関数が無い・失敗したときは自社を外さずに今までどおり動く。
--
-- 背景: 本番では 株式会社BARAN が biz.maintainers に入っていて（2026-11-05 照会）、portal_upload_vendor_aliases の候補に出る。
--   他社の報告書・請求書の宛名「株式会社BARAN 御中」を、文字情報・AI-OCR が保守会社と読み、保守会社の欄が BARAN になる
--   （保守会社アカウントの既定の自社が黙って置き換わり、点検が決まらなくなる）。業務システムは biz PR #12 で同じ対処をした。
-- 照合（会社名の核＝法人格・空白を除いた名前が、取引先名か略称と一致）は画面側で行う（aiOcr.ts の companyCore。業務システムの
--   ownCompanyIdsOf と同じ規則）。ここは有効な発行元の会社名だけを返す（自社の社名なので、範囲で絞らず有効なメンバー全員に返す）。

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION signage.portal_upload_issuer_names()
 RETURNS TABLE(company_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'pg_temp'
AS $function$
  select distinct btrim(i.company_name)
  from biz.issuers i
  where i.active
    and nullif(btrim(i.company_name), '') is not null
    and (signage.is_active_admin() or signage.current_role_kind() is not null)
  order by 1;
$function$;

REVOKE ALL ON FUNCTION signage.portal_upload_issuer_names() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION signage.portal_upload_issuer_names() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
