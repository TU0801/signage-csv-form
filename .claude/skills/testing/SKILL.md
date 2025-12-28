---
name: testing
description: Playwrightを使ったE2Eテスト。コード変更後、プッシュ前に自動発動。
allowed-tools: Bash, Read, Edit
---

# テストスキル

## トリガー
- コード変更後
- 「テストして」「確認して」と指示された時
- プッシュ前

## コマンド

### 全テスト実行
```bash
npx playwright test --reporter=list
```

### 特定ファイルのテスト
```bash
npx playwright test tests/e2e-user-flows.spec.js
npx playwright test tests/e2e-admin-flows.spec.js
```

## テスト失敗時
1. エラーメッセージを確認
2. テストファイルとソースコードを読む
3. 原因特定して修正
4. 再テストで確認

## 現在のテスト構成（73テスト）

### E2Eテスト（ユーザー行動ベース）
- `e2e-user-flows.spec.js` - 一般ユーザーのE2Eテスト（22テスト）
  - ログイン・認証
  - 一件入力（物件選択→業者選択→点検種別→データ追加→申請）
  - 一括入力（行追加→データ入力→保存→CSVコピー）
  - エラーケース

- `e2e-admin-flows.spec.js` - 管理者のE2Eテスト（24テスト）
  - 管理者ログイン・権限
  - 承認待ち（承認・却下）
  - データ一覧（フィルター・検索・詳細）
  - CSVエクスポート
  - マスター管理（物件・受注先・点検種別）
  - マスターデータ連携

### その他
- `09-excel-paste.spec.js` - Excel貼り付け機能
- `10-data-consistency.spec.js` - データ整合性

## テスト方針
- **量より質**: ユーザーの実際の操作フローをテスト
- **日本語テスト名**: 「物件を選択すると端末が自動的に設定される」など

## 注意事項
- 全テスト通過を確認してからプッシュ
- `setupAuthMockWithMasterData`で認証モック
