-- 2026-09-13 承認フローの迂回防止（再検証 Workflow の指摘）
-- 本番 baran(pdouwmjyswswfmzpfjzf) へ適用済み。Management API では BEGIN/COMMIT を付けず1文ずつ流すこと
--
-- 一般ユーザーが API を直接呼ぶと、自分のエントリを status=ready/exported（承認済み・CSV出力対象）で登録したり、
-- 申請後に自分で承認済みへ変えたり、承認済みの本文を書き換え・削除できた（RLS は auth.uid()=user_id しか見ていない）。
-- ステータスの意味: pending=未申請 / draft=申請済み（承認待ち）/ ready=承認済み / exported=CSV出力済み
-- 画面での一般ユーザーの操作は「pending か draft で登録」「pending→draft で申請」だけなので、それ以外を管理者に限る。

CREATE OR REPLACE FUNCTION signage.guard_entry_approval_flow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = signage, pg_temp
AS $$
BEGIN
  -- JWT を持たない経路（service_role・管理SQL）と有効な管理者は対象外
  IF auth.uid() IS NULL OR signage.is_active_admin() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.status IS DISTINCT FROM 'pending' AND OLD.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION '承認済みのデータは変更・削除できません（管理者にお問い合わせください）' USING ERRCODE = '42501';
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.status IS DISTINCT FROM 'pending' AND NEW.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION '承認済みにできるのは管理者のみです' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS guard_entry_approval_flow ON signage.signage_entries;

CREATE TRIGGER guard_entry_approval_flow
  BEFORE INSERT OR UPDATE OR DELETE ON signage.signage_entries
  FOR EACH ROW EXECUTE FUNCTION signage.guard_entry_approval_flow();
