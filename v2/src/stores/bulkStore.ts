import { create } from 'zustand';
import type { BulkRow, EntryFormData } from '@/types/app';
import { DEFAULT_DISPLAY_DURATION } from '@/lib/constants';

const STORAGE_KEY = 'signage-bulk-rows';

function createEmptyRow(): BulkRow {
  return {
    _id: crypto.randomUUID(),
    _errors: {},
    _isValid: true,
    propertyCode: '',
    terminalId: '',
    vendorName: '',
    emergencyContact: '',
    inspectionType: '',
    templateNo: '',
    startDate: '',
    endDate: '',
    displayStartDate: '',
    displayStartTime: '',
    displayEndDate: '',
    displayEndTime: '',
    displayDuration: DEFAULT_DISPLAY_DURATION,
    noticeText: '',
    remarks: '',
    posterType: 'template',
    posterPosition: '4',
    frameNo: '1',
    showOnBoard: true,
  };
}

type FilterType = 'all' | 'valid' | 'error';

interface BulkState {
  rows: BulkRow[];
  filter: FilterType;
  selectedIds: Set<string>;
  draggedRowId: string | null;

  addRow: () => void;
  removeRow: (id: string) => void;
  removeRows: (ids: string[]) => void;
  updateRow: (id: string, updates: Partial<EntryFormData>) => void;
  updateRowValidation: (id: string, errors: Record<string, string>, isValid: boolean) => void;
  duplicateRow: (id: string) => void;
  reorderRows: (fromIndex: number, toIndex: number) => void;
  bulkUpdateField: <K extends keyof EntryFormData>(
    ids: string[],
    field: K,
    value: EntryFormData[K],
  ) => void;
  setRows: (rows: BulkRow[]) => void;
  addRows: (rows: BulkRow[]) => void;
  clearAll: () => void;
  loadFromStorage: () => void;
  saveToStorage: () => void;

  setFilter: (filter: FilterType) => void;
  toggleSelection: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clearSelection: () => void;
  setDraggedRowId: (id: string | null) => void;
}

export const useBulkStore = create<BulkState>((set, get) => ({
  rows: [],
  filter: 'all',
  selectedIds: new Set<string>(),
  draggedRowId: null,

  addRow: () => {
    set((state) => ({ rows: [...state.rows, createEmptyRow()] }));
  },

  removeRow: (id) => {
    set((state) => ({
      rows: state.rows.filter((r) => r._id !== id),
      selectedIds: (() => {
        const next = new Set(state.selectedIds);
        next.delete(id);
        return next;
      })(),
    }));
  },

  removeRows: (ids) => {
    const idSet = new Set(ids);
    set((state) => ({
      rows: state.rows.filter((r) => !idSet.has(r._id)),
      selectedIds: (() => {
        const next = new Set(state.selectedIds);
        ids.forEach((id) => next.delete(id));
        return next;
      })(),
    }));
  },

  updateRow: (id, updates) => {
    set((state) => ({
      rows: state.rows.map((r) => (r._id === id ? { ...r, ...updates } : r)),
    }));
  },

  updateRowValidation: (id, errors, isValid) => {
    set((state) => ({
      rows: state.rows.map((r) => (r._id === id ? { ...r, _errors: errors, _isValid: isValid } : r)),
    }));
  },

  duplicateRow: (id) => {
    set((state) => {
      const source = state.rows.find((r) => r._id === id);
      if (!source) return state;
      const idx = state.rows.indexOf(source);
      const newRow: BulkRow = { ...source, _id: crypto.randomUUID(), _errors: {}, _isValid: true };
      const next = [...state.rows];
      next.splice(idx + 1, 0, newRow);
      return { rows: next };
    });
  },

  reorderRows: (fromIndex, toIndex) => {
    set((state) => {
      const next = [...state.rows];
      const [moved] = next.splice(fromIndex, 1);
      if (!moved) return state;
      next.splice(toIndex, 0, moved);
      return { rows: next };
    });
  },

  bulkUpdateField: (ids, field, value) => {
    const idSet = new Set(ids);
    set((state) => ({
      rows: state.rows.map((r) => (idSet.has(r._id) ? { ...r, [field]: value } : r)),
    }));
  },

  setRows: (rows) => {
    set({ rows, selectedIds: new Set() });
  },

  addRows: (rows) => {
    set((state) => ({ rows: [...state.rows, ...rows] }));
  },

  clearAll: () => {
    set({ rows: [], selectedIds: new Set(), filter: 'all' });
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  },

  loadFromStorage: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const rows = JSON.parse(raw) as BulkRow[];
      if (Array.isArray(rows) && rows.length > 0) {
        set({ rows });
      }
    } catch {
      // ignore corrupt data
    }
  },

  saveToStorage: () => {
    try {
      const { rows } = get();
      if (rows.length > 0) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  },

  setFilter: (filter) => set({ filter }),

  toggleSelection: (id) => {
    set((state) => {
      const next = new Set(state.selectedIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { selectedIds: next };
    });
  },

  selectAll: (ids) => {
    set({ selectedIds: new Set(ids) });
  },

  clearSelection: () => {
    set({ selectedIds: new Set() });
  },

  setDraggedRowId: (id) => set({ draggedRowId: id }),
}));

export { createEmptyRow };
