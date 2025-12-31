# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

マンション共用部サイネージ向けの点検案内CSV作成ツール。メンテナンス会社ごとに担当ビルを管理し、デジタルサイネージ用のCSVを生成する。

**URL**: https://github.com/TU0801/signage-csv-form
**デプロイ**: GitHub Pages
**バックエンド**: Supabase (PostgreSQL + Storage + Auth)

## 基本設定

- **言語**: 日本語でやりとりする
- **バージョン管理**: コミット時は必ず `js/version.js` を更新
- **テスト**: プッシュ前に全テスト実行必須

## 開発コマンド

```bash
# ローカルサーバー起動
npm run serve
# → http://localhost:8080

# テスト実行
npm test                    # 全テスト
npm run test:headed         # ブラウザ表示あり
npm run test:debug          # デバッグモード
npm run test:report         # レポート表示

# 単一テストファイル実行
npx playwright test tests/data-entry.spec.js
```

## アーキテクチャ

### マルチテナント構造（v1.13.0+）

```
ユーザー (signage_profiles)
  └─ vendor_id → メンテナンス会社 (signage_master_vendors)
       ├─ building_vendors → 担当ビル
       └─ signage_vendor_inspections → 対応点検種別
```

**権限フィルター**:
- 一般ユーザー: 自分のvendor_idに紐づくビルのみ表示
- 管理者: 全ビル表示

### 3画面構成

| 画面 | ファイル | 主な機能 | モジュール |
|------|---------|---------|-----------|
| 1件入力 | index.html | 個別データ作成 | js/script.js (1ファイル) |
| 一括入力 | bulk.html | Excel貼り付け、複数編集 | js/bulk-*.js (5モジュール) |
| 管理画面 | admin.html | マスター管理、承認、紐付け | js/admin*.js (3ファイル) |

### データフロー

```
[入力画面]
  ↓ createEntries()
[signage_entries] status='draft'
  ↓ 管理者が承認
[signage_entries] status='submitted'
  ↓ CSVエクスポート
[デジタルサイネージシステム]
```

### モジュール分割（一括入力）

`bulk.html` は5つのモジュールに分割:

- **bulk.js**: エントリーポイント、初期化
- **bulk-state.js**: グローバル状態管理
- **bulk-table.js**: テーブル描画、バリデーション
- **bulk-data.js**: CRUD操作、CSV生成
- **bulk-modals.js**: モーダル管理

すべて ES Modules (`type="module"`) で連携。

### Supabase API層（supabase-client.js）

**主要API**:
- `getAllMasterData()` - 権限フィルター付きマスター取得
- `getAssignedBuildings()` - ユーザーの担当ビル
- `createEntries()` - 複数データ一括作成
- `getBuildingVendors()` - 物件紐付け管理
- `getVendorInspections()` - 点検種別紐付け管理

**認証**:
- `getProfile()` - vendor_id, role取得
- `isAdmin()` - 管理者判定

## 重要な実装パターン

### 1. 物件データ構造

Supabaseから取得時は**グループ化済み**:
```javascript
{
  property_code: "2010",
  property_name: "エンクレスト",
  terminals: [
    { terminal_id: "h0001A00", supplement: "" },
    { terminal_id: "h0001A01", supplement: "" }
  ]
}
```

**注意**: `renderProperties()` で再グループ化しない！

### 2. テーブル命名規則

すべてのテーブルに `signage_` プレフィックス:
- ✅ `signage_profiles`
- ✅ `signage_vendor_inspections`
- ❌ `vendor_inspections` (古い命名)

### 3. 認証モック（テスト）

```javascript
import { setupAuthMockWithMasterData } from './test-helpers.js';

test.beforeEach(async ({ page }) => {
  await setupAuthMockWithMasterData(page, { isAdmin: true });
});
```

### 4. CSS Grid（マスター一覧）

```css
.master-item {
  display: grid;
  grid-template-columns: minmax(180px, 2fr) minmax(350px, 5fr) auto;
  gap: 2rem;
}
```

3列: 名前 | 詳細情報 | 操作ボタン

## Supabaseスキーマ

### 主要テーブル

| テーブル | 説明 | 主要カラム |
|---------|------|-----------|
| signage_profiles | ユーザー | vendor_id, role, status |
| signage_entries | 点検データ | property_code, vendor_name, status |
| building_vendors | 物件紐付け | property_code, vendor_id, status |
| signage_vendor_inspections | 点検紐付け | vendor_id, inspection_id, status |
| signage_master_properties | 物件 | property_code, terminals (JSONB) |
| signage_master_vendors | 受注先 | vendor_name, inspection_type |
| signage_master_inspection_types | 点検種別 | inspection_name, template_image |

### RLSポリシー

- 一般ユーザー: 自分のvendor_idのデータのみ
- 管理者: 全データアクセス可能
- status='inactive'のユーザーはデータ操作不可

## スキル活用

`.claude/skills/` に10個のスキル定義。**状況に応じて自動参照**:

| スキル | 発動条件 |
|--------|----------|
| **feature-development** | 「〇〇を作って」と言われた時 |
| **testing** | コード変更後、プッシュ前 |
| **version-release** | 「プッシュして」と言われた時 |
| **supabase** | DB操作時 |
| **admin-improvements** | 管理画面改善時 |
| **file-structure** | ファイル探索時 |

## 開発ワークフロー

### 新機能追加

1. **調査**: AskUserQuestionで要件確認
2. **設計**: TodoWriteでタスク分割
3. **実装**: 段階的コミット
4. **テスト**: 全テスト実行
5. **バージョン更新**: js/version.js
6. **プッシュ**: git push

### コミットルール

- `feat:` - 新機能
- `fix:` - バグ修正
- `refactor:` - リファクタリング
- `chore:` - 環境整備
- `docs:` - ドキュメント

**必須**: Co-Authored-By: Claude を含める

## コード品質

- **型比較**: `String()` で統一
- **エラーハンドリング**: null返却で防御的に
- **トースト通知**: `.show` クラス必須
- **マスターデータ**: 既にグループ化済み（再グループ化禁止）

## ドキュメント

すべて `docs/` ディレクトリに集約:
- `SPECIFICATION.md` - システム仕様書（800行）
- `VENDOR_MULTITENANCY_IMPLEMENTATION.md` - マルチテナント実装ガイド
- `BUGS.md` - 既知の問題
- `TEST_CASES.md` - テストケース一覧

## Supabase操作

マイグレーションファイルは `supabase/` に配置:
- `schema.sql` - 基本スキーマ
- `migration-vendor-multitenancy.sql` - マルチテナント機能
- `add-user-status.sql` - ユーザー論理削除
- `add-vendor-inspection-relationships.sql` - 点検種別紐付け

**実行**: Supabase Dashboard → SQL Editor で実行

## トラブルシューティング

### テスト失敗時
- `test-helpers.js` の `setupAuthMockWithMasterData` を確認
- vendor_id が設定されているか確認

### マスターデータが表示されない
- RLSポリシーを確認
- `getAllMasterData()` が権限フィルター済みか確認
- building_vendors テーブルに紐付けがあるか確認

### ビルが表示されない（一般ユーザー）
- signage_profiles.vendor_id が設定されているか確認
- building_vendors に紐付けレコードがあるか確認（status='active'）
