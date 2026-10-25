import { create } from 'zustand';
import type {
  BulkEntryRow,
  BulkMasterData,
  BulkProperty,
  BulkRowInput,
  BulkScheduleMeta,
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
import { defaultInspectionType } from '@/features/bulk-entry/utils/scheduleRows';
import { followEndDate } from '@/lib/inspectionDates';
import { todayUtc } from '@/lib/utils';
import type { ProvisionalBuilding } from '@/features/building-requests/lib/provisional';

/** 行の詳細設定モーダルで変える項目 */
export type BulkRowDetail = Pick<
  BulkEntryRow,
  | 'noticeText'
  | 'displayStartDate'
  | 'displayStartTime'
  | 'displayEndDate'
  | 'displayEndTime'
  | 'displayTime'
  | 'position'
  | 'emergencyContact'
  | 'posterType'
  | 'posterImage'
>;

/** 選択行への一括設定で上書きできる項目（入れた項目だけを渡す） */
export type BulkRowsPatch = Partial<
  Pick<
    BulkEntryRow,
    | 'inspectionType'
    | 'startDate'
    | 'endDate'
    | 'displayStartDate'
    | 'displayStartTime'
    | 'displayEndDate'
    | 'displayEndTime'
    | 'displayTime'
    | 'position'
  >
>;


let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

/** 点検種別の既定（B9）の材料: 選択中の保守会社の点検行（物件コード・点検種別名）と、保守会社に紐付けた点検種別の id */
export interface BulkInspectionDefaults {
  vendorInspections: { propertyCode: string; label: string }[];
  linkedIds: string[];
}

const EMPTY_DEFAULTS: BulkInspectionDefaults = { vendorInspections: [], linkedIds: [] };

export interface BulkState {
  rows: BulkEntryRow[];
  rowIdCounter: number;
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
  inspectionDefaults: BulkInspectionDefaults;

  setUserId: (id: string | null) => void;
  setMasterData: (data: BulkMasterData) => void;
  setAppSettings: (settings: BulkSettings) => void;
  setCurrentVendor: (vendor: BulkVendorSelection) => void;
  setSessionLoaded: (loaded: boolean) => void;
  setInspectionDefaults: (patch: Partial<BulkInspectionDefaults>) => void;
  /**
   * 点検予定の行を入れ直す（予定は表の先頭、手で足した行はその後ろ）。同じ予定の未申請の行は入力中の値を残す。
   * 自動保存はしない（予定の行は保存しない）
   */
  syncScheduleRows: (inputs: { meta: BulkScheduleMeta; row: BulkRowInput }[]) => void;
  /**
   * 申請した予定の行の入力（日付・備考・メモ・詳細）を空に戻す。点検月未登録の行は申請後も未申請のまま残るので、
   * 戻さないと同じ申請をもう一度出せてしまい、未送信の入力として離脱の確認も出続ける
   */
  clearScheduleInputs: (ids: number[]) => void;
  /**
   * 未承認の建物（建物追加の申請。修正依頼1025 F2）を物件の候補に入れ直し、手の行を検証し直す。
   * approved（仮のコード → 承認後の物件コード・端末）に当たる手の行は承認後の物件に付け替える（自動保存から戻した行）。
   * 変わらなければ何もしない
   */
  setProvisionalBuildings: (
    buildings: ProvisionalBuilding[],
    approved?: ReadonlyMap<string, { propertyCode: string; terminalId: string }>,
  ) => void;

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
  changeMemo: (id: number, memo: string) => void;
  applyRowDetail: (id: number, detail: BulkRowDetail) => void;
  /** 選んだ行に同じ値を入れる（patch に無い項目は行ごとの値のまま） */
  applyToRows: (ids: number[], patch: BulkRowsPatch) => void;
  reorderRows: (draggedId: number, targetId: number) => void;
  clearRows: () => void;
  /** 行を全部置き換える（テンプレート適用） */
  replaceRows: (rows: BulkRowInput[]) => void;
  /** 自動保存から戻す */
  restoreRows: (rows: BulkRowInput[], rowIdCounter: number) => void;
  copyRow: (id: number) => void;

  toggleSelection: (id: number) => void;
  selectAll: () => void;
  clearSelection: () => void;
  setDraggedRowId: (id: number | null) => void;

  triggerAutoSave: () => void;
  saveAutoSaveNow: () => void;
}

export const useBulkStore = create<BulkState>((set, get) => {
  /**
   * v1: js/bulk-table.js validateRow。
   * 点検予定の行は物件・点検種別が点検行で決まっている（保守会社の物件マスターに無い物件もある）ので、物件と点検種別の照合をせず、
   * 端末の無い物件も申請できる（点検一覧の申請と同じ）。申請済みの予定の行は検証しない
   */
  const validate = (row: BulkEntryRow): BulkEntryRow => {
    const { masterData, appSettings } = get();
    if (row.schedule?.locked) return { ...row, errors: [], isValid: true };
    if (row.schedule) {
      const own = [
        { propertyCode: row.propertyCode, propertyName: row.schedule.propertyName, terminalId: row.terminalId || 'none', supplement: '' },
      ];
      const errors = validateBulkRow(row, own, appSettings, []).filter((e) => e !== '端末');
      return { ...row, errors, isValid: errors.length === 0 };
    }
    let errors = validateBulkRow(row, masterData.properties, appSettings, masterData.notices);
    // 未承認の建物には端末が無い（承認後に業務システムで端末が付く。点検予定の行の端末なしと同じ扱い）
    if (masterData.properties.some((p) => p.propertyRequestId && p.propertyCode === String(row.propertyCode))) {
      errors = errors.filter((e) => e !== '端末');
    }
    return { ...row, errors, isValid: errors.length === 0 };
  };

  /**
   * 行を作る（端末は物件に合わせて決め直し、検証まで済ませる）。v1: js/bulk-table.js addRow + renderRow
   */
  const buildRow = (id: number, data: BulkRowInput): BulkEntryRow => {
    const { masterData, appSettings, currentVendor } = get();
    const startDate = data.startDate || todayUtc();
    const row: BulkEntryRow = {
      id,
      propertyCode: data.propertyCode || '',
      terminalId: data.terminalId || '',
      vendorName: data.vendorName || currentVendor.name || '',
      inspectionType: data.inspectionType || '',
      startDate,
      // 点検終了日は点検開始日と同じ日を既定にする（B10。新しい行は開始日に今日が入るので終了日も今日）。
      // 取込などで空を明示したとき（''）はそのまま空にする
      endDate: data.endDate || (data.endDate === undefined ? startDate : ''),
      remarks: data.remarks || '',
      memo: data.memo || '',
      displayTime: data.displayTime || defaultDisplayTime(appSettings),
      noticeText: data.noticeText || '',
      displayStartDate: data.displayStartDate || '',
      displayStartTime: data.displayStartTime || '',
      displayEndDate: data.displayEndDate || '',
      displayEndTime: data.displayEndTime || '',
      showOnBoard: data.showOnBoard !== undefined ? data.showOnBoard : true,
      emergencyContact: data.emergencyContact || '',
      posterType: data.posterType === 'custom' ? 'custom' : 'template',
      posterImage: data.posterImage || '',
      position: data.position !== undefined ? data.position : 2,
      isValid: false,
      errors: [],
    };
    // 取込で見つからなかった物件名（物件が決まっている行には残さない）
    if (!row.propertyCode && data.pastedPropertyName) row.pastedPropertyName = data.pastedPropertyName;
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

  /**
   * 保守会社名以外を全部写す（複製・コピーした行の貼り付け）。点検予定の行を写すと手で足した行になる（予定の情報は写さない）。
   * v1: js/bulk-modals.js handleContextMenuAction duplicate
   */
  const copyFields = (r: BulkEntryRow): BulkRowInput => ({
    propertyCode: r.propertyCode,
    terminalId: r.terminalId,
    inspectionType: r.inspectionType,
    startDate: r.startDate,
    endDate: r.endDate,
    remarks: r.remarks,
    memo: r.memo,
    displayTime: r.displayTime,
    noticeText: r.noticeText,
    displayStartDate: r.displayStartDate,
    displayStartTime: r.displayStartTime,
    displayEndDate: r.displayEndDate,
    displayEndTime: r.displayEndTime,
    showOnBoard: r.showOnBoard,
    emergencyContact: r.emergencyContact,
    posterType: r.posterType,
    posterImage: r.posterImage,
    position: r.position,
  });

  const mapRow = (id: number, fn: (r: BulkEntryRow) => BulkEntryRow) =>
    set((s) => ({ rows: s.rows.map((r) => (r.id === id ? fn(r) : r)) }));

  return {
    rows: [],
    rowIdCounter: 0,
    selectedIds: new Set<number>(),
    draggedRowId: null,
    masterData: EMPTY_BULK_MASTER,
    appSettings: DEFAULT_BULK_SETTINGS,
    currentVendor: { id: null, name: null },
    userId: null,
    copiedRow: null,
    sessionLoaded: false,
    inspectionDefaults: EMPTY_DEFAULTS,

    setUserId: (id) => set({ userId: id }),
    setMasterData: (data) => set({ masterData: data }),
    setAppSettings: (settings) => set({ appSettings: settings }),
    setCurrentVendor: (vendor) => set({ currentVendor: vendor }),
    setSessionLoaded: (loaded) => set({ sessionLoaded: loaded }),
    setInspectionDefaults: (patch) => set((s) => ({ inspectionDefaults: { ...s.inspectionDefaults, ...patch } })),

    syncScheduleRows: (inputs) => {
      const { rows, appSettings, currentVendor } = get();
      const existing = new Map(rows.filter((r) => r.schedule).map((r) => [r.schedule!.key, r]));
      const manual = rows.filter((r) => !r.schedule);
      let counter = get().rowIdCounter;
      const scheduleRows = inputs.map(({ meta, row }) => {
        const prev = existing.get(meta.key);
        // 未申請のまま残っている予定は、入力中の値（日付・備考・メモ・詳細）を残して情報だけ入れ替える
        if (prev && !prev.schedule!.locked && !meta.locked) return validate({ ...prev, schedule: meta });
        const built: BulkEntryRow = {
          id: prev?.id ?? ++counter,
          propertyCode: row.propertyCode ?? '',
          terminalId: row.terminalId ?? '',
          vendorName: currentVendor.name || '',
          inspectionType: row.inspectionType ?? '',
          startDate: row.startDate ?? '',
          endDate: row.endDate ?? '',
          remarks: row.remarks ?? '',
          memo: row.memo ?? '',
          displayTime: defaultDisplayTime(appSettings),
          noticeText: '',
          displayStartDate: '',
          displayStartTime: '',
          displayEndDate: '',
          displayEndTime: '',
          showOnBoard: true,
          emergencyContact: '',
          posterType: 'template',
          posterImage: '',
          position: 2,
          isValid: false,
          errors: [],
          schedule: meta,
        };
        return validate(built);
      });
      const nextRows = [...scheduleRows, ...manual];
      const ids = new Set(nextRows.map((r) => r.id));
      set((s) => ({
        rows: nextRows,
        rowIdCounter: counter,
        selectedIds: new Set([...s.selectedIds].filter((id) => ids.has(id))),
      }));
    },

    clearScheduleInputs: (ids) => {
      const { appSettings } = get();
      const idSet = new Set(ids);
      set((s) => ({
        rows: s.rows.map((r) =>
          r.schedule && !r.schedule.locked && idSet.has(r.id)
            ? validate({
                ...r,
                startDate: '',
                endDate: '',
                remarks: '',
                memo: '',
                displayTime: defaultDisplayTime(appSettings),
                noticeText: '',
                displayStartDate: '',
                displayStartTime: '',
                displayEndDate: '',
                displayEndTime: '',
                showOnBoard: true,
                emergencyContact: '',
                posterType: 'template',
                posterImage: '',
                position: 2,
              })
            : r,
        ),
      }));
    },

    setProvisionalBuildings: (buildings, approved = new Map()) => {
      const { masterData, rows } = get();
      const current = masterData.properties.filter((p) => p.propertyRequestId);
      const sameCandidates =
        current.length === buildings.length &&
        buildings.every((b) =>
          current.some(
            (p) => p.propertyCode === b.propertyCode && p.propertyName === b.propertyName && p.managementCompanyId === b.managementCompanyId,
          ),
        );
      const remap = rows.some((r) => !r.schedule && approved.has(String(r.propertyCode)));
      if (sameCandidates && !remap) return;
      const extra: BulkProperty[] = buildings.map((b) => ({
        propertyCode: b.propertyCode,
        propertyName: b.propertyName,
        terminalId: '',
        supplement: '',
        propertyRequestId: b.requestId,
        managementCompanyId: b.managementCompanyId,
      }));
      const properties = [...masterData.properties.filter((p) => !p.propertyRequestId), ...extra];
      set({ masterData: { ...masterData, properties } });
      // 候補が変わった手の行（仮のコード・付け替えた行）だけ検証し直す
      const touched = new Set([...current.map((p) => p.propertyCode), ...extra.map((p) => p.propertyCode), ...approved.keys()]);
      set((s) => ({
        rows: s.rows.map((r) => {
          if (r.schedule || !touched.has(String(r.propertyCode))) return r;
          const to = approved.get(String(r.propertyCode));
          if (!to) return validate(r);
          return validate({
            ...r,
            propertyCode: to.propertyCode,
            terminalId: resolveTerminal(properties, to.propertyCode, to.terminalId, true) || to.terminalId,
          });
        }),
      }));
      if (remap) get().triggerAutoSave();
    },

    // v1: js/bulk-table.js addRow
    addRow: (data = {}) => {
      const [row] = appendRows([data]);
      get().triggerAutoSave();
      return row!.id;
    },

    // 最後の行の物件・端末・点検種別・点検日・表示時間・位置を引き継ぐ（備考は空）。v1: js/bulk-table.js addRowWithCopy
    // 点検予定の行は写さない（手で足した行が無ければ空の行）
    addRowWithCopy: () => {
      const { rows, addRow } = get();
      const manual = rows.filter((r) => !r.schedule);
      const last = manual[manual.length - 1];
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
        memo: '',
        displayTime: defaultDisplayTime(appSettings),
        noticeText: '',
        displayStartDate: '',
        displayStartTime: '',
        displayEndDate: '',
        displayEndTime: '',
        showOnBoard: true,
        emergencyContact: '',
        posterType: 'template',
        posterImage: '',
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
    // 点検種別が空なら保守会社の点検種別を入れる（B9）
    changeProperty: (id, propertyCode) => {
      const { masterData, inspectionDefaults } = get();
      mapRow(id, (r) =>
        validate({
          ...r,
          // 選び直したら取込時の物件名の手がかりは要らない
          pastedPropertyName: undefined,
          propertyCode,
          terminalId: resolveTerminal(masterData.properties, propertyCode, r.terminalId, false),
          inspectionType:
            r.inspectionType ||
            (propertyCode
              ? defaultInspectionType(
                  propertyCode,
                  inspectionDefaults.vendorInspections,
                  inspectionDefaults.linkedIds,
                  masterData.notices,
                )
              : ''),
        }),
      );
      get().triggerAutoSave();
    },

    // 点検終了日を開始日に合わせる（空・旧開始日と同じ・新開始日より前のとき。B10）。v1: js/bulk-table.js .start-date change（v1 は空のときだけ）
    changeStartDate: (id, startDate) => {
      mapRow(id, (r) => validate({ ...r, startDate, endDate: followEndDate(r.startDate, r.endDate, startDate) }));
      get().triggerAutoSave();
    },

    // 入力のたびに検証し直す（v1 は検証せず、文字数超過が他の欄を触るまで OK のまま残っていた）。
    // v1: js/bulk-table.js .remarks-input input
    changeRemarks: (id, remarks) => {
      mapRow(id, (r) => validate({ ...r, remarks }));
      get().triggerAutoSave();
    },

    // メモは検証しない（CSV にも出さない）
    changeMemo: (id, memo) => {
      mapRow(id, (r) => ({ ...r, memo }));
      get().triggerAutoSave();
    },

    // 表示期間・表示時間・案内文・貼紙画像の検証をすぐ反映するため検証し直す（v1 はここで検証し直さない）。
    // v1: js/bulk-modals.js applyRowDetail
    applyRowDetail: (id, detail) => {
      mapRow(id, (r) => validate({ ...r, ...detail }));
      get().triggerAutoSave();
    },

    // 点検開始日を入れたら、セルで入れたときと同じ規則で終了日を合わせる（B10）。
    // 申請済みの予定の行は変えない。予定の行の点検種別は点検行で決まっているので変えない
    applyToRows: (ids, patch) => {
      const idSet = new Set(ids);
      set((s) => ({
        rows: s.rows.map((r) => {
          if (!idSet.has(r.id) || r.schedule?.locked) return r;
          const next = r.schedule ? { ...r, ...patch, inspectionType: r.inspectionType } : { ...r, ...patch };
          if (patch.startDate && patch.endDate === undefined) next.endDate = followEndDate(r.startDate, r.endDate, patch.startDate);
          return validate(next);
        }),
      }));
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

    // v1: js/bulk-modals.js applyTemplate（clearRows → addRow）。点検予定の行は残す
    replaceRows: (inputs) => {
      set((s) => ({ rows: s.rows.filter((r) => r.schedule), selectedIds: new Set() }));
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
    selectedIds: new Set<number>(),
    draggedRowId: null,
    masterData: EMPTY_BULK_MASTER,
    appSettings: DEFAULT_BULK_SETTINGS,
    currentVendor: { id: null, name: null },
    userId: null,
    copiedRow: null,
    sessionLoaded: false,
    inspectionDefaults: EMPTY_DEFAULTS,
  });
}

