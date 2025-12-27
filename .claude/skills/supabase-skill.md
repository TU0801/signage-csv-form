# Supabaseスキル

## 概要
Supabaseとの連携方法。

## 接続設定
`js/config.js`に設定：
```javascript
window.SUPABASE_URL = '...';
window.SUPABASE_ANON_KEY = '...';
```

## クライアント（js/supabase-client.js）

### 認証関連
- `getUser()` - 現在のユーザー取得
- `getProfile()` - ユーザープロファイル取得
- `isAdmin()` - 管理者判定
- `signIn(email, password)` - ログイン
- `signOut()` - ログアウト

### マスターデータ取得
- `getAllMasterData()` - 全マスターデータ取得
- `getMasterProperties()` - 物件マスタ取得
- `getMasterVendors()` - 受注先マスタ取得
- `getMasterInspectionTypes()` - 点検種別マスタ取得

### マスターデータCRUD (v1.2.0追加)
- `addProperty(data)` / `updateProperty(id, data)` / `deleteProperty(id)`
- `addVendor(data)` / `updateVendor(id, data)` / `deleteVendor(id)`
- `addInspectionType(data)` / `updateInspectionType(id, data)` / `deleteInspectionType(id)`

### エントリー管理
- `getEntries()` - エントリー取得（自分のもの）
- `getAllEntries(filters)` - 全エントリー取得（管理者用）
- `createEntry(entry)` / `createEntries(entries)` - エントリー作成
- `updateEntry(id, entry)` - エントリー更新
- `deleteEntry(id)` - エントリー削除

### 承認ワークフロー (v1.2.0追加)
- `getPendingEntries()` - 承認待ちエントリー取得
- `approveEntry(id)` - 単一承認
- `approveEntries(ids)` - 一括承認
- `rejectEntry(id, reason)` - 却下

### ユーザー管理
- `getAllProfiles()` - 全ユーザー取得
- `updateProfileRole(id, role)` - 権限変更

## マスターデータ構成
```javascript
{
  properties: [...],      // 物件マスタ (30件)
  vendors: [...],         // 受注先マスタ (5件)
  inspectionTypes: [...]  // 点検種別マスタ (183件)
}
```

## REST API直接呼び出し
```bash
curl -X GET "${SUPABASE_URL}/rest/v1/テーブル名" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}"
```

## 注意事項
- 環境変数SUPABASE_URL, SUPABASE_ANON_KEYを使用
- オフラインモード対応（Supabase未設定時はローカルで動作）
- 認証が必要なページはgetUser()でチェック
- anon (public) キーのみ使用（service_roleキーは使用禁止）
