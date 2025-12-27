# テストスキル

## 概要
Playwrightを使ったE2Eテストの実行と管理。

## トリガー
- コード変更後
- 「テストして」「確認して」と指示された時
- プッシュ前

## 手順

### 1. 全テスト実行
```bash
npx playwright test --reporter=list
```

### 2. 特定ファイルのテスト
```bash
npx playwright test tests/12-bulk-features.spec.js
```

### 3. テスト失敗時の対応
1. エラーメッセージを確認
2. 該当するテストファイルとソースコードを読む
3. 原因を特定して修正
4. 再テストで確認

## 現在のテスト構成
- tests/01-initialization.spec.js - 初期化テスト
- tests/02-property-selection.spec.js - 物件選択
- tests/03-vendor-selection.spec.js - 受注先選択
- tests/04-inspection-type.spec.js - 点検種別
- tests/05-form-submission.spec.js - フォーム送信
- tests/06-data-management.spec.js - データ管理
- tests/07-csv-generation.spec.js - CSV生成
- tests/08-ui-interactions.spec.js - UI操作
- tests/09-login-buttons.spec.js - ログインボタン
- tests/10-bulk-basic.spec.js - 一括入力基本
- tests/11-bulk-crud.spec.js - 一括入力CRUD
- tests/12-bulk-features.spec.js - 一括入力機能

## 注意事項
- 全219テストが通ることを確認してからプッシュ
- テスト追加時はtest/ディレクトリの命名規則に従う
