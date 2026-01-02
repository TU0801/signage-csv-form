# 一般ユーザー画面簡素化計画

**作成日**: 2025-12-31
**対象**: v1.19.0実装予定

---

## 📋 要件まとめ

### 一般ユーザー（保守会社）の入力画面

**表示する項目**（8項目のみ）:
1. ✅ 物件コード
2. ✅ 端末ID
3. ✅ 案内カテゴリ
4. ✅ 点検種別
5. ✅ 掲示板用案内文
6. ✅ 点検開始日
7. ✅ 点検終了日
8. ✅ 掲示備考

**非表示にする項目**:
- ❌ 保守会社選択（自動設定）
- ❌ 緊急連絡先（自動設定）
- ❌ 表示開始日時
- ❌ 表示終了日時
- ❌ 表示秒数設定
- ❌ 貼紙位置選択（①②③④⓪）
- ❌ CSVダウンロード
- ❌ CSVプレビュー
- ❌ CSVコピー

### 管理者画面

**すべて表示**:
- 承認後に表示日時・秒数・位置を設定
- CSV出力機能を使用

---

## 🔧 実装ステップ

### Step 1: index.html簡素化（2時間）

#### 1-1. admin-onlyクラス追加
```html
<!-- 既に追加済み -->
<div class="form-group admin-only">保守会社</div>
<div class="form-group admin-only">緊急連絡先</div>

<!-- 追加予定 -->
<div class="form-group admin-only">表示開始</div>
<div class="form-group admin-only">表示終了</div>
<div class="form-group admin-only">表示時間</div>
<div class="position-grid admin-only">位置選択</div>
```

#### 1-2. CSS追加
```css
.admin-only {
  display: none;
}

body.is-admin .admin-only {
  display: block;
}
```

#### 1-3. JavaScript修正
```javascript
// 管理者チェック後
if (admin) {
  document.body.classList.add('is-admin');
} else {
  // 一般ユーザー: デフォルト値を設定
  document.getElementById('vendor').value = '0'; // 自分の保守会社
  document.getElementById('displayTime').value = 6;
  // 位置はデフォルト値（2）を使用
}
```

#### 1-4. CSVボタン非表示
```html
<div class="export-section admin-only">
  <button id="downloadCSV">...</button>
  <button id="previewCSV">...</button>
  <button id="copyCSV">...</button>
</div>
```

---

### Step 2: bulk.html簡素化（2時間）

#### 2-1. カラム削減
現在の列:
- ドラッグ、チェック、No、物件、端末、保守会社、点検種別、開始日、終了日、備考、秒数、詳細、状態

一般ユーザー用:
- チェック、No、物件、端末、点検種別、開始日、終了日、備考、状態

削除:
- ドラッグ（並び替え不要）
- 保守会社（自動）
- 秒数（管理者が設定）
- 詳細（簡略化）

#### 2-2. ツールバー簡素化
削除:
- CSVダウンロード
- CSVコピー
- テンプレート機能（管理者のみ）

残す:
- 行追加
- 行削除
- 申請ボタン

---

### Step 3: Excel取り込み整理（1時間）

#### 現状の問題
- 28列すべて取り込み可能
- 一般ユーザーには複雑すぎる

#### 整理案
取り込み列を8列に削減:
1. 物件コード
2. 端末ID
3. 点検種別
4. 点検開始日
5. 点検終了日
6. 案内文
7. 備考
8. （保守会社は自動）

Excelテンプレートも更新。

---

### Step 4: デフォルト値設定（30分）

一般ユーザーの申請時、以下をデフォルト値で自動設定:

```javascript
{
  vendor_name: profile.vendorName,  // ログインユーザーの保守会社
  emergency_contact: profile.vendorContact,  // 保守会社の連絡先
  display_start_date: null,  // 管理者が設定
  display_end_date: null,
  display_start_time: null,
  display_end_time: null,
  display_duration: 6,  // デフォルト6秒
  poster_position: '2',  // デフォルト②上中
  frame_no: '2'  // デフォルト
}
```

---

## 📊 工数見積もり

- Step 1: index.html簡素化（2h）
- Step 2: bulk.html簡素化（2h）
- Step 3: Excel整理（1h）
- Step 4: デフォルト値（30min）
- テスト・修正（1h）

**合計**: 6.5時間

---

## ⚠️ 注意事項

### 互換性
- 管理者は今まで通りすべて入力可能
- 一般ユーザーのみ簡素化
- データ構造は変更なし

### テスト
- 一般ユーザーログイン→簡素化された画面
- 管理者ログイン→すべて表示
- 申請データが正しく保存されるか確認

---

**次セッションで実装してください。**
