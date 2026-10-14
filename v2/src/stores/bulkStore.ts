import { create } from 'zustand';
import type {
  BulkEntryRow,
  BulkFilter,
  BulkMasterData,
  BulkRowInput,
  BulkSettings,
  BulkVendorSelection,
} from '@/features/bulk-entry/types';
import {
  DEFAULT_BULK_SETTINGS,
  EMPTY_BULK_MASTER,
  defaultDisplayTime,
  resolveTerminal,
} from '@/features/bulk-entry/utils/bulkMaster';
import { validateBulkRow } from '@/features/bulk-entry/utils/validateBulkRow';
import { AUTO_SAVE_DELAY_MS, writeAutoSave } from '@/features/bulk-entry/utils/bulkAutoSave';

/** 行の詳細設定モーダルで変える項目 */
export type BulkRowDetail = Pick<
  BulkEntryRow,
  'noticeText' | 'displayStartDate' | 'displayStartTime' | 'displayEndDate' | 'displayEndTime' | 'displayTime' | 'position'
>;

/** 今日（UTC の日付。v1 の `new Date().toISOString().split('T')[0]` と同じ） */
function todayUtc(): string {
  return new Date().toISOString().split('T')[0]!;
}

let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

export interface BulkState {
  rows: BulkEntryRow[];
  rowIdCounter: number;
  filter: BulkFilter;
  selectedIds: Set<number>;
  draggedRowId: number | null;
  masterData: BulkMasterData;
  appSettings: BulkSettings;
  currentVendor: BulkVendorSelection;
  userId: string | null;
  /** 右クリックメニューの「この行をコピー」で覚えた行 */
  copiedRow: BulkEntryRow | null;
  /** 読み込み（マスター・設定・自動保存の復元の確認）を終えたか。画面を離れて戻ったときに読み直さないため */
  sessionLoaded: boolean;

  setUserId: (id: string | null) => void;
  setMasterData: (data: BulkMasterData) => void;
  setAppSettings: (settings: BulkSettings) => void;
  setCurrentVendor: (vendor: BulkVendorSelection) => void;
  setSessionLoaded: (loaded: boolean) => void;

  addRow: (data?: BulkRowInput) => number;
  addRowWithCopy: () => void;
  duplicateRows: (ids: number[]) => void;
  /** 行が無ければ false */
  duplicateRowFromMenu: (id: number) => boolean;
  /** コピーした行が無ければ false */
  pasteCopiedRow: () => boolean;
  insertRowAt: (index: number) => void;
  removeRows: (ids: number[]) => void;
  /** 物件・端末・点検種別・点検終了日の変更（変更後に検証する） */
  updateRow: (id: number, patch: Partial<Pick<BulkEntryRow, 'terminalId' | 'inspectionType' | 'endDate'>>) => void;
  changeProperty: (id: number, propertyCode: string) => void;
  changeStartDate: (id: number, startDate: string) => void;
  changeRemarks: (id: number, remarks: string) => void;
  applyRowDetail: (id: number, detail: BulkRowDetail) => void;
  reorderRows: (draggedId: number, targetId: number) => void;
  clearRows: () => void;
  /** 行を全部置き換える（テンプレート適用） */
  replaceRows: (rows: BulkRowInput[]) => void;
  /** 自動保存から戻す */
  restoreRows: (rows: BulkRowInput[], rowIdCounter: number) => void;
  copyRow: (id: number) => void;

  setFilter: (filter: BulkFilter) => void;
  toggleSelection: (id: number) => void;
  selectAll: () => void;
  clearSelection: () => void;
  setDraggedRowId: (id: number | null) => void;

  triggerAutoSave: () => void;
  saveAutoSaveNow: () => void;
}

export const useBulkStore = create<BulkState>((set, get) => {
  /** v1: js/bulk-table.js validateRow */
  const validate = (row: BulkEntryRow): BulkEntryRow => {
    const { masterData, appSettings } = get();
    const errors = validateBulkRow(row, masterData.properties, appSettings);
    return { ...row, errors, isValid: errors.length === 0 };
  };

  /**
   * 行を作る（端末は物件に合わせて決め直し、検証まで済ませる）。v1: js/bulk-table.js addRow + renderRow
   */
  const buildRow = (id: number, data: BulkRowInput): BulkEntryRow => {
    const { masterData, appSettings, currentVendor } = get();
    const row: BulkEntryRow = {
      id,
      propertyCode: data.propertyCode || '',
      terminalId: data.terminalId || '',
      vendorName: data.vendorName || currentVendor.name || '',
      inspectionType: data.inspectionType || '',
      startDate: data.startDate || todayUtc(),
      endDate: data.endDate || '',
      remarks: data.remarks || '',
      displayTime: data.displayTime || defaultDisplayTime(appSettings),
      noticeText: data.noticeText || '',
      displayStartDate: data.displayStartDate || '',
      displayStartTime: data.displayStartTime || '',
      displayEndDate: data.displayEndDate || '',
      displayEndTime: data.displayEndTime || '',
      showOnBoard: data.showOnBoard !== undefined ? data.showOnBoard : true,
      position: data.position !== undefined ? data.position : 2,
      isValid: false,
      errors: [],
    };
    if (row.propertyCode) {
      row.terminalId = resolveTerminal(masterData.properties, row.propertyCode, row.terminalId, true);
    }
    return validate(row);
  };

  const appendRows = (inputs: BulkRowInput[]) => {
    let counter = get().rowIdCounter;
    const newRows = inputs.map((data) => buildRow(++counter, data));
    set((s) => ({ rows: [...s.rows, ...newRows], rowIdCounter: counter }));
    return newRows;
  };

  /** 保守会社名以外を全部写す（複製・コピーした行の貼り付け）。v1: js/bulk-modals.js handleContextMenuAction duplicate */
  const copyFields = (r: BulkEntryRow): BulkRowInput => ({
    propertyCode: r.propertyCode,
    terminalId: r.terminalId,
    inspectionType: r.inspectionType,
    startDate: r.startDate,
    endDate: r.endDate,
    remarks: r.remarks,
    displayTime: r.displayTime,
    noticeText: r.noticeText,
    displayStartDate: r.displayStartDate,
    displayStartTime: r.displayStartTime,
    displayEndDate: r.displayEndDate,
    displayEndTime: r.displayEndTime,
    showOnBoard: r.showOnBoard,
    position: r.position,
  });

  const mapRow = (id: number, fn: (r: BulkEntryRow) => BulkEntryRow) =>
    set((s) => ({ rows: s.rows.map((r) => (r.id === id ? fn(r) : r)) }));

  return {
    rows: [],
    rowIdCounter: 0,
    filter: 'all',
    selectedIds: new Set<number>(),
    draggedRowId: null,
    masterData: EMPTY_BULK_MASTER,
    appSettings: DEFAULT_BULK_SETTINGS,
    currentVendor: { id: null, name: null },
    userId: null,
    copiedRow: null,
    sessionLoaded: false,

    setUserId: (id) => set({ userId: id }),
    setMasterData: (data) => set({ masterData: data }),
    setAppSettings: (settings) => set({ appSettings: settings }),
    setCurrentVendor: (vendor) => set({ currentVendor: vendor }),
    setSessionLoaded: (loaded) => set({ sessionLoaded: loaded }),

    // v1: js/bulk-table.js addRow
    addRow: (data = {}) => {
      const [row] = appendRows([data]);
      get().triggerAutoSave();
      return row!.id;
    },

    // 最後の行の物件・端末・点検種別・点検日・表示時間・位置を引き継ぐ（備考は空）。v1: js/bulk-table.js addRowWithCopy
    addRowWithCopy: () => {
      const { rows, addRow } = get();
      const last = rows[rows.length - 1];
      if (!last) {
        addRow({});
        return;
      }
      addRow({
        propertyCode: last.propertyCode,
        terminalId: last.terminalId,
        vendorName: last.vendorName,
        inspectionType: last.inspectionType,
        startDate: last.startDate,
        endDate: last.endDate,
        remarks: '',
        displayTime: last.displayTime,
        position: last.position,
      });
    },

    // 選択行の複製（保守会社名も写す）。v1: js/bulk-table.js duplicateSelectedRows
    // 選んだ順ではなく表の並び順で複製する（v1 getSelectedRowIds は表の上から返す）
    duplicateRows: (ids) => {
      const idSet = new Set(ids);
      const sources = get().rows.filter((r) => idSet.has(r.id));
      appendRows(sources.map((r) => ({ ...copyFields(r), vendorName: r.vendorName })));
      get().triggerAutoSave();
    },

    // 右クリックの「この行を複製」（保守会社名は今の保守会社）。v1: js/bulk-modals.js handleContextMenuAction duplicate
    duplicateRowFromMenu: (id) => {
      const row = get().rows.find((r) => r.id === id);
      if (!row) return false;
      get().addRow(copyFields(row));
      return true;
    },

    // 右クリックの「ペースト」。v1: js/bulk-modals.js handleContextMenuAction pasteRow
    pasteCopiedRow: () => {
      const { copiedRow } = get();
      if (!copiedRow) return false;
      get().addRow(copyFields(copiedRow));
      return true;
    },

    // 空の行を挟む（点検開始日・保守会社名も空のまま）。v1: js/bulk-table.js insertRowAt
    insertRowAt: (index) => {
      const { rowIdCounter, appSettings } = get();
      const id = rowIdCounter + 1;
      const blank: BulkEntryRow = {
        id,
        propertyCode: '',
        terminalId: '',
        vendorName: '',
        inspectionType: '',
        startDate: '',
        endDate: '',
        remarks: '',
        displayTime: defaultDisplayTime(appSettings),
        noticeText: '',
        displayStartDate: '',
        displayStartTime: '',
        displayEndDate: '',
        displayEndTime: '',
        showOnBoard: true,
        position: 2,
        isValid: false,
        errors: [],
      };
      const { masterData } = get();
      // v1 は全行を描き直す（renderRow が端末を preserve で決め直し、validateRow で全行を検証）
      set((s) => {
        const rows = [...s.rows];
        rows.splice(index, 0, blank);
        return {
          rows: rows.map((r) =>
            validate(
              r.propertyCode
                ? { ...r, terminalId: resolveTerminal(masterData.properties, r.propertyCode, r.terminalId, true) }
                : r,
            ),
          ),
          rowIdCounter: id,
        };
      });
      get().triggerAutoSave();
    },

    // v1: js/bulk-table.js deleteSelectedRows
    removeRows: (ids) => {
      const idSet = new Set(ids);
      set((s) => ({
        rows: s.rows.filter((r) => !idSet.has(r.id)),
        selectedIds: new Set([...s.selectedIds].filter((id) => !idSet.has(id))),
      }));
      get().triggerAutoSave();
    },

    // v1: js/bulk-table.js setupRowEventListeners（端末・点検種別・点検終了日の change）
    updateRow: (id, patch) => {
      mapRow(id, (r) => validate({ ...r, ...patch }));
      get().triggerAutoSave();
    },

    // 画面で物件を変えたら最初の端末を選ぶ。v1: js/bulk-table.js propertySelect change → updateTerminals
    changeProperty: (id, propertyCode) => {
      const { masterData } = get();
      mapRow(id, (r) =>
        validate({
          ...r,
          propertyCode,
          terminalId: resolveTerminal(masterData.properties, propertyCode, r.terminalId, false),
        }),
      );
      get().triggerAutoSave();
    },

    // 点検終了日が空なら開始日を入れる。v1: js/bulk-table.js .start-date change
    changeStartDate: (id, startDate) => {
      mapRow(id, (r) => validate({ ...r, startDate, endDate: !r.endDate && startDate ? startDate : r.endDate }));
      get().triggerAutoSave();
    },

    // 入力のたびに保存だけする（v1 は備考の入力で検証し直さない）。v1: js/bulk-table.js .remarks-input input
    changeRemarks: (id, remarks) => {
      mapRow(id, (r) => ({ ...r, remarks }));
      get().triggerAutoSave();
    },

    // v1: js/bulk-modals.js applyRowDetail（v1 はここで検証し直さない）
    applyRowDetail: (id, detail) => {
      mapRow(id, (r) => ({ ...r, ...detail }));
      get().triggerAutoSave();
    },

    // 下へ動かすときは目標行の後ろ、上へ動かすときは前に入れる。v1: js/bulk-table.js handleDrop
    reorderRows: (draggedId, targetId) => {
      set((s) => {
        const draggedIndex = s.rows.findIndex((r) => r.id === draggedId);
        const targetIndex = s.rows.findIndex((r) => r.id === targetId);
        if (draggedIndex === -1 || targetIndex === -1 || draggedId === targetId) return s;
        const moved = s.rows[draggedIndex]!;
        const filtered = s.rows.filter((r) => r.id !== draggedId);
        const targetDataIndex = filtered.findIndex((r) => r.id === targetId);
        filtered.splice(draggedIndex < targetIndex ? targetDataIndex + 1 : targetDataIndex, 0, moved);
        return { rows: filtered };
      });
      get().triggerAutoSave();
    },

    // v1: js/bulk-state.js clearRows（自動保存は呼ばない）
    clearRows: () => set({ rows: [], selectedIds: new Set() }),

    // v1: js/bulk-modals.js applyTemplate（clearRows → addRow）
    replaceRows: (inputs) => {
      set({ rows: [], selectedIds: new Set() });
      appendRows(inputs);
      get().triggerAutoSave();
    },

    // v1: js/bulk-data.js restoreAutoSave（setRowIdCounter → addRow）
    restoreRows: (inputs, rowIdCounter) => {
      set({ rowIdCounter });
      appendRows(inputs);
      get().triggerAutoSave();
    },

    copyRow: (id) => {
      const row = get().rows.find((r) => r.id === id);
      if (row) set({ copiedRow: { ...row } });
    },

    setFilter: (filter) => set({ filter }),

    toggleSelection: (id) =>
      set((s) => {
        const next = new Set(s.selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return { selectedIds: next };
      }),

    selectAll: () => set((s) => ({ selectedIds: new Set(s.rows.map((r) => r.id)) })),

    clearSelection: () => set({ selectedIds: new Set() }),

    setDraggedRowId: (id) => set({ draggedRowId: id }),

    // 最後の変更から1秒後に保存する。v1: js/bulk-data.js triggerAutoSave
    triggerAutoSave: () => {
      if (autoSaveTimer) clearTimeout(autoSaveTimer);
      autoSaveTimer = setTimeout(() => {
        autoSaveTimer = null;
        get().saveAutoSaveNow();
      }, AUTO_SAVE_DELAY_MS);
    },

    // v1: js/bulk-data.js saveAutoSave
    saveAutoSaveNow: () => {
      const { userId, rows, rowIdCounter } = get();
      writeAutoSave(userId, rows, rowIdCounter);
    },
  };
});

/** 予約済みの自動保存を取り消す（申請に成功したとき） */
export function cancelBulkAutoSave(): void {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
  }
}

/** 予約済みの自動保存があれば今すぐ書く（画面を離れるとき。予約が無ければ何もしない） */
export function flushBulkAutoSave(): void {
  if (!autoSaveTimer) return;
  cancelBulkAutoSave();
  useBulkStore.getState().saveAutoSaveNow();
}

/**
 * 状態を捨てる（ログアウト・別ユーザーでの表示。v1 はページ遷移で状態が消え、次に開いたとき自動保存から復元を尋ねる）。
 * SPA 内で画面を離れるだけなら捨てない（v1 は離脱前に beforeunload で警告していたが、SPA 内の移動では警告できないため）。
 */
export function resetBulkSession(): void {
  useBulkStore.setState({
    rows: [],
    rowIdCounter: 0,
    filter: 'all',
    selectedIds: new Set<number>(),
    draggedRowId: null,
    masterData: EMPTY_BULK_MASTER,
    appSettings: DEFAULT_BULK_SETTINGS,
    currentVendor: { id: null, name: null },
    userId: null,
    copiedRow: null,
    sessionLoaded: false,
  });
}

