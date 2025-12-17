/**
 * index.htmlからデータを抽出し、分離ファイルを生成するスクリプト
 */
const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf-8');

// スクリプト部分を抽出
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) {
    console.error('Script not found');
    process.exit(1);
}

const scriptContent = scriptMatch[1];

// templateImagesを抽出
const templateMatch = scriptContent.match(/const templateImages = (\{[^;]+\});/);
if (templateMatch) {
    const templateData = templateMatch[1];
    fs.writeFileSync(
        path.join(__dirname, '..', 'data', 'templates.js'),
        `// テンプレート画像データ\nwindow.templateImages = ${templateData};\n`
    );
    console.log('✓ data/templates.js created');
}

// masterDataを抽出
const masterMatch = scriptContent.match(/const masterData = (\{[\s\S]*?\n\s*\});/);
if (masterMatch) {
    const masterData = masterMatch[1];
    fs.writeFileSync(
        path.join(__dirname, '..', 'data', 'master.js'),
        `// マスターデータ\nwindow.masterData = ${masterData};\n`
    );
    console.log('✓ data/master.js created');
}

// 関数部分を抽出（データ定義を除く）
let appContent = scriptContent
    .replace(/const templateImages = \{[^;]+\};/, '// templateImages is loaded from data/templates.js')
    .replace(/const masterData = \{[\s\S]*?\n\s*\};/, '// masterData is loaded from data/master.js')
    .trim();

// グローバル変数をwindowにアタッチ
appContent = appContent
    .replace(/^(\s*)let entries = /m, '$1window.entries = ')
    .replace(/^(\s*)let currentTemplateNo = /m, '$1window.currentTemplateNo = ')
    .replace(/^(\s*)let currentPosition = /m, '$1window.currentPosition = ')
    .replace(/^(\s*)let editingIndex = /m, '$1window.editingIndex = ')
    .replace(/function init\(/g, 'window.init = function(')
    .replace(/function populatePropertySelect\(/g, 'window.populatePropertySelect = function(')
    .replace(/function onPropertyChange\(/g, 'window.onPropertyChange = function(')
    .replace(/function populateVendorSelect\(/g, 'window.populateVendorSelect = function(')
    .replace(/function onVendorChange\(/g, 'window.onVendorChange = function(')
    .replace(/function populateInspectionTypeSelect\(/g, 'window.populateInspectionTypeSelect = function(')
    .replace(/function onInspectionTypeChange\(/g, 'window.onInspectionTypeChange = function(')
    .replace(/function adjustTime\(/g, 'window.adjustTime = function(')
    .replace(/function setPosition\(/g, 'window.setPosition = function(')
    .replace(/function updatePreview\(/g, 'window.updatePreview = function(')
    .replace(/function addEntry\(/g, 'window.addEntry = function(')
    .replace(/function renderDataList\(/g, 'window.renderDataList = function(')
    .replace(/function editEntry\(/g, 'window.editEntry = function(')
    .replace(/function deleteEntry\(/g, 'window.deleteEntry = function(')
    .replace(/function clearForm\(/g, 'window.clearForm = function(')
    .replace(/function generateCSV\(/g, 'window.generateCSV = function(')
    .replace(/function downloadCSV\(/g, 'window.downloadCSV = function(')
    .replace(/function previewCSV\(/g, 'window.previewCSV = function(')
    .replace(/function closeModal\(/g, 'window.closeModal = function(')
    .replace(/function copyCSV\(/g, 'window.copyCSV = function(')
    .replace(/function showToast\(/g, 'window.showToast = function(');

fs.writeFileSync(
    path.join(__dirname, '..', 'js', 'app.js'),
    `// アプリケーションロジック\n${appContent}\n`
);
console.log('✓ js/app.js created');

console.log('\n分離完了！');
