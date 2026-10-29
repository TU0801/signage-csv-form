-- 修正依頼1029 担当 detail: 申請の点検種別・テンプレートNo・点検の紐付けを、保守会社が担当外の種別に変えられないようにする
-- （1027(3) の残り・ユーザー決定④。画面の絞り込みは一括入力の詳細設定と承認待ちの編集）
-- 2026-10-29 作成。本番へは未適用（適用はユーザー承認後）。ローカル DB（signage-v2-verify）で確かめた（scripts/test-fix-1029-detail.sql）。
-- 適用方法: ファイル全体を1つのクエリとして流す（Management API なら1回の query に全文を入れる。psql なら psql -1 -f）。
--   BEGIN/COMMIT は付けない。先頭の lock_timeout で、ロックが取れないときは待ち続けずに失敗させる。何度流しても同じ結果になる。
--   既存のガード（guard_entry_approval_flow・guard_entry_portal_columns・guard_entry_unit など）は変えない。足すのは
--   新しいガード2つ（signage.guard_entry_type_scope と、二重の申請を止める signage.guard_entry_unit_duplicate。どちらも同名のトリガー）と、申請済みの申請の修正（portal_update_submitted_entry。
--   引数は同じで、点検種別・テンプレートNo・紐付けも直せるようにした。末尾）の置き換え。biz スキーマは変えない。
--   トリガーは名前の順に動くので、貼紙（guard_entry_posters）・建物追加（guard_entry_property_request）のガードの後、
--   台（guard_entry_unit）のガードの前に動く名前にした（今までのガードが先に断る書き込みは今までどおりの理由で断る）。
--   テンプレートNo は空（NULL・''）か、その点検種別のものだけ（空はテンプレートの貼紙が出ないだけなので止めない）。
--
-- 「担当」の決め方（signage.inspection_in_scope・portal_inspections と同じ）:
--   その物件（signage_master_properties.property_code → biz.properties.signage_property_id）の点検行 biz.property_inspections のうち、
--   点検行の保守会社（maintainer_id）が自社か、台ごとの保守（biz.property_unit_inspections の同じ物件・同じ点検種別の台）の
--   保守会社が自社のもの。その点検種別（biz.inspection_types.label）が「担当の点検種別」。
--
-- 止めるもの（管理者以外の JWT を持つ書き込み。管理者・JWT の無い経路〔service_role・管理 SQL〕は止めない）:
--   (1) 点検に紐付いた申請（property_inspection_id あり）は、点検種別とテンプレートNo がその点検のもの（点検種別の label・template_no）
--       でなければならない。INSERT と、紐付け・点検種別・テンプレートNo を変える UPDATE で確かめる。
--       → REST で点検の紐付けだけ・種別だけを付け替えて、担当の点検の申請に別の種別を載せることを止める。
--   (2) 点検種別を変える UPDATE は、変えた先が自社のその物件の担当の点検種別に限る。
--       → 手入力の行の申請（紐付け無し）も、出した後に担当外の種別へは変えられない。
--   (3) INSERT と、点検種別かテンプレートNo を変える UPDATE は、テンプレートNo が空か、その点検種別のものに限る
--       （テンプレートNo だけを別の種別のものに書き換えるのを止める。空だった旧来の申請にその種別のテンプレートNo を入れるのは通す）。
--       INSERT にも掛ける（紐付け無しの INSERT で種別とテンプレートNo の食い違いを入れられないように。本番の申請 24件は
--       2026-10-29 の読み取りでテンプレートNo が空か種別と一致しており、画面はテンプレートNo を種別から入れるので今の登録は止まらない）。
--   限界: 紐付け無しの申請では (2) は境界にならない。保守会社は自社の申請を取り下げ（DELETE）て、担当外の種別で出し直せる
--       （紐付け無しの INSERT は種別を問わず通すため）。(2) は画面の絞り込みを REST で外すことを止めるだけで、担当外の種別での
--       申請そのものは止めない。止めるなら紐付け無しの INSERT の扱い（工事の案内）を決め直す必要がある。
--   止めないもの:
--   - 紐付けの無い INSERT（手入力の行・1件入力）。表の点検種別の欄は今も全部の点検種別から選べ、工事・作業の案内（担当の点検行を
--     持たない種別）を保守会社が出しているため（本番にも担当外の種別の申請がある）。今回の決定④は詳細設定での「変更」の範囲。
--   - 点検種別・テンプレートNo・紐付けを変えない UPDATE（既存の申請を壊さない。担当外の種別の既存の申請もそのまま直せる）。
--   - 業務システムで点検行を消したときの FK（ON DELETE SET NULL）: 紐付けが NULL になるだけなので (1)(2) のどちらにも当たらない。
--   - 承認の印（signage.portal_review）は見ない: portal_review_entry は点検種別・テンプレートNo・紐付けを変えない。
--     portal_update_submitted_entry は下の版から点検種別・テンプレートNo・紐付けも直せるが、印があってもこのガードは掛かる
--     （関数の中の確かめと同じ規則なので、関数が通したものはこのガードも通る）。
--
-- 本番の今の申請（2026-10-29 読み取り）: 点検に紐付いた申請 4件はすべて種別・テンプレートNo が点検と一致（(1) に当たる既存の行は無い）。

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

REVOKE ALL ON FUNCTION signage.guard_entry_type_scope() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_entry_type_scope ON signage.signage_entries;
CREATE TRIGGER guard_entry_type_scope BEFORE INSERT OR UPDATE ON signage.signage_entries
  FOR EACH ROW EXECUTE FUNCTION signage.guard_entry_type_scope();

-- ============================================================
-- 同じ点検・同じ対象月・同じ台への二重の申請を止める（修正依頼1029 決定④の検証の指摘）。
-- 一括入力で修正中の行を別の種別の点検へ付け替え、付け替え先の予定の行からも新しく申請すると、同じ点検・月の申請が2件できていた
-- （portal_update_submitted_entry の中の確かめは修正の側しか見ず、INSERT には確かめが無かった。signage_entries_inspection_month_idx は一意ではない）。
-- 止めるもの: JWT を持つ書き込み（管理者も。二重の申請は権限ではなく整合の問題なので）で、点検に紐付き対象月を持つ申請中の行
--   （承認待ち draft・承認済み ready・取込済み exported・差戻し中〔pending で差戻しの理由あり〕）を INSERT するときと、
--   紐付け・対象月・台を変える UPDATE。ほかに同じ点検・同じ対象月で台が重なる申請中の行があれば断る。
--   台なしの申請は全部の台に効く（units.ts）ので、どちらかが台なしなら重なるものとして扱う（一意の索引では書けないのでトリガーにした）。
-- 止めないもの: JWT の無い経路（service_role・管理 SQL）、状態だけの更新（承認・差戻し・再申請。点検・月・台は変わらない）、
--   未申請（pending で差戻しの理由なし）の行、紐付けの無い申請・対象月の無い申請、業務システムで点検行を消したときの FK（SET NULL）。
-- 同時に2件を出したときに両方が通らないよう、点検 × 対象月の勧告ロックを取ってから確かめる（トランザクションの終わりまで）。
-- 名前は台のガード（guard_entry_unit）の後に動くようにした（ほかのガードが先に断る書き込みは今までどおりの理由で断る）。
-- 本番の今の申請（2026-10-29 読み取り）: この規則に当たる組は 0件。
CREATE OR REPLACE FUNCTION signage.guard_entry_unit_duplicate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NEW.property_inspection_id IS NULL OR NEW.target_month IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT (NEW.status IN ('draft', 'ready', 'exported') OR (NEW.status = 'pending' AND NEW.review_comment IS NOT NULL)) THEN
    RETURN NEW;
  END IF;
  -- UPDATE は紐付け・対象月・台を変えたときだけ（INSERT では OLD を見ない。plpgsql の OR は短絡が保証されないので IF を分ける）
  IF TG_OP = 'UPDATE' THEN
    IF NEW.property_inspection_id IS NOT DISTINCT FROM OLD.property_inspection_id
       AND NEW.target_month IS NOT DISTINCT FROM OLD.target_month
       AND NEW.property_unit_id IS NOT DISTINCT FROM OLD.property_unit_id THEN
      RETURN NEW;
    END IF;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('signage_entries:' || NEW.property_inspection_id::text || ':' || NEW.target_month::text, 0));
  IF EXISTS (
       SELECT 1 FROM signage.signage_entries o
        WHERE o.id <> NEW.id
          AND o.property_inspection_id = NEW.property_inspection_id
          AND o.target_month = NEW.target_month
          AND (o.property_unit_id IS NULL OR NEW.property_unit_id IS NULL OR o.property_unit_id = NEW.property_unit_id)
          AND (o.status IN ('draft', 'ready', 'exported') OR (o.status = 'pending' AND o.review_comment IS NOT NULL))) THEN
    RAISE EXCEPTION '「%」のこの月の点検には、もう申請があります（同じ点検・同じ月・同じ台の申請は1件だけです）', NEW.inspection_type
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION signage.guard_entry_unit_duplicate() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_entry_unit_duplicate ON signage.signage_entries;
CREATE TRIGGER guard_entry_unit_duplicate BEFORE INSERT OR UPDATE ON signage.signage_entries
  FOR EACH ROW EXECUTE FUNCTION signage.guard_entry_unit_duplicate();

-- ============================================================
-- 申請済み（承認前）の申請の修正で、点検種別・テンプレートNo・点検の紐付け（点検行・台）も直せるようにする
-- （ユーザー決定④: 保守会社の一括入力の詳細設定で、修正中の行の点検種別を変える）。
-- 引数は今のまま（p_entry_id uuid, p_patch jsonb）。p_patch に足せるキー: inspection_type・template_no・property_inspection_id・
-- property_unit_id。ほかは fix-1026-units.sql の定義と同じ（直せる列・状態〔draft のままで承認待ち〕・権限・日付と端末の確かめ・
-- 承認の印を1文だけ立てる・監査は audit_trigger・updated_at はトリガーが進めるので、承認側の版の照合〔portal_approve_entry_checked〕は
-- 修正後の承認を断る）。物件・対象月（target_month）・保守会社・状態は今までどおり直せない＝付け替えても同じ物件・同じ対象月。
-- 承認の印で guard_entry_portal_columns（担当の点検か・点検と物件が一致するか）を通らないので、紐付けを変えるときはここで確かめる。
-- guard_entry_type_scope（上）と guard_entry_unit は印と関係なく動くので、その確かめも重ねて掛かる（同じ規則。ここで先に断るのは
-- 文言を分かりやすくするため）。管理者は submitted_entry_editable で通り、担当の判定（自社の担当の種別・台の保守会社）は掛けない
-- （inspection_in_scope は管理者なら点検行があれば真）。
--   点検種別を変える: その種別が点検種別マスター（biz.inspection_types）にあり、管理者以外はその物件で自社が担当する種別
--     （guard_entry_type_scope (2) と同じ判定）。テンプレートNo はその種別のもの（空は不可）。
--   紐付けを変える・種別や台を変える（点検に紐付いた申請）: 紐付ける点検は同じ物件・その種別・担当（inspection_in_scope）。
--     台は、指定するならその点検の台で管理者以外は自社が保守する台、指定しないならその点検の台が2台未満（guard_entry_unit と同じ）。
--     同じ点検・同じ対象月で台が重なる（同じ台か、どちらかが台なし＝全部の台）ほかの申請（承認待ち・承認済み・取込済み・差戻し中）があれば
--     断る（二重の申請にしない。INSERT 側は guard_entry_unit_duplicate が同じ規則で止める）。
--   紐付けを外す・紐付けの無い申請に紐付けを付けることはできない（紐付けの無い申請は対象月を持たないため）。
-- 戻し: fix-1026-units.sql の portal_update_submitted_entry の定義を流し直す（同じ引数なので置き換わる）。
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
REVOKE ALL ON FUNCTION signage.portal_update_submitted_entry(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION signage.portal_update_submitted_entry(uuid, jsonb) TO authenticated, service_role;
