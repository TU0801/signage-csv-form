import { create } from 'zustand';
import type { EntryFormData, BulkRow } from '@/types/app';
import { DEFAULT_DISPLAY_DURATION } from '@/lib/constants';
import { validateBulkRow } from '@/features/bulk-entry/utils/validateBulkRow';

const STORAGE_KEY = 'signage-cms-bulk-rows';

function createEmptyFormData(): EntryFormData {
  return {
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
    posterPosition: '2',
    frameNo: '2',
    showOnBoard: true,
  };
}

function createBulkRow(data?: Partial<EntryFormData>): BulkRow {
  const formData: EntryFormData = { ...createEmptyFormData(), ...data };
  const errors = validateBulkRow(formData);
  return {
    ...formData,
    _id: crypto.randomUUID(),
    _errors: errors,
    _isValid: Object.keys(errors).length === 0,
  };
}

function revalidateRow(row: BulkRow): BulkRow {
  const errors = validateBulkRow(row);
  return { ...row, _errors: errors, _isValid: Object.keys(errors).length === 0 };
}

export interface BulkState {
  rows: BulkRow[];
  filter: 'all' | 'valid' | 'error';
  selectedIds: Set<string>;
  draggedRowId: string | null;
  addRow: (row?: Partial<EntryFormData>) => void;
  removeRows: (ids: string[]) => void;
  updateRow: (id: string, updates: Partial<EntryFormData>) => void;
  duplicateRows: (ids: string[]) => void;
  reorderRows: (fromIndex: number, toIndex: number) => void;
  bulkUpdateField: (ids: string[], field: keyof EntryFormData, value: unknown) => void;
  clearAll: () => void;
  setFilter: (filter: 'all' | 'valid' | 'error') => void;
  toggleSelection: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  loadFromStorage: () => void;
  saveToStorage: () => void;
  setDraggedRowId: (id: string | null) => void;
  importRows: (rows: Partial<EntryFormData>[]) => void;
}

export const useBulkStore = create<BulkState>((set, get) => ({
  rows: [],
  filter: 'all',
  selectedIds: new Set<string>(),
  draggedRowId: null,

  addRow: (data) => {
    const row = createBulkRow(data);
    set((state) => ({ rows: [...state.rows, row] }));
  },

  removeRows: (ids) => {
    const idSet = new Set(ids);
    set((state) => ({
      rows: state.rows.filter((r) => !idSet.has(r._id)),
      selectedIds: new Set([...state.selectedIds].filter((id) => !idSet.has(id))),
    }));
  },

  updateRow: (id, updates) => {
    set((state) => ({
      rows: state.rows.map((r) => {
        if (r._id !== id) return r;
        const updated = { ...r, ...updates };
        return revalidateRow(updated);
      }),
    }));
  },

  duplicateRows: (ids) => {
    const state = get();
    const toDuplicate = state.rows.filter((r) => ids.includes(r._id));
    const newRows = toDuplicate.map((r) => {
      const formData = (Object.keys(r) as (keyof typeof r)[])
        .filter((k) => !k.startsWith('_'))
        .reduce<Partial<EntryFormData>>((acc, k) => {
          (acc as Record<string, unknown>)[k] = r[k];
          return acc;
        }, {});
      return createBulkRow(formData);
    });
    set((s) => ({ rows: [...s.rows, ...newRows] }));
  },

  reorderRows: (fromIndex, toIndex) => {
    set((state) => {
      const rows = [...state.rows];
      const [moved] = rows.splice(fromIndex, 1);
      if (!moved) return state;
      rows.splice(toIndex, 0, moved);
      return { rows };
    });
  },

  bulkUpdateField: (ids, field, value) => {
    const idSet = new Set(ids);
    set((state) => ({
      rows: state.rows.map((r) => {
        if (!idSet.has(r._id)) return r;
        const updated = { ...r, [field]: value };
        return revalidateRow(updated);
      }),
    }));
  },

  clearAll: () => {
    set({ rows: [], selectedIds: new Set(), filter: 'all' });
    try {
      localStorage.removeItem(STORAGE_KEY);
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

  selectAll: () => {
    set((state) => ({
      selectedIds: new Set(state.rows.map((r) => r._id)),
    }));
  },

  clearSelection: () => set({ selectedIds: new Set() }),

  loadFromStorage: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as BulkRow[];
      if (!Array.isArray(parsed)) return;
      // Revalidate all loaded rows
      const rows = parsed.map((r) => ({
        ...createEmptyFormData(),
        ...r,
        _id: r._id || crypto.randomUUID(),
        _errors: {} as Record<string, string>,
        _isValid: true,
      })).map(revalidateRow);
      set({ rows });
    } catch {
      // corrupted data
    }
  },

  saveToStorage: () => {
    try {
      const { rows } = get();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
    } catch {
      // storage full etc
    }
  },

  setDraggedRowId: (id) => set({ draggedRowId: id }),

  importRows: (partialRows) => {
    const newRows = partialRows.map((r) => createBulkRow(r));
    set((state) => ({ rows: [...state.rows, ...newRows] }));
  },
}));
