// bulk.js - 一括入力画面のメインエントリーポイント

import { getUser, getProfile, isAdmin, signOut, getAllMasterDataCamelCase, getSettings, getMasterVendors, getBuildingsByVendor, addBuildingVendor } from './supabase-client.js';
import { setMasterData, getMasterData, setCurrentUserId, setCurrentFilter, clearRows, getRows, setAppSettings } from './bulk-state.js';
import {
    addRowWithCopy, duplicateSelectedRows, deleteSelectedRows,
    updateSelectedCount, updateRowNumbers, renderRow, addRow
} from './bulk-table.js';
import {
    createContextMenu, showContextMenu, hideContextMenu,
    createBulkEditModal, openBulkEditModal, closeBulkEditModal,
    openRowDetailModal, closeRowDetailModal,
    openPasteModal, closePasteModal, importFromPaste, downloadExcelTemplate,
    openSaveTemplateModal, closeTemplateModal, saveTemplate,
    loadTemplates, applyTemplate
} from './bulk-modals.js';
import {
    triggerAutoSave, restoreAutoSave, saveAll,
    downloadCSV, copyCSV, showToast,
    updateStats, updateEmptyState, updateButtons, applyFilter
} from './bulk-data.js';

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
            const vendorId = e.target.value;
            if (!vendorId) {
                // 全データに戻す
                const freshData = await getAllMasterDataCamelCase();
                setMasterData(freshData);
                return;
            }

            // 選択したベンダーの担当ビルのみを取得
            const buildings = await getBuildingsByVendor(vendorId);

            // masterDataを更新
            const currentMasterData = getMasterData();
            currentMasterData.properties = buildings;
            setMasterData(currentMasterData);

            // テーブルをクリア（物件が変わったため）
            clearRows();
            updateStats();
            updateEmptyState();
        });
    } else {
        // 一般ユーザーの場合は物件追加リクエストボタンを表示
        const requestBtn = document.getElementById('requestBuildingBtn');
        requestBtn.style.display = 'block';
        requestBtn.addEventListener('click', async () => {
            const propertyCode = prompt('追加したい物件コードを入力してください:');
            if (!propertyCode) return;

            try {
                await addBuildingVendor(propertyCode);
                showToast('物件追加リクエストを送信しました。管理者の承認をお待ちください。', 'success');
            } catch (error) {
                console.error('Failed to request building:', error);
                if (error.message.includes('duplicate') || error.message.includes('unique')) {
                    showToast('この物件は既にリクエスト済みです', 'error');
                } else {
                    showToast('リクエストに失敗しました: ' + error.message, 'error');
                }
            }
        });
    }

    document.getElementById('logoutBtn').addEventListener('click', async () => {
        await signOut();
        window.location.href = 'login.html';
    });

    try {
        const [masterData, settings] = await Promise.all([
            getAllMasterDataCamelCase(),
            getSettings()
        ]);
        setMasterData(masterData);
        setAppSettings(settings);
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
    createBulkEditModal(callbacks);
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

    // 一括編集
    const bulkEditBtn = document.getElementById('bulkEditBtn');
    if (bulkEditBtn) {
        bulkEditBtn.addEventListener('click', () => openBulkEditModal(callbacks));
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

    // Ctrl+E: 一括編集
    if (e.ctrlKey && e.key === 'e') {
        e.preventDefault();
        openBulkEditModal(callbacks);
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
        closeBulkEditModal();
        closeRowDetailModal();
        hideContextMenu();
    }
}

// ========================================
// 起動
// ========================================

document.addEventListener('DOMContentLoaded', init);
