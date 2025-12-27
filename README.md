# サイネージCSVフォーム

マンション共用部サイネージ向けの点検案内CSV作成ツール

## 概要

このアプリケーションは、マンション共用部に設置されたデジタルサイネージに表示する点検案内情報を管理・CSV出力するためのWebツールです。

## 機能

- **単発入力** (`index.html`): 1件ずつ点検案内データを入力
- **一括入力** (`bulk.html`): 複数物件のデータをまとめて入力・編集
- **管理者画面** (`admin.html`): マスターデータ（物件・業者・点検種別）の管理
- **CSV出力**: サイネージシステム用のCSVファイル生成・ダウンロード

## セットアップ

### 前提条件

- Node.js 20以上
- npm

### インストール

```bash
git clone https://github.com/TU0801/signage-csv-form.git
cd signage-csv-form
npm install
```

### ローカル実行

```bash
npm run serve
```

ブラウザで http://localhost:8080 を開く

## テスト

### テスト実行

```bash
# 全テスト実行
npm test

# ヘッドレスでない（ブラウザ表示あり）
npm run test:headed

# デバッグモード
npm run test:debug

# レポート表示
npm run test:report
```

### テスト構成

- `tests/01-*.spec.js` - 基本UI・ナビゲーション
- `tests/02-*.spec.js` - 物件選択
- `tests/03-*.spec.js` - 業者選択
- `tests/04-*.spec.js` - 点検種別
- `tests/05-*.spec.js` - フォーム送信
- `tests/06-*.spec.js` - データ管理（編集・削除）
- `tests/07-*.spec.js` - CSV生成
- `tests/08-*.spec.js` - ボタン機能
- `tests/09-*.spec.js` - ログイン
- `tests/10-*.spec.js` - 一括入力基本
- `tests/11-*.spec.js` - 一括入力CSV
- `tests/12-*.spec.js` - 管理者画面
- `tests/13-*.spec.js` - 行詳細モーダル

## ファイル構成

```
signage-csv-form/
├── index.html          # 単発入力画面
├── bulk.html           # 一括入力画面
├── admin.html          # 管理者画面
├── login.html          # ログイン画面
├── js/
│   ├── app.js          # 単発入力ロジック
│   ├── bulk.js         # 一括入力ロジック
│   ├── admin.js        # 管理者画面ロジック
│   ├── auth.js         # Supabase認証
│   ├── supabase-config.js  # Supabase設定
│   ├── version.js      # バージョン表示
│   └── data/           # マスターデータ
│       ├── index.js
│       ├── properties.js   # 物件データ
│       ├── vendors.js      # 業者データ
│       └── inspectionTypes.js  # 点検種別
├── css/
│   └── styles.css      # スタイル
├── tests/              # Playwrightテスト
└── .github/
    └── workflows/
        └── ci.yml      # CI/CD設定
```

## CI/CD

GitHub Actionsで以下を自動実行:

- **プルリクエスト時**: テスト実行
- **main pushに時**: テスト実行 → GitHub Pagesへデプロイ

## 認証

Supabaseを使用した認証が必要です。ログインしないと各画面にアクセスできません。

## ライセンス

ISC
