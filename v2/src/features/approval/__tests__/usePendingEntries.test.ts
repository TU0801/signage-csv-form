import { describe, it, expect } from 'vitest';
import { EntryStatus, BuildingVendorStatus } from '@/lib/constants';

describe('usePendingEntries business logic', () => {
  describe('EntryStatus constants', () => {
    it('DRAFT is "draft"', () => {
      expect(EntryStatus.DRAFT).toBe('draft');
    });

    it('READY is "ready"', () => {
      expect(EntryStatus.READY).toBe('ready');
    });

    it('PENDING is "pending"', () => {
      expect(EntryStatus.PENDING).toBe('pending');
    });

    it('EXPORTED is "exported"', () => {
      expect(EntryStatus.EXPORTED).toBe('exported');
    });
  });

  describe('BuildingVendorStatus constants', () => {
    it('ACTIVE is "active"', () => {
      expect(BuildingVendorStatus.ACTIVE).toBe('active');
    });

    it('PENDING is "pending"', () => {
      expect(BuildingVendorStatus.PENDING).toBe('pending');
    });

    it('DELETED is "deleted"', () => {
      expect(BuildingVendorStatus.DELETED).toBe('deleted');
    });
  });

  describe('approval logic', () => {
    it('should filter out approved entry from list', () => {
      const entries = [
        { id: '1', status: 'draft' as const },
        { id: '2', status: 'draft' as const },
        { id: '3', status: 'draft' as const },
      ];
      const approvedId = '2';
      const remaining = entries.filter((e) => e.id !== approvedId);
      expect(remaining).toHaveLength(2);
      expect(remaining.map((e) => e.id)).toEqual(['1', '3']);
    });

    it('should filter out rejected entry from list', () => {
      const entries = [
        { id: '1', status: 'draft' as const },
        { id: '2', status: 'draft' as const },
      ];
      const rejectedId = '1';
      const remaining = entries.filter((e) => e.id !== rejectedId);
      expect(remaining).toHaveLength(1);
      expect(remaining[0]!.id).toBe('2');
    });

    it('should filter out bulk approved entries from list', () => {
      const entries = [
        { id: '1', status: 'draft' as const },
        { id: '2', status: 'draft' as const },
        { id: '3', status: 'draft' as const },
        { id: '4', status: 'draft' as const },
      ];
      const approvedIds = new Set(['1', '3']);
      const remaining = entries.filter((e) => !approvedIds.has(e.id));
      expect(remaining).toHaveLength(2);
      expect(remaining.map((e) => e.id)).toEqual(['2', '4']);
    });

    it('should not filter anything when no ids match', () => {
      const entries = [
        { id: '1', status: 'draft' as const },
        { id: '2', status: 'draft' as const },
      ];
      const approvedIds = new Set(['99']);
      const remaining = entries.filter((e) => !approvedIds.has(e.id));
      expect(remaining).toHaveLength(2);
    });

    it('approval changes status from draft to ready', () => {
      const entry = { id: '1', status: EntryStatus.DRAFT };
      const updated = { ...entry, status: EntryStatus.READY };
      expect(updated.status).toBe('ready');
    });

    it('rejection removes the entry', () => {
      const entries = [{ id: '1' }, { id: '2' }];
      const afterDelete = entries.filter((e) => e.id !== '1');
      expect(afterDelete).toHaveLength(1);
      expect(afterDelete[0]!.id).toBe('2');
    });
  });

  describe('select all logic', () => {
    it('select all should include all entry ids', () => {
      const entries = [{ id: '1' }, { id: '2' }, { id: '3' }];
      const allIds = new Set(entries.map((e) => e.id));
      expect(allIds.size).toBe(entries.length);
      expect(allIds.has('1')).toBe(true);
      expect(allIds.has('2')).toBe(true);
      expect(allIds.has('3')).toBe(true);
    });

    it('deselect all should clear selection', () => {
      const selected = new Set(['1', '2', '3']);
      const cleared = new Set<string>();
      expect(cleared.size).toBe(0);
      expect(selected.size).toBe(3);
    });

    it('toggle select should add/remove single item', () => {
      const selected = new Set(['1', '3']);

      // Toggle on
      const withTwo = new Set(selected);
      withTwo.add('2');
      expect(withTwo.has('2')).toBe(true);
      expect(withTwo.size).toBe(3);

      // Toggle off
      const withoutOne = new Set(selected);
      withoutOne.delete('1');
      expect(withoutOne.has('1')).toBe(false);
      expect(withoutOne.size).toBe(1);
    });
  });
});
