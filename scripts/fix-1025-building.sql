-- 修正依頼1025 担当 building: 建物追加の申請を出した時点で、その建物の掲示の申請を送れるようにする（D4・F2）
-- 2026-10-25 作成。本番へは未適用（適用はユーザー承認後）。
-- 前提: scripts/fix-1024-approval.sql と scripts/fix-1024-followups-terminal.sql が流れていること。
-- 適用方法: ファイル全体を1つのクエリとして流す（Management API なら1回の query に全文を入れる。psql なら psql -1 -f）。
--   BEGIN/COMMIT は付けない。先頭の lock_timeout で、表のロックが取れないときは待ち続けずに失敗させる。何度流しても同じ結果になる。
--   ※ この後に fix-1024-approval.sql / fix-1024-followups-terminal.sql を流し直すと approve・reject が古い中身に戻る。流し直したらこのファイルも流す。
--
-- 仕組み:
--   - 未承認の建物の掲示の申請は signage_entries に仮の物件コード「REQ-<申請 id の先頭8文字>」と property_request_id で入る
--     （signage_entries.property_code に外部キーは無い。端末は空）。
--   - 建物が承認されるまで、その掲示の申請は承認（ready）・取込済み（exported）にできない（管理者も。下のトリガー）。
--     承認済み（ready/exported）の行だけが CSV に出るので、未承認の建物は CSV に出ない。
--   - 建物の承認（approve_property_request）で、正式な物件コード・端末・点検行・対象月に付け替える。
--   - 建物の却下（管理者の reject_property_request・管理会社の差戻し）で、その建物の承認前の掲示の申請（pending/draft）は消す
--     （仮のコードは再申請の新しい申請 id と一致しないので、残しても使えない。理由は申請者の「これまでの申請」に出る）。
--   - 管理会社の審査（任意）: 管理会社は自社が管理会社の申請を読めて、「審査済み（承認推奨）」か差戻し（却下）にできる。
--     管理者は審査の有無にかかわらず承認・却下できる。
--   - 未承認の建物を使えるのは申請した月（日本時間）の間だけ。翌月以降は再申請が要る（注記「次回以降は承認がなければ再度申請」）。

SET lock_timeout = '5s';

-- ============================================================
-- 1. 列
-- ============================================================
-- 掲示の申請 → 建物追加の申請（建物が承認されるまでの仮の物件の印）。申請の表に DELETE のポリシーは無い（消えない）
ALTER TABLE signage.signage_entries
  ADD COLUMN IF NOT EXISTS property_request_id uuid REFERENCES signage.signage_property_requests(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS signage_entries_property_request_idx
  ON signage.signage_entries (property_request_id) WHERE property_request_id IS NOT NULL;

-- 管理会社の審査（任意）。status の CHECK は変えない（審査済み＝pending のまま mgmt_reviewed_at が入る。差戻し＝rejected）
ALTER TABLE signage.signage_property_requests
  ADD COLUMN IF NOT EXISTS mgmt_reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mgmt_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS mgmt_comment text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'signage_property_requests_mgmt_comment_check'
                   AND conrelid = 'signage.signage_property_requests'::regclass) THEN
    ALTER TABLE signage.signage_property_requests ADD CONSTRAINT signage_property_requests_mgmt_comment_check
      CHECK (mgmt_comment IS NULL OR char_length(mgmt_comment) <= 500);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS signage_property_requests_vendor_idx
  ON signage.signage_property_requests (vendor_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS signage_property_requests_mgmt_idx
  ON signage.signage_property_requests (management_company_id, status);
-- 列の INSERT 権限は fix-1024-approval.sql で列ごと（申請の中身だけ）。審査の列は書かせない（下の RPC だけが書く）

-- ============================================================
-- 2. 読み取りのポリシー（追加。既存の property_requests_select は変えない）
-- ============================================================
-- 同じ保守会社の人も、自社の申請を読める（建物の申請者以外の同僚の点検登録フォームにも、その建物の行を出すため）
DROP POLICY IF EXISTS "property_requests_vendor_select" ON signage.signage_property_requests;
CREATE POLICY "property_requests_vendor_select" ON signage.signage_property_requests FOR SELECT TO authenticated
  USING (signage.is_active_member() AND vendor_id = signage.current_vendor_id());
-- 管理会社は、自社が管理会社の申請を読める（審査のため）。管理会社はこの表に書けない（審査は RPC だけ）
DROP POLICY IF EXISTS "property_requests_mgmt_select" ON signage.signage_property_requests;
CREATE POLICY "property_requests_mgmt_select" ON signage.signage_property_requests FOR SELECT TO authenticated
  USING (signage.is_active_management() AND management_company_id = signage.current_management_company_id());
-- 未承認の建物の掲示の申請そのものは管理会社に見せない（mgmt_select_entries は物件マスターと業務システムの物件で範囲を決める。
-- 保守会社が選んだ管理会社を範囲の根拠にしない）。管理会社には申請の一覧で件数だけ出す（property_request_entry_counts）

-- ============================================================
-- 3. 仮の物件の掲示の申請を守るトリガー（新しいトリガー。既存のトリガーは変えない）
-- ============================================================
-- 管理者も対象（管理者の承認は .update({status:'ready'}) で、guard_entry_approval_flow は管理者を通すため）
CREATE OR REPLACE FUNCTION signage.guard_entry_property_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'signage', 'pg_temp'
AS $function$
DECLARE
  r signage.signage_property_requests;
  v_changed boolean := TG_OP = 'INSERT' OR NEW.property_request_id IS DISTINCT FROM OLD.property_request_id;
BEGIN
  IF NEW.property_request_id IS NULL THEN
    -- 仮のコードは建物追加の申請からだけ（申請 id 無しで REQ- を名乗らせない）
    IF NEW.property_code ~* '^REQ-' AND (TG_OP = 'INSERT' OR NEW.property_code IS DISTINCT FROM OLD.property_code) THEN
      RAISE EXCEPTION '「REQ-」で始まる物件コードは建物追加の申請からだけ使えます' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO r FROM signage.signage_property_requests WHERE id = NEW.property_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '建物追加の申請が見つかりません' USING ERRCODE = '22023';
  END IF;

  IF r.status = 'approved' THEN
    -- 承認後は仮の物件として新しく申請させない（正式な物件コードで申請する）
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'この建物は承認済みです。物件コード「%」で申請してください', r.created_property_code USING ERRCODE = '22023';
    END IF;
    -- 承認後に結び付ける（承認の関数の付け替え）なら、正式な物件コードであること
    IF (v_changed OR NEW.property_code IS DISTINCT FROM OLD.property_code)
       AND NEW.property_code IS DISTINCT FROM r.created_property_code THEN
      RAISE EXCEPTION '建物追加の申請の物件コードと一致しません' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
  END IF;

  -- 未承認（pending）・却下（rejected）の建物
  IF NEW.property_code IS DISTINCT FROM 'REQ-' || left(r.id::text, 8) THEN
    RAISE EXCEPTION '建物の承認前は物件コードを変えられません' USING ERRCODE = '22023';
  END IF;
  IF NEW.status IN ('ready', 'exported') THEN
    RAISE EXCEPTION '建物追加の申請が承認されるまで、この建物の掲示は承認できません' USING ERRCODE = '42501';
  END IF;
  IF NEW.property_inspection_id IS NOT NULL THEN
    RAISE EXCEPTION '建物の承認前は点検に結び付けられません' USING ERRCODE = '22023';
  END IF;
  IF v_changed THEN
    IF r.status <> 'pending' THEN
      RAISE EXCEPTION '建物追加の申請は却下されています。もう一度申請してください' USING ERRCODE = '22023';
    END IF;
    -- 申請した月（日本時間）の間だけ使える。翌月以降は再申請（注記「次回以降は承認がなければ再度申請」）
    IF date_trunc('month', r.created_at AT TIME ZONE 'Asia/Tokyo') <> date_trunc('month', now() AT TIME ZONE 'Asia/Tokyo') THEN
      RAISE EXCEPTION '先月以前の建物追加の申請はまだ承認されていません。もう一度建物追加を申請してください' USING ERRCODE = '22023';
    END IF;
    IF auth.uid() IS NOT NULL AND NOT signage.is_active_admin()
       AND r.vendor_id IS DISTINCT FROM signage.current_vendor_id() THEN
      RAISE EXCEPTION '他社の建物追加の申請には申請できません' USING ERRCODE = '42501';
    END IF;
    -- 保守会社は建物の申請の保守会社（承認時に担当になる保守会社）
    NEW.vendor_id := r.vendor_id;
  END IF;
  RETURN NEW;
END;
$function$;
-- BEFORE トリガーは名前順に動く。guard_entry_portal_columns（vendor_id の確認）の後にこれが動く
DROP TRIGGER IF EXISTS guard_entry_property_request ON signage.signage_entries;
CREATE TRIGGER guard_entry_property_request BEFORE INSERT OR UPDATE ON signage.signage_entries
  FOR EACH ROW EXECUTE FUNCTION signage.guard_entry_property_request();

-- ============================================================
-- 4. 承認（付け替えを足す。fix-1024-followups-terminal.sql と同じシグネチャ・同じ中身＋付け替え）
-- ============================================================
CREATE OR REPLACE FUNCTION signage.approve_property_request(p_id uuid, p_property_code text, p_terminal_id text DEFAULT NULL)
 RETURNS signage.signage_property_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'pg_temp'
AS $function$
DECLARE
  r signage.signage_property_requests;
  v_code text := btrim(coalesce(p_property_code, ''));
  v_term text := nullif(btrim(coalesce(p_terminal_id, '')), '');
  v_norm text;
  v_property_id uuid;
  v_inspection_id uuid;
  v_type_name text;
  v_used_by text;
BEGIN
  IF NOT signage.is_active_admin() THEN
    RAISE EXCEPTION '建物追加の申請を承認する権限がありません' USING ERRCODE = '42501';
  END IF;
  -- 本番の物件コード 254 件はすべてこの形（例 120074-00 / r0001A01）
  IF v_code !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$' THEN
    RAISE EXCEPTION '物件コードは英数字・ハイフン・アンダーバーの32文字以内で入力してください' USING ERRCODE = '22023';
  END IF;
  -- REQ- は未承認の建物の仮のコード
  IF v_code ~* '^REQ-' THEN
    RAISE EXCEPTION '「REQ-」で始まる物件コードは使えません（未承認の建物の仮のコードです）' USING ERRCODE = '22023';
  END IF;
  -- 端末番号は任意。本番の端末番号 157 件はすべてこの形（例 z0090A01）
  IF v_term IS NOT NULL AND v_term !~ '^[a-z][0-9]{4}[A-Z][0-9]{2}$' THEN
    RAISE EXCEPTION '端末番号は「英小文字1字＋数字4桁＋英大文字1字＋数字2桁」で入力してください（例: z0090A01）' USING ERRCODE = '22023';
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

  IF v_term IS NOT NULL THEN
    -- 同じ端末番号の承認が同時に走っても片方だけが通るように（端末列に一意制約が無いため）
    PERFORM pg_advisory_xact_lock(hashtext('signage_terminal:' || lower(v_term)));
    SELECT coalesce(b.signage_property_code, b.name) INTO v_used_by
      FROM biz.properties b WHERE lower(b.signage_terminal_id) = lower(v_term) LIMIT 1;
    -- 業務システムの設備（モニター）にも端末番号がある。物件の端末列に無い端末がここだけにあるので必ず見る
    IF v_used_by IS NULL THEN
      SELECT coalesce(p.signage_property_code, p.name, '（物件なし）') INTO v_used_by
        FROM biz.equipment eq LEFT JOIN biz.properties p ON p.id = eq.property_id
       WHERE lower(eq.terminal_id) = lower(v_term) LIMIT 1;
    END IF;
    IF v_used_by IS NULL THEN
      SELECT s.property_code INTO v_used_by
        FROM signage.signage_master_properties s,
             jsonb_array_elements(CASE WHEN jsonb_typeof(s.terminals) = 'array' THEN s.terminals ELSE '[]'::jsonb END) e
       WHERE lower(coalesce(e->>'terminalId', e->>'terminal_id')) = lower(v_term)
       LIMIT 1;
    END IF;
    IF v_used_by IS NOT NULL THEN
      RAISE EXCEPTION '端末番号「%」は物件「%」で使われています', v_term, v_used_by USING ERRCODE = '23505';
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM biz.companies c WHERE c.id = r.management_company_id AND c.is_management_company) THEN
    RAISE EXCEPTION '申請の管理会社が見つかりません' USING ERRCODE = '22023';
  END IF;
  IF r.inspection_type_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM biz.maintainers m WHERE m.id = r.vendor_id) THEN
    RAISE EXCEPTION '保守会社が業務システムに見つからないため、点検を登録できません' USING ERRCODE = '22023';
  END IF;

  -- 端末はトリガー biz.sync_property_to_signage が signage_master_properties.terminals に写す
  INSERT INTO biz.properties (name, address_full, management_company_id, signage_property_code, signage_terminal_id, kind, billable)
  VALUES (r.property_name, r.address, r.management_company_id, v_code, v_term, 'inspection', false)
  RETURNING id INTO v_property_id;

  INSERT INTO signage.signage_building_vendors (property_code, vendor_id, status, requested_by, approved_by)
  VALUES (v_code, r.vendor_id, 'active', r.requested_by, auth.uid())
  ON CONFLICT (property_code, vendor_id) DO UPDATE SET status = 'active', approved_by = excluded.approved_by;

  IF r.inspection_type_id IS NOT NULL THEN
    INSERT INTO biz.property_inspections (property_id, inspection_type_id, maintainer_id, inspection_months, created_by)
    VALUES (v_property_id, r.inspection_type_id, r.vendor_id, coalesce(r.inspection_months, '{}'), auth.uid())
    RETURNING id INTO v_inspection_id;
  END IF;

  -- 申請を先に approved にする（付け替えの UPDATE は guard_entry_property_request が created_property_code と照らす）
  UPDATE signage.signage_property_requests
     SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(),
         created_property_code = v_code, created_terminal_id = v_term
   WHERE id = r.id
  RETURNING * INTO r;

  -- 建物の承認前に出していた掲示の申請（承認待ち・差戻し中）を正式な物件に付け替える。
  -- 点検種別が申請の点検と同じ行は、できた点検行と点検開始日の月（対象月）に結び付ける（点検登録フォームで申請済みの予定として出る）
  IF v_inspection_id IS NOT NULL THEN
    SELECT t.inspection_name INTO v_type_name
      FROM signage.signage_master_inspection_types t WHERE t.id = r.inspection_type_id;
  END IF;
  UPDATE signage.signage_entries e
     SET property_code = v_code,
         terminal_id = coalesce(v_term, ''),
         vendor_id = r.vendor_id,
         property_inspection_id = CASE
           WHEN v_inspection_id IS NOT NULL AND e.inspection_type = v_type_name THEN v_inspection_id
           ELSE e.property_inspection_id END,
         target_month = CASE
           WHEN v_inspection_id IS NOT NULL AND e.inspection_type = v_type_name AND e.inspection_start IS NOT NULL
             THEN coalesce(e.target_month, date_trunc('month', e.inspection_start)::date)
           ELSE e.target_month END
   WHERE e.property_request_id = r.id
     AND e.status IN ('pending', 'draft');
  RETURN r;
END;
$function$;

-- 却下（管理者だけ・理由必須）。fix-1024-approval.sql と同じシグネチャ・同じ中身＋その建物の掲示の申請の片付け
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
  PERFORM signage.discard_property_request_entries(r.id);
  RETURN r;
END;
$function$;

-- ============================================================
-- 5. 管理会社の審査（任意）
-- ============================================================
-- p_action: 'recommend'（審査済み＝承認推奨。管理者が物件コードを入れて承認する）/ 'reject'（差戻し＝却下。理由必須）
CREATE OR REPLACE FUNCTION signage.mgmt_review_property_request(p_id uuid, p_action text, p_comment text DEFAULT NULL)
 RETURNS signage.signage_property_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'signage', 'pg_temp'
AS $function$
DECLARE
  r signage.signage_property_requests;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
BEGIN
  IF NOT signage.is_active_management() THEN
    RAISE EXCEPTION '管理会社のアカウントでのみ使えます' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM signage.signage_property_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR r.management_company_id IS DISTINCT FROM signage.current_management_company_id() THEN
    RAISE EXCEPTION '申請が見つかりません' USING ERRCODE = 'P0002';
  END IF;
  IF r.status <> 'pending' THEN
    RAISE EXCEPTION 'この申請は処理済みです（他の操作で処理された可能性があります）' USING ERRCODE = '22023';
  END IF;
  IF v_comment IS NOT NULL AND char_length(v_comment) > 500 THEN
    RAISE EXCEPTION 'コメントは500文字以内で入力してください' USING ERRCODE = '22023';
  END IF;
  IF p_action = 'recommend' THEN
    UPDATE signage.signage_property_requests
       SET mgmt_reviewed_by = auth.uid(), mgmt_reviewed_at = now(), mgmt_comment = v_comment
     WHERE id = r.id
    RETURNING * INTO r;
  ELSIF p_action = 'reject' THEN
    IF v_comment IS NULL THEN
      RAISE EXCEPTION '差戻しの理由を入力してください' USING ERRCODE = '22023';
    END IF;
    UPDATE signage.signage_property_requests
       SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), reject_reason = v_comment,
           mgmt_reviewed_by = auth.uid(), mgmt_reviewed_at = now(), mgmt_comment = v_comment
     WHERE id = r.id
    RETURNING * INTO r;
    PERFORM signage.discard_property_request_entries(r.id);
  ELSE
    RAISE EXCEPTION '不明な操作です: %', p_action USING ERRCODE = '22023';
  END IF;
  RETURN r;
END;
$function$;

-- 申請ごとの、建物の承認前に出された掲示の申請（承認待ち・差戻し中）の件数。
-- 申請を読める人（管理者・申請者と同じ保守会社・申請の管理会社）にだけ返す。掲示の申請の中身は返さない
CREATE OR REPLACE FUNCTION signage.property_request_entry_counts(p_ids uuid[])
 RETURNS TABLE(property_request_id uuid, entry_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'signage', 'pg_temp'
AS $function$
  select r.id, (select count(*)::int from signage.signage_entries e
                 where e.property_request_id = r.id and e.status in ('pending', 'draft'))
  from signage.signage_property_requests r
  where r.id = any(p_ids)
    and (signage.is_active_admin()
         or (signage.is_active_member() and r.vendor_id = signage.current_vendor_id())
         or (signage.is_active_management() and r.management_company_id = signage.current_management_company_id()));
$function$;

-- ============================================================
-- 6. 却下の片付け（内部用。画面からは呼ばない）
-- ============================================================
-- 建物の申請を却下（管理者）・差戻し（管理会社）したとき、その建物の承認前の掲示の申請（pending/draft）を消す。
-- 既存の guard_entry_management_delete は管理会社の JWT の削除を必ず止める（印を見ない）。既存のトリガーは変えないので、
-- 範囲を確かめた呼び出し元からだけ呼ばれるこの関数の DELETE の間だけ JWT を外す（auth.uid() が NULL になり、
-- 既存の guard_* は「JWT を持たない経路」として通す）。終わったら元に戻す。
-- そのため監査ログ（signage_audit_logs）のこの削除の行は利用者が空になる（直前の申請の表の更新の行に利用者が残る）
CREATE OR REPLACE FUNCTION signage.discard_property_request_entries(p_request_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'signage', 'pg_temp'
AS $function$
DECLARE
  v_count integer;
  v_claims text := current_setting('request.jwt.claims', true);
  v_sub text := current_setting('request.jwt.claim.sub', true);
BEGIN
  -- 呼び出し元（reject_property_request・mgmt_review_property_request）が範囲を確かめた後だけ呼ばれる。
  -- 管理会社の JWT のままだと guard_entry_management_delete が削除を止めるので、この DELETE の間だけ JWT を外す
  -- （auth.uid() が NULL になり、既存の guard_* は「JWT を持たない経路」として通す）。終わったら元に戻す
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  DELETE FROM signage.signage_entries WHERE property_request_id = p_request_id AND status IN ('pending', 'draft');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  PERFORM set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
  RETURN v_count;
END;
$function$;

-- ============================================================
-- 7. 実行権限
-- ============================================================
REVOKE ALL ON FUNCTION signage.guard_entry_property_request() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION signage.discard_property_request_entries(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION signage.approve_property_request(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION signage.reject_property_request(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION signage.mgmt_review_property_request(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION signage.property_request_entry_counts(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION signage.approve_property_request(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION signage.reject_property_request(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION signage.mgmt_review_property_request(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION signage.property_request_entry_counts(uuid[]) TO authenticated, service_role;

-- ============================================================
-- 戻し手順（逆順）
-- ============================================================
-- DROP FUNCTION signage.property_request_entry_counts(uuid[]), signage.mgmt_review_property_request(uuid, text, text);
-- fix-1024-followups-terminal.sql の approve_property_request と fix-1024-approval.sql の reject_property_request を流し直す。
-- DROP FUNCTION signage.discard_property_request_entries(uuid);
-- DROP TRIGGER guard_entry_property_request ON signage.signage_entries; DROP FUNCTION signage.guard_entry_property_request();
-- DROP POLICY "property_requests_mgmt_select" ON signage.signage_property_requests;
-- DROP POLICY "property_requests_vendor_select" ON signage.signage_property_requests;
-- 仮の物件の掲示の申請（property_code が REQ- で始まる行）は、戻す前に消すか承認する。
-- ALTER TABLE signage.signage_entries DROP COLUMN property_request_id;
-- ALTER TABLE signage.signage_property_requests DROP COLUMN mgmt_reviewed_by, DROP COLUMN mgmt_reviewed_at, DROP COLUMN mgmt_comment;
