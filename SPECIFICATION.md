# 点検CSV作成フォーム - システム仕様書

**バージョン**: v1.10.1
**最終更新**: 2025-12-30

---

## 目次

1. [システム概要](#1-システム概要)
2. [ページ構成](#2-ページ構成)
3. [1件入力画面（index.html）](#3-1件入力画面indexhtml)
4. [一括入力画面（bulk.html）](#4-一括入力画面bulkhtml)
5. [管理者画面（admin.html）](#5-管理者画面adminhtml)
6. [データベース設計](#6-データベース設計)
7. [API仕様（Supabase）](#7-api仕様supabase)
8. [イベント一覧](#8-イベント一覧)
9. [ワークフロー](#9-ワークフロー)

---

## 1. システム概要

### 1.1 目的
マンション・ビル管理における掲示板用CSV作成ツール。点検・工事案内の貼紙データを作成し、デジタルサイネージシステムへ取り込むCSVを生成する。

### 1.2 ユーザー種別

| 種別 | 権限 | アクセス可能ページ |
|-----|------|----------------|
| 一般ユーザー | 申請のみ | index.html, bulk.html |
| 管理者 | 全機能 | index.html, bulk.html, admin.html |

### 1.3 認証方式
- Supabase Authentication（メール/パスワード）
- セッション管理: Supabase Auth
- 権限管理: signage_profiles.role カラム

---

## 2. ページ構成

```
/
├── index.html      # 1件入力画面（メイン）
├── bulk.html       # 一括入力画面
├── admin.html      # 管理者画面
├── login.html      # ログイン画面
└── js/
    ├── script.js           # 1件入力のロジック
    ├── bulk.js             # 一括入力エントリーポイント
    ├── bulk-table.js       # テーブル操作
    ├── bulk-data.js        # データ操作
    ├── bulk-state.js       # 状態管理
    ├── bulk-modals.js      # モーダル管理
    ├── admin.js            # 管理画面ロジック
    ├── admin-masters.js    # マスターデータ管理
    ├── supabase-client.js  # Supabase API
    ├── config.js           # 設定（URL, Key）
    └── version.js          # バージョン情報
```

---

## 3. 1件入力画面（index.html）

### 3.1 画面概要
個別に掲示データを作成する画面。フォーム入力→プレビュー確認→データ追加→申請の流れ。

### 3.2 セクション構成

#### ヘッダー
| 要素 | ID/Class | 説明 |
|-----|----------|------|
| ロゴ | - | 点検CSV作成フォーム |
| 1件入力ボタン | - | 現在ページ（アクティブ） |
| 一括入力ボタン | - | bulk.htmlへ遷移 |
| 管理リンク | adminLink | 管理者のみ表示 |
| ユーザー情報 | userEmail | ログイン中のメールアドレス |
| ログアウト | logoutBtn | ログアウト処理 |

#### 入力フォーム

| フィールド | ID | タイプ | 必須 | イベント | 説明 |
|-----------|-----|--------|------|---------|------|
| 物件コード | property | select | ✓ | onchange: onPropertyChange() | 物件選択で端末IDを動的更新 |
| 端末ID | terminal | select | | - | 物件に紐づく端末を表示 |
| 受注先 | vendor | select | ✓ | onchange: onVendorChange() | 緊急連絡先を自動入力 |
| 緊急連絡先 | emergencyContact | text | | - | readonly、受注先から自動設定 |
| 案内カテゴリ | inspectionCategory | select | | onchange: onCategoryChange() | 点検種別をフィルター |
| 点検工事案内 | inspectionType | select | ✓ | onchange: onInspectionTypeChange() | テンプレート画像・案内文を設定 |
| 貼紙タイプ | posterType | radio | | onchange: onPosterTypeChange() | template/custom切替 |
| カスタム画像 | customImage | file | | onchange: onImageSelected() | JPG/PNG、5MB以下 |
| 案内文 | noticeText | textarea | | oninput: updatePreview() | 掲示板用文言 |
| 点検開始日 | startDate | date | | onchange: updatePreview() | 作業開始日 |
| 点検終了日 | endDate | date | | onchange: updatePreview() | 作業終了日 |
| 表示開始（日付） | displayStartDate | date | | - | 掲示板表示開始 |
| 表示開始（時刻） | displayStartTime | time | | - | 掲示板表示開始時刻 |
| 表示終了（日付） | displayEndDate | date | | - | 掲示板表示終了 |
| 表示終了（時刻） | displayEndTime | time | | - | 掲示板表示終了時刻 |
| 掲示備考 | remarks | textarea | | oninput: updatePreview() | 追加備考 |
| 表示時間 | displayTime | number | | - | 1-30秒 |

#### 貼紙プレビュー

| 要素 | 説明 |
|-----|------|
| プレビュー画像 | テンプレート/カスタム画像を表示 |
| 位置選択グリッド | 0:全体、1-4:セル位置を選択 |
| 表示時間調整 | +/-ボタンで秒数調整 |

#### データ一覧

| 機能 | 説明 |
|-----|------|
| 追加データ表示 | 追加されたエントリを一覧表示 |
| 編集ボタン | フォームに読み込んで編集 |
| 削除ボタン | 確認後削除 |
| 申請ボタン | Supabaseにdraft状態で保存 |
| CSVダウンロード | CSV形式でダウンロード |
| CSVプレビュー | モーダルで内容確認 |
| CSVコピー | クリップボードにコピー |

### 3.3 関数一覧

| 関数名 | 引数 | 戻り値 | 説明 |
|-------|------|--------|------|
| init() | - | void | 初期化、マスターデータ読み込み |
| onPropertyChange() | - | void | 物件変更時の端末更新 |
| onVendorChange() | - | void | 受注先変更時の連絡先設定 |
| onCategoryChange() | - | void | カテゴリ変更時の点検種別フィルター |
| onInspectionTypeChange() | - | void | 点検種別変更時のテンプレート設定 |
| onPosterTypeChange() | - | void | 貼紙タイプ切替 |
| onImageSelected(event) | FileEvent | void | 画像ファイル選択処理 |
| clearCustomImage() | - | void | カスタム画像クリア |
| updatePreview() | - | void | プレビュー更新 |
| setPosition(pos) | number | void | 位置選択 |
| adjustTime(delta) | number | void | 表示時間調整 |
| addEntry() | - | void | データ追加 |
| editEntry(idx) | number | void | 編集モード |
| deleteEntry(idx) | number | void | エントリ削除 |
| clearForm() | - | void | フォームリセット |
| renderDataList() | - | void | データ一覧描画 |
| generateCSV() | - | string | CSV生成（28列） |
| downloadCSV() | - | void | CSVダウンロード |
| previewCSV() | - | void | CSVプレビューモーダル |
| copyCSV() | - | Promise | CSVクリップボードコピー |
| submitEntries() | - | Promise | Supabaseへ申請 |
| closeModal(e) | Event | void | モーダルを閉じる |
| showToast(msg, type) | string, string | void | トースト通知 |
| getTemplateImageUrl(key) | string | string/null | テンプレート画像URL取得 |
| hasTemplateImage(key) | string | boolean | テンプレート画像存在確認 |
| escapeHtml(str) | string | string | HTMLエスケープ |

---

## 4. 一括入力画面（bulk.html）

### 4.1 画面概要
Excelからのコピー＆ペーストで複数データを一括入力する画面。

### 4.2 セクション構成

#### ツールバー

| ボタン | ID | ショートカット | 説明 |
|-------|-----|-------------|------|
| 行を追加 | addRowBtn | Ctrl+Enter | 新規行追加 |
| 複製 | duplicateBtn | Ctrl+D | 選択行を複製 |
| 一括編集 | bulkEditBtn | Ctrl+E | 一括編集モーダル |
| 削除 | deleteSelectedBtn | Delete | 選択行削除 |
| Excelから取込 | pasteBtn | - | ペーストモーダル |
| テンプレート | templateSelect | - | テンプレート選択 |
| テンプレ保存 | saveTemplateBtn | - | 現在データを保存 |

#### 統計表示

| ID | 表示内容 |
|-----|---------|
| totalCount | 総件数 |
| validCount | 有効件数 |
| errorCount | エラー件数 |
| selectedCount | 選択中件数 |

#### フィルター

| フィルター | 説明 |
|-----------|------|
| all | すべて表示 |
| valid | 有効のみ |
| error | エラーのみ |

#### テーブル列

| 列 | 必須 | 説明 |
|----|------|------|
| ドラッグハンドル | - | 行の並び替え |
| チェックボックス | - | 行選択 |
| No | - | 行番号 |
| 物件 | ✓ | 物件コード選択 |
| 端末 | | 端末ID選択 |
| 受注先 | ✓ | 受注先選択 |
| 点検種別 | ✓ | 点検種別選択 |
| 点検開始日 | | 日付入力 |
| 点検終了日 | | 日付入力 |
| 備考 | | テキスト入力 |
| 秒数 | | 表示時間 |
| 詳細 | | 詳細モーダル |
| 状態 | | valid/error |

#### フッター

| ボタン | ID | 説明 |
|-------|-----|------|
| 申請する | saveBtn | 有効データをSupabaseに送信 |
| CSVダウンロード | downloadCsvBtn | CSV形式でダウンロード |
| CSVコピー | copyCsvBtn | クリップボードにコピー |

### 4.3 モジュール構成

#### bulk-state.js（状態管理）

| プロパティ | 型 | 説明 |
|-----------|-----|------|
| masterData | object | マスターデータ |
| rows | array | 行データ配列 |
| rowIdCounter | number | 行ID採番 |
| currentFilter | string | 現在のフィルター |
| currentUserId | string | ユーザーID |
| draggedRow | object | ドラッグ中の行 |
| autoSaveTimer | number | 自動保存タイマー |
| appSettings | object | アプリ設定 |

#### bulk-table.js（テーブル操作）

| 関数 | 説明 |
|-----|------|
| addRow(data, callbacks) | 行追加 |
| addRowWithCopy(callbacks) | 最終行コピーで追加 |
| duplicateSelectedRows(callbacks) | 選択行複製 |
| deleteSelectedRows(callbacks) | 選択行削除 |
| renderRow(row, callbacks) | 行描画 |
| validateRow(rowId, callbacks) | 行バリデーション |
| updateTerminals(rowId, propertyCode) | 端末更新 |
| updateRowNumbers() | 行番号更新 |
| updateSelectedCount(callbacks) | 選択数更新 |

#### bulk-data.js（データ操作）

| 関数 | 説明 |
|-----|------|
| triggerAutoSave() | 自動保存トリガー |
| saveAutoSave() | localStorageに保存 |
| restoreAutoSave(callbacks) | 自動保存復元 |
| saveAll(callbacks) | Supabaseに保存 |
| downloadCSV(callbacks) | CSVダウンロード |
| copyCSV(callbacks) | CSVコピー |
| updateStats() | 統計更新 |
| updateEmptyState() | 空状態表示 |
| updateButtons() | ボタン状態更新 |
| applyFilter() | フィルター適用 |

#### bulk-modals.js（モーダル）

| 関数 | 説明 |
|-----|------|
| openPasteModal() | ペーストモーダル開く |
| closePasteModal() | ペーストモーダル閉じる |
| importFromPaste(callbacks) | ペーストデータ取込 |
| downloadExcelTemplate() | Excelテンプレートダウンロード |
| openBulkEditModal(callbacks) | 一括編集モーダル |
| closeBulkEditModal() | 一括編集モーダル閉じる |
| openRowDetailModal(rowId) | 行詳細モーダル |
| closeRowDetailModal() | 行詳細モーダル閉じる |
| openSaveTemplateModal() | テンプレート保存モーダル |
| closeTemplateModal() | テンプレートモーダル閉じる |
| saveTemplate(callbacks) | テンプレート保存 |
| loadTemplates() | テンプレート読み込み |
| applyTemplate(name, callbacks) | テンプレート適用 |
| showContextMenu(e, rowId) | 右クリックメニュー |
| hideContextMenu() | 右クリックメニュー非表示 |

### 4.4 キーボードショートカット

| キー | 機能 |
|-----|------|
| Ctrl+Enter | 行追加 |
| Ctrl+D | 選択行複製 |
| Ctrl+E | 一括編集 |
| Delete | 選択行削除 |
| Tab | 次のセルへ移動 |
| Enter | 次の行へ移動 |
| Escape | 編集キャンセル |

---

## 5. 管理者画面（admin.html）

### 5.1 画面概要
管理者専用。申請データの承認、マスターデータ管理、ユーザー管理を行う。

### 5.2 統計カード

| 項目 | 説明 |
|-----|------|
| 総登録数 | 全エントリ数 |
| 今月の登録 | 当月のエントリ数 |
| ユーザー数 | 登録ユーザー数 |
| 物件数 | 登録物件数（property_codeベース） |

### 5.3 タブ構成

#### 承認待ちタブ

| 機能 | 説明 |
|-----|------|
| 一覧表示 | status='draft'のエントリを表示 |
| 全選択 | チェックボックスで全選択 |
| 一括承認 | 選択エントリを一括承認 |
| 個別承認 | 1件ずつ承認 |
| 却下 | 理由入力後に削除 |
| 詳細表示 | モーダルで詳細確認 |

#### データ一覧タブ

| 機能 | 説明 |
|-----|------|
| フィルター | 物件、期間、状態で絞り込み |
| ステータス変更 | exported/submitted切替 |
| CSVエクスポート | 選択データをCSV出力 |
| CSVコピー | クリップボードにコピー |
| 詳細表示 | モーダルで詳細確認 |
| 削除 | エントリ削除 |

#### マスター管理タブ

##### 物件マスター
| 機能 | 説明 |
|-----|------|
| 一覧表示 | property_codeでグループ化 |
| 検索 | コード・名称で検索 |
| 新規追加 | 物件追加モーダル |
| 編集 | 複数端末対応の編集 |
| 削除 | 使用中チェック付き |

##### 受注先マスター
| 機能 | 説明 |
|-----|------|
| 一覧表示 | 受注先一覧 |
| 検索 | 名称で検索 |
| 新規追加 | 受注先追加モーダル |
| 編集 | 緊急連絡先・カテゴリ編集 |
| 削除 | 削除処理 |

##### 点検種別マスター
| 機能 | 説明 |
|-----|------|
| 一覧表示 | カテゴリバッジ付き |
| 検索 | 名称で検索 |
| 新規追加 | テンプレート画像選択付き |
| 編集 | 案内文・画像編集 |
| 削除 | 使用中チェック付き |

##### カテゴリマスター
| 機能 | 説明 |
|-----|------|
| 一覧表示 | sort_order順 |
| 新規追加 | カテゴリ追加 |
| 編集 | 名称・表示順編集 |
| 削除 | 削除処理 |

##### テンプレート画像マスター
| 機能 | 説明 |
|-----|------|
| グリッド表示 | サムネイル付きカード |
| 検索 | キー・表示名で検索 |
| 新規追加 | 画像アップロード |
| 編集 | 画像差し替え可能 |
| 削除 | Storage連動削除 |

##### 設定
| 設定項目 | ID | デフォルト |
|---------|-----|----------|
| 表示時間上限 | settingDisplayTimeMax | 30秒 |
| 備考1行文字数 | settingRemarksCharsPerLine | 25文字 |
| 備考最大行数 | settingRemarksMaxLines | 5行 |
| 案内文最大文字数 | settingNoticeTextMaxChars | 200文字 |

#### ユーザー管理タブ

| 機能 | 説明 |
|-----|------|
| 一覧表示 | ユーザー一覧 |
| ユーザー追加 | メール/パスワード/会社名/権限 |
| 権限変更 | user/admin切替 |
| 削除 | ユーザー削除（未実装） |

### 5.4 関数一覧（admin.js）

| 関数名 | 説明 |
|-------|------|
| init() | 初期化、認証・権限チェック |
| loadAllData() | 全データ並列読み込み |
| setupEventListeners() | イベントリスナー設定 |
| updateStats() | 統計更新 |
| loadPendingEntries() | 承認待ち読み込み |
| renderPendingEntries() | 承認待ち描画 |
| approveSelected() | 一括承認 |
| approveSingle(id) | 個別承認 |
| rejectSingle(id) | 却下 |
| populateFilters() | フィルター選択肢設定 |
| loadEntries() | エントリ読み込み |
| renderEntries() | エントリ描画 |
| deleteEntryById(id) | エントリ削除 |
| updateEntriesStatus(status) | ステータス一括更新 |
| generateCSV(data) | CSV生成 |
| exportCSV() | CSVダウンロード |
| copyCSV() | CSVコピー |
| loadUsers() | ユーザー読み込み |
| openUserModal() | ユーザー追加モーダル |
| handleUserFormSubmit(e) | ユーザー作成 |
| showToast(msg, type) | トースト通知 |

### 5.5 関数一覧（admin-masters.js）

| 関数名 | 説明 |
|-------|------|
| loadMasterData(masterData) | マスター全描画 |
| renderProperties(masterData, filter) | 物件描画 |
| renderVendors(masterData, filter) | 受注先描画 |
| renderInspections(masterData, filter) | 点検種別描画 |
| renderCategories(masterData, filter) | カテゴリ描画 |
| renderTemplateImages(masterData, filter) | テンプレート画像描画 |
| openMasterModal(type, masterData, data) | マスターモーダル開く |
| closeMasterModal() | マスターモーダル閉じる |
| handleMasterFormSubmit(e, masterData, ...) | マスター保存 |
| addTerminalField(terminal) | 端末フィールド追加 |
| updateTemplatePreview(key) | テンプレートプレビュー |
| deleteMasterPropertyAction(...) | 物件削除 |
| deleteMasterVendorAction(...) | 受注先削除 |
| deleteMasterInspectionAction(...) | 点検種別削除 |
| deleteMasterCategoryAction(...) | カテゴリ削除 |
| deleteMasterTemplateImageAction(...) | テンプレート画像削除 |

---

## 6. データベース設計

### 6.1 テーブル一覧

#### signage_profiles（ユーザープロファイル）
| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | UUID | PK, FK(auth.users) | ユーザーID |
| email | TEXT | NOT NULL | メールアドレス |
| company_name | TEXT | | 会社名 |
| role | TEXT | CHECK(admin/user) | 権限 |
| created_at | TIMESTAMP | DEFAULT NOW() | 作成日時 |
| updated_at | TIMESTAMP | DEFAULT NOW() | 更新日時 |

#### signage_entries（点検データ）
| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | UUID | PK | エントリID |
| user_id | UUID | FK(auth.users) | 作成者ID |
| property_code | TEXT | NOT NULL | 物件コード |
| terminal_id | TEXT | NOT NULL | 端末ID |
| vendor_name | TEXT | NOT NULL | 受注先名 |
| emergency_contact | TEXT | | 緊急連絡先 |
| inspection_type | TEXT | NOT NULL | 点検種別 |
| template_no | TEXT | | テンプレート番号 |
| inspection_start | DATE | | 点検開始日 |
| inspection_end | DATE | | 点検終了日 |
| display_start_date | DATE | | 表示開始日 |
| display_start_time | TEXT | | 表示開始時刻 |
| display_end_date | DATE | | 表示終了日 |
| display_end_time | TEXT | | 表示終了時刻 |
| display_duration | INTEGER | DEFAULT 10 | 表示秒数 |
| announcement | TEXT | | 案内文 |
| remarks | TEXT | | 備考 |
| poster_type | TEXT | CHECK(template/custom) | 貼紙タイプ |
| poster_position | TEXT | DEFAULT '4' | 位置 |
| frame_no | TEXT | DEFAULT '1' | フレーム番号 |
| status | TEXT | CHECK(draft/submitted) | ステータス |
| created_at | TIMESTAMP | DEFAULT NOW() | 作成日時 |
| updated_at | TIMESTAMP | DEFAULT NOW() | 更新日時 |

#### signage_master_properties（物件マスター）
| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | UUID | PK | ID |
| property_code | TEXT | NOT NULL | 物件コード |
| property_name | TEXT | NOT NULL | 物件名 |
| terminals | JSONB | DEFAULT '[]' | 端末配列 |
| created_at | TIMESTAMP | DEFAULT NOW() | 作成日時 |

#### signage_master_vendors（受注先マスター）
| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | UUID | PK | ID |
| vendor_name | TEXT | NOT NULL UNIQUE | 受注先名 |
| emergency_contact | TEXT | | 緊急連絡先 |
| created_at | TIMESTAMP | DEFAULT NOW() | 作成日時 |

#### signage_master_inspection_types（点検種別マスター）
| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | UUID | PK | ID |
| inspection_name | TEXT | NOT NULL UNIQUE | 点検種別名 |
| template_no | TEXT | NOT NULL | テンプレート番号 |
| template_image | TEXT | | テンプレート画像キー |
| default_text | TEXT | | デフォルト案内文 |
| created_at | TIMESTAMP | DEFAULT NOW() | 作成日時 |

#### signage_master_template_images（テンプレート画像マスター）
| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | UUID | PK | ID |
| image_key | TEXT | NOT NULL UNIQUE | 画像キー |
| display_name | TEXT | NOT NULL | 表示名 |
| image_url | TEXT | NOT NULL | Storage URL |
| category | TEXT | | カテゴリ |
| sort_order | INTEGER | DEFAULT 0 | 表示順 |
| created_at | TIMESTAMP | DEFAULT NOW() | 作成日時 |

### 6.2 RLSポリシー

| テーブル | ポリシー | 対象 |
|---------|---------|------|
| signage_profiles | 自分のみ参照・更新 | user |
| signage_profiles | 全員参照可 | admin |
| signage_entries | 自分のみCRUD | user |
| signage_entries | 全員参照・更新・削除可 | admin |
| マスターテーブル | 全員参照可 | all |
| マスターテーブル | 管理者のみCRUD | admin |

---

## 7. API仕様（Supabase）

### 7.1 認証API

| 関数 | 説明 |
|-----|------|
| getUser() | 現在のユーザー取得 |
| signIn(email, password) | ログイン |
| signOut() | ログアウト |
| getProfile() | プロファイル取得 |
| isAdmin() | 管理者判定 |

### 7.2 マスターデータAPI

| 関数 | 説明 |
|-----|------|
| getMasterProperties() | 物件一覧取得 |
| getMasterVendors() | 受注先一覧取得 |
| getMasterInspectionTypes() | 点検種別一覧取得 |
| getMasterCategories() | カテゴリ一覧取得 |
| getMasterTemplateImages() | テンプレート画像一覧取得 |
| getAllMasterData() | 全マスター並列取得 |
| getAllMasterDataCamelCase() | キャメルケース形式で取得 |

### 7.3 エントリAPI

| 関数 | 説明 |
|-----|------|
| getEntries() | 自分のエントリ取得 |
| createEntry(entry) | エントリ作成 |
| createEntries(entries) | 複数エントリ作成 |
| updateEntry(id, entry) | エントリ更新 |
| deleteEntry(id) | エントリ削除 |
| getAllEntries(filters) | 全エントリ取得（管理者） |
| updateEntriesStatusBulk(ids, status) | ステータス一括更新 |

### 7.4 承認API

| 関数 | 説明 |
|-----|------|
| getPendingEntries() | 承認待ち取得 |
| approveEntry(id) | 単一承認 |
| approveEntries(ids) | 複数承認 |
| rejectEntry(id, reason) | 却下 |

### 7.5 マスター管理API

| 関数 | 説明 |
|-----|------|
| addProperty(property) | 物件追加 |
| updateProperty(id, property) | 物件更新 |
| deleteProperty(id) | 物件削除 |
| addVendor(vendor) | 受注先追加 |
| updateVendor(id, vendor) | 受注先更新 |
| deleteVendor(id) | 受注先削除 |
| addInspectionType(type) | 点検種別追加 |
| updateInspectionType(id, type) | 点検種別更新 |
| deleteInspectionType(id) | 点検種別削除 |
| addCategory(category) | カテゴリ追加 |
| updateCategory(id, category) | カテゴリ更新 |
| deleteCategory(id) | カテゴリ削除 |
| addTemplateImage(image) | テンプレート画像追加 |
| updateTemplateImage(id, image) | テンプレート画像更新 |
| deleteTemplateImage(id) | テンプレート画像削除 |

### 7.6 Storage API

| 関数 | 説明 |
|-----|------|
| uploadPosterImage(base64Data) | カスタム画像アップロード |
| deletePosterImage(imageUrl) | カスタム画像削除 |
| uploadTemplateImageFile(file, key) | テンプレート画像アップロード |
| deleteTemplateImageFile(imageUrl) | テンプレート画像削除 |

### 7.7 ユーザー管理API

| 関数 | 説明 |
|-----|------|
| getAllProfiles() | 全プロファイル取得 |
| updateProfileRole(id, role) | 権限更新 |
| createUser(email, password, company, role) | ユーザー作成 |

### 7.8 設定API

| 関数 | 説明 |
|-----|------|
| getSettings() | 全設定取得 |
| getSetting(key) | 設定値取得 |
| updateSetting(key, value) | 設定更新 |
| updateSettings(settings) | 複数設定更新 |

---

## 8. イベント一覧

### 8.1 index.html イベント

| 要素 | イベント | ハンドラ |
|-----|---------|---------|
| property | change | onPropertyChange() |
| vendor | change | onVendorChange() |
| inspectionCategory | change | onCategoryChange() |
| inspectionType | change | onInspectionTypeChange() |
| posterType | change | onPosterTypeChange() |
| customImage | change | onImageSelected(event) |
| noticeText | input | updatePreview() |
| startDate | change | updatePreview() |
| endDate | change | updatePreview() |
| remarks | input | updatePreview() |
| position-cell | click | setPosition(n) |
| adjustTime buttons | click | adjustTime(±1) |
| addEntry | click | addEntry() |
| submitBtn | click | submitEntries() |
| downloadCSV | click | downloadCSV() |
| previewCSV | click | previewCSV() |
| copyCSV | click | copyCSV() |
| clearForm | click | clearForm() |
| logoutBtn | click | signOut() |
| previewModal | click | closeModal(event) |

### 8.2 bulk.html イベント

| 要素 | イベント | ハンドラ |
|-----|---------|---------|
| addRowBtn | click | addRowWithCopy() |
| duplicateBtn | click | duplicateSelectedRows() |
| bulkEditBtn | click | openBulkEditModal() |
| deleteSelectedBtn | click | deleteSelectedRows() |
| pasteBtn | click | openPasteModal() |
| importPasteBtn | click | importFromPaste() |
| saveTemplateBtn | click | openSaveTemplateModal() |
| templateSelect | change | applyTemplate() |
| saveBtn | click | saveAll() |
| downloadCsvBtn | click | downloadCSV() |
| copyCsvBtn | click | copyCSV() |
| selectAll | change | toggleSelectAll() |
| filter buttons | click | setFilter() |
| row checkbox | change | updateSelectedCount() |
| row | dragstart/dragend/drop | ドラッグ&ドロップ |
| row | contextmenu | showContextMenu() |
| document | keydown | handleGlobalKeyDown() |

### 8.3 admin.html イベント

| 要素 | イベント | ハンドラ |
|-----|---------|---------|
| admin-tab | click | タブ切り替え |
| admin-tab[data-master] | click | マスタータブ切り替え |
| selectAllPending | change | toggleSelectAllPending() |
| approveAllBtn | click | approveSelected() |
| searchBtn | click | loadEntries() |
| exportCsvBtn | click | exportCSV() |
| exportCopyBtn | click | copyCSV() |
| markExportedBtn | click | updateEntriesStatus('exported') |
| markSubmittedBtn | click | updateEntriesStatus('submitted') |
| addPropertyBtn | click | openMasterModal('property') |
| addVendorBtn | click | openMasterModal('vendor') |
| addInspectionBtn | click | openMasterModal('inspection') |
| addCategoryBtn | click | openMasterModal('category') |
| addTemplateImageBtn | click | openMasterModal('templateImage') |
| masterForm | submit | handleMasterFormSubmit() |
| addUserBtn | click | openUserModal() |
| userForm | submit | handleUserFormSubmit() |
| saveSettingsBtn | click | saveSettings() |
| 各検索フィールド | input | リアルタイム検索 |

---

## 9. ワークフロー

### 9.1 申請フロー

```
[ユーザー]
    │
    ├─ 1件入力（index.html）
    │   └─ フォーム入力 → データ追加 → 申請
    │
    └─ 一括入力（bulk.html）
        └─ Excel貼り付け → 行編集 → 申請
                                │
                                ▼
                      [Supabase: signage_entries]
                        status = 'draft'
                                │
                                ▼
                          [管理者]
                      admin.html 承認待ちタブ
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
                 [承認]                   [却下]
           status = 'submitted'          [削除]
                    │
                    ▼
              データ一覧タブ
                    │
            ┌───────┴───────┐
            ▼               ▼
      [CSVエクスポート]  [ステータス変更]
                        exported/submitted
```

### 9.2 マスターデータ管理フロー

```
[管理者]
    │
    └─ admin.html マスター管理タブ
        │
        ├─ 物件マスター
        │   └─ 追加/編集/削除（複数端末対応）
        │
        ├─ 受注先マスター
        │   └─ 追加/編集/削除
        │
        ├─ 点検種別マスター
        │   └─ 追加/編集/削除（テンプレート画像連携）
        │
        ├─ カテゴリマスター
        │   └─ 追加/編集/削除
        │
        └─ テンプレート画像マスター
            └─ 追加/編集/削除（Storage連携）
```

### 9.3 CSV出力フォーマット

| 列番号 | カラム名 | 説明 |
|--------|---------|------|
| 1 | property_code | 物件コード |
| 2 | terminal_id | 端末ID |
| 3 | vendor_name | 受注先名 |
| 4 | emergency_contact | 緊急連絡先 |
| 5 | inspection_type | 点検種別 |
| 6 | template_no | テンプレート番号 |
| 7 | inspection_start | 点検開始日 |
| 8 | inspection_end | 点検終了日 |
| 9 | display_start_date | 表示開始日 |
| 10 | display_start_time | 表示開始時刻 |
| 11 | display_end_date | 表示終了日 |
| 12 | display_end_time | 表示終了時刻 |
| 13 | display_duration | 表示秒数 |
| 14 | announcement | 案内文 |
| 15 | remarks | 備考 |
| 16 | poster_type | 貼紙タイプ |
| 17 | poster_position | 位置 |
| 18 | frame_no | フレーム番号 |
| 19-28 | reserved | 予備列 |

---

## 改訂履歴

| バージョン | 日付 | 変更内容 |
|-----------|------|---------|
| v1.10.1 | 2025-12-30 | UX改善（承認待ちエリア、テンプレート画像グリッド） |
| v1.10.0 | 2025-12-29 | テンプレート画像マスタ機能追加 |
| v1.9.2 | 2025-12-29 | 端末データ構造バグ修正 |
| v1.9.1 | 2025-12-29 | テンプレートキーtypo修正 |
| v1.9.0 | 2025-12-28 | カテゴリ機能追加 |
