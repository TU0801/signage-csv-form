// bulk.js - 一括入力画面のJavaScript

import {
    getUser,
    getProfile,
    signOut,
    getAllMasterData,
    createEntries,
    getEntries
} from './supabase-client.js';

// ========================================
// グローバル変数
// ========================================

let masterData = { properties: [], vendors: [], inspectionTypes: [] };
let rows = [];
let rowIdCounter = 0;
let isOnlineMode = false;

// ========================================
// 初期化
// ========================================

async function init() {
    // 認証チェック（オプション - 失敗してもローカルモードで続行）
    try {
        const user = await getUser();
        if (user) {
            isOnlineMode = true;
            // ユーザー情報表示
            const profile = await getProfile();
            document.getElementById('userEmail').textContent = profile?.email || user.email;

            // ログアウトボタン
            document.getElementById('logoutBtn').addEventListener('click', async () => {
                await signOut();
                window.location.href = 'login.html';
            });

            // Supabaseからマスターデータ取得
            masterData = await getAllMasterData();
            console.log('Master data loaded from Supabase:', masterData);
        } else {
            throw new Error('Not authenticated');
        }
    } catch (error) {
        // ローカルモードで動作
        console.log('Running in local mode');
        isOnlineMode = false;
        document.getElementById('userEmail').textContent = 'ローカルモード';
        document.getElementById('logoutBtn').style.display = 'none';

        // ローカルマスターデータを使用
        if (window.localMasterData) {
            masterData = convertLocalMasterData(window.localMasterData);
            console.log('Master data loaded from local:', masterData);
        } else {
            showToast('マスターデータの取得に失敗しました', 'error');
            return;
        }
    }

    // イベントリスナー設定
    setupEventListeners();

    // 初期表示更新
    updateStats();
    updateEmptyState();
}

// ローカルデータ形式をSupabase形式に変換
function convertLocalMasterData(localData) {
    // 物件データを変換（端末情報を含める）
    const propertiesMap = new Map();
    localData.properties.forEach(p => {
        const code = String(p.propertyCode);
        if (!propertiesMap.has(code)) {
            propertiesMap.set(code, {
                property_code: code,
                property_name: p.propertyName,
                terminals: []
            });
        }
        propertiesMap.get(code).terminals.push({
            terminalId: p.terminalId,
            supplement: p.supplement || ''
        });
    });

    return {
        properties: Array.from(propertiesMap.values()),
        vendors: localData.vendors.map(v => ({
            vendor_name: v.vendorName,
            emergency_contact: v.emergencyContact
        })),
        inspectionTypes: localData.notices.map(n => ({
            template_no: n.templateNo,
            inspection_name: n.inspectionType,
            default_text: n.noticeText
        }))
    };
}

// ========================================
// イベントリスナー
// ========================================

function setupEventListeners() {
    // 行追加
    document.getElementById('addRowBtn').addEventListener('click', () => {
        addRow();
    });

    // 選択削除
    document.getElementById('deleteSelectedBtn').addEventListener('click', deleteSelectedRows);

    // 全選択
    document.getElementById('selectAll').addEventListener('change', (e) => {
        const checkboxes = document.querySelectorAll('#tableBody input[type="checkbox"]');
        checkboxes.forEach(cb => cb.checked = e.target.checked);
        updateSelectedCount();
    });

    // ペーストモーダル
    document.getElementById('pasteBtn').addEventListener('click', () => {
        document.getElementById('pasteModal').classList.add('active');
        document.getElementById('pasteArea').value = '';
        document.getElementById('pasteArea').focus();
    });

    document.getElementById('closePasteModal').addEventListener('click', closePasteModal);
    document.getElementById('cancelPasteBtn').addEventListener('click', closePasteModal);
    document.getElementById('importPasteBtn').addEventListener('click', importFromPaste);

    // モーダル外クリックで閉じる
    document.getElementById('pasteModal').addEventListener('click', (e) => {
        if (e.target.id === 'pasteModal') closePasteModal();
    });

    // 一括保存
    document.getElementById('saveBtn').addEventListener('click', saveAll);

    // CSVダウンロード
    document.getElementById('downloadCsvBtn').addEventListener('click', downloadCSV);

    // CSVコピー
    document.getElementById('copyCsvBtn').addEventListener('click', copyCSV);

    // キーボードショートカット
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closePasteModal();
        }
    });
}

// ========================================
// 行の追加・削除
// ========================================

function addRow(data = {}) {
    const rowId = ++rowIdCounter;
    const row = {
        id: rowId,
        propertyCode: data.propertyCode || '',
        terminalId: data.terminalId || '',
        vendorName: data.vendorName || '',
        inspectionType: data.inspectionType || '',
        startDate: data.startDate || '',
        endDate: data.endDate || '',
        remarks: data.remarks || '',
        displayTime: data.displayTime || 6,
        isValid: false,
        errors: []
    };

    rows.push(row);
    renderRow(row);
    validateRow(rowId);
    updateStats();
    updateEmptyState();
    updateButtons();

    return rowId;
}

function renderRow(row) {
    const tbody = document.getElementById('tableBody');
    const tr = document.createElement('tr');
    tr.dataset.rowId = row.id;

    // ユニークな物件コードリストを作成
    const uniqueProperties = [...new Map(
        masterData.properties.map(p => [p.property_code, p])
    ).values()];

    tr.innerHTML = `
        <td class="col-checkbox">
            <input type="checkbox" class="row-checkbox" data-row-id="${row.id}">
        </td>
        <td class="col-row-num">${rows.indexOf(row) + 1}</td>
        <td class="col-property">
            <select class="property-select" data-row-id="${row.id}">
                <option value="">選択</option>
                ${uniqueProperties.map(p =>
                    `<option value="${p.property_code}" ${row.propertyCode === p.property_code ? 'selected' : ''}>${p.property_code} ${p.property_name}</option>`
                ).join('')}
            </select>
        </td>
        <td class="col-terminal">
            <select class="terminal-select" data-row-id="${row.id}">
                <option value="">選択</option>
            </select>
        </td>
        <td class="col-vendor">
            <select class="vendor-select" data-row-id="${row.id}">
                <option value="">選択</option>
                ${masterData.vendors.map(v =>
                    `<option value="${v.vendor_name}" ${row.vendorName === v.vendor_name ? 'selected' : ''}>${v.vendor_name}</option>`
                ).join('')}
            </select>
        </td>
        <td class="col-inspection">
            <select class="inspection-select" data-row-id="${row.id}">
                <option value="">選択</option>
                ${masterData.inspectionTypes.map(i =>
                    `<option value="${i.inspection_name}" ${row.inspectionType === i.inspection_name ? 'selected' : ''}>${i.inspection_name}</option>`
                ).join('')}
            </select>
        </td>
        <td class="col-date">
            <input type="date" class="start-date" data-row-id="${row.id}" value="${row.startDate}">
        </td>
        <td class="col-date">
            <input type="date" class="end-date" data-row-id="${row.id}" value="${row.endDate}">
        </td>
        <td class="col-remarks">
            <input type="text" class="remarks-input" data-row-id="${row.id}" value="${row.remarks}" placeholder="備考">
        </td>
        <td class="col-time">
            <input type="number" class="display-time" data-row-id="${row.id}" value="${row.displayTime}" min="1" max="30">
        </td>
        <td class="col-status">
            <span class="status-badge ok" data-row-id="${row.id}">✓ OK</span>
        </td>
    `;

    tbody.appendChild(tr);

    // イベントリスナー追加
    setupRowEventListeners(tr, row.id);

    // 物件が設定されている場合は端末を更新
    if (row.propertyCode) {
        updateTerminals(row.id, row.propertyCode);
    }
}

function setupRowEventListeners(tr, rowId) {
    // チェックボックス
    tr.querySelector('.row-checkbox').addEventListener('change', updateSelectedCount);

    // 物件選択
    tr.querySelector('.property-select').addEventListener('change', (e) => {
        const row = rows.find(r => r.id === rowId);
        if (row) {
            row.propertyCode = e.target.value;
            updateTerminals(rowId, e.target.value);
            validateRow(rowId);
        }
    });

    // 端末選択
    tr.querySelector('.terminal-select').addEventListener('change', (e) => {
        const row = rows.find(r => r.id === rowId);
        if (row) {
            row.terminalId = e.target.value;
            validateRow(rowId);
        }
    });

    // 受注先選択
    tr.querySelector('.vendor-select').addEventListener('change', (e) => {
        const row = rows.find(r => r.id === rowId);
        if (row) {
            row.vendorName = e.target.value;
            validateRow(rowId);
        }
    });

    // 点検種別選択
    tr.querySelector('.inspection-select').addEventListener('change', (e) => {
        const row = rows.find(r => r.id === rowId);
        if (row) {
            row.inspectionType = e.target.value;
            validateRow(rowId);
        }
    });

    // 日付
    tr.querySelector('.start-date').addEventListener('change', (e) => {
        const row = rows.find(r => r.id === rowId);
        if (row) {
            row.startDate = e.target.value;
            validateRow(rowId);
        }
    });

    tr.querySelector('.end-date').addEventListener('change', (e) => {
        const row = rows.find(r => r.id === rowId);
        if (row) {
            row.endDate = e.target.value;
            validateRow(rowId);
        }
    });

    // 備考
    tr.querySelector('.remarks-input').addEventListener('input', (e) => {
        const row = rows.find(r => r.id === rowId);
        if (row) {
            row.remarks = e.target.value;
        }
    });

    // 表示秒数
    tr.querySelector('.display-time').addEventListener('change', (e) => {
        const row = rows.find(r => r.id === rowId);
        if (row) {
            row.displayTime = parseInt(e.target.value) || 6;
        }
    });
}

function updateTerminals(rowId, propertyCode) {
    const tr = document.querySelector(`tr[data-row-id="${rowId}"]`);
    if (!tr) return;

    const terminalSelect = tr.querySelector('.terminal-select');
    const property = masterData.properties.find(p => p.property_code === propertyCode);

    terminalSelect.innerHTML = '<option value="">選択</option>';

    if (property && property.terminals) {
        const terminals = typeof property.terminals === 'string'
            ? JSON.parse(property.terminals)
            : property.terminals;

        terminals.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.terminalId;
            opt.textContent = t.supplement ? `${t.terminalId} (${t.supplement})` : t.terminalId;
            terminalSelect.appendChild(opt);
        });

        // 最初の端末を自動選択
        if (terminals.length > 0) {
            terminalSelect.value = terminals[0].terminalId;
            const row = rows.find(r => r.id === rowId);
            if (row) row.terminalId = terminals[0].terminalId;
        }
    }
}

function deleteSelectedRows() {
    const selectedIds = getSelectedRowIds();
    if (selectedIds.length === 0) return;

    if (!confirm(`${selectedIds.length}件の行を削除しますか？`)) return;

    selectedIds.forEach(id => {
        const tr = document.querySelector(`tr[data-row-id="${id}"]`);
        if (tr) tr.remove();
        rows = rows.filter(r => r.id !== id);
    });

    // 行番号を更新
    updateRowNumbers();
    updateStats();
    updateEmptyState();
    updateButtons();
    document.getElementById('selectAll').checked = false;
}

function updateRowNumbers() {
    const trs = document.querySelectorAll('#tableBody tr');
    trs.forEach((tr, index) => {
        tr.querySelector('.col-row-num').textContent = index + 1;
    });
}

function getSelectedRowIds() {
    const checkboxes = document.querySelectorAll('#tableBody input[type="checkbox"]:checked');
    return Array.from(checkboxes).map(cb => parseInt(cb.dataset.rowId));
}

// ========================================
// バリデーション
// ========================================

function validateRow(rowId) {
    const row = rows.find(r => r.id === rowId);
    if (!row) return;

    row.errors = [];

    if (!row.propertyCode) {
        row.errors.push('物件を選択してください');
    }
    if (!row.vendorName) {
        row.errors.push('受注先を選択してください');
    }
    if (!row.inspectionType) {
        row.errors.push('点検種別を選択してください');
    }

    row.isValid = row.errors.length === 0;

    // UI更新
    updateRowStatus(rowId);
    updateStats();
    updateButtons();
}

function updateRowStatus(rowId) {
    const row = rows.find(r => r.id === rowId);
    if (!row) return;

    const tr = document.querySelector(`tr[data-row-id="${rowId}"]`);
    if (!tr) return;

    const badge = tr.querySelector('.status-badge');

    // セルのエラー状態をリセット
    tr.querySelectorAll('td').forEach(td => td.classList.remove('has-error'));

    if (row.isValid) {
        badge.className = 'status-badge ok';
        badge.textContent = '✓ OK';
    } else {
        badge.className = 'status-badge error';
        badge.textContent = '⚠ エラー';
        badge.title = row.errors.join('\n');

        // エラーのあるセルをハイライト
        if (!row.propertyCode) {
            tr.querySelector('.col-property')?.classList.add('has-error');
        }
        if (!row.vendorName) {
            tr.querySelector('.col-vendor')?.classList.add('has-error');
        }
        if (!row.inspectionType) {
            tr.querySelector('.col-inspection')?.classList.add('has-error');
        }
    }
}

// ========================================
// 統計更新
// ========================================

function updateStats() {
    document.getElementById('totalCount').textContent = rows.length;
    document.getElementById('validCount').textContent = rows.filter(r => r.isValid).length;
    document.getElementById('errorCount').textContent = rows.filter(r => !r.isValid).length;
    updateSelectedCount();
}

function updateSelectedCount() {
    const count = getSelectedRowIds().length;
    document.getElementById('selectedCount').textContent = count;
    document.getElementById('deleteSelectedBtn').disabled = count === 0;
}

function updateEmptyState() {
    const emptyState = document.getElementById('emptyState');
    const table = document.querySelector('.bulk-table');

    if (rows.length === 0) {
        emptyState.style.display = 'block';
        table.style.display = 'none';
    } else {
        emptyState.style.display = 'none';
        table.style.display = 'table';
    }
}

function updateButtons() {
    const validCount = rows.filter(r => r.isValid).length;
    document.getElementById('saveBtn').disabled = validCount === 0;
    document.getElementById('downloadCsvBtn').disabled = validCount === 0;
    document.getElementById('copyCsvBtn').disabled = validCount === 0;
}

// ========================================
// ペースト機能
// ========================================

function closePasteModal() {
    document.getElementById('pasteModal').classList.remove('active');
}

function importFromPaste() {
    const pasteArea = document.getElementById('pasteArea');
    const text = pasteArea.value.trim();

    if (!text) {
        showToast('データを入力してください', 'error');
        return;
    }

    const lines = text.split('\n');
    let importedCount = 0;

    lines.forEach(line => {
        const parts = line.split('\t');
        if (parts.length >= 3) {
            // 物件コード、受注先、点検種別は必須
            const propertyCode = parts[0]?.trim();
            const vendorName = parts[1]?.trim();
            const inspectionType = parts[2]?.trim();
            const startDate = parts[3]?.trim() || '';
            const endDate = parts[4]?.trim() || '';
            const remarks = parts[5]?.trim() || '';

            // マスターデータとのマッチング
            const matchedProperty = masterData.properties.find(p =>
                p.property_code === propertyCode || p.property_name.includes(propertyCode)
            );
            const matchedVendor = masterData.vendors.find(v =>
                v.vendor_name.includes(vendorName)
            );
            const matchedInspection = masterData.inspectionTypes.find(i =>
                i.inspection_name.includes(inspectionType)
            );

            addRow({
                propertyCode: matchedProperty?.property_code || propertyCode,
                vendorName: matchedVendor?.vendor_name || vendorName,
                inspectionType: matchedInspection?.inspection_name || inspectionType,
                startDate: formatDateForInput(startDate),
                endDate: formatDateForInput(endDate),
                remarks: remarks
            });
            importedCount++;
        }
    });

    closePasteModal();
    showToast(`${importedCount}件のデータをインポートしました`, 'success');
}

function formatDateForInput(dateStr) {
    if (!dateStr) return '';

    // YYYY-MM-DD形式
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return dateStr;
    }

    // YYYY/MM/DD形式
    if (/^\d{4}\/\d{2}\/\d{2}$/.test(dateStr)) {
        return dateStr.replace(/\//g, '-');
    }

    return '';
}

// ========================================
// 保存機能
// ========================================

async function saveAll() {
    const validRows = rows.filter(r => r.isValid);
    if (validRows.length === 0) {
        showToast('保存するデータがありません', 'error');
        return;
    }

    // ローカルモードではSupabaseに保存できない
    if (!isOnlineMode) {
        showToast('ローカルモードではサーバー保存できません。CSVダウンロードをご利用ください。', 'error');
        return;
    }

    const saveBtn = document.getElementById('saveBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = '保存中...';

    try {
        const entries = validRows.map(row => {
            const property = masterData.properties.find(p => p.property_code === row.propertyCode);
            const vendor = masterData.vendors.find(v => v.vendor_name === row.vendorName);
            const inspection = masterData.inspectionTypes.find(i => i.inspection_name === row.inspectionType);

            return {
                property_code: row.propertyCode,
                terminal_id: row.terminalId || property?.terminals?.[0]?.terminalId || '',
                vendor_name: row.vendorName,
                emergency_contact: vendor?.emergency_contact || '',
                inspection_type: row.inspectionType,
                template_no: inspection?.template_no || '',
                inspection_start: row.startDate || null,
                inspection_end: row.endDate || null,
                remarks: row.remarks,
                display_duration: row.displayTime,
                status: 'submitted'
            };
        });

        await createEntries(entries);
        showToast(`${entries.length}件のデータを保存しました`, 'success');

        // 保存した行を削除
        validRows.forEach(row => {
            const tr = document.querySelector(`tr[data-row-id="${row.id}"]`);
            if (tr) tr.remove();
            rows = rows.filter(r => r.id !== row.id);
        });

        updateRowNumbers();
        updateStats();
        updateEmptyState();
        updateButtons();

    } catch (error) {
        console.error('Save error:', error);
        showToast('保存に失敗しました: ' + error.message, 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = '💾 一括保存';
        updateButtons();
    }
}

// ========================================
// CSV機能
// ========================================

function generateCSV() {
    const validRows = rows.filter(r => r.isValid);
    if (validRows.length === 0) return '';

    const headers = [
        '点検CO', '端末ID', '物件コード', '受注先名', '緊急連絡先番号',
        '点検工事案内', '掲示板に表示する', '点検案内TPLNo', '点検開始日',
        '点検完了日', '掲示備考', '掲示板用案内文', 'frame_No', '表示開始日',
        '表示開始時刻', '表示終了日', '表示終了時刻', '貼紙区分', '表示時間',
        'カテゴリー', 'カテゴリー２', 'カテゴリー３', 'カテゴリー４',
        'カテゴリー５', 'カテゴリー６', '画像パス', 'お知らせ開始事前', 'ステータス'
    ];

    const csvRows = [headers.join(',')];

    validRows.forEach(row => {
        const property = masterData.properties.find(p => p.property_code === row.propertyCode);
        const vendor = masterData.vendors.find(v => v.vendor_name === row.vendorName);
        const inspection = masterData.inspectionTypes.find(i => i.inspection_name === row.inspectionType);

        const formatDate = (d) => d ? d.replace(/-/g, '/') : '';
        const displayTimeFormatted = `0:00:${String(row.displayTime).padStart(2, '0')}`;

        const values = [
            '', // 点検CO
            row.terminalId || property?.terminals?.[0]?.terminalId || '',
            row.propertyCode,
            row.vendorName,
            vendor?.emergency_contact || '',
            row.inspectionType,
            'True',
            inspection?.template_no || '',
            formatDate(row.startDate),
            formatDate(row.endDate),
            row.remarks,
            inspection?.default_text || '',
            '2',
            formatDate(row.startDate),
            '',
            formatDate(row.endDate),
            '',
            'テンプレート',
            displayTimeFormatted,
            '', '', '', '', '', '', '', '30', ''
        ];

        csvRows.push(values.map(v => `"${v}"`).join(','));
    });

    return csvRows.join('\n');
}

function downloadCSV() {
    const csv = generateCSV();
    if (!csv) {
        showToast('ダウンロードするデータがありません', 'error');
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

    showToast('CSVをダウンロードしました', 'success');
}

function copyCSV() {
    const csv = generateCSV();
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

// ========================================
// ユーティリティ
// ========================================

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2500);
}

// ========================================
// 起動
// ========================================

init();
