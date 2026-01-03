// bulk-state.js - 共有状態管理

// ========================================
// 共有状態
// ========================================

export const state = {
    masterData: { properties: [], vendors: [], notices: [], categories: [], templateImages: {} },
    rows: [],
    rowIdCounter: 0,
    currentFilter: 'all', // 'all', 'valid', 'error'
    currentUserId: null,
    draggedRow: null,
    autoSaveTimer: null,
    currentDetailRowId: null,
    appSettings: {
        display_time_max: 30,
        remarks_chars_per_line: 25,
        remarks_max_lines: 5,
        notice_text_max_chars: 200
    }
};

// ========================================
// 状態アクセサ
// ========================================

export function getMasterData() {
    return state.masterData;
}

export function setMasterData(data) {
    state.masterData = data;
}

export function getRows() {
    return state.rows;
}

export function getRowById(id) {
    return state.rows.find(r => r.id === id);
}

export function addRowToState(row) {
    state.rows.push(row);
}

export function removeRowFromState(id) {
    const index = state.rows.findIndex(r => r.id === id);
    if (index !== -1) {
        state.rows.splice(index, 1);
    }
}

export function clearRows() {
    state.rows = [];
    // DOM も削除（状態とDOMの同期）
    const tableBody = document.getElementById('tableBody');
    if (tableBody) {
        tableBody.innerHTML = '';
    }
}

export function getNextRowId() {
    return ++state.rowIdCounter;
}

export function setRowIdCounter(value) {
    state.rowIdCounter = value;
}

export function getCurrentFilter() {
    return state.currentFilter;
}

export function setCurrentFilter(filter) {
    state.currentFilter = filter;
}

export function getCurrentUserId() {
    return state.currentUserId;
}

export function setCurrentUserId(id) {
    state.currentUserId = id;
}

export function getDraggedRow() {
    return state.draggedRow;
}

export function setDraggedRow(row) {
    state.draggedRow = row;
}

export function getAutoSaveTimer() {
    return state.autoSaveTimer;
}

export function setAutoSaveTimer(timer) {
    state.autoSaveTimer = timer;
}

export function getCurrentDetailRowId() {
    return state.currentDetailRowId;
}

export function setCurrentDetailRowId(id) {
    state.currentDetailRowId = id;
}

export function getAppSettings() {
    return state.appSettings;
}

export function setAppSettings(settings) {
    if (!settings) return;
    settings.forEach(s => {
        if (s.setting_key && s.setting_value !== undefined) {
            state.appSettings[s.setting_key] = parseInt(s.setting_value) || s.setting_value;
        }
    });
}
