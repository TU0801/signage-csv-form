# 継続的改善システム設計

**作成日**: 2025-12-31
**目的**: 持続的な品質向上の仕組み化

---

## 🔍 現状の改善策とその限界

### 既に実施したこと
1. ✅ quality-firstスキル作成
2. ✅ CLAUDE.md更新
3. ✅ チェックリスト作成
4. ✅ コミットメント文書

### 問題点
**これらは「意識」レベル**

- 忘れる可能性がある
- 測定できない
- フィードバックループがない
- 改善が可視化されない

**必要なのは「仕組み」レベル**

---

## 🚫 足りない仕組み（10個）

### 1. セッション振り返りの自動化

**現状**: 振り返りをやったりやらなかったり

**必要な仕組み**:
```markdown
## セッション終了時の必須タスク

1. メトリクス記録
   - コミット数
   - fix数
   - 往復数
   - 所要時間

2. KPT実施
   - Keep: うまくいったこと
   - Problem: 問題だったこと
   - Try: 次回試すこと

3. スキル更新判断
   - 新しい学びはあったか？
   - スキルファイル更新が必要か？

4. ユーザーフィードバック記録
   - 満足度（推定）
   - 指摘された点
   - 褒められた点
```

**実装方法**: セッション終了時に必ず実行するスキル作成

---

### 2. 品質メトリクスダッシュボード

**現状**: 改善度が見えない

**必要な仕組み**:
```
docs/METRICS.md

| セッション日 | コミット数 | fix数 | fix率 | 往復数 | 満足度 |
|-------------|-----------|-------|-------|--------|--------|
| 2025-12-31  | 62        | 21    | 34%   | 4.2    | ?      |
| 次回        | ?         | ?     | ?     | ?      | ?      |

グラフ:
fix率推移: 34% → 30% → 25% → ... → 5%
```

**実装方法**: セッション終了時に更新

---

### 3. Pre-commit自動チェック

**現状**: コミット前のチェックが手動（忘れる）

**必要な仕組み**:
```bash
# .git/hooks/pre-commit
#!/bin/bash

echo "🔍 Pre-commit checks..."

# 1. コンソールログが本番コードに残っていないか
if git diff --cached | grep -E "console\.(log|debug)" | grep -v "error"; then
  echo "❌ console.log found. Remove debug logs."
  exit 1
fi

# 2. TODOコメントがないか
if git diff --cached | grep -i "TODO\|FIXME\|HACK"; then
  echo "⚠️ TODO/FIXME found. Resolve before commit."
  read -p "Continue? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then exit 1; fi
fi

# 3. テストが通るか
npm test --silent
if [ $? -ne 0 ]; then
  echo "❌ Tests failed. Fix before commit."
  exit 1
fi

echo "✅ All checks passed!"
```

**実装方法**: .git/hooks/pre-commitに設置

---

### 4. コミットメッセージテンプレート

**現状**: コミットメッセージが一貫性なし

**必要な仕組み**:
```bash
# .gitmessage
# Type: feat|fix|refactor|docs|test|chore
#
# Title: [type]: Brief description (50 chars max)
#
# Body:
# - What: 何を変更したか
# - Why: なぜ変更したか
# - How: どう実装したか
# - Test: テスト方法
# - Impact: 影響範囲
#
# Checklist:
# □ Tested locally
# □ DB verified
# □ Console errors: 0
# □ Existing features: OK
# □ Docs updated
#
# Co-Authored-By: Claude Sonnet 4.5 (1M context) <noreply@anthropic.com>
```

**実装方法**: git config commit.template .gitmessage

---

### 5. 失敗パターンデータベース

**現状**: 同じミスを繰り返す

**必要な仕組み**:
```markdown
docs/FAILURE_PATTERNS.md

## 失敗パターン集

### #1: RLS確認漏れ
- 発生回数: 10回
- 症状: UPDATE成功するがデータ保存されない
- 原因: RLSポリシー未確認
- 対策: 実装前に必ずRLSチェック
- チェックリスト項目: □ RLSポリシー確認

### #2: フィールド名不一致
- 発生回数: 8回
- 症状: データが表示されない、空欄になる
- 原因: DBとコードでフィールド名が違う
- 対策: スキーマ→定数定義→使用
- チェックリスト項目: □ フィールド名を定数化
```

**実装方法**: 新しい失敗が発生したら即座に追加

---

### 6. スキル適用チェッカー

**現状**: スキルを読んだか確認できない

**必要な仕組み**:
```javascript
// 実装開始時に必ず呼ぶ
function checkSkillsApplied() {
  const required = [
    'quality-first を読んだ',
    'feature-development を読んだ',
    'testing を読んだ',
    'supabase を読んだ'
  ];

  console.log('📚 Required skills check:');
  required.forEach(skill => {
    console.log(`□ ${skill}`);
  });

  console.log('All skills reviewed? Proceed with implementation.');
}
```

**実装方法**: 実装開始時の儀式化

---

### 7. ペアプログラミング／レビュー

**現状**: 誰もコードをチェックしない

**必要な仕組み**:

#### オプションA: 自己レビュー
```
実装完了
↓
30分休憩（頭をリセット）
↓
自分のコードを他人のつもりでレビュー
↓
問題を見つけたら修正
↓
コミット
```

#### オプションB: AIペアレビュー
```
別のClaude Codeインスタンスにレビュー依頼
↓
指摘を受ける
↓
修正
↓
コミット
```

**実装方法**: レビュースキル作成

---

### 8. 定期的な技術学習

**現状**: 必要になってから調べる

**必要な仕組み**:
```
週次学習計画:

Week 1: Supabase RLS完全マスター
  - 全ポリシータイプ理解
  - セキュリティベストプラクティス
  - トラブルシューティング

Week 2: HTML5フォーム完全マスター
  - Validation API
  - カスタムバリデーション
  - アクセシビリティ

Week 3: CSS Grid/Flexbox完全マスター
  - レイアウトパターン
  - レスポンシブデザイン
  - パフォーマンス最適化

Week 4: JavaScript非同期処理完全マスター
  - Promise/async/await
  - エラーハンドリング
  - パフォーマンス
```

**実装方法**: 学習ログをdocs/LEARNING_LOG.mdに記録

---

### 9. ユーザーフィードバックの体系的収集

**現状**: フィードバックが散発的

**必要な仕組み**:
```markdown
docs/USER_FEEDBACK_LOG.md

| 日付 | フィードバック | カテゴリ | 対応 | 改善策 |
|------|---------------|---------|------|--------|
| 12/31 | 7往復は多すぎ | プロセス | 品質ファースト導入 | テスト必須化 |
| 12/31 | RLS理解不足 | 技術 | RLS学習 | 事前確認リスト |
| 12/31 | レベル低い | 総合 | 包括改善 | 継続的改善システム |
```

**実装方法**: セッション終了時に記録

---

### 10. 成功パターンライブラリ

**現状**: 失敗パターンのみ記録

**必要な仕組み**:
```markdown
docs/SUCCESS_PATTERNS.md

## 成功パターン集

### #1: マルチテナント実装
- 結果: 1回で動作
- 要因:
  - 事前にRLS完全理解
  - データフロー図解
  - 段階的実装＋テスト
- 再現方法: [詳細手順]

### #2: UI統一化
- 結果: 修正なしで完了
- 要因:
  - デザインパターン確立
  - 一括適用
  - 実データでテスト
- 再現方法: [詳細手順]
```

**実装方法**: うまくいった時こそ記録

---

## 🎯 実装計画

### Phase 1: 即時実装（今すぐ）

#### 1. メトリクスファイル作成
```bash
touch docs/METRICS.md
# 今回のセッションデータを記録
```

#### 2. 失敗パターンDB作成
```bash
touch docs/FAILURE_PATTERNS.md
# 今回の失敗を全て記録
```

#### 3. レビュースキル作成
```bash
mkdir -p .claude/skills/self-review
touch .claude/skills/self-review/SKILL.md
```

---

### Phase 2: 1週間以内

#### 4. Pre-commit hook設置
```bash
cp templates/pre-commit .git/hooks/
chmod +x .git/hooks/pre-commit
```

#### 5. コミットテンプレート設定
```bash
git config commit.template .gitmessage
```

#### 6. 学習計画作成
```bash
touch docs/LEARNING_PLAN.md
```

---

### Phase 3: 1ヶ月以内

#### 7. 成功パターンライブラリ構築
- 10個の成功事例を記録
- 再現可能な手順化

#### 8. 技術習得完了
- Supabase完全マスター
- フロントエンド設計パターン
- テスト駆動開発

#### 9. プロセス確立
- 要件定義テンプレート運用
- 設計レビュー定例化
- 品質ゲート設置

---

## 📊 改善の測定方法

### 毎セッション測定

```javascript
const sessionMetrics = {
  date: '2025-12-31',
  commits: {
    total: 62,
    feat: 25,
    fix: 21,
    refactor: 10,
    docs: 6,
    fixRate: 34% // Target: <5%
  },
  iterations: {
    average: 4.2, // Target: <2
    max: 7,       // Target: <3
  },
  quality: {
    preTestRate: 30%,    // Target: 100%
    bugsCaught: 5,       // Bugs I found
    bugsReported: 16,    // Bugs user found (Target: 0)
    dbVerified: false,   // Target: true
  },
  userSatisfaction: '?',  // Target: 90%+
};
```

### 改善トレンド

```
Week 1: fixRate 34% → 25% (目標: 20%)
Week 2: fixRate 25% → 18% (目標: 15%)
Week 3: fixRate 18% → 12% (目標: 10%)
Week 4: fixRate 12% → 8%  (目標: 5%)
```

**グラフ化して可視化**

---

## 🔄 PDCAサイクル

### Plan（計画）
```
□ 要件を完全理解
□ RLS/スキーマ確認
□ 設計書作成
□ テスト計画作成
□ ユーザーに確認
```

### Do（実行）
```
□ 設計通りに実装
□ 詳細ログ追加
□ エラーハンドリング
□ セルフレビュー
```

### Check（確認）
```
□ 包括的テスト（8項目）
□ DB実データ確認
□ コンソールエラー0確認
□ メトリクス測定
```

### Act（改善）
```
□ 失敗パターンDB更新
□ 成功パターン記録
□ スキルファイル更新
□ 次回への申し送り
```

**毎回このサイクルを回す**

---

## 🎓 スキル体系の再構築

### 現在のスキル（10個）
1. communication
2. feature-development
3. testing
4. version-release
5. supabase
6. admin-improvements
7. file-structure
8. bulk-module
9. ask-user-question
10. quality-first ← 新規

### 追加すべきスキル（7個）

#### 1. self-review（自己レビュー）
```
- コード品質チェック
- バグ探索方法
- パフォーマンス確認
```

#### 2. rls-first（RLS優先）
```
- RLSポリシー確認手順
- よくある罠
- デバッグ方法
```

#### 3. database-schema（スキーマ理解）
```
- フィールド名マッピング
- データ型理解
- 制約条件
```

#### 4. error-prevention（エラー予防）
```
- よくあるバグパターン
- 予防的実装
- 防御的プログラミング
```

#### 5. test-first（テストファースト）
```
- テスト計画
- テストケース設計
- カバレッジ目標
```

#### 6. session-retrospective（振り返り）
```
- KPT実施
- メトリクス記録
- 改善アクション決定
```

#### 7. user-feedback（フィードバック活用）
```
- フィードバック収集
- 分析方法
- 改善への反映
```

---

## 🔧 具体的な実装

### 優先度1: 今すぐ作成

#### A. メトリクスファイル
```markdown
docs/METRICS.md

# 品質メトリクス推移

## 目標
- fix率: <5%
- 往復数: <2回
- テスト実施率: 100%

## 実績

### 2025-12-31セッション
- コミット数: 62
- fix数: 21 (34%)
- 往復平均: 4.2回
- テスト実施率: 30%
- 評価: ⭐⭐ (改善必要)
```

#### B. 失敗パターンDB
```markdown
docs/FAILURE_PATTERNS.md

# 失敗パターンデータベース

## カテゴリ別

### RLS関連（10件）
1. UPDATE成功するがデータ保存されない
2. SELECT権限なし（406エラー）
...

### フィールド名不一致（8件）
1. notice_text vs default_text
2. inspection_type 未定義
...
```

#### C. セッション振り返りテンプレート
```markdown
docs/session-template.md

# セッション振り返り - YYYY-MM-DD

## メトリクス
- コミット数:
- fix数:
- 往復数:

## KPT
### Keep
-

### Problem
-

### Try
-

## スキル更新
- [ ] 更新が必要か判断
```

---

### 優先度2: 1週間以内

#### D. 新スキル作成
```bash
mkdir -p .claude/skills/{self-review,rls-first,test-first,session-retrospective}
# 各スキルファイル作成
```

#### E. Pre-commit hook設置
```bash
# 自動テスト・チェック
```

#### F. Learning plan
```markdown
docs/LEARNING_PLAN.md
# 4週間学習計画
```

---

### 優先度3: 継続的に

#### G. 毎セッション終了時
```
1. メトリクス記録
2. KPT実施
3. スキル更新判断
4. 失敗パターン追加
5. 次回への申し送り
```

#### H. 週次レビュー
```
1. メトリクス確認（改善しているか？）
2. 目標達成度確認
3. 学習進捗確認
4. アクションプラン更新
```

#### I. 月次振り返り
```
1. 大きなトレンド分析
2. 根本的な改善の検討
3. スキル体系の見直し
```

---

## 🎯 成功の定義

### セッションレベル
```
✅ fix:コミット 0-1個
✅ 往復 1-2回
✅ テスト実施率 100%
✅ ユーザーの確認 最小限
✅ 「信頼できる」評価
```

### プロジェクトレベル
```
✅ fix率 <5%
✅ バグ報告 月0-1件
✅ ユーザー満足度 90%+
✅ 保守コスト 最小
✅ 「プロフェッショナル」評価
```

---

## 💡 次のアクション

### 今すぐ（この後）
1. [ ] METRICS.mdを作成
2. [ ] 今セッションのデータを記録
3. [ ] FAILURE_PATTERNS.mdを作成
4. [ ] 主要な失敗パターンを記録

### 次回セッション開始時
1. [ ] 前回のメトリクスを確認
2. [ ] 改善目標を設定
3. [ ] スキルを全て読み直す
4. [ ] 気を引き締めて開始

### 次回セッション終了時
1. [ ] メトリクス測定
2. [ ] 目標達成度確認
3. [ ] KPT実施
4. [ ] ドキュメント更新

---

**継続的改善を仕組み化し、確実に成長します。**
