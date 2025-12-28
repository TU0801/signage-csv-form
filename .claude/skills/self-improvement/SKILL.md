---
name: self-improvement
description: タスク完了時に自動的に実行記録・評価をSupabaseに保存。タスク完了時、エラー発生時、「評価して」と指示された時に発動。
allowed-tools: Bash, Read
---

# 自己改善スキル

## トリガー
- タスク完了時（成功・失敗問わず）
- エラー発生時
- 「評価して」「振り返って」と指示された時

## プロジェクト情報
- project_id: `Synege`
- Supabase URL: `https://rzfbmmmtrbxwkxtsvypi.supabase.co`
- API Key: js/config.jsのSUPABASE_ANON_KEYを使用

## 手順

### 1. 実行記録を保存（orch_runs）
```bash
curl -s -X POST "https://rzfbmmmtrbxwkxtsvypi.supabase.co/rest/v1/orch_runs" \
  -H "apikey: $(grep SUPABASE_ANON_KEY js/config.js | cut -d"'" -f2)" \
  -H "Authorization: Bearer $(grep SUPABASE_ANON_KEY js/config.js | cut -d"'" -f2)" \
  -H "Content-Type: application/json" \
  -d '{"project_id": "Synege", "input_text": "【指示要約】", "status": "success/failed", "output_summary": "【結果】"}'
```

### 2. 自己評価（orch_evaluations）
評価観点: task_completion, code_quality, efficiency, error_handling (各0-10)

### 3. 失敗カテゴリ
| カテゴリ | 意味 | 改善アクション |
|---------|------|---------------|
| prompt | 指示が曖昧 | CLAUDE.mdに具体例追加 |
| skill | 手順が不適切 | スキルファイル更新 |
| env | 環境の問題 | セットアップ手順更新 |

## 注意事項
- 評価は正直に（甘くしない）
- 同じ失敗2回以上で必ず知識更新
