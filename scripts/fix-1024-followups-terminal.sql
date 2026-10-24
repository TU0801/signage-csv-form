-- 修正依頼1024 後続課題 担当 terminal: 新規建物の申請の承認時に端末番号も入れる
-- 2026-10-24 作成。本番へは未適用（適用はユーザー承認後）。scripts/fix-1024-approval.sql の後に流す。
-- 適用方法: ファイル全体を1つのクエリとして流す（Management API なら1回の query に全文を入れる。psql なら psql -1 -f）。
--   BEGIN/COMMIT は付けない。先頭の lock_timeout で、表のロックが取れないときは待ち続けずに失敗させる。何度流しても同じ結果になる。
--   ※ この後に fix-1024-approval.sql を流し直すと 2引数版が戻り、2引数の呼び出しが曖昧になる。流し直したらこのファイルも流す。
--
-- 業務システム側の端末の持ち方（2026-10-24 本番を読み取りで確認）:
--   - 端末は biz.properties.signage_terminal_id（1物件1端末の text）。トリガー biz.sync_property_to_signage が INSERT 時に
--     signage_master_properties.terminals を [{"terminalId": <端末>, "supplement": ""}] で作る（NULL なら []）。
--   - 本番の端末番号: biz 157件・signage 157件、すべて ^[a-z][0-9]{4}[A-Z][0-9]{2}$（先頭 z153/r1/h1/o1/s1、末尾 A01 155/A00 1/A02 1）。
--     重複は biz・signage とも 0 件。ただし biz と signage で1件だけ食い違う物件がある（biz z0057A01 / signage z0056A01）ので、
--     使われているかは両方を見る。biz の端末列に一意制約は無い（properties_terminal_idx は一意でない）。biz の表は変えない。
--   - 業務システムの設備 biz.equipment.terminal_id にも端末番号がある（本番 152 行・重複 0・形式は上と同じ・active=false は 0 行）。
--     うち3件（h0001A01〜A03、物件 h0001A00）は物件の端末列にも signage にも無いので、使われているかは設備も見る。
--
-- リリース順（必須）: このファイルを本番 DB に流してから、v2 をデプロイする（main への merge で Vercel が自動デプロイするなら merge の前）。
--   v2 は端末番号を入れたときだけ p_terminal_id を送る。旧 DB（2引数版だけ）のままだと、端末番号を入れた承認は
--   PostgREST が関数を見つけられず失敗する（端末番号を空にした承認は旧 DB でも通る）。

SET lock_timeout = '5s';

-- 承認時に登録した端末（申請者の「これまでの申請」で端末登録済みかを出し分ける）。
-- 列の INSERT 権限は fix-1024-approval.sql で列ごとに付けているので、申請者はこの列を書けない（SELECT は表ごとで読める）
ALTER TABLE signage.signage_property_requests ADD COLUMN IF NOT EXISTS created_terminal_id text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'signage_property_requests_terminal_check'
                   AND conrelid = 'signage.signage_property_requests'::regclass) THEN
    ALTER TABLE signage.signage_property_requests ADD CONSTRAINT signage_property_requests_terminal_check
      CHECK (created_terminal_id IS NULL OR created_terminal_id ~ '^[a-z][0-9]{4}[A-Z][0-9]{2}$');
  END IF;
END $$;

-- 引数を足すので旧シグネチャを消してから作る（PostgREST のオーバーロードの曖昧さを避ける）。
-- p_terminal_id は既定 NULL: 画面の更新前の 2引数の呼び出しもそのまま通る（旧版が無いので曖昧にはならない）
DROP FUNCTION IF EXISTS signage.approve_property_request(uuid, text);
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
  v_used_by text;
BEGIN
  IF NOT signage.is_active_admin() THEN
    RAISE EXCEPTION '建物追加の申請を承認する権限がありません' USING ERRCODE = '42501';
  END IF;
  -- 本番の物件コード 254 件はすべてこの形（例 120074-00 / r0001A01）
  IF v_code !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$' THEN
    RAISE EXCEPTION '物件コードは英数字・ハイフン・アンダーバーの32文字以内で入力してください' USING ERRCODE = '22023';
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
    -- （2026-10-24 本番: 端末つき 152 行・重複 0・すべて active。h0001A01〜A03 の3件は設備にしか無い）。
    -- 使わなくなった設備（active = false）の端末も、同じ端末番号を別の物件に付け直さないよう「使われている」に数える
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
    VALUES (v_property_id, r.inspection_type_id, r.vendor_id, coalesce(r.inspection_months, '{}'), auth.uid());
  END IF;

  UPDATE signage.signage_property_requests
     SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(),
         created_property_code = v_code, created_terminal_id = v_term
   WHERE id = r.id
  RETURNING * INTO r;
  RETURN r;
END;
$function$;

REVOKE ALL ON FUNCTION signage.approve_property_request(uuid, text, text) FROM PUBLIC, anon;
-- 本番の今の approve_property_request(uuid, text) の ACL（authenticated と service_role に EXECUTE。後続課題の指示による。このコミットでは本番を読んでいない）と同じにする
GRANT EXECUTE ON FUNCTION signage.approve_property_request(uuid, text, text) TO authenticated, service_role;

-- ============================================================
-- 戻し手順
-- ============================================================
-- DROP FUNCTION signage.approve_property_request(uuid, text, text);
-- そのうえで fix-1024-approval.sql の approve_property_request(uuid, text) と REVOKE/GRANT を流し直す。
-- ALTER TABLE signage.signage_property_requests DROP COLUMN created_terminal_id;   -- 制約も一緒に消える
-- 承認で登録した端末は業務システムの物件の端末なので、戻しても消えない（消すなら業務システムで）。
