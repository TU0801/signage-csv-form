-- 修正依頼1025 担当 reports: その他ファイル（G2）と AI-OCR の自己改善・費用の記録
-- 2026-10-25 作成。本番へは未適用（適用はユーザー承認後）。ローカル DB（signage-v2-verify）で確かめた。
-- 適用方法: ファイル全体を1つのクエリとして流す（Management API なら1回の query に全文を入れる。psql なら psql -1 -f）。
--   BEGIN/COMMIT は付けない。先頭の lock_timeout で、ロックが取れないときは待ち続けずに失敗させる。
-- 何度流しても同じ結果になる（冪等）。既存（1024 以前）の関数・ポリシー・表は変えない。変えるのはこのファイルで足したものだけ。
--
-- 本番の今の状態（2026-10-25 に Management API の読み取りで確認）:
--   - バケットは templates / hp-attachments / noj-notices / biz-files / noj-forms / poster-images / inspection-reports。property-files は無い
--   - signage_property_files / signage_ocr_corrections / signage_ocr_usage は無い
--
-- 足すもの:
--   1. signage.property_file_writable(物件ID): その物件にファイルを置けるか（管理者は全件・保守会社は自社の点検がある物件・
--      管理会社は自社が管理会社の物件）。物件は signage_master_properties の行（id）で正確に特定する（1024 の方針）
--   2. 表 signage.signage_property_files（見積書・請求書・契約書・建物関連情報・提案書・写真・その他）と、読める人の判定
--      signage.property_file_visible: 管理者・アップロードした会社（保守会社は vendor_id、ほかはアップロードした本人）・物件の管理会社
--      書き込みは RPC（portal_register_property_file / portal_delete_property_file）だけ。
--      同じ内容の二重登録の照合は、呼んだ人が見られるファイルだけ（エラーにファイル名は出さない）
--      画面の建物の選択肢は portal_property_file_targets（property_file_writable と同じ判定。点検行の無い自社物件も出る）
--   3. 非公開バケット property-files（50MB。PDF・JPEG・PNG・Excel・Word・PowerPoint）。置き場所は {物件コード}/{uuid}.{拡張子}
--      （物件コードは signage_master_properties で一意。本番の254件はすべて英数字・ハイフン・下線だけ＝2026-10-25 確認）
--   4. AI-OCR の自己改善: 表 signage.signage_ocr_corrections（読んだ文字列 → 人が確定した値）と RPC
--      ocr_record_corrections（記録。確定した値を項目ごとに検査し、同じ人の同じ確定は1行）・ocr_correction_dictionary
--      （辞書。建物は2人以上、建物以外は2社以上の同じ確定があり、値が割れていないものを画面が自動で当てる）
--   5. AI-OCR の呼び出し記録 signage.signage_ocr_usage と枠の予約 ocr_reserve_usage（Edge Function signage-ai-ocr が
--      service_role で、モデルを呼ぶ前に1日の上限の確認と予約を原子的に行い、呼んだ後でその行に結果を書く）
-- 戻し手順は末尾。

SET lock_timeout = '5s';

-- ============================================================
-- 1. 物件に置けるか
-- ============================================================
CREATE OR REPLACE FUNCTION signage.property_file_writable(p_property_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'pg_temp'
AS $function$
  select case signage.current_role_kind()
    when 'admin' then exists (select 1 from signage.signage_master_properties s where s.id = p_property_id)
    -- 保守会社: その物件に自社の点検行（台の保守会社を含む。inspection_in_scope と同じ判定）がある
    when 'user' then signage.current_vendor_id() is not null and exists (
      select 1 from biz.properties b
      join biz.property_inspections pi on pi.property_id = b.id
      where b.signage_property_id = p_property_id and signage.inspection_in_scope(pi.id))
    -- 管理会社: その物件行の管理会社が自社（正規化したコードでなく、物件行で判定する）
    when 'management' then signage.current_management_company_id() is not null and exists (
      select 1 from biz.properties b
      where b.signage_property_id = p_property_id
        and b.management_company_id = signage.current_management_company_id())
    else false end;
$function$;

-- ============================================================
-- 2. その他ファイルの表
-- ============================================================
CREATE TABLE IF NOT EXISTS signage.signage_property_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 物件を消してもファイルの記録は残す（物件コード・名前は写しで持つ）
  property_id uuid REFERENCES signage.signage_master_properties(id) ON DELETE SET NULL,
  property_code text NOT NULL,
  property_name text NOT NULL,
  -- estimate 見積書 / invoice 請求書 / contract 契約書 / building_info 建物関連情報 / proposal 提案書 / photo 写真 / other その他
  category text NOT NULL CHECK (category IN ('estimate', 'invoice', 'contract', 'building_info', 'proposal', 'photo', 'other')),
  category_note text,
  -- 書類の日付（見積日・請求日など。ツリーの年はこれ、無ければ登録日）
  doc_date date,
  file_name text NOT NULL,
  original_name text,
  storage_path text NOT NULL UNIQUE,
  mime_type text NOT NULL,
  size_bytes bigint,
  content_hash text,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id),
  -- アップロードした保守会社（保守会社のアカウントのとき）
  vendor_id uuid REFERENCES signage.signage_master_vendors(id),
  vendor_name text,
  -- 登録時点の物件の管理会社（読める人の判定は今の管理会社で行う。これは記録用）
  management_company_id uuid REFERENCES biz.companies(id),
  note text,
  -- AI-OCR で読んだ結果（人が直す前の値。自己改善の照合用）
  ocr_result jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT signage_property_files_other_note CHECK (category <> 'other' OR nullif(btrim(coalesce(category_note, '')), '') IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS signage_property_files_property_idx ON signage.signage_property_files (property_code);
ALTER TABLE signage.signage_property_files ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON signage.signage_property_files FROM PUBLIC, anon, authenticated;
GRANT SELECT ON signage.signage_property_files TO authenticated;
GRANT ALL ON signage.signage_property_files TO service_role;

-- 読めるのは、管理者・アップロードした会社（保守会社は自社の vendor_id、管理会社・管理者は本人）・物件の管理会社
CREATE OR REPLACE FUNCTION signage.property_file_visible(p_vendor_id uuid, p_uploaded_by uuid, p_property_code text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'signage', 'pg_temp'
AS $function$
  select case signage.current_role_kind()
    when 'admin' then true
    when 'user' then (p_vendor_id is not null and p_vendor_id = signage.current_vendor_id())
      or (p_vendor_id is null and p_uploaded_by = auth.uid())
    when 'management' then p_uploaded_by = auth.uid() or signage.property_reviewable(p_property_code)
    else false end;
$function$;

DROP POLICY IF EXISTS "Scoped members can read property files" ON signage.signage_property_files;
CREATE POLICY "Scoped members can read property files" ON signage.signage_property_files
  FOR SELECT TO authenticated USING (signage.property_file_visible(vendor_id, uploaded_by, property_code));

DROP TRIGGER IF EXISTS audit_trigger ON signage.signage_property_files;
CREATE TRIGGER audit_trigger AFTER INSERT OR DELETE OR UPDATE ON signage.signage_property_files FOR EACH ROW EXECUTE FUNCTION signage.signage_audit_trigger_fn();
DROP TRIGGER IF EXISTS update_signage_property_files_updated_at ON signage.signage_property_files;
CREATE TRIGGER update_signage_property_files_updated_at BEFORE UPDATE ON signage.signage_property_files FOR EACH ROW EXECUTE FUNCTION signage.update_updated_at_column();

-- 登録（Storage へ置いた後に呼ぶ）。物件コード・名前・管理会社・保守会社は DB 側で決める
-- （作業中の版は物件 id を受け取っていた。重ねて流したときにオーバーロードを残さない）
DROP FUNCTION IF EXISTS signage.portal_register_property_file(uuid, text, text, text, text, text, text, bigint, text, date, text, jsonb);
CREATE OR REPLACE FUNCTION signage.portal_register_property_file(
  p_property_code text, p_category text, p_category_note text, p_file_name text, p_storage_path text,
  p_original_name text, p_mime_type text, p_size_bytes bigint, p_content_hash text,
  p_doc_date date DEFAULT NULL, p_note text DEFAULT NULL, p_ocr_result jsonb DEFAULT NULL)
 RETURNS signage.signage_property_files
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'pg_temp'
AS $function$
DECLARE
  r signage.signage_property_files;
  info record;
  v_vendor uuid := CASE WHEN signage.current_role_kind() = 'user' THEN signage.current_vendor_id() ELSE NULL END;
  v_name text := btrim(coalesce(p_file_name, ''));
  dup record;
  p_property_id uuid;
BEGIN
  -- 物件は物件コードの完全一致で1行に決める（-00 の有無などの正規化はしない）
  SELECT s.id INTO p_property_id FROM signage.signage_master_properties s WHERE s.property_code = p_property_code;
  IF p_property_id IS NULL OR NOT signage.property_file_writable(p_property_id) THEN
    RAISE EXCEPTION 'この建物にファイルを登録する権限がありません' USING ERRCODE = '42501';
  END IF;
  IF p_category IS NULL OR p_category NOT IN ('estimate', 'invoice', 'contract', 'building_info', 'proposal', 'photo', 'other') THEN
    RAISE EXCEPTION '区分を選んでください' USING ERRCODE = '22023';
  END IF;
  IF p_category = 'other' AND nullif(btrim(coalesce(p_category_note, '')), '') IS NULL THEN
    RAISE EXCEPTION '「その他」の内容を入力してください' USING ERRCODE = '22023';
  END IF;
  IF v_name = '' OR length(v_name) > 200 OR v_name ~ '[<>:"/\\|?*]' THEN
    RAISE EXCEPTION 'ファイル名が不正です' USING ERRCODE = '22023';
  END IF;
  IF p_storage_path IS NULL OR split_part(p_storage_path, '/', 1) <> p_property_code OR p_storage_path LIKE '%..%' THEN
    RAISE EXCEPTION 'ファイルの置き場所が不正です' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'property-files' AND o.name = p_storage_path
                 AND (o.owner_id IS NULL OR o.owner_id = auth.uid()::text)) THEN
    RAISE EXCEPTION 'ファイルのアップロードが完了していません' USING ERRCODE = '22023';
  END IF;
  -- 同じ建物に同じ内容のファイルが登録済みなら止める（二重の登録を防ぐ）
  IF p_content_hash IS NOT NULL THEN
    -- 照合するのは呼んだ人が見られるファイルだけ。ファイル名もエラーに出さない
    -- （ハッシュは画面から来るので、見えない他社のファイルの有無・名前を探る窓口にしない）
    SELECT f.id INTO dup FROM signage.signage_property_files f
     WHERE f.property_id = p_property_id AND f.content_hash = p_content_hash AND f.status = 'active'
       AND signage.property_file_visible(f.vendor_id, f.uploaded_by, f.property_code) LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION '同じ内容のファイルがこの建物に登録済みです（一覧で確かめてください）' USING ERRCODE = '23505';
    END IF;
  END IF;

  SELECT s.property_code, s.property_name,
         (SELECT b.management_company_id FROM biz.properties b WHERE b.signage_property_id = s.id LIMIT 1) AS mgmt
    INTO info
    FROM signage.signage_master_properties s WHERE s.id = p_property_id;

  INSERT INTO signage.signage_property_files (
    property_id, property_code, property_name, category, category_note, doc_date, file_name, original_name,
    storage_path, mime_type, size_bytes, content_hash, uploaded_by, vendor_id, vendor_name, management_company_id,
    note, ocr_result)
  VALUES (
    p_property_id, info.property_code, info.property_name, p_category,
    CASE WHEN p_category = 'other' THEN btrim(p_category_note) ELSE nullif(btrim(coalesce(p_category_note, '')), '') END,
    p_doc_date, v_name, p_original_name, p_storage_path, coalesce(nullif(p_mime_type, ''), 'application/octet-stream'),
    p_size_bytes, p_content_hash, auth.uid(), v_vendor,
    (SELECT v.vendor_name FROM signage.signage_master_vendors v WHERE v.id = v_vendor),
    info.mgmt, nullif(btrim(coalesce(p_note, '')), ''), p_ocr_result)
  RETURNING * INTO r;
  RETURN r;
END;
$function$;

-- 削除（論理）。アップロードした本人と管理者だけ
CREATE OR REPLACE FUNCTION signage.portal_delete_property_file(p_file_id uuid)
 RETURNS signage.signage_property_files
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'signage', 'pg_temp'
AS $function$
DECLARE
  r signage.signage_property_files;
BEGIN
  SELECT * INTO r FROM signage.signage_property_files WHERE id = p_file_id;
  IF NOT FOUND OR NOT signage.property_file_visible(r.vendor_id, r.uploaded_by, r.property_code) THEN
    RAISE EXCEPTION 'ファイルが見つかりません' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (signage.is_active_admin() OR (r.uploaded_by = auth.uid() AND signage.current_role_kind() IS NOT NULL)) THEN
    RAISE EXCEPTION 'このファイルを削除できるのは、アップロードした人と管理者だけです' USING ERRCODE = '42501';
  END IF;
  UPDATE signage.signage_property_files SET status = 'deleted' WHERE id = p_file_id RETURNING * INTO r;
  RETURN r;
END;
$function$;

-- その他ファイルを置ける建物の一覧（画面の建物の選択肢。判定は property_file_writable と同じ）。
-- 点検行の無い自社物件（管理会社）も選べるように、点検の一覧ではなくこれを使う
CREATE OR REPLACE FUNCTION signage.portal_property_file_targets()
 RETURNS TABLE(property_code text, property_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'pg_temp'
AS $function$
  select s.property_code, s.property_name
  from signage.signage_master_properties s
  where signage.current_role_kind() is not null and signage.property_file_writable(s.id)
  order by s.property_name, s.property_code;
$function$;

-- ============================================================
-- 3. バケット property-files
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('property-files', 'property-files', false, 52428800, ARRAY[
  'application/pdf', 'image/jpeg', 'image/png',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.ms-powerpoint'])
ON CONFLICT (id) DO NOTHING;

-- 置き場所の先頭（物件コード）→ 物件の行の id（完全一致。無ければ null で、アップロードは通らない）。
-- 有効なアカウント（管理者・保守会社・管理会社）でなければ null（物件コードから id を引く窓口にしない）
CREATE OR REPLACE FUNCTION signage.property_file_object_property_id(p_name text)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'signage', 'pg_temp'
AS $function$
  select s.id from signage.signage_master_properties s
  where signage.current_role_kind() is not null
    and p_name not like '%..%' and s.property_code = split_part(p_name, '/', 1);
$function$;

-- オブジェクトを読めるのは、それを保存先に持つ記録を読める人（登録前・登録に失敗したファイルは管理者だけ）
CREATE OR REPLACE FUNCTION signage.property_file_object_visible(p_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'signage', 'pg_temp'
AS $function$
  select signage.is_active_admin() or exists (
    select 1 from signage.signage_property_files f
    where f.storage_path = p_name and signage.property_file_visible(f.vendor_id, f.uploaded_by, f.property_code));
$function$;

DROP POLICY IF EXISTS "property_files_select" ON storage.objects;
CREATE POLICY "property_files_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'property-files' AND signage.property_file_object_visible(name));
DROP POLICY IF EXISTS "property_files_insert" ON storage.objects;
CREATE POLICY "property_files_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'property-files' AND signage.property_file_writable(signage.property_file_object_property_id(name)));
DROP POLICY IF EXISTS "property_files_admin_update" ON storage.objects;
CREATE POLICY "property_files_admin_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'property-files' AND signage.is_active_admin());
DROP POLICY IF EXISTS "property_files_admin_delete" ON storage.objects;
CREATE POLICY "property_files_admin_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'property-files' AND signage.is_active_admin());

-- ============================================================
-- 4. AI-OCR の自己改善（読んだ文字列 → 人が確定した値）
-- ============================================================
-- field: property（建物名 → 物件コード）/ inspection_type（点検種別の表記 → 点検種別名）/ vendor（会社名 → 保守会社ID）/
--        category（書類の種類 → その他ファイルの区分）。raw_text は画面側で正規化した読み（空白・全角半角・法人格をそろえたもの）
CREATE TABLE IF NOT EXISTS signage.signage_ocr_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field text NOT NULL CHECK (field IN ('property', 'inspection_type', 'vendor', 'category')),
  raw_text text NOT NULL CHECK (length(raw_text) BETWEEN 1 AND 200),
  ai_value text,
  resolved_value text NOT NULL CHECK (length(resolved_value) BETWEEN 1 AND 200),
  recorded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS signage_ocr_corrections_lookup_idx ON signage.signage_ocr_corrections (field, raw_text);
-- 記録した会社（保守会社は 'vendor:<保守会社id>'、管理会社は 'mgmt:<管理会社id>'、管理者は 'admin'）。
-- 建物以外の辞書（区分・保守会社・点検種別）は全社に効くので、確定の回数は会社の異なり数で数える
ALTER TABLE signage.signage_ocr_corrections ADD COLUMN IF NOT EXISTS recorded_org text;
UPDATE signage.signage_ocr_corrections c
   SET recorded_org = coalesce(
         (SELECT CASE p.role WHEN 'admin' THEN 'admin'
                             WHEN 'user' THEN 'vendor:' || p.vendor_id::text
                             WHEN 'management' THEN 'mgmt:' || p.management_company_id::text END
            FROM signage.signage_profiles p WHERE p.id = c.recorded_by),
         'user:' || c.recorded_by::text)
 WHERE c.recorded_org IS NULL;
ALTER TABLE signage.signage_ocr_corrections ALTER COLUMN recorded_org SET NOT NULL;
-- 同じ人の同じ確定は1行だけ（何度確定しても回数は増えない）
DELETE FROM signage.signage_ocr_corrections c
 USING signage.signage_ocr_corrections d
 WHERE c.field = d.field AND c.raw_text = d.raw_text AND c.resolved_value = d.resolved_value
   AND c.recorded_by = d.recorded_by AND (c.created_at, c.id) > (d.created_at, d.id);
CREATE UNIQUE INDEX IF NOT EXISTS signage_ocr_corrections_once_idx
  ON signage.signage_ocr_corrections (field, raw_text, resolved_value, recorded_by);
ALTER TABLE signage.signage_ocr_corrections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON signage.signage_ocr_corrections FROM PUBLIC, anon, authenticated;
GRANT ALL ON signage.signage_ocr_corrections TO service_role;
-- 直接の読み書きは無し（RPC だけ）

-- 記録。p_items は [{field, raw_text, ai_value, resolved_value}]（50件まで）。確定した値は項目ごとに確かめ、合わないものは捨てる:
--   property: 記録する人がファイルを置ける物件（property_file_writable）のコード（範囲外の物件への辞書の書き込みを断る）
--   category: その他ファイルの区分の値 / vendor: signage_master_vendors にある保守会社の id / inspection_type: 点検種別マスター（biz.inspection_types）の名前
-- 同じ人の同じ確定（同じ呼び出しの中の重複を含む）は1回として扱う。戻り値は新しく記録した件数
CREATE OR REPLACE FUNCTION signage.ocr_record_corrections(p_items jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'pg_temp'
AS $function$
DECLARE
  item jsonb;
  v_field text;
  v_raw text;
  v_resolved text;
  v_role text := signage.current_role_kind();
  v_org text;
  v_inserted integer;
  v_count integer := 0;
BEGIN
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'ログインが必要です' USING ERRCODE = '42501';
  END IF;
  v_org := CASE v_role
    WHEN 'admin' THEN 'admin'
    WHEN 'user' THEN 'vendor:' || coalesce(signage.current_vendor_id()::text, 'none:' || auth.uid()::text)
    WHEN 'management' THEN 'mgmt:' || coalesce(signage.current_management_company_id()::text, 'none:' || auth.uid()::text)
  END;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION '記録の形式が不正です' USING ERRCODE = '22023';
  END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(item) <> 'object' THEN
      CONTINUE;
    END IF;
    v_field := item->>'field';
    v_raw := btrim(coalesce(item->>'raw_text', ''));
    v_resolved := btrim(coalesce(item->>'resolved_value', ''));
    IF v_field IS NULL OR v_field NOT IN ('property', 'inspection_type', 'vendor', 'category')
       OR length(v_raw) NOT BETWEEN 1 AND 200 OR length(v_resolved) NOT BETWEEN 1 AND 200 THEN
      CONTINUE;
    END IF;
    IF v_field = 'property' AND NOT EXISTS (
         SELECT 1 FROM signage.signage_master_properties s
          WHERE s.property_code = v_resolved AND signage.property_file_writable(s.id)) THEN
      CONTINUE;
    END IF;
    IF v_field = 'category'
       AND v_resolved NOT IN ('estimate', 'invoice', 'contract', 'building_info', 'proposal', 'photo', 'other') THEN
      CONTINUE;
    END IF;
    -- uuid の形を先に確かめてから型変換する（評価順に頼らない）
    IF v_field = 'vendor' AND v_resolved !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      CONTINUE;
    END IF;
    IF v_field = 'vendor' AND NOT EXISTS (SELECT 1 FROM signage.signage_master_vendors v WHERE v.id = v_resolved::uuid) THEN
      CONTINUE;
    END IF;
    IF v_field = 'inspection_type' AND NOT EXISTS (SELECT 1 FROM biz.inspection_types t WHERE t.label = v_resolved) THEN
      CONTINUE;
    END IF;
    INSERT INTO signage.signage_ocr_corrections (field, raw_text, ai_value, resolved_value, recorded_by, recorded_org)
    VALUES (v_field, v_raw, left(item->>'ai_value', 200), v_resolved, auth.uid(), v_org)
    ON CONFLICT (field, raw_text, resolved_value, recorded_by) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    v_count := v_count + v_inserted;
  END LOOP;
  RETURN v_count;
END;
$function$;

-- 辞書。読み（field・raw_text）ごとに、確定した値と回数、ほかの値に割れているか（conflicting）を返す。
-- 回数: 建物は確定した人の異なり数（建物の辞書は範囲内の物件にしか効かないので、同じ会社の2人でもよい）、
--       建物以外（区分・保守会社・点検種別）は全社に効くので、確定した会社の異なり数（1社だけでは自動で当たらない）。
-- 建物は、呼び出した人が扱える物件（管理者は全件・保守会社はファイルを置ける物件・管理会社は自社物件）のものだけ返す。
-- 割れの判定は範囲外の記録も含めて行う（範囲内の値だけを見て「割れていない」と誤らない）
CREATE OR REPLACE FUNCTION signage.ocr_correction_dictionary()
 RETURNS TABLE(field text, raw_text text, resolved_value text, confirmations bigint, conflicting boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'signage', 'pg_temp'
AS $function$
  with agg as (
    select c.field, c.raw_text, c.resolved_value,
           case when c.field = 'property' then count(distinct c.recorded_by) else count(distinct c.recorded_org) end as n,
           count(*) over (partition by c.field, c.raw_text) as values_for_raw
    from signage.signage_ocr_corrections c
    group by c.field, c.raw_text, c.resolved_value
  )
  select a.field, a.raw_text, a.resolved_value, a.n, a.values_for_raw > 1
  from agg a
  where signage.current_role_kind() is not null
    and (a.field <> 'property'
         or signage.is_active_admin()
         or exists (select 1 from signage.signage_master_properties s
                    where s.property_code = a.resolved_value
                      and (signage.property_file_writable(s.id) or signage.property_reviewable(s.property_code))))
  order by a.field, a.raw_text, a.n desc;
$function$;

-- ============================================================
-- 5. AI-OCR の呼び出し記録（Edge Function が service_role で書く。画面からは読まない）
-- ============================================================
CREATE TABLE IF NOT EXISTS signage.signage_ocr_usage (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  mode text NOT NULL CHECK (mode IN ('text', 'pdf', 'image')),
  pages integer,
  input_tokens integer,
  output_tokens integer,
  ok boolean NOT NULL DEFAULT false,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS signage_ocr_usage_created_idx ON signage.signage_ocr_usage (created_at);
ALTER TABLE signage.signage_ocr_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON signage.signage_ocr_usage FROM PUBLIC, anon, authenticated;
GRANT ALL ON signage.signage_ocr_usage TO service_role;

-- 1日の上限の枠の予約（Edge Function がモデルを呼ぶ前に service_role で呼ぶ）。
-- 件数の確認と予約の行の挿入を、advisory lock の中で1つの処理として行う（同時に送られても上限を超えて呼ばない）。
-- 全体・本人とも上限未満なら予約の行（ok=false）を入れて id を返し、どちらかが上限なら null。
-- 失敗した呼び出しも予約の行が残るので数に入る（再試行の乱用を防ぐ）。日の区切りは日本時間の0時
CREATE OR REPLACE FUNCTION signage.ocr_reserve_usage(
  p_user_id uuid, p_mode text, p_pages integer, p_limit_total integer, p_limit_user integer)
 RETURNS bigint
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'signage', 'pg_temp'
AS $function$
DECLARE
  v_since timestamptz := ((now() AT TIME ZONE 'Asia/Tokyo')::date)::timestamp AT TIME ZONE 'Asia/Tokyo';
  v_id bigint;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id が必要です' USING ERRCODE = '22023';
  END IF;
  -- 取引の終わり（コミット）まで持つ。後に来た呼び出しは、先の予約がコミットされてから数える
  PERFORM pg_advisory_xact_lock(hashtext('signage.signage_ocr_usage'));
  IF (SELECT count(*) FROM signage.signage_ocr_usage u WHERE u.created_at >= v_since) >= coalesce(p_limit_total, 0)
     OR (SELECT count(*) FROM signage.signage_ocr_usage u WHERE u.created_at >= v_since AND u.user_id = p_user_id) >= coalesce(p_limit_user, 0) THEN
    RETURN NULL;
  END IF;
  INSERT INTO signage.signage_ocr_usage (user_id, mode, pages, ok)
  VALUES (p_user_id, p_mode, p_pages, false)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

-- ============================================================
-- 6. 実行権限
-- ============================================================
REVOKE ALL ON FUNCTION signage.property_file_writable(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION signage.property_file_visible(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION signage.property_file_object_visible(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION signage.property_file_object_property_id(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION signage.portal_register_property_file(text, text, text, text, text, text, text, bigint, text, date, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION signage.portal_delete_property_file(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION signage.ocr_record_corrections(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION signage.ocr_correction_dictionary() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION signage.portal_property_file_targets() FROM PUBLIC, anon;
-- 枠の予約は Edge Function（service_role）だけ
REVOKE ALL ON FUNCTION signage.ocr_reserve_usage(uuid, text, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION signage.ocr_reserve_usage(uuid, text, integer, integer, integer) TO service_role;
-- ポリシーの式は呼び出し元の権限で評価されるので、補助関数も authenticated に EXECUTE を残す
GRANT EXECUTE ON FUNCTION signage.property_file_writable(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION signage.property_file_visible(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION signage.property_file_object_visible(text) TO authenticated;
GRANT EXECUTE ON FUNCTION signage.property_file_object_property_id(text) TO authenticated;
GRANT EXECUTE ON FUNCTION signage.portal_register_property_file(text, text, text, text, text, text, text, bigint, text, date, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION signage.portal_delete_property_file(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION signage.ocr_record_corrections(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION signage.ocr_correction_dictionary() TO authenticated;
GRANT EXECUTE ON FUNCTION signage.portal_property_file_targets() TO authenticated;

-- ============================================================
-- 戻し手順（逆順）
-- ============================================================
-- DROP POLICY "property_files_select" / "property_files_insert" / "property_files_admin_update" / "property_files_admin_delete" ON storage.objects;
-- （バケット property-files は中身を確認してから削除）
-- DROP FUNCTION signage.ocr_reserve_usage(uuid, text, integer, integer, integer), signage.portal_property_file_targets(),
--   signage.ocr_correction_dictionary(), signage.ocr_record_corrections(jsonb),
--   signage.portal_delete_property_file(uuid), signage.portal_register_property_file(text, text, text, text, text, text, text, bigint, text, date, text, jsonb),
--   signage.property_file_object_visible(text), signage.property_file_object_property_id(text),
--   signage.property_file_visible(uuid, uuid, text), signage.property_file_writable(uuid);
-- DROP TABLE signage.signage_ocr_usage, signage.signage_ocr_corrections, signage.signage_property_files;
