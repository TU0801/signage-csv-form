-- 修正依頼1027 報告書まわり（1027(1)・(2)。ユーザー決定①②）
-- 2026-10-27 作成。本番へは未適用（適用はユーザー承認後）。ローカル DB（signage-v2-verify）で確かめた（scripts/test-fix-1027-reports.sql）。
-- 適用方法: ファイル全体を1つのクエリとして流す（Management API なら1回の query に全文を入れる。psql なら psql -1 -f）。
--   BEGIN/COMMIT は付けない。先頭の lock_timeout で、ロックが取れないときは待ち続けずに失敗させる。何度流しても同じ結果になる。
--   関数の引数の形は変えない（CREATE OR REPLACE だけ。重複定義を作らない）。土台は本番の定義（2026-10-27 に pg_get_functiondef で読んだもの。
--   ローカルの定義と md5 が一致）。表・制約は変えない（一意制約は元から無い。状態 superseded の CHECK は過去の行があるので残す）。
--
-- 1. 報告書は1つの点検 × 対象月に複数持てる（決定①）。portal_register_report が同じ保守会社の前の版を superseded に
--    していた UPDATE を外し、再提出は「追加」にする。要らない版は管理者が削除する（2）。
--    既に superseded になっている過去の版はそのまま（戻さない）。
-- 2. 報告書の削除は管理者だけ（決定②）。portal_update_report の delete を管理者だけにする。復元も管理者だけにする
--    （保守会社が管理者の削除を取り消せないように）。編集（edit）は今どおり（保守会社は自社の版で受領前のもの）。

SET lock_timeout = '5s';

-- ============================================================
-- 1. portal_register_report（置き換えをやめて追加にする）
-- ============================================================
CREATE OR REPLACE FUNCTION signage.portal_register_report(p_inspection_id uuid, p_target_month date, p_performed_on date, p_file_name text, p_storage_path text, p_original_name text, p_size_bytes bigint, p_content_hash text, p_entry_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text)
 RETURNS signage.signage_inspection_reports
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'pg_temp'
AS $function$
DECLARE
  r signage.signage_inspection_reports;
  info record;
  v_vendor uuid;
BEGIN
  IF NOT signage.inspection_writable(p_inspection_id) THEN
    RAISE EXCEPTION 'この点検の報告書を登録する権限がありません' USING ERRCODE = '42501';
  END IF;
  IF p_performed_on IS NULL THEN
    RAISE EXCEPTION '実施日を入力してください' USING ERRCODE = '22023';
  END IF;
  IF p_storage_path IS NULL OR split_part(p_storage_path, '/', 1) <> p_inspection_id::text OR p_storage_path LIKE '%..%' THEN
    RAISE EXCEPTION 'ファイルの置き場所が不正です' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'inspection-reports' AND o.name = p_storage_path
                 AND (o.owner_id IS NULL OR o.owner_id = auth.uid()::text)) THEN
    RAISE EXCEPTION 'ファイルのアップロードが完了していません' USING ERRCODE = '22023';
  END IF;
  IF p_entry_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM signage.signage_entries e WHERE e.id = p_entry_id AND e.property_inspection_id = p_inspection_id) THEN
    RAISE EXCEPTION '申請と点検が一致しません' USING ERRCODE = '22023';
  END IF;

  SELECT s.property_code, s.property_name, pi.inspection_type_id, t.label, pi.maintainer_id
    INTO info
    FROM biz.property_inspections pi
    JOIN biz.properties b ON b.id = pi.property_id
    JOIN signage.signage_master_properties s ON s.id = b.signage_property_id
    LEFT JOIN biz.inspection_types t ON t.id = pi.inspection_type_id
   WHERE pi.id = p_inspection_id;

  -- 提出する保守会社: 保守会社のアカウントは自社。管理者の代理提出は、同じ点検・対象月の最新の版の保守会社（再提出）、
  -- 無ければ点検行の保守会社
  v_vendor := coalesce(
    signage.current_vendor_id(),
    (SELECT r0.vendor_id FROM signage.signage_inspection_reports r0
      WHERE r0.property_inspection_id = p_inspection_id
        AND r0.target_month IS NOT DISTINCT FROM date_trunc('month', coalesce(p_target_month, p_performed_on))::date
        AND r0.status IN ('submitted', 'returned', 'accepted')
      ORDER BY r0.created_at DESC LIMIT 1),
    info.maintainer_id);

  -- 前の版は置き換えない（修正依頼1027 決定①: 1つの点検 × 対象月に複数の報告書を持てる。再提出は追加。
  -- 要らない版は管理者が削除する）

  INSERT INTO signage.signage_inspection_reports (
    property_inspection_id, property_code, property_name, inspection_type_id, inspection_type_label,
    vendor_id, vendor_name, target_month, performed_on, entry_id, file_name, original_name, size_bytes,
    content_hash, storage_path, note, uploaded_by)
  VALUES (
    p_inspection_id, info.property_code, info.property_name, info.inspection_type_id, coalesce(info.label, ''),
    v_vendor,
    (SELECT v.vendor_name FROM signage.signage_master_vendors v WHERE v.id = v_vendor),
    date_trunc('month', coalesce(p_target_month, p_performed_on))::date, p_performed_on, p_entry_id,
    signage.unique_report_file_name(info.property_code, extract(year from p_performed_on)::int, p_file_name),
    p_original_name, p_size_bytes, p_content_hash, p_storage_path, nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  RETURNING * INTO r;
  RETURN r;
END;
$function$;

REVOKE ALL ON FUNCTION signage.portal_register_report(uuid, date, date, text, text, text, bigint, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION signage.portal_register_report(uuid, date, date, text, text, text, bigint, text, uuid, text) TO authenticated, service_role;

-- ============================================================
-- 2. portal_update_report（削除・復元は管理者だけ）
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
  IF NOT signage.is_active_admin()
     AND NOT (signage.current_role_kind() = 'user' AND r.vendor_id IS NOT NULL AND r.vendor_id = signage.current_vendor_id()) THEN
    RAISE EXCEPTION 'この報告書を変更する権限がありません' USING ERRCODE = '42501';
  END IF;
  -- 削除・復元は管理者だけ（修正依頼1027 決定②）
  IF NOT signage.is_active_admin() AND p_action IN ('delete', 'restore') THEN
    RAISE EXCEPTION '報告書の削除・復元は管理者だけができます' USING ERRCODE = '42501';
  END IF;
  IF NOT signage.is_active_admin() AND r.status = 'accepted' THEN
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
