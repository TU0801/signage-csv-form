# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

マンション共用部サイネージ向けCMS。保守会社ごとに担当ビルを管理。

**URL**: https://github.com/TU0801/signage-csv-form
**品質目標**: エンタープライズ級（修正率5%以下）
**現状**: v1.20.11

---

## ⚡ セッション開始時（必須・5分）

```bash
# 1. 前回の振り返り
cat docs/NEXT_SESSION_TODO.txt

# 2. 失敗パターン確認
cat docs/FAILURE_PATTERNS.md | grep "⭐️"

# 3. メトリクス確認
cat docs/METRICS.md | tail -20
```

**目標設定**: fix<15%, 往復<2回, テスト100%

---

## 🎯 3つの絶対ルール

### 1. テストしてから報告
```
実装 → テスト → DB確認 → 「完了」
```

### 2. RLS/スキーマを最初に確認
```bash
grep "CREATE TABLE" supabase/schema.sql
# Supabase Dashboardでポリシー確認
```

### 3. 失敗パターンを活用
```bash
grep -i "キーワード" docs/FAILURE_PATTERNS.md
```

---

## 📋 実装チェックリスト

### Before
- [ ] RLSポリシー確認
- [ ] スキーマ確認
- [ ] 失敗パターン確認

### After
- [ ] ローカルテスト
- [ ] DBデータ確認
- [ ] コンソールエラー0
- [ ] 既存機能OK

---

## 🔧 開発コマンド

```bash
npm run serve          # localhost:8080
npm test              # 全テスト
npx playwright test tests/xxx.spec.js  # 単体テスト
```

---

## 📊 セッション終了時（必須）

```bash
# メトリクス更新
echo "fix: X/Y (Z%)" >> docs/METRICS.md

# 次回TODO作成
echo "[準備事項]" > docs/NEXT_SESSION_TODO.txt
```

**更新なし = 改善なし**

---

## 📚 詳細は別ドキュメント

- アーキテクチャ: `docs/SPECIFICATION.md`
- 失敗パターン: `docs/FAILURE_PATTERNS.md`
- 改善システム: `docs/CONTINUOUS_IMPROVEMENT_SYSTEM.md`
- スキル: `.claude/skills/*/SKILL.md`

---

## 🎯 目標

- fix率: 5%以下
- 往復: 1-2回
- テスト: 100%

**実行可能な300行以内に保つ。**
