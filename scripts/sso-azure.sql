-- 2026-10-24 Microsoft（Azure / Entra ID）ログインの受け入れ制限
-- 本番 baran(pdouwmjyswswfmzpfjzf) へは未適用。適用はユーザーの承認後（Management API で1文ずつ。BEGIN/COMMIT は付けない）
--
-- auth は noj / mansion / biz 等と共用で、mailer_autoconfirm=true のため、GoTrue はプロバイダが返すメールを
-- 検証済みとみなして同じメールの既存ユーザーへ自動でリンクする（supabase/auth internal/models/linking.go の
-- `email.Verified || config.Mailer.Autoconfirm`）。Azure プロバイダは全テナントを受け入れる設定
-- （external_azure_url=https://login.microsoftonline.com/organizations）にするので、次の2つを DB 側で塞ぐ。
--   1. 他テナントの利用者がメールを偽って既存ユーザーに入る → auth.identities のトリガーで tid とメールのドメインを照合
--   2. 公開サインアップで対象ドメインのメールを先に登録しておき、本人の Microsoft ログインがリンクされるのを待つ
--      → before user created フックで対象ドメインの新規作成を拒否（管理者の admin.createUser はフックを通らない）
-- 有効にする順番（逆にすると、トリガーが無い間に他テナントからの自動リンクが通る）:
--   1. この SQL を Management API に1リクエストで流す（BEGIN/COMMIT は付けない）
--   2. 読み取りで確認: auth.identities のトリガー signage_guard_azure_identity、関数2本、sso_tenants 3行、
--      has_function_privilege('supabase_auth_admin', 'signage.hook_before_user_created(jsonb)', 'EXECUTE')、
--      has_schema_privilege('supabase_auth_admin', 'signage', 'USAGE')（適用前の本番は false。無いとフックが呼べず新規作成が全部失敗する）
--   3. Auth 設定 hook_before_user_created_enabled=true / hook_before_user_created_uri=pg-functions://postgres/signage/hook_before_user_created
--   4. Auth 設定 uri_allow_list に https://signage.1984.jp/** を追記（共用なので現在の値を読み、末尾に足した全体を送る。
--      無いと Microsoft ログインの戻り先が site_url の noj になり、ログインが完了しない）
--   5. Azure プロバイダを有効化（external_azure_url=https://login.microsoftonline.com/organizations）
--   6. Vercel（signage-csv-form の production）に VITE_ENABLE_MICROSOFT_LOGIN=true を入れて再デプロイ（ボタンが出る）

-- 受け入れるテナントとメールのドメインの組。クライアントからは読ませない
CREATE TABLE IF NOT EXISTS signage.sso_tenants (
  email_domain text PRIMARY KEY CHECK (email_domain = lower(btrim(email_domain))),
  tid uuid NOT NULL,
  label text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE signage.sso_tenants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON signage.sso_tenants FROM PUBLIC, anon, authenticated;

-- テナント ID は https://login.microsoftonline.com/<domain>/v2.0/.well-known/openid-configuration の issuer で確認（2026-10-21）
INSERT INTO signage.sso_tenants (email_domain, tid, label) VALUES
  ('baran-ev.com', '9946e80c-e18e-41ac-93e0-00ea404d895a', '株式会社BARAN'),
  ('kken-tatemono.co.jp', 'da5209ec-4523-470c-b774-190a8c8971ae', '株式会社えん建物管理'),
  -- 長谷工グループ全体のテナントと見られる。九州以外の社員は事前登録が無ければフックで作成を拒否される
  ('haseko.co.jp', '5ba54a84-4c6e-4ea2-9a57-66d248275cdd', '株式会社長谷工コミュニティ九州')
ON CONFLICT (email_domain) DO NOTHING;

-- Azure の identity を作る・既存ユーザーへリンクするときだけ検査する（2回目以降のログインは UPDATE なので通らない）。
-- 例外にすると GoTrue のユーザー作成・リンクごとロールバックされ、ログインはエラーで戻る
CREATE OR REPLACE FUNCTION signage.guard_azure_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  -- auth.identities.email は生成列で、BEFORE トリガーの時点では計算されていないので identity_data から読む
  v_email text := lower(btrim(coalesce(NEW.identity_data->>'email', NEW.identity_data->'custom_claims'->>'email')));
  v_tid text := NEW.identity_data->'custom_claims'->>'tid';
  v_edov text := lower(NEW.identity_data->'custom_claims'->>'xms_edov');
BEGIN
  IF NEW.provider <> 'azure' THEN
    RETURN NEW;
  END IF;
  IF v_email IS NULL OR v_email = '' OR position('@' in v_email) = 0 OR v_tid IS NULL THEN
    RAISE EXCEPTION 'azure identity rejected: missing email or tid';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM signage.sso_tenants t
    WHERE t.enabled AND t.tid::text = lower(v_tid) AND t.email_domain = split_part(v_email, '@', 2)
  ) THEN
    RAISE EXCEPTION 'azure identity rejected: tenant or email domain not allowed';
  END IF;
  -- メールのドメインがテナントで検証済みであることも求める。Entra アプリで xms_edov をオプション要求に入れるので、
  -- 出ていない（設定漏れ）ときも拒否する（試験ログインで identity_data に出ていることを確かめる）
  IF v_edov IS NULL OR v_edov NOT IN ('true', '1') THEN
    RAISE EXCEPTION 'azure identity rejected: email domain not verified';
  END IF;
  -- 1人に紐づく Entra のアカウントは1つ（同じメールを名乗る別アカウントの自動リンクを防ぐ）。付け替えは管理者が古い行を消す
  IF EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = NEW.user_id AND i.provider = 'azure') THEN
    RAISE EXCEPTION 'azure identity rejected: user already has an azure identity';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION signage.guard_azure_identity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS signage_guard_azure_identity ON auth.identities;
CREATE TRIGGER signage_guard_azure_identity
  BEFORE INSERT ON auth.identities
  FOR EACH ROW EXECUTE FUNCTION signage.guard_azure_identity();

-- before user created フック（Auth 設定 hook_before_user_created_uri=pg-functions://postgres/signage/hook_before_user_created）。
-- 呼ばれるのは公開サインアップ・マジックリンク/OTP・外部プロバイダでの新規作成と、招待（inviteUserByEmail・generateLink の
-- signup/invite）。対象ドメインで通るのは admin.createUser（signage の Edge Function・biz・ダッシュボードの Create new user）だけ。
-- 既存ユーザーのメールを対象ドメインへ変える経路はフックを通らない。今これが塞がっているのは、変更が新しいアドレスへの
-- 確認メール経由でしか完了しないため（確認無しで即反映するのは匿名ユーザー×autoconfirm だけ。internal/api/user.go）。
-- 共用 Auth の external_anonymous_users_enabled=false と mailer_secure_email_change_enabled=true を変えないこと。
-- 対象ドメインは管理者の事前登録だけで作る。事前登録した人の Microsoft ログインはリンク（作成ではない）なので影響しない。
-- 未登録の人の Microsoft ログインも止める（プロファイル無しのユーザーが残ると、後の管理者登録が「既に登録」になるため）
CREATE OR REPLACE FUNCTION signage.hook_before_user_created(event jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_email text := lower(btrim(coalesce(event->'user'->>'email', '')));
BEGIN
  IF v_email <> '' AND EXISTS (
    SELECT 1 FROM signage.sso_tenants t
    WHERE t.enabled AND t.email_domain = split_part(v_email, '@', 2)
  ) THEN
    RETURN jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message', 'このメールアドレスは管理者による事前登録が必要です。管理者にお問い合わせください。'
    ));
  END IF;
  RETURN '{}'::jsonb;
END;
$$;

REVOKE ALL ON FUNCTION signage.hook_before_user_created(jsonb) FROM PUBLIC, anon, authenticated;
-- Auth は関数をスキーマ名つきで呼ぶので、スキーマの USAGE と関数の EXECUTE だけを渡す（表の権限は渡さない）
GRANT USAGE ON SCHEMA signage TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION signage.hook_before_user_created(jsonb) TO supabase_auth_admin;
