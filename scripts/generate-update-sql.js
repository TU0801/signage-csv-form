// 点検種別にカテゴリーとテンプレート画像を設定するSQL生成スクリプト
const fs = require('fs');
const path = require('path');

// JSONファイルを読み込み
const jsonPath = path.join(__dirname, 'inspection-types-with-categories.json');
const inspectionTypes = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

console.log('=== カテゴリーとテンプレート画像を更新するSQL ===\n');

// カテゴリーマスターにデータがあるか確認するためのSELECT
console.log('-- カテゴリーマスターを確認');
console.log('SELECT * FROM signage_master_categories ORDER BY sort_order;\n');

// カテゴリーマスターにデータがない場合の INSERT
console.log('-- カテゴリーマスターにデータを挿入（存在しない場合）');
console.log(`INSERT INTO signage_master_categories (category_name, sort_order)
VALUES
  ('点検', 1),
  ('清掃', 2),
  ('工事', 3),
  ('アンケート', 4)
ON CONFLICT (category_name) DO NOTHING;
`);

// signage_master_inspection_typesテーブルにcategoryカラムを追加（存在しない場合）
console.log('-- 点検種別テーブルにcategoryカラムを追加（存在しない場合）');
console.log(`ALTER TABLE signage_master_inspection_types
ADD COLUMN IF NOT EXISTS category TEXT;
`);

// 現在のデータベースにある点検種別の名前でマッチングして更新
// 点検種別名が完全一致するものを更新
const updateStatements = [];

inspectionTypes.forEach(item => {
  const inspectionName = item.inspection_name.replace(/'/g, "''"); // SQL エスケープ
  const category = item.category_name.replace(/'/g, "''");
  const templateNo = item.template_no.replace(/'/g, "''");

  // テンプレート画像がある場合のみ更新
  if (templateNo) {
    updateStatements.push(`
UPDATE signage_master_inspection_types
SET category = '${category}', template_no = '${templateNo}'
WHERE inspection_name = '${inspectionName}';`);
  } else {
    updateStatements.push(`
UPDATE signage_master_inspection_types
SET category = '${category}'
WHERE inspection_name = '${inspectionName}';`);
  }
});

console.log('-- 点検種別にカテゴリーとテンプレート画像を設定');
console.log(updateStatements.join('\n'));

// SQLファイルとして出力
const sqlPath = path.join(__dirname, 'update-inspection-categories.sql');
const sqlContent = `-- カテゴリーマスターにデータを挿入
INSERT INTO signage_master_categories (category_name, sort_order)
VALUES
  ('点検', 1),
  ('清掃', 2),
  ('工事', 3),
  ('アンケート', 4)
ON CONFLICT (category_name) DO NOTHING;

-- 点検種別テーブルにcategoryカラムを追加（存在しない場合）
ALTER TABLE signage_master_inspection_types
ADD COLUMN IF NOT EXISTS category TEXT;

-- 点検種別にカテゴリーとテンプレート画像を設定
${updateStatements.join('\n')}

-- 確認
SELECT inspection_name, category, template_no
FROM signage_master_inspection_types
ORDER BY category, inspection_name
LIMIT 20;
`;

fs.writeFileSync(sqlPath, sqlContent, 'utf-8');
console.log(`\n\nSQLファイルを ${sqlPath} に出力しました`);
console.log('\nSupabase SQL Editorでこのファイルの内容を実行してください。');
