---
name: version-release
description: バージョン管理とリリース作業。「プッシュして」と指示された時に発動。
allowed-tools: Bash, Read, Edit
---

# バージョン・リリーススキル

## トリガー
- 「プッシュして」と指示された時
- 機能追加・バグ修正完了時

## バージョン管理
`js/version.js`:
```javascript
window.APP_VERSION = 'vX.Y.Z';
window.APP_BUILD_DATE = 'YYYY-MM-DD';
```

## バージョン番号規則
- **メジャー (X)**: 破壊的変更
- **マイナー (Y)**: 新機能追加
- **パッチ (Z)**: バグ修正

## リリース手順

### 1. テスト実行
```bash
npx playwright test --reporter=list
```

### 2. バージョン更新
js/version.jsを更新

### 3. コミット＆プッシュ
```bash
git add -A
git commit -m "vX.Y.Z: 変更内容"
git push
```

### 4. 通知
プッシュ完了後、ユーザーに報告：
- バージョン番号
- 変更内容の要約
- 「ブラウザをリロードして確認してください」

## 注意事項
- テスト失敗時はプッシュしない
- バージョン更新を忘れずに
