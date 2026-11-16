-- fix-1115-mgmt-entry.sql の戻し（修正依頼1115 (2) の DB 部分を当てる前の状態に戻す）
-- 置換した8関数は、本番の現行定義（2026-11-16 に Management API の SELECT で pg_get_functiondef を読んだもの）をそのまま収めた。
-- 足した関数（entry_vendor_for_management・3引数の submitted_entry_editable・inspection_report_writable）とポリシー4本を消す。
-- 適用方法: ファイル全体を1つのクエリとして流す（BEGIN/COMMIT は付けない）。何度流しても同じ結果になる。
-- 要件5の SQL を当てた後なら、先に要件5の戻しを流す。トリガー関数の PUBLIC・anon の EXECUTE は戻さない（発火には関係しない）。

SET lock_timeout = '5s';

DROP POLICY IF EXISTS mgmt_insert_entries ON signage.signage_entries;
DROP POLICY IF EXISTS mgmt_update_own_pending_entries ON signage.signage_entries;
DROP POLICY IF EXISTS inspection_reports_mgmt_insert ON storage.objects;
DROP POLICY IF EXISTS "poster-images mgmt own insert" ON storage.objects;

CREATE OR REPLACE FUNCTION signage.guard_entry_portal_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'signage', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR signage.is_active_admin() OR current_setting('signage.portal_review', true) = 'on' THEN
    RETURN NEW;
  END IF;
  -- 業務システムで点検行を消したときの FK（ON DELETE SET NULL）による更新は通す。
  -- property_inspection_id が NULL になるだけで、ほかの列は変わらない
  IF TG_OP = 'UPDATE' AND OLD.property_inspection_id IS NOT NULL AND NEW.property_inspection_id IS NULL
     AND (to_jsonb(NEW) - 'property_inspection_id' - 'updated_at') = (to_jsonb(OLD) - 'property_inspection_id' - 'updated_at')
     -- 参照先が本当に消えているときだけ（利用者が自分で紐付けを外す更新は通常の検査にかける）
     AND NOT EXISTS (SELECT 1 FROM biz.property_inspections WHERE id = OLD.property_inspection_id) THEN
    RETURN NEW;
  END IF;

  IF signage.current_role_kind() = 'management' THEN
    RAISE EXCEPTION '管理会社のアカウントでは申請を作成・変更できません' USING ERRCODE = '42501';
  END IF;
  IF NEW.property_inspection_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.property_inspection_id IS DISTINCT FROM OLD.property_inspection_id)
     AND NOT signage.inspection_in_scope(NEW.property_inspection_id) THEN
    RAISE EXCEPTION '担当外の点検には申請できません' USING ERRCODE = '42501';
  END IF;
  -- 点検に紐付けた申請は、その点検の物件のものでなければならない（承認の範囲は物件コードで決まるため、すり替えを止める）
  IF NEW.property_inspection_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM biz.property_inspections pi
       JOIN biz.properties b ON b.id = pi.property_id
       JOIN signage.signage_master_properties s ON s.id = b.signage_property_id
       WHERE pi.id = NEW.property_inspection_id AND s.property_code = NEW.property_code) THEN
    RAISE EXCEPTION '点検と物件が一致しません' USING ERRCODE = '22023';
  END IF;
  IF NEW.vendor_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.vendor_id IS DISTINCT FROM OLD.vendor_id)
     AND NEW.vendor_id IS DISTINCT FROM signage.current_vendor_id() THEN
    RAISE EXCEPTION '保守会社は自社のみ指定できます' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.review_comment := NULL; NEW.reviewed_by := NULL; NEW.reviewed_at := NULL;
  ELSE
    NEW.review_comment := OLD.review_comment; NEW.reviewed_by := OLD.reviewed_by; NEW.reviewed_at := OLD.reviewed_at;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION signage.guard_entry_unit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'pg_temp'
AS $function$
DECLARE
  v record;
  v_changed boolean;
BEGIN
  IF NEW.property_unit_id IS NULL THEN
    -- 台が2台以上の点検への台なしの申請は管理者以外断る（INSERT と、台・点検を変えたときだけ。既存の台なしの行の更新は通す）
    -- （INSERT では OLD を見ない。plpgsql の OR は短絡が保証されないので IF を分ける）
    IF TG_OP = 'INSERT' THEN
      v_changed := true;
    ELSE
      v_changed := NEW.property_unit_id IS DISTINCT FROM OLD.property_unit_id
                   OR NEW.property_inspection_id IS DISTINCT FROM OLD.property_inspection_id;
    END IF;
    IF v_changed AND NEW.property_inspection_id IS NOT NULL AND auth.uid() IS NOT NULL AND NOT signage.is_active_admin() THEN
      IF signage.inspection_unit_count(NEW.property_inspection_id) >= 2 THEN
        RAISE EXCEPTION '点検登録フォーム（一括入力）から台ごとに申請してください' USING ERRCODE = '22023';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  -- 台も点検も変わらない更新・業務システムで点検行を消したとき（FK の SET NULL）の更新は見ない
  IF TG_OP = 'UPDATE' AND NEW.property_unit_id IS NOT DISTINCT FROM OLD.property_unit_id
     AND (NEW.property_inspection_id IS NOT DISTINCT FROM OLD.property_inspection_id OR NEW.property_inspection_id IS NULL) THEN
    RETURN NEW;
  END IF;
  IF NEW.property_inspection_id IS NULL THEN
    RAISE EXCEPTION '台の指定は点検に結び付けた申請だけです' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v FROM signage.inspection_unit_vendor(NEW.property_inspection_id, NEW.property_unit_id);
  IF NOT v.is_unit THEN
    RAISE EXCEPTION '台がこの点検のものではありません' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND NOT signage.is_active_admin()
     AND v.vendor_id IS DISTINCT FROM signage.current_vendor_id() THEN
    RAISE EXCEPTION '担当外の台には申請できません' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION signage.guard_entry_type_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'pg_temp'
AS $function$
DECLARE
  v_link_changed boolean;
  v_type_changed boolean;
  v_template_changed boolean;
  v_label text;
  v_template text;
  v_vendor uuid;
BEGIN
  IF auth.uid() IS NULL OR signage.is_active_admin() THEN
    RETURN NEW;
  END IF;
  -- INSERT では OLD を見ない（plpgsql の OR は短絡が保証されないので分ける）
  IF TG_OP = 'INSERT' THEN
    v_link_changed := NEW.property_inspection_id IS NOT NULL;
    v_type_changed := false;
    v_template_changed := false;
  ELSE
    v_link_changed := NEW.property_inspection_id IS NOT NULL
                      AND NEW.property_inspection_id IS DISTINCT FROM OLD.property_inspection_id;
    v_type_changed := NEW.inspection_type IS DISTINCT FROM OLD.inspection_type;
    v_template_changed := NEW.template_no IS DISTINCT FROM OLD.template_no;
  END IF;

  -- (1) 点検に紐付いた申請の種別・テンプレートNo は、その点検のもの
  IF NEW.property_inspection_id IS NOT NULL AND (v_link_changed OR v_type_changed OR v_template_changed) THEN
    SELECT t.label, t.template_no INTO v_label, v_template
      FROM biz.property_inspections pi
      JOIN biz.inspection_types t ON t.id = pi.inspection_type_id
     WHERE pi.id = NEW.property_inspection_id;
    IF NOT FOUND OR NEW.inspection_type IS DISTINCT FROM v_label THEN
      RAISE EXCEPTION '点検種別が紐付けた点検と一致しません（点検種別を変えるときは、その種別の点検に紐付けてください）'
        USING ERRCODE = '22023';
    END IF;
    IF COALESCE(NEW.template_no, '') <> '' AND NEW.template_no IS DISTINCT FROM v_template THEN
      RAISE EXCEPTION 'テンプレートNoが点検種別と一致しません' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- (2) 点検種別を変えるときは、自社がその物件で担当する点検種別だけ
  IF v_type_changed THEN
    v_vendor := signage.current_vendor_id();
    IF v_vendor IS NULL OR NOT EXISTS (
         SELECT 1
           FROM biz.property_inspections pi
           JOIN biz.properties b ON b.id = pi.property_id
           JOIN signage.signage_master_properties s ON s.id = b.signage_property_id
           JOIN biz.inspection_types t ON t.id = pi.inspection_type_id
          WHERE s.property_code = NEW.property_code
            AND t.label = NEW.inspection_type
            AND (pi.maintainer_id = v_vendor
                 OR EXISTS (SELECT 1 FROM biz.property_unit_inspections ui
                              JOIN biz.property_units u ON u.id = ui.unit_id
                             WHERE u.property_id = pi.property_id
                               AND ui.inspection_type_id = pi.inspection_type_id
                               AND ui.maintainer_id = v_vendor))) THEN
      RAISE EXCEPTION '自社がこの物件で担当していない点検種別には変えられません' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- (3) INSERT と、点検種別かテンプレートNo を変えるときは、テンプレートNo が空か、その点検種別のもの
  IF TG_OP = 'INSERT' OR v_type_changed OR v_template_changed THEN
    SELECT t.template_no INTO v_template FROM biz.inspection_types t WHERE t.label = NEW.inspection_type LIMIT 1;
    IF COALESCE(NEW.template_no, '') <> '' AND NEW.template_no IS DISTINCT FROM v_template THEN
      RAISE EXCEPTION 'テンプレートNoが点検種別と一致しません' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION signage.portal_update_submitted_entry(p_entry_id uuid, p_patch jsonb)
 RETURNS signage.signage_entries
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'signage', 'pg_temp'
AS $function$
DECLARE
  e signage.signage_entries;
  n signage.signage_entries;
  v_allowed text[] := ARRAY[
    'inspection_start', 'inspection_end', 'remarks', 'memo', 'announcement', 'terminal_id', 'emergency_contact',
    'poster_type', 'poster_image', 'poster_position', 'extra_posters', 'display_duration',
    'display_start_date', 'display_start_time', 'display_end_date', 'display_end_time',
    'inspection_type', 'template_no', 'property_inspection_id', 'property_unit_id'];
  v_bad text;
  v_admin boolean;
  v_vendor uuid;
  v_type_changed boolean;
  v_link_changed boolean;
  v_template text;
  v_label text;
  u record;
BEGIN
  IF p_patch IS NULL OR jsonb_typeof(p_patch) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION '直す内容がありません' USING ERRCODE = '22023';
  END IF;
  SELECT k INTO v_bad FROM jsonb_object_keys(p_patch) k WHERE NOT (k = ANY (v_allowed)) LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'この項目は修正できません: %', v_bad USING ERRCODE = '22023';
  END IF;
  SELECT * INTO e FROM signage.signage_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND OR NOT signage.submitted_entry_editable(e.user_id, e.vendor_id) THEN
    RAISE EXCEPTION 'この申請を修正する権限がありません' USING ERRCODE = '42501';
  END IF;
  IF e.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION '修正できるのは承認前（点検予定申請中）の申請だけです（承認・差戻しの後は修正できません）' USING ERRCODE = '22023';
  END IF;
  n := jsonb_populate_record(e, p_patch);
  IF n.inspection_start IS NULL THEN
    RAISE EXCEPTION '点検開始日を入力してください' USING ERRCODE = '22023';
  END IF;
  IF n.inspection_end IS NOT NULL AND n.inspection_end < n.inspection_start THEN
    RAISE EXCEPTION '点検終了日は点検開始日以降にしてください' USING ERRCODE = '22023';
  END IF;
  IF n.terminal_id IS NULL OR n.extra_posters IS NULL THEN
    RAISE EXCEPTION '端末・追加の貼紙は空（NULL）にできません' USING ERRCODE = '22023';
  END IF;

  -- 点検種別・テンプレートNo・紐付け（修正依頼1029 決定④）
  v_admin := signage.is_active_admin();
  v_vendor := signage.current_vendor_id();
  v_type_changed := n.inspection_type IS DISTINCT FROM e.inspection_type;
  v_link_changed := n.property_inspection_id IS DISTINCT FROM e.property_inspection_id
                    OR n.property_unit_id IS DISTINCT FROM e.property_unit_id;
  IF (e.property_inspection_id IS NULL) <> (n.property_inspection_id IS NULL) THEN
    RAISE EXCEPTION '点検の紐付けを外す・新たに付けることはできません（取り下げて申請し直してください）' USING ERRCODE = '22023';
  END IF;
  IF e.property_inspection_id IS NULL AND n.property_unit_id IS NOT NULL THEN
    RAISE EXCEPTION '台の指定は点検に結び付けた申請だけです' USING ERRCODE = '22023';
  END IF;
  IF v_type_changed OR n.template_no IS DISTINCT FROM e.template_no THEN
    SELECT t.template_no INTO v_template FROM biz.inspection_types t WHERE t.label = n.inspection_type LIMIT 1;
    IF NOT FOUND OR COALESCE(n.inspection_type, '') = '' THEN
      RAISE EXCEPTION '点検種別が点検種別マスターにありません' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(v_template, '') = '' OR n.template_no IS DISTINCT FROM v_template THEN
      RAISE EXCEPTION 'テンプレートNoが点検種別と一致しません' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF v_type_changed AND NOT v_admin THEN
    IF v_vendor IS NULL OR NOT EXISTS (
         SELECT 1
           FROM biz.property_inspections pi
           JOIN biz.properties b ON b.id = pi.property_id
           JOIN signage.signage_master_properties s ON s.id = b.signage_property_id
           JOIN biz.inspection_types t ON t.id = pi.inspection_type_id
          WHERE s.property_code = e.property_code
            AND t.label = n.inspection_type
            AND (pi.maintainer_id = v_vendor
                 OR EXISTS (SELECT 1 FROM biz.property_unit_inspections ui
                              JOIN biz.property_units pu ON pu.id = ui.unit_id
                             WHERE pu.property_id = pi.property_id
                               AND ui.inspection_type_id = pi.inspection_type_id
                               AND ui.maintainer_id = v_vendor))) THEN
      RAISE EXCEPTION '自社がこの物件で担当していない点検種別には変えられません' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF n.property_inspection_id IS NOT NULL AND (v_type_changed OR v_link_changed) THEN
    SELECT t.label INTO v_label
      FROM biz.property_inspections pi
      JOIN biz.inspection_types t ON t.id = pi.inspection_type_id
      JOIN biz.properties b ON b.id = pi.property_id
      JOIN signage.signage_master_properties s ON s.id = b.signage_property_id
     WHERE pi.id = n.property_inspection_id AND s.property_code = e.property_code;
    IF NOT FOUND THEN
      RAISE EXCEPTION '紐付ける点検がこの物件のものではありません' USING ERRCODE = '22023';
    END IF;
    IF v_label IS DISTINCT FROM n.inspection_type THEN
      RAISE EXCEPTION '点検種別が紐付けた点検と一致しません（点検種別を変えるときは、その種別の点検に紐付けてください）'
        USING ERRCODE = '22023';
    END IF;
    IF NOT signage.inspection_in_scope(n.property_inspection_id) THEN
      RAISE EXCEPTION '担当外の点検には紐付けられません' USING ERRCODE = '42501';
    END IF;
    IF n.property_unit_id IS NOT NULL THEN
      SELECT * INTO u FROM signage.inspection_unit_vendor(n.property_inspection_id, n.property_unit_id);
      IF NOT u.is_unit THEN
        RAISE EXCEPTION '台がこの点検のものではありません' USING ERRCODE = '22023';
      END IF;
      IF NOT v_admin AND u.vendor_id IS DISTINCT FROM v_vendor THEN
        RAISE EXCEPTION '担当外の台には紐付けられません' USING ERRCODE = '42501';
      END IF;
    ELSIF NOT v_admin AND signage.inspection_unit_count(n.property_inspection_id) >= 2 THEN
      RAISE EXCEPTION '「%」は台ごとの点検です。台を決めて申請してください', n.inspection_type USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
         SELECT 1 FROM signage.signage_entries o
          WHERE o.id <> e.id
            AND o.property_inspection_id = n.property_inspection_id
            AND o.target_month IS NOT DISTINCT FROM e.target_month
            -- 台なしの申請は全部の台に効くので、どちらかが台なしなら重なる
            AND (o.property_unit_id IS NULL OR n.property_unit_id IS NULL OR o.property_unit_id = n.property_unit_id)
            AND (o.status IN ('draft', 'ready', 'exported') OR (o.status = 'pending' AND o.review_comment IS NOT NULL))) THEN
      RAISE EXCEPTION '「%」のこの月の点検には、もう申請があります', n.inspection_type USING ERRCODE = '22023';
    END IF;
  END IF;

  -- 申請済みの行の更新を止めるガードを、この1文の間だけ通す（承認の関数と同じ印）。貼紙・建物追加・台・点検種別のガードは印と関係なく働く
  PERFORM set_config('signage.portal_review', 'on', true);
  UPDATE signage.signage_entries
     SET inspection_start = n.inspection_start, inspection_end = n.inspection_end,
         remarks = n.remarks, memo = n.memo, announcement = n.announcement,
         terminal_id = n.terminal_id, emergency_contact = n.emergency_contact,
         poster_type = n.poster_type, poster_image = n.poster_image, poster_position = n.poster_position,
         extra_posters = n.extra_posters, display_duration = n.display_duration,
         display_start_date = n.display_start_date, display_start_time = n.display_start_time,
         display_end_date = n.display_end_date, display_end_time = n.display_end_time,
         inspection_type = n.inspection_type, template_no = n.template_no,
         property_inspection_id = n.property_inspection_id, property_unit_id = n.property_unit_id
   WHERE id = p_entry_id
  RETURNING * INTO e;
  PERFORM set_config('signage.portal_review', 'off', true);
  RETURN e;
END;
$function$;

CREATE OR REPLACE FUNCTION signage.portal_entry_for_edit(p_entry_id uuid)
 RETURNS signage.signage_entries
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'signage', 'pg_temp'
AS $function$
DECLARE
  e signage.signage_entries;
BEGIN
  SELECT * INTO e FROM signage.signage_entries WHERE id = p_entry_id;
  -- 無いときと他社のときは同じ文言にする（他社の申請の有無を漏らさない）
  IF NOT FOUND OR NOT signage.submitted_entry_editable(e.user_id, e.vendor_id) THEN
    RAISE EXCEPTION 'この申請を修正する権限がありません' USING ERRCODE = '42501';
  END IF;
  IF e.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION '修正できるのは承認前（点検予定申請中）の申請だけです' USING ERRCODE = '22023';
  END IF;
  RETURN e;
END;
$function$;

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
  -- 再提出は追加になったので、同じファイルを2回登録すると生きた行が2つ同じファイルを指す。画面は毎回新しい置き場所を使うので、
  -- ここで止まるのは作った呼び出しだけ
  IF EXISTS (SELECT 1 FROM signage.signage_inspection_reports r0
              WHERE r0.storage_path = p_storage_path AND r0.status <> 'deleted') THEN
    RAISE EXCEPTION 'このファイルは登録済みです' USING ERRCODE = '22023';
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

DROP FUNCTION IF EXISTS signage.submitted_entry_editable(uuid, uuid, text);
DROP FUNCTION IF EXISTS signage.inspection_report_writable(uuid);
DROP FUNCTION IF EXISTS signage.entry_vendor_for_management(uuid, uuid);

NOTIFY pgrst, 'reload schema';
