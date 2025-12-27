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
let currentFilter = 'all'; // 'all', 'valid', 'error'
let currentUserId = null;
let draggedRow = null;
let autoSaveTimer = null;

// ========================================
// 初期化
// ========================================

async function init() {
    // 認証チェック
    const user = await getUser();
    if (!user) {
        window.location.href = 'login.html';
        return;
    }
    currentUserId = user.id;

    // ユーザー情報表示
    const profile = await getProfile();
    document.getElementById('userEmail').textContent = profile?.email || user.email;

    // ログアウトボタン
    document.getElementById('logoutBtn').addEventListener('click', async () => {
        await signOut();
        window.location.href = 'login.html';
    });

    // マスターデータ取得
    try {
        masterData = await getAllMasterData();
        console.log('Master data loaded:', masterData);
    } catch (error) {
        console.error('Failed to load master data:', error);
        showToast('マスターデータの取得に失敗しました', 'error');
        return;
    }

    // イベントリスナー設定
    setupEventListeners();

    // テンプレートをロード
    loadTemplates();

    // 一時保存データを復元
    restoreAutoSave();

    // 初期表示更新
    updateStats();
    updateEmptyState();

    // 右クリックメニューを作成
    createContextMenu();

    // 一括編集モーダルを作成
    createBulkEditModal();
}

// ========================================
// イベントリスナー
// ========================================

function setupEventListeners() {
    // 行追加（前の行をコピー）
    document.getElementById('addRowBtn').addEventListener('click', () => {
        addRowWithCopy();
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
    document.addEventListener('keydown', handleGlobalKeyDown);

    // 複製ボタン
    const duplicateBtn = document.getElementById('duplicateBtn');
    if (duplicateBtn) {
        duplicateBtn.addEventListener('click', duplicateSelectedRows);
    }

    // 一括編集ボタン
    const bulkEditBtn = document.getElementById('bulkEditBtn');
    if (bulkEditBtn) {
        bulkEditBtn.addEventListener('click', openBulkEditModal);
    }

    // フィルターボタン
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            applyFilter();
        });
    });

    // テンプレート選択
    const templateSelect = document.getElementById('templateSelect');
    if (templateSelect) {
        templateSelect.addEventListener('change', (e) => {
            if (e.target.value) {
                applyTemplate(e.target.value);
            }
        });
    }

    // テンプレート保存ボタン
    const saveTemplateBtn = document.getElementById('saveTemplateBtn');
    if (saveTemplateBtn) {
        saveTemplateBtn.addEventListener('click', openSaveTemplateModal);
    }

    // テンプレート保存モーダル
    const confirmSaveTemplate = document.getElementById('confirmSaveTemplate');
    if (confirmSaveTemplate) {
        confirmSaveTemplate.addEventListener('click', saveTemplate);
    }
    const cancelSaveTemplate = document.getElementById('cancelSaveTemplate');
    if (cancelSaveTemplate) {
        cancelSaveTemplate.addEventListener('click', closeTemplateModalFn);
    }
    const closeTemplateModalBtn = document.getElementById('closeTemplateModal');
    if (closeTemplateModalBtn) {
        closeTemplateModalBtn.addEventListener('click', closeTemplateModalFn);
    }

    // 右クリックメニューを閉じる
    document.addEventListener('click', () => {
        hideContextMenu();
    });

    // ページを離れる前の警告
    window.addEventListener('beforeunload', (e) => {
        if (rows.length > 0) {
            e.preventDefault();
            e.returnValue = '';
        }
    });
}

// ========================================
// キーボードナビゲーション
// ========================================

function handleGlobalKeyDown(e) {
    // モーダルが開いている場合はEscapeのみ処理
    if (document.querySelector('.paste-modal.active')) {
        if (e.key === 'Escape') {
            closePasteModal();
            closeTemplateModalFn();
            closeBulkEditModal();
        }
        return;
    }

    // Ctrl+D: 選択行を複製
    if (e.ctrlKey && e.key === 'd') {
        e.preventDefault();
        duplicateSelectedRows();
    }
    // Ctrl+Enter: 行追加（前の行をコピー）
    if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        addRowWithCopy();
    }
    // Delete: 選択行を削除（入力フィールドにフォーカスがない場合）
    if (e.key === 'Delete' && !isInputFocused() && getSelectedRowIds().length > 0) {
        e.preventDefault();
        deleteSelectedRows();
    }
    // Ctrl+E: 一括編集
    if (e.ctrlKey && e.key === 'e') {
        e.preventDefault();
        openBulkEditModal();
    }
}

function isInputFocused() {
    const active = document.activeElement;
    return active && (active.tagName === 'INPUT' || active.tagName === 'SELECT' || active.tagName === 'TEXTAREA');
}

function handleCellKeyDown(e, rowId) {
    const target = e.target;
    const tr = target.closest('tr');
    if (!tr) return;

    const cells = Array.from(tr.querySelectorAll('input, select, textarea'));
    const currentIndex = cells.indexOf(target);

    if (e.key === 'Tab') {
        // Tabキー: 次のセルへ移動
        if (!e.shiftKey && currentIndex === cells.length - 1) {
            // 最後のセルで次の行へ
            e.preventDefault();
            const nextTr = tr.nextElementSibling;
            if (nextTr) {
                const nextCells = nextTr.querySelectorAll('input, select, textarea');
                if (nextCells.length > 0) nextCells[0].focus();
            }
        } else if (e.shiftKey && currentIndex === 0) {
            // 最初のセルで前の行へ
            e.preventDefault();
            const prevTr = tr.previousElementSibling;
            if (prevTr) {
                const prevCells = prevTr.querySelectorAll('input, select, textarea');
                if (prevCells.length > 0) prevCells[prevCells.length - 1].focus();
            }
        }
    } else if (e.key === 'Enter' && !e.ctrlKey) {
        // Enter: 下のセルへ移動
        e.preventDefault();
        const allRows = Array.from(document.querySelectorAll('#tableBody tr'));
        const rowIndex = allRows.indexOf(tr);
        if (rowIndex < allRows.length - 1) {
            const nextTr = allRows[rowIndex + 1];
            const nextCells = nextTr.querySelectorAll('input, select, textarea');
            if (nextCells[currentIndex]) {
                nextCells[currentIndex].focus();
            }
        }
    } else if (e.key === 'ArrowUp' && e.altKey) {
        // Alt+上: 上のセルへ移動
        e.preventDefault();
        const prevTr = tr.previousElementSibling;
        if (prevTr) {
            const prevCells = prevTr.querySelectorAll('input, select, textarea');
            if (prevCells[currentIndex]) prevCells[currentIndex].focus();
        }
    } else if (e.key === 'ArrowDown' && e.altKey) {
        // Alt+下: 下のセルへ移動
        e.preventDefault();
        const nextTr = tr.nextElementSibling;
        if (nextTr) {
            const nextCells = nextTr.querySelectorAll('input, select, textarea');
            if (nextCells[currentIndex]) nextCells[currentIndex].focus();
        }
    }
}

// ========================================
// 行の追加・削除
// ========================================

// 前の行をコピーして追加
function addRowWithCopy() {
    if (rows.length === 0) {
        // 最初の行は空で追加
        addRow();
    } else {
        // 最後の行をコピー
        const lastRow = rows[rows.length - 1];
        addRow({
            propertyCode: lastRow.propertyCode,
            terminalId: lastRow.terminalId,
            vendorName: lastRow.vendorName,
            inspectionType: lastRow.inspectionType,
            startDate: lastRow.startDate,
            endDate: lastRow.endDate,
            remarks: '', // 備考はコピーしない
            displayTime: lastRow.displayTime
        });
    }
}

// 選択行を複製
function duplicateSelectedRows() {
    const selectedIds = getSelectedRowIds();
    if (selectedIds.length === 0) {
        showToast('複製する行を選択してください', 'error');
        return;
    }

    selectedIds.forEach(id => {
        const sourceRow = rows.find(r => r.id === id);
        if (sourceRow) {
            addRow({
                propertyCode: sourceRow.propertyCode,
                terminalId: sourceRow.terminalId,
                vendorName: sourceRow.vendorName,
                inspectionType: sourceRow.inspectionType,
                startDate: sourceRow.startDate,
                endDate: sourceRow.endDate,
                remarks: sourceRow.remarks,
                displayTime: sourceRow.displayTime
            });
        }
    });

    showToast(`${selectedIds.length}件の行を複製しました`, 'success');
    document.getElementById('selectAll').checked = false;
}

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
    triggerAutoSave();

    return rowId;
}

function renderRow(row) {
    const tbody = document.getElementById('tableBody');
    const tr = document.createElement('tr');
    tr.dataset.rowId = row.id;
    tr.draggable = true;

    // ユニークな物件コードリストを作成
    const uniqueProperties = [...new Map(
        masterData.properties.map(p => [p.property_code, p])
    ).values()];

    tr.innerHTML = `
        <td class="col-drag-handle" title="ドラッグで順序変更">⋮⋮</td>
        <td class="col-checkbox">
            <input type="checkbox" class="row-checkbox" data-row-id="${row.id}">
        </td>
        <td class="col-row-num">${rows.indexOf(row) + 1}</td>
        <td class="col-property">
            <div class="searchable-select-container">
                <input type="text" class="searchable-input property-search" placeholder="検索..." data-row-id="${row.id}">
                <select class="property-select" data-row-id="${row.id}">
                    <option value="">選択</option>
                    ${uniqueProperties.map(p =>
                        `<option value="${p.property_code}" ${row.propertyCode === p.property_code ? 'selected' : ''}>${p.property_code} ${p.property_name}</option>`
                    ).join('')}
                </select>
            </div>
        </td>
        <td class="col-terminal">
            <select class="terminal-select" data-row-id="${row.id}">
                <option value="">選択</option>
            </select>
        </td>
        <td class="col-vendor">
            <div class="searchable-select-container">
                <input type="text" class="searchable-input vendor-search" placeholder="検索..." data-row-id="${row.id}">
                <select class="vendor-select" data-row-id="${row.id}">
                    <option value="">選択</option>
                    ${masterData.vendors.map(v =>
                        `<option value="${v.vendor_name}" ${row.vendorName === v.vendor_name ? 'selected' : ''}>${v.vendor_name}</option>`
                    ).join('')}
                </select>
            </div>
        </td>
        <td class="col-inspection">
            <div class="searchable-select-container">
                <input type="text" class="searchable-input inspection-search" placeholder="検索..." data-row-id="${row.id}">
                <select class="inspection-select" data-row-id="${row.id}">
                    <option value="">選択</option>
                    ${masterData.inspectionTypes.map(i =>
                        `<option value="${i.inspection_name}" ${row.inspectionType === i.inspection_name ? 'selected' : ''}>${i.inspection_name}</option>`
                    ).join('')}
                </select>
            </div>
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

    // ドラッグ&ドロップ
    tr.addEventListener('dragstart', handleDragStart);
    tr.addEventListener('dragend', handleDragEnd);
    tr.addEventListener('dragover', handleDragOver);
    tr.addEventListener('drop', handleDrop);

    // 右クリック
    tr.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showContextMenu(e, rowId);
    });

    // 検索付きドロップダウン - 物件
    const propertySearch = tr.querySelector('.property-search');
    const propertySelect = tr.querySelector('.property-select');
    setupSearchableSelect(propertySearch, propertySelect);

    // 検索付きドロップダウン - 受注先
    const vendorSearch = tr.querySelector('.vendor-search');
    const vendorSelect = tr.querySelector('.vendor-select');
    setupSearchableSelect(vendorSearch, vendorSelect);

    // 検索付きドロップダウン - 点検種別
    const inspectionSearch = tr.querySelector('.inspection-search');
    const inspectionSelect = tr.querySelector('.inspection-select');
    setupSearchableSelect(inspectionSearch, inspectionSelect);

    // 物件選択
    propertySelect.addEventListener('change', (e) => {
        const row = rows.find(r => r.id === rowId);
        if (row) {
            row.propertyCode = e.target.value;
            updateTerminals(rowId, e.target.value);
            validateRow(rowId);
            triggerAutoSave();
        }
    });

    // 端末選択
    tr.querySelector('.terminal-select').addEventListener('change', (e) => {
        const row = rows.find(r => r.id === rowId);
        if (row) {
            row.terminalId = e.target.value;
            validateRow(rowId);
            triggerAutoSave();
        }
    });

    // 受注先選択
    vendorSelect.addEventListener('change', (e) => {
        const row = rows.find(r => r.id === rowId);
        if (row) {
            row.vendorName = e.target.value;
            validateRow(rowId);
            triggerAutoSave();
        }
    });

    // 点検種別選択
    inspectionSelect.addEventListener('change', (e) => {
        const row = rows.find(r => r.id === rowId);
        if (row) {
            row.inspectionType = e.target.value;
            validateRow(rowId);
            triggerAutoSave();
        }
    });

    // 開始日 - 終了日自動設定
    tr.querySelector('.start-date').addEventListener('change', (e) => {
        const row = rows.find(r => r.id === rowId);
        if (row) {
            row.startDate = e.target.value;
            // 終了日が未設定の場合、開始日と同じに設定
            if (!row.endDate && e.target.value) {
                row.endDate = e.target.value;
                tr.querySelector('.end-date').value = e.target.value;
            }
            validateRow(rowId);
            triggerAutoSave();
        }
    });

    tr.querySelector('.end-date').addEventListener('change', (e) => {
        const row = rows.find(r => r.id === rowId);
        if (row) {
            row.endDate = e.target.value;
            validateRow(rowId);
            triggerAutoSave();
        }
    });

    // 備考
    tr.querySelector('.remarks-input').addEventListener('input', (e) => {
        const row = rows.find(r => r.id === rowId);
        if (row) {
            row.remarks = e.target.value;
            triggerAutoSave();
        }
    });

    // 表示秒数
    tr.querySelector('.display-time').addEventListener('change', (e) => {
        const row = rows.find(r => r.id === rowId);
        if (row) {
            row.displayTime = parseInt(e.target.value) || 6;
            triggerAutoSave();
        }
    });

    // セルナビゲーション
    tr.querySelectorAll('input, select, textarea').forEach(el => {
        el.addEventListener('keydown', (e) => handleCellKeyDown(e, rowId));
    });
}

// ========================================
// 検索付きドロップダウン
// ========================================

function setupSearchableSelect(searchInput, select) {
    let isOpen = false;

    // セレクトにフォーカスしたら検索ボックスを表示
    select.addEventListener('focus', () => {
        isOpen = true;
        searchInput.classList.add('active');
        select.classList.add('expanded');
        select.size = Math.min(select.options.length, 8);
        // 検索ボックスにフォーカスを移動
        setTimeout(() => searchInput.focus(), 50);
    });

    // 検索ボックスの入力処理
    searchInput.addEventListener('input', (e) => {
        const searchText = e.target.value.toLowerCase();
        const options = select.options;

        for (let i = 0; i < options.length; i++) {
            const optionText = options[i].text.toLowerCase();
            options[i].style.display = optionText.includes(searchText) ? '' : 'none';
        }
    });

    // 検索ボックスからフォーカスが外れた時
    searchInput.addEventListener('blur', () => {
        setTimeout(() => {
            if (!select.matches(':focus')) {
                closeSearchableSelect(searchInput, select);
            }
        }, 150);
    });

    // セレクトで選択した時
    select.addEventListener('change', () => {
        searchInput.value = '';
        closeSearchableSelect(searchInput, select);
        // 選択後は次のフィールドにフォーカスを移動
        const nextInput = select.closest('td').nextElementSibling?.querySelector('input, select');
        if (nextInput) nextInput.focus();
    });

    // セレクトからフォーカスが外れた時
    select.addEventListener('blur', () => {
        setTimeout(() => {
            if (!searchInput.matches(':focus')) {
                closeSearchableSelect(searchInput, select);
            }
        }, 150);
    });

    // Escapeで閉じる
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeSearchableSelect(searchInput, select);
            select.focus();
        }
        if (e.key === 'Enter') {
            // 最初の表示されているオプションを選択
            const visibleOptions = Array.from(select.options).filter(opt => opt.style.display !== 'none' && opt.value);
            if (visibleOptions.length > 0) {
                select.value = visibleOptions[0].value;
                select.dispatchEvent(new Event('change'));
            }
        }
    });
}

function closeSearchableSelect(searchInput, select) {
    searchInput.classList.remove('active');
    searchInput.value = '';
    select.classList.remove('expanded');
    select.size = 1;
    // オプションの表示をリセット
    for (let i = 0; i < select.options.length; i++) {
        select.options[i].style.display = '';
    }
}

// ========================================
// ドラッグ&ドロップ
// ========================================

function handleDragStart(e) {
    draggedRow = e.target.closest('tr');
    draggedRow.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
    if (draggedRow) {
        draggedRow.classList.remove('dragging');
        draggedRow = null;
    }
    document.querySelectorAll('#tableBody tr').forEach(tr => {
        tr.classList.remove('drag-over');
    });
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const tr = e.target.closest('tr');
    if (tr && tr !== draggedRow) {
        document.querySelectorAll('#tableBody tr').forEach(row => {
            row.classList.remove('drag-over');
        });
        tr.classList.add('drag-over');
    }
}

function handleDrop(e) {
    e.preventDefault();
    const targetTr = e.target.closest('tr');
    if (!targetTr || targetTr === draggedRow) return;

    const tbody = document.getElementById('tableBody');
    const allRows = Array.from(tbody.querySelectorAll('tr'));
    const draggedIndex = allRows.indexOf(draggedRow);
    const targetIndex = allRows.indexOf(targetTr);

    // DOM上の位置を変更
    if (draggedIndex < targetIndex) {
        targetTr.after(draggedRow);
    } else {
        targetTr.before(draggedRow);
    }

    // データ配列の順序も変更
    const draggedRowId = parseInt(draggedRow.dataset.rowId);
    const rowData = rows.find(r => r.id === draggedRowId);
    rows = rows.filter(r => r.id !== draggedRowId);

    const targetRowId = parseInt(targetTr.dataset.rowId);
    const targetDataIndex = rows.findIndex(r => r.id === targetRowId);

    if (draggedIndex < targetIndex) {
        rows.splice(targetDataIndex + 1, 0, rowData);
    } else {
        rows.splice(targetDataIndex, 0, rowData);
    }

    updateRowNumbers();
    triggerAutoSave();
    showToast('行の順序を変更しました', 'success');
}

// ========================================
// 右クリックメニュー
// ========================================

function createContextMenu() {
    const menu = document.createElement('div');
    menu.id = 'contextMenu';
    menu.className = 'context-menu';
    menu.innerHTML = `
        <div class="context-menu-item" data-action="duplicate">📑 この行を複製</div>
        <div class="context-menu-item" data-action="insertAbove">⬆️ 上に行を挿入</div>
        <div class="context-menu-item" data-action="insertBelow">⬇️ 下に行を挿入</div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item" data-action="copyRow">📋 この行をコピー</div>
        <div class="context-menu-item" data-action="pasteRow">📥 ペースト</div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item" data-action="selectAll">☑️ 全て選択</div>
        <div class="context-menu-item" data-action="deselectAll">☐ 選択解除</div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item danger" data-action="delete">🗑️ この行を削除</div>
    `;
    document.body.appendChild(menu);

    menu.addEventListener('click', (e) => {
        const item = e.target.closest('.context-menu-item');
        if (!item) return;

        const action = item.dataset.action;
        const rowId = parseInt(menu.dataset.rowId);
        handleContextMenuAction(action, rowId);
        hideContextMenu();
    });
}

let copiedRowData = null;

function showContextMenu(e, rowId) {
    const menu = document.getElementById('contextMenu');
    menu.dataset.rowId = rowId;
    menu.style.left = e.pageX + 'px';
    menu.style.top = e.pageY + 'px';
    menu.classList.add('active');
}

function hideContextMenu() {
    const menu = document.getElementById('contextMenu');
    if (menu) menu.classList.remove('active');
}

function handleContextMenuAction(action, rowId) {
    const row = rows.find(r => r.id === rowId);
    const rowIndex = rows.findIndex(r => r.id === rowId);

    switch (action) {
        case 'duplicate':
            if (row) {
                addRow({
                    propertyCode: row.propertyCode,
                    terminalId: row.terminalId,
                    vendorName: row.vendorName,
                    inspectionType: row.inspectionType,
                    startDate: row.startDate,
                    endDate: row.endDate,
                    remarks: row.remarks,
                    displayTime: row.displayTime
                });
                showToast('行を複製しました', 'success');
            }
            break;

        case 'insertAbove':
            insertRowAt(rowIndex);
            break;

        case 'insertBelow':
            insertRowAt(rowIndex + 1);
            break;

        case 'copyRow':
            if (row) {
                copiedRowData = { ...row };
                showToast('行をコピーしました', 'success');
            }
            break;

        case 'pasteRow':
            if (copiedRowData) {
                addRow({
                    propertyCode: copiedRowData.propertyCode,
                    terminalId: copiedRowData.terminalId,
                    vendorName: copiedRowData.vendorName,
                    inspectionType: copiedRowData.inspectionType,
                    startDate: copiedRowData.startDate,
                    endDate: copiedRowData.endDate,
                    remarks: copiedRowData.remarks,
                    displayTime: copiedRowData.displayTime
                });
                showToast('行をペーストしました', 'success');
            } else {
                showToast('コピーされた行がありません', 'error');
            }
            break;

        case 'selectAll':
            document.querySelectorAll('#tableBody input[type="checkbox"]').forEach(cb => cb.checked = true);
            document.getElementById('selectAll').checked = true;
            updateSelectedCount();
            break;

        case 'deselectAll':
            document.querySelectorAll('#tableBody input[type="checkbox"]').forEach(cb => cb.checked = false);
            document.getElementById('selectAll').checked = false;
            updateSelectedCount();
            break;

        case 'delete':
            if (confirm('この行を削除しますか？')) {
                const tr = document.querySelector(`tr[data-row-id="${rowId}"]`);
                if (tr) tr.remove();
                rows = rows.filter(r => r.id !== rowId);
                updateRowNumbers();
                updateStats();
                updateEmptyState();
                updateButtons();
                triggerAutoSave();
                showToast('行を削除しました', 'success');
            }
            break;
    }
}

function insertRowAt(index) {
    const newRowId = ++rowIdCounter;
    const newRow = {
        id: newRowId,
        propertyCode: '',
        terminalId: '',
        vendorName: '',
        inspectionType: '',
        startDate: '',
        endDate: '',
        remarks: '',
        displayTime: 6,
        isValid: false,
        errors: []
    };

    rows.splice(index, 0, newRow);

    // 既存のDOMを再構築
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';
    rows.forEach(row => renderRow(row));
    rows.forEach(row => validateRow(row.id));

    updateStats();
    triggerAutoSave();
    showToast('行を挿入しました', 'success');
}

// ========================================
// 一括編集モーダル
// ========================================

function createBulkEditModal() {
    const modal = document.createElement('div');
    modal.id = 'bulkEditModal';
    modal.className = 'paste-modal';

    const uniqueProperties = [...new Map(
        masterData.properties.map(p => [p.property_code, p])
    ).values()];

    modal.innerHTML = `
        <div class="paste-modal-content" style="max-width: 500px;">
            <div class="paste-modal-header">
                <h3>✏️ 選択行を一括編集</h3>
                <button class="modal-close" id="closeBulkEditModal">&times;</button>
            </div>
            <div style="padding: 1rem;">
                <p style="margin-bottom: 1rem; color: #6b7280; font-size: 0.875rem;">
                    選択した行のフィールドを一括で変更できます。変更しない項目は空のままにしてください。
                </p>
                <div class="form-group" style="margin-bottom: 1rem;">
                    <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">物件</label>
                    <select id="bulkEditProperty" class="form-select" style="width: 100%;">
                        <option value="">変更しない</option>
                        ${uniqueProperties.map(p =>
                            `<option value="${p.property_code}">${p.property_code} ${p.property_name}</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="form-group" style="margin-bottom: 1rem;">
                    <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">受注先</label>
                    <select id="bulkEditVendor" class="form-select" style="width: 100%;">
                        <option value="">変更しない</option>
                        ${masterData.vendors.map(v =>
                            `<option value="${v.vendor_name}">${v.vendor_name}</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="form-group" style="margin-bottom: 1rem;">
                    <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">点検種別</label>
                    <select id="bulkEditInspection" class="form-select" style="width: 100%;">
                        <option value="">変更しない</option>
                        ${masterData.inspectionTypes.map(i =>
                            `<option value="${i.inspection_name}">${i.inspection_name}</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="form-group" style="margin-bottom: 1rem;">
                    <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">点検開始日</label>
                    <input type="date" id="bulkEditStartDate" class="form-control" style="width: 100%;">
                </div>
                <div class="form-group" style="margin-bottom: 1rem;">
                    <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">点検終了日</label>
                    <input type="date" id="bulkEditEndDate" class="form-control" style="width: 100%;">
                </div>
            </div>
            <div class="paste-modal-footer">
                <button class="btn btn-outline" id="cancelBulkEdit">キャンセル</button>
                <button class="btn btn-primary" id="applyBulkEdit">適用</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('closeBulkEditModal').addEventListener('click', closeBulkEditModal);
    document.getElementById('cancelBulkEdit').addEventListener('click', closeBulkEditModal);
    document.getElementById('applyBulkEdit').addEventListener('click', applyBulkEdit);

    modal.addEventListener('click', (e) => {
        if (e.target.id === 'bulkEditModal') closeBulkEditModal();
    });
}

function openBulkEditModal() {
    const selectedIds = getSelectedRowIds();
    if (selectedIds.length === 0) {
        showToast('編集する行を選択してください', 'error');
        return;
    }

    // フォームをリセット
    document.getElementById('bulkEditProperty').value = '';
    document.getElementById('bulkEditVendor').value = '';
    document.getElementById('bulkEditInspection').value = '';
    document.getElementById('bulkEditStartDate').value = '';
    document.getElementById('bulkEditEndDate').value = '';

    document.getElementById('bulkEditModal').classList.add('active');
}

function closeBulkEditModal() {
    document.getElementById('bulkEditModal').classList.remove('active');
}

function applyBulkEdit() {
    const selectedIds = getSelectedRowIds();
    const property = document.getElementById('bulkEditProperty').value;
    const vendor = document.getElementById('bulkEditVendor').value;
    const inspection = document.getElementById('bulkEditInspection').value;
    const startDate = document.getElementById('bulkEditStartDate').value;
    const endDate = document.getElementById('bulkEditEndDate').value;

    let changedCount = 0;

    selectedIds.forEach(id => {
        const row = rows.find(r => r.id === id);
        const tr = document.querySelector(`tr[data-row-id="${id}"]`);
        if (!row || !tr) return;

        if (property) {
            row.propertyCode = property;
            tr.querySelector('.property-select').value = property;
            updateTerminals(id, property);
        }
        if (vendor) {
            row.vendorName = vendor;
            tr.querySelector('.vendor-select').value = vendor;
        }
        if (inspection) {
            row.inspectionType = inspection;
            tr.querySelector('.inspection-select').value = inspection;
        }
        if (startDate) {
            row.startDate = startDate;
            tr.querySelector('.start-date').value = startDate;
        }
        if (endDate) {
            row.endDate = endDate;
            tr.querySelector('.end-date').value = endDate;
        }

        validateRow(id);
        changedCount++;
    });

    closeBulkEditModal();
    updateStats();
    triggerAutoSave();
    showToast(`${changedCount}件の行を更新しました`, 'success');
}

// ========================================
// 自動保存・復元
// ========================================

function getAutoSaveKey() {
    return `bulk_autosave_${currentUserId}`;
}

function triggerAutoSave() {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(saveAutoSave, 1000);
}

function saveAutoSave() {
    if (rows.length === 0) {
        localStorage.removeItem(getAutoSaveKey());
        return;
    }

    const data = {
        timestamp: Date.now(),
        rowIdCounter: rowIdCounter,
        rows: rows.map(r => ({
            propertyCode: r.propertyCode,
            terminalId: r.terminalId,
            vendorName: r.vendorName,
            inspectionType: r.inspectionType,
            startDate: r.startDate,
            endDate: r.endDate,
            remarks: r.remarks,
            displayTime: r.displayTime
        }))
    };

    localStorage.setItem(getAutoSaveKey(), JSON.stringify(data));
    console.log('Auto-saved', rows.length, 'rows');
}

function restoreAutoSave() {
    try {
        const data = localStorage.getItem(getAutoSaveKey());
        if (!data) return;

        const saved = JSON.parse(data);
        if (!saved.rows || saved.rows.length === 0) return;

        // 24時間以上前のデータは無視
        if (Date.now() - saved.timestamp > 24 * 60 * 60 * 1000) {
            localStorage.removeItem(getAutoSaveKey());
            return;
        }

        if (confirm(`${saved.rows.length}件の未保存データがあります。復元しますか？`)) {
            rowIdCounter = saved.rowIdCounter || 0;
            saved.rows.forEach(rowData => {
                addRow(rowData);
            });
            showToast(`${saved.rows.length}件のデータを復元しました`, 'success');
        } else {
            localStorage.removeItem(getAutoSaveKey());
        }
    } catch (error) {
        console.error('Auto-save restore error:', error);
    }
}

function clearAutoSave() {
    localStorage.removeItem(getAutoSaveKey());
}

// ========================================
// 端末更新
// ========================================

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

// ========================================
// 行の削除
// ========================================

function deleteSelectedRows() {
    const selectedIds = getSelectedRowIds();
    if (selectedIds.length === 0) return;

    if (!confirm(`${selectedIds.length}件の行を削除しますか？`)) return;

    selectedIds.forEach(id => {
        const tr = document.querySelector(`tr[data-row-id="${id}"]`);
        if (tr) tr.remove();
        rows = rows.filter(r => r.id !== id);
    });

    updateRowNumbers();
    updateStats();
    updateEmptyState();
    updateButtons();
    triggerAutoSave();
    document.getElementById('selectAll').checked = false;
}

function updateRowNumbers() {
    const trs = document.querySelectorAll('#tableBody tr');
    trs.forEach((tr, index) => {
        const numCell = tr.querySelector('.col-row-num');
        if (numCell) numCell.textContent = index + 1;
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

    // 一括編集ボタンも更新
    const bulkEditBtn = document.getElementById('bulkEditBtn');
    if (bulkEditBtn) {
        bulkEditBtn.disabled = count === 0;
    }
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
            const propertyCode = parts[0]?.trim();
            const vendorName = parts[1]?.trim();
            const inspectionType = parts[2]?.trim();
            const startDate = parts[3]?.trim() || '';
            const endDate = parts[4]?.trim() || '';
            const remarks = parts[5]?.trim() || '';

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

    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return dateStr;
    }

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
                status: 'pending' // 管理者承認待ち
            };
        });

        await createEntries(entries);
        showToast(`${entries.length}件のデータを保存しました（管理者の承認待ち）`, 'success');

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
        clearAutoSave(); // 自動保存データをクリア

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
// フィルター機能
// ========================================

function applyFilter() {
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
            filterInfo.textContent = `（${visibleCount}件表示中）`;
        }
    }
}

// ========================================
// テンプレート機能
// ========================================

function getTemplateKey() {
    return `bulk_templates_${currentUserId}`;
}

function loadTemplates() {
    const select = document.getElementById('templateSelect');
    if (!select) return;

    const templates = getTemplates();
    select.innerHTML = '<option value="">テンプレートを選択...</option>';

    templates.forEach((template, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = template.name;
        select.appendChild(option);
    });
}

function getTemplates() {
    try {
        const data = localStorage.getItem(getTemplateKey());
        return data ? JSON.parse(data) : [];
    } catch {
        return [];
    }
}

function saveTemplates(templates) {
    localStorage.setItem(getTemplateKey(), JSON.stringify(templates));
}

function openSaveTemplateModal() {
    const lastRow = rows[rows.length - 1];
    if (!lastRow || !lastRow.propertyCode) {
        showToast('テンプレートに保存する行を先に入力してください', 'error');
        return;
    }

    document.getElementById('templateModal').classList.add('active');
    document.getElementById('templateName').value = '';
    document.getElementById('templateName').focus();

    const preview = document.getElementById('templatePreview');
    if (preview) {
        const property = masterData.properties.find(p => p.property_code === lastRow.propertyCode);
        preview.innerHTML = `
            <div><strong>物件:</strong> ${property?.property_name || lastRow.propertyCode}</div>
            <div><strong>受注先:</strong> ${lastRow.vendorName || '未設定'}</div>
            <div><strong>点検種別:</strong> ${lastRow.inspectionType || '未設定'}</div>
            <div><strong>表示秒数:</strong> ${lastRow.displayTime}秒</div>
        `;
    }
}

function closeTemplateModalFn() {
    document.getElementById('templateModal').classList.remove('active');
}

function saveTemplate() {
    const name = document.getElementById('templateName').value.trim();
    if (!name) {
        showToast('テンプレート名を入力してください', 'error');
        return;
    }

    const lastRow = rows[rows.length - 1];
    if (!lastRow) return;

    const template = {
        name: name,
        propertyCode: lastRow.propertyCode,
        terminalId: lastRow.terminalId,
        vendorName: lastRow.vendorName,
        inspectionType: lastRow.inspectionType,
        displayTime: lastRow.displayTime
    };

    const templates = getTemplates();
    templates.push(template);
    saveTemplates(templates);

    loadTemplates();
    closeTemplateModalFn();
    showToast(`テンプレート「${name}」を保存しました`, 'success');
}

function applyTemplate(index) {
    const templates = getTemplates();
    const template = templates[index];
    if (!template) return;

    if (rows.length === 0) {
        addRow(template);
    } else {
        const lastRow = rows[rows.length - 1];
        lastRow.propertyCode = template.propertyCode;
        lastRow.terminalId = template.terminalId;
        lastRow.vendorName = template.vendorName;
        lastRow.inspectionType = template.inspectionType;
        lastRow.displayTime = template.displayTime;

        const tr = document.querySelector(`tr[data-row-id="${lastRow.id}"]`);
        if (tr) {
            tr.querySelector('.property-select').value = template.propertyCode;
            updateTerminals(lastRow.id, template.propertyCode);
            setTimeout(() => {
                tr.querySelector('.terminal-select').value = template.terminalId;
            }, 100);
            tr.querySelector('.vendor-select').value = template.vendorName;
            tr.querySelector('.inspection-select').value = template.inspectionType;
            tr.querySelector('.display-time').value = template.displayTime;
        }
        validateRow(lastRow.id);
    }

    document.getElementById('templateSelect').value = '';
    showToast(`テンプレート「${template.name}」を適用しました`, 'success');
}

// ========================================
// 起動
// ========================================

init();
