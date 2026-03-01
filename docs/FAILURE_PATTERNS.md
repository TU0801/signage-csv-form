# 失敗パターン（症状→対策）

| # | 症状 | 原因 | 対策 |
|---|------|------|------|
| 1 | UPDATE成功するがDB更新されない | RLSがUPDATE不許可 | `list_tables`でRLSポリシー確認 |
| 2 | SELECTが空配列を返す | SELECT権限なし | RLSポリシーでSELECT権限確認 |
| 3 | 406 Not Acceptable | `.single()`で複数行/0行 | `.single()`を避けるかRLS確認 |
| 4 | フィールドが常に空 | DBとコードでフィールド名不一致 | `execute_sql`でカラム名を実DBから確認 |
| 5 | undefinedエラー | snake_case/camelCase混在 | `getAllMasterDataCamelCase()`のマッピング確認 |
| 6 | テキストが重なる | gap/padding不足 | 長いテキストで実データテスト |
| 7 | 文字が途中で切れる | overflow: hidden + ellipsis | 必要箇所のみ省略、基本は全文表示 |
| 8 | Invalid form control | 非表示フィールドにrequired | 非表示時は`disabled=true` |
| 9 | SyntaxError重複宣言 | 同スコープでconst重複 | 既存変数を検索してから追加 |
| 10 | モーダル表示されない | `.active`クラス追加漏れ | `modal.classList.add('active')` |
| 11 | Cannot read null | querySelector()がnull | Optional chaining `?.` 使用 |
| 12 | 削除後にnullエラー | HTML削除したがJS未修正 | `grep -r "要素名" js/` で全参照確認してから削除 |
| 13 | 1箇所修正で別箇所に同じバグ | 水平展開せず | `grep -r "修正パターン" js/` で類似箇所を全修正 |
| 14 | テスト失敗を放置 | 優先度誤り | テスト赤=プッシュ禁止、全修正してから次タスク |
| 15 | UI修正で4回往復 | 事前UI確認なし | 実装前にユーザーに確認、ブラウザテスト後に報告 |

## パターン追加時

テーブルに1行追加。症状・原因・対策を各20文字以内で。
