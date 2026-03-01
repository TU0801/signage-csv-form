import { describe, it, expect, beforeEach } from 'vitest';
import { useBulkStore } from '@/stores/bulkStore';
import type { EntryFormData } from '@/types/app';
import { DEFAULT_DISPLAY_DURATION } from '@/lib/constants';

function createValidFormData(overrides?: Partial<EntryFormData>): Partial<EntryFormData> {
  return {
    propertyCode: 'P001',
    terminalId: 'T01',
    vendorName: 'ABC保守',
    inspectionType: '電気点検',
    startDate: '2025-01-01',
    endDate: '2025-01-31',
    displayStartDate: '2025-01-01',
    displayEndDate: '2025-01-31',
    ...overrides,
  };
}

describe('bulkStore', () => {
  beforeEach(() => {
    useBulkStore.getState().clearAll();
  });

  describe('addRow', () => {
    it('adds a new row with default values', () => {
      useBulkStore.getState().addRow();
      const { rows } = useBulkStore.getState();
      expect(rows).toHaveLength(1);
      expect(rows[0]?._id).toBeTruthy();
      expect(rows[0]?.displayDuration).toBe(DEFAULT_DISPLAY_DURATION);
    });

    it('adds a row with partial data', () => {
      useBulkStore.getState().addRow({ propertyCode: 'P001' });
      const { rows } = useBulkStore.getState();
      expect(rows[0]?.propertyCode).toBe('P001');
    });

    it('validates the row upon creation', () => {
      useBulkStore.getState().addRow(); // empty row
      const { rows } = useBulkStore.getState();
      expect(rows[0]?._isValid).toBe(false);
      expect(Object.keys(rows[0]?._errors ?? {}).length).toBeGreaterThan(0);
    });

    it('creates a valid row when all required fields are provided', () => {
      useBulkStore.getState().addRow(createValidFormData());
      const { rows } = useBulkStore.getState();
      expect(rows[0]?._isValid).toBe(true);
    });
  });

  describe('removeRows', () => {
    it('removes specified rows', () => {
      useBulkStore.getState().addRow(createValidFormData());
      useBulkStore.getState().addRow(createValidFormData({ propertyCode: 'P002' }));
      const firstId = useBulkStore.getState().rows[0]!._id;
      useBulkStore.getState().removeRows([firstId]);
      const { rows } = useBulkStore.getState();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.propertyCode).toBe('P002');
    });

    it('clears selection for removed rows', () => {
      useBulkStore.getState().addRow(createValidFormData());
      const id = useBulkStore.getState().rows[0]!._id;
      useBulkStore.getState().toggleSelection(id);
      expect(useBulkStore.getState().selectedIds.has(id)).toBe(true);
      useBulkStore.getState().removeRows([id]);
      expect(useBulkStore.getState().selectedIds.has(id)).toBe(false);
    });
  });

  describe('updateRow', () => {
    it('updates a row and revalidates', () => {
      useBulkStore.getState().addRow();
      const id = useBulkStore.getState().rows[0]!._id;
      expect(useBulkStore.getState().rows[0]?._isValid).toBe(false);

      useBulkStore.getState().updateRow(id, createValidFormData());
      expect(useBulkStore.getState().rows[0]?._isValid).toBe(true);
    });
  });

  describe('duplicateRows', () => {
    it('duplicates selected rows', () => {
      useBulkStore.getState().addRow(createValidFormData());
      const id = useBulkStore.getState().rows[0]!._id;
      useBulkStore.getState().duplicateRows([id]);
      const { rows } = useBulkStore.getState();
      expect(rows).toHaveLength(2);
      expect(rows[0]?.propertyCode).toBe(rows[1]?.propertyCode);
      expect(rows[0]?._id).not.toBe(rows[1]?._id);
    });
  });

  describe('reorderRows', () => {
    it('reorders rows', () => {
      useBulkStore.getState().addRow(createValidFormData({ propertyCode: 'P001' }));
      useBulkStore.getState().addRow(createValidFormData({ propertyCode: 'P002' }));
      useBulkStore.getState().addRow(createValidFormData({ propertyCode: 'P003' }));

      useBulkStore.getState().reorderRows(0, 2);
      const codes = useBulkStore.getState().rows.map((r) => r.propertyCode);
      expect(codes).toEqual(['P002', 'P003', 'P001']);
    });
  });

  describe('bulkUpdateField', () => {
    it('updates a field on multiple rows', () => {
      useBulkStore.getState().addRow(createValidFormData({ propertyCode: 'P001' }));
      useBulkStore.getState().addRow(createValidFormData({ propertyCode: 'P002' }));
      const ids = useBulkStore.getState().rows.map((r) => r._id);
      useBulkStore.getState().bulkUpdateField(ids, 'vendorName', 'NewVendor');
      const names = useBulkStore.getState().rows.map((r) => r.vendorName);
      expect(names).toEqual(['NewVendor', 'NewVendor']);
    });
  });

  describe('selection', () => {
    it('toggles selection', () => {
      useBulkStore.getState().addRow(createValidFormData());
      const id = useBulkStore.getState().rows[0]!._id;
      useBulkStore.getState().toggleSelection(id);
      expect(useBulkStore.getState().selectedIds.has(id)).toBe(true);
      useBulkStore.getState().toggleSelection(id);
      expect(useBulkStore.getState().selectedIds.has(id)).toBe(false);
    });

    it('selects all and clears selection', () => {
      useBulkStore.getState().addRow(createValidFormData());
      useBulkStore.getState().addRow(createValidFormData());
      useBulkStore.getState().selectAll();
      expect(useBulkStore.getState().selectedIds.size).toBe(2);
      useBulkStore.getState().clearSelection();
      expect(useBulkStore.getState().selectedIds.size).toBe(0);
    });
  });

  describe('filter', () => {
    it('sets filter', () => {
      useBulkStore.getState().setFilter('error');
      expect(useBulkStore.getState().filter).toBe('error');
      useBulkStore.getState().setFilter('valid');
      expect(useBulkStore.getState().filter).toBe('valid');
    });
  });

  describe('importRows', () => {
    it('imports multiple rows', () => {
      useBulkStore.getState().importRows([
        createValidFormData({ propertyCode: 'P001' }),
        createValidFormData({ propertyCode: 'P002' }),
      ]);
      const { rows } = useBulkStore.getState();
      expect(rows).toHaveLength(2);
      expect(rows[0]?.propertyCode).toBe('P001');
      expect(rows[1]?.propertyCode).toBe('P002');
    });
  });

  describe('clearAll', () => {
    it('clears all rows and selection', () => {
      useBulkStore.getState().addRow(createValidFormData());
      useBulkStore.getState().selectAll();
      useBulkStore.getState().setFilter('error');
      useBulkStore.getState().clearAll();
      const state = useBulkStore.getState();
      expect(state.rows).toHaveLength(0);
      expect(state.selectedIds.size).toBe(0);
      expect(state.filter).toBe('all');
    });
  });
});
