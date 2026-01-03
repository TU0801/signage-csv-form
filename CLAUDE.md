# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

**マンション共用部向けデジタルサイネージCMS（コンテンツ管理システム）**

点検・工事案内を管理し、デジタルサイネージへ配信するコンテンツを作成・管理する。メンテナンス会社ごとに担当ビルを管理し、マルチテナント構造で権限制御を実現。

**現在**: CSV作成・マスター管理・承認ワークフロー
**将来**: スケジューリング・プレビュー・テンプレートエディタ・メディアライブラリを備えた本格CMS

**URL**: https://github.com/TU0801/signage-csv-form
**デプロイ**: GitHub Pages
**バックエンド**: Supabase (PostgreSQL + Storage + Auth)
**現在バージョン**: v1.13.2 (2025-12-31)

## 基本設定

- **言語**: 日本語でやりとりする（**必須**）
- **バージョン管理**: コミット時は必ず `js/version.js` を更新
- **テスト**: プッシュ前に全テスト実行必須

## 🚨 必読ドキュメント

実装・コミュニケーション前に必ず参照すること：

### 📖 [LESSONS_LEARNED.md](docs/LESSONS_LEARNED.md) - 過去の失敗から学ぶ
**内容**: 118コミットから抽出した失敗パターンと解決策
**いつ読むか**: 実装前、修正前、エラー発生時

**主な教訓**:
1. **フォームバリデーション** - 非表示フィールドは `disabled = true` にする
2. **データ型の不一致** - Supabaseデータは `String()` で比較
3. **テーブル命名** - すべてのテーブルに `signage_` プレフィックス
4. **API/FK参照** - 複雑な結合クエリは避ける、シンプルに分割
5. **UI表示** - `gap: 2rem` でオーバーラップ防止、`text-overflow: ellipsis` は慎重に
6. **タイポ** - 定数化、スペルチェック必須

### 💬 [COMMUNICATION_GUIDELINES.md](docs/COMMUNICATION_GUIDELINES.md) - 効果的なコミュニケーション
**内容**: ユーザーとのやり取りで守るべきルール
**いつ読むか**: 質問前、報告前、会話開始時

**基本原則**:
1. **日本語第一** - 英語NG、常に日本語で
2. **簡潔さと明瞭さ** - 要点を先に、不要な前置き省く
3. **質問は1回だけ** - 質問攻めNG、自己判断で進める
4. **透明性** - TodoWriteで進捗を見せる
5. **学習と改善** - 同じミスを繰り返さない

**避けるべきこと**:
- ❌ 英語での応答
- ❌ 質問攻め（連続した質問）
- ❌ 過度な丁寧語
- ❌ 説明だけして実行しない
- ❌ 原因不明のまま再試行

**効果的だったパターン**:
- ✅ 段階的な実装報告（TodoWrite活用）
- ✅ AskUserQuestionで選択肢提示（2-4個、推奨案明示）
- ✅ エラー時の即座の報告と提案
- ✅ ultrathink時の徹底分析（詳細タスク分割）

### 📋 既知のバグ
**[BUGS.md](docs/BUGS.md)** - 修正済みバグと未修正バグの一覧

## 最近の変更履歴（v1.13系）

### v1.13.2 (2025-12-31) - マスターモーダル修正
**修正内容**:
- マスターモーダルのフォームバリデーションエラー修正
  - 問題: 非表示の必須フィールドが「invalid form control」エラーを発生
  - 解決: 非表示セクションのinputをdisableに設定し、表示中のセクションのみ有効化
- API 400エラー修正
  - 問題: `getPendingBuildingRequests()` で無効な外部キー結合
  - 解決: 複雑なFK結合を回避し、`getUserEmail()` 関数を使用

**影響範囲**: admin-masters.js, admin.js, supabase-client.js

**テスト方法**:
```bash
npm test
# 管理画面でマスターの作成・編集が正常に動作することを確認
```

### v1.13.1 (2025-12-31) - 点検種別追加機能
**新機能**:
- 受注先管理で「点検種別を追加」ボタンを追加
- 未紐付けの点検種別から選択して追加可能
- 重複防止バリデーション実装

**テスト方法**:
```bash
# 管理画面 → 受注先マスター → 任意の受注先を選択
# 「点検種別紐付け」タブで「点検種別を追加」をクリック
# 未紐付けの点検種別が表示され、選択して追加できることを確認
```

### v1.13.0 (2025-12-30) - 点検種別紐付け機能
**新機能**:
- `signage_vendor_inspections` テーブル新設
- 受注先ごとに対応可能な点検種別を管理
- 管理画面で紐付けの作成・削除が可能

**マイグレーション**: `supabase/add-vendor-inspection-relationships.sql`

### v1.12.0 - UI改善とユーザー管理強化
**改善内容**:
- マスター一覧のグリッドレイアウト改善（3列: 名前 | 詳細 | 操作）
- テキストオーバーラップ防止
- サイドバー統計のインライン表示
- ユーザー管理機能の強化

## 今後の実装予定

### Phase 1: CMS基盤強化（優先度: 高）
- [ ] **コンテンツスケジューリング機能**
  - 表示開始日時・終了日時の詳細設定
  - タイムゾーン対応
  - 定期配信設定（毎週/毎月など）

- [ ] **プレビュー機能の強化**
  - リアルタイムプレビュー
  - デバイス別プレビュー（画面サイズシミュレーション）
  - QRコード表示プレビュー

- [ ] **テンプレートエディタ**
  - ドラッグ&ドロップでテキスト配置
  - カスタムフォント・カラー選択
  - レイヤー管理

### Phase 2: メディア管理（優先度: 中）
- [ ] **メディアライブラリ**
  - 画像・PDF一元管理
  - タグ付け・検索機能
  - バージョン管理

- [ ] **ファイルストレージ最適化**
  - Supabase Storageとの連携強化
  - サムネイル自動生成
  - 容量制限・アラート

### Phase 3: ユーザビリティ向上（優先度: 中）
- [ ] **ダッシュボード強化**
  - グラフ・チャートでの可視化
  - 配信状況リアルタイム表示
  - アラート通知

- [ ] **モバイル対応**
  - レスポンシブデザイン全面対応
  - タブレット最適化
  - PWA化検討

### Phase 4: ワークフロー・通知（優先度: 低）
- [ ] **承認ワークフロー強化**
  - 多段階承認
  - コメント機能
  - 差し戻し機能

- [ ] **通知システム**
  - メール通知
  - Slack/Teams連携
  - ブラウザプッシュ通知

### Phase 5: 分析・レポート（優先度: 低）
- [ ] **配信レポート**
  - 配信履歴・統計
  - エクスポート機能（PDF/Excel）
  - カスタムレポート作成

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

## ファイル構成

```
signage-csv-form/
├── index.html              # 1件入力画面
├── bulk.html               # 一括入力画面
├── admin.html              # 管理画面（マスター管理・承認）
├── login.html              # ログイン画面
├── js/
│   ├── config.js           # 環境設定
│   ├── auth.js             # 認証処理
│   ├── supabase-client.js  # Supabase API層
│   ├── script.js           # 1件入力ロジック
│   ├── bulk.js             # 一括入力エントリーポイント
│   ├── bulk-state.js       # 一括入力: 状態管理
│   ├── bulk-table.js       # 一括入力: テーブル描画
│   ├── bulk-data.js        # 一括入力: CRUD操作
│   ├── bulk-modals.js      # 一括入力: モーダル管理
│   ├── admin.js            # 管理画面メイン
│   ├── admin-masters.js    # 管理画面: マスター管理
│   ├── admin-settings.js   # 管理画面: 設定
│   └── version.js          # バージョン情報
├── css/                    # スタイルシート
├── tests/                  # Playwrightテスト
│   ├── test-helpers.js     # テストヘルパー
│   ├── data-entry.spec.js  # 1件入力テスト
│   ├── e2e-user-flows.spec.js      # ユーザーE2Eテスト
│   ├── e2e-admin-flows.spec.js     # 管理者E2Eテスト
│   └── ...
├── docs/                   # ドキュメント
│   ├── SPECIFICATION.md    # システム仕様書
│   ├── VENDOR_MULTITENANCY_IMPLEMENTATION.md
│   ├── BUGS.md
│   └── TEST_CASES.md
├── supabase/               # マイグレーションSQL
│   ├── schema.sql
│   ├── migration-vendor-multitenancy.sql
│   └── add-vendor-inspection-relationships.sql
└── .claude/                # Claudeスキル定義
    └── skills/
        ├── feature-development.md
        ├── testing.md
        ├── version-release.md
        └── ...
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

### データフロー（現在 → 将来）

**現在のワークフロー**:
```
[入力画面（1件/一括）]
  ↓ createEntries()
[signage_entries] status='draft'
  ↓ 管理者が承認
[signage_entries] status='submitted'
  ↓ CSVエクスポート
[デジタルサイネージシステム]
```

**将来のCMSワークフロー**（実装予定）:
```
[コンテンツ作成]
  ↓ テンプレート選択・編集
[メディアライブラリ]
  ↓ プレビュー・スケジュール設定
[承認ワークフロー]
  ↓ 配信スケジュール
[サイネージデバイス]
  ↓ 表示ログ収集
[分析・レポート]
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

## エージェントスキル活用

`.claude/skills/` に10個のスキル定義。**状況に応じて自動参照**してください。

### スキル一覧と発動条件

| スキル | 発動タイミング | 主な内容 |
|--------|--------------|---------|
| **communication** | 常時 | コミュニケーションルール（日本語、簡潔さ、質問は1回） |
| **feature-development** | 「〇〇を作って」と言われた時 | フェーズ管理（調査→設計→実装→テスト） |
| **testing** | コード変更後、プッシュ前 | Playwrightテスト実行、失敗時の対応 |
| **version-release** | 「プッシュして」と言われた時 | バージョン更新、テスト、コミット＆プッシュ |
| **supabase** | DB操作時 | Supabase API、認証、マスターデータ、承認ワークフロー |
| **admin-improvements** | 管理画面改善時 | admin.html機能一覧、改善課題、技術スタック |
| **file-structure** | ファイル探索時 | ディレクトリ構成、モジュール分割ルール、命名規則 |
| **bulk-module** | 一括入力画面変更時 | bulk.jsモジュール構成、callbacksパターン |
| **ask-user-question** | 選択肢提示時 | AskUserQuestionツールの使い方（2-4個、推奨案） |
| **self-improvement** | タスク完了時、エラー時 | 実行記録保存、自己評価、失敗カテゴリ |

### 🎯 主要スキルの詳細

#### 1. communication（コミュニケーション）
**常時適用**

**基本ルール**:
- 日本語で、簡潔に、要点から述べる
- 質問は1回だけ（質問攻めNG）
- 確認なしで進められるなら進める

**失敗時の報告**:
```
- 失敗内容: 何が起きたか
- 原因: なぜ起きたか
- 試したこと: 何を試したか
- 提案: どうすればいいか
```

#### 2. feature-development（新機能開発）
**トリガー**: 「〇〇機能を作って」「〇〇を追加して」

**フェーズ**:
1. **調査・仕様確認** - DB、既存パターン、要件を確認
2. **設計書作成** - 機能チェックリスト、UI設計、データフロー
3. **実装** - DB変更→バックエンド→フロントエンド→エラーハンドリング
4. **テスト** - 正常系、異常系、境界値、権限チェック

**やってはいけないこと**:
- フェーズ1をスキップして実装を始める
- RLSポリシーを確認せずにDB操作を実装
- 既存のHTML ID名を確認せずに新しいIDを追加

#### 3. testing（テスト）
**トリガー**: コード変更後、プッシュ前、「テストして」と指示された時

**コマンド**:
```bash
npx playwright test --reporter=list       # 全テスト
npx playwright test tests/e2e-user-flows.spec.js  # 特定テスト
```

**テスト構成** (73テスト):
- e2e-user-flows.spec.js (22テスト) - 一般ユーザーE2E
- e2e-admin-flows.spec.js (24テスト) - 管理者E2E
- 09-excel-paste.spec.js - Excel貼り付け
- 10-data-consistency.spec.js - データ整合性

**方針**: 量より質、ユーザーの実際の操作フローをテスト

#### 4. version-release（バージョン管理）
**トリガー**: 「プッシュして」と指示された時

**バージョン番号規則**:
- **メジャー (X)**: 破壊的変更
- **マイナー (Y)**: 新機能追加
- **パッチ (Z)**: バグ修正

**手順**:
1. テスト実行 (`npm test`)
2. js/version.js更新
3. コミット＆プッシュ
4. ユーザーに報告

#### 5. supabase（Supabase連携）
**トリガー**: DB操作時

**主要API** (js/supabase-client.js):
- 認証: `getUser()`, `getProfile()`, `isAdmin()`
- マスター: `getAllMasterData()`, `getMasterProperties()`
- エントリー: `getEntries()`, `createEntries()`, `updateEntry()`
- 承認: `getPendingEntries()`, `approveEntry()`, `rejectEntry()`

**注意**: anonキーのみ使用、RLS必須

#### 6. admin-improvements（管理画面改善）
**トリガー**: 管理画面の機能追加や改善時

**現在の機能** (v1.13.1):
- 承認待ちタブ（ビル追加、データ申請）
- データ一覧タブ（フィルター、CSV、ステータス変更）
- 紐付け管理タブ（物件×ベンダー、点検種別×ベンダー）
- マスター管理タブ（物件、受注先、点検種別、カテゴリ、テンプレート、設定）
- ユーザー管理タブ（追加、編集、権限変更、無効化）

**技術スタック**:
- admin.js (1600+行), admin-masters.js (600+行), admin-settings.js

#### 7. bulk-module（一括入力モジュール）
**トリガー**: bulk.html関連の変更時

**モジュール構成** (ES Modules):
- `bulk.js` - エントリーポイント、初期化
- `bulk-state.js` - 状態管理 (state, getRows, getMasterData)
- `bulk-table.js` - テーブル操作 (addRow, duplicateRows, deleteRows)
- `bulk-modals.js` - モーダル管理 (context menu, bulk edit, detail, paste)
- `bulk-data.js` - データ操作 (auto-save, CSV, toast, UI update)

**callbacksパターン**:
```javascript
const callbacks = { showToast, triggerAutoSave, updateStats };
addRowWithCopy(callbacks);
```

**修正時の注意**:
1. 新関数追加時はexportを忘れずに
2. bulk.jsのimportも更新
3. callbacksへの追加が必要か確認

#### 8. ask-user-question（選択肢提示）
**トリガー**: ユーザーに選択肢を提示する時

**やるべきこと**:
- AskUserQuestionツールで提示（テキスト列挙ではなくチェックボックス形式）
- オプションは2-4個（多すぎると選びにくい）
- 推奨オプションは先頭に配置（「(推奨)」追加）

**やってはいけないこと**:
- 選択肢をテキストで列挙するだけ
- オプション4個超え

### スキル使用時の心構え

1. **自動参照** - 状況に応じて該当スキルを思い出す
2. **ルール遵守** - スキルに書かれたルールを守る
3. **更新責任** - 新しい教訓を学んだらスキルファイルを更新
4. **統合** - 複数のスキルを組み合わせて使う（例: feature-development + testing + version-release）

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

### 📚 必読ドキュメント（優先度: 高）
- **`LESSONS_LEARNED.md`** - 過去の失敗から学ぶ教訓集（118コミット分析）⭐️ **実装前必読**
- **`COMMUNICATION_GUIDELINES.md`** - 効果的なコミュニケーション方法 ⭐️ **質問前必読**
- `BUGS.md` - 既知の問題（修正済み・未修正）

### 📖 技術ドキュメント（優先度: 中）
- `SPECIFICATION.md` - システム仕様書（800行、詳細設計）
- `VENDOR_MULTITENANCY_IMPLEMENTATION.md` - マルチテナント実装ガイド
- `TEST_CASES.md` - テストケース一覧
- `DEVELOPMENT_INSTRUCTIONS.md` - 開発手順

### ドキュメント更新ルール
- 新しい教訓を学んだら `LESSONS_LEARNED.md` に追記
- 新しいコミュニケーションパターンを発見したら `COMMUNICATION_GUIDELINES.md` に追記
- バグ修正時は `BUGS.md` を更新
- 機能追加時は `SPECIFICATION.md` を更新

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

## テスト＆チェックリスト

### 変更後の必須チェック項目

#### 1. 全テスト実行
```bash
npm test
```
**確認ポイント**:
- すべてのテストがPASSすること
- 新規機能追加時は対応するテストも追加すること

#### 2. 手動動作確認（1件入力画面）
- [ ] ログイン/ログアウトが正常に動作
- [ ] 物件選択で端末が連動更新
- [ ] 受注先選択で緊急連絡先が自動入力
- [ ] 点検種別選択でプレビュー画像が表示
- [ ] データ追加が正常に動作
- [ ] 入力データがテーブルに表示
- [ ] CSVダウンロードが正常

#### 3. 手動動作確認（一括入力画面）
- [ ] Excel貼り付けが正常に動作
- [ ] テーブル編集（追加・削除・更新）が正常
- [ ] バリデーションエラーが適切に表示
- [ ] 一括CSV出力が正常
- [ ] モーダル（詳細・編集）が正常に動作

#### 4. 手動動作確認（管理画面）
- [ ] マスター一覧表示が正常
- [ ] マスター作成・編集・削除が正常
- [ ] 物件紐付けの作成・承認・削除が正常
- [ ] 点検種別紐付けの作成・削除が正常
- [ ] ユーザー管理（作成・ステータス変更）が正常
- [ ] 承認待ちデータの承認・却下が正常

#### 5. バージョン更新確認
```bash
cat js/version.js
# 変更内容に応じて適切にバージョンアップされているか確認
# - バグ修正: v1.13.2 → v1.13.3
# - 新機能追加: v1.13.x → v1.14.0
# - 破壊的変更: v1.x.x → v2.0.0
```

#### 6. Git確認
```bash
git status
git diff
# 意図しないファイル変更がないか確認
# コミットメッセージが適切か確認
```

### デプロイ前チェックリスト
- [ ] 全テストPASS
- [ ] 手動動作確認完了
- [ ] version.js更新済み
- [ ] CLAUDE.md更新（必要な場合）
- [ ] コミットメッセージが適切
- [ ] Co-Authored-By: Claude 記載

### 緊急時の対応
**問題発生時**:
1. `git log --oneline -5` で直近のコミットを確認
2. `git revert <commit-hash>` で問題のコミットを取り消し
3. または `git reset --hard <commit-hash>` で特定のコミットまで戻す（注意: 変更が失われる）

**テスト失敗時**:
1. エラーメッセージを確認
2. `npm run test:headed` でブラウザ表示して動作確認
3. `npm run test:debug` でデバッグモードで実行
4. `docs/BUGS.md` に既知の問題として記録

---

## 🔧 未実装機能チェックリスト

**参照**: `docs/IMPLEMENTATION_GAPS.md` に詳細分析あり

### 必須実装項目

#### 1. 管理者用ベンダー選択ドロップダウン（index.html, bulk.html）

**仕様**: 管理者は任意のメンテナンス会社として入力できる

**実装ステップ**:
- [ ] index.htmlにベンダー選択ドロップダウンを追加（管理者のみ表示）
- [ ] bulk.htmlにベンダー選択ドロップダウンを追加（管理者のみ表示）
- [ ] ベンダー選択時に担当ビルと点検種別を動的更新
- [ ] 選択したvendor_idでcreateEntries()を呼び出す
- [ ] テストケース追加

**UI配置**: 物件選択の上、ログイン情報の下

**条件分岐**:
```javascript
const profile = await getProfile();
if (profile.role === 'admin') {
  // ベンダー選択ドロップダウンを表示
  // 選択したvendor_idで入力
} else {
  // ベンダー選択を非表示
  // profile.vendor_idで入力
}
```

---

#### 2. 一般ユーザー用「物件追加リクエスト」ボタン

**仕様**: 一般ユーザーが新規物件の追加を申請できる

**実装ステップ**:
- [ ] index.htmlに「+ 新規物件を追加リクエスト」ボタン追加
- [ ] bulk.htmlに「+ 新規物件を追加リクエスト」ボタン追加
- [ ] リクエストモーダル作成（物件コード、物件名、端末ID入力）
- [ ] addBuildingVendor(propertyCode)でpending状態で保存
- [ ] トースト通知「管理者の承認待ちです」
- [ ] テストケース追加

**UI配置**: 物件選択ドロップダウンの横

**条件分岐**:
```javascript
if (profile.role !== 'admin') {
  // 一般ユーザーのみリクエストボタン表示
}
```

---

### 初期データ確認項目

#### 1. Supabase初期データ実行確認

**実行すべきSQL関数**:
- [ ] `SELECT assign_default_inspection_types();` - ベンダーにinspection_type設定
- [ ] `SELECT initialize_building_vendors();` - 全物件×全ベンダー紐付け
- [ ] `SELECT initialize_signage_vendor_inspections();` - 全ベンダー×全点検種別紐付け

**確認コマンド**:
```sql
-- building_vendors初期化確認
SELECT COUNT(*) FROM building_vendors WHERE status = 'active';
-- 期待値: (物件数) × (ベンダー数) 例: 24 × 4 = 96件

-- vendor_inspections初期化確認
SELECT COUNT(*) FROM signage_vendor_inspections WHERE status = 'active';
-- 期待値: (ベンダー数) × (点検種別数) 例: 4 × 169 = 676件

-- inspection_type設定確認
SELECT vendor_name, inspection_type FROM signage_master_vendors;
-- すべてのベンダーにinspection_typeが設定されていること
```

---

#### 2. 管理者ベンダー作成確認

**実行すべきSQL**: `supabase/add-admin-vendor.sql`

**確認コマンド**:
```sql
SELECT * FROM signage_master_vendors WHERE vendor_name = '管理者（BARAN）';
-- レコードが存在すること
```

**未作成の場合**:
```sql
INSERT INTO signage_master_vendors (vendor_name, emergency_contact, inspection_type)
VALUES ('管理者（BARAN）', '', '全種別')
ON CONFLICT (vendor_name) DO NOTHING;
```

---

#### 3. 管理者のvendor_id設定確認

**確認コマンド**:
```sql
SELECT id, email, vendor_id, role FROM signage_profiles WHERE role = 'admin';
-- vendor_idがNULLでないこと（管理者（BARAN）のIDが設定されていること）
```

**未設定の場合**:
```sql
UPDATE signage_profiles
SET vendor_id = (SELECT id FROM signage_master_vendors WHERE vendor_name = '管理者（BARAN）')
WHERE role = 'admin';
```

---

## 🚀 実装ロードマップ

### Step 1: 初期データ確認・セットアップ（30分）
1. Supabaseで上記確認コマンド実行
2. 未実行の関数を実行
3. 管理者ベンダー作成
4. 管理者のvendor_id設定

### Step 2: 管理者用ベンダー選択実装（2-3時間）
1. index.htmlに実装
2. bulk.htmlに実装
3. テスト作成・実行
4. コミット＆プッシュ

### Step 3: 物件追加リクエスト実装（1-2時間）
1. index.htmlに実装
2. bulk.htmlに実装
3. テスト作成・実行
4. コミット＆プッシュ

### Step 4: 全体テスト（30分）
1. E2Eテスト全実行
2. 手動動作確認
3. ドキュメント更新

---

## ⚠️ 実装時の注意事項

### vendor選択ドロップダウン実装

**やってはいけないこと**:
- ❌ 一般ユーザーにもドロップダウンを表示
- ❌ ベンダー選択後にビルリストを更新しない
- ❌ vendor_idをグローバル変数に保存せず、送信時に取得できない

**やるべきこと**:
- ✅ `isAdmin()` で表示制御
- ✅ ベンダー選択時に `getBuildingsByVendor(vendorId)` でビル更新
- ✅ 選択したvendor_idを保持（グローバル変数 or data属性）
- ✅ createEntries()呼び出し時に選択したvendor_idを使用

### 物件追加リクエスト実装

**やってはいけないこと**:
- ❌ 管理者にもリクエストボタンを表示
- ❌ リクエスト時にstatus='active'で保存
- ❌ 物件マスターに直接追加

**やるべきこと**:
- ✅ 一般ユーザーのみボタン表示（`!isAdmin()`）
- ✅ status='pending'で building_vendors に保存
- ✅ 管理者画面の「承認待ち」に表示されることを確認
- ✅ 承認後に一般ユーザーの画面に表示されることを確認

---

**このチェックリストに従って段階的に実装してください。**

---

## 🎯 品質基準（必須遵守）

### 「完了」報告の条件

以下をすべて満たすまで「完了」と言わない：

1. ✅ **自分でテスト完了**
   - 正常系動作確認
   - 異常系動作確認
   - エッジケース確認

2. ✅ **DBデータ確認**
   - Supabaseで実際のデータを確認
   - 意図通りに保存されているか

3. ✅ **コンソールエラー0件**
   - ブラウザコンソールにエラーなし
   - 警告も可能な限り0

4. ✅ **既存機能の確認**
   - 変更が他の機能を壊していないか
   - リグレッションテスト

5. ✅ **証跡の記録**
   - テスト結果のスクリーンショット
   - コンソールログ
   - SQLクエリ結果

**これらなしに「完了」報告は禁止。**

---

## 🚫 やってはいけないこと

### 1. 推測での修正
❌ 「たぶん〇〇が原因だと思うので修正しました」
✅ 「ログとDBを確認し、〇〇が原因と特定しました」

### 2. テスト丸投げ
❌ 「実装したので試してください」
✅ 「実装し、以下のテストを実施しました：...」

### 3. ワークアラウンド積み重ね
❌ 動かない → 回避策 → また動かない → また回避...
✅ 動かない → 根本原因特定 → 原因修正 → 解決

### 4. RLS無視
❌ 「エラーが出ないので大丈夫です」
✅ 「RLSポリシーを確認し、権限が正しいことを確認しました」

### 5. 部分理解での実装
❌ 「だいたいわかったので実装します」
✅ 「要件を完全に理解しました。〇〇と△△と□□を実装します」

---

## 📋 実装前チェックリスト

### 理解
- [ ] 要件を完全に理解したか？
- [ ] データフローを図解したか？
- [ ] RLSポリシーを確認したか？
- [ ] 影響範囲を特定したか？
- [ ] エッジケースを考えたか？

### 実装
- [ ] 詳細ログを追加したか？
- [ ] エラーハンドリングは完璧か？
- [ ] セルフコードレビューしたか？
- [ ] ネーミングは適切か？

### テスト
- [ ] 正常系をテストしたか？
- [ ] 異常系をテストしたか？
- [ ] DBデータを確認したか？
- [ ] コンソールエラー0件か？
- [ ] 既存機能は壊れていないか？

### 報告
- [ ] テスト結果を記録したか？
- [ ] 証跡（ログ・スクショ）はあるか？
- [ ] 懸念点を伝えたか？
- [ ] 自信を持って「完了」と言えるか？

**すべてチェック後にコミット＆報告**

---

## 🎓 スキル適用順序

1. **quality-first** ← 最優先。すべての実装前に参照
2. feature-development ← 新機能開発時
3. testing ← テスト実施時
4. その他のスキル

**quality-firstを飛ばさない。**

---

## 📊 目標指標

- **fix:コミット**: 5%以下（現在30%）
- **往復回数**: 1-2回（現在3-7回）
- **テスト報告率**: 100%（現在20%）
- **ユーザー満足度**: 90%以上

**次のセッションでこれらを達成する。**

---

## 🔄 継続的改善の実行（必須）

### セッション開始時（必ず実行）

```bash
# 1. 前回の振り返り
cat docs/NEXT_SESSION_TODO.txt

# 2. メトリクス確認
cat docs/METRICS.md | head -50

# 3. 失敗パターン確認
cat docs/FAILURE_PATTERNS.md | grep "⭐️"

# 4. 今回の目標設定
echo "今回の目標:"
echo "- fix率: <15%"
echo "- 往復数: <2回"
echo "- テスト実施率: 100%"
```

### 実装中（チェックリスト実行）

#### 要素削除時
```bash
# 削除前に必ず実行
grep -r "削除する要素名" js/ css/ *.html

# 全ての参照を確認してから削除
```

#### RLS操作時
```bash
# 実装前に必ず確認
# Supabase Dashboard → Authentication → Policies
# 対象テーブルのポリシーを全て確認
```

#### DB操作時
```bash
# フィールド名を確認
psql -c "\\d signage_profiles" 

# または
grep -r "CREATE TABLE" supabase/schema.sql
```

### セッション終了時（必ず実行）

```bash
# 1. メトリクス更新
# docs/METRICS.mdに今回のデータ追加

# 2. 失敗パターン追加（新しい失敗があれば）
# docs/FAILURE_PATTERNS.mdに追記

# 3. 次回TODO作成
cat > docs/NEXT_SESSION_TODO.txt << 'NEXT'
次回セッション開始時:
1. [ ] メトリクス確認
2. [ ] 失敗パターン確認
3. [ ] 目標設定
4. [ ] 前回の反省確認
NEXT
```

---

## 📚 改善ドキュメント参照

### 必読ドキュメント（毎回）
1. **docs/METRICS.md** - 前回の成績確認
2. **docs/FAILURE_PATTERNS.md** - 同じミス防止
3. **docs/NEXT_SESSION_TODO.txt** - 開始時チェックリスト

### 参考ドキュメント（必要時）
4. **docs/COMPREHENSIVE_PROJECT_ANALYSIS.md** - 全体傾向
5. **docs/DEVELOPMENT_COMMITMENT.md** - コミットメント
6. **docs/CONTINUOUS_IMPROVEMENT_SYSTEM.md** - 改善の仕組み
7. **docs/EXTERNAL_MEMORY_SYSTEMS.md** - 高度な改善策

---

## ⚠️ 絶対に忘れないこと

### 実装時
```
□ FAILURE_PATTERNS.mdを確認（同じミス防止）
□ RLSポリシー確認（Supabaseで）
□ スキーマ確認（schema.sql）
□ 既存コードパターン確認（grep）
```

### コミット前
```
□ ローカルテスト実施
□ コンソールエラー0確認
□ DBデータ確認
□ 既存機能確認
```

### セッション終了時
```
□ METRICS.md更新（必須）
□ FAILURE_PATTERNS.md更新（新規失敗があれば）
□ NEXT_SESSION_TODO.txt作成（必須）
```

**これらを実行しないままセッション終了は禁止。**

---

## 🎯 改善の測定

毎セッション終了時に記録:

```markdown
## YYYY-MM-DD セッション

- コミット数: XX
- fix数: XX (XX%)
- 往復数: XX
- テスト実施率: XX%
- ユーザー発見バグ: XX件
- 評価: ⭐⭐⭐⭐☆

改善度:
- 前回比 fix率: -XX%
- 前回比 往復数: -XX回
```

**トレンドを見て、改善していることを確認する。**
**改善していなければ、プロセスを見直す。**

---

**改善システムは「作る」だけでなく「使う」ことが重要。**
**次回から確実に実行します。**
