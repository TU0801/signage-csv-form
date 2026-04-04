// admin-entries.js - データ一覧・フィルター・ソート・詳細表示・一括操作

import {
    getAllEntries,
    deleteEntry,
    updateEntriesStatusBulk
} from './supabase-client.js';

import { escapeHtml, showToast } from './ui-utils.js';
import { getAppSettings } from './admin-settings.js';
import { normalizeTerminalId } from './shared-utils.js';

let getState = null;
let getCallbacks = null;

// ソート状態
let currentSort = {
    column: 'created_at',
    ascending: false
};

/**
 * データ一覧モジュール初期化
 * @param {Function} _getState - () => { entries, masterData, getUserEmail }
 * @param {Function} _getCallbacks - () => { setEntries, updateSidebarCounts }
 */
export function initEntriesModule(_getState, _getCallbacks) {
    getState = _getState;
    getCallbacks = _getCallbacks;
}

// ========================================
// テーブルソート
// ========================================

export function initTableSort() {
    // LocalStorageから復元
    const saved = localStorage.getItem('entriesSort');
    if (saved) {
        try {
            currentSort = JSON.parse(saved);
        } catch (_e) {
            // 無効なデータは無視
        }
    }

    // ヘッダーにイベントリスナー追加
    document.querySelectorAll('#tab-entries .sortable').forEach(th => {
        th.addEventListener('click', () => {
            const column = th.dataset.sort;
            if (currentSort.column === column) {
                currentSort.ascending = !currentSort.ascending;
            } else {
                currentSort.column = column;
                currentSort.ascending = true;
            }
            localStorage.setItem('entriesSort', JSON.stringify(currentSort));
            updateSortIndicators();
            renderEntries();
        });
    });

    updateSortIndicators();
}

function updateSortIndicators() {
    document.querySelectorAll('#tab-entries .sortable').forEach(th => {
        const indicator = th.querySelector('.sort-indicator');
        if (!indicator) return;
        if (th.dataset.sort === currentSort.column) {
            th.classList.add('sorted');
            indicator.textContent = currentSort.ascending ? '▲' : '▼';
        } else {
            th.classList.remove('sorted');
            indicator.textContent = '▼';
        }
    });
}

function sortEntries(entriesArray) {
    const { masterData } = getState();
    return [...entriesArray].sort((a, b) => {
        let aVal = a[currentSort.column] || '';
        let bVal = b[currentSort.column] || '';

        // 物件名は特別処理（masterDataから取得）
        if (currentSort.column === 'property_name') {
            const propA = masterData.properties.find(p => p.property_code === a.property_code);
            const propB = masterData.properties.find(p => p.property_code === b.property_code);
            aVal = propA?.property_name || '';
            bVal = propB?.property_name || '';
        }

        // 日付の場合は数値に変換
        if (currentSort.column.includes('_at') || currentSort.column.includes('_start') || currentSort.column.includes('_end')) {
            aVal = aVal ? new Date(aVal).getTime() : 0;
            bVal = bVal ? new Date(bVal).getTime() : 0;
        }

        // 文字列の場合は小文字に統一
        if (typeof aVal === 'string') aVal = aVal.toLowerCase();
        if (typeof bVal === 'string') bVal = bVal.toLowerCase();

        const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return currentSort.ascending ? comparison : -comparison;
    });
}

// ========================================
// フィルター
// ========================================

export function populateFilters() {
    const { masterData } = getState();
    const filterProperty = document.getElementById('filterProperty');

    masterData.properties.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.property_code;
        opt.textContent = `${p.property_code} ${p.property_name}`;
        filterProperty.appendChild(opt);
    });

    // 保守会社フィルター初期化
    const filterVendor = document.getElementById('filterVendor');
    if (filterVendor) {
        masterData.vendors.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v.vendor_name;
            opt.textContent = v.vendor_name;
            filterVendor.appendChild(opt);
        });
    }
}

function saveFilters() {
    const filters = {
        property: document.getElementById('filterProperty')?.value || '',
        startDate: document.getElementById('filterStartDate')?.value || '',
        endDate: document.getElementById('filterEndDate')?.value || '',
        vendor: document.getElementById('filterVendor')?.value || ''
    };
    localStorage.setItem('admin_entry_filters', JSON.stringify(filters));
}

export function restoreFilters() {
    try {
        const saved = localStorage.getItem('admin_entry_filters');
        if (saved) {
            const filters = JSON.parse(saved);
            const elProperty = document.getElementById('filterProperty');
            const elStartDate = document.getElementById('filterStartDate');
            const elEndDate = document.getElementById('filterEndDate');
            const elVendor = document.getElementById('filterVendor');
            if (elProperty) elProperty.value = filters.property || '';
            if (elStartDate) elStartDate.value = filters.startDate || '';
            if (elEndDate) elEndDate.value = filters.endDate || '';
            if (elVendor) elVendor.value = filters.vendor || '';
        }
    } catch (error) {
        console.error('Failed to restore filters:', error);
    }
}

// ========================================
// データ一覧
// ========================================

export async function loadEntries() {
    const { setEntries, updateSidebarCounts } = getCallbacks();
    const propertyCode = document.getElementById('filterProperty')?.value || '';
    const startDate = document.getElementById('filterStartDate')?.value || '';
    const endDate = document.getElementById('filterEndDate')?.value || '';
    const vendorName = document.getElementById('filterVendor')?.value || '';

    // フィルターを保存
    saveFilters();

    try {
        const entries = await getAllEntries({
            propertyCode: propertyCode || undefined,
            startDate: startDate || undefined,
            endDate: endDate || undefined,
            vendorName: vendorName || undefined,
            statusArray: ['ready', 'exported']  // 承認済みのみ表示
        });
        setEntries(entries);
        renderEntries();
        updateBulkActionButtons();
        updateSidebarCounts();
    } catch (error) {
        console.error('Failed to load entries:', error);
        showToast('データの取得に失敗しました', 'error');
    }
}

export function renderEntries() {
    const { entries, masterData, getUserEmail } = getState();
    const tbody = document.getElementById('entriesBody');
    const emptyMsg = document.getElementById('entriesEmpty');

    tbody.innerHTML = '';

    if (entries.length === 0) {
        emptyMsg.style.display = 'block';
        document.getElementById('entriesCount').textContent = '0';
        return;
    }

    emptyMsg.style.display = 'none';

    // ソートを適用
    const sortedEntriesList = sortEntries(entries);

    sortedEntriesList.forEach(entry => {
        const tr = document.createElement('tr');
        const createdAt = new Date(entry.created_at).toLocaleString('ja-JP');
        const inspectionStart = entry.inspection_start
            ? new Date(entry.inspection_start).toLocaleDateString('ja-JP')
            : '-';

        // 物件名を取得
        const propertyForList = masterData.properties.find(p => p.property_code === entry.property_code);

        // 点検終了日のフォーマット
        const inspectionEnd = entry.inspection_end
            ? new Date(entry.inspection_end).toLocaleDateString('ja-JP')
            : '-';

        // 備考（長い場合は省略）
        const remarksDisplay = entry.remarks
            ? `<div style="max-width: 150px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(entry.remarks)}">${escapeHtml(entry.remarks)}</div>`
            : '-';

        tr.innerHTML = `
            <td><input type="checkbox" class="entry-checkbox" data-id="${entry.id}"></td>
            <td>${escapeHtml(entry.property_code)}</td>
            <td>${escapeHtml(propertyForList?.property_name || '-')}</td>
            <td>${escapeHtml(entry.inspection_type)}</td>
            <td>${escapeHtml(inspectionStart)}</td>
            <td>${escapeHtml(inspectionEnd)}</td>
            <td>${remarksDisplay}</td>
            <td>${escapeHtml(entry.vendor_name || '-')}</td>
            <td>${escapeHtml(createdAt)}</td>
            <td>${escapeHtml(getUserEmail(entry.user_id))}</td>
            <td>
                <button class="btn btn-outline btn-sm" data-action="detail" data-id="${escapeHtml(entry.id)}">📋</button>
                <button class="btn btn-primary btn-sm" data-action="edit" data-id="${escapeHtml(entry.id)}">✏️</button>
                <button class="btn btn-outline btn-sm" data-action="delete" data-id="${escapeHtml(entry.id)}">🗑️</button>
            </td>
        `;
        tr.querySelector('[data-action="detail"]').addEventListener('click', () => showEntryDetail(entry));
        tr.querySelector('[data-action="edit"]').addEventListener('click', () => window.editEntry(entry.id, 'list'));
        tr.querySelector('[data-action="delete"]').addEventListener('click', () => deleteEntryById(entry.id));
        tr.querySelector('.entry-checkbox').addEventListener('change', updateBulkActionButtons);
        tbody.appendChild(tr);
    });

    document.getElementById('entriesCount').textContent = entries.length;

    // 全選択チェックボックスをデフォルトで選択状態に
    const selectAll = document.getElementById('selectAllEntries');
    if (selectAll) {
        selectAll.checked = true;
        document.querySelectorAll('.entry-checkbox').forEach(cb => cb.checked = true);
    }
    updateBulkActionButtons();
}

async function deleteEntryById(id) {
    if (!confirm('このデータを削除しますか？')) return;

    try {
        await deleteEntry(id);
        showToast('削除しました', 'success');
        await loadEntries();
    } catch (_error) {
        showToast('削除に失敗しました', 'error');
    }
}

// ========================================
// 選択・一括操作
// ========================================

function updateBulkActionButtons() {
    const checkedCount = document.querySelectorAll('.entry-checkbox:checked').length;
    const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
    const markExportedBtn = document.getElementById('markExportedBtn');
    const markSubmittedBtn = document.getElementById('markSubmittedBtn');
    const revertToPendingBtn = document.getElementById('revertToPendingBtn');

    const hasSelection = checkedCount > 0;
    if (bulkDeleteBtn) bulkDeleteBtn.disabled = !hasSelection;
    if (markExportedBtn) markExportedBtn.disabled = !hasSelection;
    if (markSubmittedBtn) markSubmittedBtn.disabled = !hasSelection;
    if (revertToPendingBtn) revertToPendingBtn.disabled = !hasSelection;

    const selectedInfo = document.getElementById('selectedEntriesInfo');
    if (selectedInfo) {
        selectedInfo.textContent = hasSelection ? `${checkedCount}件選択中` : '';
    }
}

export function toggleSelectAllEntries() {
    const selectAll = document.getElementById('selectAllEntries');
    const checkboxes = document.querySelectorAll('#entriesBody .entry-checkbox');
    checkboxes.forEach(cb => cb.checked = selectAll.checked);
    updateBulkActionButtons();
}

export function getSelectedEntryIds() {
    const checkboxes = document.querySelectorAll('#entriesBody .entry-checkbox:checked');
    return Array.from(checkboxes).map(cb => cb.dataset.id);
}

export async function updateEntriesStatus(status) {
    const ids = getSelectedEntryIds();
    if (ids.length === 0) return;

    const statusLabel = status === 'exported' ? '取込済み' : status === 'ready' ? '未取込' : status === 'pending' ? '未申請' : '申請済み';
    if (!confirm(`選択した${ids.length}件を「${statusLabel}」に変更しますか？`)) return;

    try {
        await updateEntriesStatusBulk(ids, status);
        showToast(`${ids.length}件を「${statusLabel}」に変更しました`, 'success');
        await loadEntries();
    } catch (error) {
        console.error('Status update failed:', error);
        showToast('ステータスの更新に失敗しました', 'error');
    }
}

export async function bulkDeleteEntries() {
    const ids = getSelectedEntryIds();
    if (ids.length === 0) {
        showToast('削除する項目を選択してください', 'error');
        return;
    }

    if (!confirm(`選択した${ids.length}件のデータを完全に削除してもよろしいですか？\nこの操作は取り消せません。`)) return;

    try {
        await Promise.all(ids.map(id => deleteEntry(id)));
        showToast(`${ids.length}件のデータを削除しました`, 'success');
        await loadEntries();
    } catch (error) {
        console.error('Bulk delete failed:', error);
        showToast('削除に失敗しました', 'error');
    }
}

// ========================================
// エントリ詳細表示
// ========================================

export function showEntryDetail(entry) {
    const { getUserEmail } = getState();
    const formatDate = (d) => d ? new Date(d).toLocaleDateString('ja-JP') : '-';
    const formatDateTime = (d) => d ? new Date(d).toLocaleString('ja-JP') : '-';

    // terminal_idを正規化（JSON文字列の場合は端末ID文字列を抽出）
    const html = `
        <div class="detail-grid">
            <div class="detail-label">物件コード</div>
            <div class="detail-value">${escapeHtml(entry.property_code)}</div>

            <div class="detail-label">端末ID</div>
            <div class="detail-value">${escapeHtml(normalizeTerminalId(entry.terminal_id) || '-')}</div>

            <div class="detail-label">保守会社</div>
            <div class="detail-value">${escapeHtml(entry.vendor_name)}</div>

            <div class="detail-label">緊急連絡先</div>
            <div class="detail-value">${escapeHtml(entry.emergency_contact || '-')}</div>

            <div class="detail-label">点検工事案内</div>
            <div class="detail-value">${escapeHtml(entry.inspection_type)}</div>

            <div class="detail-label">テンプレートNo</div>
            <div class="detail-value">${escapeHtml(entry.template_no || '-')}</div>
        </div>

        <div class="detail-section">
            <div class="detail-section-title">点検期間</div>
            <div class="detail-grid">
                <div class="detail-label">開始日</div>
                <div class="detail-value">${formatDate(entry.inspection_start)}</div>

                <div class="detail-label">終了日</div>
                <div class="detail-value">${formatDate(entry.inspection_end)}</div>
            </div>
        </div>

        <div class="detail-section">
            <div class="detail-section-title">表示設定</div>
            <div class="detail-grid">
                <div class="detail-label">表示開始</div>
                <div class="detail-value">${formatDate(entry.display_start_date)} ${entry.display_start_time || ''}</div>

                <div class="detail-label">表示終了</div>
                <div class="detail-value">${formatDate(entry.display_end_date)} ${entry.display_end_time || ''}</div>

                <div class="detail-label">表示時間</div>
                <div class="detail-value">${entry.display_duration || getAppSettings().display_time_default || 6}秒</div>

                <div class="detail-label">表示位置</div>
                <div class="detail-value">${entry.poster_position || '-'}</div>

                <div class="detail-label">貼紙区分</div>
                <div class="detail-value">${entry.poster_type === 'custom' ? '追加' : 'テンプレート'}</div>
                ${entry.poster_type === 'custom' && entry.poster_image ? `
                <div class="detail-label">貼紙画像</div>
                <div class="detail-value">
                    <img src="${entry.poster_image}" alt="貼紙画像" style="max-width: 200px; max-height: 200px; border: 1px solid #e2e8f0; border-radius: 4px;">
                </div>
                ` : ''}
            </div>
        </div>

        <div class="detail-section">
            <div class="detail-section-title">案内文・作業時間 及び 備考</div>
            <div class="detail-grid">
                <div class="detail-label">案内文</div>
                <div class="detail-value" style="white-space: pre-wrap;">${escapeHtml(entry.announcement || '-')}</div>

                <div class="detail-label">作業時間 及び 備考</div>
                <div class="detail-value" style="white-space: pre-wrap;">${escapeHtml(entry.remarks || '-')}</div>
            </div>
        </div>

        <div class="detail-section">
            <div class="detail-section-title">登録情報</div>
            <div class="detail-grid">
                <div class="detail-label">登録者</div>
                <div class="detail-value">${escapeHtml(getUserEmail(entry.user_id))}</div>

                <div class="detail-label">登録日時</div>
                <div class="detail-value">${formatDateTime(entry.created_at)}</div>

                <div class="detail-label">ステータス</div>
                <div class="detail-value">${entry.status === 'submitted' ? '承認済み' : '承認待ち'}</div>
            </div>
        </div>
    `;

    document.getElementById('entryDetailBody').innerHTML = html;
    document.getElementById('entryDetailModal').classList.add('active');
}

export function closeEntryDetailModal() {
    document.getElementById('entryDetailModal').classList.remove('active');
}
