# 管理者メール通知 Edge Function

新規点検申請があった際に管理者へメール通知を送信します。

## セットアップ手順

### 1. Resend アカウント作成
1. https://resend.com にアクセス
2. アカウント作成（無料プランで月100通まで）
3. API Key を取得

### 2. Supabase シークレット設定
Supabase Dashboard > Project Settings > Edge Functions で以下を設定:

```bash
# ローカル開発時
supabase secrets set RESEND_API_KEY=re_xxxxx
supabase secrets set ADMIN_EMAIL=admin@example.com
supabase secrets set FROM_EMAIL=noreply@yourdomain.com
```

### 3. Edge Function デプロイ
```bash
supabase functions deploy notify-admin
```

### 4. Database Webhook 設定
Supabase Dashboard > Database > Webhooks で新規作成:

- **Name**: notify-admin-on-insert
- **Table**: signage_entries
- **Events**: INSERT
- **Type**: Supabase Edge Function
- **Function**: notify-admin

## ローカルテスト
```bash
supabase functions serve notify-admin
```

テストリクエスト:
```bash
curl -i --request POST \
  'http://localhost:54321/functions/v1/notify-admin' \
  --header 'Content-Type: application/json' \
  --data '{
    "type": "INSERT",
    "table": "signage_entries",
    "record": {
      "id": "test-id",
      "property_code": "2010",
      "vendor_name": "テスト業者",
      "inspection_type": "消防設備点検",
      "start_date": "2025-01-15",
      "end_date": "2025-01-20",
      "status": "pending",
      "created_at": "2025-01-10T10:00:00Z"
    },
    "old_record": null
  }'
```
