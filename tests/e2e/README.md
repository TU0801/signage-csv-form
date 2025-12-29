# E2Eテスト: 物件端末選択機能

## 概要

このディレクトリには、物件マスターの端末選択機能に関する包括的なE2Eテストが含まれています。

## テストファイル構成

### user-flows/property-terminal-selection.spec.js
**目的**: 1件入力画面と一括入力画面での端末選択機能のユーザーフローをテスト

**テストケース**:
1. **複数端末を持つ物件の選択**
   - 物件選択時に全端末が表示される
   - 各端末に補足情報（棟名など）が正しく表示される
   - 最初の端末が自動選択される

2. **単一端末を持つ物件の選択**
   - 物件選択時に1つの端末のみ表示される
   - 端末が自動選択される

3. **物件変更時の端末リスト更新**
   - 複数端末→単一端末、単一端末→複数端末の切り替えが正しく動作する
   - 端末リストが適切にクリアされ、新しい端末が表示される

4. **エッジケース**
   - 物件未選択時は端末セレクトボックスが空
   - 複数行の独立した端末選択（一括入力画面）

5. **完全なデータ入力フロー**
   - 物件・端末選択からCSV作成までの一連の流れ
   - データリストへの追加と表示確認

### permissions/admin-property-master.spec.js
**目的**: 物件マスター管理機能の権限制御と編集機能をテスト

**テストケース**:
1. **権限制御**
   - 一般ユーザーには管理リンクが表示されない
   - 管理者には管理リンクが表示される

2. **物件マスター一覧表示**
   - 複数端末を持つ物件が一覧に正しく表示される
   - 端末情報が適切に表示される

3. **物件マスター編集モーダル**
   - 編集モーダルに物件の全端末が表示される
   - 複数端末と単一端末の両方で正しく動作する

4. **CRUD操作**
   - 新規物件の追加（複数端末付き）
   - 既存物件の編集
   - 物件の削除（確認ダイアログ付き）
   - エラーケース: 使用中の物件は削除できない

5. **データ整合性検証**
   - getAllMasterData() の出力形式が正しい
   - property_code でグループ化され、terminals配列を持つ

## データ構造

### getAllMasterData() の出力形式（一括入力画面用）
```javascript
{
  properties: [
    {
      property_code: '2010',
      property_name: 'エンクレストガーデン福岡',
      address: '福岡県福岡市中央区小笹４－５',
      terminals: [
        { terminal_id: 'h0001A00', supplement: 'センター棟' },
        { terminal_id: 'h0001A01', supplement: 'A棟' },
        { terminal_id: 'h0001A02', supplement: 'B棟' },
        { terminal_id: 'h0001A03', supplement: 'C棟' }
      ]
    },
    ...
  ],
  vendors: [...],
  inspectionTypes: [...],
  categories: [...]
}
```

### getAllMasterDataCamelCase() の出力形式（1件入力画面用）
```javascript
{
  properties: [
    {
      propertyCode: 2010,
      propertyName: 'エンクレストガーデン福岡',
      terminalId: 'h0001A00',
      supplement: 'センター棟',
      address: '福岡県福岡市中央区小笹４－５'
    },
    {
      propertyCode: 2010,
      propertyName: 'エンクレストガーデン福岡',
      terminalId: 'h0001A01',
      supplement: 'A棟',
      address: '福岡県福岡市中央区小笹４－５'
    },
    ...
  ],
  vendors: [...],
  notices: [...],
  categories: [...]
}
```

## テスト実行

### 全E2Eテストを実行
```bash
npx playwright test tests/e2e/
```

### 特定のテストスイートのみ実行
```bash
# 物件端末選択のユーザーフロー
npx playwright test tests/e2e/user-flows/property-terminal-selection.spec.js

# 管理画面の権限・編集機能
npx playwright test tests/e2e/permissions/admin-property-master.spec.js
```

### ヘッドレスモードを無効にして実行（デバッグ用）
```bash
npx playwright test tests/e2e/user-flows/property-terminal-selection.spec.js --headed
```

### 特定のテストケースのみ実行
```bash
npx playwright test tests/e2e/user-flows/property-terminal-selection.spec.js -g "複数端末"
```

## モックデータ

テストでは `test-helpers.js` の `setupAuthMockWithMasterData()` を使用して、以下のモックデータを提供します:

- **物件**: 3件（複数端末×1、単一端末×2）
- **業者**: 4件
- **点検種別**: 6件
- **カテゴリ**: 4件

## カバレッジ

このテストスイートは以下をカバーします:

- ✅ Happy Path: 通常の操作フロー
- ✅ エッジケース: 未選択、空データ、境界値
- ✅ エラーケース: 使用中データの削除、不正な入力
- ✅ 権限制御: 管理者/一般ユーザーの動作差異
- ✅ データ整合性: データベース構造とフロントエンドの整合性
- ✅ 非同期処理: DOM更新の待機、API応答の待機

## 今後の拡張

以下のテストケースを追加することを推奨します:

1. **パフォーマンステスト**
   - 大量データ（物件100件、端末1000個）での動作確認

2. **アクセシビリティテスト**
   - キーボードナビゲーション
   - スクリーンリーダー対応

3. **クロスブラウザテスト**
   - Firefox、Safari、Edge での動作確認

4. **モバイルテスト**
   - レスポンシブデザインの確認
   - タッチ操作の確認

## トラブルシューティング

### テストが失敗する場合

1. **http-serverが起動しているか確認**
   ```bash
   npx http-server -p 8080
   ```

2. **playwright.config.js の設定確認**
   - baseURL が http://localhost:8080 になっているか
   - webServer の設定が正しいか

3. **モックデータの構造確認**
   - `test-helpers.js` の mockProperties が新しい構造（terminals配列）になっているか

4. **ブラウザの更新**
   ```bash
   npx playwright install
   ```

## 関連ファイル

- `tests/test-helpers.js`: テスト用ヘルパー関数とモックデータ
- `tests/test-data.js`: テストデータの定義
- `playwright.config.js`: Playwright設定ファイル
- `js/supabase-client.js`: マスターデータ取得関数の実装
- `js/script.js`: 1件入力画面のロジック
- `js/bulk-table.js`: 一括入力画面の端末選択ロジック
