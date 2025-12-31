---
name: file-structure
description: プロジェクトのファイル構成と各ファイルの役割。ファイル探索時に参照。
allowed-tools: Read, Glob, Grep
---

# ファイル構成スキル

## ディレクトリ構成
```
signage-csv-form/
├── index.html          # 1件入力画面
├── bulk.html           # 一括入力画面
├── admin.html          # 管理者画面
├── login.html          # ログイン画面
├── README.md           # プロジェクト概要
├── CLAUDE.md           # Claude Code設定
├── css/
│   ├── style.css       # 共通スタイル
│   └── bulk.css        # 一括入力専用
├── js/
│   ├── version.js      # バージョン管理
│   ├── config.js       # 設定（APIキー等）
│   ├── script.js       # 1件入力ロジック
│   ├── supabase-client.js  # Supabase API
│   ├── admin.js        # 管理者画面
│   ├── admin-masters.js    # マスター管理
│   ├── admin-settings.js   # 設定管理
│   ├── bulk.js         # 一括入力エントリーポイント
│   ├── bulk-state.js   # 状態管理
│   ├── bulk-table.js   # テーブル操作
│   ├── bulk-data.js    # データ操作
│   └── bulk-modals.js  # モーダル管理
├── docs/               # ドキュメント
│   ├── SPECIFICATION.md    # システム仕様書
│   ├── BUGS.md            # バグ管理
│   ├── TEST_CASES.md      # テストケース
│   ├── DEVELOPMENT_INSTRUCTIONS.md  # 開発手順
│   └── VENDOR_MULTITENANCY_IMPLEMENTATION.md  # マルチテナント実装
├── supabase/           # Supabaseスキーマ・マイグレーション
├── scripts/            # ユーティリティスクリプト
├── tests/              # Playwrightテスト
├── images/             # テンプレート画像
└── .claude/skills/     # Claudeスキル定義
```

## モジュール分割ルール
- 1ファイル500行以下を目標
- 800行超えたら分割を検討

## 命名規則
- テスト: XX-機能名.spec.js（XXは連番）
