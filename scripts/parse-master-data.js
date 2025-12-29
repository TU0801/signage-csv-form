// ExcelマスターCSVから点検種別データを解析するスクリプト
const fs = require('fs');
const path = require('path');

// カテゴリーマッピング（受注カテゴリーIDからカテゴリー名へ）
// Excelデータを分析して推測したマッピング
const categoryMapping = {
  // 点検系
  4: '点検', 8: '点検', 9: '点検', 10: '点検', 11: '点検', 12: '点検',
  13: '点検', 14: '点検', 15: '点検', 16: '点検', 17: '点検',
  38: '点検', 51: '点検', 70: '点検', 89: '点検', 94: '点検', 97: '点検',
  98: '点検', 99: '点検', 100: '点検', 102: '点検', 103: '点検', 104: '点検',
  105: '点検', 106: '点検', 107: '点検', 108: '点検', 109: '点検', 110: '点検',
  111: '点検', 115: '点検', 116: '点検', 144: '点検', 145: '点検',

  // 清掃系
  19: '清掃', 20: '清掃', 22: '清掃', 23: '清掃', 39: '清掃',
  48: '清掃', 72: '清掃', 114: '清掃',

  // 工事系
  40: '工事', 43: '工事', 44: '工事', 58: '工事', 67: '工事', 74: '工事',
  78: '工事', 120: '工事', 123: '工事', 133: '工事', 135: '工事', 136: '工事',
  137: '工事', 138: '工事', 139: '工事', 140: '工事', 141: '工事', 143: '工事',
  146: '工事', 147: '工事', 148: '工事', 149: '工事', 150: '工事', 151: '工事',
  153: '工事', 154: '工事',

  // アンケート系
  73: 'アンケート', 92: 'アンケート'
};

// CSVファイルを読み込んで解析
function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const headers = lines[0].replace(/^\uFEFF/, '').split(','); // BOM削除

  const records = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;

    // CSVパース（簡易版 - 改行や引用符を含むフィールドに対応）
    const values = [];
    let currentValue = '';
    let inQuotes = false;

    for (let j = 0; j < lines[i].length; j++) {
      const char = lines[i][j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(currentValue);
        currentValue = '';
      } else {
        currentValue += char;
      }
    }
    values.push(currentValue);

    if (values.length >= headers.length) {
      const record = {};
      headers.forEach((header, index) => {
        record[header.trim()] = values[index] ? values[index].trim() : '';
      });
      records.push(record);
    }
  }

  return records;
}

// メイン処理
const csvPath = path.join(__dirname, '../既存_CSV作成用/MasterData_CSV/掲示板案内文.csv');
const records = parseCSV(csvPath);

console.log(`全${records.length}件の点検種別を解析中...`);

// 点検種別ごとのデータを整形
const inspectionTypes = records.map(record => {
  const categoryId = parseInt(record['受注カテゴリーID']);
  const categoryName = categoryMapping[categoryId] || '工事'; // デフォルトは工事
  const templateNo = record['案内TPLNo'] || '';

  return {
    inspection_id: record['点検掲示種類ID'],
    inspection_name: record['点検工事案内'],
    category_id: categoryId,
    category_name: categoryName,
    template_no: templateNo,
    notice_text: record['掲示板用案内文'].replace(/_x000D_/g, '\n'),
    show_on_board: record['掲示板に表示する'] === 'True'
  };
});

// カテゴリー別に集計
const categoryStats = {};
inspectionTypes.forEach(item => {
  if (!categoryStats[item.category_name]) {
    categoryStats[item.category_name] = 0;
  }
  categoryStats[item.category_name]++;
});

console.log('\nカテゴリー別集計:');
Object.entries(categoryStats).forEach(([cat, count]) => {
  console.log(`  ${cat}: ${count}件`);
});

// テンプレート画像の使用状況
const templateStats = {};
inspectionTypes.forEach(item => {
  if (item.template_no) {
    if (!templateStats[item.template_no]) {
      templateStats[item.template_no] = 0;
    }
    templateStats[item.template_no]++;
  }
});

console.log('\nテンプレート画像の使用状況:');
const sortedTemplates = Object.entries(templateStats).sort((a, b) => b[1] - a[1]);
sortedTemplates.slice(0, 20).forEach(([template, count]) => {
  console.log(`  ${template}: ${count}件`);
});

// SQL生成（サンプル）
console.log('\n=== カテゴリー付き点検種別のサンプル ===');
inspectionTypes.slice(0, 10).forEach(item => {
  console.log(`${item.inspection_name} [${item.category_name}] - ${item.template_no || '(画像なし)'}`);
});

// JSONファイルとして出力
const outputPath = path.join(__dirname, 'inspection-types-with-categories.json');
fs.writeFileSync(outputPath, JSON.stringify(inspectionTypes, null, 2), 'utf-8');
console.log(`\n結果を ${outputPath} に出力しました`);
