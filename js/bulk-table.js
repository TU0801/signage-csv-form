// bulk-table.js - テーブル操作関連

import {
    state, getMasterData, getRows, getRowById, addRowToState,
    removeRowFromState, getNextRowId, getDraggedRow, setDraggedRow,
    getAppSettings
} from './bulk-state.js';

// ========================================
// 行の追加・削除
// ========================================

export function addRowWithCopy(callbacks) {
    const rows = getRows();
    if (rows.length === 0) {
        addRow({}, callbacks);
    } else {
        const lastRow = rows[rows.length - 1];
        addRow({
            propertyCode: lastRow.propertyCode,
            terminalId: lastRow.terminalId,
            vendorName: lastRow.vendorName,
            inspectionType: lastRow.inspectionType,
            startDate: lastRow.startDate,
            endDate: lastRow.endDate,
            remarks: '',
            displayTime: lastRow.displayTime,
            position: lastRow.position
        }, callbacks);
    }
}

export function duplicateSelectedRows(callbacks) {
    const selectedIds = getSelectedRowIds();
    if (selectedIds.length === 0) {
        callbacks.showToast('複製する行を選択してください', 'error');
        return;
    }

    const rows = getRows();
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
                displayTime: sourceRow.displayTime,
                noticeText: sourceRow.noticeText,
                displayStartDate: sourceRow.displayStartDate,
                displayStartTime: sourceRow.displayStartTime,
                displayEndDate: sourceRow.displayEndDate,
                displayEndTime: sourceRow.displayEndTime,
                showOnBoard: sourceRow.showOnBoard,
                position: sourceRow.position
            }, callbacks);
        }
    });

    callbacks.showToast(`${selectedIds.length}件の行を複製しました`, 'success');
    document.getElementById('selectAll').checked = false;
}

export function addRow(data = {}, callbacks) {
    const masterData = getMasterData();
    const rows = getRows();
    const rowId = getNextRowId();
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
        noticeText: data.noticeText || '',
        displayStartDate: data.displayStartDate || '',
        displayStartTime: data.displayStartTime || '',
        displayEndDate: data.displayEndDate || '',
        displayEndTime: data.displayEndTime || '',
        showOnBoard: data.showOnBoard !== undefined ? data.showOnBoard : true,
        position: data.position !== undefined ? data.position : 2,
        isValid: false,
        errors: []
    };

    addRowToState(row);
    renderRow(row, callbacks);

    // インポート時のプロパティが設定されている場合は端末リストを更新
    if (row.propertyCode) {
        updateTerminals(rowId, row.propertyCode, true);
    }

    validateRow(rowId, callbacks);
    callbacks.updateStats();
    callbacks.updateEmptyState();
    callbacks.updateButtons();
    callbacks.triggerAutoSave();

    return rowId;
}

export function renderRow(row, callbacks) {
    const masterData = getMasterData();
    const rows = getRows();
    const tbody = document.getElementById('tableBody');
    const tr = document.createElement('tr');
    tr.dataset.rowId = row.id;
    tr.draggable = true;

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
                <input type="text" class="searchable-input property-search" placeholder="物件名で検索..." data-row-id="${row.id}">
                <select class="property-select" data-row-id="${row.id}">
                    <option value="">-- 物件を選択 --</option>
                    ${uniqueProperties.map(p =>
                        `<option value="${p.property_code}" ${String(row.propertyCode) === String(p.property_code) ? 'selected' : ''}>${p.property_code} ${p.property_name}</option>`
                    ).join('')}
                </select>
            </div>
        </td>
        <td class="col-terminal">
            <select class="terminal-select" data-row-id="${row.id}">
                <option value="">-- 端末 --</option>
            </select>
        </td>
        <td class="col-vendor">
            <div class="searchable-select-container">
                <input type="text" class="searchable-input vendor-search" placeholder="受注先名で検索..." data-row-id="${row.id}">
                <select class="vendor-select" data-row-id="${row.id}">
                    <option value="">-- 受注先を選択 --</option>
                    ${masterData.vendors.map(v =>
                        `<option value="${v.vendor_name}" ${row.vendorName === v.vendor_name ? 'selected' : ''}>${v.vendor_name}</option>`
                    ).join('')}
                </select>
            </div>
        </td>
        <td class="col-inspection">
            <div class="searchable-select-container">
                <input type="text" class="searchable-input inspection-search" placeholder="点検種別で検索..." data-row-id="${row.id}">
                <select class="inspection-select" data-row-id="${row.id}">
                    <option value="">-- 点検種別を選択 --</option>
                    ${masterData.inspectionTypes.map(i =>
                        `<option value="${i.inspection_name}" ${row.inspectionType === i.inspection_name ? 'selected' : ''}>${i.inspection_name}</option>`
                    ).join('')}
                </select>
            </div>
        </td>
        <td class="col-date">
            <input type="date" class="start-date" data-row-id="${row.id}" value="${row.startDate}" title="点検開始日">
        </td>
        <td class="col-date">
            <input type="date" class="end-date" data-row-id="${row.id}" value="${row.endDate}" title="点検終了日">
        </td>
        <td class="col-remarks">
            <input type="text" class="remarks-input" data-row-id="${row.id}" value="${row.remarks}" placeholder="任意入力" maxlength="125" title="1行25文字×5行まで">
        </td>
        <td class="col-time">
            <input type="number" class="display-time" data-row-id="${row.id}" value="${row.displayTime}" min="1" max="30" title="表示秒数">
        </td>
        <td class="col-detail">
            <button class="btn-detail" data-row-id="${row.id}" title="案内文・表示期間を設定">
                ${row.noticeText || row.displayStartDate ? '✓' : '⋯'}
            </button>
        </td>
        <td class="col-status">
            <span class="status-badge ok" data-row-id="${row.id}">OK</span>
        </td>
    `;

    tbody.appendChild(tr);
    setupRowEventListeners(tr, row.id, callbacks);

    if (row.propertyCode) {
        // 復元時は既存の端末選択を保持
        updateTerminals(row.id, row.propertyCode, true);
    }
}

export function setupRowEventListeners(tr, rowId, callbacks) {
    const rows = getRows();

    tr.querySelector('.row-checkbox').addEventListener('change', () => updateSelectedCount(callbacks));

    tr.addEventListener('dragstart', handleDragStart);
    tr.addEventListener('dragend', handleDragEnd);
    tr.addEventListener('dragover', handleDragOver);
    tr.addEventListener('drop', (e) => handleDrop(e, callbacks));

    tr.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        callbacks.showContextMenu(e, rowId);
    });

    const propertySearch = tr.querySelector('.property-search');
    const propertySelect = tr.querySelector('.property-select');
    setupSearchableSelect(propertySearch, propertySelect);

    const vendorSearch = tr.querySelector('.vendor-search');
    const vendorSelect = tr.querySelector('.vendor-select');
    setupSearchableSelect(vendorSearch, vendorSelect);

    const inspectionSearch = tr.querySelector('.inspection-search');
    const inspectionSelect = tr.querySelector('.inspection-select');
    setupSearchableSelect(inspectionSearch, inspectionSelect);

    propertySelect.addEventListener('change', (e) => {
        const row = getRowById(rowId);
        if (row) {
            row.propertyCode = e.target.value;
            updateTerminals(rowId, e.target.value);
            validateRow(rowId, callbacks);
            callbacks.triggerAutoSave();
        }
    });

    tr.querySelector('.terminal-select').addEventListener('change', (e) => {
        const row = getRowById(rowId);
        if (row) {
            row.terminalId = e.target.value;
            validateRow(rowId, callbacks);
            callbacks.triggerAutoSave();
        }
    });

    vendorSelect.addEventListener('change', (e) => {
        const row = getRowById(rowId);
        if (row) {
            row.vendorName = e.target.value;
            validateRow(rowId, callbacks);
            callbacks.triggerAutoSave();
        }
    });

    inspectionSelect.addEventListener('change', (e) => {
        const row = getRowById(rowId);
        if (row) {
            row.inspectionType = e.target.value;
            validateRow(rowId, callbacks);
            callbacks.triggerAutoSave();
        }
    });

    tr.querySelector('.start-date').addEventListener('change', (e) => {
        const row = getRowById(rowId);
        if (row) {
            row.startDate = e.target.value;
            if (!row.endDate && e.target.value) {
                row.endDate = e.target.value;
                tr.querySelector('.end-date').value = e.target.value;
            }
            validateRow(rowId, callbacks);
            callbacks.triggerAutoSave();
        }
    });

    tr.querySelector('.end-date').addEventListener('change', (e) => {
        const row = getRowById(rowId);
        if (row) {
            row.endDate = e.target.value;
            validateRow(rowId, callbacks);
            callbacks.triggerAutoSave();
        }
    });

    tr.querySelector('.remarks-input').addEventListener('input', (e) => {
        const row = getRowById(rowId);
        if (row) {
            row.remarks = e.target.value;
            callbacks.triggerAutoSave();
        }
    });

    tr.querySelector('.display-time').addEventListener('change', (e) => {
        const row = getRowById(rowId);
        if (row) {
            row.displayTime = parseInt(e.target.value) || 6;
            callbacks.triggerAutoSave();
        }
    });

    tr.querySelector('.btn-detail').addEventListener('click', (e) => {
        e.preventDefault();
        callbacks.openRowDetailModal(rowId);
    });

    tr.querySelectorAll('input, select, textarea').forEach(el => {
        el.addEventListener('keydown', (e) => handleCellKeyDown(e, rowId, callbacks));
    });
}

// ========================================
// 検索付きドロップダウン
// ========================================

export function setupSearchableSelect(searchInput, select) {
    select.addEventListener('focus', () => {
        searchInput.classList.add('active');
        select.classList.add('expanded');
        select.size = Math.min(select.options.length, 8);
        setTimeout(() => searchInput.focus(), 50);
    });

    searchInput.addEventListener('input', (e) => {
        const searchText = e.target.value.toLowerCase();
        const options = select.options;
        for (let i = 0; i < options.length; i++) {
            const optionText = options[i].text.toLowerCase();
            options[i].style.display = optionText.includes(searchText) ? '' : 'none';
        }
    });

    searchInput.addEventListener('blur', () => {
        setTimeout(() => {
            if (!select.matches(':focus')) {
                closeSearchableSelect(searchInput, select);
            }
        }, 200);
    });

    select.addEventListener('click', (e) => {
        if (select.size > 1 && select.value) {
            setTimeout(() => {
                select.dispatchEvent(new Event('change', { bubbles: true }));
            }, 10);
        }
    });

    select.addEventListener('change', () => {
        searchInput.value = '';
        closeSearchableSelect(searchInput, select);
        const nextInput = select.closest('td')?.nextElementSibling?.querySelector('input, select');
        if (nextInput) nextInput.focus();
    });

    select.addEventListener('blur', () => {
        setTimeout(() => {
            if (!searchInput.matches(':focus')) {
                closeSearchableSelect(searchInput, select);
            }
        }, 200);
    });

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeSearchableSelect(searchInput, select);
            select.focus();
        }
        if (e.key === 'Enter') {
            e.preventDefault();
            const visibleOptions = Array.from(select.options).filter(opt => opt.style.display !== 'none' && opt.value);
            if (visibleOptions.length > 0) {
                select.value = visibleOptions[0].value;
                select.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
    });
}

function closeSearchableSelect(searchInput, select) {
    searchInput.classList.remove('active');
    searchInput.value = '';
    select.classList.remove('expanded');
    select.size = 1;
    for (let i = 0; i < select.options.length; i++) {
        select.options[i].style.display = '';
    }
}

// ========================================
// ドラッグ&ドロップ
// ========================================

function handleDragStart(e) {
    const row = e.target.closest('tr');
    setDraggedRow(row);
    row.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
    const draggedRow = getDraggedRow();
    if (draggedRow) {
        draggedRow.classList.remove('dragging');
        setDraggedRow(null);
    }
    document.querySelectorAll('#tableBody tr').forEach(tr => {
        tr.classList.remove('drag-over');
    });
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const draggedRow = getDraggedRow();
    const tr = e.target.closest('tr');
    if (tr && tr !== draggedRow) {
        document.querySelectorAll('#tableBody tr').forEach(row => {
            row.classList.remove('drag-over');
        });
        tr.classList.add('drag-over');
    }
}

function handleDrop(e, callbacks) {
    e.preventDefault();
    const draggedRow = getDraggedRow();
    const targetTr = e.target.closest('tr');
    if (!targetTr || targetTr === draggedRow) return;

    const tbody = document.getElementById('tableBody');
    const allRows = Array.from(tbody.querySelectorAll('tr'));
    const draggedIndex = allRows.indexOf(draggedRow);
    const targetIndex = allRows.indexOf(targetTr);

    if (draggedIndex < targetIndex) {
        targetTr.after(draggedRow);
    } else {
        targetTr.before(draggedRow);
    }

    const rows = getRows();
    const draggedRowId = parseInt(draggedRow.dataset.rowId);
    const rowData = rows.find(r => r.id === draggedRowId);
    const filteredRows = rows.filter(r => r.id !== draggedRowId);

    const targetRowId = parseInt(targetTr.dataset.rowId);
    const targetDataIndex = filteredRows.findIndex(r => r.id === targetRowId);

    if (draggedIndex < targetIndex) {
        filteredRows.splice(targetDataIndex + 1, 0, rowData);
    } else {
        filteredRows.splice(targetDataIndex, 0, rowData);
    }

    state.rows = filteredRows;
    updateRowNumbers();
    callbacks.triggerAutoSave();
    callbacks.showToast('行の順序を変更しました', 'success');
}

// ========================================
// バリデーション
// ========================================

export function validateRow(rowId, callbacks) {
    const row = getRowById(rowId);
    if (!row) return;

    const settings = getAppSettings();
    row.errors = [];

    // 必須フィールドのチェック
    if (!row.propertyCode) row.errors.push('物件');
    if (!row.vendorName) row.errors.push('受注先');
    if (!row.inspectionType) row.errors.push('点検種別');

    // 表示時間のチェック
    const displayTimeMax = settings.display_time_max || 30;
    if (row.displayTime && row.displayTime > displayTimeMax) {
        row.errors.push(`表示時間(${displayTimeMax}秒以下)`);
    }

    // 掲示備考のチェック
    if (row.remarks) {
        const remarksMaxLines = settings.remarks_max_lines || 5;
        const remarksCharsPerLine = settings.remarks_chars_per_line || 25;
        const lines = row.remarks.split('\n');

        if (lines.length > remarksMaxLines) {
            row.errors.push(`備考行数(${remarksMaxLines}行以下)`);
        }

        const longLines = lines.filter(line => line.length > remarksCharsPerLine);
        if (longLines.length > 0) {
            row.errors.push(`備考文字数(1行${remarksCharsPerLine}文字以下)`);
        }
    }

    // 案内文のチェック
    if (row.noticeText) {
        const noticeTextMaxChars = settings.notice_text_max_chars || 200;
        if (row.noticeText.length > noticeTextMaxChars) {
            row.errors.push(`案内文(${noticeTextMaxChars}文字以下)`);
        }
    }

    row.isValid = row.errors.length === 0;

    const tr = document.querySelector(`tr[data-row-id="${rowId}"]`);
    if (tr) {
        const badge = tr.querySelector('.status-badge');
        if (row.isValid) {
            badge.textContent = 'OK';
            badge.className = 'status-badge ok';
            badge.title = '';
        } else {
            badge.textContent = 'エラー';
            badge.className = 'status-badge error';
            badge.title = `エラー: ${row.errors.join(', ')}`;
        }
    }

    if (callbacks && callbacks.updateStats) {
        callbacks.updateStats();
    }
    if (callbacks && callbacks.updateButtons) {
        callbacks.updateButtons();
    }
}

// ========================================
// ユーティリティ
// ========================================

export function getSelectedRowIds() {
    const checkboxes = document.querySelectorAll('#tableBody input[type="checkbox"]:checked');
    return Array.from(checkboxes).map(cb => parseInt(cb.dataset.rowId));
}

export function updateSelectedCount(callbacks) {
    const count = getSelectedRowIds().length;
    document.getElementById('selectedCount').textContent = count;

    const deleteBtn = document.getElementById('deleteSelectedBtn');
    const bulkEditBtn = document.getElementById('bulkEditBtn');
    if (deleteBtn) deleteBtn.disabled = count === 0;
    if (bulkEditBtn) bulkEditBtn.disabled = count === 0;
}

export function updateRowNumbers() {
    const rows = getRows();
    document.querySelectorAll('#tableBody tr').forEach((tr, index) => {
        const numCell = tr.querySelector('.col-row-num');
        if (numCell) numCell.textContent = index + 1;
    });
}

export function deleteSelectedRows(callbacks) {
    const selectedIds = getSelectedRowIds();
    if (selectedIds.length === 0) {
        callbacks.showToast('削除する行を選択してください', 'error');
        return;
    }

    if (!confirm(`${selectedIds.length}件の行を削除しますか？`)) return;

    selectedIds.forEach(id => {
        const tr = document.querySelector(`tr[data-row-id="${id}"]`);
        if (tr) tr.remove();
        removeRowFromState(id);
    });

    updateRowNumbers();
    callbacks.updateStats();
    callbacks.updateEmptyState();
    callbacks.updateButtons();
    callbacks.triggerAutoSave();
    callbacks.showToast(`${selectedIds.length}件の行を削除しました`, 'success');
    document.getElementById('selectAll').checked = false;
}

export function updateTerminals(rowId, propertyCode, preserveSelection = false) {
    const masterData = getMasterData();
    const tr = document.querySelector(`tr[data-row-id="${rowId}"]`);
    if (!tr) return;

    const terminalSelect = tr.querySelector('.terminal-select');
    const row = getRowById(rowId);
    const currentTerminalId = row?.terminalId;

    terminalSelect.innerHTML = '<option value="">-- 端末 --</option>';

    // 型を揃えて比較（文字列同士で比較）
    const propCodeStr = String(propertyCode);
    const property = masterData.properties.find(p => String(p.property_code) === propCodeStr);

    if (property) {
        // terminalsはJSON配列形式（文字列または配列）
        let terminals = property.terminals;
        if (typeof terminals === 'string') {
            try {
                terminals = JSON.parse(terminals);
            } catch (e) {
                terminals = [];
            }
        }
        if (!Array.isArray(terminals)) {
            terminals = [];
        }

        if (terminals.length > 0) {
            terminals.forEach(terminalId => {
                const opt = document.createElement('option');
                opt.value = terminalId;
                opt.textContent = terminalId;
                terminalSelect.appendChild(opt);
            });

            // 既存の選択を保持するか、最初の端末を自動選択
            if (preserveSelection && currentTerminalId && terminals.includes(currentTerminalId)) {
                terminalSelect.value = currentTerminalId;
            } else {
                terminalSelect.value = terminals[0];
                if (row) row.terminalId = terminals[0];
            }
        }
    }
}

function handleCellKeyDown(e, rowId, callbacks) {
    const rows = getRows();
    const currentRowIndex = rows.findIndex(r => r.id === rowId);

    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const nextInput = e.target.closest('td')?.nextElementSibling?.querySelector('input, select');
        if (nextInput) {
            nextInput.focus();
        } else if (currentRowIndex === rows.length - 1) {
            addRowWithCopy(callbacks);
        }
    }

    if (e.key === 'ArrowDown' && e.altKey) {
        e.preventDefault();
        const nextTr = document.querySelector(`tr[data-row-id="${rowId}"]`)?.nextElementSibling;
        if (nextTr) {
            const sameInput = nextTr.querySelector(`.${e.target.className.split(' ')[0]}`);
            if (sameInput) sameInput.focus();
        }
    }

    if (e.key === 'ArrowUp' && e.altKey) {
        e.preventDefault();
        const prevTr = document.querySelector(`tr[data-row-id="${rowId}"]`)?.previousElementSibling;
        if (prevTr) {
            const sameInput = prevTr.querySelector(`.${e.target.className.split(' ')[0]}`);
            if (sameInput) sameInput.focus();
        }
    }
}

export function insertRowAt(index, callbacks) {
    const rows = getRows();
    const rowId = getNextRowId();
    const newRow = {
        id: rowId,
        propertyCode: '',
        terminalId: '',
        vendorName: '',
        inspectionType: '',
        startDate: '',
        endDate: '',
        remarks: '',
        displayTime: 6,
        noticeText: '',
        displayStartDate: '',
        displayStartTime: '',
        displayEndDate: '',
        displayEndTime: '',
        showOnBoard: true,
        position: 2,
        isValid: false,
        errors: []
    };

    rows.splice(index, 0, newRow);

    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';
    rows.forEach(row => renderRow(row, callbacks));
    rows.forEach(row => validateRow(row.id, callbacks));

    callbacks.updateStats();
    callbacks.triggerAutoSave();
    callbacks.showToast('行を挿入しました', 'success');
}
