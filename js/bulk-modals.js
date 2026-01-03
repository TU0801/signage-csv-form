// bulk-modals.js - モーダル関連

import {
    getMasterData, getRows, getRowById,
    getCurrentDetailRowId, setCurrentDetailRowId, getCurrentVendor
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
                    // vendorName は getCurrentVendor() から自動設定される
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
                    showOnBoard: row.showOnBoard,
                    position: row.position
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
                    // vendorName は getCurrentVendor() から自動設定される
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
                    showOnBoard: copiedRowData.showOnBoard,
                    position: copiedRowData.position
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
// 一括編集モーダル - 削除済み（v1.20.16）
// ========================================
// 一括編集機能は不要になったため削除

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

                <div class="detail-section">
                    <h4>貼紙表示位置</h4>
                    <div class="position-select-grid">
                        <label class="position-option">
                            <input type="radio" name="detailPosition" value="1"> ①上左
                        </label>
                        <label class="position-option">
                            <input type="radio" name="detailPosition" value="2" checked> ②上中
                        </label>
                        <label class="position-option">
                            <input type="radio" name="detailPosition" value="3"> ③上右
                        </label>
                        <label class="position-option">
                            <input type="radio" name="detailPosition" value="4"> ④中央
                        </label>
                        <label class="position-option full-width">
                            <input type="radio" name="detailPosition" value="0"> ⓪全体
                        </label>
                    </div>
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
        const inspection = masterData.notices?.find(i => i.inspectionType === row.inspectionType);
        if (inspection && inspection.noticeText) {
            noticeText = inspection.noticeText;
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

    // 貼紙表示位置を設定（デフォルトは②上中=2）
    const positionValue = row.position !== undefined ? String(row.position) : '2';
    const positionRadio = document.querySelector(`input[name="detailPosition"][value="${positionValue}"]`);
    if (positionRadio) positionRadio.checked = true;

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

    // 貼紙表示位置
    const positionRadio = document.querySelector('input[name="detailPosition"]:checked');
    row.position = positionRadio ? parseInt(positionRadio.value) : 2;

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

// テンプレートダウンロード
export function downloadExcelTemplate() {
    // Excel形式でテンプレートを作成（保守会社列なし、物件名で指定）
    const header = ['物件名', '端末ID', '点検種別', '開始日', '終了日', '備考'];
    const example1 = ['アソシアグロッツォ天神サウス', 'z1003A01', 'エレベーター定期点検', '2025/1/15', '2025/1/15', '午前中'];
    const example2 = ['アソシアグロッツォタイムズスイート博多', 'h0001A00', '消防設備点検', '2025/2/1', '2025/2/3', ''];

    const content = [header, example1, example2].map(row => row.join(',')).join('\n');

    // BOM付きUTF-8でダウンロード（Excelで文字化けしない）
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '一括入力テンプレート.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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

    // ヘッダー行をスキップするかどうか判定（最初の列がヘッダーキーワードかどうかで判断）
    let startIndex = 0;
    const firstLine = lines[0] || '';
    const firstCols = firstLine.split('\t');
    const firstColLower = (firstCols[0] || '').toLowerCase().trim();
    const secondColLower = (firstCols[1] || '').toLowerCase().trim();

    // 最初の2列がヘッダーっぽいかどうかで判定（データ内のキーワードと区別）
    const headerKeywords = [
        '物件コード', '物件', 'property',
        '端末id', '端末', 'terminal',
        '保守会社', '業者', 'vendor'
    ];
    const isHeaderRow = headerKeywords.some(keyword =>
        firstColLower === keyword.toLowerCase() || secondColLower === keyword.toLowerCase()
    );
    if (isHeaderRow) {
        startIndex = 1;
    }

    for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i];
        const cols = line.split('\t');
        if (cols.length < 3) {
            errorCount++;
            continue;
        }

        let rowData = {};

        // 新形式: 保守会社列なし、物件名で取込
        // 0: 点検CO(空), 1: 端末ID, 2: 物件名, 3: 緊急連絡先,
        // 4: 点検種別, 5: 掲示板表示, 6: TPLNo, 7: 開始日, 8: 終了日,
        // 9: 備考, 10: 案内文, 11: frame_No(position), 12: 表示開始日,
        // 13: 表示開始時刻, 14: 表示終了日, 15: 表示終了時刻, 16: 貼紙区分, 17: 表示時間
        if (cols.length >= 10) {
            const masterData = getMasterData();
            const propertyName = cols[2]?.trim() || '';
            // 物件名から物件コードを検索
            const property = masterData.properties.find(p => p.propertyName === propertyName);

            rowData = {
                terminalId: cols[1]?.trim() || '',
                propertyCode: property?.propertyCode || propertyName, // 見つからない場合はそのまま
                inspectionType: cols[4]?.trim() || '',
                startDate: formatDateForInput(cols[7]?.trim() || ''),
                endDate: formatDateForInput(cols[8]?.trim() || ''),
                remarks: cols[9]?.trim() || '',
                noticeText: cols[10]?.trim() || '',
                position: cols[11] ? parseInt(cols[11]) : 2,
                displayStartDate: formatDateForInput(cols[12]?.trim() || ''),
                displayStartTime: cols[13]?.trim() || '',
                displayEndDate: formatDateForInput(cols[14]?.trim() || ''),
                displayEndTime: cols[15]?.trim() || '',
                displayTime: cols[17] ? parseDisplayTime(cols[17].trim()) : 6,
                showOnBoard: cols[5]?.trim().toLowerCase() !== 'false'
            };
        } else if (cols.length >= 5) {
            // シンプルな形式（5列以上）: 物件名, 端末ID, 点検種別, 開始日, 終了日, 備考
            const masterData = getMasterData();
            const propertyName = cols[0]?.trim() || '';
            const property = masterData.properties.find(p => p.propertyName === propertyName);

            console.log('🔍 Import row:', {
                cols: cols,
                propertyName: propertyName,
                property: property?.propertyCode,
                terminalId: cols[1],
                inspectionType: cols[2],
                startDate: cols[3],
                endDate: cols[4],
                remarks: cols[5]
            });

            rowData = {
                propertyCode: property?.propertyCode || propertyName,
                terminalId: cols[1]?.trim() || '',
                inspectionType: cols[2]?.trim() || '',
                startDate: formatDateForInput(cols[3]?.trim() || ''),
                endDate: formatDateForInput(cols[4]?.trim() || ''),
                remarks: cols[5]?.trim() || '',
                noticeText: cols[6]?.trim() || '',
                position: cols[7] ? parseInt(cols[7]) : 2
            };
        } else {
            // 最小形式（5列以下）: 物件名, 点検種別, 開始日, 終了日, 備考
            const masterData = getMasterData();
            const propertyName = cols[0]?.trim() || '';
            const property = masterData.properties.find(p => p.propertyName === propertyName);

            rowData = {
                propertyCode: property?.propertyCode || propertyName,
                inspectionType: cols[1]?.trim() || '',
                startDate: formatDateForInput(cols[2]?.trim() || ''),
                endDate: formatDateForInput(cols[3]?.trim() || ''),
                remarks: cols[4]?.trim() || ''
            };
        }

        // 物件コードまたは何かしらのデータがあれば取り込む
        const hasData = rowData.propertyCode || rowData.inspectionType;

        if (hasData) {
            addRow(rowData, callbacks);
            importCount++;
        } else {
            errorCount++;
        }
    }

    closePasteModal();
    if (importCount > 0) {
        callbacks.showToast(`${importCount}件のデータを取り込みました`, 'success');
    }
    if (errorCount > 0) {
        callbacks.showToast(`${errorCount}件のデータをスキップしました`, 'error');
    }
}

// 表示時間を解析（0:00:06形式→6秒）
function parseDisplayTime(timeStr) {
    if (!timeStr) return 6;
    const match = timeStr.match(/(\d+):(\d+):(\d+)/);
    if (match) {
        return parseInt(match[3]) || 6;
    }
    const num = parseInt(timeStr);
    return isNaN(num) ? 6 : num;
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
            // vendorName は保存しない（適用時に getCurrentVendor() を使用）
            inspectionType: r.inspectionType,
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
