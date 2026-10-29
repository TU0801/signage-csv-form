-- 修正依頼1029(1) ファイルのアップロード画面の統一（ユーザー決定②③）
-- 2026-10-29 作成。本番へは未適用（適用はユーザー承認後）。ローカル DB（signage-v2-verify）で確かめた（scripts/test-fix-1029-upload.sql）。
-- 適用方法: ファイル全体を1つのクエリとして流す（Management API なら1回の query に全文を入れる。psql なら psql -1 -f）。
--   BEGIN/COMMIT は付けない。先頭の lock_timeout で、ロックが取れないときは待ち続けずに失敗させる。何度流しても同じ結果になる。
--   既存の関数は、portal_register_property_file を除いて引数の形を変えない（CREATE OR REPLACE だけ）。portal_register_property_file は
--   引数 p_vendor_id（既定 NULL）を足すので、古い形（12引数）を DROP してから作る（重複定義を作らない。PostgREST が呼び分けで
--   迷わないように）。古い画面は p_vendor_id を渡さないので、適用後も今までどおり動く。土台は本番の定義（2026-10-29 に
--   pg_get_functiondef で読んだもの。ローカルの定義と md5 が一致）。表・制約は変えない。
--
-- 1. 報告書の削除（決定②）: 受領前（提出のうち）は、上げた保守会社も自社の報告書を削除できる。差戻し・受領済み・置き換え済み
--    （1027 より前の再提出で superseded になった版）は管理者だけ（差戻しは決定②の「提出のうち」に入らないと読んだ。差戻しの版を
--    消すと管理者の差戻し理由が一覧から消えるため。含めるなら下の NOT IN に 'returned' を足し、画面の canDelete も合わせる）。他社の報告書は今どおり「権限がありません」。復元は管理者だけのまま。
-- 2. その他ファイルの削除（決定②）: 上げた会社（保守会社は同じ vendor_id）も削除できる。今までは上げた本人と管理者だけだった。
--    管理会社は vendor_id を持たないので、上げた人の管理会社が自社と同じなら削除できる。見えないファイルは今どおり「見つかりません」。
--    判定は signage.property_file_can_delete(行) にまとめ、画面も同じ関数を一覧の列 can_delete（PostgREST の計算列）で読む
--    （管理者が上げた保守会社なしのファイルに、管理会社の画面で削除ボタンが出て押すと断られる、を無くす）。
-- 2b. その他ファイルの登録（portal_register_property_file）に p_vendor_id を足す。管理者のときだけ使う（画面の保守会社の欄で
--    選んだ会社。空なら今までどおり NULL）。保守会社のアカウントは今までどおり自社に固定し、管理会社は NULL のまま（渡しても使わない）。
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
  -- 削除: 受領前（提出のうち）は上げた保守会社も自社の版を削除できる。差戻し・受領済み・置き換え済みは管理者だけ（修正依頼1029 決定②。
  -- 画面の reportPermissions.canDelete と同じ）
  IF NOT coalesce(signage.is_active_admin(), false) AND p_action = 'delete' AND r.status NOT IN ('submitted', 'deleted') THEN
    RAISE EXCEPTION '差戻し・受領済み・置き換え済みの報告書の削除は管理者だけができます' USING ERRCODE = '42501';
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
-- 削除できるか（見えるかは見ない。呼ぶ側が property_file_visible か RLS で絞る）。画面の一覧は計算列 can_delete として読む
CREATE OR REPLACE FUNCTION signage.property_file_can_delete(f signage.signage_property_files)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'signage', 'pg_temp'
AS $function$
  -- 管理者・上げた本人に加えて、上げた会社（保守会社は同じ vendor_id、管理会社は上げた人の管理会社が自社）も削除できる
  -- （修正依頼1029 決定②）。判定できないとき（無効・プロファイル無し）は coalesce で権限なしに倒す
  select coalesce(
       signage.is_active_admin()
       or (f.uploaded_by = auth.uid() and signage.current_role_kind() is not null)
       or (signage.current_role_kind() = 'user' and f.vendor_id is not null and f.vendor_id = signage.current_vendor_id())
       or (signage.current_role_kind() = 'management' and f.vendor_id is null
           and signage.current_management_company_id() is not null
           and exists (select 1 from signage.signage_profiles p
                        where p.id = f.uploaded_by and p.role = 'management'
                          and p.management_company_id = signage.current_management_company_id())),
       false);
$function$;

REVOKE ALL ON FUNCTION signage.property_file_can_delete(signage.signage_property_files) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION signage.property_file_can_delete(signage.signage_property_files) TO authenticated, service_role;

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
  -- 判定は property_file_can_delete（画面の削除ボタンと同じ）
  IF NOT signage.property_file_can_delete(r) THEN
    RAISE EXCEPTION 'このファイルを削除できるのは、アップロードした会社と管理者だけです' USING ERRCODE = '42501';
  END IF;
  UPDATE signage.signage_property_files SET status = 'deleted' WHERE id = p_file_id RETURNING * INTO r;
  RETURN r;
END;
$function$;

REVOKE ALL ON FUNCTION signage.portal_delete_property_file(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION signage.portal_delete_property_file(uuid) TO authenticated, service_role;

-- ============================================================
-- 2b. portal_register_property_file（管理者は保守会社を選べる）
-- ============================================================
-- 古い形（12引数）を消してから作る。2回目は DROP が何もしない
DROP FUNCTION IF EXISTS signage.portal_register_property_file(text, text, text, text, text, text, text, bigint, text, date, text, jsonb);

CREATE OR REPLACE FUNCTION signage.portal_register_property_file(p_property_code text, p_category text, p_category_note text, p_file_name text, p_storage_path text, p_original_name text, p_mime_type text, p_size_bytes bigint, p_content_hash text, p_doc_date date DEFAULT NULL::date, p_note text DEFAULT NULL::text, p_ocr_result jsonb DEFAULT NULL::jsonb, p_vendor_id uuid DEFAULT NULL::uuid)
 RETURNS signage.signage_property_files
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'pg_temp'
AS $function$
DECLARE
  r signage.signage_property_files;
  info record;
  -- 保守会社のアカウントは自社に固定（p_vendor_id は見ない）。管理者は画面で選んだ保守会社（空なら無し）。管理会社は無し
  v_vendor uuid := CASE signage.current_role_kind()
                     WHEN 'user' THEN signage.current_vendor_id()
                     WHEN 'admin' THEN p_vendor_id
                     ELSE NULL END;
  v_name text := btrim(coalesce(p_file_name, ''));
  dup record;
  p_property_id uuid;
BEGIN
  -- 物件は物件コードの完全一致で1行に決める（-00 の有無などの正規化はしない）
  SELECT s.id INTO p_property_id FROM signage.signage_master_properties s WHERE s.property_code = p_property_code;
  IF p_property_id IS NULL OR NOT signage.property_file_writable(p_property_id) THEN
    RAISE EXCEPTION 'この建物にファイルを登録する権限がありません' USING ERRCODE = '42501';
  END IF;
  IF v_vendor IS NOT NULL AND NOT EXISTS (SELECT 1 FROM signage.signage_master_vendors v WHERE v.id = v_vendor) THEN
    RAISE EXCEPTION '保守会社が見つかりません' USING ERRCODE = '22023';
  END IF;
  IF p_category IS NULL OR p_category NOT IN ('estimate', 'invoice', 'contract', 'building_info', 'proposal', 'photo', 'other') THEN
    RAISE EXCEPTION '区分を選んでください' USING ERRCODE = '22023';
  END IF;
  IF p_category = 'other' AND nullif(btrim(coalesce(p_category_note, '')), '') IS NULL THEN
    RAISE EXCEPTION '「その他」の内容を入力してください' USING ERRCODE = '22023';
  END IF;
  IF v_name = '' OR length(v_name) > 200 OR v_name ~ '[<>:"/\\|?*]' THEN
    RAISE EXCEPTION 'ファイル名が不正です' USING ERRCODE = '22023';
  END IF;
  IF p_storage_path IS NULL OR split_part(p_storage_path, '/', 1) <> p_property_code OR p_storage_path LIKE '%..%' THEN
    RAISE EXCEPTION 'ファイルの置き場所が不正です' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'property-files' AND o.name = p_storage_path
                 AND (o.owner_id IS NULL OR o.owner_id = auth.uid()::text)) THEN
    RAISE EXCEPTION 'ファイルのアップロードが完了していません' USING ERRCODE = '22023';
  END IF;
  -- 同じ建物に同じ内容のファイルが登録済みなら止める（二重の登録を防ぐ）
  IF p_content_hash IS NOT NULL THEN
    -- 照合するのは呼んだ人が見られるファイルだけ。ファイル名もエラーに出さない
    -- （ハッシュは画面から来るので、見えない他社のファイルの有無・名前を探る窓口にしない）
    SELECT f.id INTO dup FROM signage.signage_property_files f
     WHERE f.property_id = p_property_id AND f.content_hash = p_content_hash AND f.status = 'active'
       AND signage.property_file_visible(f.vendor_id, f.uploaded_by, f.property_code) LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION '同じ内容のファイルがこの建物に登録済みです（一覧で確かめてください）' USING ERRCODE = '23505';
    END IF;
  END IF;

  SELECT s.property_code, s.property_name,
         (SELECT b.management_company_id FROM biz.properties b WHERE b.signage_property_id = s.id LIMIT 1) AS mgmt
    INTO info
    FROM signage.signage_master_properties s WHERE s.id = p_property_id;

  INSERT INTO signage.signage_property_files (
    property_id, property_code, property_name, category, category_note, doc_date, file_name, original_name,
    storage_path, mime_type, size_bytes, content_hash, uploaded_by, vendor_id, vendor_name, management_company_id,
    note, ocr_result)
  VALUES (
    p_property_id, info.property_code, info.property_name, p_category,
    CASE WHEN p_category = 'other' THEN btrim(p_category_note) ELSE nullif(btrim(coalesce(p_category_note, '')), '') END,
    p_doc_date, v_name, p_original_name, p_storage_path, coalesce(nullif(p_mime_type, ''), 'application/octet-stream'),
    p_size_bytes, p_content_hash, auth.uid(), v_vendor,
    (SELECT v.vendor_name FROM signage.signage_master_vendors v WHERE v.id = v_vendor),
    info.mgmt, nullif(btrim(coalesce(p_note, '')), ''), p_ocr_result)
  RETURNING * INTO r;
  RETURN r;
END;
$function$;

REVOKE ALL ON FUNCTION signage.portal_register_property_file(text, text, text, text, text, text, text, bigint, text, date, text, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION signage.portal_register_property_file(text, text, text, text, text, text, text, bigint, text, date, text, jsonb, uuid) TO authenticated, service_role;

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
