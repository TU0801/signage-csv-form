# CLAUDE.md

マンション共用部サイネージ向けCMS。保守会社ごとに担当ビルを管理。

## 3つの絶対ルール

### 1. テストなしコミット禁止
```bash
npx playwright test --reporter=list  # → 全PASS後にコミット
```
テスト赤 = プッシュ禁止。新機能より先にテスト修正。

### 2. DB操作前にスキーマ確認
Supabase MCPの`list_tables` / `execute_sql`でカラム名を実DBから確認。
推測でフィールド名を書かない。snake_case/camelCase変換は`getAllMasterDataCamelCase()`参照。

### 3. import/export追加時に全依存確認
```bash
grep -r "関数名" js/  # 追加・変更する関数の全参照を確認
```
HTML要素の削除前も同様に`grep`で全参照確認。

## 開発コマンド

```bash
npm run serve                          # localhost:8080
npx playwright test --reporter=list    # 全テスト
npx playwright test tests/xxx.spec.js  # 単体テスト
```

## セッション開始時

1. `npx playwright test` → 全PASS確認
2. `docs/METRICS.md` で前回fix率確認
3. 目標設定: fix<10%, 往復<1回

## セッション終了時

```bash
echo "YYYY-MM-DD: fix XX% | iterations X.X | tests XX/XX" >> docs/METRICS.md
```

## 失敗パターン

実装前に `docs/FAILURE_PATTERNS.md` を確認。症状→対策の1行表。

## 実装チェックリスト

### Before
- [ ] スキーマ確認（Supabase MCP）
- [ ] 失敗パターン確認

### After
- [ ] `npx playwright test` 全PASS
- [ ] コンソールエラー0
- [ ] UI変更時は全体検証（1箇所の修正で全体が直ったと仮定しない）
- [ ] UI要素削除時はユーザーに場所確認してから実行

## 参照

- 仕様書: `docs/SPECIFICATION.md`
- 失敗パターン: `docs/FAILURE_PATTERNS.md`
- スキル: `.claude/skills/*/SKILL.md`
