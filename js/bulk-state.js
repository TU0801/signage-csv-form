// bulk-state.js - 共有状態管理

// ========================================
// 共有状態
// ========================================

export const state = {
    masterData: { properties: [], vendors: [], inspectionTypes: [] },
    rows: [],
    rowIdCounter: 0,
    currentFilter: 'all', // 'all', 'valid', 'error'
    currentUserId: null,
    draggedRow: null,
    autoSaveTimer: null,
    currentDetailRowId: null
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
