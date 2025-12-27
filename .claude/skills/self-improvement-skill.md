# 自己改善スキル

## 概要
タスク完了時に自動的に実行記録・評価をSupabaseに保存し、失敗パターンから学習する。

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

タスク完了時、以下のcurlを実行：
```bash
curl -s -X POST "https://rzfbmmmtrbxwkxtsvypi.supabase.co/rest/v1/orch_runs" \
  -H "apikey: $(grep SUPABASE_ANON_KEY js/config.js | cut -d"'" -f2)" \
  -H "Authorization: Bearer $(grep SUPABASE_ANON_KEY js/config.js | cut -d"'" -f2)" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{
    "project_id": "Synege",
    "input_text": "【実行した指示の要約】",
    "status": "【success/failed/running】",
    "output_summary": "【結果の要約（500文字以内）】",
    "finished_at": "【終了時刻 ISO形式】"
  }'
```

### 2. 自己評価を実行（orch_evaluations）

以下の観点で自己評価し、保存：
```bash
curl -s -X POST "https://rzfbmmmtrbxwkxtsvypi.supabase.co/rest/v1/orch_evaluations" \
  -H "apikey: $(grep SUPABASE_ANON_KEY js/config.js | cut -d"'" -f2)" \
  -H "Authorization: Bearer $(grep SUPABASE_ANON_KEY js/config.js | cut -d"'" -f2)" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{
    "run_id": 【上で作成したrun_id】,
    "overall_score": 【0.00-10.00】,
    "failure_category": "【prompt/skill/agent/env/requirements/none】",
    "improvement_suggestion": "【次回への改善提案】",
    "rubric_json": {
      "task_completion": 【0-10 タスク完了度】,
      "code_quality": 【0-10 コード品質】,
      "efficiency": 【0-10 効率性】,
      "error_handling": 【0-10 エラー対応】
    }
  }'
```

### 3. 評価基準

| スコア | 意味 |
|--------|------|
| 9-10 | 完璧。改善不要 |
| 7-8 | 良好。軽微な改善余地 |
| 5-6 | 普通。明確な改善点あり |
| 3-4 | 問題あり。要改善 |
| 0-2 | 失敗。根本的な見直し必要 |

### 4. 失敗カテゴリ

| カテゴリ | 意味 | 改善アクション |
|---------|------|---------------|
| prompt | 指示が曖昧・不足 | CLAUDE.mdに具体例追加 |
| skill | 手順・スキルが不適切 | スキルファイル更新 |
| agent | 実行方法・権限の問題 | 実行設定を見直し |
| env | 環境・依存関係の問題 | セットアップ手順更新 |
| requirements | 要件自体が不明確 | ユーザーに確認依頼 |
| none | 失敗なし | - |

### 5. 失敗時の追加アクション

失敗カテゴリに応じて、以下を実行：

- **prompt**: CLAUDE.mdの該当セクションに「よくある失敗と対策」を追記
- **skill**: このスキルファイルまたは関連スキルを更新
- **env**: README.mdまたはセットアップ手順を更新
- **requirements**: orch_suggestionsに「要件確認依頼」を追加

## 注意事項

- 評価は正直に行う（甘くしない）
- 同じ失敗を2回以上繰り返したら、必ず知識を更新する
- 改善提案は具体的に書く（「気をつける」ではなく「〇〇を確認してから実行」）
