# Supabaseスキル

## 概要
Supabaseとの連携方法。

## 接続設定
`js/config.js`に設定：
```javascript
window.SUPABASE_URL = '...';
window.SUPABASE_KEY = '...';
```

## クライアント（js/supabase-client.js）
主要な関数:
- `getUser()` - 現在のユーザー取得
- `getProfile()` - ユーザープロファイル取得
- `isAdmin()` - 管理者判定
- `signIn(email, password)` - ログイン
- `signOut()` - ログアウト
- `getAllMasterData()` - マスターデータ取得

## マスターデータ構成
```javascript
{
  properties: [...],    // 物件マスタ
  terminals: [...],     // 端末マスタ
  vendors: [...],       // 受注先マスタ
  inspectionTypes: [...] // 点検種別マスタ
}
```

## REST API直接呼び出し
```bash
curl -X GET "${SUPABASE_URL}/rest/v1/テーブル名" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}"
```

## 注意事項
- 環境変数SUPABASE_URL, SUPABASE_KEYを使用
- オフラインモード対応（Supabase未設定時はローカルで動作）
- 認証が必要なページはgetUser()でチェック
