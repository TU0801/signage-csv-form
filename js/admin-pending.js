// admin-pending.js - 承認待ちエントリ管理

import {
    getPendingEntries,
    approveEntry,
    approveEntries,
    rejectEntry
} from './supabase-client.js';

import { escapeHtml, showToast } from './ui-utils.js';

let getState = null;
let getCallbacks = null;
let selectedPendingIds = [];

/**
 * 承認待ちモジュール初期化
 * @param {Function} _getState - () => { pendingEntries, masterData, getUserEmail }
 * @param {Function} _getCallbacks - () => { setPendingEntries, loadAllData, updateSidebarCounts, showEntryDetail }
 */
export function initPendingModule(_getState, _getCallbacks) {
    getState = _getState;
    getCallbacks = _getCallbacks;
}

export async function loadPendingEntries() {
    const { setPendingEntries } = getCallbacks();
    try {
        const pendingEntries = await getPendingEntries();
        setPendingEntries(pendingEntries);
        renderPendingEntries();
        document.getElementById('pendingCount').textContent = pendingEntries.length;
    } catch (error) {
        console.error('Failed to load pending entries:', error);
    }
}

export function renderPendingEntries() {
    const { pendingEntries, masterData, getUserEmail } = getState();
    const { showEntryDetail } = getCallbacks();
    const tbody = document.getElementById('pendingBody');
    const emptyMsg = document.getElementById('pendingEmpty');

    tbody.innerHTML = '';
    selectedPendingIds = [];
    document.getElementById('selectAllPending').checked = false;
    document.getElementById('approveAllBtn').disabled = true;

    if (pendingEntries.length === 0) {
        emptyMsg.style.display = 'block';
        return;
    }

    emptyMsg.style.display = 'none';

    pendingEntries.forEach(entry => {
        const tr = document.createElement('tr');
        const createdAt = new Date(entry.created_at).toLocaleString('ja-JP');
        const inspectionStart = entry.inspection_start
            ? new Date(entry.inspection_start).toLocaleDateString('ja-JP')
            : '-';

        // 物件名を取得
        const property = masterData.properties.find(p => p.property_code === entry.property_code);

        // 点検終了日のフォーマット
        const inspectionEnd = entry.inspection_end
            ? new Date(entry.inspection_end).toLocaleDateString('ja-JP')
            : '-';

        // 備考（長い場合は省略）
        const remarksDisplay = entry.remarks
            ? `<div style="max-width: 150px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(entry.remarks)}">${escapeHtml(entry.remarks)}</div>`
            : '-';

        tr.innerHTML = `
            <td><input type="checkbox" data-id="${escapeHtml(entry.id)}" onchange="updateSelectedPending()"></td>
            <td>${escapeHtml(entry.property_code)}</td>
            <td>${escapeHtml(property?.property_name || '-')}</td>
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
                <button class="btn btn-success btn-sm" data-action="approve" data-id="${escapeHtml(entry.id)}">✅</button>
                <button class="btn btn-outline btn-sm" data-action="reject" data-id="${escapeHtml(entry.id)}">❌</button>
            </td>
        `;
        tr.querySelector('[data-action="detail"]').addEventListener('click', () => showEntryDetail(entry));
        tr.querySelector('[data-action="edit"]').addEventListener('click', () => window.editEntry(entry.id, 'pending'));
        tr.querySelector('[data-action="approve"]').addEventListener('click', () => approveSingle(entry.id));
        tr.querySelector('[data-action="reject"]').addEventListener('click', () => rejectSingle(entry.id));
        tbody.appendChild(tr);
    });
}

export function updateSelectedPending() {
    const checkboxes = document.querySelectorAll('#pendingBody input[type="checkbox"]');
    selectedPendingIds = [];
    checkboxes.forEach(cb => {
        if (cb.checked) {
            selectedPendingIds.push(cb.dataset.id);
        }
    });
    document.getElementById('approveAllBtn').disabled = selectedPendingIds.length === 0;
}

export async function approveSelected() {
    if (selectedPendingIds.length === 0) return;
    const { loadAllData, updateSidebarCounts } = getCallbacks();

    if (!confirm(`選択した${selectedPendingIds.length}件を承認しますか？`)) return;

    try {
        await approveEntries(selectedPendingIds);
        showToast(`${selectedPendingIds.length}件を承認しました`, 'success');
        await Promise.all([loadPendingEntries(), loadAllData()]);
        updateSidebarCounts();
    } catch (error) {
        console.error('Failed to approve entries:', error);
        showToast('承認に失敗しました', 'error');
    }
}

export async function approveSingle(id) {
    const { loadAllData, updateSidebarCounts } = getCallbacks();
    if (!confirm('この申請を承認しますか？')) return;

    try {
        await approveEntry(id);
        showToast('承認しました', 'success');
        await Promise.all([loadPendingEntries(), loadAllData()]);
        updateSidebarCounts();
    } catch (error) {
        console.error('Failed to approve entry:', error);
        showToast('承認に失敗しました', 'error');
    }
}

export async function rejectSingle(id) {
    const { loadAllData, updateSidebarCounts } = getCallbacks();
    const reason = prompt('却下理由を入力してください（任意）：', '');
    if (reason === null) return;

    try {
        await rejectEntry(id, reason);
        showToast('却下しました', 'success');
        await Promise.all([loadPendingEntries(), loadAllData()]);
        updateSidebarCounts();
    } catch (error) {
        console.error('Failed to reject entry:', error);
        showToast('却下に失敗しました', 'error');
    }
}
