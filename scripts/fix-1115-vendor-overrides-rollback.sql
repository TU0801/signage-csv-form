-- fix-1115-vendor-overrides.sql の戻し（修正依頼1115 (5)）
-- 2関数（guard_entry_type_scope・portal_update_submitted_entry）を fix-1115-mgmt-entry.sql の版（印 [1115(2)]）に戻し、
-- 足した関数・表を消す。表を消すと管理会社の上書きは失われる（申請済みの行の TPL・連絡先はそのまま残る）。
-- 流し方: ファイル全体を1つのクエリとして流す（psql なら psql -1 -f）。mgmt-entry まで戻すときは、これを先に流してから
-- fix-1115-mgmt-entry-rollback.sql を流す。画面も前の版に戻す（戻さないと保守会社タブ・申請画面が新しい RPC を探して失敗する。
-- 申請画面は上書きを読めなければ既定のまま入力できる）。

SET lock_timeout = '5s';

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
  -- [1115(2)] 変えた箇所: 管理会社は「自社が管理する物件にその点検種別の点検があること」（保守会社は問わない）。
  -- 保守会社の確かめ（ELSIF 以降）は本番の現行定義のまま。要件5（TPL の上書き）もこの関数を変えるので、土台はこの版にする
  IF v_type_changed AND coalesce(signage.current_role_kind() = 'management', false) THEN
    IF NOT coalesce(signage.is_active_management(), false) OR NOT EXISTS (
         SELECT 1
           FROM biz.property_inspections pi
           JOIN biz.properties b ON b.id = pi.property_id
           JOIN signage.signage_master_properties s ON s.id = b.signage_property_id
           JOIN biz.inspection_types t ON t.id = pi.inspection_type_id
          WHERE s.property_code = NEW.property_code
            AND t.label = NEW.inspection_type
            AND b.management_company_id = signage.current_management_company_id()) THEN
      RAISE EXCEPTION '自社が管理する物件のこの点検種別の点検がありません' USING ERRCODE = '42501';
    END IF;
  ELSIF v_type_changed THEN
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


REVOKE ALL ON FUNCTION signage.guard_entry_type_scope() FROM PUBLIC, anon;

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
  -- [1115(2)] 管理会社の分岐で使う
  v_mgmt boolean;
  mv record;
BEGIN
  IF p_patch IS NULL OR jsonb_typeof(p_patch) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION '直す内容がありません' USING ERRCODE = '22023';
  END IF;
  SELECT k INTO v_bad FROM jsonb_object_keys(p_patch) k WHERE NOT (k = ANY (v_allowed)) LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'この項目は修正できません: %', v_bad USING ERRCODE = '22023';
  END IF;
  SELECT * INTO e FROM signage.signage_entries WHERE id = p_entry_id FOR UPDATE;
  -- [1115(2)] 変えた箇所: 物件コードも渡す版（管理会社は自社物件の自分の申請だけ）
  IF NOT FOUND OR NOT coalesce(signage.submitted_entry_editable(e.user_id, e.vendor_id, e.property_code), false) THEN
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
  v_mgmt := NOT v_admin AND coalesce(signage.current_role_kind() = 'management', false);  -- [1115(2)]
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
  -- [1115(2)] 変えた箇所: 管理会社は「自社が管理する物件にその点検種別の点検があること」（保守会社は問わない）。
  -- 保守会社の確かめ（ELSIF 以降）は本番の現行定義のまま。要件5（TPL の上書き）もこの関数を変えるので、土台はこの版にする
  IF v_type_changed AND v_mgmt THEN
    IF NOT EXISTS (
         SELECT 1
           FROM biz.property_inspections pi
           JOIN biz.properties b ON b.id = pi.property_id
           JOIN signage.signage_master_properties s ON s.id = b.signage_property_id
           JOIN biz.inspection_types t ON t.id = pi.inspection_type_id
          WHERE s.property_code = e.property_code
            AND t.label = n.inspection_type
            AND b.management_company_id = signage.current_management_company_id()) THEN
      RAISE EXCEPTION '自社が管理する物件のこの点検種別の点検がありません' USING ERRCODE = '42501';
    END IF;
  ELSIF v_type_changed AND NOT v_admin THEN
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
      -- [1115(2)] 管理会社は台の保守会社を問わない（受注先は下で台の保守会社にする）
      IF NOT v_admin AND NOT v_mgmt AND u.vendor_id IS DISTINCT FROM v_vendor THEN
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

  -- [1115(2)] 管理会社の申請は、受注先（vendor_id・vendor_name）を点検行（台があれば台）の保守会社から決め直す。
  -- この UPDATE は印（signage.portal_review）で guard_entry_portal_columns を通らないので、ここで決める。
  -- 緊急連絡先は空のときだけ既定を入れる。保守会社・管理者の申請では vendor_id・vendor_name は元の値のまま（n は e から作る）
  IF v_mgmt THEN
    IF n.property_inspection_id IS NULL THEN
      RAISE EXCEPTION '管理会社のアカウントでは、点検の行から申請してください（点検に結び付かない申請は作れません）' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO mv FROM signage.entry_vendor_for_management(n.property_inspection_id, n.property_unit_id);
    n.vendor_id := mv.vendor_id;
    n.vendor_name := mv.vendor_name;
    IF coalesce(btrim(n.emergency_contact), '') = '' THEN
      n.emergency_contact := mv.emergency_contact;
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
         property_inspection_id = n.property_inspection_id, property_unit_id = n.property_unit_id,
         vendor_id = n.vendor_id, vendor_name = n.vendor_name  -- [1115(2)] 管理会社の申請で決め直した受注先
   WHERE id = p_entry_id
  RETURNING * INTO e;
  PERFORM set_config('signage.portal_review', 'off', true);
  RETURN e;
END;
$function$;

REVOKE ALL ON FUNCTION signage.portal_update_submitted_entry(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION signage.portal_update_submitted_entry(uuid, jsonb) TO authenticated, service_role;

DROP FUNCTION IF EXISTS signage.entry_vendor_defaults(text);
DROP FUNCTION IF EXISTS signage.mgmt_vendor_defaults();
DROP FUNCTION IF EXISTS signage.vendor_override_template_allowed(text, uuid, text, text);
DROP TABLE IF EXISTS signage.signage_mgmt_vendor_overrides;
DROP FUNCTION IF EXISTS signage.guard_mgmt_vendor_override();

NOTIFY pgrst, 'reload schema';
