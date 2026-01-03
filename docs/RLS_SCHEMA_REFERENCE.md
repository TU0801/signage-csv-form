# RLS/スキーマ完全リファレンス

**目的**: RLS確認漏れ（失敗パターン10件）を根絶する
**使い方**: 実装前に必ず参照・確認

---

## 📋 実装前チェックリスト

```bash
# 1. 対象テーブルのRLSを確認
□ このテーブルのRLSポリシーを確認した
□ SELECT権限を確認した
□ INSERT権限を確認した（該当時）
□ UPDATE権限を確認した（該当時）
□ DELETE権限を確認した（該当時）

# 2. フィールド名を確認
□ スキーマと照合した
□ snake_case vs camelCase を確認した
□ supabase-client.js のマッピングを確認した

# 3. 権限ロジックを理解
□ 一般ユーザーの権限を理解した
□ 管理者の権限を理解した
□ auth.uid() の使い方を確認した
```

---

## 🗂️ テーブル一覧

### 1. signage_profiles（ユーザープロファイル）

#### フィールド
```sql
id                UUID PRIMARY KEY (auth.users参照)
email             TEXT NOT NULL
company_name      TEXT
role              TEXT NOT NULL DEFAULT 'user' ('admin' | 'user')
vendor_id         UUID (signage_master_vendors参照)
created_at        TIMESTAMP WITH TIME ZONE
updated_at        TIMESTAMP WITH TIME ZONE
```

#### RLSポリシー
| 操作 | 一般ユーザー | 管理者 |
|------|-------------|--------|
| SELECT | ✅ 自分のみ | ✅ 全員 |
| UPDATE | ✅ 自分のみ | ❌ 専用関数使用 |
| INSERT | ❌ トリガーで自動作成 | ❌ トリガーで自動作成 |
| DELETE | ❌ CASCADE削除のみ | ❌ CASCADE削除のみ |

#### 重要な注意点
- ⚠️ **管理者がUPDATEする場合**: `updateUserProfile()` 関数を使用（RLS回避）
- ⚠️ `.single()` は使わない（406エラーの可能性）
- ⚠️ vendor_id は必須ではない（一般ユーザーのみ）

---

### 2. signage_entries（点検データ）

#### フィールド
```sql
id                    UUID PRIMARY KEY
user_id               UUID NOT NULL (auth.users参照)
property_code         TEXT NOT NULL
terminal_id           TEXT NOT NULL
vendor_name           TEXT NOT NULL
emergency_contact     TEXT
inspection_type       TEXT NOT NULL
template_no           TEXT
inspection_start      DATE
inspection_end        DATE
display_start_date    DATE
display_start_time    TEXT
display_end_date      DATE
display_end_time      TEXT
display_duration      INTEGER DEFAULT 10
announcement          TEXT
remarks               TEXT
poster_type           TEXT DEFAULT 'template' ('template' | 'custom')
poster_position       TEXT DEFAULT '4'
frame_no              TEXT DEFAULT '1'
status                TEXT DEFAULT 'draft' ('draft' | 'submitted')
created_at            TIMESTAMP WITH TIME ZONE
updated_at            TIMESTAMP WITH TIME ZONE (自動更新)
```

#### RLSポリシー
| 操作 | 一般ユーザー | 管理者 |
|------|-------------|--------|
| SELECT | ✅ user_id = auth.uid() | ✅ 全件 |
| INSERT | ✅ user_id = auth.uid() | ✅ 全件 |
| UPDATE | ✅ user_id = auth.uid() | ✅ 全件 |
| DELETE | ✅ user_id = auth.uid() | ✅ 全件 |

#### 重要な注意点
- ⚠️ **user_id は必須**: INSERTで自動設定（`createEntry()`）
- ⚠️ **updated_at は自動更新**: トリガーで更新
- ⚠️ 一般ユーザーは自分のエントリのみ表示・編集可能

---

### 3. signage_master_properties（物件マスター）

#### フィールド
```sql
id                UUID PRIMARY KEY
property_code     TEXT NOT NULL UNIQUE
property_name     TEXT NOT NULL
terminals         JSONB NOT NULL DEFAULT '[]'
                  [{terminalId: string, supplement: string}, ...]
address           TEXT
created_at        TIMESTAMP WITH TIME ZONE
```

#### RLSポリシー
| 操作 | 一般ユーザー | 管理者 |
|------|-------------|--------|
| SELECT | ✅ 全件 | ✅ 全件 |
| INSERT | ❌ 不可 | ✅ 可能 |
| UPDATE | ❌ 不可 | ✅ 可能 |
| DELETE | ❌ 不可 | ✅ 可能 |

#### 重要な注意点
- ⚠️ **terminals は JSONB配列**: `[{terminalId, supplement}, ...]`
- ⚠️ **getAllMasterData()**: 権限に応じてフィルタリング
  - 一般ユーザー: `getAssignedBuildings()` で担当ビルのみ
  - 管理者: 全ビル
- ⚠️ **getAllMasterDataCamelCase()**: property_code → propertyCode に変換

---

### 4. signage_master_vendors（受注先マスター）

#### フィールド
```sql
id                    UUID PRIMARY KEY
vendor_name           TEXT NOT NULL UNIQUE
emergency_contact     TEXT
category              TEXT
inspection_type       TEXT
created_at            TIMESTAMP WITH TIME ZONE
```

#### RLSポリシー
| 操作 | 一般ユーザー | 管理者 |
|------|-------------|--------|
| SELECT | ✅ 全件 | ✅ 全件 |
| INSERT | ❌ 不可 | ✅ 可能 |
| UPDATE | ❌ 不可 | ✅ 可能 |
| DELETE | ❌ 不可 | ✅ 可能 |

#### 重要な注意点
- ⚠️ **vendor_name vs vendorName**: getAllMasterDataCamelCase()で変換
- ⚠️ **emergency_contact vs emergencyContact**: 同上

---

### 5. signage_master_inspection_types（点検種別マスター）

#### フィールド
```sql
id                UUID PRIMARY KEY
inspection_name   TEXT NOT NULL UNIQUE
template_no       TEXT NOT NULL
template_image    TEXT
default_text      TEXT
category_id       INTEGER
show_on_board     BOOLEAN DEFAULT true
created_at        TIMESTAMP WITH TIME ZONE
```

#### RLSポリシー
| 操作 | 一般ユーザー | 管理者 |
|------|-------------|--------|
| SELECT | ✅ 全件 | ✅ 全件 |
| INSERT | ❌ 不可 | ✅ 可能 |
| UPDATE | ❌ 不可 | ✅ 可能 |
| DELETE | ❌ 不可 | ✅ 可能 |

#### 重要な注意点
- ⚠️ **default_text vs noticeText**: getAllMasterDataCamelCase()でnoticeTextに変換
- ⚠️ **inspection_name vs inspectionType**: 同上

---

### 6. signage_master_template_images（テンプレート画像マスター）

#### フィールド
```sql
id            UUID PRIMARY KEY
image_key     TEXT NOT NULL UNIQUE
display_name  TEXT NOT NULL
image_url     TEXT NOT NULL
category      TEXT
sort_order    INTEGER DEFAULT 0
created_at    TIMESTAMP WITH TIME ZONE
```

#### RLSポリシー
| 操作 | 一般ユーザー | 管理者 |
|------|-------------|--------|
| SELECT | ✅ 全件 | ✅ 全件 |
| INSERT | ❌ 不可 | ✅ 可能 |
| UPDATE | ❌ 不可 | ✅ 可能 |
| DELETE | ❌ 不可 | ✅ 可能 |

---

### 7. building_vendors（物件×ベンダー紐付け）

#### フィールド
```sql
id              UUID PRIMARY KEY
property_code   TEXT NOT NULL (signage_master_properties参照)
vendor_id       UUID NOT NULL (signage_master_vendors参照)
status          TEXT DEFAULT 'pending' ('pending' | 'active' | 'deleted')
requested_by    UUID (auth.users参照)
approved_by     UUID (auth.users参照)
created_at      TIMESTAMP WITH TIME ZONE
```

#### RLSポリシー
| 操作 | 一般ユーザー | 管理者 |
|------|-------------|--------|
| SELECT | ✅ vendor_id = profile.vendor_id | ✅ 全件 |
| INSERT | ✅ status='pending' | ✅ status='active' |
| UPDATE | ❌ 不可 | ✅ 可能（承認・却下） |
| DELETE | ❌ 不可 | ✅ 可能 |

#### 重要な注意点
- ⚠️ **一般ユーザー**: INSERT時は status='pending'、管理者承認待ち
- ⚠️ **管理者**: INSERT時は status='active'、即時有効
- ⚠️ **getAssignedBuildings()**: vendor_idに基づいてフィルタリング

---

### 8. signage_vendor_inspections（ベンダー×点検種別紐付け）

#### フィールド
```sql
id              UUID PRIMARY KEY
vendor_id       UUID NOT NULL (signage_master_vendors参照)
inspection_id   UUID NOT NULL (signage_master_inspection_types参照)
status          TEXT DEFAULT 'active' ('active' | 'inactive')
created_at      TIMESTAMP WITH TIME ZONE
```

#### RLSポリシー
| 操作 | 一般ユーザー | 管理者 |
|------|-------------|--------|
| SELECT | ✅ 全件 | ✅ 全件 |
| INSERT | ❌ 不可 | ✅ 可能 |
| UPDATE | ❌ 不可 | ✅ 可能 |
| DELETE | ❌ 不可 | ✅ 可能 |

---

### 9. signage_master_categories（カテゴリマスター）

#### フィールド
```sql
id             UUID PRIMARY KEY
category_name  TEXT NOT NULL UNIQUE
sort_order     INTEGER DEFAULT 0
created_at     TIMESTAMP WITH TIME ZONE
```

#### RLSポリシー
| 操作 | 一般ユーザー | 管理者 |
|------|-------------|--------|
| SELECT | ✅ 全件 | ✅ 全件 |
| INSERT | ❌ 不可 | ✅ 可能 |
| UPDATE | ❌ 不可 | ✅ 可能 |
| DELETE | ❌ 不可 | ✅ 可能 |

---

### 10. signage_master_settings（設定マスター）

#### フィールド
```sql
id             UUID PRIMARY KEY
setting_key    TEXT NOT NULL UNIQUE
setting_value  TEXT
updated_at     TIMESTAMP WITH TIME ZONE
```

#### RLSポリシー
| 操作 | 一般ユーザー | 管理者 |
|------|-------------|--------|
| SELECT | ✅ 全件 | ✅ 全件 |
| INSERT | ❌ 不可 | ✅ 可能 |
| UPDATE | ❌ 不可 | ✅ 可能 |
| DELETE | ❌ 不可 | ✅ 可能 |

---

## 🚨 よくある失敗パターン

### パターン1: UPDATE成功するがデータ保存されない

**症状**: エラーなし、でもDBが更新されない

**原因**: RLSポリシーがUPDATEを許可していない

**対策**:
```javascript
// ❌ 間違い: 管理者が一般ユーザーを更新
await supabase
  .from('signage_profiles')
  .update({ role: 'admin' })
  .eq('id', userId);
// → エラーなしだがDBは更新されない（RLSで拒否）

// ✅ 正しい: updateUserProfile() を使用
await updateUserProfile(userId, { role: 'admin' });
// → RLSを回避して更新
```

---

### パターン2: SELECT結果が空配列

**症状**: データはあるのにSELECTが[]を返す

**原因**: SELECT権限がない

**対策**:
```javascript
// ❌ 間違い: 一般ユーザーが全プロファイル取得
const { data } = await supabase
  .from('signage_profiles')
  .select('*');
// → 自分のプロファイルのみ返る（RLSでフィルタ）

// ✅ 正しい: 管理者チェック
const isAdminUser = await isAdmin();
if (isAdminUser) {
  const { data } = await getAllProfiles();
}
```

---

### パターン3: 406 Not Acceptable

**症状**: .single()で406エラー

**原因**: RLSで複数行/0行が返される

**対策**:
```javascript
// ❌ 間違い: .single()使用
const { data } = await supabase
  .from('signage_profiles')
  .select('*')
  .eq('email', email)
  .single();
// → RLSで0件または2件以上の場合は406

// ✅ 正しい: .single()を避ける
const { data } = await supabase
  .from('signage_profiles')
  .select('*')
  .eq('email', email);
const profile = data && data.length > 0 ? data[0] : null;
```

---

### パターン4: フィールド名不一致

**症状**: undefinedエラー、データが表示されない

**原因**: snake_case vs camelCase混在

**対策**:
```javascript
// ❌ 間違い: フィールド名を推測
const vendorName = vendor.vendorName; // undefined

// ✅ 正しい: スキーマを確認
const vendorName = vendor.vendor_name; // OK

// または camelCase変換関数を使用
const data = await getAllMasterDataCamelCase();
const vendorName = data.vendors[0].vendorName; // OK
```

---

## 🔍 実装時の確認フロー

```
1. どのテーブルを操作する？
   ↓
2. このリファレンスで該当テーブルを確認
   ↓
3. RLSポリシーを確認
   - 一般ユーザーは何ができる？
   - 管理者は何ができる？
   ↓
4. フィールド名を確認
   - snake_case? camelCase?
   - マッピング関数使用？
   ↓
5. 実装
   ↓
6. テスト
   - 一般ユーザーでテスト
   - 管理者でテスト
   - DBデータ確認
```

---

## 📚 参考コード

### RLS確認コマンド（Supabase Dashboard SQL Editor）
```sql
-- テーブルのRLSポリシー一覧
SELECT * FROM pg_policies WHERE tablename = 'signage_profiles';

-- 現在のユーザーID確認
SELECT auth.uid();

-- ポリシーのテスト
SET request.jwt.claims TO '{"sub": "USER_UUID"}';
SELECT * FROM signage_profiles;
```

### supabase-client.js の主要関数
```javascript
// マスターデータ取得（権限フィルタ付き）
getAllMasterData()          // snake_case、物件はグループ化
getAllMasterDataCamelCase() // camelCase、物件はフラット

// 担当ビル取得
getAssignedBuildings()      // 一般ユーザー: vendor_idに基づく
                            // 管理者: 全ビル

// 管理者専用: ユーザー更新
updateUserProfile(id, updates) // RLS回避
```

---

**このリファレンスを実装前に必ず確認して、RLS確認漏れをゼロにします。**
