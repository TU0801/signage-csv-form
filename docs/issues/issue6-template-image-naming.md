# [enhancement] テンプレート画像のファイル名（image_key）命名規則統一

## 概要
テンプレート画像のimage_keyの命名規則が統一されていない

---

## 現状の問題

| 画像名 | image_key | 問題 |
|--------|-----------|------|
| 調査 | Investigation | OK（単語1つ） |
| 自動ドア点検 | automatic doors | スペースあり |
| 建物点検 | building_inspection | アンダースコア |

命名規則がバラバラ：
- スペース区切り: `automatic doors`
- アンダースコア区切り: `building_inspection`
- キャメルケース: なし
- スネークケース: 一部

---

## 改善案

### 命名規則を統一（推奨: スネークケース）
- `automatic_doors`
- `building_inspection`
- `elevator_inspection`

### 対応内容
- [ ] 既存データのimage_keyを統一形式に更新
- [ ] 新規追加時にバリデーション追加（スペース不可など）
- [ ] 管理画面で警告表示（非推奨の命名があれば）

---

## 対象ファイル
- `js/admin-masters.js`（バリデーション追加）
- Supabaseデータ（既存データ修正）

## 優先度
低

## ラベル
enhancement, tech-debt
