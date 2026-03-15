---
name: testing
description: Playwrightを使ったE2Eテスト。コード変更後、プッシュ前に自動発動。
allowed-tools: Bash, Read, Edit
---

# テストスキル

## トリガー
- コード変更後
- プッシュ前

## コマンド

```bash
npx playwright test --reporter=list     # 全テスト
npx playwright test tests/xxx.spec.js   # 単体テスト
```

## 現在のテスト構成

- `e2e-user-flows.spec.js` - ユーザーE2E（ログイン・一件入力・一括入力・エラーケース）
- `e2e-admin-flows.spec.js` - 管理者E2E（承認・データ一覧・CSV・マスター管理）
- `e2e-admin-crud.spec.js` - 管理者CRUD（マスター管理・紐付け・ユーザー管理）
- `visual-regression.spec.js` - VRT（張紙プレビューのレイアウト崩れ検出）

## テスト失敗時
1. エラーメッセージ確認
2. テストファイルとソースコード読む
3. 原因特定→修正
4. 再テストで確認

## Visual Regression Test (VRT)

CSS/スタイル変更時は必ず実行：
```bash
npx playwright test tests/visual-regression.spec.js  # VRT実行
npx playwright test tests/visual-regression.spec.js --update-snapshots  # ベースライン更新
```
- スナップショット: `tests/visual-regression.spec.js-snapshots/`
- CSS変更後にVRT失敗 → レイアウト崩れの可能性あり、目視確認してから修正

## ルール
- 全テストPASS → コミット可
- テスト赤 = プッシュ禁止
- CSS変更時はVRTも必ず実行
