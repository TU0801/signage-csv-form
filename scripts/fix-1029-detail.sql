-- 修正依頼1029 担当 detail: 申請の点検種別・テンプレートNo・点検の紐付けを、保守会社が担当外の種別に変えられないようにする
-- （1027(3) の残り・ユーザー決定④。画面の絞り込みは一括入力の詳細設定と承認待ちの編集）
-- 2026-10-29 作成。本番へは未適用（適用はユーザー承認後）。ローカル DB（signage-v2-verify）で確かめた（scripts/test-fix-1029-detail.sql）。
-- 適用方法: ファイル全体を1つのクエリとして流す（Management API なら1回の query に全文を入れる。psql なら psql -1 -f）。
--   BEGIN/COMMIT は付けない。先頭の lock_timeout で、ロックが取れないときは待ち続けずに失敗させる。何度流しても同じ結果になる。
--   既存の関数・ガード（guard_entry_approval_flow・guard_entry_portal_columns・guard_entry_unit など）は変えない。足すのは
--   新しいガード1つ（signage.guard_entry_type_scope と同名のトリガー）だけ。biz スキーマは変えない。
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
--   (3) 点検種別かテンプレートNo を変える UPDATE は、テンプレートNo が空か、その点検種別のものに限る
--       （テンプレートNo だけを別の種別のものに書き換えるのを止める。空だった旧来の申請にその種別のテンプレートNo を入れるのは通す）。
--   止めないもの:
--   - 紐付けの無い INSERT（手入力の行・1件入力）。表の点検種別の欄は今も全部の点検種別から選べ、工事・作業の案内（担当の点検行を
--     持たない種別）を保守会社が出しているため（本番にも担当外の種別の申請がある）。今回の決定④は詳細設定での「変更」の範囲。
--   - 点検種別・テンプレートNo・紐付けを変えない UPDATE（既存の申請を壊さない。担当外の種別の既存の申請もそのまま直せる）。
--   - 業務システムで点検行を消したときの FK（ON DELETE SET NULL）: 紐付けが NULL になるだけなので (1)(2) のどちらにも当たらない。
--   - 承認の印（signage.portal_review）は見ない: その印で通る関数（portal_review_entry・portal_update_submitted_entry）は
--     点検種別・テンプレートNo・紐付けを変えないので、このガードには当たらない（変えようとすれば印があっても止める）。
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

  -- (3) 点検種別かテンプレートNo を変えるときは、テンプレートNo が空か、その点検種別のもの
  IF v_type_changed OR v_template_changed THEN
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
