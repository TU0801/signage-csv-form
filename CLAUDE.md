# Claude Code プロジェクト設定

## 基本設定
- 言語: 日本語でやりとりする
- コミット時は必ずバージョンを更新する（js/version.js）

## Agent Skills（自動発動）
`.claude/skills/` に以下のスキルを配置：

| スキル | 発動条件 |
|--------|----------|
| communication | 常時適用 |
| self-improvement | タスク完了時、エラー時、「評価して」 |
| testing | コード変更後、プッシュ前 |
| version-release | 「プッシュして」 |
| ask-user-question | 選択肢を提示する時 |
| supabase | DB操作時 |
| bulk-module | 一括入力画面の変更時 |
| admin-improvements | 管理画面の改善時 |
| file-structure | ファイル探索時 |

## 並列化方針
- 独立したファイル操作は並列実行
- 調査・分析タスクは常に並列化を検討
- 依存関係がないタスクは自動的にサブエージェントで分割

## テスト方針
- 変更後は必ずテストを実行
- `setupAuthMockWithMasterData` を使用して認証をモック
- 全テスト通過を確認してからコミット

## コード品質
- 型比較は `String()` で統一
- エラーハンドリングは防御的に（null返却など）
- トーストには必ず `.show` クラスを付与
