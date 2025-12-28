-- ========================================
-- Database Webhook 設定 (pg_net 拡張使用)
-- ========================================
-- 注: Supabase DashboardからWebhookを設定する方が簡単です
-- Dashboard > Database > Webhooks で設定してください

-- Edge Function URL (デプロイ後に確認)
-- https://[PROJECT_REF].supabase.co/functions/v1/notify-admin

-- ========================================
-- 代替案: pg_net を使った直接HTTP呼び出し
-- ========================================

-- pg_net 拡張を有効化 (Supabase では既に有効)
-- CREATE EXTENSION IF NOT EXISTS pg_net;

-- トリガー関数
CREATE OR REPLACE FUNCTION notify_admin_on_new_entry()
RETURNS TRIGGER AS $$
DECLARE
  edge_function_url TEXT := 'https://rzfbmmmtrbxwkxtsvypi.supabase.co/functions/v1/notify-admin';
  service_role_key TEXT := ''; -- Supabase Dashboard から取得
BEGIN
  -- status が 'pending' の場合のみ通知
  IF NEW.status = 'pending' THEN
    PERFORM net.http_post(
      url := edge_function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_role_key
      ),
      body := jsonb_build_object(
        'type', 'INSERT',
        'table', 'signage_entries',
        'record', row_to_json(NEW),
        'old_record', NULL
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- トリガー作成
-- DROP TRIGGER IF EXISTS on_new_entry_notify ON signage_entries;
-- CREATE TRIGGER on_new_entry_notify
--   AFTER INSERT ON signage_entries
--   FOR EACH ROW
--   EXECUTE FUNCTION notify_admin_on_new_entry();
