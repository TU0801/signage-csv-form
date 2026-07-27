---
name: file-structure
description: プロジェクト構成の勘所（各ディレクトリの役割・ls では分からない落とし穴・ファイル分割とテスト命名の規約）。ファイル探索やファイル追加の前に参照。
allowed-tools: Read, Glob, Grep
---

# 構成の勘所

**ファイルの一覧は `ls` / Glob で取る。** ここには一覧では分からないことだけを書く。

## ディレクトリの役割

| 場所 | 役割 |
|---|---|
| ルートの `*.html` | 画面。`index.html`(1件入力) / `bulk.html`(一括入力) / `admin.html`(管理) / `login.html` |
| `js/` | 画面ロジック。`script.js`=1件入力、`bulk*.js`=一括入力、`admin-*.js`=管理画面（画面ごとに1ファイル） |
| `js/supabase/` | **このアプリ自身のデータアクセス層**（下記の落とし穴を参照） |
| `css/` | 画面ごとに1ファイル |
| `tests/` | Playwright E2E。`e2e-*.spec.js`=通常フロー、`bulk-*.spec.js`=一括入力、`bug-fixes.spec.js`=不具合の回帰 |
| `docs/` | 仕様・失敗パターン・品質レビュー。`docs/issues/` に個票 |
| `scripts/` | 運用スクリプト。**スキーマ関連の `.sql` もここ**（専用の `supabase/` ディレクトリは無い） |
| `v2/` | 次期版のサブアプリ（下記の落とし穴を参照） |
| `error/` | 不具合時のスクリーンショット置き場（エラー処理のコードではない） |
| `既存_CSV作成用/` | 移行元の Excel/VBA 資産。参照専用 |

## ls では分からない落とし穴

- **`js/supabase/` は SDK のベンダリングではない。** Supabase SDK は実行時に CDN から読む
  （`import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.0'`）。
  このディレクトリはテーブル別のクエリをまとめた**自前のデータアクセス層**。
  DB に触る変更はここを直す — 画面側の `js/*.js` に直接クエリを書かない。
- **ルートはビルド不要の素の HTML/JS だが、`v2/` は別物。**
  `v2/` は独自の `package.json` / TypeScript / ビルド手順 / `node_modules` を持つ独立サブアプリ
  （`npm run build` はルートに無く `v2/` 側にある）。ルートの流儀を持ち込まない。
- **ルートに `supabase/` ディレクトリは存在しない。** スキーマ変更用の SQL は `scripts/` にある。
- **`admin-auth` はディレクトリではなく JSON ファイル。**

## 規約

- 1ファイル500行以下を目標、800行超で分割を検討
- テスト命名: `XX-機能名.spec.js`
