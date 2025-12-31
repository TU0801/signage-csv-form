# 学んだ教訓とよくあるミス

このファイルは、過去118コミットの開発履歴から抽出した教訓をまとめたものです。**同じミスを繰り返さない**ために、実装・修正時に必ず参照してください。

最終更新: 2025-12-31

---

## 目次
1. [フォームバリデーション](#1-フォームバリデーション)
2. [データ型の不一致](#2-データ型の不一致)
3. [テーブル命名規則](#3-テーブル命名規則)
4. [API/FK参照の問題](#4-apifk参照の問題)
5. [UI表示の問題](#5-ui表示の問題)
6. [タイポ・スペルミス](#6-タイポスペルミス)
7. [テスト関連](#7-テスト関連)
8. [ユーザー管理](#8-ユーザー管理)

---

## 1. フォームバリデーション

### 問題：非表示フィールドのrequired属性エラー

**発生日**: 2025-12-31 (v1.13.2)
**ファイル**: `admin-masters.js`

#### 症状
- モーダルで「保存」ボタンをクリックしても何も起こらない
- ブラウザコンソールに「An invalid form control with name='...' is not focusable」エラー
- 非表示タブのrequired inputが検証されてしまう

#### 原因
```javascript
// ❌ 悪い例：非表示のままrequired属性が残る
sectionA.style.display = 'none';  // required inputが隠れたまま
sectionB.style.display = 'block'; // こちらのタブを表示
```

#### 解決策
```javascript
// ✅ 良い例：非表示セクションのinputをdisableにする
allSections.forEach(section => {
  section.style.display = 'none';
  section.querySelectorAll('input, select, textarea').forEach(el => {
    el.disabled = true;  // 重要！
  });
});

activeSection.style.display = 'block';
activeSection.querySelectorAll('input, select, textarea').forEach(el => {
  el.disabled = false;  // アクティブなタブのみ有効化
});
```

#### チェックリスト
- [ ] タブ切り替え時にdisabled属性を適切に設定しているか
- [ ] 非表示セクションのinputがform検証から除外されているか
- [ ] モーダルの「保存」ボタンが正常に動作するか手動テストしたか

---

## 2. データ型の不一致

### 問題A：文字列 vs 数値の比較ミス

**発生日**: 2025-12-29 (Bug #1)
**ファイル**: `script.js:311`, `admin.js:972,999,1003`

#### 症状
```javascript
// Supabaseから取得したpropertyCodeは"2010"（文字列）
// しかしコードでparseInt()で比較していた
const property = masterData.properties.find(
  p => parseInt(p.property_code) === parseInt(propertyCode)  // ❌
);
```

#### 原因
- Supabaseのデータは文字列型で返される
- `parseInt()`を使うと、`"2010A"`のような文字列が`2010`として扱われる危険性がある

#### 解決策
```javascript
// ✅ 良い例：String()で統一
const property = masterData.properties.find(
  p => String(p.property_code) === String(propertyCode)
);
```

#### チェックリスト
- [ ] Supabaseから取得したデータは文字列として扱っているか
- [ ] 数値比較が必要な場合は明示的に`Number()`を使用しているか
- [ ] `parseInt()`は必要最小限にしているか

### 問題B：JSONデータ構造の変更

**発生日**: 2025-12-29 (Bug #5)
**ファイル**: `supabase-client.js:112-143`

#### 症状
- 端末セレクトボックスに`value="undefined"`が表示される
- 物件選択後、端末が正しく表示されない

#### 原因
```javascript
// データベースの構造が変更された
// 旧: { property_code: "2010", terminal_id: "h0001A00" }
// 新: { property_code: "2010", terminals: [{ terminal_id: "h0001A00", supplement: "" }] }

// コードは旧形式を期待していた
const terminalId = property.terminal_id;  // ❌ undefined
```

#### 解決策
```javascript
// ✅ 良い例：両方の形式に対応
const terminals = Array.isArray(property.terminals)
  ? property.terminals  // 新形式（JSON配列）
  : property.terminal_id
    ? [{ terminal_id: property.terminal_id, supplement: property.supplement || '' }]  // 旧形式
    : [];
```

#### チェックリスト
- [ ] データベーススキーマ変更時に影響範囲を確認したか
- [ ] 新旧両方のデータ形式に対応しているか
- [ ] マイグレーション前後で動作確認したか

---

## 3. テーブル命名規則

### 問題：signage_プレフィックスの有無

**発生日**: 2025-12-31 (dec5340)
**ファイル**: 複数

#### 症状
- `vendor_inspections`テーブルが見つからないエラー
- RLSポリシーが適用されない

#### 原因
```sql
-- ❌ 古い命名（プレフィックスなし）
SELECT * FROM vendor_inspections;

-- ✅ 新しい命名（signage_ プレフィックス）
SELECT * FROM signage_vendor_inspections;
```

#### 解決策
**すべてのテーブルに`signage_`プレフィックスをつける**

| 旧名 | 新名 |
|------|------|
| `vendor_inspections` | `signage_vendor_inspections` |
| `profiles` | `signage_profiles` |
| `entries` | `signage_entries` |
| `master_properties` | `signage_master_properties` |

#### チェックリスト
- [ ] 新規テーブル作成時に`signage_`プレフィックスをつけているか
- [ ] 既存テーブル参照時に正しいテーブル名を使用しているか
- [ ] マイグレーションSQLでもプレフィックスを統一しているか

---

## 4. API/FK参照の問題

### 問題：存在しない外部キーの参照

**発生日**: 2025-12-31 (v1.13.2)
**ファイル**: `supabase-client.js:getPendingBuildingRequests()`

#### 症状
- API呼び出しで400エラー
- エラーメッセージ: `building_vendors_requested_by_fkey not found`

#### 原因
```javascript
// ❌ 複雑すぎる外部キー結合
const { data, error } = await supabase
  .from('building_vendors')
  .select(`
    *,
    requested_by:signage_profiles!building_vendors_requested_by_fkey(email)
  `)
  .eq('status', 'pending');
```

#### 解決策
```javascript
// ✅ シンプルなクエリ + 別関数で解決
const { data, error } = await supabase
  .from('building_vendors')
  .select('*')
  .eq('status', 'pending');

// requested_by（UUID）をメールアドレスに変換する別関数を使用
async function getUserEmail(userId) {
  const { data } = await supabase
    .from('signage_profiles')
    .select('email')
    .eq('id', userId)
    .single();
  return data?.email || 'Unknown';
}
```

#### チェックリスト
- [ ] FK結合が複雑すぎないか（3階層以上は避ける）
- [ ] カスタム外部キー名が正しく設定されているか
- [ ] エラー時にシンプルなクエリに分割できるか検討したか

---

## 5. UI表示の問題

### 問題：テキストのオーバーラップと見切れ

**発生日**: 2025-12-31 (e8ff519, 4dbcfa9, 4f81f7c)
**ファイル**: `admin.html`, CSS

#### 症状
- マスター一覧で長いテキストが重なって表示される
- `text-overflow: ellipsis`で重要な情報が見えない
- グリッドの列幅が狭すぎる

#### 原因
```css
/* ❌ 悪い例 */
.master-item {
  display: grid;
  grid-template-columns: 200px 300px auto;  /* 固定幅で狭い */
  gap: 1rem;  /* gap が小さすぎる */
}

.master-item-name {
  overflow: hidden;
  text-overflow: ellipsis;  /* 重要な情報が隠れる */
  white-space: nowrap;
}
```

#### 解決策
```css
/* ✅ 良い例 */
.master-item {
  display: grid;
  grid-template-columns: minmax(180px, 2fr) minmax(350px, 5fr) auto;
  gap: 2rem;  /* 十分な gap でオーバーラップ防止 */
}

.master-item-name {
  /* text-truncation を削除し、改行を許可 */
  word-wrap: break-word;
  overflow-wrap: break-word;
}
```

#### チェックリスト
- [ ] `minmax()`を使ってレスポンシブな列幅にしているか
- [ ] `gap`が十分に設定されているか（2rem推奨）
- [ ] 重要な情報が`text-overflow: ellipsis`で隠れていないか
- [ ] 長いテキストでもレイアウトが崩れないか確認したか

---

## 6. タイポ・スペルミス

### 問題：キー名のスペルミス

**発生日**: 2025-12-29 (Bug #2)
**ファイル**: `script.js:30`, `images/automtic_doors.png`

#### 症状
- 「自動扉点検」を選択してもテンプレート画像が表示されない

#### 原因
```javascript
// JSのキー: automatic_doors (正しい)
const templateImages = {
  automatic_doors: 'images/automatic_doors.png',
};

// 実際のファイル名: automtic_doors.png (a が抜けている)
```

#### 解決策
1. **定数化して一元管理**
```javascript
// config.js で定数化
export const TEMPLATE_KEYS = {
  AUTOMATIC_DOORS: 'automatic_doors',
  ELEVATOR: 'elevator_inspection',
  // ...
};
```

2. **TypeScriptやJSDoc型定義を使用**
```javascript
/**
 * @typedef {'automatic_doors' | 'elevator_inspection' | ...} TemplateKey
 * @param {TemplateKey} key
 */
function getTemplateImage(key) {
  // ...
}
```

3. **ファイル名とキー名を一致させる命名規則**

#### チェックリスト
- [ ] ファイル名とコード内のキーが一致しているか
- [ ] 定数化して一元管理しているか
- [ ] スペルチェッカーを使用しているか
- [ ] コードレビュー時にタイポを確認しているか

---

## 7. テスト関連

### 問題A：モックデータと本番データの乖離

**発生日**: 2025-12-29
**ファイル**: `test-helpers.js`

#### 症状
- テストはPASSするが、本番では動作しない
- モックデータの構造が古い

#### 原因
```javascript
// ❌ モックデータが旧形式
properties: [
  { property_code: "2010", terminal_id: "h0001A00" }  // 旧形式
]

// 本番データは新形式
properties: [
  { property_code: "2010", terminals: [{ terminal_id: "h0001A00" }] }
]
```

#### 解決策
- **マイグレーション後は必ずモックデータも更新する**
- **本番データの実際の構造を確認してからモックを作成する**

```javascript
// ✅ 最新の構造に合わせる
properties: [
  {
    property_code: "2010",
    property_name: "エンクレスト",
    terminals: [
      { terminal_id: "h0001A00", supplement: "" }
    ]
  }
]
```

#### チェックリスト
- [ ] モックデータが本番データと同じ構造か
- [ ] スキーマ変更時にモックも更新したか
- [ ] 本番環境でも手動テストを実施したか

### 問題B：テストの過剰な細分化

**発生日**: 2025-12-28 (ff02c0d)
**ファイル**: テストファイル全般

#### 症状
- 426個の細かすぎるユニットテスト
- テスト実行に時間がかかる
- ユーザー行動とかけ離れている

#### 解決策
- **ユーザーのE2Eフローをテストする方針に変更**
- 426テスト → 48テストに削減
- 「物件を選択→端末が自動設定される」のような実際の操作フローをテスト

#### チェックリスト
- [ ] テストはユーザーの実際の操作フローを再現しているか
- [ ] 実装の詳細ではなく、ユーザー体験をテストしているか
- [ ] テスト名が日本語で分かりやすいか

---

## 8. ユーザー管理

### 問題：会社名フィールドの不要な追加

**発生日**: 2025-12-31 (21c70b1)
**ファイル**: ユーザー管理関連

#### 症状
- `company_name`フィールドを追加したが、実際には`vendor_id`で管理している
- データの重複と不整合

#### 原因
- 既存のデータモデルを理解せずに新しいフィールドを追加
- `signage_master_vendors`テーブルで受注先を管理しているのに、ユーザーテーブルに`company_name`を持たせた

#### 解決策
- **既存のデータモデルを確認してから実装する**
- `vendor_id`（外部キー）で紐付け、`company_name`は削除

```javascript
// ❌ 悪い例：冗長なデータ
{
  user_id: 123,
  vendor_id: 1,
  company_name: "ABC工業"  // vendor_idで取得できるので不要
}

// ✅ 良い例：正規化されたデータ
{
  user_id: 123,
  vendor_id: 1
}
// company_nameはsignage_master_vendorsから取得
```

#### チェックリスト
- [ ] 新しいフィールド追加前に既存のデータモデルを確認したか
- [ ] データの正規化原則に従っているか
- [ ] 同じ情報が複数箇所に保存されていないか（Single Source of Truth）

---

## 開発時の鉄則

### 🚨 実装前に必ず確認すること

1. **データベーススキーマを確認**
   - テーブル名は`signage_`プレフィックス付きか
   - データ型は何か（文字列/数値/JSON）
   - RLSポリシーは何か

2. **既存パターンを調査**
   - 似た機能がないか `Grep` で検索
   - 既存のコードを参考にする
   - 車輪の再発明をしない

3. **モックデータを最新に保つ**
   - スキーマ変更時は `test-helpers.js` も更新
   - 本番データと同じ構造にする

4. **UIは実際のデータで確認**
   - 長いテキスト、短いテキスト両方で表示確認
   - `gap` を十分に取る（2rem推奨）
   - `text-overflow: ellipsis` は慎重に使う

5. **エラーハンドリングを忘れずに**
   - API呼び出しは必ず `try-catch` または `error` をチェック
   - ユーザーにわかりやすいエラーメッセージを表示

### 📝 コミット前のチェックリスト

- [ ] `npm test` が全てPASSするか
- [ ] バージョン番号を更新したか (`js/version.js`)
- [ ] ブラウザコンソールにエラーがないか
- [ ] 手動で主要な操作フローを確認したか
- [ ] LESSONS_LEARNED.mdの該当項目を確認したか

---

## まとめ

このプロジェクトで最も多い失敗パターン：

1. **フォームバリデーション** (非表示フィールドのrequired属性) → 15%
2. **データ型の不一致** (文字列vs数値、JSON構造変更) → 20%
3. **UI表示の問題** (オーバーラップ、見切れ) → 25%
4. **テーブル命名** (signage_プレフィックスの有無) → 10%
5. **API/FK参照** (複雑すぎるクエリ) → 10%
6. **タイポ** (スペルミス) → 10%
7. **その他** → 10%

**特に注意すべきポイント**:
- フォームの非表示要素は必ず `disabled = true` にする
- データ型比較は `String()` で統一
- UI実装時は `gap: 2rem` でオーバーラップを防ぐ
- テーブル名は必ず `signage_` プレフィックス
- 複雑なFK結合は避け、シンプルなクエリに分割

---

**このファイルは常に最新に保つこと。新しい教訓を学んだらすぐに追記する。**
