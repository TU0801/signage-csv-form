# 一括入力モジュールスキル

## 概要
bulk.html関連のES Modulesの構成と修正方法。

## モジュール構成

### bulk.js（メインエントリ）
- init()で初期化
- setupEventListeners()でイベント設定
- handleGlobalKeyDown()でキーボードショートカット
- callbacksオブジェクトで他モジュールと連携

### bulk-state.js（状態管理）
主要なexport:
- `state` - 共有状態オブジェクト
- `getRows()`, `addRowToState()`, `removeRowFromState()`
- `getMasterData()`, `setMasterData()`
- `getCurrentFilter()`, `setCurrentFilter()`

### bulk-table.js（テーブル操作）
主要なexport:
- `addRowWithCopy()` - 行追加（前の行からコピー）
- `duplicateSelectedRows()` - 選択行を複製
- `deleteSelectedRows()` - 選択行を削除
- `renderRow()` - 行のDOM生成
- `validateRow()` - バリデーション

### bulk-modals.js（モーダル）
主要なexport:
- Context menu: `createContextMenu()`, `showContextMenu()`, `hideContextMenu()`
- Bulk edit: `createBulkEditModal()`, `openBulkEditModal()`, `closeBulkEditModal()`
- Row detail: `openRowDetailModal()`, `closeRowDetailModal()`
- Paste: `openPasteModal()`, `closePasteModal()`, `importFromPaste()`
- Template: `saveTemplate()`, `loadTemplates()`, `applyTemplate()`

### bulk-data.js（データ操作）
主要なexport:
- `triggerAutoSave()`, `restoreAutoSave()` - 自動保存
- `generateCSV()`, `downloadCSV()`, `copyCSV()` - CSV出力
- `showToast()` - 通知表示
- `updateStats()`, `updateEmptyState()` - UI更新

## callbacks パターン
モジュール間の循環参照を避けるため、callbacksオブジェクトを使用：
```javascript
const callbacks = {
    showToast,
    triggerAutoSave,
    updateStats,
    // ...
};
addRowWithCopy(callbacks);
```

## 修正時の注意
1. 新しい関数を追加したらexportを忘れずに
2. bulk.jsのimportも更新
3. callbacksに追加が必要か確認
4. Escapeキーで閉じる処理はhandleGlobalKeyDownに追加
