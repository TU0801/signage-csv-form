---
name: ask-user-question
description: ユーザーに選択肢を提示する際のAskUserQuestionツールの使い方。選択肢提示時に自動発動。
allowed-tools: AskUserQuestion
---

# AskUserQuestionスキル

## トリガー
- ユーザーに複数の選択肢を提示する時
- 作業の優先順位を確認する時
- 実装方法の選択肢を提示する時

## やるべきこと
1. **選択肢はAskUserQuestionで提示**（テキスト列挙ではなくチェックボックス形式）
2. **オプションは2-4個**（多すぎると選びにくい）
3. **推奨オプションは先頭に配置**（ラベルに「(推奨)」追加）

## やってはいけないこと
- 選択肢をテキストで列挙するだけ
- 「どれにしますか？」と聞いて入力させる
- オプション4個超え

## 使用例
```javascript
{
  "questions": [{
    "question": "どの機能を優先しますか？",
    "header": "優先度",
    "options": [
      {"label": "認証機能 (推奨)", "description": "ログイン必須化"},
      {"label": "テスト追加", "description": "行詳細モーダルのテスト"}
    ],
    "multiSelect": true
  }]
}
```
