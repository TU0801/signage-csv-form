// bulk.js - 一括入力画面のメインエントリーポイント

import { getUser, getProfile, signOut, getAllMasterData } from './supabase-client.js';
import { setMasterData, setCurrentUserId, setCurrentFilter, clearRows, getRows } from './bulk-state.js';
import {
    addRowWithCopy, duplicateSelectedRows, deleteSelectedRows,
    updateSelectedCount, updateRowNumbers, renderRow, addRow
} from './bulk-table.js';
import {
    createContextMenu, showContextMenu, hideContextMenu,
    createBulkEditModal, openBulkEditModal, closeBulkEditModal,
    openRowDetailModal, closeRowDetailModal,
    openPasteModal, closePasteModal, importFromPaste,
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

    document.getElementById('logoutBtn').addEventListener('click', async () => {
        await signOut();
        window.location.href = 'login.html';
    });

    try {
        const masterData = await getAllMasterData();
        setMasterData(masterData);
        console.log('Master data loaded:', masterData);
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
