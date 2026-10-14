import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { makeEntry } from './fixtures';
import type { DbEntry } from '@/types/database';
import type { AdminEntryFilters } from '@/lib/api/admin-entries';

const api = vi.hoisted(() => ({ fetchApprovedEntries: vi.fn() }));
vi.mock('@/lib/api/admin-entries', () => api);

import { useEntriesTable } from '../hooks/useEntriesTable';

const base: AdminEntryFilters = { propertyCode: '', startDate: '', endDate: '', vendorName: '' };

describe('useEntriesTable', () => {
  it('ignores an older response that arrives after the latest one', async () => {
    let resolveA!: (rows: DbEntry[]) => void;
    const rowA = makeEntry({ id: 'a', vendor_name: 'A社' });
    const rowB = makeEntry({ id: 'b', vendor_name: 'B社' });
    api.fetchApprovedEntries
      .mockImplementationOnce(() => new Promise<DbEntry[]>((r) => (resolveA = r)))
      .mockResolvedValueOnce([rowB]);

    const { result, rerender } = renderHook((f: AdminEntryFilters) => useEntriesTable(f), {
      initialProps: { ...base, vendorName: 'A社' },
    });
    rerender({ ...base, vendorName: 'B社' });
    await waitFor(() => expect(result.current.entries.map((e) => e.id)).toEqual(['b']));

    await act(async () => resolveA([rowA]));
    expect(result.current.entries.map((e) => e.id)).toEqual(['b']);
    expect(result.current.loading).toBe(false);
  });
});
