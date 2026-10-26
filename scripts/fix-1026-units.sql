-- 修正依頼1026 担当 units: 号機（台）ごとの申請と完了連絡（I7）・申請済みの申請の修正（I11）・点検日連絡の反映
-- 2026-10-26 作成。本番へは未適用（適用はユーザー承認後）。ローカル DB（signage-v2-verify）で確かめた。
-- 適用方法: ファイル全体を1つのクエリとして流す（Management API なら1回の query に全文を入れる。psql なら psql -1 -f）。
--   BEGIN/COMMIT は付けない。先頭の lock_timeout で、ロックが取れないときは待ち続けずに失敗させる。何度流しても同じ結果になる。
--   既存（1023 以前）の関数・ポリシー・ガードは変えない。変えるのは 1024・1025 で足した完了連絡の関数だけ（オーバーロードは残さない）。
--   biz スキーマは変えない（notify_inspection_date は biz の 7cb61a4 のマイグレーションで入る列。先に biz を適用すること）。
--
-- 1. signage_entries.property_unit_id（I7）
--    台が2台以上の点検は台ごとに申請する。値は biz.property_units.id（portal_inspection_units の unit_id と同じ。台そのものの id。
--    台の保守の行 property_unit_inspections は点検種別ごとに作り直されうるので使わない）。台なし（1台以下・旧来）の申請は NULL。
--    外部キーは付けない: 業務システムで台を消したときの ON DELETE SET NULL が、申請済みの行の更新を止めるガード
--    （guard_entry_approval_flow）に断られ、台を消せなくなるため。台が消えた申請は No が出なくなるだけ（行・CSV はそのまま）。
--    書き込みはガード guard_entry_unit が確かめる: 台がその点検の物件・点検種別の台であること、管理者以外は台の保守会社
--    （台の保守会社が未設定なら点検行の保守会社）が自社であること。
-- 2. 完了連絡を台ごとに（I7）
--    signage_inspection_completions.property_unit_id（biz.property_units。台を消したら完了連絡も消える）と、一意を
--    （点検行, 対象月, 台）に（NULLS NOT DISTINCT。台なしの完了連絡は今どおり点検行 × 対象月に1件）。
--    portal_mark_completed_any_month / portal_unmark_completed に p_unit_id（既定 NULL＝台なし）を足し、2引数の版は消す
--    （PostgREST は名前で引数を渡すので、2引数で呼ぶ今の画面もそのまま動く）。portal_mark_completed（1024）は新しい一意に合わせるだけ。
--    portal_completions は台の列を足す（戻り値が変わるので作り直す）。
-- 3. 点検日連絡（biz の notify_inspection_date）
--    signage.portal_inspection_notify_off(): 点検日連絡が OFF の点検行（unit_id NULL）と台（unit_id あり）。範囲は inspection_in_scope。
--    画面は OFF の点検を申請不要（報告書のみ。signage_inspection_type_flags.report_only と OR）として扱い、点検月超過にしない。
--    完了連絡の点検月の確かめ（portal_mark_completed_any_month）も OFF の点検・台は点検月以外の月を通す（report_only と同じ）。
-- 4. 台ごとの申請の台（portal_entry_units）
--    portal_entries は戻り値を変えられないので、申請 id → 台 id を別に返す。範囲は portal_entries と同じ。
-- 5. 申請済み（承認前）の申請の修正（I11）
--    signage.portal_entry_for_edit(申請 id) と signage.portal_update_submitted_entry(申請 id, 変更 jsonb)。
--    直せるのは申請済み（draft＝管理会社・管理者の承認前）の申請だけ。承認（ready）・差戻し（pending）・取込済みは今どおり不可
--    （差戻しは「修正して再申請」で直す）。直せる人は申請者・同じ保守会社のアカウント・管理者。直せる列は点検日・備考・メモ・
--    案内文・貼紙・表示期間・端末・連絡先・表示時間・貼紙の位置だけ（物件・点検・保守会社・状態・承認の列は変えられない）。
--    申請済みの行の更新を止めるガード（guard_entry_approval_flow）は変えず、承認の関数（portal_review_entry）と同じ印
--    signage.portal_review をこの1文の間だけ立てて通す。貼紙のガード（guard_entry_posters）・建物追加のガードは印と関係なく働く。
--
-- 戻し手順は末尾。

SET lock_timeout = '5s';

-- ============================================================
-- 1. 申請の台
-- ============================================================
ALTER TABLE signage.signage_entries ADD COLUMN IF NOT EXISTS property_unit_id uuid;
COMMENT ON COLUMN signage.signage_entries.property_unit_id IS
  '台ごとの申請の台（biz.property_units.id。修正依頼1026 I7）。台が2台以上の点検だけ。台なし・旧来の申請は NULL。外部キーなし（台を消しても申請は残る）';
CREATE INDEX IF NOT EXISTS signage_entries_property_unit_idx
  ON signage.signage_entries (property_unit_id) WHERE property_unit_id IS NOT NULL;

-- 台がその点検（物件 × 点検種別）の台なら、その台の保守会社（未設定なら点検行の保守会社）。台でなければ is_unit = false
CREATE OR REPLACE FUNCTION signage.inspection_unit_vendor(p_inspection_id uuid, p_unit_id uuid, OUT is_unit boolean, OUT vendor_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'pg_temp'
AS $function$
  -- 集約で必ず1行にする（台でなければ is_unit = false・vendor_id = NULL）
  select count(*) > 0, (array_agg(coalesce(ui.maintainer_id, pi.maintainer_id)))[1]
    from biz.property_inspections pi
    join biz.property_units u on u.property_id = pi.property_id
    join biz.property_unit_inspections ui on ui.unit_id = u.id and ui.inspection_type_id = pi.inspection_type_id
   where pi.id = p_inspection_id and u.id = p_unit_id;
$function$;
REVOKE ALL ON FUNCTION signage.inspection_unit_vendor(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION signage.guard_entry_unit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'pg_temp'
AS $function$
DECLARE
  v record;
BEGIN
  IF NEW.property_unit_id IS NULL THEN
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
REVOKE ALL ON FUNCTION signage.guard_entry_unit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_entry_unit ON signage.signage_entries;
CREATE TRIGGER guard_entry_unit BEFORE INSERT OR UPDATE ON signage.signage_entries
  FOR EACH ROW EXECUTE FUNCTION signage.guard_entry_unit();

-- ============================================================
-- 2. 完了連絡を台ごとに
-- ============================================================
ALTER TABLE signage.signage_inspection_completions
  ADD COLUMN IF NOT EXISTS property_unit_id uuid REFERENCES biz.property_units(id) ON DELETE CASCADE;
COMMENT ON COLUMN signage.signage_inspection_completions.property_unit_id IS
  '台ごとの完了連絡の台（biz.property_units.id。修正依頼1026 I7）。NULL は台なし（点検行 × 対象月の全体。旧来の行もこれ）';

CREATE UNIQUE INDEX IF NOT EXISTS signage_inspection_completions_unit_uidx
  ON signage.signage_inspection_completions (property_inspection_id, target_month, property_unit_id) NULLS NOT DISTINCT;

-- 前の一意（点検行, 対象月）を外す（名前は作られたときに切り詰められているので、列の組で探す）
DO $do$
DECLARE
  c text;
BEGIN
  FOR c IN
    SELECT con.conname FROM pg_constraint con
     WHERE con.conrelid = 'signage.signage_inspection_completions'::regclass
       AND con.contype = 'u'
       AND (SELECT array_agg(a.attname::text ORDER BY a.attname)
              FROM unnest(con.conkey) k JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k)
           = ARRAY['property_inspection_id', 'target_month']
  LOOP
    EXECUTE format('ALTER TABLE signage.signage_inspection_completions DROP CONSTRAINT %I', c);
  END LOOP;
END;
$do$;

-- 点検日連絡が OFF か（点検行。台を渡したら台の値）
CREATE OR REPLACE FUNCTION signage.inspection_notify_off(p_inspection_id uuid, p_unit_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'pg_temp'
AS $function$
  select case when p_unit_id is null then
    exists (select 1 from biz.property_inspections pi where pi.id = p_inspection_id and not pi.notify_inspection_date)
  else
    exists (select 1 from biz.property_inspections pi
            join biz.property_units u on u.property_id = pi.property_id
            join biz.property_unit_inspections ui on ui.unit_id = u.id and ui.inspection_type_id = pi.inspection_type_id
            where pi.id = p_inspection_id and u.id = p_unit_id and not ui.notify_inspection_date)
  end;
$function$;
REVOKE ALL ON FUNCTION signage.inspection_notify_off(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- 1024 の完了連絡（点検月だけ）。新しい一意に合わせただけで、台なしの完了連絡を記録する（画面は使っていない）
CREATE OR REPLACE FUNCTION signage.portal_mark_completed(p_inspection_id uuid, p_target_month date)
 RETURNS signage.signage_inspection_completions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'pg_temp'
AS $function$
DECLARE
  r signage.signage_inspection_completions;
  v_vendor uuid;
  v_months int[];
BEGIN
  IF p_inspection_id IS NULL OR NOT signage.inspection_writable(p_inspection_id) THEN
    RAISE EXCEPTION 'この点検の完了連絡をする権限がありません' USING ERRCODE = '42501';
  END IF;
  IF p_target_month IS NULL THEN
    RAISE EXCEPTION '対象月を指定してください' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(inspection_months, '{}') INTO v_months FROM biz.property_inspections WHERE id = p_inspection_id;
  IF cardinality(v_months) > 0 AND NOT (extract(month from p_target_month)::int = ANY (v_months)) THEN
    RAISE EXCEPTION '対象月がこの点検の点検月ではありません' USING ERRCODE = '22023';
  END IF;
  IF signage.is_active_admin() THEN
    SELECT maintainer_id INTO v_vendor FROM biz.property_inspections WHERE id = p_inspection_id;
  ELSE
    v_vendor := signage.current_vendor_id();
  END IF;
  INSERT INTO signage.signage_inspection_completions (property_inspection_id, target_month, vendor_id, completed_by, property_unit_id)
  VALUES (p_inspection_id, date_trunc('month', p_target_month)::date, v_vendor, auth.uid(), NULL)
  ON CONFLICT (property_inspection_id, target_month, property_unit_id) DO NOTHING
  RETURNING * INTO r;
  IF r.id IS NULL THEN
    SELECT * INTO r FROM signage.signage_inspection_completions
     WHERE property_inspection_id = p_inspection_id AND target_month = date_trunc('month', p_target_month)::date
       AND property_unit_id IS NULL;
  END IF;
  RETURN r;
END;
$function$;

-- 完了連絡（画面が呼ぶ版）。p_unit_id を渡すとその台の完了連絡（台がその点検の台で、管理者以外は台の保守会社が自社のときだけ）。
-- 点検月以外の月を通すのは: 点検種別に毎月・申請不要の印／点検日連絡が OFF（点検行か、渡した台）／その点検 × 対象月の申請がある
DROP FUNCTION IF EXISTS signage.portal_mark_completed_any_month(uuid, date);
CREATE OR REPLACE FUNCTION signage.portal_mark_completed_any_month(p_inspection_id uuid, p_target_month date, p_unit_id uuid DEFAULT NULL)
 RETURNS signage.signage_inspection_completions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'pg_temp'
AS $function$
DECLARE
  r signage.signage_inspection_completions;
  v_vendor uuid;
  v_months int[];
  v_type uuid;
  v_month date;
  v_unit record;
BEGIN
  IF p_inspection_id IS NULL OR NOT signage.inspection_writable(p_inspection_id) THEN
    RAISE EXCEPTION 'この点検の完了連絡をする権限がありません' USING ERRCODE = '42501';
  END IF;
  IF p_target_month IS NULL THEN
    RAISE EXCEPTION '対象月を指定してください' USING ERRCODE = '22023';
  END IF;
  IF p_unit_id IS NOT NULL THEN
    SELECT * INTO v_unit FROM signage.inspection_unit_vendor(p_inspection_id, p_unit_id);
    IF NOT v_unit.is_unit THEN
      RAISE EXCEPTION '台がこの点検のものではありません' USING ERRCODE = '22023';
    END IF;
    IF NOT signage.is_active_admin() AND v_unit.vendor_id IS DISTINCT FROM signage.current_vendor_id() THEN
      RAISE EXCEPTION 'この台の完了連絡をする権限がありません' USING ERRCODE = '42501';
    END IF;
  END IF;
  v_month := date_trunc('month', p_target_month)::date;
  SELECT coalesce(inspection_months, '{}'), inspection_type_id INTO v_months, v_type
    FROM biz.property_inspections WHERE id = p_inspection_id;
  IF cardinality(v_months) > 0
     AND NOT (extract(month from v_month)::int = ANY (v_months))
     AND NOT EXISTS (SELECT 1 FROM signage.signage_inspection_type_flags f
                      WHERE f.inspection_type_id = v_type AND (f.monthly OR f.report_only))
     AND NOT signage.inspection_notify_off(p_inspection_id, NULL)
     AND NOT (p_unit_id IS NOT NULL AND signage.inspection_notify_off(p_inspection_id, p_unit_id))
     AND NOT EXISTS (SELECT 1 FROM signage.signage_entries e
                      WHERE e.property_inspection_id = p_inspection_id
                        AND e.target_month = v_month
                        AND e.status IN ('draft', 'ready', 'exported')) THEN
    RAISE EXCEPTION '対象月がこの点検の点検月ではありません（点検月以外の月は、その月の申請を出してから完了を連絡してください）'
      USING ERRCODE = '22023';
  END IF;
  IF NOT signage.is_active_admin() THEN
    v_vendor := signage.current_vendor_id();
  ELSIF p_unit_id IS NOT NULL THEN
    v_vendor := v_unit.vendor_id;
  ELSE
    SELECT maintainer_id INTO v_vendor FROM biz.property_inspections WHERE id = p_inspection_id;
  END IF;
  INSERT INTO signage.signage_inspection_completions (property_inspection_id, target_month, vendor_id, completed_by, property_unit_id)
  VALUES (p_inspection_id, v_month, v_vendor, auth.uid(), p_unit_id)
  ON CONFLICT (property_inspection_id, target_month, property_unit_id) DO NOTHING
  RETURNING * INTO r;
  IF r.id IS NULL THEN
    SELECT * INTO r FROM signage.signage_inspection_completions
     WHERE property_inspection_id = p_inspection_id AND target_month = v_month
       AND property_unit_id IS NOT DISTINCT FROM p_unit_id;
  END IF;
  RETURN r;
END;
$function$;

-- 完了連絡を取り消す。p_unit_id はその台の完了連絡（NULL は台なしの完了連絡）。記録した保守会社と同じ保守会社のアカウントか管理者
DROP FUNCTION IF EXISTS signage.portal_unmark_completed(uuid, date);
CREATE OR REPLACE FUNCTION signage.portal_unmark_completed(p_inspection_id uuid, p_target_month date, p_unit_id uuid DEFAULT NULL)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'pg_temp'
AS $function$
DECLARE
  r signage.signage_inspection_completions;
BEGIN
  IF p_inspection_id IS NULL OR NOT signage.inspection_writable(p_inspection_id) THEN
    RAISE EXCEPTION 'この点検の完了連絡を取り消す権限がありません' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM signage.signage_inspection_completions
   WHERE property_inspection_id = p_inspection_id AND target_month = date_trunc('month', p_target_month)::date
     AND property_unit_id IS NOT DISTINCT FROM p_unit_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF NOT signage.is_active_admin() AND r.vendor_id IS DISTINCT FROM signage.current_vendor_id() THEN
    RAISE EXCEPTION '完了連絡を取り消せるのは、連絡した保守会社か管理者だけです' USING ERRCODE = '42501';
  END IF;
  DELETE FROM signage.signage_inspection_completions WHERE id = r.id;
  RETURN true;
END;
$function$;

-- 範囲内の完了連絡（台の列つき）
DROP FUNCTION IF EXISTS signage.portal_completions();
CREATE OR REPLACE FUNCTION signage.portal_completions()
 RETURNS TABLE(id uuid, property_inspection_id uuid, target_month date, vendor_id uuid, completed_at timestamptz, completed_by uuid,
               property_unit_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'signage', 'pg_temp'
AS $function$
  select c.id, c.property_inspection_id, c.target_month, c.vendor_id, c.completed_at, c.completed_by, c.property_unit_id
  from signage.signage_inspection_completions c
  where signage.inspection_in_scope(c.property_inspection_id)
  order by c.target_month, c.completed_at;
$function$;

REVOKE ALL ON FUNCTION signage.portal_mark_completed(uuid, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION signage.portal_mark_completed_any_month(uuid, date, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION signage.portal_unmark_completed(uuid, date, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION signage.portal_completions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION signage.portal_mark_completed(uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION signage.portal_mark_completed_any_month(uuid, date, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION signage.portal_unmark_completed(uuid, date, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION signage.portal_completions() TO authenticated, service_role;

-- ============================================================
-- 3. 点検日連絡が OFF の点検行・台
-- ============================================================
CREATE OR REPLACE FUNCTION signage.portal_inspection_notify_off()
 RETURNS TABLE(inspection_id uuid, unit_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'pg_temp'
AS $function$
  select pi.id, null::uuid
  from biz.property_inspections pi
  where not pi.notify_inspection_date and signage.inspection_in_scope(pi.id)
  union all
  select pi.id, u.id
  from biz.property_inspections pi
  join biz.property_units u on u.property_id = pi.property_id
  join biz.property_unit_inspections ui on ui.unit_id = u.id and ui.inspection_type_id = pi.inspection_type_id
  where not ui.notify_inspection_date and signage.inspection_in_scope(pi.id)
  order by 1, 2 nulls first;
$function$;
REVOKE ALL ON FUNCTION signage.portal_inspection_notify_off() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION signage.portal_inspection_notify_off() TO authenticated, service_role;

-- ============================================================
-- 4. 申請の台（portal_entries と同じ範囲）
-- ============================================================
CREATE OR REPLACE FUNCTION signage.portal_entry_units()
 RETURNS TABLE(entry_id uuid, property_unit_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'signage', 'pg_temp'
AS $function$
  select e.id, e.property_unit_id
  from signage.signage_entries e
  where e.property_unit_id is not null
    and signage.current_role_kind() is not null
    and (signage.is_active_admin()
         or (e.property_inspection_id is not null and signage.inspection_in_scope(e.property_inspection_id))
         or (e.property_inspection_id is null and (
               e.user_id = auth.uid()
               or (signage.current_role_kind() = 'management' and signage.property_reviewable(e.property_code)))));
$function$;
REVOKE ALL ON FUNCTION signage.portal_entry_units() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION signage.portal_entry_units() TO authenticated, service_role;

-- ============================================================
-- 5. 申請済み（承認前）の申請の修正
-- ============================================================
-- 直せる申請か（申請者・同じ保守会社のアカウント・管理者。状態は呼ぶ側で見る）
CREATE OR REPLACE FUNCTION signage.submitted_entry_editable(p_user_id uuid, p_vendor_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'signage', 'pg_temp'
AS $function$
  select signage.is_active_admin()
      or (signage.current_role_kind() = 'user' and signage.is_active_member()
          and (p_user_id = auth.uid()
               or (p_vendor_id is not null and p_vendor_id = signage.current_vendor_id())));
$function$;
REVOKE ALL ON FUNCTION signage.submitted_entry_editable(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- 修正する申請を読む（申請済みのものだけ。portal_entries に無いメモ・追加の貼紙・連絡先も返す）
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
REVOKE ALL ON FUNCTION signage.portal_entry_for_edit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION signage.portal_entry_for_edit(uuid) TO authenticated, service_role;

-- 申請済み（承認前）の申請を直す。p_patch は直す列だけ（直せない列のキーが入っていたら断る）。状態は申請済みのまま
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
    'display_start_date', 'display_start_time', 'display_end_date', 'display_end_time'];
  v_bad text;
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

  -- 申請済みの行の更新を止めるガードを、この1文の間だけ通す（承認の関数と同じ印）。貼紙・建物追加・台のガードは印と関係なく働く
  PERFORM set_config('signage.portal_review', 'on', true);
  UPDATE signage.signage_entries
     SET inspection_start = n.inspection_start, inspection_end = n.inspection_end,
         remarks = n.remarks, memo = n.memo, announcement = n.announcement,
         terminal_id = n.terminal_id, emergency_contact = n.emergency_contact,
         poster_type = n.poster_type, poster_image = n.poster_image, poster_position = n.poster_position,
         extra_posters = n.extra_posters, display_duration = n.display_duration,
         display_start_date = n.display_start_date, display_start_time = n.display_start_time,
         display_end_date = n.display_end_date, display_end_time = n.display_end_time
   WHERE id = p_entry_id
  RETURNING * INTO e;
  PERFORM set_config('signage.portal_review', 'off', true);
  RETURN e;
END;
$function$;
REVOKE ALL ON FUNCTION signage.portal_update_submitted_entry(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION signage.portal_update_submitted_entry(uuid, jsonb) TO authenticated, service_role;

-- ============================================================
-- 戻し手順（申請・完了連絡の台の値は消える）
-- DROP FUNCTION IF EXISTS signage.portal_update_submitted_entry(uuid, jsonb);
-- DROP FUNCTION IF EXISTS signage.portal_entry_for_edit(uuid);
-- DROP FUNCTION IF EXISTS signage.submitted_entry_editable(uuid, uuid);
-- DROP FUNCTION IF EXISTS signage.portal_entry_units();
-- DROP FUNCTION IF EXISTS signage.portal_inspection_notify_off();
-- 完了連絡: 台つきの行を消してから fix-1024-core.sql の portal_completions・portal_unmark_completed・portal_mark_completed と
--   fix-1025-form.sql の portal_mark_completed_any_month を流し直す（その前に 3引数の版と portal_completions を DROP）。
--   DELETE FROM signage.signage_inspection_completions WHERE property_unit_id IS NOT NULL;
--   DROP INDEX signage.signage_inspection_completions_unit_uidx;
--   ALTER TABLE signage.signage_inspection_completions ADD CONSTRAINT signage_inspection_completion_property_inspection_id_target_key
--     UNIQUE (property_inspection_id, target_month);
--   ALTER TABLE signage.signage_inspection_completions DROP COLUMN property_unit_id;
-- DROP FUNCTION IF EXISTS signage.inspection_notify_off(uuid, uuid);
-- DROP TRIGGER IF EXISTS guard_entry_unit ON signage.signage_entries; DROP FUNCTION IF EXISTS signage.guard_entry_unit();
-- DROP FUNCTION IF EXISTS signage.inspection_unit_vendor(uuid, uuid);
-- ALTER TABLE signage.signage_entries DROP COLUMN property_unit_id;   -- 台ごとの申請の台が分からなくなる
-- ============================================================
