-- 修正依頼1026 再検証で見送った課題の手当て（X12・D7b と承認の抜け道）
-- 2026-10-26 作成。本番へは未適用（適用はユーザー承認後）。ローカル DB（signage-v2-verify）で確かめた（scripts/test-fix-1026-followups.sql）。
-- 適用方法: ファイル全体を1つのクエリとして流す（Management API なら1回の query に全文を入れる。psql なら psql -1 -f）。
--   BEGIN/COMMIT は付けない。先頭の lock_timeout で、ロックが取れないときは待ち続けずに失敗させる。何度流しても同じ結果になる。
--   関数の引数の形は変えない（CREATE OR REPLACE だけ。重複定義を作らない）。土台は本番の定義（2026-10-26 に pg_get_functiondef で読んだもの）。
--
-- 1. 台なしの完了連絡の取り消し（portal_unmark_completed）
--    台なしの完了連絡（property_unit_id NULL）は、画面で全部の台の行に効く。これまでは連絡した保守会社か管理者しか取り消せず、
--    別の台を保守する会社の行では「完了」が消せなかった（verify X12・D7b）。台なしの完了連絡は、この点検（または台のどれか）を
--    保守する保守会社と管理者が取り消せるようにする。その範囲は先頭の inspection_writable（inspection_in_scope の 'user'
--    ＝点検行の保守会社か、台の保守会社）がもう確かめているので、台なしの行では連絡した保守会社との比較をしない。
--    関係の無い保守会社・管理会社は inspection_writable で今どおり断る。台ごとの完了連絡の取り消しは今どおり（連絡した保守会社か管理者）。
-- 2. 承認は版の照合つきの経路だけ（portal_review_entry / portal_approve_entry_checked）
--    画面は portal_approve_entry_checked（見た updated_at と比べる）で承認するが、portal_review_entry(…, 'approve') を直接呼ぶと
--    照合なしで承認できた。portal_approve_entry_checked が版を確かめた後にトランザクション内だけの印 signage.portal_approve_checked
--    を立て、portal_review_entry の approve はその印が無いと断る（印は approve の中ですぐ下ろすので、同じトランザクションの
--    別の承認には効かない）。差戻し（send_back）は今どおり。管理者の直接 UPDATE による承認（v2 の承認待ち一覧）は変えない。
--    呼び出し元の確認（2026-10-26）: v1（js/）・Edge Function（supabase/functions）に portal_review_entry の呼び出しは無い。
--    v2 の approve は approveEntryChecked（portal_approve_entry_checked）だけで、reviewEntry は send_back だけに使う。

SET lock_timeout = '5s';

-- ============================================================
-- 1. portal_unmark_completed（引数は 1026 units と同じ）
-- ============================================================
CREATE OR REPLACE FUNCTION signage.portal_unmark_completed(p_inspection_id uuid, p_target_month date, p_unit_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'pg_temp'
AS $function$
DECLARE
  r signage.signage_inspection_completions;
BEGIN
  -- 範囲: 管理者か、この点検（点検行または台のどれか）を保守する保守会社（inspection_in_scope）。管理会社は断る
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
  -- 台ごとの完了連絡は、連絡した保守会社か管理者だけ。台なしの完了連絡は全部の台の行に効くので、
  -- 上の範囲（この点検か台のどれかを保守する保守会社）なら取り消せる（修正依頼1026 再検証 X12）
  IF NOT signage.is_active_admin() AND r.property_unit_id IS NOT NULL
     AND r.vendor_id IS DISTINCT FROM signage.current_vendor_id() THEN
    RAISE EXCEPTION '完了連絡を取り消せるのは、連絡した保守会社か管理者だけです' USING ERRCODE = '42501';
  END IF;
  DELETE FROM signage.signage_inspection_completions WHERE id = r.id;
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION signage.portal_unmark_completed(uuid, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION signage.portal_unmark_completed(uuid, date, uuid) TO authenticated, service_role;

-- ============================================================
-- 2. 承認は portal_approve_entry_checked からだけ
-- ============================================================
CREATE OR REPLACE FUNCTION signage.portal_review_entry(p_entry_id uuid, p_action text, p_comment text DEFAULT NULL::text)
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
    -- 承認は版を照合した portal_approve_entry_checked からだけ（その関数が立てる印。1回で下ろす。修正依頼1026 再検証）
    IF coalesce(current_setting('signage.portal_approve_checked', true), '') <> 'on' THEN
      RAISE EXCEPTION '承認は portal_approve_entry_checked（見た版を渡す）で行ってください' USING ERRCODE = '42501';
    END IF;
    PERFORM set_config('signage.portal_approve_checked', 'off', true);
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

CREATE OR REPLACE FUNCTION signage.portal_approve_entry_checked(p_entry_id uuid, p_expected_updated_at timestamp with time zone)
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
  IF e.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION '申請が修正されました。最新の内容を確かめてから承認してください' USING ERRCODE = '40001';
  END IF;
  -- 版を確かめた印（portal_review_entry の approve がこれを見て、すぐ下ろす）
  PERFORM set_config('signage.portal_approve_checked', 'on', true);
  e := signage.portal_review_entry(p_entry_id, 'approve', NULL);
  PERFORM set_config('signage.portal_approve_checked', 'off', true);
  RETURN e;
END;
$function$;

REVOKE ALL ON FUNCTION signage.portal_review_entry(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION signage.portal_review_entry(uuid, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION signage.portal_approve_entry_checked(uuid, timestamp with time zone) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION signage.portal_approve_entry_checked(uuid, timestamp with time zone) TO authenticated, service_role;
