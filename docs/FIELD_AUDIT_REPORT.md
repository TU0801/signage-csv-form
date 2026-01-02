# フィールド監査レポート

**作成日**: 2025-12-31
**対象バージョン**: v1.18.14

---

## 🔍 監査結果

### ✅ 修正済みの問題

#### 1. inspection_types.notice_text → default_text
- **影響**: admin-masters.js, supabase-client.js
- **修正**: v1.18.13, v1.18.14
- **状態**: ✅ 完全修正

---

### ⚠️ 発見された問題（非クリティカル）

#### 1. properties.address フィールド
**問題**: コードで参照されているが、スキーマに存在しない

**場所**:
- supabase-client.js: `address: p.address || ''`
- script.js: `address: b.address || ''`
- admin.js: `address: property.address || ''`

**スキーマ**:
```sql
CREATE TABLE signage_master_properties (
  id UUID,
  property_code TEXT,
  property_name TEXT,
  terminals JSONB,
  created_at TIMESTAMP
  -- address フィールドなし ❌
);
```

**影響**:
- エラーは出ない（`|| ''` でフォールバック）
- address は常に空文字列
- 住所機能が実質的に動作していない

**対策オプション**:
1. スキーマにaddress列を追加（推奨）
   ```sql
   ALTER TABLE signage_master_properties
   ADD COLUMN address TEXT;
   ```

2. コードからaddress参照を削除
   - 影響: 住所表示機能の削除
   - リスク: 将来の機能拡張を制限

**推奨**: オプション1（列追加）

---

#### 2. vendors.category フィールド
**問題**: 一部コードで参照されているが、実際のスキーマにない可能性

**場所**:
- admin-masters.js: `data.category`

**確認必要**:
- vendor_categoryフィールドが実際に存在するか
- マイグレーションで追加されたか

---

### ✅ 正常なフィールド

以下は正しく使用されています：

**signage_master_vendors**:
- ✅ vendor_name
- ✅ emergency_contact
- ✅ inspection_type（マイグレーションで追加）

**signage_master_properties**:
- ✅ property_code
- ✅ property_name
- ✅ terminals

**signage_master_inspection_types**:
- ✅ inspection_name
- ✅ default_text（修正済み）
- ✅ template_no
- ✅ show_on_board

**signage_master_template_images**:
- ✅ image_key
- ✅ display_name
- ✅ image_url
- ✅ category（画像区分）
- ✅ sort_order

---

## 📋 推奨アクション

### 即座に対応

なし（クリティカルな問題はすべて修正済み）

### 将来的に対応

#### 1. addressフィールドの追加（オプション）
住所機能を有効化する場合：
```sql
ALTER TABLE signage_master_properties
ADD COLUMN IF NOT EXISTS address TEXT;
```

#### 2. vendor.categoryの確認
実際にフィールドが存在するか確認

---

## 📊 監査サマリー

- **チェックしたテーブル**: 6個
- **発見したクリティカルバグ**: 1個（修正済み）
- **発見した非クリティカル問題**: 2個
- **正常フィールド**: 15個

**総合評価**: ✅ 良好（クリティカル問題なし）
