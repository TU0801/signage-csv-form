// admin-export.js - CSV/Excelエクスポート機能

import { showToast } from './ui-utils.js';
import { getAppSettings } from './admin-settings.js';
import { normalizeTerminalId, CSV_HEADERS, escapeCSVField } from './shared-utils.js';

/**
 * CSV文字列を生成
 * @param {Array} data - エントリ配列
 * @returns {string} CSV文字列
 */
export function generateCSV(data) {
    if (data.length === 0) return '';

    const headers = CSV_HEADERS;

    // 現在日時
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0].replace(/-/g, '/');
    const timeStr = now.toTimeString().substring(0, 8);

    const csvRows = [headers.join(',')];

    const formatDate = (d) => d ? d.replace(/-/g, '/') : '';
    const defaultTime = getAppSettings().display_time_default || 6;

    data.forEach(entry => {
        const displayTime = entry.display_duration || defaultTime;
        const displayTimeFormatted = `0:00:${String(displayTime).padStart(2, '0')}`;

        const sd = formatDate(entry.inspection_start);
        const ed = formatDate(entry.inspection_end) || sd;
        const dsd = formatDate(entry.display_start_date || entry.inspection_start);
        const ded = formatDate(entry.display_end_date || entry.inspection_end) || ed;
        const displayStartTime = entry.display_start_time || '';
        const displayEndTime = entry.display_end_time || '';

        // 改行を\r\nに変換
        const remarksText = (entry.remarks || '').replace(/\n/g, '\r\n');
        const noticeText = (entry.announcement || '').replace(/\n/g, '\r\n');

        // TRUE/False（poster_type が template の場合は TRUE）
        const showOnBoard = entry.poster_type === 'template' ? 'TRUE' : 'False';

        // 貼紙区分
        const posterTypeText = entry.poster_type === 'template' ? 'テンプレート' : '追加';

        // frame_No (poster_position)
        const frameNo = entry.poster_position || '2';

        const values = [
            entry.inspection_co || '',                   // 点検CO (#11: 自動採番)
            normalizeTerminalId(entry.terminal_id),      // 端末ID
            entry.property_code || '',                   // 物件コード
            entry.vendor_name || '',                     // 保守会社名
            entry.emergency_contact || '',               // 緊急連絡先番号
            entry.inspection_type || '',                 // 点検工事案内
            showOnBoard,                                 // 掲示板に表示する
            entry.template_no || '',                     // 点検案内TPLNo
            sd,                                          // 点検開始日
            ed,                                          // 点検完了日
            remarksText,                                 // 掲示備考
            noticeText,                                  // 掲示板用案内文
            frameNo,                                     // frame_No
            dsd,                                         // 表示開始日
            ded,                                         // 表示終了日
            displayStartTime,                            // 表示開始時刻
            displayEndTime,                              // 表示終了時刻
            displayTimeFormatted,                        // 表示時間
            '',                                          // 統合ポリシー
            '',                                          // 制御
            dateStr,                                     // 変更日
            '',                                          // 変更時刻
            '',                                          // 最終エクスポート日時
            '',                                          // ID
            `${dateStr} [${timeStr}]`,                   // 変更日時
            `${sd} [00:00:00]`,                          // 点検日時
            `${dsd} [00:00:00]`,                         // 表示日時
            posterTypeText                               // 貼紙区分
        ];

        csvRows.push(values.map(escapeCSVField).join(','));
    });

    return csvRows.join('\n');
}

/**
 * フィルターに基づくエクスポート対象エントリを取得
 * @param {Array} entries - 全エントリ配列
 * @returns {Array} フィルター済みエントリ
 */
export function getFilteredExportEntries(entries) {
    const exportProperty = document.getElementById('filterProperty')?.value || '';
    const exportStartDate = document.getElementById('filterStartDate')?.value || '';
    const exportEndDate = document.getElementById('filterEndDate')?.value || '';

    return entries.filter(entry => {
        if (exportProperty && String(entry.property_code) !== exportProperty) return false;
        if (exportStartDate && entry.inspection_start < exportStartDate) return false;
        if (exportEndDate && entry.inspection_start > exportEndDate) return false;
        return true;
    });
}

/**
 * 点検レポートをExcel出力
 * @param {Array} entries - 全エントリ配列
 * @param {Object} masterData - マスターデータ
 * @param {Function} getSelectedEntryIds - 選択中エントリIDを取得する関数
 */
export function exportInspectionReport(entries, masterData, getSelectedEntryIds) {
    const selectedIds = getSelectedEntryIds();
    if (selectedIds.length === 0) {
        showToast('レポート対象を選択してください', 'error');
        return;
    }

    const selectedEntries = entries.filter(e => selectedIds.includes(e.id));

    // ヘッダー行
    const headers = ['物件コード', '物件名', '点検種別', '点検開始日', '点検終了日', '作業時間及び備考', '保守会社', '登録日時'];

    // データ行
    const data = selectedEntries.map(entry => {
        const prop = masterData.properties.find(p => p.property_code === entry.property_code);
        return [
            entry.property_code || '',
            prop?.property_name || '',
            entry.inspection_type || '',
            entry.inspection_start ? new Date(entry.inspection_start).toLocaleDateString('ja-JP') : '',
            entry.inspection_end ? new Date(entry.inspection_end).toLocaleDateString('ja-JP') : '',
            entry.remarks || '',
            entry.vendor_name || '',
            entry.created_at ? new Date(entry.created_at).toLocaleString('ja-JP') : ''
        ];
    });

    // タイトル行と印刷日時
    const now = new Date().toLocaleString('ja-JP');
    const titleRows = [
        ['点検レポート'],
        [`出力日時: ${now}`],
        [`対象件数: ${selectedEntries.length}件`],
        []  // 空行
    ];

    // シートデータ作成
    const sheetData = [...titleRows, headers, ...data];
    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    // 列幅設定
    ws['!cols'] = [
        { wch: 12 }, // 物件コード
        { wch: 20 }, // 物件名
        { wch: 15 }, // 点検種別
        { wch: 12 }, // 開始日
        { wch: 12 }, // 終了日
        { wch: 30 }, // 備考
        { wch: 15 }, // 保守会社
        { wch: 18 }  // 登録日時
    ];

    // ワークブック作成とダウンロード
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '点検レポート');

    const timestamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
    XLSX.writeFile(wb, `inspection-report-${timestamp}.xlsx`);

    showToast('点検レポートをダウンロードしました', 'success');
}

/**
 * CSVエクスポート（ダウンロード）
 * @param {Array} entries - 全エントリ配列
 */
export function exportCSV(entries) {
    const filteredEntries = getFilteredExportEntries(entries);
    const csv = generateCSV(filteredEntries);
    if (!csv) {
        showToast('エクスポートするデータがありません', 'error');
        return;
    }

    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);

    a.href = url;
    a.download = `admin-export-${timestamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    showToast('CSVをダウンロードしました', 'success');
}

/**
 * CSVをクリップボードにコピー
 * @param {Array} entries - 全エントリ配列
 */
export function copyCSV(entries) {
    const filteredEntries = getFilteredExportEntries(entries);
    const csv = generateCSV(filteredEntries);
    if (!csv) {
        showToast('コピーするデータがありません', 'error');
        return;
    }

    navigator.clipboard.writeText(csv).then(() => {
        showToast('CSVをクリップボードにコピーしました', 'success');
    }).catch(() => {
        showToast('コピーに失敗しました', 'error');
    });
}

/**
 * カスタム画像を一括ダウンロード（ZIP）
 * @param {Array} entries - 全エントリ配列
 */
export async function downloadCustomImages(entries) {
    // カスタム画像を持つエントリをフィルタ
    const customImageEntries = entries.filter(e =>
        e.poster_type === 'custom' && e.poster_image
    );

    if (customImageEntries.length === 0) {
        showToast('ダウンロード対象の追加画像がありません', 'info');
        return;
    }

    showToast(`${customImageEntries.length}件の画像をダウンロード中...`, 'info');

    try {
        // JSZipインスタンス作成
        const zip = new JSZip();

        // 各画像をfetchしてZIPに追加
        for (const entry of customImageEntries) {
            try {
                const response = await fetch(entry.poster_image);
                const blob = await response.blob();
                // ファイル名: 物件コード_点検種別_ID先頭8文字.jpg
                const safePropertyCode = (entry.property_code || 'unknown').replace(/[/\\:*?"<>|]/g, '_');
                const safeInspectionType = (entry.inspection_type || 'unknown').replace(/[/\\:*?"<>|]/g, '_');
                const filename = `${safePropertyCode}_${safeInspectionType}_${entry.id.slice(0, 8)}.jpg`;
                zip.file(filename, blob);
            } catch (err) {
                console.error(`Failed to fetch image for entry ${entry.id}:`, err);
            }
        }

        // ZIP生成・ダウンロード
        const content = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = `custom_images_${new Date().toISOString().slice(0, 10)}.zip`;
        a.click();
        URL.revokeObjectURL(url);

        showToast(`${customImageEntries.length}件の画像をダウンロードしました`, 'success');
    } catch (error) {
        console.error('Failed to download images:', error);
        showToast('画像のダウンロードに失敗しました', 'error');
    }
}
