# 実装ギャップ分析レポート

**作成日**: 2025-12-31
**対象バージョン**: v1.13.2
**分析者**: Claude Code

---

## 🔍 発見された未実装機能

### 1. 管理者用「メンテナンス会社選択」ドロップダウン

**優先度**: 🔴 HIGH（元仕様の要件）

**元の仕様**:
> 管理者の場合：
> メンテナンス会社: [日立エレベーター ▼]  ← 管理者のみ表示
> 点検種別: EV点検（自動表示）
>
> 選択したメンテナンス会社として入力できる

**現状**: ❌ 未実装
- index.html: ベンダー選択ドロップダウンなし
- bulk.html: ベンダー選択ドロップダウンなし
- 管理者は自分のvendor_idでしか入力できない

**影響**:
- 管理者が他社の代わりに入力できない
- 元仕様の「全メンテナンス会社を選択可能」が実現できていない

**実装方法**:
1. index.html/bulk.htmlに管理者専用のベンダー選択ドロップダウンを追加
2. `isAdmin()` でドロップダウンの表示/非表示を制御
3. 選択したvendor_idで `createEntries()` を呼び出す
4. ベンダー選択時に担当ビルと点検種別を動的更新

---

### 2. 一般ユーザー用「新規物件追加リクエスト」ボタン

**優先度**: 🟡 MEDIUM（元仕様の要件）

**元の仕様**:
> 一般ユーザー画面に「新規物件追加リクエスト」ボタン
> building_vendorsにstatus='pending'で登録
> 管理者の承認画面と連携

**現状**: ❌ 未実装
- index.html: リクエストボタンなし
- bulk.html: リクエストボタンなし
- API関数 `addBuildingVendor()` は実装済み
- 管理画面の承認機能は実装済み

**影響**:
- 一般ユーザーが新しいビルの追加を依頼できない
- 管理者が手動で紐付けを作成する必要がある

**実装方法**:
1. 物件選択ドロップダウンの下に「+ 新規物件を追加リクエスト」ボタンを追加
2. モーダルで物件情報（コード、名前、端末ID）を入力
3. `addBuildingVendor(propertyCode)` でpending状態で登録
4. トースト通知「管理者の承認待ちです」

---

### 3. 管理者用ベンダーの自動作成

**優先度**: 🟢 LOW（運用の問題）

**元の仕様**:
> SQL: `add-admin-vendor.sql` で「管理者（BARAN）」を作成
> 管理者ユーザーはこのベンダーに紐付ける

**現状**: ⚠️ 半実装
- SQLファイルは存在
- ユーザーが手動で実行する必要がある
- 実行されていない可能性

**影響**:
- 管理者ユーザーのvendor_idがNULLの可能性
- 管理者が入力画面でエラーになる可能性

**確認方法**:
```sql
SELECT id, vendor_name FROM signage_master_vendors
WHERE vendor_name = '管理者（BARAN）';

SELECT id, email, vendor_id, role FROM signage_profiles
WHERE role = 'admin';
```

**対応**:
- 管理者ユーザーのvendor_idが設定されているか確認
- 未設定なら `add-admin-vendor.sql` を実行

---

## 🐛 発見された潜在的バグ

### 1. データ型の不一致（property_code）

**優先度**: 🟡 MEDIUM

**問題**:
- `signage_master_properties.property_code` はTEXT型
- `building_vendors.property_code` はTEXT型
- しかし、実際のデータは数値（例: 2010, 120109）
- JavaScriptで `String()` 変換が必要

**影響箇所**:
- `editPropertyByCode()` - 既に `String()` で対応済み ✅
- `getBuildingsByVendor()` - 要確認
- CSV出力 - 要確認

**確認コード**:
```javascript
// admin.js:1151
const property = masterData.properties.find(p =>
  String(p.property_code) === String(propertyCode)
);
```

**推奨**: 全箇所で `String()` 変換を統一

---

### 2. vendor.inspection_type の未設定データ

**優先度**: 🟢 LOW

**問題**:
- `signage_master_vendors.inspection_type` カラムは追加したが
- 既存データは `assign_default_inspection_types()` 実行が必要
- 実行されていない可能性

**影響**:
- ベンダー一覧で「点検種別: -」と表示される
- ベンダーフィルターが正しく機能しない可能性

**確認方法**:
```sql
SELECT vendor_name, inspection_type
FROM signage_master_vendors
WHERE inspection_type IS NULL;
```

**対応**:
```sql
SELECT assign_default_inspection_types();
```

---

### 3. 物件一覧に物件名が表示されない（紐付け管理）

**優先度**: 🔴 HIGH

**問題**:
- 紐付け管理の物件タブで、物件コードのみ表示
- 物件名が表示されない

**現状**: ✅ v1.13.0で修正済み
- `renderBuildingVendorRelationships()` で物件名を表示するように修正
- `getMasterProperties()` で物件名を取得

---

## 🔄 データ整合性の確認事項

### 1. 全ビル×全ベンダーの紐付け初期化

**問題**:
- `initialize_building_vendors()` が実行されていない可能性
- 一般ユーザーがビルを見られない

**確認方法**:
```sql
SELECT COUNT(*) FROM building_vendors WHERE status = 'active';
-- 期待値: (物件数) × (ベンダー数)
-- 例: 24物件 × 4ベンダー = 96件
```

**対応**:
```sql
SELECT initialize_building_vendors();
```

---

### 2. 全ベンダー×全点検種別の紐付け初期化

**問題**:
- `initialize_signage_vendor_inspections()` が実行されていない可能性
- 点検種別タブが空になる

**確認方法**:
```sql
SELECT COUNT(*) FROM signage_vendor_inspections WHERE status = 'active';
-- 期待値: (ベンダー数) × (点検種別数)
```

**対応**:
```sql
SELECT initialize_signage_vendor_inspections();
```

---

## 📋 実装優先度リスト

### すぐに実装すべき（HIGH）

1. **管理者用ベンダー選択ドロップダウン** (index.html, bulk.html)
   - 理由: 元仕様の要件、管理者の主要機能
   - 工数: 2-3時間
   - 影響: index.html, bulk.html, script.js, bulk.js

### できれば実装（MEDIUM）

2. **一般ユーザー用「物件追加リクエスト」ボタン** (index.html, bulk.html)
   - 理由: ユーザビリティ向上
   - 工数: 1-2時間
   - 影響: index.html, bulk.html

### 運用で対応可能（LOW）

3. **初期データセットアップの自動化**
   - 理由: SQLを手動実行すれば済む
   - 工数: 1時間
   - 影響: なし（運用手順の問題）

---

## 🎯 推奨アクション

### すぐに対応すべきこと

1. **Supabase初期データ実行確認**
   ```sql
   -- これらが実行されているか確認
   SELECT assign_default_inspection_types();
   SELECT initialize_building_vendors();
   SELECT initialize_signage_vendor_inspections();
   ```

2. **管理者ベンダーの作成確認**
   ```sql
   SELECT * FROM signage_master_vendors WHERE vendor_name = '管理者（BARAN）';
   -- 存在しなければ add-admin-vendor.sql を実行
   ```

3. **管理者のvendor_id設定確認**
   ```sql
   SELECT email, vendor_id, role FROM signage_profiles WHERE role = 'admin';
   -- vendor_id が NULL なら手動設定
   ```

### 次に実装すべき機能

**管理者用ベンダー選択ドロップダウン**を最優先で実装することを推奨。

元仕様の重要な要件であり、管理者が他社の代わりにデータ入力できないという致命的な問題がある。

---

## 質問事項

以下の点について確認が必要です：

1. **管理者用ベンダー選択ドロップダウンは必須ですか？**
   - 必須なら最優先で実装
   - 不要なら仕様から削除

2. **一般ユーザーの物件追加リクエストボタンは必須ですか？**
   - 必須なら実装
   - 不要なら管理者が手動で紐付け作成

3. **初期データ（building_vendors, vendor_inspections）は実行済みですか？**
   - 未実行なら今すぐ実行必要
   - 実行済みならOK

4. **管理者ユーザーのvendor_idは設定されていますか？**
   - 未設定なら管理画面でデータ入力できない
   - 設定済みならOK

---

**次のアクション**: ユーザーに質問して実装優先度を確認
