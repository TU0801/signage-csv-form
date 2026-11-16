-- 修正依頼1115 (5) の DB 部分: 保守会社タブの既定 TPL・緊急連絡先を管理会社ごとに上書きし、申請の初期値と DB の TPL 照合に効かせる
-- 2026-11-16 作成。本番へは未適用（適用はユーザー承認後）。ローカル DB（signage-v2-verify）で確かめた（scripts/test-fix-1115-vendor-overrides.sql）。
--
-- 目的（ユーザー決定 2026-11-16 の (5)）:
--   管理会社ログインのマスター管理「保守会社」タブを「保守会社 × 紐付けた点検種別」の行にし、既定の点検 TPL と貼紙を出す。
--   管理会社は自社用に「緊急連絡先」と「点検 TPL（既存のテンプレート biz.template_images から選ぶ）」を上書きでき、「既定に戻す」で消せる。
--   上書きは、その管理会社が管理する物件への申請（保守会社・管理会社・管理者の 1件入力・一括入力・点検一覧の申請）の初期値になる。
--   DB の TPL 照合（guard_entry_type_scope と portal_update_submitted_entry）は、種別の既定 TPL に加えて
--   「物件の管理会社 × 申請の受注先の保守会社 × 点検種別」の上書き TPL だけを許す（任意の TPL は今までどおり断る）。
--   緊急連絡先は DB で強制しない（今までどおり申請の値のまま。要件2の「空なら既定」もそのまま）。
--
-- 変えるもの（関数の変えた箇所は本文に「[1115(5)]」の印。それ以外は fix-1115-mgmt-entry.sql の版〔印 [1115(2)]〕のまま）:
--   新設  表 signage.signage_mgmt_vendor_overrides           管理会社 × 保守会社 × 点検種別の上書き（種別 NULL の行は緊急連絡先、種別ありの行は TPL）
--         一意: (management_company_id, vendor_id, inspection_type_id) NULLS NOT DISTINCT
--         RLS: 管理者は全件、管理会社は自社の行だけ SELECT/INSERT/UPDATE/DELETE。保守会社は直接読めない（entry_vendor_defaults 経由）
--         トリガー guard_mgmt_vendor_override: updated_by・updated_at を DB が決める、キーの付け替えを断る、TPL は実在するものだけ
--         監査: signage_audit_trigger_fn（ほかの表と同じ）
--   新設  signage.vendor_override_template_allowed(text, uuid, text, text)  上書き TPL か（内部用。利用者は実行できない）
--   新設  signage.mgmt_vendor_defaults()                    管理会社の保守会社タブ用（既定と自社の上書き）
--   新設  signage.entry_vendor_defaults(text)               申請画面用（物件の管理会社の上書き。見られない物件の分は返さない）
--   置換  signage.guard_entry_type_scope()                  (1)(3) の TPL 照合に上書き TPL を許す
--   置換  signage.portal_update_submitted_entry(uuid, jsonb)  TPL 照合に上書き TPL を許す
--   変えないもの: guard_entry_portal_columns（受注先・緊急連絡先の扱い）、guard_entry_approval_flow、signage_master_vendors、
--     signage_vendor_inspections、portal_review_*。承認者の編集（画面 PendingEntryEditModal。signage_entries を直接 UPDATE）は
--     種別を変えなければ申請の TPL のまま、変えたら種別の既定 TPL を書く（上書きは当てない。種別の既定はこの SQL の後も通る）。
--
-- 土台: 置換した2関数は fix-1115-mgmt-entry.sql の版（その土台は本番の現行定義。2026-11-16 に Management API の SELECT で
--   本番の定義が fix-1115-mgmt-entry-rollback.sql の本文と同じであることを確かめた）。ローカル DB の定義が mgmt-entry の版と
--   一致することを確かめてから当てた。両方の印（[1115(2)] と [1115(5)]）が残ることを試験で確かめる。
--
-- 適用方法: ファイル全体を1つのクエリとして流す（Management API なら1回の query に全文を入れる。psql なら psql -1 -f）。
--   BEGIN/COMMIT は付けない。何度流しても同じ結果になる（CREATE TABLE IF NOT EXISTS・CREATE OR REPLACE・DROP POLICY/TRIGGER IF EXISTS）。
-- 適用順: fix-1115-templates.sql → fix-1115-poster-library.sql → fix-1115-mgmt-entry.sql → この SQL。
--   加算的な変更なので「DDL → デプロイ」（今の画面は新しい表・RPC を読まないので、先に当てても誤動作しない）。
--   適用後に has_function_privilege で確かめる: vendor_override_template_allowed は authenticated が false、
--   mgmt_vendor_defaults・entry_vendor_defaults は authenticated が true・anon が false。
--
-- 戻し手順: scripts/fix-1115-vendor-overrides-rollback.sql を流す（2関数を fix-1115-mgmt-entry.sql の版に戻し、足した関数・表を消す）。
--   表を消すと管理会社の上書きは失われる（申請済みの行の TPL・連絡先は残る）。画面も前の版に戻す
--   （戻さないと保守会社タブが読み込めない）。mgmt-entry まで戻すときは、この戻しを先に流す。

SET lock_timeout = '5s';

-- ============================================================
-- 1. 表 signage.signage_mgmt_vendor_overrides
-- ============================================================
CREATE TABLE IF NOT EXISTS signage.signage_mgmt_vendor_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  management_company_id uuid NOT NULL REFERENCES biz.companies(id) ON DELETE CASCADE,
  -- 保守会社が業務システムから消えたら（同期で signage_master_vendors から delete）上書きも消す
  vendor_id uuid NOT NULL REFERENCES signage.signage_master_vendors(id) ON DELETE CASCADE,
  -- NULL = 保守会社単位（緊急連絡先）。id は biz.inspection_types と同じ（同期トリガー sync_inspection_type_to_signage）
  inspection_type_id uuid REFERENCES signage.signage_master_inspection_types(id) ON DELETE CASCADE,
  emergency_contact text,
  template_no text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- 1行に持つ上書きは1つ: 種別 NULL の行は緊急連絡先だけ、種別ありの行は TPL だけ（「既定に戻す」は行の DELETE）
  CONSTRAINT signage_mgmt_vendor_overrides_kind_check CHECK (
    (inspection_type_id IS NULL AND template_no IS NULL AND emergency_contact IS NOT NULL)
    OR (inspection_type_id IS NOT NULL AND emergency_contact IS NULL AND template_no IS NOT NULL)),
  CONSTRAINT signage_mgmt_vendor_overrides_contact_check CHECK (
    emergency_contact IS NULL OR length(btrim(emergency_contact)) BETWEEN 1 AND 50),
  CONSTRAINT signage_mgmt_vendor_overrides_template_check CHECK (
    template_no IS NULL OR length(btrim(template_no)) BETWEEN 1 AND 200)
);

-- 一意: 管理会社 × 保守会社 × 点検種別（種別 NULL の行も1社1行）
CREATE UNIQUE INDEX IF NOT EXISTS signage_mgmt_vendor_overrides_key
  ON signage.signage_mgmt_vendor_overrides (management_company_id, vendor_id, inspection_type_id) NULLS NOT DISTINCT;
CREATE INDEX IF NOT EXISTS signage_mgmt_vendor_overrides_vendor_idx
  ON signage.signage_mgmt_vendor_overrides (vendor_id);

ALTER TABLE signage.signage_mgmt_vendor_overrides ENABLE ROW LEVEL SECURITY;

-- 権限は明示する（既定の権限に頼らない）。anon・PUBLIC には何も渡さない。保守会社は RLS で0行（entry_vendor_defaults 経由で読む）
REVOKE ALL ON TABLE signage.signage_mgmt_vendor_overrides FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE signage.signage_mgmt_vendor_overrides TO authenticated;
GRANT ALL ON TABLE signage.signage_mgmt_vendor_overrides TO service_role;

-- 管理者は全件、管理会社は自社の行だけ（貼紙ライブラリと同じ形）
DROP POLICY IF EXISTS mgmt_vendor_overrides_select ON signage.signage_mgmt_vendor_overrides;
CREATE POLICY mgmt_vendor_overrides_select ON signage.signage_mgmt_vendor_overrides
  FOR SELECT TO authenticated
  USING (signage.is_active_admin()
         OR (signage.is_active_management() AND management_company_id = signage.current_management_company_id()));
DROP POLICY IF EXISTS mgmt_vendor_overrides_insert ON signage.signage_mgmt_vendor_overrides;
CREATE POLICY mgmt_vendor_overrides_insert ON signage.signage_mgmt_vendor_overrides
  FOR INSERT TO authenticated
  WITH CHECK (signage.is_active_admin()
              OR (signage.is_active_management() AND management_company_id = signage.current_management_company_id()));
DROP POLICY IF EXISTS mgmt_vendor_overrides_update ON signage.signage_mgmt_vendor_overrides;
CREATE POLICY mgmt_vendor_overrides_update ON signage.signage_mgmt_vendor_overrides
  FOR UPDATE TO authenticated
  USING (signage.is_active_admin()
         OR (signage.is_active_management() AND management_company_id = signage.current_management_company_id()))
  WITH CHECK (signage.is_active_admin()
              OR (signage.is_active_management() AND management_company_id = signage.current_management_company_id()));
DROP POLICY IF EXISTS mgmt_vendor_overrides_delete ON signage.signage_mgmt_vendor_overrides;
CREATE POLICY mgmt_vendor_overrides_delete ON signage.signage_mgmt_vendor_overrides
  FOR DELETE TO authenticated
  USING (signage.is_active_admin()
         OR (signage.is_active_management() AND management_company_id = signage.current_management_company_id()));

-- 行の確かめ（BEFORE INSERT/UPDATE）。管理会社は biz を読めないので SECURITY DEFINER で引く
CREATE OR REPLACE FUNCTION signage.guard_mgmt_vendor_override()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'pg_temp'
AS $function$
BEGIN
  -- 管理会社が会社を省いたら自社（RLS の WITH CHECK はこの後の行で判定する）
  IF TG_OP = 'INSERT' AND NEW.management_company_id IS NULL THEN
    NEW.management_company_id := signage.current_management_company_id();
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.management_company_id IS DISTINCT FROM OLD.management_company_id
                           OR NEW.vendor_id IS DISTINCT FROM OLD.vendor_id
                           OR NEW.inspection_type_id IS DISTINCT FROM OLD.inspection_type_id) THEN
    RAISE EXCEPTION '管理会社・保守会社・点検種別は変えられません（既定に戻してから設定し直してください）' USING ERRCODE = '22023';
  END IF;
  NEW.emergency_contact := nullif(btrim(NEW.emergency_contact), '');
  NEW.template_no := nullif(btrim(NEW.template_no), '');
  -- TPL は実在するものだけ（点検種別の TPL か、業務システムのテンプレート画像）
  IF NEW.template_no IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM biz.template_images ti WHERE ti.image_key = NEW.template_no)
     AND NOT EXISTS (SELECT 1 FROM biz.inspection_types t WHERE t.template_no = NEW.template_no) THEN
    RAISE EXCEPTION 'このテンプレートNoは登録されていません: %', NEW.template_no USING ERRCODE = '22023';
  END IF;
  -- 誰が・いつ は DB が決める
  NEW.updated_by := auth.uid();
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' THEN
    NEW.created_at := OLD.created_at;
  ELSE
    NEW.created_at := now();
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION signage.guard_mgmt_vendor_override() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_mgmt_vendor_override ON signage.signage_mgmt_vendor_overrides;
CREATE TRIGGER guard_mgmt_vendor_override
  BEFORE INSERT OR UPDATE ON signage.signage_mgmt_vendor_overrides
  FOR EACH ROW EXECUTE FUNCTION signage.guard_mgmt_vendor_override();

DROP TRIGGER IF EXISTS audit_trigger ON signage.signage_mgmt_vendor_overrides;
CREATE TRIGGER audit_trigger
  AFTER INSERT OR DELETE OR UPDATE ON signage.signage_mgmt_vendor_overrides
  FOR EACH ROW EXECUTE FUNCTION signage.signage_audit_trigger_fn();

-- ============================================================
-- 2. 上書き TPL の判定（内部用。guard_entry_type_scope と portal_update_submitted_entry から呼ぶ）
-- ============================================================
-- 物件（物件コードの -00 の揺れは property_reviewable と同じ規則）の管理会社 × 保守会社 × 点検種別（名前）の上書き TPL と一致するか
CREATE OR REPLACE FUNCTION signage.vendor_override_template_allowed(p_property_code text, p_vendor_id uuid,
  p_inspection_type text, p_template_no text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'pg_temp'
AS $function$
  select coalesce(btrim(p_template_no), '') <> '' and p_vendor_id is not null and exists (
    select 1
      from signage.signage_mgmt_vendor_overrides o
      join biz.properties b on b.management_company_id = o.management_company_id
      join signage.signage_master_properties s on s.id = b.signage_property_id
      join biz.inspection_types t on t.id = o.inspection_type_id
     where regexp_replace(s.property_code, '-00$', '') = regexp_replace(btrim(p_property_code), '-00$', '')
       and o.vendor_id = p_vendor_id
       and t.label = p_inspection_type
       and o.template_no = p_template_no);
$function$;

REVOKE ALL ON FUNCTION signage.vendor_override_template_allowed(text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION signage.vendor_override_template_allowed(text, uuid, text, text) TO service_role;

-- ============================================================
-- 3. 管理会社の保守会社タブ用: signage.mgmt_vendor_defaults()
-- ============================================================
-- 行: 保守会社 × 紐付けた点検種別（signage_vendor_inspections の active）＋上書きだけ残っている種別。
-- 紐付けも上書きも無い保守会社は種別 NULL の1行。緊急連絡先の上書き（種別 NULL の行）はその保守会社の全行に付ける。
-- 有効な管理会社にだけ返す（ほかは0行）
CREATE OR REPLACE FUNCTION signage.mgmt_vendor_defaults()
 RETURNS TABLE(vendor_id uuid, vendor_name text, default_emergency_contact text,
               inspection_type_id uuid, inspection_type_label text, default_template_no text,
               contact_override_id uuid, emergency_contact text,
               template_override_id uuid, template_no text, updated_at timestamptz)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'pg_temp'
AS $function$
  with me as (
    select signage.current_management_company_id() as mc where signage.is_active_management()
  ),
  ov as (
    select o.* from signage.signage_mgmt_vendor_overrides o, me where o.management_company_id = me.mc
  ),
  pairs as (
    select vi.vendor_id, vi.inspection_id as type_id
      from signage.signage_vendor_inspections vi, me
     where vi.status = 'active'
    union
    select ov.vendor_id, ov.inspection_type_id from ov where ov.inspection_type_id is not null
  ),
  rows_ as (
    select v.id as vid, p.type_id
      from signage.signage_master_vendors v
      join pairs p on p.vendor_id = v.id
    union all
    select v.id, null::uuid
      from signage.signage_master_vendors v, me
     where not exists (select 1 from pairs p where p.vendor_id = v.id)
  )
  select v.id, v.vendor_name, v.emergency_contact,
         r.type_id, coalesce(bt.label, it.inspection_name), coalesce(bt.template_no, it.template_no),
         oc.id, oc.emergency_contact,
         otp.id, otp.template_no,
         greatest(oc.updated_at, otp.updated_at)
    from rows_ r
    join signage.signage_master_vendors v on v.id = r.vid
    left join signage.signage_master_inspection_types it on it.id = r.type_id
    left join biz.inspection_types bt on bt.id = r.type_id
    left join ov oc on oc.vendor_id = r.vid and oc.inspection_type_id is null
    left join ov otp on otp.vendor_id = r.vid and otp.inspection_type_id = r.type_id
   order by v.vendor_name, it.sort_order nulls last, coalesce(bt.label, it.inspection_name) nulls first;
$function$;

REVOKE ALL ON FUNCTION signage.mgmt_vendor_defaults() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION signage.mgmt_vendor_defaults() TO authenticated, service_role;

-- ============================================================
-- 4. 申請画面用: signage.entry_vendor_defaults(p_property_code text DEFAULT NULL)
-- ============================================================
-- 物件の管理会社の上書きを返す。p_property_code が NULL なら見られる物件全部（一括入力用。1回で読む）。
-- 返す形（jsonb。物件が多くても PostgREST の行数上限に掛からない）:
--   {"properties": {"<物件コード>": "<管理会社 id>", ...},   … 上書きのある管理会社の物件だけ
--    "overrides": [{"management_company_id", "vendor_id", "inspection_type_id", "emergency_contact", "template_no"}, ...]}
-- 見られる物件は poster_library_for_property と同じ: 管理者は全部、管理会社は自社が管理する物件、保守会社は紐付け（active）か
-- 担当の点検（台の保守を含む）がある物件。保守会社には自社の分の上書きだけを返す。無効・プロファイルの無いアカウントは空
CREATE OR REPLACE FUNCTION signage.entry_vendor_defaults(p_property_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'pg_temp'
AS $function$
  with caller as (
    select signage.is_active_admin() as is_admin,
           coalesce(signage.is_active_management(), false) as is_mgmt,
           signage.current_management_company_id() as mc,
           case when signage.current_role_kind() = 'user' then signage.current_vendor_id() end as vendor
  ),
  props as (
    select sp.property_code, bp.id as biz_property_id, bp.management_company_id
      from signage.signage_master_properties sp
      join biz.properties bp on bp.signage_property_id = sp.id
     where bp.management_company_id is not null
       and (p_property_code is null
            or regexp_replace(sp.property_code, '-00$', '') = regexp_replace(btrim(p_property_code), '-00$', ''))
  ),
  visible as (
    select p.*
      from props p, caller c
     where c.is_admin
        or (c.is_mgmt and p.management_company_id = c.mc)
        or (c.vendor is not null and (
              exists (select 1 from signage.signage_building_vendors bv
                       where bv.property_code = p.property_code and bv.vendor_id = c.vendor and bv.status = 'active')
           or exists (select 1 from biz.property_inspections pi
                       where pi.property_id = p.biz_property_id
                         and (pi.maintainer_id = c.vendor
                              or exists (select 1 from biz.property_unit_inspections ui
                                           join biz.property_units u on u.id = ui.unit_id
                                          where u.property_id = pi.property_id
                                            and ui.inspection_type_id = pi.inspection_type_id
                                            and ui.maintainer_id = c.vendor)))))
  ),
  ov as (
    select o.management_company_id, o.vendor_id, o.inspection_type_id, o.emergency_contact, o.template_no
      from signage.signage_mgmt_vendor_overrides o, caller c
     where o.management_company_id in (select management_company_id from visible)
       and (c.vendor is null or o.vendor_id = c.vendor)
       and (c.is_admin or c.is_mgmt or c.vendor is not null)
  )
  select jsonb_build_object(
    'properties', coalesce((select jsonb_object_agg(v.property_code, v.management_company_id)
                              from visible v
                             where v.management_company_id in (select management_company_id from ov)), '{}'::jsonb),
    'overrides', coalesce((select jsonb_agg(jsonb_build_object(
                              'management_company_id', ov.management_company_id, 'vendor_id', ov.vendor_id,
                              'inspection_type_id', ov.inspection_type_id, 'emergency_contact', ov.emergency_contact,
                              'template_no', ov.template_no)
                            order by ov.management_company_id, ov.vendor_id, ov.inspection_type_id nulls first)
                             from ov), '[]'::jsonb));
$function$;

REVOKE ALL ON FUNCTION signage.entry_vendor_defaults(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION signage.entry_vendor_defaults(text) TO authenticated, service_role;

-- ============================================================
-- 5. signage.guard_entry_type_scope()（トリガー）: fix-1115-mgmt-entry.sql の版 ＋ [1115(5)]
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
  v_ovr_vendor uuid;  -- [1115(5)] 管理会社ごとの上書き TPL を引く保守会社
BEGIN
  IF auth.uid() IS NULL OR signage.is_active_admin() THEN
    RETURN NEW;
  END IF;
  -- [1115(5)] 上書き TPL は「物件の管理会社 × 申請の受注先の保守会社 × 点検種別」で引く。受注先は DB が記録する会社
  -- （管理会社の申請は先に発火する guard_entry_portal_columns が点検行・台の保守会社に決めている。保守会社の申請で vendor_id が空なら自社）
  v_ovr_vendor := coalesce(NEW.vendor_id, signage.current_vendor_id());
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
    -- [1115(5)] 種別の既定 TPL に加えて、管理会社ごとの上書き TPL（vendor_override_template_allowed）も許す
    IF COALESCE(NEW.template_no, '') <> '' AND NEW.template_no IS DISTINCT FROM v_template
       AND NOT coalesce(signage.vendor_override_template_allowed(NEW.property_code, v_ovr_vendor, NEW.inspection_type, NEW.template_no), false) THEN
      RAISE EXCEPTION 'テンプレートNoが点検種別と一致しません' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- (2) 点検種別を変えるときは、自社がその物件で担当する点検種別だけ
  -- [1115(2)] 変えた箇所: 管理会社は「自社が管理する物件にその点検種別の点検があること」（保守会社は問わない）。
  -- 保守会社の確かめ（ELSIF 以降）は本番の現行定義のまま。要件5（TPL の上書き）もこの関数を変えるので、土台はこの版にする
  -- （要件5 は fix-1115-vendor-overrides.sql がこの版を土台に (1)(3) の TPL 照合だけを変えた。印 [1115(5)]）
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
    -- [1115(5)] 種別の既定 TPL に加えて、管理会社ごとの上書き TPL（vendor_override_template_allowed）も許す
    IF COALESCE(NEW.template_no, '') <> '' AND NEW.template_no IS DISTINCT FROM v_template
       AND NOT coalesce(signage.vendor_override_template_allowed(NEW.property_code, v_ovr_vendor, NEW.inspection_type, NEW.template_no), false) THEN
      RAISE EXCEPTION 'テンプレートNoが点検種別と一致しません' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;


-- トリガー関数は利用者が直接呼ぶものではない（発火に EXECUTE 権限は要らない）
REVOKE ALL ON FUNCTION signage.guard_entry_type_scope() FROM PUBLIC, anon;

-- ============================================================
-- 6. signage.portal_update_submitted_entry(uuid, jsonb): fix-1115-mgmt-entry.sql の版 ＋ [1115(5)]
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
  v_ovr_vendor uuid;  -- [1115(5)] 管理会社ごとの上書き TPL を引く保守会社
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
    -- [1115(5)] 種別の既定 TPL に加えて、管理会社ごとの上書き TPL も許す。引く保守会社は、管理会社の申請なら下で決め直す
    -- 受注先（点検行・台の保守会社。ここでは断らずに引くだけ。未登録の断りは下の entry_vendor_for_management）、それ以外は申請の受注先
    IF v_mgmt AND n.property_inspection_id IS NOT NULL THEN
      IF n.property_unit_id IS NOT NULL THEN
        SELECT x.vendor_id INTO v_ovr_vendor
          FROM signage.inspection_unit_vendor(n.property_inspection_id, n.property_unit_id) x WHERE x.is_unit;
      ELSE
        SELECT pi.maintainer_id INTO v_ovr_vendor FROM biz.property_inspections pi WHERE pi.id = n.property_inspection_id;
      END IF;
    ELSE
      v_ovr_vendor := coalesce(e.vendor_id, v_vendor);
    END IF;
    IF (COALESCE(v_template, '') = '' OR n.template_no IS DISTINCT FROM v_template)
       AND NOT coalesce(signage.vendor_override_template_allowed(e.property_code, v_ovr_vendor, n.inspection_type, n.template_no), false) THEN
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

NOTIFY pgrst, 'reload schema';
