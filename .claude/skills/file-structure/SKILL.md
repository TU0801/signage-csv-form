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
├── css/
│   ├── style.css       # 共通スタイル
│   └── bulk.css        # 一括入力専用
├── js/
│   ├── version.js      # バージョン管理
│   ├── config.js       # 設定（APIキー等）
│   ├── script.js       # 1件入力ロジック
│   ├── supabase-client.js  # Supabase接続
│   ├── admin.js        # 管理者画面
│   ├── bulk*.js        # 一括入力関連
├── tests/              # Playwrightテスト
└── .claude/skills/     # スキルファイル
```

## モジュール分割ルール
- 1ファイル500行以下を目標
- 800行超えたら分割を検討

## 命名規則
- テスト: XX-機能名.spec.js（XXは連番）
