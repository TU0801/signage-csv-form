---
name: self-improvement
description: タスク完了時にSupabaseへ実行記録を保存。タスク完了時・エラー時に発動。
allowed-tools: Bash, Read
---

# 自己改善スキル

## トリガー
- タスク完了時（成功・失敗問わず）
- 「評価して」と指示された時

## 手順
1. `orch_runs`に実行記録をPOST（project_id: "Synege"）
2. `orch_evaluations`に評価を保存（task_completion, code_quality, efficiency, error_handling: 各0-10）
3. 同じ失敗2回以上 → `docs/FAILURE_PATTERNS.md`に1行追加
