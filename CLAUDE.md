# CLAUDE.md

マンション共用部サイネージ向けCMS。保守会社ごとに担当ビルを管理。

## 絶対ルール

1. **テストなしコミット禁止** — `npx playwright test --reporter=list` 全PASS後にコミット
2. **DB操作前にスキーマ確認** — Supabase MCPの`list_tables`/`execute_sql`で実DB確認。推測でフィールド名を書かない
3. **import/export・HTML要素の変更前に全参照確認** — `grep -r "関数名" js/`

## Supabaseへのアクセス

3つの方法がある。どれでもよいが、**コードを書く前に必ずスキーマを実DBから確認する。** カラム名の推測禁止。

**方法1: Supabase MCPプラグイン**（推奨）
`mcp__plugin_supabase_supabase__authenticate` を呼んでツールを有効化。
`list_tables` でテーブル一覧、`execute_sql` でSQL実行。

**方法2: REST API**（config.jsの接続情報を使用）
```bash
curl -s "${SUPABASE_URL}/rest/v1/テーブル名?select=*&limit=5" \
  -H "apikey: ${SUPABASE_ANON_KEY}"
```
※ SUPABASE_URL, SUPABASE_ANON_KEY は `js/config.js` に記載

**方法3: Supabase CLI**
```bash
npx supabase db dump --schema public  # スキーマ取得
```

## 開発コマンド

```bash
npm run serve                          # localhost:8080
npx playwright test --reporter=list    # 全テスト
npx playwright test tests/xxx.spec.js  # 単体テスト
npx playwright test tests/smoke.spec.js # スモークテスト（pre-commitで自動実行）
npm run deps:circular                  # 循環依存チェック
```

## ページ構成と依存関係

3ページが独立したJSモジュール群を持つ。**共有モジュールの変更は3ページ全てに影響する。**

| ページ | 主要JS | 役割 |
|--------|--------|------|
| index.html | script.js, csv-generator.js | 一般ユーザー入力・CSV生成 |
| admin.html | admin.js → admin-*.js  | 管理画面 |
| bulk.html | bulk.js → bulk-*.js (4ファイル) | 一括入力 |

**共有モジュール**（変更時は3ページへの影響を確認）:
- `supabase-client.js` + `js/supabase/` — DB操作（73関数）
- `shared-utils.js` — escapeHtml, CSV_HEADERS(28列), normalizeTerminalId
- `config.js` — Supabase接続情報
- `error-handler.js` — エラー日本語化・ログDB保存
- `version.js` — バージョン表示

**既知の循環依存**: `supabase/master-data.js` ↔ `supabase/relationships.js`（dynamic importで回避中）

## バグ頻発箇所と注意点

### データ層（過去のバグの40%）

**admin-relationships.js** が最もバグが多い。注意点:
- soft-delete済みレコードの再追加 → duplicate keyエラーになりやすい。upsertまたはstatus更新で対応
- RLSポリシーが原因でUPDATEが無視される（エラーにならず空振り）→ `list_tables`でRLS確認

### snake_case ↔ camelCase変換

DBはsnake_case、JSはcamelCase。変換は`getAllMasterDataCamelCase()`（`js/supabase/master-data.js`）で定義:

| DB (snake_case) | JS (camelCase) | 注意 |
|---|---|---|
| property_code | propertyCode | |
| property_name | propertyName | |
| terminal_id | terminalId | JSON文字列の場合あり→normalizeTerminalId()で正規化 |
| vendor_name | vendorName | |
| emergency_contact | emergencyContact | |
| inspection_name | inspectionType | **名前が変わる** |
| template_no | templateNo | |
| default_text | noticeText | **名前が変わる** |
| show_on_board | showOnBoard | |

新フィールド追加時: DB側snake_case → `getAllMasterDataCamelCase()`にマッピング追加 → JS側camelCaseで使用。

### UI描画（過去のバグの35%）

- script.jsのプレビュー描画で位置ずれ・はみ出しが頻発。CSS変更時は実データで目視確認必須
- モーダル表示には`.active`クラスの付与が必要（忘れやすい）
- `showLoading`/`hideLoading`はfinallyで確実にクリア

### window公開

admin.htmlのonclick属性から呼ぶ関数は`window.関数名 = 関数名`で公開が必須。
新規追加時は公開忘れに注意。

## テストカバレッジ

**カバーされている領域**:
- ユーザーフロー（ログイン・入力・CSV生成）
- 管理画面CRUD・タブ操作・承認フロー
- データ整合性（terminal_id正規化・CSVヘッダー・escapeHtml）
- Supabase読み取り関数

**カバーされていない領域**（変更時は手動テスト必須）:
- bulk操作（Excel貼り付け・複数行編集・一括送信）
- admin-export.js（レポート生成）
- admin-settings.js（設定管理）
- DB書き込み操作（create/update/delete）
- エラーハンドリングパス
- admin-entry-edit.js（編集フォーム）

## バグ修正ワークフロー

1. **再現テストを先に書く** → `tests/` に失敗するテストを追加
2. **赤を確認** → テスト実行で失敗を確認
3. **最小限の修正** → テストが通る最小限のコード変更
4. **緑を確認** → 対象テスト + 全テスト両方PASS
5. **水平展開** → `grep -r "修正パターン" js/` で類似箇所を確認

## 参照

- 失敗パターン: `docs/FAILURE_PATTERNS.md` — 症状→対策の早見表（実装前に確認）
- 仕様書: `docs/SPECIFICATION.md`
- スキル: `.claude/skills/*/SKILL.md`
