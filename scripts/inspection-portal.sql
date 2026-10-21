-- 点検ポータル（管理会社・保守会社の点検一覧／申請の承認・差戻し／点検報告書）
-- 2026-10-21 作成。本番へは未適用（適用はユーザー承認後）。
-- 適用方法: Management API で1文ずつ流す（BEGIN/COMMIT を付けない。付けると何も残らない）。
-- すべて追加。既存の関数で変えるのは guard_entry_approval_flow（RPC 経由の承認を通す）、
-- guard_profile_privileged_columns（management_company_id を保護対象へ）、is_active_member（management を含めない）の3つだけ。戻し手順は末尾。

-- ============================================================
-- 1. アカウント: 管理会社ロール
-- ============================================================
ALTER TABLE signage.signage_profiles DROP CONSTRAINT IF EXISTS signage_profiles_role_check;
ALTER TABLE signage.signage_profiles ADD CONSTRAINT signage_profiles_role_check CHECK (role = ANY (ARRAY['admin'::text, 'user'::text, 'management'::text]));
ALTER TABLE signage.signage_profiles ADD COLUMN IF NOT EXISTS management_company_id uuid REFERENCES biz.companies(id);
ALTER TABLE signage.signage_profiles DROP CONSTRAINT IF EXISTS signage_profiles_management_company_check;
ALTER TABLE signage.signage_profiles ADD CONSTRAINT signage_profiles_management_company_check CHECK (
  CASE WHEN role = 'management' THEN management_company_id IS NOT NULL AND vendor_id IS NULL
       ELSE management_company_id IS NULL END);

-- 既存の「有効なメンバー」判定（マスタ・申請・Storage のポリシー18件と RPC 5本が使う）は、管理会社を含めない。
-- 管理会社は範囲を絞った portal_* の RPC だけで読む（他社の物件・点検・マスタを読ませない）。admin・user の結果は従来と同じ
CREATE OR REPLACE FUNCTION signage.is_active_member()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'signage', 'pg_temp'
AS $function$ SELECT EXISTS (SELECT 1 FROM signage.signage_profiles WHERE id = auth.uid() AND status = 'active' AND role IN ('admin', 'user')) $function$;

CREATE OR REPLACE FUNCTION signage.current_management_company_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'signage', 'pg_temp'
AS $function$ SELECT management_company_id FROM signage.signage_profiles WHERE id = auth.uid() AND status = 'active' AND role = 'management' $function$;

CREATE OR REPLACE FUNCTION signage.current_role_kind()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'signage', 'pg_temp'
AS $function$ SELECT role FROM signage.signage_profiles WHERE id = auth.uid() AND status = 'active' $function$;

CREATE OR REPLACE FUNCTION signage.guard_profile_privileged_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'signage', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM signage.signage_profiles WHERE id = auth.uid() AND role = 'admin' AND status = 'active') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'プロファイルの作成は管理者のみ可能です' USING ERRCODE = '42501';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.vendor_id IS DISTINCT FROM OLD.vendor_id
     OR NEW.management_company_id IS DISTINCT FROM OLD.management_company_id
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION '権限・保守会社・管理会社・状態・メールアドレスの変更は管理者のみ可能です' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

-- 管理画面のユーザー編集で選ぶ管理会社の一覧（管理者だけ）
CREATE OR REPLACE FUNCTION signage.management_companies_master()
 RETURNS TABLE(id uuid, name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'pg_temp'
AS $function$
  select c.id, c.name from biz.companies c
  where c.is_management_company and signage.is_active_admin()
  order by c.name;
$function$;

-- ============================================================
-- 2. 点検の範囲判定
-- ============================================================
-- 点検行（biz.property_inspections）がログイン中のアカウントの範囲にあるか。
-- 管理者は全件。保守会社は点検行の保守会社か、同じ物件・点検種別の台の保守会社（mirror は先頭台の会社しか持たないため）。
-- 管理会社は物件の管理会社。
CREATE OR REPLACE FUNCTION signage.inspection_in_scope(p_inspection_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'pg_temp'
AS $function$
  select case signage.current_role_kind()
    when 'admin' then exists (select 1 from biz.property_inspections where id = p_inspection_id)
    when 'user' then exists (
      select 1 from biz.property_inspections pi
      where pi.id = p_inspection_id
        and signage.current_vendor_id() is not null
        and (pi.maintainer_id = signage.current_vendor_id()
             or exists (select 1 from biz.property_unit_inspections ui
                        join biz.property_units u on u.id = ui.unit_id
                        where u.property_id = pi.property_id
                          and ui.inspection_type_id = pi.inspection_type_id
                          and ui.maintainer_id = signage.current_vendor_id())))
    when 'management' then exists (
      select 1 from biz.property_inspections pi
      join biz.properties b on b.id = pi.property_id
      where pi.id = p_inspection_id
        and b.management_company_id = signage.current_management_company_id())
    else false end;
$function$;

-- 物件（signage の物件コード）の管理会社がログイン中の管理会社か。管理者は常に true
CREATE OR REPLACE FUNCTION signage.property_reviewable(p_property_code text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'pg_temp'
AS $function$
  select signage.is_active_admin() or exists (
    select 1 from signage.signage_master_properties s
    join biz.properties b on b.signage_property_id = s.id
    -- 旧来の申請は 120410、マスタは 120410-00 のように書式が揺れる（画面側 normalizePropertyCode と同じ規則）
    where regexp_replace(s.property_code, '-00$', '') = regexp_replace(btrim(p_property_code), '-00$', '')
      and signage.current_management_company_id() is not null
      and b.management_company_id = signage.current_management_company_id());
$function$;

-- ============================================================
-- 3. 申請（signage_entries）: 点検との紐付け・承認者の記録
-- ============================================================
ALTER TABLE signage.signage_entries ADD COLUMN IF NOT EXISTS property_inspection_id uuid REFERENCES biz.property_inspections(id) ON DELETE SET NULL;
ALTER TABLE signage.signage_entries ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES signage.signage_master_vendors(id);
ALTER TABLE signage.signage_entries ADD COLUMN IF NOT EXISTS target_month date;
ALTER TABLE signage.signage_entries ADD COLUMN IF NOT EXISTS review_comment text;
ALTER TABLE signage.signage_entries ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE signage.signage_entries ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE signage.signage_entries DROP CONSTRAINT IF EXISTS signage_entries_target_month_first_day;
ALTER TABLE signage.signage_entries ADD CONSTRAINT signage_entries_target_month_first_day CHECK (target_month IS NULL OR extract(day from target_month) = 1);
CREATE INDEX IF NOT EXISTS signage_entries_inspection_month_idx ON signage.signage_entries (property_inspection_id, target_month);

-- 承認ガード: RPC（portal_review_entry）の中からだけ、管理会社による承認・差戻しを通す。
-- それ以外は従来どおり（この1分岐の追加以外は変えていない）
CREATE OR REPLACE FUNCTION signage.guard_entry_approval_flow()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'signage', 'pg_temp'
AS $function$
BEGIN
  -- JWT を持たない経路（service_role・管理SQL）と有効な管理者は対象外
  IF auth.uid() IS NULL OR signage.is_active_admin() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- portal_review_entry が範囲を確かめたうえで立てる印（トランザクション内だけ有効）
  IF TG_OP = 'UPDATE' AND current_setting('signage.portal_review', true) = 'on' THEN
    RETURN NEW;
  END IF;

  -- 業務システムで点検行を消したときの FK（ON DELETE SET NULL）による更新は通す。
  -- property_inspection_id が NULL になるだけで、ほかの列は変わらない
  IF TG_OP = 'UPDATE' AND OLD.property_inspection_id IS NOT NULL AND NEW.property_inspection_id IS NULL
     AND (to_jsonb(NEW) - 'property_inspection_id' - 'updated_at') = (to_jsonb(OLD) - 'property_inspection_id' - 'updated_at') THEN
    RETURN NEW;
  END IF;

  -- 変更できるのは未申請（pending）の行だけ。申請済み（draft）を変えられると、管理者が内容を確認した後に
  -- 差し替えた本文が承認されてしまう（承認は id 指定で status を ready にするだけのため）
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION '申請済み・承認済みのデータは変更できません（管理者にお問い合わせください）' USING ERRCODE = '42501';
  END IF;
  -- 削除（取り下げ）は承認前（pending / draft）まで
  IF TG_OP = 'DELETE' AND OLD.status IS DISTINCT FROM 'pending' AND OLD.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION '承認済みのデータは削除できません（管理者にお問い合わせください）' USING ERRCODE = '42501';
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.status IS DISTINCT FROM 'pending' AND NEW.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION '承認済みにできるのは管理者のみです' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- 申請の紐付け列の整合（管理者・service_role 以外）:
-- 管理会社のアカウントは申請を作れない／点検との紐付けは自分の範囲の点検だけ／保守会社は自社に固定／
-- 承認記録（review_*）は利用者が書き換えられない
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
     AND (to_jsonb(NEW) - 'property_inspection_id' - 'updated_at') = (to_jsonb(OLD) - 'property_inspection_id' - 'updated_at') THEN
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

DROP TRIGGER IF EXISTS guard_entry_portal_columns ON signage.signage_entries;
CREATE TRIGGER guard_entry_portal_columns BEFORE INSERT OR UPDATE ON signage.signage_entries FOR EACH ROW EXECUTE FUNCTION signage.guard_entry_portal_columns();

-- 管理会社のアカウントは申請を削除できない（取り下げは保守会社と管理者）
CREATE OR REPLACE FUNCTION signage.guard_entry_management_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'signage', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND signage.current_role_kind() = 'management' THEN
    RAISE EXCEPTION '管理会社のアカウントでは申請を削除できません' USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS guard_entry_management_delete ON signage.signage_entries;
CREATE TRIGGER guard_entry_management_delete BEFORE DELETE ON signage.signage_entries FOR EACH ROW EXECUTE FUNCTION signage.guard_entry_management_delete();

-- ============================================================
-- 4. ポータルの読み取り RPC
-- ============================================================
-- 範囲内の点検行。月・物件・管理会社・保守会社の名前をまとめて返す（一覧と超過判定の元データ）。
-- 端末 ID も返す（保守会社の物件マスタは担当物件表 signage_building_vendors の物件だけなので、そこに無い点検物件の端末を選べるように）
DROP FUNCTION IF EXISTS signage.portal_inspections();
CREATE OR REPLACE FUNCTION signage.portal_inspections()
 RETURNS TABLE(
   inspection_id uuid, property_code text, property_name text, terminal_count integer, terminal_ids text[],
   management_company_id uuid, management_company_name text,
   inspection_type_id uuid, inspection_type_label text, template_no text,
   vendor_id uuid, vendor_name text, unit_vendor_ids uuid[],
   inspection_months integer[], schedule_from date, remarks text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'pg_temp'
AS $function$
  select pi.id, s.property_code, s.property_name,
         coalesce(jsonb_array_length(case when jsonb_typeof(s.terminals) = 'array' then s.terminals end), 0),
         coalesce((select array_agg(coalesce(t->>'terminal_id', t->>'terminalId') order by ord)
                   from jsonb_array_elements(case when jsonb_typeof(s.terminals) = 'array' then s.terminals else '[]'::jsonb end)
                        with ordinality as x(t, ord)
                   where coalesce(t->>'terminal_id', t->>'terminalId') is not null), '{}'),
         b.management_company_id, mc.name,
         pi.inspection_type_id, t.label, t.template_no,
         pi.maintainer_id, m.name,
         coalesce((select array_agg(distinct ui.maintainer_id) from biz.property_unit_inspections ui
                   join biz.property_units u on u.id = ui.unit_id
                   where u.property_id = pi.property_id and ui.inspection_type_id = pi.inspection_type_id
                     and ui.maintainer_id is not null), '{}'),
         coalesce(pi.inspection_months, '{}'),
         date_trunc('month', pi.created_at at time zone 'Asia/Tokyo')::date,
         coalesce(pi.remarks, '')
  from biz.property_inspections pi
  join biz.properties b on b.id = pi.property_id
  join signage.signage_master_properties s on s.id = b.signage_property_id
  left join biz.companies mc on mc.id = b.management_company_id
  left join biz.inspection_types t on t.id = pi.inspection_type_id
  left join biz.maintainers m on m.id = pi.maintainer_id
  where signage.inspection_in_scope(pi.id)
  order by s.property_code, t.label;
$function$;

-- 範囲内の申請。点検に紐付いたもの（property_inspection_id あり）は点検の範囲で、
-- 紐付きの無い旧来の申請は（管理者・自分の申請・管理会社の物件）で絞る
DROP FUNCTION IF EXISTS signage.portal_entries();
CREATE OR REPLACE FUNCTION signage.portal_entries()
 RETURNS TABLE(
   id uuid, user_id uuid, property_code text, inspection_type text, vendor_name text, vendor_id uuid,
   property_inspection_id uuid, target_month date, inspection_start date, inspection_end date,
   status text, review_comment text, reviewed_at timestamptz, created_at timestamptz, updated_at timestamptz,
   is_mine boolean,
   terminal_id text, template_no text, announcement text, remarks text, poster_type text, poster_image text,
   display_start_date date, display_start_time text, display_end_date date, display_end_time text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'signage', 'pg_temp'
AS $function$
  select e.id, e.user_id, e.property_code, e.inspection_type, e.vendor_name, e.vendor_id,
         e.property_inspection_id, e.target_month, e.inspection_start, e.inspection_end,
         e.status, e.review_comment, e.reviewed_at, e.created_at, e.updated_at,
         e.user_id = auth.uid(),
         e.terminal_id, e.template_no, e.announcement, e.remarks, e.poster_type, e.poster_image,
         e.display_start_date, e.display_start_time, e.display_end_date, e.display_end_time
  from signage.signage_entries e
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

-- ============================================================
-- 5. 承認・差戻し（管理会社・管理者）
-- ============================================================
-- p_action: 'approve'（draft → ready）／ 'send_back'（draft・ready → pending、理由必須）
CREATE OR REPLACE FUNCTION signage.portal_review_entry(p_entry_id uuid, p_action text, p_comment text DEFAULT NULL)
 RETURNS signage.signage_entries
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'signage', 'pg_temp'
AS $function$
DECLARE
  e signage.signage_entries;
BEGIN
  SELECT * INTO e FROM signage.signage_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '申請が見つかりません' USING ERRCODE = 'P0002';
  END IF;
  IF NOT signage.is_active_admin() AND NOT (
       signage.current_role_kind() = 'management' AND signage.property_reviewable(e.property_code)) THEN
    RAISE EXCEPTION 'この申請を承認・差戻しする権限がありません' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('signage.portal_review', 'on', true);
  IF p_action = 'approve' THEN
    IF e.status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION '承認できるのは申請済み（承認待ち）の申請だけです' USING ERRCODE = '22023';
    END IF;
    UPDATE signage.signage_entries
       SET status = 'ready', review_comment = nullif(btrim(coalesce(p_comment, '')), ''),
           reviewed_by = auth.uid(), reviewed_at = now()
     WHERE id = p_entry_id RETURNING * INTO e;
  ELSIF p_action = 'send_back' THEN
    IF e.status NOT IN ('draft', 'ready') THEN
      RAISE EXCEPTION '差戻しできるのは承認待ち・承認済み（未取込）の申請だけです' USING ERRCODE = '22023';
    END IF;
    IF nullif(btrim(coalesce(p_comment, '')), '') IS NULL THEN
      RAISE EXCEPTION '差戻しの理由を入力してください' USING ERRCODE = '22023';
    END IF;
    UPDATE signage.signage_entries
       SET status = 'pending', review_comment = btrim(p_comment), reviewed_by = auth.uid(), reviewed_at = now()
     WHERE id = p_entry_id RETURNING * INTO e;
  ELSE
    RAISE EXCEPTION '不明な操作です: %', p_action USING ERRCODE = '22023';
  END IF;
  PERFORM set_config('signage.portal_review', 'off', true);
  RETURN e;
END;
$function$;

-- ============================================================
-- 6. 点検報告書
-- ============================================================
CREATE TABLE IF NOT EXISTS signage.signage_inspection_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 業務システムで点検行を消しても報告書は残す（物件・点検種別は写しの列で持つ）
  property_inspection_id uuid REFERENCES biz.property_inspections(id) ON DELETE SET NULL,
  -- 表示・ZIP・ファイル名に使う値は登録時点のものを写して持つ（マスタの名前が変わっても過去の報告書名を変えない）
  property_code text NOT NULL,
  property_name text NOT NULL,
  inspection_type_id uuid,
  inspection_type_label text NOT NULL,
  vendor_id uuid REFERENCES signage.signage_master_vendors(id),
  vendor_name text,
  target_month date CHECK (target_month IS NULL OR extract(day from target_month) = 1),
  performed_on date NOT NULL,
  entry_id uuid REFERENCES signage.signage_entries(id) ON DELETE SET NULL,
  file_name text NOT NULL,
  original_name text,
  size_bytes bigint,
  mime text NOT NULL DEFAULT 'application/pdf',
  content_hash text,
  storage_backend text NOT NULL DEFAULT 'supabase' CHECK (storage_backend IN ('supabase', 'archive')),
  storage_path text NOT NULL,
  -- submitted: 提出（確認待ち）／accepted: 受領／returned: 差戻し／superseded: 再提出で置き換え済み／deleted: 削除（復元可）
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'accepted', 'returned', 'superseded', 'deleted')),
  status_before_delete text,
  note text,
  review_comment text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id),
  -- 階層化（古いものを安いストレージへ移す）用。移した日時と保存期限
  archived_at timestamptz,
  retention_until date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- 先に作った版（NOT NULL・ON DELETE RESTRICT）からの付け替え。新規作成なら何も変わらない
ALTER TABLE signage.signage_inspection_reports ALTER COLUMN property_inspection_id DROP NOT NULL;
ALTER TABLE signage.signage_inspection_reports DROP CONSTRAINT IF EXISTS signage_inspection_reports_property_inspection_id_fkey;
ALTER TABLE signage.signage_inspection_reports ADD CONSTRAINT signage_inspection_reports_property_inspection_id_fkey
  FOREIGN KEY (property_inspection_id) REFERENCES biz.property_inspections(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS signage_inspection_reports_inspection_idx ON signage.signage_inspection_reports (property_inspection_id, target_month);
CREATE INDEX IF NOT EXISTS signage_inspection_reports_performed_idx ON signage.signage_inspection_reports (performed_on);
ALTER TABLE signage.signage_inspection_reports ENABLE ROW LEVEL SECURITY;

-- 報告書を読めるのは、管理者・提出した保守会社（同じ点検の台を受け持つ別の保守会社や、担当を外れた後の新しい保守会社には見せない）・
-- 物件の管理会社
CREATE OR REPLACE FUNCTION signage.report_visible(p_vendor_id uuid, p_property_code text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'signage', 'pg_temp'
AS $function$
  select case signage.current_role_kind()
    when 'admin' then true
    when 'user' then p_vendor_id is not null and p_vendor_id = signage.current_vendor_id()
    when 'management' then signage.property_reviewable(p_property_code)
    else false end;
$function$;

DROP POLICY IF EXISTS "Scoped members can read inspection reports" ON signage.signage_inspection_reports;
CREATE POLICY "Scoped members can read inspection reports" ON signage.signage_inspection_reports
  FOR SELECT TO authenticated USING (signage.report_visible(vendor_id, property_code));
-- 書き込みは RPC（portal_register_report / portal_update_report / portal_review_report）だけ

DROP TRIGGER IF EXISTS audit_trigger ON signage.signage_inspection_reports;
CREATE TRIGGER audit_trigger AFTER INSERT OR DELETE OR UPDATE ON signage.signage_inspection_reports FOR EACH ROW EXECUTE FUNCTION signage.signage_audit_trigger_fn();
DROP TRIGGER IF EXISTS update_signage_inspection_reports_updated_at ON signage.signage_inspection_reports;
CREATE TRIGGER update_signage_inspection_reports_updated_at BEFORE UPDATE ON signage.signage_inspection_reports FOR EACH ROW EXECUTE FUNCTION signage.update_updated_at_column();

-- 報告書を書けるのは、点検の保守会社（台の保守会社を含む）と管理者
CREATE OR REPLACE FUNCTION signage.inspection_writable(p_inspection_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'signage', 'pg_temp'
AS $function$
  select signage.current_role_kind() in ('admin', 'user') and signage.inspection_in_scope(p_inspection_id);
$function$;

-- 同じ物件・年の中で表示名が重なったら _2, _3 … を付ける（DocFlow の ZIP と同じ考え方を保存時に行う）。
-- 置き換え済み（superseded）と削除済みは数えない（再提出した版は元と同じ名前になる）
CREATE OR REPLACE FUNCTION signage.unique_report_file_name(p_property_code text, p_year integer, p_file_name text, p_exclude uuid DEFAULT NULL)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'signage', 'pg_temp'
AS $function$
DECLARE
  base text := regexp_replace(p_file_name, '\.pdf$', '', 'i');
  candidate text := p_file_name;
  n integer := 1;
BEGIN
  WHILE EXISTS (
    SELECT 1 FROM signage.signage_inspection_reports r
    WHERE r.property_code = p_property_code AND extract(year from r.performed_on) = p_year
      AND r.file_name = candidate AND r.status NOT IN ('deleted', 'superseded')
      AND (p_exclude IS NULL OR r.id <> p_exclude)) LOOP
    n := n + 1;
    candidate := base || '_' || n || '.pdf';
  END LOOP;
  RETURN candidate;
END;
$function$;

-- アップロード済みのファイル（Storage）を報告書として登録する。同じ点検・対象月の提出中・差戻し・受領の版は superseded にする
CREATE OR REPLACE FUNCTION signage.portal_register_report(
  p_inspection_id uuid, p_target_month date, p_performed_on date, p_file_name text,
  p_storage_path text, p_original_name text, p_size_bytes bigint, p_content_hash text,
  p_entry_id uuid DEFAULT NULL, p_note text DEFAULT NULL)
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

  -- 置き換えるのは同じ保守会社の版だけ（台ごとに別の保守会社が居る点検で、他社の提出を消さない）
  UPDATE signage.signage_inspection_reports
     SET status = 'superseded'
   WHERE property_inspection_id = p_inspection_id
     AND target_month IS NOT DISTINCT FROM date_trunc('month', coalesce(p_target_month, p_performed_on))::date
     AND vendor_id IS NOT DISTINCT FROM v_vendor
     AND status IN ('submitted', 'returned', 'accepted');

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

-- 提出者（保守会社）・管理者による修正: 実施日・対象月・表示名・メモの修正、削除（論理）と復元
-- p_action: 'edit' | 'delete' | 'restore'
CREATE OR REPLACE FUNCTION signage.portal_update_report(
  p_report_id uuid, p_action text, p_performed_on date DEFAULT NULL, p_target_month date DEFAULT NULL,
  p_file_name text DEFAULT NULL, p_note text DEFAULT NULL)
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
  IF NOT signage.is_active_admin() AND r.status = 'accepted' AND p_action <> 'restore' THEN
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

-- 管理会社・管理者による受領・差戻し。p_action: 'accept' | 'return'（理由必須）
CREATE OR REPLACE FUNCTION signage.portal_review_report(p_report_id uuid, p_action text, p_comment text DEFAULT NULL)
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
  IF NOT signage.is_active_admin() AND NOT (
       signage.current_role_kind() = 'management' AND signage.property_reviewable(r.property_code)) THEN
    RAISE EXCEPTION 'この報告書を確認する権限がありません' USING ERRCODE = '42501';
  END IF;
  IF r.status NOT IN ('submitted', 'accepted', 'returned') THEN
    RAISE EXCEPTION '削除済み・置き換え済みの報告書は確認できません' USING ERRCODE = '22023';
  END IF;
  IF p_action = 'accept' THEN
    UPDATE signage.signage_inspection_reports
       SET status = 'accepted', review_comment = nullif(btrim(coalesce(p_comment, '')), ''), reviewed_by = auth.uid(), reviewed_at = now()
     WHERE id = p_report_id RETURNING * INTO r;
  ELSIF p_action = 'return' THEN
    IF nullif(btrim(coalesce(p_comment, '')), '') IS NULL THEN
      RAISE EXCEPTION '差戻しの理由を入力してください' USING ERRCODE = '22023';
    END IF;
    UPDATE signage.signage_inspection_reports
       SET status = 'returned', review_comment = btrim(p_comment), reviewed_by = auth.uid(), reviewed_at = now()
     WHERE id = p_report_id RETURNING * INTO r;
  ELSE
    RAISE EXCEPTION '不明な操作です: %', p_action USING ERRCODE = '22023';
  END IF;
  RETURN r;
END;
$function$;

-- ============================================================
-- 7. Storage: 非公開バケット inspection-reports（PDF・50MB）
-- 置き場所は {property_inspection_id}/{uuid}.pdf。読むのは範囲内のアカウント、置くのは保守会社と管理者。
-- 上書き・削除は管理者だけ（利用者の削除は表の論理削除）
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('inspection-reports', 'inspection-reports', false, 52428800, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION signage.report_object_inspection_id(p_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
BEGIN
  IF p_name LIKE '%..%' THEN RETURN NULL; END IF;
  RETURN split_part(p_name, '/', 1)::uuid;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN NULL;
END;
$function$;

-- オブジェクトを読めるのは、それを保存先に持つ報告書を読める人（登録前・登録に失敗したファイルは管理者だけ）
CREATE OR REPLACE FUNCTION signage.report_object_visible(p_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'signage', 'pg_temp'
AS $function$
  select signage.is_active_admin() or exists (
    select 1 from signage.signage_inspection_reports r
    where r.storage_path = p_name and signage.report_visible(r.vendor_id, r.property_code));
$function$;

DROP POLICY IF EXISTS "inspection_reports_select" ON storage.objects;
CREATE POLICY "inspection_reports_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'inspection-reports' AND signage.report_object_visible(name));
DROP POLICY IF EXISTS "inspection_reports_insert" ON storage.objects;
CREATE POLICY "inspection_reports_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'inspection-reports' AND signage.inspection_writable(signage.report_object_inspection_id(name)));
DROP POLICY IF EXISTS "inspection_reports_admin_update" ON storage.objects;
CREATE POLICY "inspection_reports_admin_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'inspection-reports' AND signage.is_active_admin());
DROP POLICY IF EXISTS "inspection_reports_admin_delete" ON storage.objects;
CREATE POLICY "inspection_reports_admin_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'inspection-reports' AND signage.is_active_admin());

-- ============================================================
-- 8. 実行権限
-- ============================================================
REVOKE ALL ON FUNCTION signage.portal_inspections() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION signage.portal_entries() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION signage.portal_review_entry(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION signage.portal_register_report(uuid, date, date, text, text, text, bigint, text, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION signage.portal_update_report(uuid, text, date, date, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION signage.portal_review_report(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION signage.management_companies_master() FROM PUBLIC, anon;
-- 補助関数（RLS・ポリシー・RPC の中で使う）。anon からは呼ばせない。unique_report_file_name は RPC の中だけで使う
REVOKE ALL ON FUNCTION signage.current_role_kind() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION signage.current_management_company_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION signage.inspection_in_scope(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION signage.property_reviewable(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION signage.inspection_writable(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION signage.report_visible(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION signage.report_object_visible(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION signage.report_object_inspection_id(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION signage.unique_report_file_name(text, integer, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION signage.current_role_kind() TO authenticated;
GRANT EXECUTE ON FUNCTION signage.current_management_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION signage.inspection_in_scope(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION signage.property_reviewable(text) TO authenticated;
GRANT EXECUTE ON FUNCTION signage.inspection_writable(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION signage.report_visible(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION signage.report_object_visible(text) TO authenticated;
GRANT EXECUTE ON FUNCTION signage.report_object_inspection_id(text) TO authenticated;
GRANT EXECUTE ON FUNCTION signage.portal_inspections() TO authenticated;
GRANT EXECUTE ON FUNCTION signage.portal_entries() TO authenticated;
GRANT EXECUTE ON FUNCTION signage.portal_review_entry(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION signage.portal_register_report(uuid, date, date, text, text, text, bigint, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION signage.portal_update_report(uuid, text, date, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION signage.portal_review_report(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION signage.management_companies_master() TO authenticated;
GRANT SELECT ON signage.signage_inspection_reports TO authenticated;

-- ============================================================
-- 戻し手順（逆順。management ロールのユーザーが居る場合は先に role を戻す）
-- ============================================================
-- DROP POLICY inspection_reports_select / _insert / _admin_update / _admin_delete ON storage.objects;
-- （バケット inspection-reports は中身を確認してから削除）
-- DROP FUNCTION signage.portal_review_report, portal_update_report, portal_register_report, unique_report_file_name,
--   report_object_visible, report_visible,
--   inspection_writable, report_object_inspection_id, portal_review_entry, portal_entries, portal_inspections,
--   management_companies_master, property_reviewable, inspection_in_scope, current_role_kind, current_management_company_id;
-- DROP TABLE signage.signage_inspection_reports;
-- DROP TRIGGER guard_entry_portal_columns / guard_entry_management_delete ON signage.signage_entries; DROP FUNCTION 同名;
-- guard_entry_approval_flow と guard_profile_privileged_columns は本ファイル冒頭コメントの差分（portal_review の分岐・management_company_id）を除いた版へ戻す
-- ALTER TABLE signage.signage_entries DROP COLUMN property_inspection_id, vendor_id, target_month, review_comment, reviewed_by, reviewed_at;
-- is_active_member は role 条件（IN ('admin','user')）を外した版へ戻す
-- ALTER TABLE signage.signage_profiles DROP CONSTRAINT signage_profiles_management_company_check;
-- ALTER TABLE signage.signage_profiles DROP COLUMN management_company_id; role CHECK を ('admin','user') へ
