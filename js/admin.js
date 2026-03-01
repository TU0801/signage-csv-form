// admin.js - 管理者画面のエントリーポイント

import {
    getUser,
    getProfile,
    isAdmin,
    signOut,
    getAllMasterData,
    getAllEntries,
    getAllProfiles,
    getPendingEntries,
    deleteProperty
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
    deleteMasterTemplateImageAction,
    initAdSlotsAdmin
} from './admin-masters.js';

import {
    loadAppSettings,
    saveSettings
} from './admin-settings.js';

import { showToast } from './ui-utils.js';

import {
    exportCSV as _exportCSV,
    copyCSV as _copyCSV,
    exportInspectionReport as _exportInspectionReport,
    downloadCustomImages as _downloadCustomImages
} from './admin-export.js';

import {
    initUserModule,
    loadUsers,
    openUserModal,
    closeUserModal,
    openEditUserModal,
    handleDeactivateUser,
    handleActivateUser
} from './admin-users.js';

import {
    initRelationshipsModule,
    initRelationshipsTab,
    loadPendingBuildingRequests,
    openAddBuildingModal,
    openAddInspectionModal,
    handleRemoveBuildingVendor,
    handleRemoveVendorInspection,
    handleApproveBuildingRequest,
    handleRejectBuildingRequest
} from './admin-relationships.js';

import {
    initEntryEditModule,
    editEntry,
    closeEditModal,
    saveEditedEntry
} from './admin-entry-edit.js';

import {
    initEquipmentModule,
    openEquipmentModal,
    closeEquipmentModal,
    addEquipment,
    deleteEquipmentRow
} from './admin-equipment.js';

import {
    initPendingModule,
    loadPendingEntries,
    renderPendingEntries,
    updateSelectedPending,
    approveSelected
} from './admin-pending.js';

import {
    initEntriesModule,
    initTableSort,
    loadEntries,
    renderEntries,
    populateFilters,
    restoreFilters,
    showEntryDetail,
    closeEntryDetailModal,
    toggleSelectAllEntries,
    getSelectedEntryIds,
    updateEntriesStatus,
    bulkDeleteEntries
} from './admin-entries.js';

// ========================================
// グローバル変数
// ========================================

let masterData = { properties: [], vendors: [], inspectionTypes: [], categories: [], templateImages: [] };
let entries = [];
let profiles = [];
let pendingEntries = [];
let pendingBuildingRequests = [];

// updateStats エイリアス（handleMasterFormSubmit等で使用）
function updateStats() {
    updateSidebarCounts();
}

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
        try {
            await signOut();
            window.location.href = 'login.html';
        } catch (error) {
            console.error('Logout failed:', error);
            showToast('ログアウトに失敗しました', 'error');
        }
    });

    // データ読み込み
    await loadAllData();

    // ユーザー管理モジュール初期化
    initUserModule(
        () => ({ profiles, masterData }),
        (key, value) => { if (key === 'profiles') profiles = value; },
        loadAllData
    );

    // 紐付け管理モジュール初期化
    initRelationshipsModule(
        () => ({ masterData, pendingBuildingRequests, getUserEmail }),
        (key, value) => { if (key === 'pendingBuildingRequests') pendingBuildingRequests = value; }
    );

    // エントリ編集モジュール初期化
    initEntryEditModule(
        () => ({ pendingEntries, entries, masterData }),
        () => ({ loadPendingEntries, loadEntries, renderPendingEntries, renderEntries })
    );

    // 設備管理モジュール初期化
    initEquipmentModule(
        () => ({ masterData })
    );

    // 承認待ちモジュール初期化
    initPendingModule(
        () => ({ pendingEntries, masterData, getUserEmail }),
        () => ({
            setPendingEntries: (val) => { pendingEntries = val; },
            loadAllData,
            updateSidebarCounts,
            showEntryDetail
        })
    );

    // データ一覧モジュール初期化
    initEntriesModule(
        () => ({ entries, masterData, getUserEmail }),
        () => ({
            setEntries: (val) => { entries = val; },
            updateSidebarCounts
        })
    );

    // イベントリスナー設定
    setupEventListeners();

    // #8-1: サイドバー開閉機能
    initSidebarToggle();

    // #8-6: テーブルソート機能
    initTableSort();

    // 初期表示（非同期処理を並列実行）
    await Promise.all([
        loadPendingEntries(),
        loadPendingBuildingRequests(),
        loadEntries(),
        loadUsers(),
        loadAppSettings(),
        initRelationshipsTab()
    ]);

    // マスターデータ読み込み後にUI更新
    loadMasterData(masterData);
    updateSidebarCounts();
    populateFilters();
    restoreFilters(); // フィルターを復元
}

async function loadAllData() {
    const labels = ['マスターデータ', 'エントリ', 'ユーザー', '承認待ち'];
    const results = await Promise.allSettled([
        getAllMasterData(),
        getAllEntries(),
        getAllProfiles(),
        getPendingEntries()
    ]);

    const errors = [];
    if (results[0].status === 'fulfilled') masterData = results[0].value;
    else { console.error('Failed to load master data:', results[0].reason); errors.push(labels[0]); }

    if (results[1].status === 'fulfilled') entries = results[1].value;
    else { console.error('Failed to load entries:', results[1].reason); errors.push(labels[1]); }

    if (results[2].status === 'fulfilled') profiles = results[2].value;
    else { console.error('Failed to load profiles:', results[2].reason); errors.push(labels[2]); }

    if (results[3].status === 'fulfilled') pendingEntries = results[3].value;
    else { console.error('Failed to load pending entries:', results[3].reason); errors.push(labels[3]); }

    if (errors.length > 0) {
        showToast(`一部データの取得に失敗しました: ${errors.join(', ')}`, 'error');
    }

    // 検索期間開始を今日の日付にデフォルト設定（全データ洗い替え運用のため）
    const today = new Date().toISOString().split('T')[0];
    const filterStartDate = document.getElementById('filterStartDate');
    if (filterStartDate && !filterStartDate.value) {
        filterStartDate.value = today;
    }
}

// ========================================
// #8-1: サイドバー開閉機能
// ========================================

function initSidebarToggle() {
    const sidebar = document.querySelector('.admin-sidebar');
    const toggle = document.getElementById('sidebarToggle');
    if (!sidebar || !toggle) return;

    // LocalStorageから状態を復元
    const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    if (isCollapsed) {
        sidebar.classList.add('collapsed');
        toggle.textContent = '▶';
    }

    toggle.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        const collapsed = sidebar.classList.contains('collapsed');
        toggle.textContent = collapsed ? '▶' : '◀';
        localStorage.setItem('sidebarCollapsed', collapsed);
    });
}

// ========================================
// イベントリスナー
// ========================================

function setupEventListeners() {
    // モーダル閉じるボタン（onclick属性からaddEventListenerへ移行）
    document.getElementById('masterModalCloseBtn')?.addEventListener('click', () => closeMasterModal());
    document.getElementById('masterModalCancelBtn')?.addEventListener('click', () => closeMasterModal());
    document.getElementById('entryDetailCloseBtn')?.addEventListener('click', () => closeEntryDetailModal());
    document.getElementById('entryDetailDismissBtn')?.addEventListener('click', () => closeEntryDetailModal());
    document.getElementById('userModalCloseBtn')?.addEventListener('click', () => closeUserModal());
    document.getElementById('userModalCancelBtn')?.addEventListener('click', () => closeUserModal());
    document.getElementById('equipmentModalCloseBtn')?.addEventListener('click', () => window.closeEquipmentModal());
    document.getElementById('addEquipmentBtn')?.addEventListener('click', () => window.addEquipment());

    // タブ切り替え（サイドバーナビゲーション + 旧タブ対応）
    const tabSelectors = '.admin-tab[data-tab], .sidebar-nav-link[data-tab]';
    let _adSlotsInitialized = false;
    document.querySelectorAll(tabSelectors).forEach(tab => {
        tab.addEventListener('click', () => {
            // すべてのタブからactiveを削除
            document.querySelectorAll(tabSelectors).forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

            // クリックされたタブをアクティブに
            tab.classList.add('active');
            document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');

            // 広告枠タブ: 初回のみ初期化
            if (tab.dataset.tab === 'ads' && !_adSlotsInitialized) {
                _adSlotsInitialized = true;
                initAdSlotsAdmin(showToast);
            }
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

    // 承認待ちサブタブ切り替え
    document.querySelectorAll('.admin-tab[data-approval-type]').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.admin-tab[data-approval-type]').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.approval-section').forEach(c => c.style.display = 'none');
            tab.classList.add('active');
            document.getElementById(`approval-${tab.dataset.approvalType}`).style.display = 'block';
        });
    });

    // テンプレート画像カテゴリータブ切り替え
    document.querySelectorAll('.category-tab[data-template-category]').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.category-tab[data-template-category]').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const category = tab.dataset.templateCategory;
            renderTemplateImages(masterData, '', category);
        });
    });

    // 検索
    document.getElementById('searchBtn').addEventListener('click', loadEntries);

    // #8-3: 点検レポート出力
    document.getElementById('exportReportBtn').addEventListener('click', () => _exportInspectionReport(entries, masterData, getSelectedEntryIds));

    // CSVエクスポート
    document.getElementById('exportCsvBtn').addEventListener('click', () => _exportCSV(entries));
    document.getElementById('exportCopyBtn').addEventListener('click', () => _copyCSV(entries));
    document.getElementById('downloadCustomImagesBtn')?.addEventListener('click', () => _downloadCustomImages(entries));

    // 一括削除
    document.getElementById('bulkDeleteBtn').addEventListener('click', bulkDeleteEntries);

    // 全選択チェックボックス
    document.getElementById('selectAllEntries').addEventListener('change', () => toggleSelectAllEntries());
    document.getElementById('markExportedBtn')?.addEventListener('click', () => updateEntriesStatus('exported'));
    document.getElementById('markSubmittedBtn')?.addEventListener('click', () => updateEntriesStatus('ready'));
    document.getElementById('revertToPendingBtn')?.addEventListener('click', () => updateEntriesStatus('pending'));

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
        const activeTab = document.querySelector('.category-tab[data-template-category].active');
        const category = activeTab?.dataset.templateCategory || '';
        renderTemplateImages(masterData, e.target.value, category);
    });

    // 設定保存ボタン
    document.getElementById('saveSettingsBtn')?.addEventListener('click', () => saveSettings(showToast));

    // マスターフォーム送信
    document.getElementById('masterForm').addEventListener('submit', (e) => {
        e.preventDefault();
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
    // userForm.onsubmit is set dynamically in openUserModal/openEditUserModal
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
            if (document.getElementById('equipmentModal')?.classList.contains('active')) {
                window.closeEquipmentModal();
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
// サイドバー件数
// ========================================

function updateSidebarCounts() {
    // 承認待ち件数（データ承認 + ビル追加リクエスト）
    const pendingCount = pendingEntries.length + pendingBuildingRequests.length;
    const navPending = document.getElementById('navPendingCount');
    if (navPending) navPending.textContent = pendingCount || '';

    // 全件数
    const allCount = entries.length;
    const navApproved = document.getElementById('navApprovedCount');
    if (navApproved) navApproved.textContent = allCount || '';
}

window.updateSelectedPending = updateSelectedPending;

// showToastをグローバルスコープに公開（error-handler.js等で使用）
window.showToast = showToast;

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
        updateSidebarCounts();
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


// グローバルに公開（動的onclick用）
window.editEntry = editEntry;
window.closeEditModal = closeEditModal;
window.saveEditedEntry = saveEditedEntry;
window.handleRemoveBuildingVendor = handleRemoveBuildingVendor;
window.handleRemoveVendorInspection = handleRemoveVendorInspection;
window.openAddBuildingModal = openAddBuildingModal;
window.openAddInspectionModal = openAddInspectionModal;
window.handleApproveBuildingRequest = handleApproveBuildingRequest;
window.handleRejectBuildingRequest = handleRejectBuildingRequest;
window.openEquipmentModal = openEquipmentModal;
window.closeEquipmentModal = closeEquipmentModal;
window.addEquipment = addEquipment;
window.deleteEquipmentRow = deleteEquipmentRow;

// ========================================
// 起動
// ========================================

init();
