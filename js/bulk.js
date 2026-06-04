// bulk.js - 一括入力画面のメインエントリーポイント

import { getUser, getProfile, isAdmin, signOut, getAllMasterDataCamelCase, getSettings, getMasterVendors, getBuildingsByVendor, addBuildingVendor } from './supabase-client.js';
import { setMasterData, getMasterData, setCurrentUserId, setCurrentFilter, clearRows, getRows, setAppSettings, setCurrentVendor, getCurrentVendor } from './bulk-state.js';
import {
    addRowWithCopy, duplicateSelectedRows, deleteSelectedRows,
    updateSelectedCount, updateRowNumbers, renderRow, addRow
} from './bulk-table.js';
import {
    createContextMenu, showContextMenu, hideContextMenu,
    openRowDetailModal, closeRowDetailModal,
    openPasteModal, closePasteModal, importFromPaste, downloadExcelTemplate,
    openSaveTemplateModal, closeTemplateModal, saveTemplate,
    loadTemplates, applyTemplate,
    openManageTemplateModal, closeManageTemplateModal
} from './bulk-modals.js';
import {
    triggerAutoSave, restoreAutoSave, saveAll,
    downloadCSV, copyCSV,
    updateStats, updateEmptyState, updateButtons, applyFilter
} from './bulk-data.js';
import { showToast } from './ui-utils.js';

// ========================================
// コールバックオブジェクト
// ========================================

const callbacks = {
    showToast,
    triggerAutoSave,
    updateStats,
    updateEmptyState,
    updateButtons,
    updateRowNumbers,
    updateSelectedCount: () => updateSelectedCount(callbacks),
    showContextMenu: (e, rowId) => showContextMenu(e, rowId),
    openRowDetailModal: (rowId) => openRowDetailModal(rowId, callbacks),
    loadTemplates,
    clearRows
};

// ========================================
// 初期化
// ========================================

async function init() {
    const user = await getUser();
    if (!user) {
        window.location.href = 'login.html';
        return;
    }
    setCurrentUserId(user.id);

    const profile = await getProfile();
    document.getElementById('userEmail').textContent = profile?.email || user.email;

    // 管理者の場合は管理リンクとベンダー選択を表示
    const admin = await isAdmin();
    if (admin) {
        document.getElementById('adminLink').style.display = 'block';
        document.getElementById('adminVendorSelectGroup').style.display = 'block';

        // ベンダー一覧を読み込み
        const vendors = await getMasterVendors();
        const vendorSelect = document.getElementById('adminVendorSelect');
        vendors.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v.id;
            opt.textContent = v.vendor_name; // getMasterVendors() returns snake_case
            vendorSelect.appendChild(opt);
        });

        // ベンダー選択変更時
        vendorSelect.addEventListener('change', async (e) => {
            try {
                const vendorId = e.target.value;
                if (!vendorId) {
                    // 全データに戻す
                    const freshData = await getAllMasterDataCamelCase();
                    setMasterData(freshData);
                    setCurrentVendor(null, null);
                    loadTemplates(); // 企業未選択 → 全社共通テンプレートのみ表示
                    return;
                }

                // 選択したベンダー名を取得して設定
                const selectedVendor = vendors.find(v => v.id === vendorId);
                setCurrentVendor(vendorId, selectedVendor?.vendor_name || null);

                // 選択したベンダーの担当ビルのみを取得
                const buildings = await getBuildingsByVendor(vendorId);

                // buildingsをcamelCaseに変換（getBuildingsByVendorはsnake_caseを返す）
                const buildingsCamelCase = [];
                buildings.forEach(b => {
                    const terminals = Array.isArray(b.terminals) ? b.terminals : [];
                    terminals.forEach(t => {
                        buildingsCamelCase.push({
                            propertyCode: b.property_code,
                            propertyName: b.property_name,
                            terminalId: t.terminalId || t.terminal_id || '',
                            supplement: t.supplement || '',
                            address: b.address || ''
                        });
                    });
                });

                // masterDataを更新
                const currentMasterData = getMasterData();
                currentMasterData.properties = buildingsCamelCase;
                setMasterData(currentMasterData);

                // テーブルをクリア（物件が変わったため）
                clearRows();
                updateStats();
                updateEmptyState();
                loadTemplates(); // 選択した企業のテンプレートのみ表示
            } catch (error) {
                console.error('Failed to load vendor data:', error);
                showToast('保守会社データの取得に失敗しました', 'error');
            }
        });
    } else {
        // 一般ユーザー：プロファイルから保守会社を取得して固定
        if (profile.vendor_id) {
            // マスターデータ取得後に vendor_name を検索するため、後で設定
        }
    }

    document.getElementById('logoutBtn').addEventListener('click', async () => {
        try {
            await signOut();
            window.location.href = 'login.html';
        } catch (error) {
            console.error('Logout failed:', error);
            showToast('ログアウトに失敗しました', 'error');
        }
    });

    try {
        const [masterData, settings] = await Promise.all([
            getAllMasterDataCamelCase(),
            getSettings()
        ]);
        setMasterData(masterData);
        setAppSettings(settings);

        // 一般ユーザーの場合、プロファイルから保守会社を設定
        if (!admin && profile.vendor_id) {
            const vendor = masterData.vendors.find(v => v.id === profile.vendor_id);
            setCurrentVendor(profile.vendor_id, vendor?.vendorName || null);
        }

        console.log('Master data loaded:', masterData);
        console.log('App settings loaded:', settings);
        console.log('🔍 Properties debug:', {
            count: masterData.properties?.length,
            first: masterData.properties?.[0],
            sample: masterData.properties?.slice(0, 3)
        });
    } catch (error) {
        console.error('Failed to load master data:', error);
        showToast('マスターデータの取得に失敗しました', 'error');
        return;
    }

    setupEventListeners();
    loadTemplates();
    restoreAutoSave(callbacks);
    updateStats();
    updateEmptyState();
    createContextMenu(callbacks);
}

// ========================================
// イベントリスナー
// ========================================

function setupEventListeners() {
    // 行追加
    document.getElementById('addRowBtn').addEventListener('click', () => {
        addRowWithCopy(callbacks);
    });

    const emptyAddBtn = document.getElementById('emptyAddBtn');
    if (emptyAddBtn) {
        emptyAddBtn.addEventListener('click', () => {
            addRowWithCopy(callbacks);
        });
    }

    // 選択削除
    document.getElementById('deleteSelectedBtn').addEventListener('click', () => {
        deleteSelectedRows(callbacks);
    });

    // 全選択
    document.getElementById('selectAll').addEventListener('change', (e) => {
        const checkboxes = document.querySelectorAll('#tableBody input[type="checkbox"]');
        checkboxes.forEach(cb => cb.checked = e.target.checked);
        updateSelectedCount(callbacks);
    });

    // ペーストモーダル
    document.getElementById('pasteBtn').addEventListener('click', openPasteModal);
    document.getElementById('closePasteModal').addEventListener('click', closePasteModal);
    document.getElementById('cancelPasteBtn').addEventListener('click', closePasteModal);
    document.getElementById('importPasteBtn').addEventListener('click', () => importFromPaste(callbacks));
    document.getElementById('downloadTemplateBtn').addEventListener('click', downloadExcelTemplate);
    document.getElementById('pasteModal').addEventListener('click', (e) => {
        if (e.target.id === 'pasteModal') closePasteModal();
    });

    // 保存
    document.getElementById('saveBtn').addEventListener('click', () => saveAll(callbacks));

    // CSV
    document.getElementById('downloadCsvBtn').addEventListener('click', () => downloadCSV(callbacks));
    document.getElementById('copyCsvBtn').addEventListener('click', () => copyCSV(callbacks));

    // キーボードショートカット
    document.addEventListener('keydown', handleGlobalKeyDown);

    // 複製
    const duplicateBtn = document.getElementById('duplicateBtn');
    if (duplicateBtn) {
        duplicateBtn.addEventListener('click', () => duplicateSelectedRows(callbacks));
    }

    // フィルター
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            setCurrentFilter(btn.dataset.filter);
            applyFilter();
        });
    });

    // テンプレート
    const templateSelect = document.getElementById('templateSelect');
    if (templateSelect) {
        templateSelect.addEventListener('change', (e) => {
            if (e.target.value) {
                applyTemplate(e.target.value, callbacks);
            }
        });
    }

    // テンプレート保存
    const saveTemplateBtn = document.getElementById('saveTemplateBtn');
    if (saveTemplateBtn) {
        saveTemplateBtn.addEventListener('click', openSaveTemplateModal);
    }

    const confirmSaveTemplate = document.getElementById('confirmSaveTemplate');
    if (confirmSaveTemplate) {
        confirmSaveTemplate.addEventListener('click', () => saveTemplate(callbacks));
    }

    const cancelSaveTemplate = document.getElementById('cancelSaveTemplate');
    if (cancelSaveTemplate) {
        cancelSaveTemplate.addEventListener('click', closeTemplateModal);
    }

    const closeTemplateModalBtn = document.getElementById('closeTemplateModal');
    if (closeTemplateModalBtn) {
        closeTemplateModalBtn.addEventListener('click', closeTemplateModal);
    }

    // テンプレート管理（一覧・削除）
    const manageTemplateBtn = document.getElementById('manageTemplateBtn');
    if (manageTemplateBtn) {
        manageTemplateBtn.addEventListener('click', () => openManageTemplateModal(callbacks));
    }

    const closeManageTemplateModalBtn = document.getElementById('closeManageTemplateModal');
    if (closeManageTemplateModalBtn) {
        closeManageTemplateModalBtn.addEventListener('click', closeManageTemplateModal);
    }

    const closeManageTemplateFooter = document.getElementById('closeManageTemplateFooter');
    if (closeManageTemplateFooter) {
        closeManageTemplateFooter.addEventListener('click', closeManageTemplateModal);
    }

    // オーバーレイ（背景）クリックで閉じる（pasteModal と同様）
    const manageTemplateModal = document.getElementById('manageTemplateModal');
    if (manageTemplateModal) {
        manageTemplateModal.addEventListener('click', (e) => {
            if (e.target.id === 'manageTemplateModal') closeManageTemplateModal();
        });
    }

    // 右クリックメニューを閉じる
    document.addEventListener('click', hideContextMenu);

    // ページ離脱警告
    window.addEventListener('beforeunload', (e) => {
        if (getRows().length > 0) {
            e.preventDefault();
            e.returnValue = '';
        }
    });
}

// ========================================
// キーボードショートカット
// ========================================

function handleGlobalKeyDown(e) {
    // Ctrl+Enter: 行追加
    if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        addRowWithCopy(callbacks);
    }

    // Ctrl+D: 複製
    if (e.ctrlKey && e.key === 'd') {
        e.preventDefault();
        duplicateSelectedRows(callbacks);
    }

    // Delete: 選択削除
    if (e.key === 'Delete' && !e.target.matches('input, textarea, select')) {
        e.preventDefault();
        deleteSelectedRows(callbacks);
    }

    // Escape: モーダルを閉じる
    if (e.key === 'Escape') {
        closePasteModal();
        closeTemplateModal();
        closeManageTemplateModal();
        closeRowDetailModal();
        hideContextMenu();
    }
}

// ========================================
// 起動
// ========================================

document.addEventListener('DOMContentLoaded', init);
