-- 2026-09-13 修正依頼0913: ユーザー無効化の status 列と、プロファイルの権限昇格防止
-- 本番 baran(pdouwmjyswswfmzpfjzf) の signage スキーマへ適用済み。Management API では BEGIN/COMMIT を付けず1文ずつ流すこと

-- 1. 無効化用の状態列（旧DBの add-user-status.sql が移設時に未適用だった）
ALTER TABLE signage.signage_profiles
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

ALTER TABLE signage.signage_profiles
  DROP CONSTRAINT IF EXISTS signage_profiles_status_check;

ALTER TABLE signage.signage_profiles
  ADD CONSTRAINT signage_profiles_status_check CHECK (status IN ('active', 'inactive'));

-- 2. 管理者以外が role / vendor_id / status / email を書き換える・プロファイルを作ることを拒否する。
--    RLS「Users can update own profile」「Allow authenticated insert」だけでは自分を admin に昇格できた。
--    JWT を持たない経路（service_role の Edge Function、Auth の handle_new_user トリガー、管理SQL）は対象外
CREATE OR REPLACE FUNCTION signage.guard_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = signage, pg_temp
AS $$
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
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION '権限・保守会社・状態・メールアドレスの変更は管理者のみ可能です' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_privileged_columns ON signage.signage_profiles;

CREATE TRIGGER guard_profile_privileged_columns
  BEFORE INSERT OR UPDATE ON signage.signage_profiles
  FOR EACH ROW EXECUTE FUNCTION signage.guard_profile_privileged_columns();
