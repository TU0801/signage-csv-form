# 🚨 重大な問題リスト

**作成日**: 2025-12-31
**調査者**: Claude Code (Ultrathink Mode)
**対象バージョン**: v1.14.1

---

## 🔴 CRITICAL - 即座に修正が必要

### 1. 管理者のベンダー選択が実際に機能していない

**優先度**: 🔴 CRITICAL

**問題**:
- 管理者がベンダーを選択しても、データ送信時に使われていない
- `script.js:672` の `vendor_name: e.vendorName` は受注先ドロップダウンから取得
- `selectedVendorIdForAdmin` が設定されても無視される

**影響**:
- v1.14.0で追加した管理者用ベンダー選択が無意味
- 管理者は結局、受注先ドロップダウンで選ぶ必要がある
- 元仕様の「選択したベンダーとして入力」が実現できていない

**修正方法**:
1. **オプションA** (推奨): 管理者がベンダー選択時、受注先ドロップダウンを自動選択＆ロック
   ```javascript
   // onAdminVendorChange() に追加
   const vendorSelect = document.getElementById('vendor');
   const vendorIndex = masterData.vendors.findIndex(v => v.id === vendorId);
   vendorSelect.value = vendorIndex;
   vendorSelect.disabled = true; // ロック
   ```

2. **オプションB**: submitEntries()でselectedVendorIdForAdminを使用
   ```javascript
   // submitEntries() 内で
   vendor_name: selectedVendorIdForAdmin
     ? getVendorNameById(selectedVendorIdForAdmin)
     : e.vendorName
   ```

**推奨**: オプションA（UIで明示的、ユーザーにわかりやすい）

---

### 2. 点検種別が自動設定されていない

**優先度**: 🔴 CRITICAL

**問題**:
- 管理者がベンダーを選択しても、点検種別が自動設定されない
- 元仕様: 「メンテナンス会社選択 → 点検種別が自動表示」

**現状**:
- ベンダー選択 → 物件のみフィルター
- 点検種別は手動選択のまま

**修正方法**:
```javascript
// onAdminVendorChange() に追加
const selectedVendor = vendors.find(v => v.id === vendorId);
if (selectedVendor && selectedVendor.inspection_type) {
  // 点検種別ドロップダウンを該当する種別で絞り込み
  // または自動選択
}
```

---

## 🟡 HIGH - 早急に修正すべき

### 3. 物件リクエストで存在しない物件コードをチェックしていない

**優先度**: 🟡 HIGH

**問題**:
- `openBuildingRequestModal()` で物件コードを入力するが
- その物件が `signage_master_properties` に存在するか確認していない
- 存在しない物件コードでリクエストすると、承認時にエラーになる

**修正方法**:
```javascript
// リクエスト前に物件の存在確認
const properties = await getMasterProperties();
const exists = properties.some(p => p.property_code === propertyCode);
if (!exists) {
  showToast('この物件コードは登録されていません', 'error');
  return;
}
```

---

### 4. マスター一覧で物件名が途中で切れる可能性

**優先度**: 🟡 HIGH

**問題**:
- 非常に長い物件名（50文字以上）の場合、グリッドからはみ出る
- `white-space: nowrap` で折り返さないため、横スクロールが発生する可能性

**修正方法**:
```css
.master-item {
  /* 横スクロール防止 */
  overflow-x: hidden;
}

.master-item-name {
  /* 長すぎる場合は2行まで表示 */
  white-space: normal;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
```

---

### 5. サイドバーが長いコンテンツで下部が見えない

**優先度**: 🟡 HIGH

**問題**:
- admin.htmlのサイドバーは `height: calc(100vh - 4rem)`
- 統計4つ + メニュー5つで縦に長い
- スクロールできるが、スクロールバーが見えにくい

**修正方法**:
```css
.admin-sidebar {
  /* スクロールバーを常に表示 */
  overflow-y: scroll;
}

.admin-sidebar::-webkit-scrollbar {
  width: 8px;
}

.admin-sidebar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.3);
  border-radius: 4px;
}
```

---

## 🟢 MEDIUM - 改善が望ましい

### 6. 受注先ドロップダウンが重複している

**優先度**: 🟢 MEDIUM

**問題**:
- 管理者がベンダーを選択した場合、受注先ドロップダウンも表示される
- 同じベンダーを2回選ぶ形になり、UX的に冗長

**修正方法**:
- 管理者がベンダー選択時、受注先ドロップダウンを非表示または無効化
- または、自動選択＆ロックして編集不可に

---

### 7. 紐付け管理の物件名カラムが短い

**優先度**: 🟢 MEDIUM

**問題**:
- 紐付け管理タブの物件一覧テーブル
- 物件名カラムの幅が狭く、長い名前が見づらい

**修正方法**:
```css
/* 紐付け管理テーブル専用スタイル */
#buildingRelationshipsContainer .data-table th:nth-child(2),
#buildingRelationshipsContainer .data-table td:nth-child(2) {
  min-width: 300px;
}
```

---

### 8. 一括入力のベンダー選択で受注先カラムが更新されない

**優先度**: 🟢 MEDIUM

**問題**:
- bulk.htmlで管理者がベンダーを選択
- テーブルの受注先カラムは変更されない
- 各行で手動選択が必要

**修正方法**:
- ベンダー選択時、全行の受注先を選択したベンダーに更新
- または、受注先カラムを非表示にする

---

## 🔵 LOW - 将来的な改善

### 9. モバイル対応が不十分

**優先度**: 🔵 LOW

**問題**:
- 管理画面のサイドバーは固定幅280px
- タブレット/スマホでは横幅が足りない

**修正方法**:
```css
@media (max-width: 1024px) {
  .admin-layout {
    flex-direction: column;
  }
  .admin-sidebar {
    width: 100%;
    height: auto;
  }
}
```

---

### 10. エラーメッセージが英語の場合がある

**優先度**: 🔵 LOW

**問題**:
- 一部のエラーで英語のメッセージが表示される
- 例: "duplicate key value violates unique constraint"

**修正方法**:
- エラーメッセージを日本語に変換する関数を作成
- すべてのcatch節で使用

---

## 📊 問題の優先度マトリクス

| 問題 | 優先度 | 影響範囲 | 修正時間 |
|------|--------|---------|---------|
| 1. ベンダーID未使用 | 🔴 CRITICAL | 管理者全機能 | 30分 |
| 2. 点検種別未自動設定 | 🔴 CRITICAL | 管理者UX | 20分 |
| 3. 物件存在確認なし | 🟡 HIGH | リクエスト機能 | 15分 |
| 4. 物件名切れ | 🟡 HIGH | マスター表示 | 10分 |
| 5. サイドバースクロール | 🟡 HIGH | 管理画面 | 10分 |
| 6. 受注先重複 | 🟢 MEDIUM | 管理者UX | 20分 |
| 7. 紐付けテーブル幅 | 🟢 MEDIUM | 紐付け管理 | 5分 |
| 8. 一括の受注先 | 🟢 MEDIUM | bulk.html | 30分 |
| 9. モバイル対応 | 🔵 LOW | 全画面 | 2時間 |
| 10. エラーメッセージ | 🔵 LOW | 全画面 | 1時間 |

**推奨**: 問題1-5を優先的に修正（合計85分）

---

## 🎯 修正計画

### フェーズ1: CRITICAL修正（50分）
1. 管理者のベンダー選択を受注先に連動
2. 点検種別を自動設定

### フェーズ2: HIGH修正（35分）
3. 物件存在確認
4. CSS調整（物件名、サイドバー）

### フェーズ3: MEDIUM修正（55分）
5. 受注先ドロップダウンの制御
6. 紐付けテーブルの調整

**次のアクション**: ユーザーに確認してフェーズ1から実装開始
