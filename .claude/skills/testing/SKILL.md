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
npx playwright test tests/12-bulk-features.spec.js
```

## テスト失敗時
1. エラーメッセージを確認
2. テストファイルとソースコードを読む
3. 原因特定して修正
4. 再テストで確認

## 現在のテスト構成（258テスト）
- tests/01〜08: 基本機能テスト
- tests/09〜13: ボタン・機能テスト
- tests/14〜15: カテゴリ・ポジション
- tests/99-critical-buttons.spec.js: 重要ボタンテスト
- tests/debug-*.spec.js: デバッグ用
- tests/ui-*.spec.js: UIテスト

## 注意事項
- 全テスト通過を確認してからプッシュ
- `setupAuthMockWithMasterData`で認証モック
