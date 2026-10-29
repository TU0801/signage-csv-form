-- 修正依頼1029(1) ファイルのアップロード画面の統一（ユーザー決定②③）
-- 2026-10-29 作成。本番へは未適用（適用はユーザー承認後）。ローカル DB（signage-v2-verify）で確かめた（scripts/test-fix-1029-upload.sql）。
-- 適用方法: ファイル全体を1つのクエリとして流す（Management API なら1回の query に全文を入れる。psql なら psql -1 -f）。
--   BEGIN/COMMIT は付けない。先頭の lock_timeout で、ロックが取れないときは待ち続けずに失敗させる。何度流しても同じ結果になる。
--   既存の関数は引数の形を変えない（CREATE OR REPLACE だけ。重複定義を作らない）。土台は本番の定義（2026-10-29 に
--   pg_get_functiondef で読んだもの。ローカルの定義と md5 が一致）。表・制約は変えない。
--
-- 1. 報告書の削除（決定②）: 受領前（提出・差戻し）は、上げた保守会社も自社の報告書を削除できる。受領済み・置き換え済み
--    （1027 より前の再提出で superseded になった版）は管理者だけ。他社の報告書は今どおり「権限がありません」。復元は管理者だけのまま。
-- 2. その他ファイルの削除（決定②）: 上げた会社（保守会社は同じ vendor_id）も削除できる。今までは上げた本人と管理者だけだった。
--    管理会社は vendor_id を持たないので、上げた人の管理会社が自社と同じなら削除できる。見えないファイルは今どおり「見つかりません」。
-- 3. 動画（決定③）: Storage のバケット property-files に MP4（video/mp4）・MOV（video/quicktime）を足す。上限 50MB は今のまま。
-- 4. ファイル名からの自動入力に使う名前の一覧（新しい RPC 2つ。読むだけ）:
--    portal_upload_property_aliases … その他ファイルを置ける建物（portal_property_file_targets と同じ範囲）の signage の物件コード・名前と、
--      業務システムの物件名・物件名略称・サイネージ名、管理会社 ID
--    portal_upload_vendor_aliases … 範囲内の保守会社（管理者は全社、ほかは範囲内の点検の保守会社と自社）の取引先名・略称
--    管理会社の名前・略称は既存の management_company_short_names を使う。

SET lock_timeout = '5s';

-- ============================================================
-- 1. portal_update_report（受領前は自社の版を削除できる）
-- ============================================================
CREATE OR REPLACE FUNCTION signage.portal_update_report(p_report_id uuid, p_action text, p_performed_on date DEFAULT NULL::date, p_target_month date DEFAULT NULL::date, p_file_name text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS signage.signage_inspection_reports
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'signage', 'pg_temp'
AS $function$
DECLARE
  r signage.signage_inspection_reports;
BEGIN
  SELECT * INTO r FROM signage.signage_inspection_reports WHERE id = p_report_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '報告書が見つかりません' USING ERRCODE = 'P0002';
  END IF;
  -- 管理者以外は自社が提出した報告書だけ（同じ点検に台ごとの別の保守会社が居ても、他社の版は触らせない）
  -- 無効・プロファイル無しのユーザーでは current_role_kind()・current_vendor_id() が NULL になり、式全体が NULL で
  -- IF を素通りしていた。coalesce で「判定できないときは権限なし」にする。
  IF NOT coalesce(signage.is_active_admin(), false)
     AND NOT coalesce(signage.current_role_kind() = 'user' AND r.vendor_id IS NOT NULL
                      AND r.vendor_id = signage.current_vendor_id(), false) THEN
    RAISE EXCEPTION 'この報告書を変更する権限がありません' USING ERRCODE = '42501';
  END IF;
  -- 復元は管理者だけ（保守会社が管理者の削除を取り消せないように。修正依頼1027 決定②）
  IF NOT coalesce(signage.is_active_admin(), false) AND p_action = 'restore' THEN
    RAISE EXCEPTION '報告書の復元は管理者だけができます' USING ERRCODE = '42501';
  END IF;
  -- 削除: 受領前（提出・差戻し）は上げた保守会社も自社の版を削除できる。受領済み・置き換え済みは管理者だけ（修正依頼1029 決定②。
  -- 画面の reportPermissions.canDelete と同じ）
  IF NOT coalesce(signage.is_active_admin(), false) AND p_action = 'delete' AND r.status NOT IN ('submitted', 'returned', 'deleted') THEN
    RAISE EXCEPTION '受領済み・置き換え済みの報告書の削除は管理者だけができます' USING ERRCODE = '42501';
  END IF;
  IF NOT coalesce(signage.is_active_admin(), false) AND r.status = 'accepted' THEN
    RAISE EXCEPTION '受領済みの報告書は変更できません（再提出してください）' USING ERRCODE = '42501';
  END IF;

  IF p_action = 'edit' THEN
    IF r.status IN ('deleted', 'superseded') THEN
      RAISE EXCEPTION '削除済み・置き換え済みの報告書は変更できません' USING ERRCODE = '22023';
    END IF;
    UPDATE signage.signage_inspection_reports SET
      performed_on = coalesce(p_performed_on, performed_on),
      target_month = coalesce(date_trunc('month', p_target_month)::date, target_month),
      file_name = CASE WHEN p_file_name IS NULL THEN file_name ELSE
        signage.unique_report_file_name(property_code, extract(year from coalesce(p_performed_on, performed_on))::int, p_file_name, id) END,
      note = CASE WHEN p_note IS NULL THEN note ELSE nullif(btrim(p_note), '') END
    WHERE id = p_report_id RETURNING * INTO r;
  ELSIF p_action = 'delete' THEN
    IF r.status = 'deleted' THEN RETURN r; END IF;
    UPDATE signage.signage_inspection_reports SET status_before_delete = status, status = 'deleted'
    WHERE id = p_report_id RETURNING * INTO r;
  ELSIF p_action = 'restore' THEN
    IF r.status <> 'deleted' THEN RETURN r; END IF;
    UPDATE signage.signage_inspection_reports SET status = coalesce(status_before_delete, 'submitted'), status_before_delete = NULL,
      file_name = signage.unique_report_file_name(property_code, extract(year from performed_on)::int, file_name, id)
    WHERE id = p_report_id RETURNING * INTO r;
  ELSE
    RAISE EXCEPTION '不明な操作です: %', p_action USING ERRCODE = '22023';
  END IF;
  RETURN r;
END;
$function$;

REVOKE ALL ON FUNCTION signage.portal_update_report(uuid, text, date, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION signage.portal_update_report(uuid, text, date, date, text, text) TO authenticated, service_role;

-- ============================================================
-- 2. portal_delete_property_file（上げた会社も削除できる）
-- ============================================================
CREATE OR REPLACE FUNCTION signage.portal_delete_property_file(p_file_id uuid)
 RETURNS signage.signage_property_files
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'signage', 'pg_temp'
AS $function$
DECLARE
  r signage.signage_property_files;
BEGIN
  SELECT * INTO r FROM signage.signage_property_files WHERE id = p_file_id;
  IF NOT FOUND OR NOT signage.property_file_visible(r.vendor_id, r.uploaded_by, r.property_code) THEN
    RAISE EXCEPTION 'ファイルが見つかりません' USING ERRCODE = 'P0002';
  END IF;
  -- 管理者・上げた本人に加えて、上げた会社（保守会社は同じ vendor_id、管理会社は上げた人の管理会社が自社）も削除できる
  -- （修正依頼1029 決定②）。判定できないとき（無効・プロファイル無し）は coalesce で権限なしに倒す
  IF NOT coalesce(
       signage.is_active_admin()
       OR (r.uploaded_by = auth.uid() AND signage.current_role_kind() IS NOT NULL)
       OR (signage.current_role_kind() = 'user' AND r.vendor_id IS NOT NULL AND r.vendor_id = signage.current_vendor_id())
       OR (signage.current_role_kind() = 'management' AND r.vendor_id IS NULL
           AND signage.current_management_company_id() IS NOT NULL
           AND EXISTS (SELECT 1 FROM signage.signage_profiles p
                        WHERE p.id = r.uploaded_by AND p.role = 'management'
                          AND p.management_company_id = signage.current_management_company_id())),
       false) THEN
    RAISE EXCEPTION 'このファイルを削除できるのは、アップロードした会社と管理者だけです' USING ERRCODE = '42501';
  END IF;
  UPDATE signage.signage_property_files SET status = 'deleted' WHERE id = p_file_id RETURNING * INTO r;
  RETURN r;
END;
$function$;

REVOKE ALL ON FUNCTION signage.portal_delete_property_file(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION signage.portal_delete_property_file(uuid) TO authenticated, service_role;

-- ============================================================
-- 3. バケット property-files に動画（MP4・MOV）を足す（2回流しても重複しない）
-- ============================================================
UPDATE storage.buckets
   SET allowed_mime_types = (
         SELECT array_agg(DISTINCT m ORDER BY m)
           FROM unnest(coalesce(allowed_mime_types, ARRAY[]::text[]) || ARRAY['video/mp4', 'video/quicktime']) AS m)
 WHERE id = 'property-files'
   AND NOT (coalesce(allowed_mime_types, ARRAY[]::text[]) @> ARRAY['video/mp4', 'video/quicktime']);

-- ============================================================
-- 4. ファイル名からの自動入力に使う名前の一覧
-- ============================================================
CREATE OR REPLACE FUNCTION signage.portal_upload_property_aliases()
 RETURNS TABLE(property_code text, property_name text, biz_name text, biz_name_short text, signage_name text, management_company_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'pg_temp'
AS $function$
  -- 範囲は portal_property_file_targets と同じ（その他ファイルを置ける建物。保守会社は自社の点検がある物件）
  select s.property_code, s.property_name,
         nullif(btrim(b.name), ''), nullif(btrim(b.name_short), ''), nullif(btrim(b.signage_name), ''),
         b.management_company_id
  from signage.signage_master_properties s
  left join lateral (
    select bp.name, bp.name_short, bp.signage_name, bp.management_company_id
    from biz.properties bp where bp.signage_property_id = s.id
    order by bp.id limit 1) b on true
  where signage.current_role_kind() is not null and signage.property_file_writable(s.id)
  order by s.property_code;
$function$;

REVOKE ALL ON FUNCTION signage.portal_upload_property_aliases() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION signage.portal_upload_property_aliases() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION signage.portal_upload_vendor_aliases()
 RETURNS TABLE(id uuid, name text, short_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'pg_temp'
AS $function$
  -- 保守会社（biz.maintainers の id は biz.companies の id）。管理者は全社、ほかは自社と範囲内の点検の保守会社
  select m.id, c.name, nullif(btrim(c.short_name), '')
  from biz.maintainers m
  join biz.companies c on c.id = m.id
  where signage.is_active_admin()
     or (signage.current_role_kind() = 'user' and m.id = signage.current_vendor_id())
     or (signage.current_role_kind() is not null and exists (
           select 1 from biz.property_inspections pi
           where pi.maintainer_id = m.id and signage.inspection_in_scope(pi.id)))
  order by c.name;
$function$;

REVOKE ALL ON FUNCTION signage.portal_upload_vendor_aliases() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION signage.portal_upload_vendor_aliases() TO authenticated, service_role;
