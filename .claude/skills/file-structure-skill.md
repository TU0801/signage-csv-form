# ファイル構成スキル

## 概要
このプロジェクトのファイル構成と各ファイルの役割。

## ディレクトリ構成
```
signage-csv-form/
├── index.html          # 1件入力画面
├── bulk.html           # 一括入力画面
├── admin.html          # 管理者画面
├── login.html          # ログイン画面
├── css/
│   ├── style.css       # 共通スタイル
│   └── bulk.css        # 一括入力専用スタイル
├── js/
│   ├── version.js      # バージョン管理
│   ├── config.js       # 設定（APIキー等）
│   ├── script.js       # 1件入力のロジック
│   ├── supabase-client.js  # Supabase接続
│   ├── admin.js        # 管理者画面ロジック
│   ├── bulk.js         # 一括入力メインエントリ
│   ├── bulk-state.js   # 一括入力の状態管理
│   ├── bulk-table.js   # 一括入力のテーブル操作
│   ├── bulk-modals.js  # 一括入力のモーダル
│   └── bulk-data.js    # 一括入力のデータ操作
├── tests/              # Playwrightテスト
├── images/             # 貼紙テンプレート画像
└── .claude/
    └── skills/         # スキルファイル
```

## モジュール分割ルール
- 1ファイル500行以下を目標
- 800行超えたら分割を検討
- 機能ごとに分割（state, table, modals, data）

## 命名規則
- HTML: 機能名.html
- CSS: 機能名.css
- JS: 機能名.js または 機能名-サブ機能.js
- テスト: XX-機能名.spec.js（XXは連番）
