-- 修正依頼1115 前提（要件2・5・6の共通の前提。この SQL を最初に当てる）: 点検テンプレート（biz.template_images）を管理会社にも返す
-- 2026-11-16 作成。本番へは未適用（適用はユーザー承認後）。ローカル DB（signage-v2-verify）で確かめた（scripts/test-fix-1115-templates.sql）。
--
-- 目的: signage.template_images_master() は有効なメンバー（role が admin / user）にしか行を返さず、管理会社のアカウントには0行だった。
--   要件6（貼紙ライブラリにテンプレートを閲覧のみで並べる）・要件5（保守会社タブの既定TPLと貼紙サムネイル、TPL の上書きの選択肢）・
--   要件2（管理会社の1件入力・一括入力の詳細設定で、テンプレートの画像とテンプレート名を出す）はどれもこの RPC を読むので、
--   条件を「有効なメンバー OR 有効な管理会社（signage.is_active_management()）」に広げる。
--   テンプレートの画像は公開バケット（poster-images）にあり、ここで返すのはテンプレートの名前・URL・分類・並び順だけ（秘密の情報は無い）。
--   無効の管理会社・管理会社の未設定のアカウント・プロファイルの無いアカウント・anon には今までどおり何も返さない。
--
-- 土台: 本番の現行定義（2026-11-16 に Management API の SELECT で pg_get_functiondef を読んだもの）。変えたのは WHERE の1行だけで、
--   戻り値・SECURITY DEFINER・search_path・揮発性の指定（無指定＝VOLATILE）は本番のまま。
--   旧表 signage.signage_master_template_images（画面の予備の読み取り先）の SELECT は is_active_member() のままで、ここでは変えない。
--
-- 適用方法: ファイル全体を1つのクエリとして流す（Management API なら1回の query に全文を入れる。psql なら psql -1 -f）。
--   BEGIN/COMMIT は付けない。何度流しても同じ結果になる。既存の表・他の関数は変えない。
-- 適用順: 修正依頼1115 の SQL のうち最初（要件2・5・6 の SQL より前）。画面のデプロイより前に当てても今の画面は壊れない（行が増えるだけ）。
--
-- 戻し手順（本番の現行定義に戻す）:
--   CREATE OR REPLACE FUNCTION signage.template_images_master()
--    RETURNS TABLE(id uuid, image_key text, display_name text, image_url text, category text, sort_order integer)
--    LANGUAGE sql
--    SECURITY DEFINER
--    SET search_path TO 'biz', 'signage', 'public'
--   AS $function$
--     select t.id, t.image_key, t.display_name, t.image_url, t.category, t.sort_order
--     from biz.template_images t
--     where signage.is_active_member()
--     order by t.sort_order, t.image_key;
--   $function$;
--   （権限は変わらないので REVOKE / GRANT は流し直さなくてよい）

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION signage.template_images_master()
 RETURNS TABLE(id uuid, image_key text, display_name text, image_url text, category text, sort_order integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'public'
AS $function$
  select t.id, t.image_key, t.display_name, t.image_url, t.category, t.sort_order
  from biz.template_images t
  where signage.is_active_member() or signage.is_active_management()
  order by t.sort_order, t.image_key;
$function$;

REVOKE ALL ON FUNCTION signage.template_images_master() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION signage.template_images_master() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
