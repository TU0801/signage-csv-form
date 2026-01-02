// admin.js - 管理者画面のエントリーポイント

import {
    getUser,
    getProfile,
    isAdmin,
    signOut,
    getAllMasterData,
    getAllEntries,
    getAllProfiles,
    updateProfileRole,
    updateUserProfile,
    updateUserStatus,
    createUser,
    deleteEntry,
    getPendingEntries,
    approveEntry,
    approveEntries,
    rejectEntry,
    updateEntriesStatusBulk,
    getBuildingVendors,
    getPendingBuildingRequests,
    approveBuildingRequest,
    rejectBuildingRequest,
    removeBuildingVendor,
    addBuildingVendor,
    getVendorInspections,
    addVendorInspection,
    removeVendorInspection,
    getMasterVendors,
    getMasterProperties,
    getMasterInspectionTypes
} from './supabase-client.js';

import {
    loadMasterData,
    renderProperties,
    renderVendors,
    renderInspections,
    renderCategories,
    renderTemplateImages,
    openMasterModal,
    closeMasterModal,
    handleMasterFormSubmit,
    deleteMasterPropertyAction,
    deleteMasterVendorAction,
    deleteMasterInspectionAction,
    deleteMasterCategoryAction,
    deleteMasterTemplateImageAction
} from './admin-masters.js';

import {
    loadAppSettings,
    saveSettings
} from './admin-settings.js';

// ========================================
// セキュリティ: HTMLエスケープ
// ========================================

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ========================================
// グローバル変数
// ========================================

let masterData = { properties: [], vendors: [], inspectionTypes: [], categories: [], templateImages: [] };
let entries = [];
let profiles = [];
let pendingEntries = [];
let pendingBuildingRequests = [];
let selectedPendingIds = [];
let currentRelationshipType = 'buildings'; // 'buildings' or 'inspections'

// ユーザーIDからメールアドレスを取得
function getUserEmail(userId) {
    if (!userId) return '-';
    const profile = profiles.find(p => p.id === userId);
    return profile?.email || '-';
}

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

    // 管理者チェック
    const admin = await isAdmin();
    if (!admin) {
        alert('管理者権限が必要です');
        window.location.href = 'index.html';
        return;
    }

    // ユーザー情報表示
    const profile = await getProfile();
    document.getElementById('userEmail').textContent = profile?.email || user.email;

    // ログアウトボタン
    document.getElementById('logoutBtn').addEventListener('click', async () => {
        await signOut();
        window.location.href = 'login.html';
    });

    // データ読み込み
    await loadAllData();

    // イベントリスナー設定
    setupEventListeners();

    // 初期表示
    updateStats();
    populateFilters();
    restoreFilters(); // フィルターを復元
    loadPendingEntries();
    loadPendingBuildingRequests();
    loadEntries();
    loadMasterData(masterData);
    loadUsers();
    loadAppSettings();
    initRelationshipsTab();
}

async function loadAllData() {
    const errors = [];

    // マスターデータを取得
    try {
        masterData = await getAllMasterData();
    } catch (error) {
        console.error('Failed to load master data:', error);
        errors.push('マスターデータ');
    }

    // エントリを取得
    try {
        entries = await getAllEntries();
    } catch (error) {
        console.error('Failed to load entries:', error);
        errors.push('エントリ');
    }

    // プロファイルを取得
    try {
        profiles = await getAllProfiles();
    } catch (error) {
        console.error('Failed to load profiles:', error);
        errors.push('ユーザー');
    }

    // 承認待ちを取得
    try {
        pendingEntries = await getPendingEntries();
    } catch (error) {
        console.error('Failed to load pending entries:', error);
        errors.push('承認待ち');
    }

    // エラーがあった場合のみトーストを表示
    if (errors.length > 0) {
        showToast(`一部データの取得に失敗しました: ${errors.join(', ')}`, 'error');
    }
}

// ========================================
// イベントリスナー
// ========================================

function setupEventListeners() {
    // タブ切り替え（サイドバーナビゲーション + 旧タブ対応）
    const tabSelectors = '.admin-tab[data-tab], .sidebar-nav-link[data-tab]';
    document.querySelectorAll(tabSelectors).forEach(tab => {
        tab.addEventListener('click', () => {
            // すべてのタブからactiveを削除
            document.querySelectorAll(tabSelectors).forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

            // クリックされたタブをアクティブに
            tab.classList.add('active');
            document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
        });
    });

    // マスタータブ切り替え
    document.querySelectorAll('.admin-tab[data-master]').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.admin-tab[data-master]').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.master-content').forEach(c => c.style.display = 'none');
            tab.classList.add('active');
            document.getElementById(`master-${tab.dataset.master}`).style.display = 'block';
        });
    });

    // 検索
    document.getElementById('searchBtn').addEventListener('click', loadEntries);

    // CSVエクスポート
    document.getElementById('exportCsvBtn').addEventListener('click', exportCSV);
    document.getElementById('exportCopyBtn').addEventListener('click', copyCSV);

    // 一括削除
    document.getElementById('bulkDeleteBtn').addEventListener('click', bulkDeleteEntries);

    // 全選択チェックボックス
    document.getElementById('selectAllEntries').addEventListener('change', (e) => {
        document.querySelectorAll('.entry-checkbox').forEach(cb => {
            cb.checked = e.target.checked;
        });
        updateBulkActionButtons();
    });
    document.getElementById('markExportedBtn')?.addEventListener('click', () => updateEntriesStatus('exported'));
    document.getElementById('markSubmittedBtn')?.addEventListener('click', () => updateEntriesStatus('submitted'));

    // マスター追加ボタン
    document.getElementById('addPropertyBtn').addEventListener('click', () => openMasterModal('property', masterData));
    document.getElementById('addVendorBtn').addEventListener('click', () => openMasterModal('vendor', masterData));
    document.getElementById('addInspectionBtn').addEventListener('click', () => openMasterModal('inspection', masterData));
    document.getElementById('addCategoryBtn')?.addEventListener('click', () => openMasterModal('category', masterData));
    document.getElementById('addTemplateImageBtn')?.addEventListener('click', () => openMasterModal('templateImage', masterData));

    // マスター検索
    document.getElementById('propertySearch')?.addEventListener('input', (e) => {
        renderProperties(masterData, e.target.value);
    });
    document.getElementById('vendorSearch')?.addEventListener('input', (e) => {
        renderVendors(masterData, e.target.value);
    });
    document.getElementById('inspectionSearch')?.addEventListener('input', (e) => {
        renderInspections(masterData, e.target.value);
    });
    document.getElementById('categorySearch')?.addEventListener('input', (e) => {
        renderCategories(masterData, e.target.value);
    });
    document.getElementById('templateImageSearch')?.addEventListener('input', (e) => {
        renderTemplateImages(masterData, e.target.value);
    });

    // 設定保存ボタン
    document.getElementById('saveSettingsBtn')?.addEventListener('click', () => saveSettings(showToast));

    // マスターフォーム送信
    document.getElementById('masterForm').addEventListener('submit', (e) => {
        handleMasterFormSubmit(e, masterData, showToast, updateStats);
    });

    // モーダル外クリックで閉じる
    document.getElementById('masterModal').addEventListener('click', (e) => {
        if (e.target.id === 'masterModal') closeMasterModal();
    });

    // 承認関連
    document.getElementById('selectAllPending').addEventListener('change', (e) => {
        const checkboxes = document.querySelectorAll('#pendingBody input[type="checkbox"]');
        checkboxes.forEach(cb => cb.checked = e.target.checked);
        updateSelectedPending();
    });

    document.getElementById('approveAllBtn').addEventListener('click', approveSelected);

    // ユーザー追加
    document.getElementById('addUserBtn')?.addEventListener('click', openUserModal);
    document.getElementById('userForm')?.addEventListener('submit', handleUserFormSubmit);
    document.getElementById('userModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'userModal') closeUserModal();
    });

    // ESCキーでモーダルを閉じる
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (document.getElementById('masterModal')?.classList.contains('active')) {
                closeMasterModal();
            }
            if (document.getElementById('userModal')?.classList.contains('active')) {
                closeUserModal();
            }
            if (document.getElementById('entryDetailModal')?.classList.contains('active')) {
                closeEntryDetailModal();
            }
        }
    });

    // Enterキーでフィルター検索
    document.querySelectorAll('#filterProperty, #filterStartDate, #filterEndDate').forEach(el => {
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                document.getElementById('searchBtn')?.click();
            }
        });
    });
}

// ========================================
// 統計
// ========================================

function updateStats() {
    document.getElementById('statTotal').textContent = entries.length;

    // 今月の登録数
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEntries = entries.filter(e => new Date(e.created_at) >= monthStart);
    const statMonthElements = document.querySelectorAll('#statMonth');
    statMonthElements.forEach(el => el.textContent = monthEntries.length);

    document.getElementById('statUsers').textContent = profiles.length;
    document.getElementById('statProperties').textContent = masterData.properties.length;
}

// ========================================
// 承認待ち
// ========================================

async function loadPendingEntries() {
    try {
        pendingEntries = await getPendingEntries();
        renderPendingEntries();
        document.getElementById('pendingCount').textContent = pendingEntries.length;
    } catch (error) {
        console.error('Failed to load pending entries:', error);
    }
}

function renderPendingEntries() {
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
        const startDate = entry.inspection_start
            ? new Date(entry.inspection_start).toLocaleDateString('ja-JP')
            : '-';

        tr.innerHTML = `
            <td><input type="checkbox" data-id="${escapeHtml(entry.id)}" onchange="updateSelectedPending()"></td>
            <td>${escapeHtml(getUserEmail(entry.user_id))}</td>
            <td>${escapeHtml(entry.property_code)}</td>
            <td>${escapeHtml(entry.inspection_type)}</td>
            <td>${escapeHtml(startDate)}</td>
            <td>${escapeHtml(createdAt)}</td>
            <td>
                <button class="btn btn-outline btn-sm" data-action="detail" data-id="${escapeHtml(entry.id)}">📋</button>
                <button class="btn btn-success btn-sm" data-action="approve" data-id="${escapeHtml(entry.id)}">✅</button>
                <button class="btn btn-outline btn-sm" data-action="reject" data-id="${escapeHtml(entry.id)}">❌</button>
            </td>
        `;
        tr.querySelector('[data-action="detail"]').addEventListener('click', () => showEntryDetail(entry));
        tr.querySelector('[data-action="approve"]').addEventListener('click', () => approveSingle(entry.id));
        tr.querySelector('[data-action="reject"]').addEventListener('click', () => rejectSingle(entry.id));
        tbody.appendChild(tr);
    });
}

function updateSelectedPending() {
    const checkboxes = document.querySelectorAll('#pendingBody input[type="checkbox"]');
    selectedPendingIds = [];
    checkboxes.forEach(cb => {
        if (cb.checked) {
            selectedPendingIds.push(cb.dataset.id);
        }
    });
    document.getElementById('approveAllBtn').disabled = selectedPendingIds.length === 0;
}

async function approveSelected() {
    if (selectedPendingIds.length === 0) return;

    if (!confirm(`選択した${selectedPendingIds.length}件を承認しますか？`)) return;

    try {
        await approveEntries(selectedPendingIds);
        showToast(`${selectedPendingIds.length}件を承認しました`, 'success');
        await loadPendingEntries();
        await loadAllData();
        updateStats();
    } catch (error) {
        console.error('Failed to approve entries:', error);
        showToast('承認に失敗しました', 'error');
    }
}

window.updateSelectedPending = updateSelectedPending;

window.approveSingle = async function(id) {
    if (!confirm('この申請を承認しますか？')) return;

    try {
        await approveEntry(id);
        showToast('承認しました', 'success');
        await loadPendingEntries();
        await loadAllData();
        updateStats();
    } catch (error) {
        console.error('Failed to approve entry:', error);
        showToast('承認に失敗しました', 'error');
    }
};

window.rejectSingle = async function(id) {
    const reason = prompt('却下理由を入力してください（任意）：', '');
    if (reason === null) return;

    try {
        await rejectEntry(id, reason);
        showToast('却下しました', 'success');
        await loadPendingEntries();
        await loadAllData();
        updateStats();
    } catch (error) {
        console.error('Failed to reject entry:', error);
        showToast('却下に失敗しました', 'error');
    }
};

// ========================================
// エントリ詳細表示
// ========================================

function showEntryDetail(entry) {
    const formatDate = (d) => d ? new Date(d).toLocaleDateString('ja-JP') : '-';
    const formatDateTime = (d) => d ? new Date(d).toLocaleString('ja-JP') : '-';

    // terminal_idを正規化（JSON文字列の場合は端末ID文字列を抽出）
    const normalizeTerminalId = (terminalId) => {
        if (!terminalId) return '-';
        if (typeof terminalId === 'string' && terminalId.startsWith('{')) {
            try {
                const parsed = JSON.parse(terminalId);
                return parsed.terminalId || parsed.terminal_id || parsed.id || terminalId;
            } catch (e) {
                return terminalId;
            }
        }
        return terminalId;
    };

    const html = `
        <div class="detail-grid">
            <div class="detail-label">物件コード</div>
            <div class="detail-value">${escapeHtml(entry.property_code)}</div>

            <div class="detail-label">端末ID</div>
            <div class="detail-value">${escapeHtml(normalizeTerminalId(entry.terminal_id))}</div>

            <div class="detail-label">受注先</div>
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
                <div class="detail-value">${entry.display_duration || 6}秒</div>

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
            <div class="detail-section-title">案内文・備考</div>
            <div class="detail-grid">
                <div class="detail-label">案内文</div>
                <div class="detail-value" style="white-space: pre-wrap;">${escapeHtml(entry.announcement || '-')}</div>

                <div class="detail-label">備考</div>
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

function closeEntryDetailModal() {
    document.getElementById('entryDetailModal').classList.remove('active');
}

// ========================================
// フィルター
// ========================================

function populateFilters() {
    const properties = masterData.properties;
    const filterProperty = document.getElementById('filterProperty');

    properties.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.property_code;
        opt.textContent = `${p.property_code} ${p.property_name}`;
        filterProperty.appendChild(opt);
    });
}

// ========================================
// データ一覧
// ========================================

// フィルター保存
function saveFilters() {
    const filters = {
        property: document.getElementById('filterProperty')?.value || '',
        startDate: document.getElementById('filterStartDate')?.value || '',
        endDate: document.getElementById('filterEndDate')?.value || '',
        status: document.getElementById('filterStatus')?.value || ''
    };
    localStorage.setItem('admin_entry_filters', JSON.stringify(filters));
}

// フィルター復元
function restoreFilters() {
    try {
        const saved = localStorage.getItem('admin_entry_filters');
        if (saved) {
            const filters = JSON.parse(saved);
            if (document.getElementById('filterProperty')) document.getElementById('filterProperty').value = filters.property || '';
            if (document.getElementById('filterStartDate')) document.getElementById('filterStartDate').value = filters.startDate || '';
            if (document.getElementById('filterEndDate')) document.getElementById('filterEndDate').value = filters.endDate || '';
            if (document.getElementById('filterStatus')) document.getElementById('filterStatus').value = filters.status || '';
        }
    } catch (error) {
        console.error('Failed to restore filters:', error);
    }
}

async function loadEntries() {
    const propertyCode = document.getElementById('filterProperty').value;
    const startDate = document.getElementById('filterStartDate').value;
    const endDate = document.getElementById('filterEndDate').value;
    const status = document.getElementById('filterStatus')?.value;

    // フィルターを保存
    saveFilters();

    try {
        entries = await getAllEntries({
            propertyCode: propertyCode || undefined,
            startDate: startDate || undefined,
            endDate: endDate || undefined,
            status: status || undefined
        });
        renderEntries();
        updateSelectedEntries();
    } catch (error) {
        console.error('Failed to load entries:', error);
        showToast('データの取得に失敗しました', 'error');
    }
}

function renderEntries() {
    const tbody = document.getElementById('entriesBody');
    const emptyMsg = document.getElementById('entriesEmpty');

    tbody.innerHTML = '';

    if (entries.length === 0) {
        emptyMsg.style.display = 'block';
        document.getElementById('entriesCount').textContent = '0';
        return;
    }

    emptyMsg.style.display = 'none';

    entries.forEach(entry => {
        const tr = document.createElement('tr');
        const createdAt = new Date(entry.created_at).toLocaleString('ja-JP');
        const inspectionStart = entry.inspection_start
            ? new Date(entry.inspection_start).toLocaleDateString('ja-JP')
            : '-';

        // ステータス表示
        const statusLabel = entry.status === 'exported'
            ? '<span class="status-badge status-exported">✓ 取込済</span>'
            : '<span class="status-badge status-submitted">未取込</span>';

        tr.innerHTML = `
            <td><input type="checkbox" class="entry-checkbox" data-id="${entry.id}"></td>
            <td>${escapeHtml(getUserEmail(entry.user_id))}</td>
            <td>${escapeHtml(entry.property_code)}</td>
            <td>${escapeHtml(entry.inspection_type)}</td>
            <td>${escapeHtml(inspectionStart)}</td>
            <td>${statusLabel}</td>
            <td>${escapeHtml(createdAt)}</td>
            <td>
                <button class="btn btn-outline btn-sm" data-action="detail" data-id="${escapeHtml(entry.id)}">📋</button>
                <button class="btn btn-outline btn-sm" data-action="delete" data-id="${escapeHtml(entry.id)}">🗑️</button>
            </td>
        `;
        tr.querySelector('[data-action="detail"]').addEventListener('click', () => showEntryDetail(entry));
        tr.querySelector('[data-action="delete"]').addEventListener('click', () => deleteEntryById(entry.id));
        tr.querySelector('.entry-checkbox').addEventListener('change', updateBulkActionButtons);
        tbody.appendChild(tr);
    });

    document.getElementById('entriesCount').textContent = entries.length;
    updateBulkActionButtons();

    // 全選択チェックボックスをリセット
    const selectAll = document.getElementById('selectAllEntries');
    if (selectAll) selectAll.checked = false;
}

window.deleteEntryById = async function(id) {
    if (!confirm('このデータを削除しますか？')) return;

    try {
        await deleteEntry(id);
        showToast('削除しました', 'success');
        loadEntries();
    } catch (error) {
        showToast('削除に失敗しました', 'error');
    }
};

// 選択状態の更新
function updateSelectedEntries() {
    const checkboxes = document.querySelectorAll('#entriesBody .entry-checkbox:checked');
    const selectedCount = checkboxes.length;
    const selectedInfo = document.getElementById('selectedEntriesInfo');
    const markExportedBtn = document.getElementById('markExportedBtn');
    const markSubmittedBtn = document.getElementById('markSubmittedBtn');

    if (selectedCount > 0) {
        selectedInfo.textContent = `(${selectedCount}件選択中)`;
        markExportedBtn.disabled = false;
        markSubmittedBtn.disabled = false;
    } else {
        selectedInfo.textContent = '';
        markExportedBtn.disabled = true;
        markSubmittedBtn.disabled = true;
    }
}

// 全選択トグル
function toggleSelectAllEntries() {
    const selectAll = document.getElementById('selectAllEntries');
    const checkboxes = document.querySelectorAll('#entriesBody .entry-checkbox');
    checkboxes.forEach(cb => cb.checked = selectAll.checked);
    updateSelectedEntries();
}

// 選択したエントリのIDを取得
function getSelectedEntryIds() {
    const checkboxes = document.querySelectorAll('#entriesBody .entry-checkbox:checked');
    return Array.from(checkboxes).map(cb => cb.dataset.id);
}

// ステータスを一括更新
async function updateEntriesStatus(status) {
    const ids = getSelectedEntryIds();
    if (ids.length === 0) return;

    const statusLabel = status === 'exported' ? '取込済み' : '未取込';
    if (!confirm(`選択した${ids.length}件を「${statusLabel}」に変更しますか？`)) return;

    try {
        await updateEntriesStatusBulk(ids, status);
        showToast(`${ids.length}件を「${statusLabel}」に変更しました`, 'success');
        loadEntries();
    } catch (error) {
        console.error('Status update failed:', error);
        showToast('ステータスの更新に失敗しました', 'error');
    }
}

// 一括削除
async function bulkDeleteEntries() {
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

// 一括操作ボタンの有効/無効切り替え
function updateBulkActionButtons() {
    const checkedCount = document.querySelectorAll('.entry-checkbox:checked').length;
    const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
    const markExportedBtn = document.getElementById('markExportedBtn');
    const markSubmittedBtn = document.getElementById('markSubmittedBtn');

    const hasSelection = checkedCount > 0;
    if (bulkDeleteBtn) bulkDeleteBtn.disabled = !hasSelection;
    if (markExportedBtn) markExportedBtn.disabled = !hasSelection;
    if (markSubmittedBtn) markSubmittedBtn.disabled = !hasSelection;

    // 選択数表示
    const selectedInfo = document.getElementById('selectedEntriesInfo');
    if (selectedInfo) {
        selectedInfo.textContent = hasSelection ? `${checkedCount}件選択中` : '';
    }
}

// ========================================
// CSVエクスポート
// ========================================

function generateCSV(data) {
    if (data.length === 0) return '';

    // script.js と bulk-data.js と同じ28列のヘッダー
    const headers = [
        '点検CO', '端末ID', '物件コード', '受注先名', '緊急連絡先番号',
        '点検工事案内', '掲示板に表示する', '点検案内TPLNo', '点検開始日',
        '点検完了日', '掲示備考', '掲示板用案内文', 'frame_No', '表示開始日',
        '表示終了日', '表示開始時刻', '表示終了時刻', '表示時間', '統合ポリシー',
        '制御', '変更日', '変更時刻', '最終エクスポート日時', 'ID', '変更日時',
        '点検日時', '表示日時', '貼紙区分'
    ];

    // 現在日時
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0].replace(/-/g, '/');
    const timeStr = now.toTimeString().substring(0, 8);

    const csvRows = [headers.join(',')];

    data.forEach(entry => {
        const formatDate = (d) => d ? d.replace(/-/g, '/') : '';
        const displayTime = entry.display_duration || 6;
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

        // terminal_idを正規化（JSON文字列の場合は端末ID文字列を抽出）
        const normalizeTerminalId = (terminalId) => {
            if (!terminalId) return '';
            if (typeof terminalId === 'string' && terminalId.startsWith('{')) {
                try {
                    const parsed = JSON.parse(terminalId);
                    return parsed.terminalId || parsed.terminal_id || parsed.id || terminalId;
                } catch (e) {
                    return terminalId;
                }
            }
            return terminalId;
        };

        const values = [
            '',                                          // 点検CO
            normalizeTerminalId(entry.terminal_id),      // 端末ID
            entry.property_code || '',                   // 物件コード
            entry.vendor_name || '',                     // 受注先名
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

        // CSVエスケープ処理
        csvRows.push(values.map(v => {
            if (v == null) return '';
            const s = String(v);
            return (s.includes(',') || s.includes('"') || s.includes('\n')) ? '"' + s.replace(/"/g, '""') + '"' : s;
        }).join(','));
    });

    return csvRows.join('\n');
}

function getFilteredExportEntries() {
    const exportProperty = document.getElementById('exportProperty').value;
    const exportStartDate = document.getElementById('exportStartDate').value;
    const exportEndDate = document.getElementById('exportEndDate').value;

    return entries.filter(entry => {
        if (exportProperty && String(entry.property_code) !== exportProperty) return false;
        if (exportStartDate && entry.inspection_start < exportStartDate) return false;
        if (exportEndDate && entry.inspection_start > exportEndDate) return false;
        return true;
    });
}

function exportCSV() {
    const filteredEntries = getFilteredExportEntries();
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

function copyCSV() {
    const filteredEntries = getFilteredExportEntries();
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

// ========================================
// ユーザー管理
// ========================================

async function loadUsers() {
    const tbody = document.getElementById('usersBody');
    tbody.innerHTML = '';

    // 現在のユーザーIDを取得
    const currentUser = await getUser();
    const currentUserId = currentUser?.id;

    profiles.forEach(profile => {
        const tr = document.createElement('tr');
        const createdAt = new Date(profile.created_at).toLocaleDateString('ja-JP');
        const roleClass = profile.role === 'admin' ? 'admin' : 'user';
        const roleText = profile.role === 'admin' ? '管理者' : 'ユーザー';
        const isSelf = profile.id === currentUserId;
        const status = profile.status || 'active';
        const statusClass = status === 'active' ? 'status-active' : 'status-inactive';
        const statusText = status === 'active' ? '有効' : '無効';

        // ベンダー名を取得
        let vendorName = '-';
        if (profile.vendor_id) {
            const vendor = masterData.vendors.find(v => v.id === profile.vendor_id);
            vendorName = vendor ? vendor.vendor_name : 'Unknown';
        }

        tr.innerHTML = `
            <td>${escapeHtml(profile.email)}${isSelf ? ' (自分)' : ''}</td>
            <td>${escapeHtml(vendorName)}</td>
            <td><span class="user-role ${roleClass}">${roleText}</span></td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            <td>${createdAt}</td>
            <td>
                <button class="btn btn-sm btn-outline" onclick="openEditUserModal('${profile.id}')" ${isSelf ? 'disabled title="自分は編集できません"' : ''}>編集</button>
                ${!isSelf && status === 'active' ? `<button class="btn btn-sm btn-danger" onclick="handleDeactivateUser('${profile.id}')">無効化</button>` : ''}
                ${!isSelf && status === 'inactive' ? `<button class="btn btn-sm btn-success" onclick="handleActivateUser('${profile.id}')">有効化</button>` : ''}
            </td>
        `;
        tbody.appendChild(tr);
    });

    // 権限変更イベント
    document.querySelectorAll('.role-select').forEach(select => {
        select.addEventListener('change', async (e) => {
            const userId = e.target.dataset.userId;
            const newRole = e.target.value;

            // 自分自身の権限は変更不可（念のため二重チェック）
            if (userId === currentUserId) {
                showToast('自分の権限は変更できません', 'error');
                const profile = profiles.find(p => p.id === userId);
                if (profile) e.target.value = profile.role;
                return;
            }

            try {
                await updateProfileRole(userId, newRole);
                showToast('権限を更新しました', 'success');
                profiles = await getAllProfiles();
                loadUsers();
            } catch (error) {
                showToast('権限の更新に失敗しました', 'error');
                const profile = profiles.find(p => p.id === userId);
                if (profile) e.target.value = profile.role;
            }
        });
    });
}

// ========================================
// ユーザー追加モーダル
// ========================================

async function openUserModal() {
    const modal = document.getElementById('userModal');
    const form = document.getElementById('userForm');
    const vendorSelect = document.getElementById('newUserVendor');
    const submitBtn = document.getElementById('userSubmitBtn');

    form.reset();

    // モーダルタイトルとボタンをリセット
    modal.querySelector('.modal-header h3').textContent = 'ユーザー追加';
    submitBtn.textContent = '追加';
    document.getElementById('newUserEmail').disabled = false;
    document.getElementById('newUserPassword').required = true;
    document.getElementById('newUserPassword').placeholder = '6文字以上';
    form.onsubmit = handleUserFormSubmit;

    // ベンダー選択肢を読み込み
    try {
        const vendors = await getMasterVendors();
        vendorSelect.innerHTML = '<option value="">-- 選択してください --</option>';
        vendors.forEach(v => {
            vendorSelect.innerHTML += `<option value="${v.id}">${escapeHtml(v.vendor_name)}</option>`;
        });
    } catch (error) {
        console.error('Failed to load vendors:', error);
    }

    modal.classList.add('active');
}

function closeUserModal() {
    const modal = document.getElementById('userModal');
    modal.classList.remove('active');
}

async function handleUserFormSubmit(e) {
    e.preventDefault();

    const email = document.getElementById('newUserEmail').value.trim();
    const password = document.getElementById('newUserPassword').value;
    const role = document.getElementById('newUserRole').value;
    const vendorId = document.getElementById('newUserVendor').value || null;
    const submitBtn = document.getElementById('userSubmitBtn');

    if (!vendorId) {
        showToast('メンテナンス会社を選択してください', 'error');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = '追加中...';

    try {
        const user = await createUser(email, password, null, role, vendorId);

        if (user._needsEmailConfirmation) {
            showToast('ユーザーを追加しました（メール確認が必要です）', 'warning');
        } else {
            showToast('ユーザーを追加しました', 'success');
        }
        closeUserModal();

        // ユーザー一覧を更新
        profiles = await getAllProfiles();
        loadUsers();
    } catch (error) {
        console.error('User creation error:', error);
        if (error.message.includes('既に登録')) {
            showToast('このメールアドレスは既に登録されています', 'error');
        } else if (error.message.includes('プロファイル')) {
            showToast(error.message, 'error');
        } else {
            showToast('追加に失敗しました: ' + error.message, 'error');
        }
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '追加';
    }
}

// ユーザー編集モーダル
async function openEditUserModal(userId) {
    const profile = profiles.find(p => p.id === userId);
    if (!profile) return;

    const modal = document.getElementById('userModal');
    const form = document.getElementById('userForm');
    const vendorSelect = document.getElementById('newUserVendor');
    const submitBtn = document.getElementById('userSubmitBtn');

    // フォームに既存データを設定
    document.getElementById('newUserEmail').value = profile.email;
    document.getElementById('newUserEmail').disabled = true; // メールは変更不可
    document.getElementById('newUserPassword').value = '';
    document.getElementById('newUserPassword').required = false; // 編集時はパスワード任意
    document.getElementById('newUserPassword').placeholder = '変更する場合のみ入力';
    document.getElementById('newUserRole').value = profile.role;

    // ベンダー選択肢を読み込み
    try {
        const vendors = await getMasterVendors();
        vendorSelect.innerHTML = '<option value="">-- 選択なし（管理者の場合） --</option>';
        vendors.forEach(v => {
            const selected = v.id === profile.vendor_id ? 'selected' : '';
            vendorSelect.innerHTML += `<option value="${v.id}" ${selected}>${escapeHtml(v.vendor_name)}</option>`;
        });
    } catch (error) {
        console.error('Failed to load vendors:', error);
    }

    // モーダルタイトルとボタンを変更
    modal.querySelector('.modal-header h3').textContent = 'ユーザー編集';
    submitBtn.textContent = '更新';

    // フォーム送信時の処理を編集用に変更
    form.onsubmit = async (e) => {
        e.preventDefault();
        await handleEditUserSubmit(userId);
    };

    modal.classList.add('active');
}

// ユーザー編集の送信処理
async function handleEditUserSubmit(userId) {
    const email = document.getElementById('newUserEmail').value.trim();
    const role = document.getElementById('newUserRole').value;
    const vendorId = document.getElementById('newUserVendor').value || null;
    const submitBtn = document.getElementById('userSubmitBtn');

    if (!vendorId) {
        showToast('メンテナンス会社を選択してください', 'error');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = '更新中...';

    try {
        // プロファイル更新
        await updateUserProfile(userId, {
            role: role,
            vendor_id: vendorId
        });

        showToast('ユーザー情報を更新しました', 'success');
        closeUserModal();

        // フォームをリセット
        const form = document.getElementById('userForm');
        form.onsubmit = handleUserFormSubmit; // 元の処理に戻す
        document.getElementById('newUserEmail').disabled = false;
        document.getElementById('newUserPassword').required = true;
        document.getElementById('newUserPassword').placeholder = '6文字以上';
        form.querySelector('.modal-header h3').textContent = 'ユーザー追加';

        // ユーザー一覧を更新
        profiles = await getAllProfiles();
        loadUsers();
    } catch (error) {
        console.error('User update error:', error);
        showToast('更新に失敗しました: ' + error.message, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '更新';
    }
}

// ユーザーを無効化
async function handleDeactivateUser(userId) {
    if (!confirm('このユーザーを無効化してもよろしいですか？\nログインできなくなります。')) return;

    try {
        await updateUserStatus(userId, 'inactive');
        showToast('ユーザーを無効化しました', 'success');
        profiles = await getAllProfiles();
        loadUsers();
    } catch (error) {
        console.error('Failed to deactivate user:', error);
        showToast('無効化に失敗しました', 'error');
    }
}

// ユーザーを有効化
async function handleActivateUser(userId) {
    try {
        await updateUserStatus(userId, 'active');
        showToast('ユーザーを有効化しました', 'success');
        profiles = await getAllProfiles();
        loadUsers();
    } catch (error) {
        console.error('Failed to activate user:', error);
        showToast('有効化に失敗しました', 'error');
    }
}

// グローバルに公開
window.closeUserModal = closeUserModal;
window.openEditUserModal = openEditUserModal;
window.handleDeactivateUser = handleDeactivateUser;
window.handleActivateUser = handleActivateUser;

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
// グローバルスコープに公開（マスター編集・削除）
// ========================================

// 物件コードで物件を編集（複数端末対応）
window.editPropertyByCode = function(propertyCode) {
    // masterData.propertiesから該当する物件を検索（グループ化済み構造）
    const property = masterData.properties.find(p => String(p.property_code) === String(propertyCode));
    if (!property) return;

    // モーダルに渡すデータを構築
    const propertyData = {
        property_code: property.property_code,
        property_name: property.property_name,
        address: property.address || '',
        terminals: property.terminals || []
    };

    console.log('Opening property modal with data:', propertyData);
    openMasterModal('property', masterData, propertyData);
};

// 物件コードで物件を削除（複数端末対応）
window.deletePropertyByCode = async function(propertyCode) {
    // property_codeで全てのレコードを取得
    const propertyRecords = masterData.properties.filter(p => String(p.property_code) === String(propertyCode));
    if (propertyRecords.length === 0) return;

    // エントリで使用されているかチェック
    const usedEntries = entries.filter(e => String(e.property_code) === String(propertyCode));
    if (usedEntries.length > 0) {
        showToast(`この物件は${usedEntries.length}件のエントリで使用中です`, 'error');
        return false;
    }

    const firstRecord = propertyRecords[0];
    if (!confirm(`物件「${firstRecord.property_name}」（${propertyRecords.length}端末）を削除しますか？`)) return false;

    try {
        // 全てのレコードを削除
        for (const record of propertyRecords) {
            await deleteProperty(record.id);
        }
        showToast('物件を削除しました', 'success');

        // マスターデータを再読み込み
        const newMasterData = await getAllMasterData();
        Object.assign(masterData, newMasterData);
        loadMasterData(masterData);
        updateStats();
        return true;
    } catch (error) {
        console.error('Failed to delete property:', error);
        showToast('削除に失敗しました', 'error');
        return false;
    }
};

window.editProperty = function(id) {
    const property = masterData.properties.find(p => p.id === id);
    if (property) openMasterModal('property', masterData, property);
};

window.editVendor = function(id) {
    const vendor = masterData.vendors.find(v => v.id === id);
    if (vendor) openMasterModal('vendor', masterData, vendor);
};

window.editInspection = function(id) {
    const inspection = masterData.inspectionTypes.find(i => i.id === id);
    if (inspection) openMasterModal('inspection', masterData, inspection);
};

window.editMasterCategory = function(id) {
    const cat = masterData.categories.find(c => c.id === id);
    if (cat) openMasterModal('category', masterData, cat);
};

window.deleteMasterProperty = async function(id) {
    await deleteMasterPropertyAction(id, masterData, entries, showToast, updateStats);
};

window.deleteMasterVendor = async function(id) {
    await deleteMasterVendorAction(id, masterData, showToast);
};

window.deleteMasterInspection = async function(id) {
    await deleteMasterInspectionAction(id, masterData, entries, showToast);
};

window.deleteMasterCategory = async function(id) {
    await deleteMasterCategoryAction(id, masterData, showToast);
};

window.editTemplateImage = function(id) {
    const templateImage = (masterData.templateImages || []).find(ti => ti.id === id);
    if (templateImage) openMasterModal('templateImage', masterData, templateImage);
};

window.deleteMasterTemplateImage = async function(id) {
    await deleteMasterTemplateImageAction(id, masterData, showToast);
};

window.closeMasterModal = closeMasterModal;
window.closeEntryDetailModal = closeEntryDetailModal;

// ========================================
// Building-Vendor Relationships（紐付け管理）
// ========================================

// 紐付け管理タブの初期化
async function initRelationshipsTab() {
    const filterVendor = document.getElementById('filterVendor');

    // ベンダー選択肢を読み込む
    try {
        const vendors = await getMasterVendors();
        filterVendor.innerHTML = '<option value="">-- 選択してください --</option>';
        vendors.forEach(v => {
            filterVendor.innerHTML += `<option value="${v.id}">${escapeHtml(v.vendor_name)}</option>`;
        });
    } catch (error) {
        console.error('Failed to load vendors:', error);
    }

    // ベンダー選択時のイベント
    filterVendor.addEventListener('change', async (e) => {
        const vendorId = e.target.value;
        if (!vendorId) {
            document.getElementById('relationshipSubTabs').style.display = 'none';
            document.getElementById('buildingRelationshipsContainer').style.display = 'none';
            document.getElementById('inspectionRelationshipsContainer').style.display = 'none';
            document.getElementById('relationshipsInitialMessage').style.display = 'block';
            return;
        }

        // サブタブを表示
        document.getElementById('relationshipSubTabs').style.display = 'flex';
        document.getElementById('relationshipsInitialMessage').style.display = 'none';

        // 現在のタイプに応じてロード
        await loadRelationships(vendorId, currentRelationshipType);
    });

    // サブタブ切り替え
    document.querySelectorAll('[data-rel-type]').forEach(tab => {
        tab.addEventListener('click', async () => {
            const relType = tab.dataset.relType;
            currentRelationshipType = relType;

            // タブの active 切り替え
            document.querySelectorAll('[data-rel-type]').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // コンテナの表示切り替え
            const vendorId = filterVendor.value;
            if (vendorId) {
                await loadRelationships(vendorId, relType);
            }
        });
    });
}

// 紐付けを読み込み（物件 or 点検種別）
async function loadRelationships(vendorId, type) {
    if (type === 'buildings') {
        document.getElementById('buildingRelationshipsContainer').style.display = 'block';
        document.getElementById('inspectionRelationshipsContainer').style.display = 'none';
        await loadBuildingVendorRelationships(vendorId);
    } else {
        document.getElementById('buildingRelationshipsContainer').style.display = 'none';
        document.getElementById('inspectionRelationshipsContainer').style.display = 'block';
        await loadVendorInspectionRelationships(vendorId);
    }
}

// 特定ベンダーの物件紐付け一覧を表示
async function loadBuildingVendorRelationships(vendorId) {
    try {
        const [relationships, properties] = await Promise.all([
            getBuildingVendors({ vendorId }),
            getMasterProperties()
        ]);
        renderBuildingVendorRelationships(relationships, properties, vendorId);
    } catch (error) {
        console.error('Failed to load building-vendor relationships:', error);
        showToast('紐付け情報の読み込みに失敗しました', 'error');
    }
}

// 特定ベンダーの点検種別紐付け一覧を表示
async function loadVendorInspectionRelationships(vendorId) {
    try {
        const relationships = await getVendorInspections(vendorId);
        renderVendorInspectionRelationships(relationships, vendorId);
    } catch (error) {
        console.error('Failed to load vendor-inspection relationships:', error);
        showToast('点検種別紐付け情報の読み込みに失敗しました', 'error');
    }
}

// 物件紐付け一覧を描画
function renderBuildingVendorRelationships(relationships, properties, vendorId) {
    const container = document.getElementById('buildingRelationshipsContainer');

    const activeRelationships = relationships.filter(r => r.status === 'active');

    // 物件名を property_code から取得
    const propertiesMap = {};
    properties.forEach(p => {
        propertiesMap[p.property_code] = p.property_name;
    });

    container.innerHTML = `
        <div style="margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: center;">
            <p style="color: #64748b; font-size: 0.875rem; margin: 0;">
                ${activeRelationships.length}件の物件が紐付けられています
            </p>
            <button class="btn btn-primary btn-sm" onclick="openAddBuildingModal('${vendorId}')">
                <span class="btn-icon">➕</span> ビルを追加
            </button>
        </div>
        ${activeRelationships.length === 0 ?
            '<p style="color: #64748b; text-align: center; padding: 2rem;">紐付けがありません</p>' :
            `<div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>物件コード</th>
                            <th>物件名</th>
                            <th>ステータス</th>
                            <th>登録日</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${activeRelationships.map(r => `
                            <tr>
                                <td>${escapeHtml(r.property_code)}</td>
                                <td>${escapeHtml(propertiesMap[r.property_code] || '-')}</td>
                                <td><span class="status-badge status-active">有効</span></td>
                                <td>${new Date(r.created_at).toLocaleDateString('ja-JP')}</td>
                                <td>
                                    <button class="btn btn-danger btn-sm" onclick="handleRemoveBuildingVendor('${r.id}')">削除</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>`
        }
    `;
}

// 点検種別紐付け一覧を描画
function renderVendorInspectionRelationships(relationships, vendorId) {
    const container = document.getElementById('inspectionRelationshipsContainer');

    container.innerHTML = `
        <div style="margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: center;">
            <p style="color: #64748b; font-size: 0.875rem; margin: 0;">
                ${relationships.length}件の点検種別が紐付けられています
            </p>
            <button class="btn btn-primary btn-sm" onclick="openAddInspectionModal('${vendorId}')">
                <span class="btn-icon">➕</span> 点検種別を追加
            </button>
        </div>
        ${relationships.length === 0 ?
            '<p style="color: #64748b; text-align: center; padding: 2rem;">紐付けがありません</p>' :
            `<div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>点検種別</th>
                            <th>カテゴリID</th>
                            <th>ステータス</th>
                            <th>登録日</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${relationships.map(r => `
                            <tr>
                                <td>${escapeHtml(r.signage_master_inspection_types?.inspection_name || '-')}</td>
                                <td>${escapeHtml(r.signage_master_inspection_types?.category_id || '-')}</td>
                                <td><span class="status-badge status-active">有効</span></td>
                                <td>${new Date(r.created_at).toLocaleDateString('ja-JP')}</td>
                                <td>
                                    <button class="btn btn-danger btn-sm" onclick="handleRemoveVendorInspection('${r.id}')">削除</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>`
        }
    `;
}

// ビル追加モーダルを開く
async function openAddBuildingModal(vendorId) {
    const propertyCode = prompt('追加する物件コードを入力してください:');
    if (!propertyCode) return;

    try {
        await addBuildingVendor(propertyCode, vendorId);
        showToast('ビルを追加しました', 'success');
        await loadBuildingVendorRelationships(vendorId);
    } catch (error) {
        console.error('Failed to add building-vendor relationship:', error);
        if (error.message.includes('duplicate') || error.message.includes('unique')) {
            showToast('この物件は既に追加されています', 'error');
        } else if (error.message.includes('foreign key') || error.message.includes('not found')) {
            showToast('物件コードが見つかりません', 'error');
        } else {
            showToast('追加に失敗しました: ' + error.message, 'error');
        }
    }
}

// 点検種別追加モーダルを開く
async function openAddInspectionModal(vendorId) {
    // 利用可能な点検種別を取得（まだ紐付けられていないもの）
    try {
        const [allInspections, linkedInspections] = await Promise.all([
            getMasterInspectionTypes(),
            getVendorInspections(vendorId)
        ]);

        const linkedIds = new Set(linkedInspections.map(r => r.inspection_id));
        const availableInspections = allInspections.filter(i => !linkedIds.has(i.id));

        if (availableInspections.length === 0) {
            showToast('すべての点検種別が既に紐付けられています', 'info');
            return;
        }

        // 選択肢を作成
        const options = availableInspections.map(i => `${i.inspection_name}`).join('\n');
        const selected = prompt(`追加する点検種別を選択してください:\n\n${options}\n\n点検種別名を入力:`);

        if (!selected) return;

        // 選択された点検種別を検索
        const inspection = availableInspections.find(i => i.inspection_name === selected);
        if (!inspection) {
            showToast('点検種別が見つかりません', 'error');
            return;
        }

        // 追加
        await addVendorInspection(vendorId, inspection.id);
        showToast('点検種別を追加しました', 'success');
        await loadVendorInspectionRelationships(vendorId);
    } catch (error) {
        console.error('Failed to add vendor-inspection relationship:', error);
        if (error.message.includes('duplicate') || error.message.includes('unique')) {
            showToast('この点検種別は既に追加されています', 'error');
        } else {
            showToast('追加に失敗しました: ' + error.message, 'error');
        }
    }
}

// 紐付けを削除（非表示化）
async function handleRemoveBuildingVendor(relationshipId) {
    if (!confirm('この紐付けを削除してもよろしいですか？')) return;

    try {
        await removeBuildingVendor(relationshipId);
        showToast('紐付けを削除しました', 'success');
        // 再読み込み
        const vendorId = document.getElementById('filterVendor').value;
        if (vendorId) {
            await loadBuildingVendorRelationships(vendorId);
        }
    } catch (error) {
        console.error('Failed to remove building-vendor relationship:', error);
        showToast('削除に失敗しました', 'error');
    }
}

// 点検種別紐付けを削除
async function handleRemoveVendorInspection(relationshipId) {
    if (!confirm('この点検種別の紐付けを削除してもよろしいですか？')) return;

    try {
        await removeVendorInspection(relationshipId);
        showToast('紐付けを削除しました', 'success');
        // 再読み込み
        const vendorId = document.getElementById('filterVendor').value;
        if (vendorId) {
            await loadVendorInspectionRelationships(vendorId);
        }
    } catch (error) {
        console.error('Failed to remove vendor-inspection relationship:', error);
        showToast('削除に失敗しました', 'error');
    }
}

// ========================================
// Pending Building Requests（ビル追加リクエスト承認）
// ========================================

// ビル追加リクエストを読み込み
async function loadPendingBuildingRequests() {
    try {
        pendingBuildingRequests = await getPendingBuildingRequests();
        renderPendingBuildingRequests();
    } catch (error) {
        console.error('Failed to load pending building requests:', error);
    }
}

// ビル追加リクエストを描画
function renderPendingBuildingRequests() {
    const tbody = document.getElementById('pendingBuildingsBody');
    const emptyMsg = document.getElementById('pendingBuildingsEmpty');
    const countSpan = document.getElementById('pendingBuildingCount');

    countSpan.textContent = pendingBuildingRequests.length;

    if (pendingBuildingRequests.length === 0) {
        tbody.innerHTML = '';
        emptyMsg.style.display = 'block';
        return;
    }

    emptyMsg.style.display = 'none';
    tbody.innerHTML = pendingBuildingRequests.map(req => `
        <tr>
            <td>${escapeHtml(req.property_code)}</td>
            <td>${escapeHtml(req.property_code)}</td>
            <td>${escapeHtml(req.signage_master_vendors?.vendor_name || '-')}</td>
            <td>${getUserEmail(req.requested_by)}</td>
            <td>${new Date(req.created_at).toLocaleString('ja-JP')}</td>
            <td>
                <button class="btn btn-success btn-sm" onclick="handleApproveBuildingRequest('${req.id}')">承認</button>
                <button class="btn btn-danger btn-sm" onclick="handleRejectBuildingRequest('${req.id}')">却下</button>
            </td>
        </tr>
    `).join('');
}

// ビル追加リクエストを承認
async function handleApproveBuildingRequest(requestId) {
    try {
        await approveBuildingRequest(requestId);
        showToast('ビル追加リクエストを承認しました', 'success');
        await loadPendingBuildingRequests();
    } catch (error) {
        console.error('Failed to approve building request:', error);
        showToast('承認に失敗しました', 'error');
    }
}

// ビル追加リクエストを却下
async function handleRejectBuildingRequest(requestId) {
    if (!confirm('このリクエストを却下してもよろしいですか？')) return;

    try {
        await rejectBuildingRequest(requestId);
        showToast('ビル追加リクエストを却下しました', 'success');
        await loadPendingBuildingRequests();
    } catch (error) {
        console.error('Failed to reject building request:', error);
        showToast('却下に失敗しました', 'error');
    }
}

// グローバルに公開
window.handleRemoveBuildingVendor = handleRemoveBuildingVendor;
window.handleRemoveVendorInspection = handleRemoveVendorInspection;
window.openAddBuildingModal = openAddBuildingModal;
window.openAddInspectionModal = openAddInspectionModal;
window.handleApproveBuildingRequest = handleApproveBuildingRequest;
window.handleRejectBuildingRequest = handleRejectBuildingRequest;

// ========================================
// 起動
// ========================================

init();
