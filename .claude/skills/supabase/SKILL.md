---
name: supabase
description: Supabaseとの連携方法。DB操作時に参照。
allowed-tools: Read, Bash, Grep
---

# Supabaseスキル

## 接続設定
`js/config.js`にSUPABASE_URLとSUPABASE_ANON_KEYを設定

## クライアント（js/supabase-client.js）

### 認証
- `getUser()`, `getProfile()`, `isAdmin()`
- `signIn(email, password)`, `signOut()`

### マスターデータ
- `getAllMasterData()` - 全マスターデータ取得
- `getMasterProperties()`, `getMasterVendors()`, `getMasterInspectionTypes()`
- CRUD: `addProperty()`, `updateProperty()`, `deleteProperty()` など

### エントリー
- `getEntries()`, `getAllEntries(filters)`
- `createEntry()`, `createEntries()`, `updateEntry()`, `deleteEntry()`

### 承認ワークフロー
- `getPendingEntries()`, `approveEntry()`, `approveEntries()`, `rejectEntry()`

## REST API直接呼び出し
```bash
curl -X GET "${SUPABASE_URL}/rest/v1/テーブル名" \
  -H "apikey: ${SUPABASE_ANON_KEY}"
```

## 注意事項
- anon (public) キーのみ使用
- 認証必須ページはgetUser()でチェック
