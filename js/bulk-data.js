// bulk-data.js - データ操作関連

import { createEntries } from './supabase-client.js';
import {
    state, getMasterData, getRows, getCurrentUserId,
    getAutoSaveTimer, setAutoSaveTimer, setRowIdCounter, clearRows
} from './bulk-state.js';
import { addRow, validateRow } from './bulk-table.js';

// ========================================
// 自動保存・復元
// ========================================

export function getAutoSaveKey() {
    return `bulk_autosave_${getCurrentUserId()}`;
}

export function triggerAutoSave() {
    const timer = getAutoSaveTimer();
    if (timer) clearTimeout(timer);
    setAutoSaveTimer(setTimeout(saveAutoSave, 1000));
}

export function saveAutoSave() {
    const rows = getRows();
    if (rows.length === 0) {
        localStorage.removeItem(getAutoSaveKey());
        return;
    }

    const data = {
        timestamp: Date.now(),
        rowIdCounter: state.rowIdCounter,
        rows: rows.map(r => ({
            propertyCode: r.propertyCode,
            terminalId: r.terminalId,
            vendorName: r.vendorName,
            inspectionType: r.inspectionType,
            startDate: r.startDate,
            endDate: r.endDate,
            remarks: r.remarks,
            displayTime: r.displayTime,
            noticeText: r.noticeText,
            displayStartDate: r.displayStartDate,
            displayStartTime: r.displayStartTime,
            displayEndDate: r.displayEndDate,
            displayEndTime: r.displayEndTime,
            showOnBoard: r.showOnBoard,
            position: r.position
        }))
    };

    localStorage.setItem(getAutoSaveKey(), JSON.stringify(data));
    console.log('Auto-saved', rows.length, 'rows');
}

export function restoreAutoSave(callbacks) {
    try {
        const data = localStorage.getItem(getAutoSaveKey());
        if (!data) return;

        const saved = JSON.parse(data);
        if (!saved.rows || saved.rows.length === 0) return;

        if (Date.now() - saved.timestamp > 24 * 60 * 60 * 1000) {
            localStorage.removeItem(getAutoSaveKey());
            return;
        }

        if (confirm(`${saved.rows.length}件の未保存データがあります。復元しますか？`)) {
            setRowIdCounter(saved.rowIdCounter || 0);
            saved.rows.forEach(rowData => {
                addRow(rowData, callbacks);
            });
            callbacks.showToast(`${saved.rows.length}件のデータを復元しました`, 'success');
        } else {
            localStorage.removeItem(getAutoSaveKey());
        }
    } catch (e) {
        console.error('Auto-save restore failed:', e);
    }
}

// ========================================
// サーバー保存
// ========================================

export async function saveAll(callbacks) {
    const rows = getRows();
    const validRows = rows.filter(r => r.isValid);
    if (validRows.length === 0) {
        callbacks.showToast('保存できる有効なデータがありません', 'error');
        return;
    }

    const saveBtn = document.getElementById('saveBtn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="btn-icon">⏳</span> 保存中...';

    try {
        const masterData = getMasterData();
        const entries = validRows.map(row => {
            // 型を揃えて比較
            const property = masterData.properties.find(p => String(p.property_code) === String(row.propertyCode));
            const vendor = masterData.vendors.find(v => v.vendor_name === row.vendorName);
            const inspection = masterData.inspectionTypes.find(i => i.inspection_name === row.inspectionType);

            const displayStartDate = row.displayStartDate || row.startDate || null;
            const displayEndDate = row.displayEndDate || row.endDate || null;

            // terminal_idを正規化（JSON文字列やオブジェクトから端末ID文字列を抽出）
            const normalizeTerminalId = (terminalId) => {
                if (!terminalId) return '';
                if (typeof terminalId === 'string') {
                    // JSON文字列の場合はパースして抽出
                    if (terminalId.startsWith('{')) {
                        try {
                            const parsed = JSON.parse(terminalId);
                            return parsed.terminalId || parsed.terminal_id || parsed.id || terminalId;
                        } catch (e) {
                            return terminalId;
                        }
                    }
                    return terminalId;
                }
                if (typeof terminalId === 'object') {
                    return terminalId.terminalId || terminalId.terminal_id || terminalId.id || '';
                }
                return String(terminalId);
            };

            return {
                property_code: String(row.propertyCode),
                terminal_id: normalizeTerminalId(row.terminalId) || property?.terminal_id || '',
                vendor_name: row.vendorName,
                emergency_contact: vendor?.emergency_contact || '',
                inspection_type: row.inspectionType,
                template_no: inspection?.template_no || '',
                inspection_start: row.startDate || null,
                inspection_end: row.endDate || null,
                remarks: row.remarks || '',
                announcement: row.noticeText || inspection?.default_text || '',
                display_start_date: displayStartDate,
                display_start_time: row.displayStartTime || null,
                display_end_date: displayEndDate,
                display_end_time: row.displayEndTime || null,
                display_duration: row.displayTime || 6,
                poster_type: row.showOnBoard !== false ? 'template' : 'custom',
                poster_position: row.position !== undefined ? String(row.position) : '2',
                status: 'draft'
            };
        });

        console.log('Sending entries:', entries);
        await createEntries(entries);

        localStorage.removeItem(getAutoSaveKey());
        callbacks.showToast(`${validRows.length}件のデータを申請しました`, 'success');

        document.getElementById('tableBody').innerHTML = '';
        clearRows();
        callbacks.updateStats();
        callbacks.updateEmptyState();

    } catch (error) {
        console.error('Save failed:', error);
        // より詳細なエラーメッセージを表示
        let errorMsg = '申請に失敗しました';
        if (error.message) {
            errorMsg += ': ' + error.message;
        }
        if (error.details) {
            errorMsg += ' (' + error.details + ')';
        }
        if (error.hint) {
            console.log('Hint:', error.hint);
        }
        callbacks.showToast(errorMsg, 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<span class="btn-icon">↑</span> 申請する';
        callbacks.updateButtons();
    }
}

// ========================================
// CSV機能
// ========================================

export function generateCSV() {
    const rows = getRows();
    const masterData = getMasterData();
    const validRows = rows.filter(r => r.isValid);
    if (validRows.length === 0) return '';

    // サンプルCSVに合わせた列順（1件入力と同じ）
    const headers = [
        '点検CO', '端末ID', '物件コード', '受注先名', '緊急連絡先番号',
        '点検工事案内', '掲示板に表示する', '点検案内TPLNo', '点検開始日',
        '点検完了日', '掲示備考', '掲示板用案内文', 'frame_No', '表示開始日',
        '表示終了日', '表示開始時刻', '表示終了時刻', '表示時間', '統合ポリシー',
        '制御', '変更日', '変更時刻', '最終エクスポート日時', 'ID', '変更日時',
        '点検日時', '表示日時', '貼紙区分'
    ];

    // 現在日時（1件入力と同じ形式）
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0].replace(/-/g, '/');
    const timeStr = now.toTimeString().substring(0, 8);

    const csvRows = [headers.join(',')];

    validRows.forEach(row => {
        // 型を揃えて比較
        const property = masterData.properties.find(p => String(p.property_code) === String(row.propertyCode));
        const vendor = masterData.vendors.find(v => v.vendor_name === row.vendorName);
        const inspection = masterData.inspectionTypes.find(i => i.inspection_name === row.inspectionType);

        const formatDate = (d) => d ? d.replace(/-/g, '/') : '';
        const displayTimeFormatted = `0:00:${String(row.displayTime || 6).padStart(2, '0')}`;

        const sd = formatDate(row.startDate);
        const ed = formatDate(row.endDate) || sd;
        const displayStartDate = row.displayStartDate || row.startDate;
        const displayEndDate = row.displayEndDate || row.endDate;
        const dsd = formatDate(displayStartDate);
        const ded = formatDate(displayEndDate) || ed;
        const displayStartTime = row.displayStartTime || '';
        const displayEndTime = row.displayEndTime || '';

        // 改行を\r\nに変換（1件入力と同じ）
        const remarksText = (row.remarks || '').replace(/\n/g, '\r\n');
        const noticeText = (row.noticeText || inspection?.notice_text || '').replace(/\n/g, '\r\n');

        // TRUE/False（Excelマクロと同じ）
        const showOnBoard = row.showOnBoard !== false ? 'TRUE' : 'False';

        const positionValue = row.position !== undefined ? String(row.position) : '1';

        const values = [
            '',                                          // 点検CO
            row.terminalId || property?.terminal_id || '', // 端末ID
            row.propertyCode,                            // 物件コード
            row.vendorName,                              // 受注先名
            vendor?.emergency_contact || '',             // 緊急連絡先番号
            row.inspectionType,                          // 点検工事案内
            showOnBoard,                                 // 掲示板に表示する
            inspection?.template_no || '',               // 点検案内TPLNo
            sd,                                          // 点検開始日
            ed,                                          // 点検完了日
            remarksText,                                 // 掲示備考
            noticeText,                                  // 掲示板用案内文
            positionValue,                               // frame_No
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
            'テンプレート'                                // 貼紙区分
        ];

        csvRows.push(values.map(v => {
            if (v == null) return '';
            const s = String(v);
            return (s.includes(',') || s.includes('"') || s.includes('\n')) ? '"' + s.replace(/"/g, '""') + '"' : s;
        }).join(','));
    });

    return csvRows.join('\n');
}

export function downloadCSV(callbacks) {
    const csv = generateCSV();
    if (!csv) {
        callbacks.showToast('ダウンロードするデータがありません', 'error');
        return;
    }

    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);

    a.href = url;
    a.download = `bulk-${timestamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    callbacks.showToast('CSVをダウンロードしました', 'success');
}

export function copyCSV(callbacks) {
    const csv = generateCSV();
    if (!csv) {
        callbacks.showToast('コピーするデータがありません', 'error');
        return;
    }

    navigator.clipboard.writeText(csv).then(() => {
        callbacks.showToast('CSVをクリップボードにコピーしました', 'success');
    }).catch(() => {
        callbacks.showToast('コピーに失敗しました', 'error');
    });
}

// ========================================
// ユーティリティ
// ========================================

export function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    // エラーの場合は長めに表示
    const duration = type === 'error' ? 5000 : 2500;
    setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
}

// ========================================
// UI更新
// ========================================

export function updateStats() {
    const rows = getRows();
    const total = rows.length;
    const valid = rows.filter(r => r.isValid).length;
    const error = total - valid;

    document.getElementById('totalCount').textContent = total;
    document.getElementById('validCount').textContent = valid;
    document.getElementById('errorCount').textContent = error;
}

export function updateEmptyState() {
    const rows = getRows();
    const emptyState = document.getElementById('emptyState');
    const table = document.getElementById('bulkTable');

    if (rows.length === 0) {
        emptyState.style.display = 'flex';
        table.style.display = 'none';
    } else {
        emptyState.style.display = 'none';
        table.style.display = 'table';
    }
}

export function updateButtons() {
    const rows = getRows();
    const validCount = rows.filter(r => r.isValid).length;

    const saveBtn = document.getElementById('saveBtn');
    const downloadBtn = document.getElementById('downloadCsvBtn');
    const copyBtn = document.getElementById('copyCsvBtn');

    if (saveBtn) saveBtn.disabled = validCount === 0;
    if (downloadBtn) downloadBtn.disabled = validCount === 0;
    if (copyBtn) copyBtn.disabled = validCount === 0;
}

export function applyFilter() {
    const rows = getRows();
    const currentFilter = state.currentFilter;
    const tbody = document.getElementById('tableBody');
    const trs = tbody.querySelectorAll('tr');

    trs.forEach(tr => {
        const rowId = parseInt(tr.dataset.rowId);
        const row = rows.find(r => r.id === rowId);
        if (!row) return;

        let visible = true;
        if (currentFilter === 'valid' && !row.isValid) {
            visible = false;
        } else if (currentFilter === 'error' && row.isValid) {
            visible = false;
        }

        tr.style.display = visible ? '' : 'none';
    });

    const visibleCount = Array.from(trs).filter(tr => tr.style.display !== 'none').length;
    const filterInfo = document.getElementById('filterInfo');
    if (filterInfo) {
        if (currentFilter === 'all') {
            filterInfo.textContent = '';
        } else {
            filterInfo.textContent = `(${visibleCount}件表示中)`;
        }
    }
}
