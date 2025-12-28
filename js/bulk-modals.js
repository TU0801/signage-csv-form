// bulk-modals.js - モーダル関連

import {
    getMasterData, getRows, getRowById,
    getCurrentDetailRowId, setCurrentDetailRowId
} from './bulk-state.js';
import { addRow, updateTerminals, validateRow, insertRowAt, getSelectedRowIds } from './bulk-table.js';

let copiedRowData = null;

// ========================================
// 右クリックメニュー
// ========================================

export function createContextMenu(callbacks) {
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
        handleContextMenuAction(action, rowId, callbacks);
        hideContextMenu();
    });
}

export function showContextMenu(e, rowId) {
    const menu = document.getElementById('contextMenu');
    menu.dataset.rowId = rowId;
    menu.style.left = e.pageX + 'px';
    menu.style.top = e.pageY + 'px';
    menu.classList.add('active');
}

export function hideContextMenu() {
    const menu = document.getElementById('contextMenu');
    if (menu) menu.classList.remove('active');
}

function handleContextMenuAction(action, rowId, callbacks) {
    const rows = getRows();
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
                    displayTime: row.displayTime,
                    noticeText: row.noticeText,
                    displayStartDate: row.displayStartDate,
                    displayStartTime: row.displayStartTime,
                    displayEndDate: row.displayEndDate,
                    displayEndTime: row.displayEndTime,
                    showOnBoard: row.showOnBoard
                }, callbacks);
                callbacks.showToast('行を複製しました', 'success');
            }
            break;

        case 'insertAbove':
            insertRowAt(rowIndex, callbacks);
            break;

        case 'insertBelow':
            insertRowAt(rowIndex + 1, callbacks);
            break;

        case 'copyRow':
            if (row) {
                copiedRowData = { ...row };
                callbacks.showToast('行をコピーしました', 'success');
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
                    displayTime: copiedRowData.displayTime,
                    noticeText: copiedRowData.noticeText,
                    displayStartDate: copiedRowData.displayStartDate,
                    displayStartTime: copiedRowData.displayStartTime,
                    displayEndDate: copiedRowData.displayEndDate,
                    displayEndTime: copiedRowData.displayEndTime,
                    showOnBoard: copiedRowData.showOnBoard
                }, callbacks);
                callbacks.showToast('行をペーストしました', 'success');
            } else {
                callbacks.showToast('コピーされた行がありません', 'error');
            }
            break;

        case 'selectAll':
            document.querySelectorAll('#tableBody input[type="checkbox"]').forEach(cb => cb.checked = true);
            document.getElementById('selectAll').checked = true;
            callbacks.updateSelectedCount();
            break;

        case 'deselectAll':
            document.querySelectorAll('#tableBody input[type="checkbox"]').forEach(cb => cb.checked = false);
            document.getElementById('selectAll').checked = false;
            callbacks.updateSelectedCount();
            break;

        case 'delete':
            if (confirm('この行を削除しますか？')) {
                const tr = document.querySelector(`tr[data-row-id="${rowId}"]`);
                if (tr) tr.remove();
                rows.splice(rowIndex, 1);
                callbacks.updateRowNumbers();
                callbacks.updateStats();
                callbacks.updateEmptyState();
                callbacks.updateButtons();
                callbacks.triggerAutoSave();
                callbacks.showToast('行を削除しました', 'success');
            }
            break;
    }
}

// ========================================
// 一括編集モーダル
// ========================================

export function createBulkEditModal(callbacks) {
    const masterData = getMasterData();
    const modal = document.createElement('div');
    modal.id = 'bulkEditModal';
    modal.className = 'modal-overlay';

    const uniqueProperties = [...new Map(
        masterData.properties.map(p => [p.property_code, p])
    ).values()];

    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>選択行を一括編集</h3>
                <button class="modal-close" id="closeBulkEditModal">&times;</button>
            </div>
            <div class="modal-body">
                <p class="modal-description">
                    選択した行のフィールドを一括で変更できます。変更しない項目は空のままにしてください。
                </p>

                <div class="bulk-edit-grid">
                    <div class="form-group">
                        <label>物件</label>
                        <select id="bulkEditProperty" class="form-control">
                            <option value="">変更しない</option>
                            ${uniqueProperties.map(p =>
                                `<option value="${p.property_code}">${p.property_code} ${p.property_name}</option>`
                            ).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>受注先</label>
                        <select id="bulkEditVendor" class="form-control">
                            <option value="">変更しない</option>
                            ${masterData.vendors.map(v =>
                                `<option value="${v.vendor_name}">${v.vendor_name}</option>`
                            ).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>点検種別</label>
                        <select id="bulkEditInspection" class="form-control">
                            <option value="">変更しない</option>
                            ${masterData.inspectionTypes.map(i =>
                                `<option value="${i.inspection_name}">${i.inspection_name}</option>`
                            ).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>点検開始日</label>
                        <input type="date" id="bulkEditStartDate" class="form-control">
                    </div>
                    <div class="form-group">
                        <label>点検終了日</label>
                        <input type="date" id="bulkEditEndDate" class="form-control">
                    </div>
                </div>

                <div class="bulk-edit-section">
                    <h4>案内文・表示期間</h4>
                    <div class="form-group">
                        <label>掲示板用案内文</label>
                        <textarea id="bulkEditNoticeText" class="form-control" rows="2"
                            placeholder="変更しない場合は空のまま"></textarea>
                    </div>
                    <div class="bulk-edit-grid">
                        <div class="form-group">
                            <label>表示開始日</label>
                            <input type="date" id="bulkEditDisplayStartDate" class="form-control">
                        </div>
                        <div class="form-group">
                            <label>表示開始時間</label>
                            <input type="time" id="bulkEditDisplayStartTime" class="form-control">
                        </div>
                        <div class="form-group">
                            <label>表示終了日</label>
                            <input type="date" id="bulkEditDisplayEndDate" class="form-control">
                        </div>
                        <div class="form-group">
                            <label>表示終了時間</label>
                            <input type="time" id="bulkEditDisplayEndTime" class="form-control">
                        </div>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-outline" id="cancelBulkEdit">キャンセル</button>
                <button class="btn btn-primary" id="applyBulkEdit">適用</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('closeBulkEditModal').addEventListener('click', closeBulkEditModal);
    document.getElementById('cancelBulkEdit').addEventListener('click', closeBulkEditModal);
    document.getElementById('applyBulkEdit').addEventListener('click', () => applyBulkEdit(callbacks));

    modal.addEventListener('click', (e) => {
        if (e.target.id === 'bulkEditModal') closeBulkEditModal();
    });
}

export function openBulkEditModal(callbacks) {
    const selectedIds = getSelectedRowIds();
    if (selectedIds.length === 0) {
        callbacks.showToast('編集する行を選択してください', 'error');
        return;
    }

    document.getElementById('bulkEditProperty').value = '';
    document.getElementById('bulkEditVendor').value = '';
    document.getElementById('bulkEditInspection').value = '';
    document.getElementById('bulkEditStartDate').value = '';
    document.getElementById('bulkEditEndDate').value = '';
    document.getElementById('bulkEditNoticeText').value = '';
    document.getElementById('bulkEditDisplayStartDate').value = '';
    document.getElementById('bulkEditDisplayStartTime').value = '';
    document.getElementById('bulkEditDisplayEndDate').value = '';
    document.getElementById('bulkEditDisplayEndTime').value = '';

    document.getElementById('bulkEditModal').classList.add('active');
}

export function closeBulkEditModal() {
    document.getElementById('bulkEditModal').classList.remove('active');
}

function applyBulkEdit(callbacks) {
    const selectedIds = getSelectedRowIds();
    const property = document.getElementById('bulkEditProperty').value;
    const vendor = document.getElementById('bulkEditVendor').value;
    const inspection = document.getElementById('bulkEditInspection').value;
    const startDate = document.getElementById('bulkEditStartDate').value;
    const endDate = document.getElementById('bulkEditEndDate').value;
    const noticeText = document.getElementById('bulkEditNoticeText').value;
    const displayStartDate = document.getElementById('bulkEditDisplayStartDate').value;
    const displayStartTime = document.getElementById('bulkEditDisplayStartTime').value;
    const displayEndDate = document.getElementById('bulkEditDisplayEndDate').value;
    const displayEndTime = document.getElementById('bulkEditDisplayEndTime').value;

    let changedCount = 0;

    selectedIds.forEach(id => {
        const row = getRowById(id);
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
        if (noticeText) {
            row.noticeText = noticeText;
        }
        if (displayStartDate) {
            row.displayStartDate = displayStartDate;
        }
        if (displayStartTime) {
            row.displayStartTime = displayStartTime;
        }
        if (displayEndDate) {
            row.displayEndDate = displayEndDate;
        }
        if (displayEndTime) {
            row.displayEndTime = displayEndTime;
        }

        const detailBtn = tr.querySelector('.btn-detail');
        if (detailBtn) {
            detailBtn.textContent = row.noticeText || row.displayStartDate ? '✓' : '⋯';
            detailBtn.classList.toggle('has-data', !!(row.noticeText || row.displayStartDate));
        }

        validateRow(id, callbacks);
        changedCount++;
    });

    closeBulkEditModal();
    callbacks.updateStats();
    callbacks.triggerAutoSave();
    callbacks.showToast(`${changedCount}件の行を更新しました`, 'success');
}

// ========================================
// 行詳細設定モーダル
// ========================================

export function createRowDetailModal(callbacks) {
    const modal = document.createElement('div');
    modal.id = 'rowDetailModal';
    modal.className = 'modal-overlay';

    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>詳細設定 <span id="detailRowNum"></span></h3>
                <button class="modal-close" id="closeRowDetailModal">&times;</button>
            </div>
            <div class="modal-body">
                <div class="detail-section">
                    <h4>掲示板用案内文</h4>
                    <textarea id="detailNoticeText" class="form-control" rows="3" maxlength="200"
                        placeholder="例：エレベーター点検のため、一時的に停止いたします。"></textarea>
                    <div class="char-counter"><span id="noticeTextCount">0</span>/200</div>
                </div>

                <div class="detail-section">
                    <h4>表示期間</h4>
                    <p class="modal-description">サイネージへの表示開始・終了日時を設定します（任意）</p>
                    <div class="form-row-inline">
                        <div class="form-group">
                            <label>表示開始</label>
                            <div class="datetime-inputs">
                                <input type="date" id="detailDisplayStartDate" class="form-control">
                                <input type="time" id="detailDisplayStartTime" class="form-control">
                            </div>
                        </div>
                        <div class="form-group">
                            <label>表示終了</label>
                            <div class="datetime-inputs">
                                <input type="date" id="detailDisplayEndDate" class="form-control">
                                <input type="time" id="detailDisplayEndTime" class="form-control">
                            </div>
                        </div>
                    </div>
                </div>

                <div class="detail-section">
                    <h4>その他の設定</h4>
                    <label class="checkbox-item">
                        <input type="checkbox" id="detailShowOnBoard" checked>
                        掲示板に表示する
                    </label>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-outline" id="cancelRowDetail">キャンセル</button>
                <button class="btn btn-primary" id="applyRowDetail">保存</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('closeRowDetailModal').addEventListener('click', closeRowDetailModal);
    document.getElementById('cancelRowDetail').addEventListener('click', closeRowDetailModal);
    document.getElementById('applyRowDetail').addEventListener('click', () => applyRowDetail(callbacks));

    // 文字数カウンター
    const noticeTextarea = document.getElementById('detailNoticeText');
    const noticeCount = document.getElementById('noticeTextCount');
    noticeTextarea.addEventListener('input', () => {
        noticeCount.textContent = noticeTextarea.value.length;
    });

    modal.addEventListener('click', (e) => {
        if (e.target.id === 'rowDetailModal') closeRowDetailModal();
    });
}

export function openRowDetailModal(rowId, callbacks) {
    setCurrentDetailRowId(rowId);
    const rows = getRows();
    const row = rows.find(r => r.id === rowId);
    if (!row) return;

    if (!document.getElementById('rowDetailModal')) {
        createRowDetailModal(callbacks);
    }

    const rowIndex = rows.indexOf(row) + 1;
    document.getElementById('detailRowNum').textContent = `(行 ${rowIndex})`;

    // 案内文は点検種別のデフォルトテキストをフォールバック
    let noticeText = row.noticeText || '';
    if (!noticeText && row.inspectionType) {
        const masterData = getMasterData();
        const inspection = masterData.inspectionTypes.find(i => i.inspection_name === row.inspectionType);
        if (inspection && inspection.default_text) {
            noticeText = inspection.default_text;
        }
    }
    document.getElementById('detailNoticeText').value = noticeText;
    document.getElementById('noticeTextCount').textContent = noticeText.length;

    // 表示開始日は点検開始日をデフォルト
    document.getElementById('detailDisplayStartDate').value = row.displayStartDate || row.startDate || '';
    document.getElementById('detailDisplayStartTime').value = row.displayStartTime || '';

    // 表示終了日は点検終了日をデフォルト
    document.getElementById('detailDisplayEndDate').value = row.displayEndDate || row.endDate || '';
    document.getElementById('detailDisplayEndTime').value = row.displayEndTime || '';

    document.getElementById('detailShowOnBoard').checked = row.showOnBoard !== false;

    document.getElementById('rowDetailModal').classList.add('active');
}

export function closeRowDetailModal() {
    const modal = document.getElementById('rowDetailModal');
    if (modal) modal.classList.remove('active');
    setCurrentDetailRowId(null);
}

function applyRowDetail(callbacks) {
    const currentDetailRowId = getCurrentDetailRowId();
    if (!currentDetailRowId) return;

    const row = getRowById(currentDetailRowId);
    if (!row) return;

    row.noticeText = document.getElementById('detailNoticeText').value;
    row.displayStartDate = document.getElementById('detailDisplayStartDate').value;
    row.displayStartTime = document.getElementById('detailDisplayStartTime').value;
    row.displayEndDate = document.getElementById('detailDisplayEndDate').value;
    row.displayEndTime = document.getElementById('detailDisplayEndTime').value;
    row.showOnBoard = document.getElementById('detailShowOnBoard').checked;

    const tr = document.querySelector(`tr[data-row-id="${currentDetailRowId}"]`);
    if (tr) {
        const detailBtn = tr.querySelector('.btn-detail');
        if (detailBtn) {
            detailBtn.textContent = row.noticeText || row.displayStartDate ? '✓' : '⋯';
            detailBtn.classList.toggle('has-data', !!(row.noticeText || row.displayStartDate));
        }
    }

    closeRowDetailModal();
    callbacks.triggerAutoSave();
    callbacks.showToast('詳細設定を保存しました', 'success');
}

// ========================================
// ペーストモーダル
// ========================================

export function openPasteModal() {
    document.getElementById('pasteModal').classList.add('active');
    document.getElementById('pasteArea').value = '';
    document.getElementById('pasteArea').focus();
}

export function closePasteModal() {
    document.getElementById('pasteModal').classList.remove('active');
}

export function importFromPaste(callbacks) {
    const text = document.getElementById('pasteArea').value.trim();
    if (!text) {
        callbacks.showToast('データを入力してください', 'error');
        return;
    }

    const masterData = getMasterData();
    const lines = text.split('\n');
    let importCount = 0;
    let errorCount = 0;

    lines.forEach(line => {
        const cols = line.split('\t');
        if (cols.length < 3) {
            errorCount++;
            return;
        }

        const propertyCode = cols[0]?.trim() || '';
        const vendorName = cols[1]?.trim() || '';
        const inspectionType = cols[2]?.trim() || '';
        const startDate = cols[3]?.trim() || '';
        const endDate = cols[4]?.trim() || '';
        const remarks = cols[5]?.trim() || '';

        const propertyExists = masterData.properties.some(p => p.property_code === propertyCode);
        const vendorExists = masterData.vendors.some(v => v.vendor_name === vendorName);
        const inspectionExists = masterData.inspectionTypes.some(i => i.inspection_name === inspectionType);

        if (propertyExists || vendorExists || inspectionExists || propertyCode) {
            addRow({
                propertyCode,
                vendorName,
                inspectionType,
                startDate: formatDateForInput(startDate),
                endDate: formatDateForInput(endDate),
                remarks
            }, callbacks);
            importCount++;
        } else {
            errorCount++;
        }
    });

    closePasteModal();
    if (importCount > 0) {
        callbacks.showToast(`${importCount}件のデータを取り込みました`, 'success');
    }
    if (errorCount > 0) {
        callbacks.showToast(`${errorCount}件のデータをスキップしました`, 'error');
    }
}

function formatDateForInput(dateStr) {
    if (!dateStr) return '';
    const match = dateStr.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (match) {
        return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
    }
    return '';
}

// ========================================
// テンプレートモーダル
// ========================================

export function openSaveTemplateModal() {
    document.getElementById('templateName').value = '';
    document.getElementById('templateModal').classList.add('active');
}

export function closeTemplateModal() {
    document.getElementById('templateModal').classList.remove('active');
}

export function saveTemplate(callbacks) {
    const rows = getRows();
    const name = document.getElementById('templateName').value.trim();
    if (!name) {
        callbacks.showToast('テンプレート名を入力してください', 'error');
        return;
    }

    if (rows.length === 0) {
        callbacks.showToast('保存するデータがありません', 'error');
        return;
    }

    const templates = JSON.parse(localStorage.getItem('bulk_templates') || '{}');
    templates[name] = {
        createdAt: Date.now(),
        rows: rows.map(r => ({
            propertyCode: r.propertyCode,
            terminalId: r.terminalId,
            vendorName: r.vendorName,
            inspectionType: r.inspectionType,
            displayTime: r.displayTime,
            noticeText: r.noticeText,
            displayStartDate: r.displayStartDate,
            displayStartTime: r.displayStartTime,
            displayEndDate: r.displayEndDate,
            displayEndTime: r.displayEndTime,
            showOnBoard: r.showOnBoard
        }))
    };

    localStorage.setItem('bulk_templates', JSON.stringify(templates));
    closeTemplateModal();
    callbacks.loadTemplates();
    callbacks.showToast(`テンプレート「${name}」を保存しました`, 'success');
}

export function loadTemplates() {
    const templates = JSON.parse(localStorage.getItem('bulk_templates') || '{}');
    const select = document.getElementById('templateSelect');
    select.innerHTML = '<option value="">テンプレート</option>';

    Object.keys(templates).forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
    });
}

export function applyTemplate(name, callbacks) {
    const templates = JSON.parse(localStorage.getItem('bulk_templates') || '{}');
    const template = templates[name];
    if (!template) return;

    if (getRows().length > 0) {
        if (!confirm('現在のデータを置き換えますか？')) {
            document.getElementById('templateSelect').value = '';
            return;
        }
    }

    document.getElementById('tableBody').innerHTML = '';
    callbacks.clearRows();

    template.rows.forEach(rowData => {
        addRow(rowData, callbacks);
    });

    document.getElementById('templateSelect').value = '';
    callbacks.showToast(`テンプレート「${name}」を適用しました`, 'success');
}
