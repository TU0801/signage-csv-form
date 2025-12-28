---
name: bulk-module
description: bulk.html関連のES Modulesの構成と修正方法。一括入力画面の変更時に参照。
allowed-tools: Read, Edit, Grep, Glob
---

# 一括入力モジュールスキル

## モジュール構成

### bulk.js（メインエントリ）
- init()で初期化
- setupEventListeners()でイベント設定
- callbacksオブジェクトで他モジュールと連携

### bulk-state.js（状態管理）
- `state`, `getRows()`, `addRowToState()`, `removeRowFromState()`
- `getMasterData()`, `setMasterData()`

### bulk-table.js（テーブル操作）
- `addRowWithCopy()`, `duplicateSelectedRows()`, `deleteSelectedRows()`
- `renderRow()`, `validateRow()`

### bulk-modals.js（モーダル）
- Context menu, Bulk edit, Row detail, Paste, Template

### bulk-data.js（データ操作）
- 自動保存、CSV出力、Toast表示、UI更新

## callbacksパターン
```javascript
const callbacks = { showToast, triggerAutoSave, updateStats };
addRowWithCopy(callbacks);
```

## 修正時の注意
1. 新関数追加時はexportを忘れずに
2. bulk.jsのimportも更新
3. callbacksへの追加が必要か確認
