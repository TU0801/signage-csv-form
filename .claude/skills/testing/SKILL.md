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

## 現在のテスト構成（18テスト / 2ファイル）

- `e2e-user-flows.spec.js` - ユーザーE2E（ログイン・一件入力・一括入力・エラーケース）
- `e2e-admin-flows.spec.js` - 管理者E2E（承認・データ一覧・CSV・マスター管理）

## テスト失敗時
1. エラーメッセージ確認
2. テストファイルとソースコード読む
3. 原因特定→修正
4. 再テストで確認

## ルール
- 全テストPASS → コミット可
- テスト赤 = プッシュ禁止
- `setupAuthMockWithMasterData`で認証モック
