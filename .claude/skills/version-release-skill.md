# バージョン・リリーススキル

## 概要
バージョン管理とリリース作業の手順。

## トリガー
- 「プッシュして」と指示された時
- 機能追加・バグ修正完了時

## バージョン管理ファイル
`js/version.js`:
```javascript
window.APP_VERSION = 'vX.Y.Z';
window.APP_BUILD_DATE = 'YYYY-MM-DD HH:MM';
```

## バージョン番号規則
- **メジャー (X)**: 大きな機能追加、破壊的変更
- **マイナー (Y)**: 新機能追加
- **パッチ (Z)**: バグ修正、軽微な変更

## リリース手順

### 1. テスト実行
```bash
npx playwright test --reporter=list
```
全テスト通過を確認。

### 2. バージョン更新
`js/version.js`のAPP_VERSIONとAPP_BUILD_DATEを更新。

### 3. コミット
```bash
git add -A
git commit -m "$(cat <<'EOF'
[変更内容の要約]

[詳細説明]

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

### 4. プッシュ
```bash
git push
```

### 5. 通知
プッシュ完了後、ユーザーに通知：
- バージョン番号
- コミットハッシュ
- 変更内容の要約
- 「ブラウザをリロードして確認してください」

## 注意事項
- テスト失敗時はプッシュしない
- バージョン更新を忘れずに
- プッシュ後は必ずユーザーに通知
