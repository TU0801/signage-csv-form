-- 修正依頼1024 担当 approval: 建物追加申請（B17）
-- 2026-10-24 作成。本番へは未適用（適用はユーザー承認後）。
-- 適用方法: Management API で1文ずつ流す（BEGIN/COMMIT を付けない）。
-- すべて追加（新しい表・ポリシー・関数）。既存の表・関数・ポリシーは変えない。何度流しても同じ結果になる。
-- 追加登録された画像（C1）は既存の列と公開バケットで足りるので DB 変更なし。

-- ============================================================
-- 1. 新規建物の申請
-- ============================================================
-- 点検登録フォームに無い建物を保守会社が申請し、管理者が承認時に物件コードを入れると業務システム（biz）に物件ができる。
-- 点検種別 id は biz.inspection_types の id（signage_master_inspection_types と同じ値。本番 170/170 一致を確認）
CREATE TABLE IF NOT EXISTS signage.signage_property_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES signage.signage_master_vendors(id) ON DELETE CASCADE,
  management_company_id uuid NOT NULL REFERENCES biz.companies(id),
  property_name text NOT NULL,
  address text,
  inspection_type_id uuid REFERENCES biz.inspection_types(id) ON DELETE SET NULL,
  inspection_months integer[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending',
  requested_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  reject_reason text,
  created_property_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT signage_property_requests_status_check CHECK (status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT signage_property_requests_name_check CHECK (btrim(property_name) <> '' AND char_length(property_name) <= 200),
  CONSTRAINT signage_property_requests_address_check CHECK (address IS NULL OR char_length(address) <= 300),
  -- 点検月は 1〜12。点検月だけでは点検行を作れないので、点検月があるなら点検種別も要る
  CONSTRAINT signage_property_requests_months_check CHECK (
    inspection_months <@ ARRAY[1,2,3,4,5,6,7,8,9,10,11,12]
    AND (cardinality(inspection_months) = 0 OR inspection_type_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS signage_property_requests_status_idx ON signage.signage_property_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS signage_property_requests_requested_by_idx ON signage.signage_property_requests (requested_by);

ALTER TABLE signage.signage_property_requests ENABLE ROW LEVEL SECURITY;

-- 申請できるのは管理者と、自社の保守会社として pending で出す本人（管理会社アカウントは vendor_id が無いので通らない）
DROP POLICY IF EXISTS "property_requests_insert" ON signage.signage_property_requests;
CREATE POLICY "property_requests_insert" ON signage.signage_property_requests FOR INSERT TO authenticated
  WITH CHECK (signage.is_active_admin()
              OR (signage.is_active_member()
                  AND vendor_id = signage.current_vendor_id()
                  AND status = 'pending'
                  AND requested_by = auth.uid()));
-- 読めるのは管理者と申請した本人（insert(...).select() の RETURNING にもこの条件が掛かる）
DROP POLICY IF EXISTS "property_requests_select" ON signage.signage_property_requests;
CREATE POLICY "property_requests_select" ON signage.signage_property_requests FOR SELECT TO authenticated
  USING (signage.is_active_admin() OR (requested_by = auth.uid() AND signage.is_active_member()));
-- UPDATE・DELETE のポリシーは作らない（承認・却下は下の RPC だけ）

-- 列の権限: 申請者が書けるのは申請の中身だけ（status・審査の列・作った物件コードは書かせない）
REVOKE ALL ON signage.signage_property_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON signage.signage_property_requests TO authenticated;
GRANT INSERT (vendor_id, management_company_id, property_name, address, inspection_type_id, inspection_months)
  ON signage.signage_property_requests TO authenticated;
GRANT ALL ON signage.signage_property_requests TO service_role;

DROP TRIGGER IF EXISTS audit_trigger ON signage.signage_property_requests;
CREATE TRIGGER audit_trigger AFTER INSERT OR DELETE OR UPDATE ON signage.signage_property_requests
  FOR EACH ROW EXECUTE FUNCTION signage.signage_audit_trigger_fn();
DROP TRIGGER IF EXISTS update_signage_property_requests_updated_at ON signage.signage_property_requests;
CREATE TRIGGER update_signage_property_requests_updated_at BEFORE UPDATE ON signage.signage_property_requests
  FOR EACH ROW EXECUTE FUNCTION signage.update_updated_at_column();

-- 申請の中身の確認（列の CHECK で書けないもの）: 管理会社は管理会社の会社・点検種別は有効なもの
CREATE OR REPLACE FUNCTION signage.guard_property_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'pg_temp'
AS $function$
BEGIN
  NEW.property_name := btrim(NEW.property_name);
  NEW.address := nullif(btrim(coalesce(NEW.address, '')), '');
  IF NOT EXISTS (SELECT 1 FROM biz.companies c WHERE c.id = NEW.management_company_id AND c.is_management_company AND c.active) THEN
    RAISE EXCEPTION '管理会社を選んでください' USING ERRCODE = '22023';
  END IF;
  IF NEW.inspection_type_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM biz.inspection_types t WHERE t.id = NEW.inspection_type_id AND t.active) THEN
    RAISE EXCEPTION '点検種別が見つかりません' USING ERRCODE = '22023';
  END IF;
  NEW.inspection_months := array(SELECT DISTINCT m FROM unnest(NEW.inspection_months) m ORDER BY m);
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS guard_property_request ON signage.signage_property_requests;
CREATE TRIGGER guard_property_request BEFORE INSERT ON signage.signage_property_requests
  FOR EACH ROW EXECUTE FUNCTION signage.guard_property_request();

-- ============================================================
-- 2. 申請モーダルの管理会社の候補（管理者以外にも id と名前だけ返す）
-- ============================================================
CREATE OR REPLACE FUNCTION signage.management_companies_for_request()
 RETURNS TABLE(id uuid, name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'pg_temp'
AS $function$
  select c.id, c.name from biz.companies c
  where c.is_management_company and c.active and signage.is_active_member()
  order by c.name;
$function$;

-- ============================================================
-- 2b. 申請モーダルの点検種別の候補（有効な点検種別だけ）
-- ============================================================
-- signage_master_inspection_types には有効/無効の列が無く、無効にした点検種別も残る。guard_property_request は
-- 無効な点検種別を断るので、候補と既定（先頭）から外す。保守会社に有効な紐付けがあればその点検種別、
-- 無ければ有効な点検種別すべて（linked=false）。並びは点検種別マスターの取得と同じ（sort → template_no → 名前）
CREATE OR REPLACE FUNCTION signage.inspection_type_options_for_request(p_vendor_id uuid)
 RETURNS TABLE(id uuid, name text, linked boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'pg_temp'
AS $function$
  with linked as (
    select t.id, t.label, t.sort, t.template_no
    from biz.inspection_types t
    where t.active
      and exists (select 1 from signage.signage_vendor_inspections vi
                  where vi.vendor_id = p_vendor_id and vi.inspection_id = t.id and vi.status = 'active')
  ), opts as (
    select l.id, l.label, l.sort, l.template_no, true as linked from linked l
    union all
    select t.id, t.label, t.sort, t.template_no, false
    from biz.inspection_types t
    where t.active and not exists (select 1 from linked)
  )
  select o.id, o.label, o.linked from opts o
  where signage.is_active_member()
  order by o.sort, o.template_no, o.label;
$function$;

-- ============================================================
-- 3. 承認・却下（管理者だけ）
-- ============================================================
-- 承認: 物件コードを決めて biz.properties を作る（トリガー biz.sync_property_to_signage が signage の物件を作る）→
-- 保守会社の紐付け（active）→ 点検種別があれば点検行（保守会社＝申請の保守会社、点検月は空でもよい）→ 申請を approved。
-- 物件種別は点検だけの物件（kind='inspection'）、請求対象外（billable=false。本番の点検物件 98 件中 97 件と同じ）。
-- owner が postgres の SECURITY DEFINER なので、biz 側の guard_* と block_property_direct_write は通る
CREATE OR REPLACE FUNCTION signage.approve_property_request(p_id uuid, p_property_code text)
 RETURNS signage.signage_property_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'pg_temp'
AS $function$
DECLARE
  r signage.signage_property_requests;
  v_code text := btrim(coalesce(p_property_code, ''));
  v_norm text;
  v_property_id uuid;
BEGIN
  IF NOT signage.is_active_admin() THEN
    RAISE EXCEPTION '建物追加の申請を承認する権限がありません' USING ERRCODE = '42501';
  END IF;
  -- 本番の物件コード 254 件はすべてこの形（例 120074-00 / r0001A01）
  IF v_code !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$' THEN
    RAISE EXCEPTION '物件コードは英数字・ハイフン・アンダーバーの32文字以内で入力してください' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO r FROM signage.signage_property_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '申請が見つかりません' USING ERRCODE = 'P0002';
  END IF;
  IF r.status <> 'pending' THEN
    RAISE EXCEPTION 'この申請は処理済みです' USING ERRCODE = '22023';
  END IF;

  -- 120410 と 120410-00 は同じ物件として扱う（property_reviewable・画面の normalizePropertyCode と同じ規則）
  v_norm := regexp_replace(v_code, '-00$', '');
  IF EXISTS (SELECT 1 FROM signage.signage_master_properties s WHERE regexp_replace(s.property_code, '-00$', '') = v_norm)
     OR EXISTS (SELECT 1 FROM biz.properties b WHERE regexp_replace(b.signage_property_code, '-00$', '') = v_norm) THEN
    RAISE EXCEPTION '物件コード「%」は既に使われています', v_code USING ERRCODE = '23505';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM biz.companies c WHERE c.id = r.management_company_id AND c.is_management_company) THEN
    RAISE EXCEPTION '申請の管理会社が見つかりません' USING ERRCODE = '22023';
  END IF;
  IF r.inspection_type_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM biz.maintainers m WHERE m.id = r.vendor_id) THEN
    RAISE EXCEPTION '保守会社が業務システムに見つからないため、点検を登録できません' USING ERRCODE = '22023';
  END IF;

  INSERT INTO biz.properties (name, address_full, management_company_id, signage_property_code, kind, billable)
  VALUES (r.property_name, r.address, r.management_company_id, v_code, 'inspection', false)
  RETURNING id INTO v_property_id;

  INSERT INTO signage.signage_building_vendors (property_code, vendor_id, status, requested_by, approved_by)
  VALUES (v_code, r.vendor_id, 'active', r.requested_by, auth.uid())
  ON CONFLICT (property_code, vendor_id) DO UPDATE SET status = 'active', approved_by = excluded.approved_by;

  IF r.inspection_type_id IS NOT NULL THEN
    INSERT INTO biz.property_inspections (property_id, inspection_type_id, maintainer_id, inspection_months, created_by)
    VALUES (v_property_id, r.inspection_type_id, r.vendor_id, coalesce(r.inspection_months, '{}'), auth.uid());
  END IF;

  UPDATE signage.signage_property_requests
     SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), created_property_code = v_code
   WHERE id = r.id
  RETURNING * INTO r;
  RETURN r;
END;
$function$;

CREATE OR REPLACE FUNCTION signage.reject_property_request(p_id uuid, p_reason text)
 RETURNS signage.signage_property_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'signage', 'pg_temp'
AS $function$
DECLARE
  r signage.signage_property_requests;
  v_reason text := btrim(coalesce(p_reason, ''));
BEGIN
  IF NOT signage.is_active_admin() THEN
    RAISE EXCEPTION '建物追加の申請を却下する権限がありません' USING ERRCODE = '42501';
  END IF;
  IF v_reason = '' THEN
    RAISE EXCEPTION '却下の理由を入力してください' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO r FROM signage.signage_property_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '申請が見つかりません' USING ERRCODE = 'P0002';
  END IF;
  IF r.status <> 'pending' THEN
    RAISE EXCEPTION 'この申請は処理済みです' USING ERRCODE = '22023';
  END IF;
  UPDATE signage.signage_property_requests
     SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), reject_reason = v_reason
   WHERE id = r.id
  RETURNING * INTO r;
  RETURN r;
END;
$function$;

-- ============================================================
-- 4. 実行権限
-- ============================================================
REVOKE ALL ON FUNCTION signage.guard_property_request() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION signage.management_companies_for_request() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION signage.inspection_type_options_for_request(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION signage.approve_property_request(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION signage.reject_property_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION signage.management_companies_for_request() TO authenticated;
GRANT EXECUTE ON FUNCTION signage.inspection_type_options_for_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION signage.approve_property_request(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION signage.reject_property_request(uuid, text) TO authenticated;

-- ============================================================
-- 戻し手順（逆順）
-- ============================================================
-- 承認済みの申請で作った物件（created_property_code）は業務システムの物件なので、戻しても消えない（消すなら業務システムで）。
-- DROP FUNCTION signage.reject_property_request(uuid, text), signage.approve_property_request(uuid, text),
--   signage.management_companies_for_request(), signage.inspection_type_options_for_request(uuid);
-- DROP TABLE signage.signage_property_requests;   -- トリガー・ポリシーも一緒に消える
-- DROP FUNCTION signage.guard_property_request();
