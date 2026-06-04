// bulk-modals.js - モーダル関連

import {
    getMasterData, getRows, getRowById,
    getCurrentDetailRowId, setCurrentDetailRowId, getCurrentVendor
} from './bulk-state.js';
import { addRow, updateTerminals, validateRow, insertRowAt, getSelectedRowIds } from './bulk-table.js';

let copiedRowData = null;

// テンプレートのユニークID生成（名前の重複に耐えるため）
function genTemplateId() {
    try {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            return window.crypto.randomUUID();
        }
    } catch (e) { /* crypto 不可なら下のフォールバックへ */ }
    return `tpl_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
}

// LocalStorageから安全にテンプレートを読み込む（配列形式）
// 形式: [{ id, name, vendorId, vendorName, createdAt, rows: [...] }]
function getStoredTemplates() {
    let raw;
    try {
        raw = JSON.parse(localStorage.getItem('bulk_templates') || '[]');
    } catch (e) {
        console.warn('Failed to parse bulk_templates from localStorage:', e);
        return [];
    }
    // 旧形式（{ [name]: {...} } オブジェクト）を配列形式へ自動移行
    if (raw && !Array.isArray(raw) && typeof raw === 'object') {
        const migrated = Object.entries(raw).map(([name, t]) => ({
            id: genTemplateId(),
            name,
            vendorId: (t && t.vendorId) || null,   // 旧データに企業情報は無い → 全社共通扱い
            vendorName: (t && t.vendorName) || null,
            createdAt: (t && t.createdAt) || null,
            rows: (t && t.rows) || []
        }));
        setStoredTemplates(migrated);
        return migrated;
    }
    return Array.isArray(raw) ? raw : [];
}

function setStoredTemplates(templates) {
    // setItem はストレージ満杯/書き込み拒否環境で throw しうる。
    // 移行処理(getStoredTemplates)は read 経路かつ init の try 外から呼ばれるため、
    // ここで握りつぶさないと init 全体が連鎖停止する。失敗は警告に留める。
    try {
        localStorage.setItem('bulk_templates', JSON.stringify(templates));
    } catch (e) {
        console.warn('Failed to save bulk_templates to localStorage:', e);
    }
}

// 現在選択中の企業で表示できるテンプレートのみ抽出
// （vendorId が一致するもの ＋ 企業未設定のレガシー/全社共通テンプレート）
function getVisibleTemplates() {
    const { id: vendorId } = getCurrentVendor();
    return getStoredTemplates().filter(t => !t.vendorId || t.vendorId === vendorId);
}

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
        if (isNaN(rowId)) return;
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
            if (rowIndex === -1) {
                console.warn('Row not found for deletion:', rowId);
                break;
            }
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
                    <div class="form-row-inline" style="margin-top: 0.75rem;">
                        <div class="form-group">
                            <label>表示時間（秒）</label>
                            <input type="number" id="detailDisplayTime" class="form-control" min="1" max="60" style="width: 100px;">
                        </div>
                    </div>
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

    // 表示時間（秒）- デフォルトは設定値または6秒
    const defaultDisplayTime = (window.appSettings && window.appSettings.display_time_default) || 6;
    document.getElementById('detailDisplayTime').value = row.displayTime || defaultDisplayTime;

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
    row.displayTime = parseInt(document.getElementById('detailDisplayTime').value) || 6;

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
    const raw = document.getElementById('pasteArea').value;
    if (!raw.trim()) {
        callbacks.showToast('データを入力してください', 'error');
        return;
    }

    const masterData = getMasterData();
    // 行単位に分割。先頭セルが空のデータでも列がずれないよう全体trimはせず、
    // 末尾の完全な空行のみ除去する（CRLF対策で \r も落とす）。
    const lines = raw.split(/\r?\n/);
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();

    let importCount = 0;
    let errorCount = 0;
    let unresolvedCount = 0; // 物件を特定できなかった行数

    // ヘッダー行をスキップするかどうか判定（最初の2列がヘッダーキーワードかどうかで判断）
    let startIndex = 0;
    const firstCols = (lines[0] || '').split('\t');
    const firstColLower = (firstCols[0] || '').toLowerCase().trim();
    const secondColLower = (firstCols[1] || '').toLowerCase().trim();
    const headerKeywords = [
        '物件コード', '物件名', '物件', 'property',
        '端末id', '端末', 'terminal',
        '保守会社', '業者', 'vendor'
    ];
    const isHeaderRow = headerKeywords.some(keyword =>
        firstColLower === keyword.toLowerCase() || secondColLower === keyword.toLowerCase()
    );
    if (isHeaderRow) {
        startIndex = 1;
    }

    // 対応フォーマット（Excel貼り付け）:
    // 0:物件名/物件コード, 1:端末ID, 2:点検種別, 3:開始日, 4:終了日, 5:備考, 6:案内文(任意), 7:表示位置(任意)
    for (let i = startIndex; i < lines.length; i++) {
        const cols = lines[i].split('\t');
        const propValue = cols[0]?.trim() || '';
        const terminalId = cols[1]?.trim() || '';
        const inspectionType = cols[2]?.trim() || '';

        // 物件・端末・点検種別がいずれも無い行は無視（空行や区切り行）
        if (!propValue && !terminalId && !inspectionType) {
            if (lines[i].trim() !== '') errorCount++;
            continue;
        }

        // 物件名・物件コードの両方で照合。見つからなければ生値を入れず空にし、
        // 行は残して validateRow で「物件」エラー（赤）にする → silent取り込みを防ぐ。
        const property = masterData.properties.find(p =>
            p.propertyName === propValue || String(p.propertyCode) === String(propValue)
        );
        if (!property && propValue) unresolvedCount++;

        const rowData = {
            propertyCode: property?.propertyCode || '',
            terminalId: terminalId,
            inspectionType: inspectionType,
            startDate: formatDateForInput(cols[3]?.trim() || ''),
            endDate: formatDateForInput(cols[4]?.trim() || ''),
            remarks: cols[5]?.trim() || '',
            noticeText: cols[6]?.trim() || '',
            position: cols[7] ? parseInt(cols[7]) : 2
        };

        addRow(rowData, callbacks);
        importCount++;
    }

    closePasteModal();
    if (importCount > 0) {
        callbacks.showToast(`${importCount}件のデータを取り込みました`, 'success');
    }
    if (unresolvedCount > 0) {
        callbacks.showToast(`${unresolvedCount}件は物件名が見つかりませんでした。行を確認してください`, 'error');
    }
    if (errorCount > 0) {
        callbacks.showToast(`${errorCount}件の不正な行をスキップしました`, 'error');
    }
}

// 表示時間を解析（0:00:06形式→6秒）
function formatDateForInput(dateStr) {
    if (!dateStr) return '';
    const match = dateStr.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
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

    const { id: vendorId, name: vendorName } = getCurrentVendor();
    const templates = getStoredTemplates();

    const rowsData = rows.map(r => ({
        propertyCode: r.propertyCode,
        terminalId: r.terminalId,
        // vendorName は行に保存しない（適用時に getCurrentVendor() を使用）
        inspectionType: r.inspectionType,
        displayTime: r.displayTime,
        noticeText: r.noticeText,
        displayStartDate: r.displayStartDate,
        displayStartTime: r.displayStartTime,
        displayEndDate: r.displayEndDate,
        displayEndTime: r.displayEndTime,
        showOnBoard: r.showOnBoard,
        position: r.position
    }));

    // 同一企業内で同名テンプレートがあれば上書き、無ければ新規追加
    // （企業が異なれば同名でも別テンプレートとして共存できる）
    const existing = templates.find(
        t => t.name === name && (t.vendorId || null) === (vendorId || null)
    );
    if (existing) {
        existing.rows = rowsData;
        existing.createdAt = Date.now();
        existing.vendorName = vendorName || null;
    } else {
        templates.push({
            id: genTemplateId(),
            name,
            vendorId: vendorId || null,
            vendorName: vendorName || null,
            createdAt: Date.now(),
            rows: rowsData
        });
    }

    setStoredTemplates(templates);
    closeTemplateModal();
    callbacks.loadTemplates();
    callbacks.showToast(`テンプレート「${name}」を保存しました`, 'success');
}

export function loadTemplates() {
    const select = document.getElementById('templateSelect');
    if (!select) return;
    select.innerHTML = '<option value="">テンプレート</option>';

    // 現在選択中の企業のテンプレートのみ表示
    getVisibleTemplates().forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;            // value はユニークな id（名前の重複に耐える）
        // 全社共通(vendorId=null)は同名の企業別テンプレと区別できるよう接尾辞を付ける
        opt.textContent = t.vendorId ? t.name : `${t.name}（全社共通）`;
        select.appendChild(opt);
    });
}

export function applyTemplate(id, callbacks) {
    const select = document.getElementById('templateSelect');
    const template = getStoredTemplates().find(t => t.id === id);
    if (!template) {
        if (select) select.value = '';
        return;
    }

    if (getRows().length > 0) {
        if (!confirm('現在のデータを置き換えますか？')) {
            if (select) select.value = '';
            return;
        }
    }

    document.getElementById('tableBody').innerHTML = '';
    callbacks.clearRows();

    // rows 欠損（外部改竄・旧バージョン由来）でも clearRows 後に落ちないよう防御
    const templateRows = Array.isArray(template.rows) ? template.rows : [];
    templateRows.forEach(rowData => {
        addRow(rowData, callbacks);
    });

    if (select) select.value = '';
    callbacks.showToast(`テンプレート「${template.name}」を適用しました`, 'success');
}

// ========================================
// テンプレート管理（一覧・削除）
// ========================================

export function openManageTemplateModal(callbacks) {
    renderManageTemplateList(callbacks);
    document.getElementById('manageTemplateModal').classList.add('active');
}

export function closeManageTemplateModal() {
    document.getElementById('manageTemplateModal').classList.remove('active');
}

function renderManageTemplateList(callbacks) {
    const listEl = document.getElementById('manageTemplateList');
    if (!listEl) return;
    listEl.innerHTML = '';

    const templates = getVisibleTemplates();
    if (templates.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'template-manage-empty';
        empty.textContent = '登録済みのテンプレートはありません';
        listEl.appendChild(empty);
        return;
    }

    templates.forEach(t => {
        const item = document.createElement('div');
        item.className = 'template-manage-item';

        const info = document.createElement('div');
        info.className = 'template-manage-info';

        const nameEl = document.createElement('span');
        nameEl.className = 'template-manage-name';
        nameEl.textContent = t.name;              // XSS防止: textContent で挿入
        info.appendChild(nameEl);

        const metaEl = document.createElement('span');
        metaEl.className = 'template-manage-meta';
        const rowCount = Array.isArray(t.rows) ? t.rows.length : 0;
        const scope = t.vendorName ? t.vendorName : '全社共通';
        metaEl.textContent = `${scope} ・ ${rowCount}行`;
        info.appendChild(metaEl);

        item.appendChild(info);

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'btn btn-sm btn-danger-outline';
        delBtn.textContent = '削除';
        delBtn.addEventListener('click', () => deleteTemplate(t.id, callbacks));
        item.appendChild(delBtn);

        listEl.appendChild(item);
    });
}

export function deleteTemplate(id, callbacks) {
    const templates = getStoredTemplates();
    const target = templates.find(t => t.id === id);
    if (!target) return;

    if (!confirm(`テンプレート「${target.name}」を削除しますか？\nこの操作は取り消せません。`)) {
        return;
    }

    setStoredTemplates(templates.filter(t => t.id !== id));

    callbacks.loadTemplates();           // ツールバーのドロップダウンを更新
    renderManageTemplateList(callbacks); // 管理一覧を更新
    callbacks.showToast(`テンプレート「${target.name}」を削除しました`, 'success');
}
