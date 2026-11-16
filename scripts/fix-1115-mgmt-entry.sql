-- 修正依頼1115 (2) の DB 部分: 管理会社が点検の予定を入力（申請）し、点検報告書を登録できるようにする
-- 2026-11-16 作成。本番へは未適用（適用はユーザー承認後）。ローカル DB（signage-v2-verify）で確かめた（scripts/test-fix-1115-mgmt-entry.sql）。
--
-- 目的（ユーザー決定 2026-11-16 の (2)）:
--   管理会社の点検登録フォームを保守会社と同じ形（1件入力・一括入力・報告書確認）にする。開くのは「予定の入力」と「報告書のアップロード」だけで、
--   完了連絡・建物追加申請・申請の取り下げ（行の削除）は管理会社には開かない（DB も今までどおり断る）。
--   - 申請の受注先（vendor_id と CSV 4列目の vendor_name）は、行ごとに点検行（台があれば台）の保守会社から DB が決める。
--     画面の指定が食い違えば断る。保守会社が未登録の点検は「この点検は保守会社が未登録です。業務システムで保守会社を登録してください」で断る。
--     点検に結び付かない申請（手入力の行で点検が当たらないもの）も受注先を決められないので断る。
--   - 緊急連絡先（emergency_contact）は上書きしない。空のときだけ保守会社の既定を入れる（要件5の管理会社ごとの連絡先とぶつけない）。
--   - 物件コードは自社が管理する物件（property_reviewable）だけ。点検は inspection_in_scope（管理会社は自社物件の点検）。
--   - 申請済み（draft）の修正は「自社物件の申請で申請者が自分」のときだけ（保守会社が出した申請は直させない）。
--   - 報告書: inspection_writable（完了連絡の portal_mark_completed・portal_mark_completed_any_month・portal_unmark_completed と共有）は
--     変えず、portal_register_report と Storage の inspection-reports の INSERT に管理会社用の条件を別に足す。
--     管理会社が上げた版は、上げた管理会社（自社）の管理会社アカウントが、保守会社と同じ条件（削除は受領前の提出のうち・受領済みは変更不可・
--     復元は管理者だけ）で修正・削除できる。保守会社が触れる版は保守会社のアカウント（role=user）が上げた自社の版だけ（1115 の残り）。
--     報告書に結び付ける申請（entry_id）は、その点検・物件の申請だけ（1115 の残り。点検の一致は前からあり、物件の一致を足した）。
--   - bulk_template_info（一括入力テンプレート）に管理会社の分岐（自社物件の点検。保守会社を渡せばその会社の分）。
--   - 詳細設定の貼紙画像: 管理会社も自分の uid のフォルダへアップロードできる（poster-images の INSERT）。
--   承認は今までどおり（portal_review_entry・portal_approve_entry_checked。管理会社が入れた申請も管理会社が承認する）。変えていない。
--
-- 変えるもの（関数ごとの変えた箇所は本文に「[1115(2)]」の印で書いた。それ以外の行は本番の現行定義のまま）:
--   新設  signage.entry_vendor_for_management(uuid, uuid)        受注先を決める（内部用。利用者は実行できない）
--   新設  signage.submitted_entry_editable(uuid, uuid, text)      2引数の版＋管理会社の条件（2引数の版は変えずに残す）。
--         同じ保守会社のアカウントが直せるのは、申請者が管理会社でない申請だけ（レビュー指摘）
--   新設  signage.entry_author_is_management(uuid)               申請者が管理会社のアカウントか（内部用。利用者は実行できない）
--   新設  signage.mgmt_poster_object_deletable(text)             管理会社が自分の uid の貼紙画像を消せるか（Storage のポリシー用）
--   新設  signage.inspection_report_writable(uuid)                inspection_writable＋管理会社の条件
--   置換  signage.guard_entry_portal_columns()   管理会社の一律拒否 → 管理会社の分岐（物件・点検・受注先・緊急連絡先）
--   置換  signage.guard_entry_unit()             台の保守会社 = 自社 の確かめを、管理会社は自社物件の点検なら通す
--   置換  signage.guard_entry_type_scope()       点検種別の変更 (2) に管理会社の分岐（※要件5もこの関数を変える。要件5の SQL はこの版を土台にする）
--   置換  signage.portal_update_submitted_entry(uuid, jsonb)  3引数の editable・種別/台の管理会社の分岐・受注先の決め直し（※要件5もこの関数を変える）
--   置換  signage.portal_entry_for_edit(uuid)    3引数の editable を使う
--   新設  signage.inspection_report_modifiable(signage_inspection_reports)  報告書の版を修正・削除できる人か（portal_update_report と
--         画面の計算列 can_modify が使う。1115 の残り）
--   置換  signage.portal_register_report(...)    inspection_report_writable で判定・申請（entry_id）は点検と物件の両方が一致するものだけ
--   置換  signage.portal_update_report(...)      「誰が」を inspection_report_modifiable に（管理会社は自社の管理会社が上げた版、
--                                                保守会社は保守会社のアカウントが上げた自社の版）
--   置換  signage.bulk_template_info(uuid)       管理会社の分岐（略称は自社物件の点検に出てくる保守会社のときだけ）
--   置換  signage.portal_entries()               列 by_management を足す（戻り値の形が変わるので DROP → CREATE。保守会社の画面で管理会社の申請に
--                                                「修正」を出さないため）
--   ポリシー追加 signage_entries: mgmt_insert_entries・mgmt_update_own_pending_entries
--               storage.objects: inspection_reports_mgmt_insert・"poster-images mgmt own insert"・"poster-images mgmt own select"・
--                                "poster-images mgmt own delete"
--   変えないもの: guard_entry_property_request（管理会社の建物追加の申請は guard_entry_portal_columns が先に断る）、
--     guard_entry_management_delete（取り下げは閉じたまま）、inspection_writable、完了連絡の3関数、management_companies_scoped
--     （管理会社には管理会社フィルターを出さないので変えない）、portal_review_*、is_active_member、既存のポリシー。
--
-- 土台: 置換した関数は、本番の現行定義（2026-11-16 に Management API の SELECT で pg_get_functiondef を読んだもの）。
--   ローカル DB の定義の md5 が本番と一致することを確かめてから当てた。
--
-- 適用方法: ファイル全体を1つのクエリとして流す（Management API なら1回の query に全文を入れる。psql なら psql -1 -f）。
--   BEGIN/COMMIT は付けない。何度流しても同じ結果になる（CREATE OR REPLACE・DROP POLICY IF EXISTS → CREATE POLICY）。
-- 適用順: fix-1115-templates.sql の後、要件5の SQL より前。加算的な変更なので「DDL → デプロイ」。今の画面は管理会社に点検一覧しか
--   出さないので、先に当てても誤動作しない。適用後に has_function_privilege（entry_vendor_for_management・3引数の
--   submitted_entry_editable・entry_author_is_management は authenticated が false、inspection_report_writable・
--   mgmt_poster_object_deletable・inspection_report_modifiable は true）を確かめる。portal_entries は列が増えるだけなので、今の画面のまま当てても動く。
--
-- 戻し手順: scripts/fix-1115-mgmt-entry-rollback.sql を流す（置換した9関数の本番の現行定義をそのまま収め、足した関数・ポリシーを消す）。
--   要件5の SQL を当てた後に戻すときは、先に要件5の戻しを流す（同じ関数を変えるため）。
--   戻すと管理会社の申請・報告書の登録は DB で断られるので、画面も前の版に戻す。管理会社が入れた申請・報告書の行は消えない。

SET lock_timeout = '5s';

-- ============================================================
-- 1. 新しい関数（内部用・判定用）
-- ============================================================

-- [1115(2)] 新設: 管理会社の申請の受注先。点検行（台を指定すればその台）の保守会社と、
-- サイネージの保守会社マスター（biz.maintainers からトリガーで写したもの）の名前・緊急連絡先を返す。
-- 保守会社が未登録なら断る（修正依頼1115 決定(2)）。トリガーと portal_update_submitted_entry からだけ呼ぶ（利用者には実行させない）
CREATE OR REPLACE FUNCTION signage.entry_vendor_for_management(p_inspection_id uuid, p_unit_id uuid,
  OUT vendor_id uuid, OUT vendor_name text, OUT emergency_contact text)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE
  u record;
  v_vendor uuid;
BEGIN
  IF p_unit_id IS NOT NULL THEN
    SELECT * INTO u FROM signage.inspection_unit_vendor(p_inspection_id, p_unit_id);
    IF NOT u.is_unit THEN
      RAISE EXCEPTION '台がこの点検のものではありません' USING ERRCODE = '22023';
    END IF;
    v_vendor := u.vendor_id;                       -- 台の保守会社（未設定なら点検行の保守会社）
  ELSE
    -- 台なしの申請は点検行の保守会社（台が1台以下の点検は画面も台ごとの行にせず、点検行の保守会社を出すのと同じ）
    SELECT pi.maintainer_id INTO v_vendor FROM biz.property_inspections pi WHERE pi.id = p_inspection_id;
  END IF;
  IF v_vendor IS NULL THEN
    RAISE EXCEPTION 'この点検は保守会社が未登録です。業務システムで保守会社を登録してください' USING ERRCODE = '22023';
  END IF;
  SELECT mv.id, mv.vendor_name, mv.emergency_contact INTO vendor_id, vendor_name, emergency_contact
    FROM signage.signage_master_vendors mv WHERE mv.id = v_vendor;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'この点検の保守会社がサイネージの保守会社マスターにありません（管理者にお問い合わせください）' USING ERRCODE = '22023';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION signage.entry_vendor_for_management(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION signage.entry_vendor_for_management(uuid, uuid) TO service_role;

-- [1115(2) レビュー] 新設: 申請者が管理会社のアカウントか（submitted_entry_editable の3引数の版と portal_entries が使う。内部用）
CREATE OR REPLACE FUNCTION signage.entry_author_is_management(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'signage', 'pg_temp'
AS $function$
  select coalesce((select p.role = 'management' from signage.signage_profiles p where p.id = p_user_id), false);
$function$;

REVOKE ALL ON FUNCTION signage.entry_author_is_management(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION signage.entry_author_is_management(uuid) TO service_role;

-- [1115(2)] 新設: 申請済み（draft）の申請を修正できるか。2引数の版（本番の現行定義のまま残す）に
-- 「管理会社: 自社が管理する物件の申請で、申請者が自分」を足した版。portal_entry_for_edit と portal_update_submitted_entry が使う
CREATE OR REPLACE FUNCTION signage.submitted_entry_editable(p_user_id uuid, p_vendor_id uuid, p_property_code text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'signage', 'pg_temp'
AS $function$
  -- [1115(2) レビュー] 管理会社が入れた申請も vendor_id に点検行（台）の保守会社が入るので、2引数の版の「同じ保守会社のアカウント」の
  -- 条件だけでは、受注先の保守会社が管理会社の申請を読めて書き換えられてしまう。同じ保守会社の条件は、申請者が管理会社のアカウント
  -- でない申請に限る（申請者本人・管理者・同じ保守会社の同僚の申請は今までどおり。管理者の代理申請も今までどおり）
  select coalesce(signage.is_active_admin(), false)
      or coalesce(signage.submitted_entry_editable(p_user_id, p_vendor_id)
                  and (p_user_id = auth.uid() or not signage.entry_author_is_management(p_user_id)), false)
      or coalesce(signage.is_active_management() and p_user_id = auth.uid()
                  and signage.property_reviewable(p_property_code), false);
$function$;

REVOKE ALL ON FUNCTION signage.submitted_entry_editable(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION signage.submitted_entry_editable(uuid, uuid, text) TO service_role;

-- [1115(2)] 新設: 報告書を登録できるか。inspection_writable（完了連絡の3関数と共有。管理会社は偽のまま）に
-- 「有効な管理会社で、自社が管理する物件の点検」を足した版。portal_register_report と Storage の管理会社用 INSERT ポリシーが使う
CREATE OR REPLACE FUNCTION signage.inspection_report_writable(p_inspection_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'signage', 'pg_temp'
AS $function$
  select coalesce(signage.inspection_writable(p_inspection_id), false)
      or coalesce(signage.is_active_management() and signage.inspection_in_scope(p_inspection_id), false);
$function$;

REVOKE ALL ON FUNCTION signage.inspection_report_writable(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION signage.inspection_report_writable(uuid) TO authenticated, service_role;

-- ============================================================
-- 2. signage.guard_entry_portal_columns()（トリガー）
-- ============================================================
CREATE OR REPLACE FUNCTION signage.guard_entry_portal_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'signage', 'pg_temp'
AS $function$
-- [1115(2)] 変えた箇所: DECLARE（v_mgmt・v）、管理会社の一律拒否を「管理会社の分岐」に置き換え、自社の保守会社の確かめを保守会社だけに
DECLARE
  v_mgmt boolean;
  v record;
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

  -- [1115(2)] ここから: 管理会社の分岐（予定の入力だけ開く。建物追加申請・取り下げは開かない）
  v_mgmt := coalesce(signage.current_role_kind() = 'management', false);
  IF v_mgmt THEN
    -- 管理会社の未設定のアカウントは今までどおり断る
    IF NOT coalesce(signage.is_active_management(), false) THEN
      RAISE EXCEPTION '管理会社のアカウントでは申請を作成・変更できません' USING ERRCODE = '42501';
    END IF;
    IF NEW.property_request_id IS NOT NULL THEN
      RAISE EXCEPTION '管理会社のアカウントでは建物追加の申請はできません' USING ERRCODE = '42501';
    END IF;
    -- 物件コードは自社が管理する物件だけ（点検に結び付かない行で他社の物件を名乗らせない）
    IF NOT coalesce(signage.property_reviewable(NEW.property_code), false) THEN
      RAISE EXCEPTION '自社が管理する物件にだけ申請できます' USING ERRCODE = '42501';
    END IF;
    -- 受注先（保守会社）は点検行から決めるので、点検に結び付かない申請は作らせない（修正依頼1115 決定(2)）
    IF NEW.property_inspection_id IS NULL THEN
      RAISE EXCEPTION '管理会社のアカウントでは、点検の行から申請してください（点検に結び付かない申請は作れません）' USING ERRCODE = '22023';
    END IF;
    IF NOT coalesce(signage.inspection_in_scope(NEW.property_inspection_id), false) THEN
      RAISE EXCEPTION '担当外の点検には申請できません' USING ERRCODE = '42501';
    END IF;
    -- 受注先（vendor_id と CSV 4列目の vendor_name）は点検行（台があれば台）の保守会社から DB が決める。
    -- 画面が指定した値が食い違えば断る（指定が無ければ埋める）。保守会社が未登録なら断る。
    -- INSERT と UPDATE の毎回（vendor_name だけを書き換える更新でも決め直す）
    SELECT * INTO v FROM signage.entry_vendor_for_management(NEW.property_inspection_id, NEW.property_unit_id);
    IF NEW.vendor_id IS NOT NULL AND NEW.vendor_id IS DISTINCT FROM v.vendor_id
       AND (TG_OP = 'INSERT' OR NEW.vendor_id IS DISTINCT FROM OLD.vendor_id) THEN
      RAISE EXCEPTION '受注先の保守会社が点検の保守会社と一致しません' USING ERRCODE = '42501';
    END IF;
    IF coalesce(btrim(NEW.vendor_name), '') <> '' AND NEW.vendor_name IS DISTINCT FROM v.vendor_name
       AND (TG_OP = 'INSERT' OR NEW.vendor_name IS DISTINCT FROM OLD.vendor_name) THEN
      RAISE EXCEPTION '受注先名が点検の保守会社と一致しません' USING ERRCODE = '42501';
    END IF;
    NEW.vendor_id := v.vendor_id;
    NEW.vendor_name := v.vendor_name;
    -- 緊急連絡先は上書きしない。空のときだけ保守会社の既定を入れる
    IF coalesce(btrim(NEW.emergency_contact), '') = '' THEN
      NEW.emergency_contact := v.emergency_contact;
    END IF;
  -- [1115(2)] ここまで。以下の ELSE の中は本番の現行定義のまま
  ELSIF NEW.property_inspection_id IS NOT NULL
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
  -- [1115(2)] 管理会社は上で決めたので、自社の保守会社の確かめは保守会社のアカウントだけ（NOT v_mgmt を足した）
  IF NOT v_mgmt AND NEW.vendor_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.vendor_id IS DISTINCT FROM OLD.vendor_id)
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

-- トリガー関数は利用者が直接呼ぶものではない（発火に EXECUTE 権限は要らない）
REVOKE ALL ON FUNCTION signage.guard_entry_portal_columns() FROM PUBLIC, anon;

-- ============================================================
-- 3. signage.guard_entry_unit()（トリガー）
-- ============================================================
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
  -- [1115(2)] 変えた箇所: 管理会社は自社物件の点検の台なら通す（受注先は guard_entry_portal_columns が台の保守会社にする）。
  -- 保守会社の確かめ（台の保守会社 = 自社）は本番の現行定義のまま
  IF auth.uid() IS NOT NULL AND NOT signage.is_active_admin() THEN
    IF coalesce(signage.current_role_kind() = 'management', false) THEN
      IF NOT coalesce(signage.is_active_management() AND signage.inspection_in_scope(NEW.property_inspection_id), false) THEN
        RAISE EXCEPTION '担当外の台には申請できません' USING ERRCODE = '42501';
      END IF;
    ELSIF v.vendor_id IS DISTINCT FROM signage.current_vendor_id() THEN
      RAISE EXCEPTION '担当外の台には申請できません' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- トリガー関数は利用者が直接呼ぶものではない（発火に EXECUTE 権限は要らない）
REVOKE ALL ON FUNCTION signage.guard_entry_unit() FROM PUBLIC, anon;

-- ============================================================
-- 4. signage.guard_entry_type_scope()（トリガー）
-- ============================================================
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

-- トリガー関数は利用者が直接呼ぶものではない（発火に EXECUTE 権限は要らない）
REVOKE ALL ON FUNCTION signage.guard_entry_type_scope() FROM PUBLIC, anon;

-- ============================================================
-- 5. signage.portal_update_submitted_entry(uuid, jsonb)
-- ============================================================
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

-- ============================================================
-- 6. signage.portal_entry_for_edit(uuid)
-- ============================================================
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
  -- [1115(2)] 変えた箇所: 物件コードも渡す版（管理会社は自社物件の自分の申請だけ）
  IF NOT FOUND OR NOT coalesce(signage.submitted_entry_editable(e.user_id, e.vendor_id, e.property_code), false) THEN
    RAISE EXCEPTION 'この申請を修正する権限がありません' USING ERRCODE = '42501';
  END IF;
  IF e.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION '修正できるのは承認前（点検予定申請中）の申請だけです' USING ERRCODE = '22023';
  END IF;
  RETURN e;
END;
$function$;

REVOKE ALL ON FUNCTION signage.portal_entry_for_edit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION signage.portal_entry_for_edit(uuid) TO authenticated, service_role;

-- ============================================================
-- 7. signage.portal_register_report(...) / signage.portal_update_report(...)
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
  -- [1115(2)] 変えた箇所: inspection_writable（完了連絡の3関数と共有）は変えず、管理会社の条件を足した版で判定する
  IF NOT coalesce(signage.inspection_report_writable(p_inspection_id), false) THEN
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
  SELECT s.property_code, s.property_name, pi.inspection_type_id, t.label, pi.maintainer_id
    INTO info
    FROM biz.property_inspections pi
    JOIN biz.properties b ON b.id = pi.property_id
    JOIN signage.signage_master_properties s ON s.id = b.signage_property_id
    LEFT JOIN biz.inspection_types t ON t.id = pi.inspection_type_id
   WHERE pi.id = p_inspection_id;

  -- 結び付ける申請は、その点検（property_inspection_id）の申請で、物件もその点検の物件のものだけ（管理者・保守会社・管理会社とも）。
  -- [1115 の残り] 変えた箇所: 点検の一致は本番の現行定義にもあった。物件の一致を足し、点検の物件を読んだ後へ移した
  -- （申請の物件コードと点検の物件は申請のトリガーがそろえるが、管理者の書き込みや物件コードの付け替えで食い違っても結び付けない）
  IF p_entry_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM signage.signage_entries e
        WHERE e.id = p_entry_id AND e.property_inspection_id = p_inspection_id
          AND e.property_code IS NOT DISTINCT FROM info.property_code AND info.property_code IS NOT NULL) THEN
    RAISE EXCEPTION '申請と点検が一致しません' USING ERRCODE = '22023';
  END IF;

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

-- [1115 の残り] 新設: 報告書の版を修正・削除できる人か（「誰が」だけ。受領前・受領済み・復元の確かめは portal_update_report に残す）。
-- portal_update_report と、画面の一覧の計算列 can_modify（PostgREST の計算列。fetchInspectionReports が読む）が同じ判定を使う。
--   - 管理者: 全件（今までどおり）
--   - 保守会社（role=user）: 自社（vendor_id）の版のうち、管理会社のアカウントが上げた版以外。管理会社が上げた版は
--     vendor_id に点検行の保守会社が入るが、触らせない。管理者の代理提出の版は今までどおり保守会社も直せる
--   - 管理会社: 管理会社のアカウントが上げた版のうち、上げた人の管理会社が自社で、自社が管理する物件の点検のもの
--     （上げた本人に限らず同じ管理会社の人も。保守会社の版・管理者の版は触れない）
--   上げた人の役割は今のプロファイルで見る（状態は問わない。無効化した人の版も同じ会社が直せる）。プロファイルが無ければ管理者だけ。
--   判定できないとき（無効・プロファイル無しの呼び出し元）は coalesce で権限なしに倒す
CREATE OR REPLACE FUNCTION signage.inspection_report_modifiable(r signage.signage_inspection_reports)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'signage', 'pg_temp'
AS $function$
  -- 渡された行は信じず、id で保存済みの行を読み直して判定する（偽の行を渡して、ある uuid の役割を探れないように）
  select coalesce((
    select signage.is_active_admin()
       or (signage.current_role_kind() = 'user' and s.vendor_id is not null
           and s.vendor_id = signage.current_vendor_id()
           -- 管理会社のアカウントが上げた版だけ外す（管理者の代理提出の版は、今までどおり受注先の保守会社が直せる）
           and not exists (select 1 from signage.signage_profiles p where p.id = s.uploaded_by and p.role = 'management'))
       or (signage.is_active_management() and signage.current_management_company_id() is not null
           and s.property_inspection_id is not null
           and signage.inspection_in_scope(s.property_inspection_id)
           and exists (select 1 from signage.signage_profiles p
                        where p.id = s.uploaded_by and p.role = 'management'
                          and p.management_company_id = signage.current_management_company_id()))
      from signage.signage_inspection_reports s
     where s.id = r.id),
    false);
$function$;

REVOKE ALL ON FUNCTION signage.inspection_report_modifiable(signage.signage_inspection_reports) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION signage.inspection_report_modifiable(signage.signage_inspection_reports) TO authenticated, service_role;

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
  -- [1115(2)・1115 の残り] 変えた箇所: 「誰が」は inspection_report_modifiable（画面の can_modify と同じ）。保守会社は保守会社のアカウントが
  -- 上げた自社の版だけ、管理会社は自社の管理会社のアカウントが上げた版（自社物件の点検のもの）だけ。受領前の扱い（削除は提出のうち・
  -- 受領済みは不可・復元は管理者だけ）は下の確かめが保守会社と同じにかける
  IF NOT coalesce(signage.inspection_report_modifiable(r), false) THEN
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
-- 8. signage.bulk_template_info(uuid)
-- ============================================================
CREATE OR REPLACE FUNCTION signage.bulk_template_info(p_vendor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'pg_temp'
AS $function$
DECLARE
  v_vendor uuid;
  v_mgmt uuid;  -- [1115(2)]
  v_ids jsonb;  -- [1115(2)]
BEGIN
  IF signage.is_active_admin() THEN
    v_vendor := p_vendor_id;
  ELSIF signage.current_role_kind() = 'user' THEN
    v_vendor := signage.current_vendor_id();
  -- [1115(2)] 変えた箇所: 管理会社は自社が管理する物件の点検（p_vendor_id があればその保守会社の分だけ）。
  -- 略称は p_vendor_id があればその保守会社、無ければ自社（管理会社）。p_vendor_id が NULL でも空にしない（全社の意味）
  -- [1115(2) レビュー] 略称は、p_vendor_id が自社物件の点検（台を含む）に出てくる保守会社のときだけ返す（任意の会社 id の社名を引かせない）
  ELSIF coalesce(signage.is_active_management(), false) THEN
    v_mgmt := signage.current_management_company_id();
    v_ids := coalesce((
        SELECT jsonb_agg(x.id ORDER BY x.property_id, x.cat_sort, x.created_at, x.id)
        FROM (
          SELECT pi.id, pi.property_id, pi.created_at,
                 coalesce((SELECT ec.sort FROM biz.equipment_categories ec WHERE ec.code = t.equipment_category_code), 2147483647) AS cat_sort
          FROM biz.property_inspections pi
          JOIN biz.properties b ON b.id = pi.property_id
          LEFT JOIN biz.inspection_types t ON t.id = pi.inspection_type_id
          WHERE b.management_company_id = v_mgmt
            AND (p_vendor_id IS NULL
                 OR pi.maintainer_id = p_vendor_id
                 OR EXISTS (SELECT 1 FROM biz.property_unit_inspections ui
                            JOIN biz.property_units u ON u.id = ui.unit_id
                            WHERE u.property_id = pi.property_id
                              AND ui.inspection_type_id = pi.inspection_type_id
                              AND ui.maintainer_id = p_vendor_id))
        ) x
      ), '[]'::jsonb);
    RETURN jsonb_build_object(
      'short_name',
      CASE WHEN p_vendor_id IS NULL OR jsonb_array_length(v_ids) > 0 THEN
        (SELECT coalesce(nullif(btrim(c.short_name), ''), c.name) FROM biz.companies c WHERE c.id = coalesce(p_vendor_id, v_mgmt))
      END,
      'inspection_ids', v_ids);
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

REVOKE ALL ON FUNCTION signage.bulk_template_info(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION signage.bulk_template_info(uuid) TO authenticated, service_role;

-- ============================================================
-- 8b. signage.portal_entries()（[1115(2) レビュー] 列 by_management を足す。戻り値の形が変わるので DROP → CREATE）
-- ============================================================
DROP FUNCTION IF EXISTS signage.portal_entries();
CREATE OR REPLACE FUNCTION signage.portal_entries()
 RETURNS TABLE(id uuid, user_id uuid, property_code text, inspection_type text, vendor_name text, vendor_id uuid, property_inspection_id uuid, target_month date, inspection_start date, inspection_end date, status text, review_comment text, reviewed_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, is_mine boolean, terminal_id text, template_no text, announcement text, remarks text, poster_type text, poster_image text, display_start_date date, display_start_time text, display_end_date date, display_end_time text, by_management boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'signage', 'pg_temp'
AS $function$
  -- 申請者・同じ保守会社・承認する管理会社・管理者以外（同じ点検の台を受け持つ別の保守会社）には、
  -- 申請があること・対象月・状態だけを返し、申請者・保守会社・日付・理由・掲示の内容は null にする
  select e.id, case when c.can_see then e.user_id end, e.property_code, e.inspection_type,
         case when c.can_see then e.vendor_name end, case when c.can_see then e.vendor_id end,
         e.property_inspection_id, e.target_month,
         case when c.can_see then e.inspection_start end, case when c.can_see then e.inspection_end end,
         e.status, case when c.can_see then e.review_comment end, case when c.can_see then e.reviewed_at end,
         e.created_at, e.updated_at,
         e.user_id = auth.uid(),
         case when c.can_see then e.terminal_id end, case when c.can_see then e.template_no end,
         case when c.can_see then e.announcement end, case when c.can_see then e.remarks end,
         case when c.can_see then e.poster_type end, case when c.can_see then e.poster_image end,
         case when c.can_see then e.display_start_date end, case when c.can_see then e.display_start_time end,
         case when c.can_see then e.display_end_date end, case when c.can_see then e.display_end_time end,
         -- [1115(2) レビュー] 申請者が管理会社のアカウントか（保守会社の画面で、管理会社の申請に「修正」を出さないため）
         case when c.can_see then signage.entry_author_is_management(e.user_id) end
  from signage.signage_entries e
  cross join lateral (select
    signage.is_active_admin()
    or e.user_id = auth.uid()
    or (e.vendor_id is not null and e.vendor_id = signage.current_vendor_id())
    or (signage.current_role_kind() = 'management' and signage.property_reviewable(e.property_code)) as can_see) c
  where signage.current_role_kind() is not null
    and (
      signage.is_active_admin()
      or (e.property_inspection_id is not null and signage.inspection_in_scope(e.property_inspection_id))
      or (e.property_inspection_id is null and (
            e.user_id = auth.uid()
            or (signage.current_role_kind() = 'management' and signage.property_reviewable(e.property_code))))
    )
  order by e.created_at desc;
$function$;

REVOKE ALL ON FUNCTION signage.portal_entries() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION signage.portal_entries() TO authenticated, service_role;

-- ============================================================
-- 9. ポリシー（加算。既存のポリシーは変えない）
-- ============================================================

-- [1115(2)] signage_entries: 管理会社の INSERT（自分の名義で、自社が管理する物件だけ。中身の確かめは guard_entry_* のトリガー）
DROP POLICY IF EXISTS mgmt_insert_entries ON signage.signage_entries;
CREATE POLICY mgmt_insert_entries ON signage.signage_entries
  FOR INSERT TO authenticated
  WITH CHECK (signage.is_active_management() AND user_id = auth.uid() AND signage.property_reviewable(property_code));

-- [1115(2)] signage_entries: 管理会社の UPDATE（本人の未申請 pending の行だけ。pending → draft の申請は通す。
-- 申請済み draft の修正は portal_update_submitted_entry 経由）。DELETE（取り下げ）は開かない（guard_entry_management_delete もそのまま）
DROP POLICY IF EXISTS mgmt_update_own_pending_entries ON signage.signage_entries;
CREATE POLICY mgmt_update_own_pending_entries ON signage.signage_entries
  FOR UPDATE TO authenticated
  USING (signage.is_active_management() AND user_id = auth.uid() AND status = 'pending'
         AND signage.property_reviewable(property_code))
  WITH CHECK (signage.is_active_management() AND user_id = auth.uid() AND signage.property_reviewable(property_code));

-- [1115(2)] Storage inspection-reports: 管理会社の PDF 置き（自社が管理する物件の点検のフォルダだけ）。既存の inspection_reports_insert は変えない
DROP POLICY IF EXISTS inspection_reports_mgmt_insert ON storage.objects;
CREATE POLICY inspection_reports_mgmt_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'inspection-reports' AND signage.is_active_management()
              AND signage.inspection_report_writable(signage.report_object_inspection_id(name)));

-- [1115(2)] Storage poster-images: 管理会社の詳細設定の貼紙画像（自分の uid のフォルダだけ）。既存の「poster-image 2whf5k_1」は変えない。
-- 貼紙ライブラリの置き場所（library/<社>/）とは別なので、ライブラリのポリシーとはぶつからない
DROP POLICY IF EXISTS "poster-images mgmt own insert" ON storage.objects;
CREATE POLICY "poster-images mgmt own insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'poster-images' AND position('..' in name) = 0
              AND (storage.foldername(name))[1] = auth.uid()::text
              AND signage.is_active_management());

-- [1115(2) レビュー] Storage poster-images: 管理会社が自分の uid のフォルダに上げた貼紙画像を消せるように（差し替え・テンプレートに戻す・
-- 行の削除・詳細設定のキャンセルの片付け）。条件は保守会社の「poster-images own delete」と同じ（申請で使われている画像は消せない）。
-- poster_object_referenced は保守会社用（is_active_member でないと「使われている」扱い）なので、管理会社用の判定を別に置く
CREATE OR REPLACE FUNCTION signage.mgmt_poster_object_deletable(p_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'signage', 'pg_temp'
AS $function$
  select coalesce(signage.is_active_management(), false)
     and p_name is not null
     and position('..' in p_name) = 0
     and (storage.foldername(p_name))[1] is not distinct from auth.uid()::text
     and not exists (
        select 1
          from signage.signage_entries e
         where (e.poster_image is not null
                and right(split_part(e.poster_image, '?', 1), length('/storage/v1/object/public/poster-images/' || p_name))
                    = '/storage/v1/object/public/poster-images/' || p_name)
            or exists (
              select 1 from jsonb_array_elements(e.extra_posters) x
               where right(split_part(x->>'image_url', '?', 1), length('/storage/v1/object/public/poster-images/' || p_name))
                     = '/storage/v1/object/public/poster-images/' || p_name));
$function$;

REVOKE ALL ON FUNCTION signage.mgmt_poster_object_deletable(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION signage.mgmt_poster_object_deletable(text) TO authenticated, service_role;

-- 削除（Storage API の DELETE … RETURNING）は消す行が SELECT のポリシーでも見えないと0件になる。保守会社の SELECT（poster-image 2whf5k_0）は
-- is_active_member だけなので、管理会社には自分の uid のフォルダの SELECT を足す（バケットは公開なので、読める中身は今と変わらない）
DROP POLICY IF EXISTS "poster-images mgmt own select" ON storage.objects;
CREATE POLICY "poster-images mgmt own select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'poster-images' AND position('..' in name) = 0
         AND (storage.foldername(name))[1] = auth.uid()::text
         AND signage.is_active_management());

DROP POLICY IF EXISTS "poster-images mgmt own delete" ON storage.objects;
CREATE POLICY "poster-images mgmt own delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'poster-images' AND signage.mgmt_poster_object_deletable(name));

NOTIFY pgrst, 'reload schema';
