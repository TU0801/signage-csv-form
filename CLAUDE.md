# Claude Code プロジェクト設定

## 基本設定
- 言語: 日本語でやりとりする
- コミット時は必ずバージョンを更新する（js/version.js）
- プッシュ前に必ず全テストを実行して通過を確認

## サブエージェント活用（Task Tool）

### 使用すべき場面
- **テスト作成**: 複数のテストファイルを同時に作成する場合
- **コード調査**: 複数ファイルの調査を並列で実行
- **複雑なタスク**: 独立した作業を分割して並列処理

### サブエージェントタイプ
| タイプ | 用途 |
|--------|------|
| `general-purpose` | テスト作成、複雑な実装、調査 |
| `Explore` | コードベース探索、ファイル検索 |
| `Plan` | 実装計画の設計 |

### 並列実行の例
```
ユーザー: テストを追加して
↓
サブエージェント1: 画像アップロードテスト作成
サブエージェント2: バリデーションテスト作成
サブエージェント3: エラーハンドリングテスト作成
（同時に実行）
```

## 並列化方針
- **必ず並列化**: 独立したテストファイル作成、調査タスク
- **単一メッセージで複数Task**: `run_in_background` 不要で自動並列
- **依存関係がある場合のみ直列**: 前のタスクの結果が必要な場合

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

## テスト方針
- 変更後は必ずテストを実行
- `setupAuthMockWithMasterData` を使用して認証をモック
- 全テスト通過を確認してからコミット
- 新機能追加時はサブエージェントでテスト作成を並列化

## Supabaseスキーマ注意点
- ステータス値: `'draft'`（承認待ち）、`'submitted'`（承認済み）
- カラム名: `inspection_start`, `inspection_end`, `display_duration`, `announcement`, `poster_position`
- 古いカラム名は使用禁止: `start_date`, `end_date`, `display_time`, `notice_text`, `position`

## コード品質
- 型比較は `String()` で統一
- エラーハンドリングは防御的に（null返却など）
- トーストには必ず `.show` クラスを付与
- エラーメッセージは「申請に失敗しました」で統一
